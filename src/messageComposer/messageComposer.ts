import { AttachmentManager } from './attachmentManager';
import { CustomDataManager } from './CustomDataManager';
import { LinkPreviewsManager } from './linkPreviewsManager';
import { PollComposer } from './pollComposer';
import { TextComposer } from './textComposer';
import { DEFAULT_COMPOSER_CONFIG } from './configuration/configuration';
import type { MessageComposerMiddlewareValue } from './middleware';
import {
  MessageComposerMiddlewareExecutor,
  MessageDraftComposerMiddlewareExecutor,
} from './middleware';
import { StateStore } from '../store';
import { formatMessage, generateUUIDv4, isLocalMessage, unformatMessage } from '../utils';
import { mergeWith } from '../utils/mergeWith';
import { Channel } from '../channel';
import { Thread } from '../thread';
import type {
  ChannelAPIResponse,
  DraftMessage,
  DraftResponse,
  EventTypes,
  LocalMessage,
  LocalMessageBase,
  MessageResponse,
  MessageResponseBase,
} from '../types';
import type { StreamChat } from '../client';
import type { MessageComposerConfig } from './configuration/types';
import type { DeepPartial } from '../types.utility';
import type { Unsubscribe } from '../store';
import { WithSubscriptions } from '../utils/WithSubscriptions';

type UnregisterSubscriptions = Unsubscribe;

export type LastComposerChange = { draftUpdate: number | null; stateUpdate: number };

export type EditingAuditState = {
  lastChange: LastComposerChange;
};

export type LocalMessageWithLegacyThreadId = LocalMessage & { legacyThreadId?: string };
export type CompositionContext = Channel | Thread | LocalMessageWithLegacyThreadId;

export type MessageComposerState = {
  id: string;
  draftId: string | null;
  pollId: string | null;
  quotedMessage: LocalMessageBase | null;
  showReplyInChannel: boolean;
};

export type MessageComposerOptions = {
  client: StreamChat;
  // composer can belong to a channel, thread, legacy thread or a local message (edited message)
  compositionContext: CompositionContext;
  // initial state like draft message or edited message
  composition?: DraftResponse | MessageResponse | LocalMessage;
  config?: DeepPartial<MessageComposerConfig>;
};

const compositionIsDraftResponse = (composition: unknown): composition is DraftResponse =>
  !!(composition as { message?: DraftMessage })?.message;

const initEditingAuditState = (
  composition?: DraftResponse | MessageResponse | LocalMessage,
): EditingAuditState => {
  let draftUpdate = null;
  let stateUpdate = new Date().getTime();
  if (compositionIsDraftResponse(composition)) {
    stateUpdate = draftUpdate = new Date(composition.created_at).getTime();
  } else if (composition && isLocalMessage(composition)) {
    stateUpdate = new Date(composition.updated_at).getTime();
  }
  return {
    lastChange: {
      draftUpdate,
      stateUpdate,
    },
  };
};

const initState = (
  composition?: DraftResponse | MessageResponse | LocalMessage,
): MessageComposerState => {
  if (!composition) {
    return {
      draftId: null,
      id: MessageComposer.generateId(),
      pollId: null,
      quotedMessage: null,
      showReplyInChannel: false,
    };
  }

  const quotedMessage = composition.quoted_message;
  let message;
  let draftId = null;
  let id = MessageComposer.generateId(); // do not use draft id for messsage id
  if (compositionIsDraftResponse(composition)) {
    message = composition.message;
    draftId = composition.message.id;
  } else {
    message = composition;
    id = composition.id;
  }

  return {
    draftId,
    id,
    pollId: message.poll_id ?? null,
    quotedMessage: quotedMessage
      ? formatMessage(quotedMessage as MessageResponseBase)
      : null,
    showReplyInChannel: false,
  };
};

export class MessageComposer extends WithSubscriptions {
  readonly channel: Channel;
  readonly state: StateStore<MessageComposerState>;
  readonly editingAuditState: StateStore<EditingAuditState>;
  readonly configState: StateStore<MessageComposerConfig>;
  readonly compositionContext: CompositionContext;
  readonly compositionMiddlewareExecutor: MessageComposerMiddlewareExecutor;
  readonly draftCompositionMiddlewareExecutor: MessageDraftComposerMiddlewareExecutor;

  editedMessage?: LocalMessage;
  attachmentManager: AttachmentManager;
  linkPreviewsManager: LinkPreviewsManager;
  textComposer: TextComposer;
  pollComposer: PollComposer;
  customDataManager: CustomDataManager;
  // todo: mediaRecorder: MediaRecorderController;

