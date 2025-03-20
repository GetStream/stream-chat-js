import { LinkPreviewsManager } from './linkPreviewsManager';
import { AttachmentManager } from './attachmentManager';
import { TextComposer } from './textComposer';
import {
  createAttachmentsMiddleware,
  createCompositionValidationMiddleware,
  createLinkPreviewsMiddleware,
  createTextComposerMiddleware,
  MessageComposerMiddlewareExecutor,
} from './middleware';
import { StateStore } from '../store';
import { formatMessage, generateUUIDv4 } from '../utils';
import { mergeWith } from '../utils/mergeWith';
import type { MessageComposerMiddlewareValue } from './middleware';
import type { Channel } from '../channel';
import type {
  DraftMessage,
  DraftResponse,
  EventTypes,
  FormatMessageResponse,
  MessageResponse,
  MessageResponseBase,
  SendMessageOptions,
} from '../types';

/*
  todo:
  1/ decide whether lastChange timestamp is necessary
 */

export type MessageComposerState = {
  id: string;
  lastChange: Date | null;
  quotedMessage: FormatMessageResponse | null;
  pollId: string | null;
};

export type MessageComposerConfig = {
  /** If true, triggers typing events on text input keystroke */
  publishTypingEvents: boolean;
  maxTextLength?: number;
  urlPreviewEnabled?: boolean;
};

export type MessageComposerOptions = {
  channel: Channel;
  composition?: DraftResponse | MessageResponse | FormatMessageResponse;
  config?: Partial<MessageComposerConfig>;
  threadId?: string;
};

const isMessageDraft = (composition: unknown): composition is DraftResponse =>
  !!(composition as { message?: DraftMessage })?.message;

const initState = (
  composition?: DraftResponse | MessageResponse | FormatMessageResponse,
): MessageComposerState => {
  if (!composition) {
    return {
      id: MessageComposer.generateId(),
      lastChange: null,
      quotedMessage: null,
      pollId: null,
    };
  }

  let quoted_message;
  let message;
  if (isMessageDraft(composition)) {
    message = composition.message;
    quoted_message = composition.quoted_message;
  } else {
    message = composition;
    quoted_message = composition.quoted_message;
  }

  return {
    id: message.id,
    lastChange: new Date(),
    quotedMessage: quoted_message
      ? formatMessage(quoted_message as MessageResponseBase)
      : null,
    pollId: message.poll_id ?? null,
  };
};

const DEFAULT_COMPOSER_CONFIG: MessageComposerConfig = {
  publishTypingEvents: true,
  urlPreviewEnabled: false,
};

export class MessageComposer {
  channel: Channel;
  config: MessageComposerConfig;
  state: StateStore<MessageComposerState>;
  attachmentManager: AttachmentManager;
  linkPreviewsManager: LinkPreviewsManager;
  // todo: mediaRecorder: MediaRecorderController;
  textComposer: TextComposer;
  threadId: string | null;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private compositionMiddlewareManager: MessageComposerMiddlewareExecutor;

  constructor({ channel, composition, config, threadId }: MessageComposerOptions) {
    this.channel = channel;
    this.threadId = threadId ?? null;
    this.config = mergeWith(DEFAULT_COMPOSER_CONFIG, config ?? {});
    const message =
      composition && (isMessageDraft(composition) ? composition.message : composition);
    this.attachmentManager = new AttachmentManager({ channel, message });
    this.linkPreviewsManager = new LinkPreviewsManager({
      client: channel.getClient(),
      message,
    });
    this.textComposer = new TextComposer({ composer: this, message });
    this.state = new StateStore<MessageComposerState>(initState(composition));
    this.compositionMiddlewareManager = new MessageComposerMiddlewareExecutor(
      this.threadId,
    );

    // Register default middleware
    this.compositionMiddlewareManager.use([
      createTextComposerMiddleware(this),
      createAttachmentsMiddleware(this),
      createLinkPreviewsMiddleware(this),
      createCompositionValidationMiddleware(),
    ]);
  }

  get client() {
    return this.channel.getClient();
  }

  get id() {
    return this.state.getLatestValue().id;
  }

  get quotedMessage() {
    return this.state.getLatestValue().quotedMessage;
  }

  get pollId() {
    return this.state.getLatestValue().pollId;
  }

  get canSendMessage() {
    return (
      !this.attachmentManager.uploadsInProgressCount &&
      (!this.textComposer.textIsEmpty ||
        this.attachmentManager.successfulUploadsCount > 0) //&&
      // !customMessageData?.poll_id
    );
  }

