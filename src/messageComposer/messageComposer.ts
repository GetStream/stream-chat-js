import { LinkPreviewsManager } from './linkPreviewsManager';
import { AttachmentManager } from './attachmentManager';
import { TextComposer } from './textComposer';
import { Channel } from '../channel';
import { StateStore } from '../store';
import { formatMessage, generateUUIDv4 } from '../utils';
import type {
  DefaultGenerics,
  DraftMessage,
  DraftResponse,
  EventTypes,
  ExtendableGenerics,
  FormatMessageResponse,
  MessageResponse,
  MessageResponseBase,
} from '../types';
import { mergeWith } from '../utils/mergeWith';

/*
  todo:
  1/ decide whether lastChange timestamp is necessary
 */

export type MessageComposerState<SCG extends ExtendableGenerics = DefaultGenerics> = {
  id: string;
  lastChange: Date | null;
  quotedMessage: FormatMessageResponse<SCG> | null;
};

export type MessageComposerConfig = {
  /** If true, triggers typing events on text input keystroke */
  publishTypingEvents: boolean;
  maxTextLength?: number;
  urlPreviewEnabled?: boolean;
};

export type MessageComposerOptions<SCG extends ExtendableGenerics = DefaultGenerics> = {
  channel: Channel<SCG>;
  composition?: DraftResponse<SCG> | MessageResponse<SCG> | FormatMessageResponse<SCG>;
  config?: Partial<MessageComposerConfig>;
  threadId?: string;
};

const isMessageDraft = <SCG extends ExtendableGenerics = DefaultGenerics>(
  composition: DraftResponse<SCG> | MessageResponse<SCG> | FormatMessageResponse<SCG>,
): composition is DraftResponse<SCG> => !!composition.message;

const initState = <SCG extends ExtendableGenerics = DefaultGenerics>(
  composition?: DraftResponse<SCG> | MessageResponse<SCG> | FormatMessageResponse<SCG>,
): MessageComposerState<SCG> =>
  composition
    ? {
        id: isMessageDraft(composition) ? composition.message.id : composition.id,
        lastChange: new Date(),
        quotedMessage: composition.quoted_message
          ? formatMessage(composition.quoted_message as MessageResponseBase<SCG>)
          : null,
      }
    : {
        id: generateUUIDv4(),
        lastChange: null,
        quotedMessage: null,
      };

const DEFAULT_COMPOSER_CONFIG: MessageComposerConfig = {
  publishTypingEvents: true,
  urlPreviewEnabled: false,
};

export class MessageComposer<SCG extends ExtendableGenerics = DefaultGenerics> {
  channel: Channel<SCG>;
  config: MessageComposerConfig;
  state: StateStore<MessageComposerState<SCG>>;
  attachmentManager: AttachmentManager<SCG>;
  linkPreviewsManager: LinkPreviewsManager<SCG>;
  // todo: mediaRecorder: MediaRecorderController<SCG>;
  textComposer: TextComposer<SCG>;
  threadId: string | null;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ channel, composition, config = {}, threadId }: MessageComposerOptions<SCG>) {
    this.channel = channel;
    this.threadId = threadId ?? null;
    // todo: solve ts-ignore
    // @ts-ignore
    this.config = mergeWith(config, DEFAULT_COMPOSER_CONFIG);
    const message = composition && (isMessageDraft(composition) ? composition.message : composition);
    this.attachmentManager = new AttachmentManager<SCG>({ channel, message });
    this.linkPreviewsManager = new LinkPreviewsManager<SCG>({ client: channel.getClient(), message });
    this.textComposer = new TextComposer<SCG>({ composer: this, message });
    this.state = new StateStore<MessageComposerState<SCG>>(initState<SCG>(composition));
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

  initState = ({ composition }: { composition?: DraftResponse<SCG> | MessageResponse<SCG> } = {}) => {
    const message = composition && (composition.message as DraftMessage<SCG> | MessageResponseBase<SCG>);
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
    const eventTypes: EventTypes[] = ['message.updated', 'reaction.new', 'reaction.deleted', 'reaction.updated'];

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
      const draft = event.draft as DraftResponse<SCG>;
      if (!draft || draft.parent_id !== this.threadId || draft.message.id !== this.id) return;
      this.initState({ composition: draft });
    }).unsubscribe;

  private subscribeDraftDeleted = () =>
    this.client.on('draft.deleted', (event) => {
      const draft = event.draft as DraftResponse<SCG>;
      if (!draft || draft.parent_id !== this.threadId || draft.message.id !== this.id) return;
      this.clear();
    }).unsubscribe;

  private subscribeTextChanged = () =>
    this.textComposer.state.subscribe((nextValue, previousValue) => {
      if (!this.config.urlPreviewEnabled || !nextValue.text || nextValue.text === previousValue?.text) return;
      this.linkPreviewsManager.findAndEnrichUrls(nextValue.text);
    });

  setQuotedMessage = (quotedMessage: FormatMessageResponse<SCG> | null) => {
    this.state.partialNext({ quotedMessage });
  };

  clear = () => {
    this.attachmentManager.initState();
    this.linkPreviewsManager.initState();
    this.textComposer.initState();
    this.initState();
  };

  sendMessage = () => {
    // todo: see useSubmitHandler
  };
}