  constructor({
    composition,
    config,
    compositionContext,
    client,
  }: MessageComposerOptions) {
    super();

    this.compositionContext = compositionContext;

    this.configState = new StateStore<MessageComposerConfig>(
      mergeWith(DEFAULT_COMPOSER_CONFIG, config ?? {}),
    );

    // channel is easily inferable from the context
    if (compositionContext instanceof Channel) {
      this.channel = compositionContext;
    } else if (compositionContext instanceof Thread) {
      this.channel = compositionContext.channel;
    } else if (compositionContext.cid) {
      const [type, id] = compositionContext.cid.split(':');
      this.channel = client.channel(type, id);
    } else {
      throw new Error(
        'MessageComposer requires composition context pointing to channel (channel or context.cid)',
      );
    }

    let message: LocalMessage | DraftMessage | undefined = undefined;
    if (compositionIsDraftResponse(composition)) {
      message = composition.message;
    } else if (composition) {
      message = formatMessage(composition);
      this.editedMessage = message;
    }

    this.attachmentManager = new AttachmentManager({ composer: this, message });
    this.linkPreviewsManager = new LinkPreviewsManager({ composer: this, message });
    this.textComposer = new TextComposer({ composer: this, message });
    this.pollComposer = new PollComposer({ composer: this });
    this.customDataManager = new CustomDataManager({ composer: this, message });

    this.editingAuditState = new StateStore<EditingAuditState>(
      this.initEditingAuditState(composition),
    );
    this.state = new StateStore<MessageComposerState>(initState(composition));

    this.compositionMiddlewareExecutor = new MessageComposerMiddlewareExecutor({
      composer: this,
    });
    this.draftCompositionMiddlewareExecutor = new MessageDraftComposerMiddlewareExecutor({
      composer: this,
    });
  }

  static evaluateContextType(compositionContext: CompositionContext) {
    if (compositionContext instanceof Channel) {
      return 'channel';
    }

    if (compositionContext instanceof Thread) {
      return 'thread';
    }

    if (typeof compositionContext.legacyThreadId === 'string') {
      return 'legacy_thread';
    }

    return 'message';
  }

  static constructTag(
    compositionContext: CompositionContext,
  ): `${ReturnType<typeof MessageComposer.evaluateContextType>}_${string}` {
    return `${this.evaluateContextType(compositionContext)}_${compositionContext.id}`;
  }

  get config(): MessageComposerConfig {
    return this.configState.getLatestValue();
  }

  updateConfig(config: DeepPartial<MessageComposerConfig>) {
    this.configState.partialNext(mergeWith(this.config, config));
  }

  get contextType() {
    return MessageComposer.evaluateContextType(this.compositionContext);
  }

  get tag() {
    return MessageComposer.constructTag(this.compositionContext);
  }

  get threadId() {
    // TODO: ideally we'd use this.contextType but type narrowing does not work for this.compositionContext
    // if (this.contextType === 'channel') {
    //   const context = this.compositionContext; // context is a Channel
    //   return null
    // }

    if (this.compositionContext instanceof Channel) {
      return null;
    }

    if (this.compositionContext instanceof Thread) {
      return this.compositionContext.id;
    }

    if (typeof this.compositionContext.legacyThreadId === 'string') {
      return this.compositionContext.legacyThreadId;
    }

    // check if the message is a reply, get parentMessageId
    if (typeof this.compositionContext.parent_id === 'string') {
      return this.compositionContext.parent_id;
    }

    return null;
  }

  get client() {
    return this.channel.getClient();
  }

  get id() {
    return this.state.getLatestValue().id;
  }

  get draftId() {
    return this.state.getLatestValue().draftId;
  }

  get lastChange() {
    return this.editingAuditState.getLatestValue().lastChange;
  }

  get quotedMessage() {
    return this.state.getLatestValue().quotedMessage;
  }

  get pollId() {
    return this.state.getLatestValue().pollId;
  }

  get showReplyInChannel() {
    return this.state.getLatestValue().showReplyInChannel;
  }

  get hasSendableData() {
    // If the offline mode is enabled, we allow sending a message if the composition is not empty.
    if (this.client.offlineDb) {
      return !this.compositionIsEmpty;
    }
    return !!(
      (!this.attachmentManager.uploadsInProgressCount &&
        (!this.textComposer.textIsEmpty ||
          this.attachmentManager.successfulUploadsCount > 0)) ||
      this.pollId
    );
  }

