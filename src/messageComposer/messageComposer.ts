import { AttachmentManager } from './attachmentManager';
import { LinkPreviewsManager } from './linkPreviewsManager';
import { PollComposer } from './pollComposer';
import { TextComposer } from './textComposer';
import type { MessageComposerMiddlewareValue } from './middleware';
import { MessageComposerMiddlewareExecutor } from './middleware';
import { StateStore } from '../store';
import { formatMessage, generateUUIDv4 } from '../utils';
import { mergeWith } from '../utils/mergeWith';
import type { Channel } from '../channel';
import type {
  DraftMessage,
  DraftResponse,
  EventTypes,
  LocalMessage,
  LocalMessageBase,
  MessageResponse,
  MessageResponseBase,
} from '../types';

/*
  todo:
  1/ decide whether lastChange timestamp is necessary
 */

export type MessageComposerState = {
  id: string;
  lastChange: Date | null;
  quotedMessage: LocalMessageBase | null;
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
  composition?: DraftResponse | MessageResponse | LocalMessage;
  config?: Partial<MessageComposerConfig>;
  threadId?: string;
  tag?: string;
};

const isMessageDraft = (composition: unknown): composition is DraftResponse =>
  !!(composition as { message?: DraftMessage })?.message;

const initState = (
  composition?: DraftResponse | MessageResponse | LocalMessage,
): MessageComposerState => {
  if (!composition) {
    return {
      id: MessageComposer.generateId(),
      lastChange: null,
      quotedMessage: null,
      pollId: null,
    };
  }

  const quotedMessage = composition.quoted_message;
  let message;
  if (isMessageDraft(composition)) {
    message = composition.message;
  } else {
    message = composition;
  }

  return {
    id: message.id,
    lastChange: new Date(),
    quotedMessage: quotedMessage
      ? formatMessage(quotedMessage as MessageResponseBase)
      : null,
    pollId: message.poll_id ?? null,
  };
};

const DEFAULT_COMPOSER_CONFIG: MessageComposerConfig = {
  publishTypingEvents: true,
  urlPreviewEnabled: false,
};

const noop = () => undefined;

export class MessageComposer {
  readonly channel: Channel;
  readonly state: StateStore<MessageComposerState>;
  readonly editedMessage?: LocalMessage;
  readonly threadId: string | null;
  readonly tag: string;
  config: MessageComposerConfig;
  attachmentManager: AttachmentManager;
  linkPreviewsManager: LinkPreviewsManager;
  textComposer: TextComposer;
  pollComposer: PollComposer;
  // todo: mediaRecorder: MediaRecorderController;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private compositionMiddlewareExecutor: MessageComposerMiddlewareExecutor;

  constructor({ channel, composition, config, threadId, tag }: MessageComposerOptions) {
    this.channel = channel;
    this.threadId = threadId ?? null;
    this.config = mergeWith(DEFAULT_COMPOSER_CONFIG, config ?? {});
    this.tag = tag ?? generateUUIDv4();

    let message: LocalMessage | DraftMessage | undefined = undefined;
    if (isMessageDraft(composition)) {
      message = composition.message;
    } else if (composition) {
      message = formatMessage(composition);
      this.editedMessage = message;
    }

    this.attachmentManager = new AttachmentManager({ channel, message });
    this.linkPreviewsManager = new LinkPreviewsManager({
      client: channel.getClient(),
      message,
    });
    this.textComposer = new TextComposer({ composer: this, message });
    this.pollComposer = new PollComposer({ composer: this });
    this.state = new StateStore<MessageComposerState>(initState(composition));
    this.compositionMiddlewareExecutor = new MessageComposerMiddlewareExecutor({
      composer: this,
    });
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
      (!this.attachmentManager.uploadsInProgressCount &&
        (!this.textComposer.textIsEmpty ||
          this.attachmentManager.successfulUploadsCount > 0)) ||
      this.pollId
    );
  }

  static generateId = generateUUIDv4;

  initState = ({
    composition,
  }: { composition?: DraftResponse | MessageResponse } = {}) => {
    const message: LocalMessage | DraftMessage | undefined =
      typeof composition === 'undefined'
        ? composition
        : isMessageDraft(composition)
          ? composition.message
          : formatMessage(composition);
    this.attachmentManager.initState({ message });
    this.linkPreviewsManager.initState({ message });
    this.textComposer.initState({ message });
    this.state.next(initState(composition));
  };

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Already listening for events and changes
      return noop;
    }
    this.unsubscribeFunctions.add(this.subscribeMessageComposerSetupStateChange());
    this.unsubscribeFunctions.add(this.subscribeMessageUpdated());
    this.unsubscribeFunctions.add(this.subscribeMessageDeleted());
    this.unsubscribeFunctions.add(this.subscribeTextChanged());

    if (this.client.options.drafts) {
      this.unsubscribeFunctions.add(this.subscribeDraftUpdated());
      this.unsubscribeFunctions.add(this.subscribeDraftDeleted());
    }

    return this.unregisterSubscriptions;
  };

  // TODO: maybe make these private across the SDK
  public unregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    this.unsubscribeFunctions.clear();
  };

  public hydrateState = (composer: MessageComposer) => {
    if (composer.id !== this.id) return;

    // TODO
    // this.textComposer.hydrate
    // this.attachmentManager.hydrate
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

  private subscribeMessageComposerSetupStateChange = () => {
    let cleanupBefore: (() => void) | null = null;
    const unsubscribe = this.client._messageComposerSetupState.subscribeWithSelector(
      ({ applyModifications }) => ({
        applyModifications,
      }),
      ({ applyModifications }) => {
        cleanupBefore?.();
        cleanupBefore = applyModifications?.({ composer: this }) ?? null;
      },
    );

    return () => {
      cleanupBefore?.();
      unsubscribe();
    };
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

  setQuotedMessage = (quotedMessage: LocalMessage | null) => {
    this.state.partialNext({ quotedMessage });
  };

  clear = () => {
    this.attachmentManager.initState();
    this.linkPreviewsManager.initState();
    this.textComposer.initState();
    this.pollComposer.initState();
    this.initState();
  };

  compose = async (): Promise<MessageComposerMiddlewareValue['state'] | undefined> => {
    const created_at = this.editedMessage?.created_at ?? new Date();
    const text = '';
    const result = await this.compositionMiddlewareExecutor.execute('compose', {
      state: {
        message: {
          attachments: [],
          id: this.id,
          parent_id: this.threadId ?? undefined,
          text,
          type: 'regular',
        },
        localMessage: {
          attachments: [],
          created_at, // only assigned to localMessage as this is used for optimistic update
          deleted_at: null,
          error: undefined,
          id: this.id,
          mentioned_users: [],
          parent_id: this.threadId ?? undefined,
          pinned_at: null,
          reaction_groups: null,
          status: 'sending',
          text,
          type: 'regular',
          updated_at: created_at,
        },
        sendOptions: {},
      },
    });
    if (result.status === 'discard') return;

    return result.state;
  };

  composeDraft = () => {
    console.error('not implemented');
  };

  createPoll = async () => {
    const composition = await this.pollComposer.compose();
    if (!composition || !composition.data.id) return;
    try {
      const { poll } = await this.client.createPoll(composition.data);
      this.state.partialNext({ pollId: poll.id });
    } catch (error) {
      this.client.notifications.add({
        message: 'Failed to create the poll',
        origin: {
          emitter: 'MessageComposer',
          context: { composer: this },
        },
      });
      throw error;
    }
  };
}