  static generateId = generateUUIDv4;

  initState = ({
    composition,
  }: { composition?: DraftResponse | MessageResponse } = {}) => {
    const message = isMessageDraft(composition)
      ? composition.message
      : (composition as MessageResponse);
    this.attachmentManager.initState({ message });
    this.linkPreviewsManager.initState({ message });
    this.textComposer.initState({ message });
    this.state.next(initState(composition));
  };

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Already listening for events and changes
      return;
    }
    this.unsubscribeFunctions.add(this.subscribeMessageUpdated());
    this.unsubscribeFunctions.add(this.subscribeMessageDeleted());
    this.unsubscribeFunctions.add(this.subscribeTextChanged());

    if (this.client.options.drafts) {
      this.unsubscribeFunctions.add(this.subscribeDraftUpdated());
      this.unsubscribeFunctions.add(this.subscribeDraftDeleted());
    }
  };

  public unregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    this.unsubscribeFunctions.clear();
  };

  private subscribeMessageUpdated = () => {
    // todo: test the impact of 'reaction.new', 'reaction.deleted', 'reaction.updated'
    const eventTypes: EventTypes[] = [
      'message.updated',
      'reaction.new',
      'reaction.deleted',
      'reaction.updated',
    ];

    const unsubscribeFunctions = eventTypes.map(
      (eventType) =>
        this.client.on(eventType, (event) => {
          if (!event.message) return;
          if (event.message.id === this.id) {
            this.initState({ composition: event.message });
          }
          if (this.quotedMessage?.id && event.message.id === this.quotedMessage.id) {
            this.setQuotedMessage(formatMessage(event.message));
          }
        }).unsubscribe,
    );

    return () => unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  };

  private subscribeMessageDeleted = () =>
    this.client.on('message.deleted', (event) => {
      if (!event.message) return;
      if (event.message.id === this.id) {
        this.clear();
      } else if (this.quotedMessage && event.message.id === this.quotedMessage.id) {
        this.setQuotedMessage(null);
      }
    }).unsubscribe;

  private subscribeDraftUpdated = () =>
    this.client.on('draft.updated', (event) => {
      const draft = event.draft as DraftResponse;
      if (!draft || draft.parent_id !== this.threadId || draft.message.id !== this.id)
        return;
      this.initState({ composition: draft });
    }).unsubscribe;

  private subscribeDraftDeleted = () =>
    this.client.on('draft.deleted', (event) => {
      const draft = event.draft as DraftResponse;
      if (!draft || draft.parent_id !== this.threadId || draft.message.id !== this.id)
        return;
      this.clear();
    }).unsubscribe;

  private subscribeTextChanged = () =>
    this.textComposer.state.subscribe((nextValue, previousValue) => {
      if (
        !this.config.urlPreviewEnabled ||
        !nextValue.text ||
        nextValue.text === previousValue?.text
      )
        return;
      this.linkPreviewsManager.findAndEnrichUrls(nextValue.text);
    });

  setQuotedMessage = (quotedMessage: FormatMessageResponse | null) => {
    this.state.partialNext({ quotedMessage });
  };

  clear = () => {
    this.attachmentManager.initState();
    this.linkPreviewsManager.initState();
    this.textComposer.initState();
    this.initState();
  };

  compose = async (): Promise<
    { message: MessageResponseBase; sendOptions: SendMessageOptions } | undefined
  > => {
    const initialState: MessageComposerMiddlewareValue = {
      state: {
        message: {
          id: this.id,
          attachments: [],
          linkPreviews: [],
          text: '',
          type: 'regular',
        },
        sendOptions: {},
      },
    };

    const result = await this.compositionMiddlewareManager.execute(
      'compose',
      initialState,
    );
    if (result.status === 'discard') return;

    const optimisticUpdateMessageProps = {
      created_at: new Date().toISOString(),
      reactions: [],
      status: 'sending',
    };

    const { attachments, linkPreviews, ...message } = result.state.message;
    return {
      ...result.state,
      message: {
        ...message,
        ...optimisticUpdateMessageProps,
        attachments: attachments.concat(linkPreviews),
        html: result.state.message.text,
        user: this.client.user,
      },
    };
  };

  // todo: keep in stream-chat-react
  sendMessage = async () => {
    const composition = await this.compose();
    if (!composition) return;

    // const { message, sendOptions } = composition;

    // return this.channel.sendMessage(message, sendOptions);
  };
}