  get compositionIsEmpty() {
    return (
      !this.quotedMessage &&
      this.textComposer.textIsEmpty &&
      !this.attachmentManager.attachments.length &&
      !this.pollId
    );
  }

  get lastChangeOriginIsLocal() {
    const initiatedWithoutDraft = this.lastChange.draftUpdate === null;
    const composingMessageFromScratch = initiatedWithoutDraft && !this.editedMessage;

    // does not mean that the original editted message is different from the current state
    const editedMessageWasUpdated =
      !!this.editedMessage?.updated_at &&
      new Date(this.editedMessage.updated_at).getTime() < this.lastChange.stateUpdate;

    const draftWasChanged =
      !!this.lastChange.draftUpdate &&
      this.lastChange.draftUpdate < this.lastChange.stateUpdate;

    return editedMessageWasUpdated || draftWasChanged || composingMessageFromScratch;
  }

  static generateId = generateUUIDv4;

  initState = ({
    composition,
  }: { composition?: DraftResponse | MessageResponse | LocalMessage } = {}) => {
    this.editingAuditState.partialNext(this.initEditingAuditState(composition));

    const message: LocalMessage | DraftMessage | undefined =
      typeof composition === 'undefined'
        ? composition
        : compositionIsDraftResponse(composition)
          ? composition.message
          : formatMessage(composition);
    this.attachmentManager.initState({ message });
    this.linkPreviewsManager.initState({ message });
    this.textComposer.initState({ message });
    this.pollComposer.initState();
    this.customDataManager.initState({ message });
    this.state.next(initState(composition));
    if (
      composition &&
      !compositionIsDraftResponse(composition) &&
      message &&
      isLocalMessage(message)
    ) {
      this.editedMessage = message;
    }
  };

  initStateFromChannelResponse = (channelApiResponse: ChannelAPIResponse) => {
    if (this.channel.cid !== channelApiResponse.channel.cid) {
      return;
    }
    if (channelApiResponse.draft) {
      this.initState({ composition: channelApiResponse.draft });
    } else if (this.state.getLatestValue().draftId) {
      this.clear();
      this.client.offlineDb?.executeQuerySafely(
        (db) =>
          db.deleteDraft({
            cid: this.channel.cid,
            parent_id: undefined, // makes sure that we don't delete thread drafts while upserting channels
          }),
        { method: 'deleteDraft' },
      );
    }
  };

  initEditingAuditState = (
    composition?: DraftResponse | MessageResponse | LocalMessage,
  ) => initEditingAuditState(composition);

  private logStateUpdateTimestamp() {
    this.editingAuditState.partialNext({
      lastChange: { ...this.lastChange, stateUpdate: new Date().getTime() },
    });
  }

  private logDraftUpdateTimestamp() {
    if (!this.config.drafts.enabled) return;
    const timestamp = new Date().getTime();
    this.editingAuditState.partialNext({
      lastChange: { draftUpdate: timestamp, stateUpdate: timestamp },
    });
  }

  public registerDraftEventSubscriptions = () => {
    const unsubscribeDraftUpdated = this.subscribeDraftUpdated();
    const unsubscribeDraftDeleted = this.subscribeDraftDeleted();

    return () => {
      unsubscribeDraftUpdated();
      unsubscribeDraftDeleted();
    };
  };

  public registerSubscriptions = (): UnregisterSubscriptions => {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(this.subscribeMessageComposerSetupStateChange());
      this.addUnsubscribeFunction(this.subscribeMessageUpdated());
      this.addUnsubscribeFunction(this.subscribeMessageDeleted());

      this.addUnsubscribeFunction(this.subscribeTextComposerStateChanged());
      this.addUnsubscribeFunction(this.subscribeAttachmentManagerStateChanged());
      this.addUnsubscribeFunction(this.subscribeLinkPreviewsManagerStateChanged());
      this.addUnsubscribeFunction(this.subscribePollComposerStateChanged());
      this.addUnsubscribeFunction(this.subscribeCustomDataManagerStateChanged());
      this.addUnsubscribeFunction(this.subscribeMessageComposerStateChanged());
      this.addUnsubscribeFunction(this.subscribeMessageComposerConfigStateChanged());
    }

    this.incrementRefCount();

