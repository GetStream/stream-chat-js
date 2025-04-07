import { AttachmentManager } from './attachmentManager';
import { LinkPreviewsManager } from './linkPreviewsManager';
import { PollComposer } from './pollComposer';
import { TextComposer } from './textComposer';
import type { MessageComposerMiddlewareValue } from './middleware';
import {
  MessageComposerMiddlewareExecutor,
  MessageDraftComposerMiddlewareExecutor,
} from './middleware';
import { StateStore } from '../store';
import { formatMessage, generateUUIDv4 } from '../utils';
import { mergeWith } from '../utils/mergeWith';
import type { AttachmentManagerConfig } from './attachmentManager';
import type { LinkPreviewsManagerConfig } from './linkPreviewsManager';
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

export type ComposerMap = {
  attachmentManager: AttachmentManager;
  linkPreviewsManager: LinkPreviewsManager;
  textComposer: TextComposer;
  pollComposer: PollComposer;
};

type LastComposerChange = { draftUpdate: number | null; stateUpdate: number };

type EditingAuditState = {
  lastChange: LastComposerChange;
};

export type MessageComposerState = {
  id: string;
  quotedMessage: LocalMessageBase | null;
  pollId: string | null;
  draftId: string | null;
};

export type MessageComposerConfig = {
  /** If true, triggers typing events on text input keystroke */
  publishTypingEvents: boolean;
  attachmentManager?: Partial<AttachmentManagerConfig>;
  draftsEnabled?: boolean;
  linkPreviewsManager?: Partial<LinkPreviewsManagerConfig>;
  maxTextLength?: number;
};

export type MessageComposerOptions = {
  channel: Channel;
  composition?: DraftResponse | MessageResponse | LocalMessage;
  config?: Partial<MessageComposerConfig>;
  threadId?: string;
  tag?: string;
};

const compositionIsMessageDraft = (composition: unknown): composition is DraftResponse =>
  !!(composition as { message?: DraftMessage })?.message;

const initEditingAuditState = (
  composition?: DraftResponse | MessageResponse | LocalMessage,
): EditingAuditState => {
  const timeStamp = new Date().getTime();
  return {
    lastChange: {
      draftUpdate: compositionIsMessageDraft(composition) ? timeStamp : null,
      stateUpdate: timeStamp,
    },
  };
};

const initState = (
  composition?: DraftResponse | MessageResponse | LocalMessage,
): MessageComposerState => {
  if (!composition) {
    return {
      id: MessageComposer.generateId(),
      quotedMessage: null,
      pollId: null,
      draftId: null,
    };
  }

  const quotedMessage = composition.quoted_message;
  let message;
  let draftId = null;
  if (compositionIsMessageDraft(composition)) {
    message = composition.message;
    draftId = composition.message.id;
  } else {
    message = composition;
  }

  return {
    draftId,
    id: message.id,
    quotedMessage: quotedMessage
      ? formatMessage(quotedMessage as MessageResponseBase)
      : null,
    pollId: message.poll_id ?? null,
  };
};