    return () => this.unregisterSubscriptions();
  };

  private subscribeMessageUpdated = () => {
    // todo: test the impact of 'reaction.new', 'reaction.deleted', 'reaction.updated'
    const eventTypes: EventTypes[] = [
      'message.updated',
      'reaction.new',
      'reaction.deleted', // todo: do we need to subscribe to this especially when the whole state is overriden?
      'reaction.updated', // todo: do we need to subscribe to this especially when the whole state is overriden?
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
    let tearDown: (() => void) | null = null;
    const unsubscribe = this.client._messageComposerSetupState.subscribeWithSelector(
      ({ setupFunction: setup }) => ({
        setup,
      }),
      ({ setup }) => {
        tearDown?.();
        tearDown = setup?.({ composer: this }) ?? null;
      },
    );

    return () => {
      tearDown?.();
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
      if (
        !draft ||
        (draft.parent_id ?? null) !== (this.threadId ?? null) ||
        draft.channel_cid !== this.channel.cid
      )
        return;
      this.initState({ composition: draft });
    }).unsubscribe;

  private subscribeDraftDeleted = () =>
    this.client.on('draft.deleted', (event) => {
      const draft = event.draft as DraftResponse;
      if (
        !draft ||
        (draft.parent_id ?? null) !== (this.threadId ?? null) ||
        draft.channel_cid !== this.channel.cid
      ) {
        return;
      }

      this.logDraftUpdateTimestamp();

      if (this.compositionIsEmpty) {
        return;
      }

      this.clear();
    }).unsubscribe;

  private subscribeTextComposerStateChanged = () =>
    this.textComposer.state.subscribeWithSelector(
      ({ text }) => [text] as const,
      ([currentText], previousSelection) => {
        // do not handle on initial subscription
        if (typeof previousSelection === 'undefined') return;

        this.logStateUpdateTimestamp();

        if (this.compositionIsEmpty) {
          this.deleteDraft();
          return;
        }

        if (!this.linkPreviewsManager.enabled) return;

        if (!currentText) {
          this.linkPreviewsManager.clearPreviews();
        } else {
          this.linkPreviewsManager.findAndEnrichUrls(currentText);
        }
      },
    );

  private subscribeAttachmentManagerStateChanged = () =>
    this.attachmentManager.state.subscribe((_, previousValue) => {
      if (typeof previousValue === 'undefined') return;

      this.logStateUpdateTimestamp();

      if (this.compositionIsEmpty) {
        this.deleteDraft();
        return;
      }
    });

  private subscribeLinkPreviewsManagerStateChanged = () =>
    this.linkPreviewsManager.state.subscribe((_, previousValue) => {
      if (typeof previousValue === 'undefined') return;

      this.logStateUpdateTimestamp();

      if (this.compositionIsEmpty) {
        this.deleteDraft();
        return;
      }
    });

  private subscribePollComposerStateChanged = () =>
    this.pollComposer.state.subscribe((_, previousValue) => {
      if (typeof previousValue === 'undefined') return;

      this.logStateUpdateTimestamp();

      if (this.compositionIsEmpty) {
        this.deleteDraft();
        return;
      }
    });

  private subscribeCustomDataManagerStateChanged = () =>
    this.customDataManager.state.subscribe((nextValue, previousValue) => {
      if (
        typeof previousValue !== 'undefined' &&
        // FIXME: is this check really necessary?
        !this.customDataManager.isMessageDataEqual(nextValue, previousValue)
      ) {
        this.logStateUpdateTimestamp();
      }
    });

  private subscribeMessageComposerStateChanged = () =>
    this.state.subscribe((_, previousValue) => {
      if (typeof previousValue === 'undefined') return;

      this.logStateUpdateTimestamp();

      if (this.compositionIsEmpty) {
        this.deleteDraft();
      }
    });

  private subscribeMessageComposerConfigStateChanged = () => {
    let draftUnsubscribeFunction: Unsubscribe | null;

    const unsubscribe = this.configState.subscribeWithSelector(
      (currentValue) => ({
        textDefaultValue: currentValue.text.defaultValue,
        draftsEnabled: currentValue.drafts.enabled,
      }),
      ({ textDefaultValue, draftsEnabled }) => {
        if (this.textComposer.text === '' && textDefaultValue) {
          this.textComposer.insertText({
            text: textDefaultValue,
            selection: { start: 0, end: 0 },
          });
        }

        if (draftsEnabled && !draftUnsubscribeFunction) {
          draftUnsubscribeFunction = this.registerDraftEventSubscriptions();
        } else if (!draftsEnabled && draftUnsubscribeFunction) {
          draftUnsubscribeFunction();
          draftUnsubscribeFunction = null;
        }
      },
    );

    return () => {
      draftUnsubscribeFunction?.();
      unsubscribe();
    };
  };

  setQuotedMessage = (quotedMessage: LocalMessage | null) => {
    this.state.partialNext({ quotedMessage });
  };

  toggleShowReplyInChannel = () => {
    this.state.partialNext({ showReplyInChannel: !this.showReplyInChannel });
  };

  clear = () => {
    this.setQuotedMessage(null);
    this.initState();
  };

  restore = () => {
    const { editedMessage } = this;
    if (editedMessage) {
      this.initState({ composition: editedMessage });
      return;
    }
    this.clear();
  };

  compose = async (): Promise<MessageComposerMiddlewareValue['state'] | undefined> => {
    const created_at = this.editedMessage?.created_at ?? new Date();

    const text = '';
    const result = await this.compositionMiddlewareExecutor.execute({
      eventName: 'compose',
      initialValue: {
        message: {
          id: this.id,
          parent_id: this.threadId ?? undefined,
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
          status: this.editedMessage ? this.editedMessage.status : 'sending',
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

  composeDraft = async () => {
    const { state, status } = await this.draftCompositionMiddlewareExecutor.execute({
      eventName: 'compose',
      initialValue: {
        draft: { id: this.id, parent_id: this.threadId ?? undefined, text: '' },
      },
    });
    if (status === 'discard') return;

    return state;
  };

  createDraft = async () => {
    // server-side drafts are not stored on message level but on thread and channel level
    // therefore we don't need to create a draft if the message is edited
    if (this.editedMessage || !this.config.drafts.enabled) return;
    const composition = await this.composeDraft();
    if (!composition) return;
    const { draft } = composition;
    this.state.partialNext({ draftId: draft.id });
    if (this.client.offlineDb) {
      try {
        const optimisticDraftResponse = {
          channel_cid: this.channel.cid,
          created_at: new Date().toISOString(),
          message: draft as DraftMessage,
          parent_id: draft.parent_id,
          quoted_message: this.quotedMessage
            ? unformatMessage(this.quotedMessage)
            : undefined,
        };
        await this.client.offlineDb.upsertDraft({ draft: optimisticDraftResponse });
      } catch (error) {
        this.client.logger('error', `offlineDb:upsertDraft`, {
          tags: ['channel', 'offlineDb'],
          error,
        });
      }
    }
    this.logDraftUpdateTimestamp();
    await this.channel.createDraft(draft);
  };

  deleteDraft = async () => {
    if (this.editedMessage || !this.config.drafts.enabled || !this.draftId) return;
    this.state.partialNext({ draftId: null }); // todo: should we clear the whole state?
    const parentId = this.threadId ?? undefined;
    if (this.client.offlineDb) {
      try {
        await this.client.offlineDb.deleteDraft({
          cid: this.channel.cid,
          parent_id: parentId,
        });
      } catch (error) {
        this.client.logger('error', `offlineDb:deleteDraft`, {
          tags: ['channel', 'offlineDb'],
          error,
        });
      }
    }
    this.logDraftUpdateTimestamp();
    await this.channel.deleteDraft({ parent_id: parentId });
  };

  getDraft = async () => {
    if (this.editedMessage || !this.config.drafts.enabled || !this.client.userID) return;

    const draftFromOfflineDB = await this.client.offlineDb?.getDraft({
      cid: this.channel.cid,
      userId: this.client.userID,
      parent_id: this.threadId ?? undefined,
    });

    if (draftFromOfflineDB) {
      this.initState({ composition: draftFromOfflineDB });
    }

    try {
      const response = await this.channel.getDraft({
        parent_id: this.threadId ?? undefined,
      });

      const { draft } = response;

      if (!draft) return;

      this.client.offlineDb?.executeQuerySafely(
        (db) =>
          db.upsertDraft({
            draft,
          }),
        { method: 'upsertDraft' },
      );

      this.initState({ composition: draft });
    } catch (error) {
      this.client.notifications.add({
        message: 'Failed to get the draft',
        origin: {
          emitter: 'MessageComposer',
          context: { composer: this },
        },
      });
    }
  };

  createPoll = async () => {
    const composition = await this.pollComposer.compose();
    if (!composition || !composition.data.id) return;
    try {
      const poll = await this.client.polls.createPoll(composition.data);
      this.state.partialNext({ pollId: poll?.id });
    } catch (error) {
      this.client.notifications.addError({
        message: 'Failed to create the poll',
        origin: {
          emitter: 'MessageComposer',
          context: { composer: this },
        },
        options: {
          type: 'api:poll:create:failed',
          metadata: {
            reason: (error as Error).message,
          },
          originalError: error instanceof Error ? error : undefined,
        },
      });
      throw error;
    }
  };
}