const DEFAULT_COMPOSER_CONFIG: MessageComposerConfig = {
  draftsEnabled: true,
  publishTypingEvents: true,
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
  private draftCompositionMiddlewareExecutor: MessageDraftComposerMiddlewareExecutor;
  private editingAuditState: StateStore<EditingAuditState>;

  constructor({ channel, composition, config, threadId, tag }: MessageComposerOptions) {
    this.channel = channel;
    this.threadId = threadId ?? null;
    const {
      attachmentManager: attachmentManagerConfig,
      linkPreviewsManager: linkPreviewsManagerConfig,
      ...messageComposerConfig
    } = config ?? {};
    this.config = mergeWith(DEFAULT_COMPOSER_CONFIG, messageComposerConfig ?? {});
    this.tag = tag ?? generateUUIDv4();

    let message: LocalMessage | DraftMessage | undefined = undefined;
    if (compositionIsMessageDraft(composition)) {
      message = composition.message;
    } else if (composition) {
      message = formatMessage(composition);
      this.editedMessage = message;
    }

    this.attachmentManager = new AttachmentManager({
      channel, // todo: pass composer reference to each manager
      config: attachmentManagerConfig,
      message,
    });
    this.linkPreviewsManager = new LinkPreviewsManager({
      client: channel.getClient(),
      config: linkPreviewsManagerConfig,
      message,
    });
    this.textComposer = new TextComposer({ composer: this, message });
    this.pollComposer = new PollComposer({ composer: this });

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

  get canSendMessage() {
    return (
      (!this.attachmentManager.uploadsInProgressCount &&
        (!this.textComposer.textIsEmpty ||
          this.attachmentManager.successfulUploadsCount > 0)) ||
      this.pollId
    );
  }

  get lastChangeOriginIsLocal() {
    return (
      this.lastChange.draftUpdate === null ||
      this.lastChange.draftUpdate < this.lastChange.stateUpdate
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

  static generateId = generateUUIDv4;

  initState = ({
    composition,
  }: { composition?: DraftResponse | MessageResponse } = {}) => {
    this.editingAuditState.partialNext(this.initEditingAuditState(composition));

    const message: LocalMessage | DraftMessage | undefined =
      typeof composition === 'undefined'
        ? composition
        : compositionIsMessageDraft(composition)
          ? composition.message
          : formatMessage(composition);
    this.attachmentManager.initState({ message });
    this.linkPreviewsManager.initState({ message });
    this.textComposer.initState({ message });
    this.state.next(initState(composition));
  };

  initEditingAuditState = (
    composition?: DraftResponse | MessageResponse | LocalMessage,
  ) =>
    initEditingAuditState(
      this.config?.draftsEnabled || !compositionIsMessageDraft(composition)
        ? composition
        : undefined,
    );

  private logStateUpdateTimestamp() {
    this.editingAuditState.partialNext({
      lastChange: { ...this.lastChange, stateUpdate: new Date().getTime() },
    });
  }
  private logDraftUpdateTimestamp() {
    if (!this.config.draftsEnabled) return;
    const timestamp = new Date().getTime();
    this.editingAuditState.partialNext({
      lastChange: { draftUpdate: timestamp, stateUpdate: timestamp },
    });
  }

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Already listening for events and changes
      return noop;
    }
    this.unsubscribeFunctions.add(this.subscribeMessageComposerSetupStateChange());
    this.unsubscribeFunctions.add(this.subscribeMessageUpdated());
    this.unsubscribeFunctions.add(this.subscribeMessageDeleted());

    this.unsubscribeFunctions.add(this.subscribeTextComposerStateChanged());
    this.unsubscribeFunctions.add(this.subscribeAttachmentManagerStateChanged());
    this.unsubscribeFunctions.add(this.subscribeLinkPreviewsManagerStateChanged());
    this.unsubscribeFunctions.add(this.subscribePollComposerStateChanged());
    this.unsubscribeFunctions.add(this.subscribeMessageComposerStateChanged());

    if (this.config.draftsEnabled) {
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
      if (
        !draft ||
        !!draft.parent_id !== !!this.threadId ||
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
        !!draft.parent_id !== !!this.threadId ||
        draft.channel_cid !== this.channel.cid
      )
        return;

      this.logDraftUpdateTimestamp();
      if (this.compositionIsEmpty) {
        return;
      }
      this.clear();
    }).unsubscribe;

  private subscribeTextComposerStateChanged = () =>
    this.textComposer.state.subscribe((nextValue, previousValue) => {
      if (previousValue && nextValue.text !== previousValue?.text) {
        this.logStateUpdateTimestamp();
        if (this.compositionIsEmpty) {
          this.deleteDraft();
          return;
        }
      }
      if (
        !this.config.linkPreviewsManager?.enabled ||
        !nextValue.text ||
        nextValue.text === previousValue?.text
      )
        return;
      this.linkPreviewsManager.findAndEnrichUrls(nextValue.text);
    });

  private subscribeAttachmentManagerStateChanged = () =>
    this.attachmentManager.state.subscribe((nextValue, previousValue) => {
      const isActualStateChange =
        !!previousValue &&
        (nextValue.attachments.length !== previousValue.attachments.length ||
          nextValue.attachments.some(
            (attachment, index) =>
              attachment.localMetadata.id !==
              previousValue.attachments[index].localMetadata.id,
          ));
      if (isActualStateChange) {
        this.logStateUpdateTimestamp();
        if (this.compositionIsEmpty) {
          this.deleteDraft();
          return;
        }
      }
    });

  private subscribeLinkPreviewsManagerStateChanged = () =>
    this.linkPreviewsManager.state.subscribe((nextValue, previousValue) => {
      const previousPreviews = Array.from(previousValue?.previews ?? []);
      const isActualStateChange =
        !!previousValue &&
        Array.from(nextValue.previews).some(
          ([url], index) => url !== previousPreviews[index][0],
        );
      if (isActualStateChange) {
        this.logStateUpdateTimestamp();
        if (this.compositionIsEmpty) {
          this.deleteDraft();
          return;
        }
      }
    });

  private subscribePollComposerStateChanged = () =>
    this.pollComposer.state.subscribe((nextValue, previousValue) => {
      const isActualStateChange =
        !!previousValue &&
        (nextValue.data.allow_answers !== previousValue.data.allow_answers ||
          nextValue.data.allow_user_suggested_options !==
            previousValue.data.allow_user_suggested_options ||
          nextValue.data.description !== previousValue.data.description ||
          nextValue.data.enforce_unique_vote !== previousValue.data.enforce_unique_vote ||
          nextValue.data.id !== previousValue.data.id ||
          nextValue.data.is_closed !== previousValue.data.is_closed ||
          nextValue.data.max_votes_allowed !== previousValue.data.max_votes_allowed ||
          nextValue.data.name !== previousValue.data.name ||
          nextValue.data.options.some(
            (option, index) => option.text !== previousValue.data.options[index].text,
          ) ||
          nextValue.data.user_id !== previousValue.data.user_id ||
          nextValue.data.voting_visibility !== previousValue.data.voting_visibility);
      if (isActualStateChange) {
        this.logStateUpdateTimestamp();
        if (this.compositionIsEmpty) {
          this.deleteDraft();
          return;
        }
      }
    });

  private subscribeMessageComposerStateChanged = () =>
    this.state.subscribe((nextValue, previousValue) => {
      const isActualStateChange =
        !!previousValue &&
        (nextValue.pollId !== previousValue.pollId ||
          nextValue.quotedMessage?.id !== previousValue.quotedMessage?.id);

      if (isActualStateChange) {
        this.logStateUpdateTimestamp();
        if (this.compositionIsEmpty) {
          this.deleteDraft();
          return;
        }
      }
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

  composeDraft = async () => {
    const { state, status } = await this.draftCompositionMiddlewareExecutor.execute(
      'compose',
      {
        state: {
          draft: { id: this.id, parent_id: this.threadId ?? undefined, text: '' },
        },
      },
    );
    if (status === 'discard') return;
    return state;
  };

  createDraft = async () => {
    // server-side drafts are not stored on message level but on thread and channel level
    // therefore we don't need to create a draft if the message is edited
    if (this.editedMessage || !this.config.draftsEnabled) return;
    const composition = await this.composeDraft();
    if (!composition) return;
    const { draft } = composition;
    this.state.partialNext({ draftId: draft.id });
    this.logDraftUpdateTimestamp();
    await this.channel.createDraft(draft);
  };

  deleteDraft = async () => {
    if (this.editedMessage || !this.config.draftsEnabled || !this.draftId) return;
    this.state.partialNext({ draftId: null }); // todo: should we clear the whole state?
    this.logDraftUpdateTimestamp();
    await this.channel.deleteDraft({ parent_id: this.threadId ?? undefined });
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
