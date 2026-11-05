import { CORE_NOTIFICATION_TYPE } from '../notifications';
import type { CoreNotificationType } from '../notifications';
import { AttachmentManager } from './attachmentManager';
import { isResolvableUpload, isSendableAttachment } from './attachmentIdentity';
import { CustomDataManager } from './CustomDataManager';
import { LinkPreviewsManager } from './linkPreviewsManager';
import { LocationComposer } from './LocationComposer';
import { MessageComposerEffectHandlers } from './MessageComposerEffectHandlers';
import { PollComposer } from './pollComposer';
import { TextComposer } from './textComposer';
import { DEFAULT_COMPOSER_CONFIG } from './configuration';
import type { MessageComposerMiddlewareValue } from './middleware';
import {
  MessageComposerMiddlewareExecutor,
  MessageDraftComposerMiddlewareExecutor,
} from './middleware';
import type { Unsubscribe } from '@stream-io/state-store';
import { StateStore } from '@stream-io/state-store';
import { formatMessage, generateUUIDv4, isLocalMessage } from '../utils';
import { nowNs } from '../utils/time';
import { ConfigController } from '../configuration/ConfigController';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';
import { mergeServerRestrictions } from '../configuration/utils/serverAuthority';
import type {
  ServerRestrictions,
  ServerUpperBounds,
} from '../configuration/utils/serverAuthority';
import { Channel } from '../channel';
import { Thread } from '../thread';
import type {
  Attachment,
  ChannelStateResponseFields,
  Command,
  DraftMessage,
  DraftResponse,
  EventType,
  LocalMessage,
  MessageResponse,
  SendMessageOptions,
  TimestampNS,
  UserResponse,
} from '../types';
import { chatLoggerSystem } from '../logger';
import { applyInstanceConfiguration } from '../configuration/utils/applyInstanceConfiguration';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import type { StreamChat } from '../client';
import type { CommandSendability, MessageComposerConfig } from './configuration/types';
import type {
  CommandSuggestionDisabledReason,
  TextComposerCommandActivationEffect,
  TextComposerCommandClearEffect,
} from './middleware/textComposer/types';
import type { AttachmentManagerSnapshot } from './attachmentManager';
import type { CustomDataManagerSnapshot } from './CustomDataManager';
import type { LinkPreviewsManagerSnapshot } from './linkPreviewsManager';
import type { LocationComposerSnapshot } from './LocationComposer';
import type { PollComposerSnapshot } from './pollComposer';
import type { TextComposerSnapshot } from './textComposer';
import type { DeepPartial } from '../types.utility';
import {
  getMentionedUsersInText,
  stripCommandFromText,
} from './middleware/textComposer/commandUtils';
import { CommandSearchSource } from './middleware/textComposer/commands';
import { getScheduleBlockReason } from './middleware/messageComposer/scheduledMessage';
import {
  SCHEDULED_MESSAGE_STATUS,
  ScheduledMessageCompositionEndReason,
  ScheduledMessageEventType,
} from '../scheduledMessages/constants';
import type { ScheduledMessageBlockReason } from '../scheduledMessages/constants';
import type { ScheduledMessageResponse } from '../gen/models';
import {
  resolveMentionedUsers,
  resolveQuotedMessage,
  toScheduledMessageComposition,
  toScheduledMessagePayload,
} from './scheduledMessage';

type UnregisterSubscriptions = Unsubscribe;

const END_REASON_BY_SCHEDULED_MESSAGE_EVENT = {
  [ScheduledMessageEventType.Deleted]: ScheduledMessageCompositionEndReason.Deleted,
  [ScheduledMessageEventType.Failed]: ScheduledMessageCompositionEndReason.Failed,
  [ScheduledMessageEventType.Sent]: ScheduledMessageCompositionEndReason.Sent,
} as const;

type ScheduledMessageEndEventType = keyof typeof END_REASON_BY_SCHEDULED_MESSAGE_EVENT;

type ScheduledMessageEditRestore = () => void;

/** Unix nanoseconds, directly comparable with server `created_at` / `updated_at`. */
export type LastComposerChange = {
  draftUpdate: TimestampNS | null;
  stateUpdate: TimestampNS;
};

export type EditingAuditState = {
  lastChange: LastComposerChange;
};

export type BuiltInMessageComposerEffect =
  | TextComposerCommandActivationEffect
  | TextComposerCommandClearEffect;

export type CustomMessageComposerEffect = {
  type: string & {};
} & Record<string, unknown>;

export type MessageComposerEffect =
  | BuiltInMessageComposerEffect
  | CustomMessageComposerEffect;

export type MessageComposerEffectHandler<
  T extends { type: string } = MessageComposerEffect,
> = (effect: T, composer: MessageComposer) => void;

export type MessageComposerSnapshot = {
  attachmentManager: AttachmentManagerSnapshot;
  customDataManager: CustomDataManagerSnapshot;
  linkPreviewsManager: LinkPreviewsManagerSnapshot;
  locationComposer: LocationComposerSnapshot;
  pollComposer: PollComposerSnapshot;
  textComposer: TextComposerSnapshot;
};

export type CompositionContext = Channel | Thread | LocalMessage;

/**
 * Outcome of `send()` and `update()`:
 * - `sent`: the message or edit went out.
 * - `nothing-to-send`: nothing to compose, or a middleware discarded the composition (reported through
 *   `client.notifications`). **The composer keeps its contents.**
 * - `failed`: the request failed. **The composer is released**; the content is in the message list
 *   marked `failed`, where the user retries it.
 */
export type MessageComposerSubmitResult = 'sent' | 'nothing-to-send' | 'failed';

export type MessageComposerState = {
  id: string;
  draftId: string | null;
  pollId: string | null;
  quotedMessage: LocalMessage | null;
  showReplyInChannel: boolean;
  /** Baseline of the message being edited, unchanged during the session (for restore or cancel). */
  editedMessage: LocalMessage | null;
  /** The scheduled message being edited; its edit is saved with `updateScheduledMessage()`. */
  editedScheduledMessage: ScheduledMessageResponse | null;
  /** The failed scheduled message loaded to be scheduled or sent again. */
  failedScheduledMessage: ScheduledMessageResponse | null;
};

type ScheduledMessageCompositionState = Pick<
  MessageComposerState,
  'editedScheduledMessage' | 'failedScheduledMessage'
>;

export type MessageComposerInitStateOptions = {
  composition?: DraftResponse | MessageResponse | LocalMessage;
  stateOverrides?: Partial<MessageComposerState>;
};

export type MessageComposerComposeOptions = {
  sendOptions?: SendMessageOptions;
};

/**
 * Outcome of `schedule()` and `updateScheduledMessage()`. Unlike `send()`, a failure keeps the
 * composition: a scheduled message has no list item that could hold the content.
 * - `scheduled`: the server stored the scheduled message (in `scheduledMessage`).
 * - `sent`: the server judged the time past and sent the message right away.
 * - `nothing-to-send`: nothing to compose, a middleware discarded it, or the composition changed
 *   while uploads were settling.
 * - `blocked`: the composition holds a command, poll or location, which can't be scheduled.
 * - `failed`: the request failed (in `error`), reported through `client.notifications`.
 */
export type ScheduledMessageSubmitResult = {
  status: 'scheduled' | 'sent' | 'nothing-to-send' | 'blocked' | 'failed';
  error?: unknown;
  scheduledMessage?: ScheduledMessageResponse;
};

export type MessageComposerOptions = {
  client: StreamChat;
  // A channel, a thread, or a local message (edit flow).
  compositionContext: CompositionContext;
  // Initial state: a draft or the message being edited.
  composition?: DraftResponse | MessageResponse | LocalMessage;
  config?: DeepPartial<MessageComposerConfig>;
};

const compositionIsDraftResponse = (composition: unknown): composition is DraftResponse =>
  !!(composition as { message?: DraftMessage })?.message;

const initEditingAuditState = (
  composition?: DraftResponse | MessageResponse | LocalMessage,
): EditingAuditState => {
  let draftUpdate = null;
  let stateUpdate = nowNs();
  if (compositionIsDraftResponse(composition)) {
    stateUpdate = draftUpdate = composition.created_at;
  } else if (composition && isLocalMessage(composition)) {
    stateUpdate = composition.updated_at;
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
      editedMessage: null,
      editedScheduledMessage: null,
      failedScheduledMessage: null,
    };
  }

  const quotedMessage = composition.quoted_message;
  const editedMessage = compositionIsDraftResponse(composition)
    ? null
    : formatMessage(composition);
  let message;
  let draftId = null;
  let id = MessageComposer.generateId(); // a draft ID is not the message ID
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
    quotedMessage: quotedMessage ? formatMessage(quotedMessage) : null,
    showReplyInChannel: false,
    editedMessage,
    editedScheduledMessage: null,
    failedScheduledMessage: null,
  };
};

const logger = chatLoggerSystem.getLogger('message-composer');
const offlineDbLogger = chatLoggerSystem.getLogger('offline-db');

export class MessageComposer extends WithSubscriptions {
  readonly channel: Channel;
  readonly state: StateStore<MessageComposerState>;
  readonly editingAuditState: StateStore<EditingAuditState>;

  get configState(): StateStore<MessageComposerConfig> {
    return this.configController.state;
  }
  readonly compositionContext: CompositionContext;
  readonly compositionMiddlewareExecutor: MessageComposerMiddlewareExecutor;
  readonly draftCompositionMiddlewareExecutor: MessageDraftComposerMiddlewareExecutor;

  attachmentManager: AttachmentManager;
  linkPreviewsManager: LinkPreviewsManager;
  textComposer: TextComposer;
  pollComposer: PollComposer;
  locationComposer: LocationComposer;
  customDataManager: CustomDataManager;
  private snapshots: MessageComposerSnapshot[] = [];
  private restoreAfterScheduledMessageEdit: ScheduledMessageEditRestore | null = null;
  private scheduleCommandSearchSource: CommandSearchSource | undefined;
  private effectHandlers: MessageComposerEffectHandlers;
  private readonly configController: ConfigController<
    MessageComposerConfig,
    DeepPartial<MessageComposerConfig>
  >;
  // todo: mediaRecorder: MediaRecorderController;

  constructor({
    composition,
    config,
    compositionContext,
    client,
  }: MessageComposerOptions) {
    super();

    this.compositionContext = compositionContext;

    if (compositionContext instanceof Channel) {
      this.channel = compositionContext;
    } else if (compositionContext instanceof Thread) {
      this.channel = compositionContext.channel;
    } else if (compositionContext.cid) {
      const [type, id] = compositionContext.cid.split(':');
      this.channel = client.channelManager.ensure({ type, id });
    } else {
      throw new Error(
        'MessageComposer requires composition context pointing to channel (channel or context.cid)',
      );
    }

    this.configController = new ConfigController<
      MessageComposerConfig,
      DeepPartial<MessageComposerConfig>
    >({
      defaults: DEFAULT_COMPOSER_CONFIG,
      constructorOptions: config as Partial<MessageComposerConfig> | undefined,
      initialSlice: this.declarativeConfig as Partial<MessageComposerConfig> | undefined,
      mergeSlice: 'deep',
      // A stored `false` cannot say whether the client or the server turned a feature off.
      retainPatches: true,
      applyAuthority: (requested) =>
        deepFreezeConfig(
          mergeServerRestrictions(
            requested,
            this.serverRestrictionsFor(requested),
            this.serverUpperBounds,
          ),
        ) as MessageComposerConfig,
    });

    let message: LocalMessage | DraftMessage | undefined = undefined;
    if (compositionIsDraftResponse(composition)) {
      message = composition.message;
    } else if (composition) {
      message = formatMessage(composition);
    }

    this.attachmentManager = new AttachmentManager({ composer: this, message });
    this.linkPreviewsManager = new LinkPreviewsManager({ composer: this, message });
    this.locationComposer = new LocationComposer({ composer: this, message });
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
    this.effectHandlers = new MessageComposerEffectHandlers({ composer: this });
  }

  static evaluateContextType(compositionContext: CompositionContext) {
    if (compositionContext instanceof Channel) {
      return 'channel';
    }

    if (compositionContext instanceof Thread) {
      return 'thread';
    }

    return 'message';
  }

  static constructTag(
    compositionContext: CompositionContext,
  ): `${ReturnType<typeof MessageComposer.evaluateContextType>}_${string}` {
    return `${this.evaluateContextType(compositionContext)}_${compositionContext.id}`;
  }

  static generateId = generateUUIDv4;

  get config(): Readonly<MessageComposerConfig> {
    return this.configState.getLatestValue();
  }

  get editedMessage(): LocalMessage | undefined {
    return this.state.getLatestValue().editedMessage ?? undefined;
  }

  set editedMessage(editedMessage: LocalMessage | undefined) {
    this.state.partialNext({ editedMessage: editedMessage ?? null });
  }

  setEditedMessage = (editedMessage: LocalMessage | null | undefined) => {
    this.state.partialNext({ editedMessage: editedMessage ?? null });
    if (editedMessage) {
      this.textComposer.clearCommand();
    }
  };

  get editedScheduledMessage(): ScheduledMessageResponse | undefined {
    return this.state.getLatestValue().editedScheduledMessage ?? undefined;
  }

  get failedScheduledMessage(): ScheduledMessageResponse | undefined {
    return this.state.getLatestValue().failedScheduledMessage ?? undefined;
  }

  /**
   * Why the current composition can't be scheduled: an active command, a poll or a shared
   * location. `undefined` when it can be.
   */
  get scheduleBlockReason(): ScheduledMessageBlockReason | undefined {
    this.scheduleCommandSearchSource ??= new CommandSearchSource(this.channel);

    return getScheduleBlockReason(this, this.scheduleCommandSearchSource);
  }

  private get hasEditInProgress() {
    return !!this.editedMessage || !!this.editedScheduledMessage;
  }

  private get scheduledMessageInComposer() {
    return this.editedScheduledMessage ?? this.failedScheduledMessage;
  }

  private get pausesDrafts() {
    return this.hasEditInProgress || !!this.failedScheduledMessage;
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

  getCommandDisabledReason = (
    command: Command,
  ): CommandSuggestionDisabledReason | undefined => {
    if (this.hasEditInProgress) return 'editing';

    if (
      this.quotedMessage &&
      (command.set === 'moderation_set' || command.name === 'moderation_set')
    ) {
      return 'quoted_message';
    }

    return undefined;
  };

  isCommandDisabled = (command: Command) => !!this.getCommandDisabledReason(command);

  validateCommandSendability = (
    command: Command,
    text = this.textComposer.text,
  ): CommandSendability => {
    const currentMentionedUsers = this.textComposer.mentionedUsers;
    const mentionedUsersInText = getMentionedUsersInText(text, currentMentionedUsers);

    const validationContext = {
      command,
      commandArgsText: command.name
        ? stripCommandFromText(text, command.name).trim()
        : text.trim(),
      composer: this,
      mentionedUsersInText,
      rawText: text,
    };

    const result = this.config.commands.sendValidator(validationContext);
    if (result && !result.ready) {
      return result;
    }

    return { command, ready: true };
  };

  get isCommandSendable() {
    const currentCommand = this.textComposer.command;
    return !currentCommand || this.validateCommandSendability(currentCommand).ready;
  }

  /** See {@link AttachmentManagerConfig.pendingUploadsEnabled}. */
  get allowsPendingUploads() {
    return this.attachmentManager.config.pendingUploadsEnabled;
  }

  /**
   * The thread when this composer belongs to one, else the channel. An edit composer finds its thread
   * only if `client.threads` has it registered (listed or active).
   */
  get defaultSubmitTarget(): Channel | Thread {
    if (this.compositionContext instanceof Thread) return this.compositionContext;

    const { threadId } = this;
    return (threadId && this.client.threads.get(threadId)) || this.channel;
  }

  /**
   * See {@link MessageComposerConfig.retainCompositionOnSubmit}. The attachments composition step reads
   * it too, so retained content is not also sent on the message.
   */
  get retainsCompositionOnSubmit() {
    return this.config.retainCompositionOnSubmit(this);
  }

  get hasSendableData() {
    if (!this.isCommandSendable) return false;

    if (this.allowsPendingUploads) {
      // Uploads in flight do not block: besides finished uploads and attachments with nothing to
      // upload, uploads that can still resolve count as content (awaited or retried on send).
      // `blocked` ones do not.
      const hasAttachmentContent = this.attachmentManager.attachments.some(
        (attachment) =>
          isSendableAttachment(attachment) || isResolvableUpload(attachment),
      );

      return !!(
        !this.textComposer.textIsEmpty ||
        this.textComposer.activeCommandIsContent ||
        hasAttachmentContent ||
        this.pollId ||
        this.locationComposer.validLocation
      );
    }

    return !!(
      (!this.attachmentManager.uploadsInProgressCount &&
        (!this.textComposer.textIsEmpty ||
          this.textComposer.activeCommandIsContent ||
          this.attachmentManager.attachments.some(isSendableAttachment))) ||
      this.pollId ||
      !!this.locationComposer.validLocation
    );
  }

  get compositionIsEmpty() {
    return !this.quotedMessage && this.contentIsEmpty;
  }

  get contentIsEmpty() {
    return (
      this.textComposer.textIsEmpty &&
      !this.textComposer.activeCommandIsContent &&
      !this.attachmentManager.attachments.length &&
      !this.pollId &&
      !this.locationComposer.validLocation
    );
  }

  get lastChangeOriginIsLocal() {
    const initiatedWithoutDraft = this.lastChange.draftUpdate === null;
    const composingMessageFromScratch = initiatedWithoutDraft && !this.editedMessage;

    // Does not imply the edited message differs from the current state.
    const editedMessageWasUpdated =
      this.editedMessage?.updated_at != null &&
      this.editedMessage.updated_at < this.lastChange.stateUpdate;

    const draftWasChanged =
      !!this.lastChange.draftUpdate &&
      this.lastChange.draftUpdate < this.lastChange.stateUpdate;

    return editedMessageWasUpdated || draftWasChanged || composingMessageFromScratch;
  }

  /** The patch is retained, so it survives later re-resolutions (e.g. a server change). */
  updateConfig(config: DeepPartial<MessageComposerConfig>) {
    this.configController.patch(config as Partial<MessageComposerConfig>);
  }

  /** The config as requested, before server restrictions (`docs/instance-configuration.md` §3). */
  get requestedConfig(): Readonly<MessageComposerConfig> {
    return this.configController.requested;
  }

  /** The declarative slice for this composer, re-read live so a change is picked up. */
  private get declarativeConfig(): DeepPartial<MessageComposerConfig> {
    return (this.client.config.getConfig('messageComposer') ??
      {}) as DeepPartial<MessageComposerConfig>;
  }

  /**
   * Server-side gates from the channel config, re-read on every call. Each is a boolean that
   * `mergeServerRestrictions` ANDs with the request. `commands` is absent (the server sends a list,
   * not a gate).
   */
  private serverRestrictionsFor(
    requested: MessageComposerConfig,
  ): ServerRestrictions<MessageComposerConfig> {
    const channelConfig = this.channel.serverConfig;

    return {
      // `uploads` governs Stream's upload endpoint, so it does not apply with `customCdn`. `undefined`
      // leaves the request standing.
      attachments: {
        enabled: requested.attachments.customCdn ? undefined : channelConfig?.uploads,
      },
      linkPreviews: { enabled: channelConfig?.url_enrichment },
      location: { enabled: channelConfig?.shared_locations },
      polls: { enabled: channelConfig?.polls },
    };
  }

  /** `max_message_length` caps both length limits: a smaller requested value wins, unset inherits it. */
  private get serverUpperBounds(): ServerUpperBounds<MessageComposerConfig> {
    const maxMessageLength = this.channel.serverConfig?.max_message_length;

    return {
      text: { maxLengthOnEdit: maxMessageLength, maxLengthOnSend: maxMessageLength },
    };
  }

  // The controller skips the publish when the resolved config is deep-equal to the last one.
  private publishConfig = () => {
    this.configController.rederive(this.declarativeConfig);
  };

  /**
   * Rebuilds the configuration from its inputs and **discards every {@link updateConfig} patch**,
   * including those from sub-composer setters. To re-resolve and keep them, use
   * {@link applyServerRestrictions}.
   */
  initializeConfig = () => {
    this.configController.initialize(this.declarativeConfig);
  };

  /**
   * Re-resolves the configuration against the channel's current server-side restrictions, keeping
   * `updateConfig` patches. `Channel.query` calls it for composers without registered subscriptions.
   *
   * @internal
   */
  applyServerRestrictions = () => {
    this.publishConfig();
  };

  refreshId = () => {
    this.state.partialNext({ id: MessageComposer.generateId() });
  };

  initState = ({ composition, stateOverrides }: MessageComposerInitStateOptions = {}) => {
    this.clearSnapshots();
    this.editingAuditState.partialNext(this.initEditingAuditState(composition));

    const message: LocalMessage | DraftMessage | undefined =
      typeof composition === 'undefined'
        ? composition
        : compositionIsDraftResponse(composition)
          ? composition.message
          : formatMessage(composition);
    this.attachmentManager.initState({ message });
    this.linkPreviewsManager.initState({ message });
    this.locationComposer.initState({ message });
    this.textComposer.initState({ message });
    this.pollComposer.initState();
    this.customDataManager.initState({ message });
    this.state.next({ ...initState(composition), ...stateOverrides });
  };

  initStateFromChannelResponse = (channelApiResponse: ChannelStateResponseFields) => {
    if (this.channel.cid !== channelApiResponse.channel?.cid) {
      return;
    }
    const { draft } = channelApiResponse;
    if (this.scheduledMessageInComposer) {
      if (draft) {
        this.restoreAfterScheduledMessageEdit = () =>
          this.initState({ composition: draft });
      }
      return;
    }
    if (draft) {
      this.initState({ composition: draft });
    } else if (this.state.getLatestValue().draftId) {
      this.clear();
      this.client.offlineDb?.executeQuerySafely(
        (db) =>
          db.deleteDraft({
            cid: this.channel.cid,
            parent_id: undefined, // keeps thread drafts when upserting channels
          }),
        { method: 'deleteDraft' },
      );
    }
  };

  initEditingAuditState = (
    composition?: DraftResponse | MessageResponse | LocalMessage,
  ) => initEditingAuditState(composition);

  clearSnapshots = () => {
    this.snapshots = [];
  };

  getSnapshot = (): MessageComposerSnapshot => ({
    attachmentManager: this.attachmentManager.getSnapshot(),
    customDataManager: this.customDataManager.getSnapshot(),
    linkPreviewsManager: this.linkPreviewsManager.getSnapshot(),
    locationComposer: this.locationComposer.getSnapshot(),
    pollComposer: this.pollComposer.getSnapshot(),
    textComposer: this.textComposer.getSnapshot(),
  });

  restoreSnapshot = (snapshot: MessageComposerSnapshot) => {
    this.attachmentManager.restoreSnapshot(snapshot.attachmentManager);
    this.linkPreviewsManager.restoreSnapshot(snapshot.linkPreviewsManager);
    this.locationComposer.restoreSnapshot(snapshot.locationComposer);
    this.pollComposer.restoreSnapshot(snapshot.pollComposer);
    this.customDataManager.restoreSnapshot(snapshot.customDataManager);
    this.textComposer.restoreSnapshot(snapshot.textComposer);
  };

  /**
   * Moves this composition into `target`, replacing what `target` held, and clears this composer.
   * Running uploads continue into `target` (see {@link AttachmentManager.takeOver}). Nothing is sent.
   *
   * @internal
   */
  transferTo = (target: MessageComposer) => {
    target.textComposer.takeOver(this.textComposer);
    target.attachmentManager.takeOver(this.attachmentManager);
    target.linkPreviewsManager.takeOver(this.linkPreviewsManager);
    target.locationComposer.takeOver(this.locationComposer);
    target.pollComposer.takeOver(this.pollComposer);
    target.customDataManager.takeOver(this.customDataManager);
    const { pollId, quotedMessage, showReplyInChannel } = this.state.getLatestValue();
    target.state.partialNext({ pollId, quotedMessage, showReplyInChannel });
    this.clear();
  };

  captureSnapshot = (snapshot = this.getSnapshot()) => {
    if (this.snapshots.length) return;
    this.snapshots.push(snapshot);
  };

  popSnapshot = () => this.snapshots.pop();

  registerEffectHandler = <T extends { type: string }>(
    type: T['type'],
    handler: MessageComposerEffectHandler<T>,
  ): void => {
    this.effectHandlers.registerEffectHandler(type, handler);
  };

  applyEffects = <T extends { type: string }>(effects: T[] = []) => {
    this.effectHandlers.applyEffects(effects);
  };

  private logStateUpdateTimestamp() {
    this.editingAuditState.partialNext({
      lastChange: { ...this.lastChange, stateUpdate: nowNs() },
    });
  }

  private logDraftUpdateTimestamp() {
    if (!this.config.drafts.enabled) return;
    const timestamp = nowNs();
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
      this.addUnsubscribeFunction(this.subscribeChannelConfigChanged());
      this.addUnsubscribeFunction(this.subscribeMessageUpdated());
      this.addUnsubscribeFunction(this.subscribeMessageDeleted());
      this.addUnsubscribeFunction(this.subscribeScheduledMessageEvents());

      this.addUnsubscribeFunction(this.subscribeTextComposerStateChanged());
      this.addUnsubscribeFunction(this.subscribeAttachmentManagerStateChanged());
      this.addUnsubscribeFunction(this.subscribeLinkPreviewsManagerStateChanged());
      this.addUnsubscribeFunction(this.subscribeLocationComposerStateChanged());
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
    const eventTypes = [
      'message.updated',
      'reaction.new',
      'reaction.deleted', // todo: do we need to subscribe to this especially when the whole state is overriden?
      'reaction.updated', // todo: do we need to subscribe to this especially when the whole state is overriden?
    ] satisfies EventType[];

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

  private refreshEditedScheduledMessage = ({
    scheduled_message: incoming,
  }: {
    scheduled_message?: ScheduledMessageResponse;
  }) => {
    const { editedScheduledMessage } = this;

    if (!incoming || incoming.id !== editedScheduledMessage?.id) return;

    if (incoming.updated_at < editedScheduledMessage.updated_at) return;

    this.state.partialNext({ editedScheduledMessage: incoming });
  };

  private endWhenScheduledMessageEnds = ({
    scheduled_message: incoming,
    type,
  }: {
    scheduled_message?: ScheduledMessageResponse;
    type: ScheduledMessageEndEventType;
  }) => {
    const { failedScheduledMessage, scheduledMessageInComposer } = this;
    const reason = END_REASON_BY_SCHEDULED_MESSAGE_EVENT[type];

    if (!incoming || incoming.id !== scheduledMessageInComposer?.id) return;

    const isFailedMessageStillThere =
      !!failedScheduledMessage && reason !== ScheduledMessageCompositionEndReason.Deleted;

    if (isFailedMessageStillThere) return;

    this.endScheduledMessageComposition();
    this.client.notifications.addWarning({
      message: 'The scheduled message can no longer be edited',
      origin: {
        emitter: 'MessageComposer',
        context: { composer: this },
      },
      options: {
        type: CORE_NOTIFICATION_TYPE.scheduledMessageCompositionEnded,
        metadata: { reason },
      },
    });
  };

  private subscribeScheduledMessageEvents = () => {
    const endEventTypes = Object.keys(
      END_REASON_BY_SCHEDULED_MESSAGE_EVENT,
    ) as ScheduledMessageEndEventType[];

    const subscriptions = [
      this.client.on(
        ScheduledMessageEventType.Updated,
        this.refreshEditedScheduledMessage,
      ),
      ...endEventTypes.map((eventType) =>
        this.client.on(eventType, this.endWhenScheduledMessageEnds),
      ),
    ];

    return () => subscriptions.forEach(({ unsubscribe }) => unsubscribe());
  };

  private subscribeMessageComposerSetupStateChange = () =>
    applyInstanceConfiguration({
      args: { composer: this },
      config: this.client.config,
      key: 'messageComposer',
      // Re-resolve: copying the slice through `updateConfig` would make it an imperative patch.
      applyConfig: () => this.publishConfig(),
      reinitializeConfig: this.initializeConfig,
    });

  // The channel's server config lands on `query`/`watch`, possibly after construction: re-resolve then.
  // Selected by cid: the config is per channel.
  private subscribeChannelConfigChanged = () =>
    this.client.channelServerConfigsStore.subscribeWithSelector(
      ({ configs }) => ({ channelConfig: configs[this.channel.cid] }),
      () => this.applyServerRestrictions(),
    );

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
      if (this.scheduledMessageInComposer) {
        this.restoreAfterScheduledMessageEdit = () =>
          this.initState({ composition: draft });
        return;
      }
      if (this.editedMessage) return;
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
      if (this.scheduledMessageInComposer) {
        this.restoreAfterScheduledMessageEdit = this.clear;
        return;
      }
      if (this.editedMessage) return;

      this.logDraftUpdateTimestamp();

      if (this.compositionIsEmpty) {
        return;
      }

      this.clear();
    }).unsubscribe;

  // The command is selected too: an active command that takes no arguments is content, so clearing
  // one can empty the composition without changing the text.
  private subscribeTextComposerStateChanged = () =>
    this.textComposer.state.subscribeWithSelector(
      ({ command, text }) => [text, command] as const,
      ([currentText], previousSelection) => {
        // Skip the initial subscription call.
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

  private subscribeLocationComposerStateChanged = () =>
    this.locationComposer.state.subscribe((_, previousValue) => {
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
    const activeCommand = this.textComposer.command;
    if (quotedMessage && activeCommand && this.isCommandDisabled(activeCommand)) {
      this.textComposer.clearCommand();
    }
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

  compose = async ({ sendOptions = {} }: MessageComposerComposeOptions = {}): Promise<
    MessageComposerMiddlewareValue['state'] | undefined
  > => {
    const created_at = this.editedMessage?.created_at ?? nowNs();

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
          attachments: [] as Attachment[],
          cid: this.channel.cid, // needed to match local paginator filters
          created_at, // only on `localMessage`, for the optimistic update
          deleted_at: undefined,
          error: undefined,
          id: this.id,
          mentioned_users: [] as UserResponse[],
          parent_id: this.threadId ?? undefined,
          pinned_at: this.editedMessage?.pinned_at ?? undefined,
          reaction_groups: undefined,
          status: this.editedMessage ? this.editedMessage.status : 'sending',
          text,
          type: 'regular',
          updated_at: created_at,
        } as LocalMessage,
        sendOptions,
      },
    });

    if (result.status === 'discard') return;

    return result.state;
  };

  composeDraft = async () => {
    const { state, status } = await this.draftCompositionMiddlewareExecutor.execute({
      eventName: 'compose',
      initialValue: {
        draft: {
          id: this.id,
          parent_id: this.threadId ?? undefined,
          text: '',
          custom: {},
        },
      },
    });
    if (status === 'discard') return;

    return state;
  };

  createDraft = async () => {
    // Server drafts live on the thread or channel, not on a message, so none for an edit. Nor for a
    // provisional channel (no ID yet).
    if (this.pausesDrafts || !this.config.drafts.enabled || this.channel.isProvisional)
      return;
    const composition = await this.composeDraft();
    if (!composition) return;
    const { draft } = composition;
    this.state.partialNext({ draftId: draft.id });
    if (this.client.offlineDb) {
      try {
        const optimisticDraftResponse = {
          channel_cid: this.channel.cid,
          created_at: nowNs(),
          message: draft as DraftMessage,
          parent_id: draft.parent_id,
          quoted_message: this.quotedMessage ?? undefined,
        };
        await this.client.offlineDb.upsertDraft({ draft: optimisticDraftResponse });
      } catch (error) {
        offlineDbLogger
          .withExtraTags('createDraft', this.channel.cid)
          .error('Upserting the draft to the offline database failed.', { error });
      }
    }
    this.logDraftUpdateTimestamp();
    await this.channel.createDraft({ message: draft });
  };

  deleteDraft = async () => {
    if (
      this.pausesDrafts ||
      !this.config.drafts.enabled ||
      !this.draftId ||
      this.channel.isProvisional
    )
      return;
    this.state.partialNext({ draftId: null }); // todo: should we clear the whole state?
    const parentId = this.threadId ?? undefined;
    if (this.client.offlineDb) {
      try {
        await this.client.offlineDb.deleteDraft({
          cid: this.channel.cid,
          parent_id: parentId,
        });
      } catch (error) {
        offlineDbLogger
          .withExtraTags('deleteDraft', this.channel.cid)
          .error('Deleting the draft from the offline database failed.', { error });
      }
    }
    this.logDraftUpdateTimestamp();
    await this.channel.deleteDraft({ parent_id: parentId });
  };

  getDraft = async () => {
    if (this.pausesDrafts || !this.config.drafts.enabled || !this.client.userId) return;

    const draftFromOfflineDB = await this.client.offlineDb?.getDraft({
      cid: this.channel.cid,
      userId: this.client.userId,
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
      logger
        .withExtraTags('getDraft', this.channel.cid)
        .error('Retrieving the draft from the server failed.', { error });
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
          type: CORE_NOTIFICATION_TYPE.pollCreateFailed,
          metadata: {
            reason: (error as Error).message,
          },
          originalError: error instanceof Error ? error : undefined,
        },
      });
      throw error;
    }
  };

  /** Clears the composer, or only detaches the poll when `retainsCompositionOnSubmit`. */
  private releaseSubmittedComposition = () => {
    if (this.retainsCompositionOnSubmit) {
      this.state.partialNext({
        id: MessageComposer.generateId(),
        // Always detached: a set `pollId` is copied onto every composition, so it just went out. Left
        // set, `createPollOnlyCompositionMiddleware` would turn the next message into the same poll.
        pollId: null,
      });
      return;
    }

    this.clear();
  };

  private reportSubmitFailure = (
    type: CoreNotificationType,
    message: string,
    error: unknown,
  ) => {
    this.client.notifications.addError({
      message,
      origin: {
        emitter: 'MessageComposer',
        context: { composer: this },
      },
      options: {
        type,
        metadata: { reason: (error as Error).message },
        originalError: error instanceof Error ? error : undefined,
      },
    });
  };

  /**
   * Composes and sends the message. Never rejects: see {@link MessageComposerSubmitResult}. A failure is
   * reported through `client.notifications`.
   */
  send = async (): Promise<MessageComposerSubmitResult> => {
    const composition = await this.compose();
    if (!composition?.message) return 'nothing-to-send';

    const { localMessage, message, sendOptions } = composition;
    const { failedScheduledMessage } = this;

    // Released before the request, so the user's next keystrokes cannot race the clear. A failed
    // scheduled message sent now brings back what the composer held before it was loaded.
    if (failedScheduledMessage) {
      this.endScheduledMessageComposition();
    } else {
      this.releaseSubmittedComposition();
    }

    try {
      await this.defaultSubmitTarget.messageOperations.send({
        localMessage,
        message,
        options: sendOptions,
      });
      if (failedScheduledMessage)
        this.removeFailedScheduledMessage(failedScheduledMessage);
      return 'sent';
    } catch (error) {
      // Nothing is restored: the failed message in the list owns the content and its upload IDs.
      this.reportSubmitFailure(
        CORE_NOTIFICATION_TYPE.messageSendFailed,
        'Send message request failed',
        error,
      );
      return 'failed';
    }
  };

  /** Composes and saves the edit, on the same terms as {@link send}. */
  update = async (): Promise<MessageComposerSubmitResult> => {
    const composition = await this.compose();
    if (!composition?.message) return 'nothing-to-send';

    const { localMessage, sendOptions } = composition;

    this.releaseSubmittedComposition();

    try {
      await this.defaultSubmitTarget.messageOperations.update({
        localMessage,
        options: sendOptions,
      });
      return 'sent';
    } catch (error) {
      // As in `send`: nothing is restored.
      this.reportSubmitFailure(
        CORE_NOTIFICATION_TYPE.messageUpdateFailed,
        'Edit message request failed',
        error,
      );
      return 'failed';
    }
  };

  sendLocation = async () => {
    const location = this.locationComposer.validLocation;
    if (this.threadId || !location) return;
    try {
      await this.channel.sendSharedLocation(location);
      this.refreshId();
      this.locationComposer.initState();
    } catch (error) {
      this.client.notifications.addError({
        message: 'Failed to share the location',
        origin: {
          emitter: 'MessageComposer',
          context: { composer: this },
        },
        options: {
          type: CORE_NOTIFICATION_TYPE.locationCreateFailed,
          metadata: {
            reason: (error as Error).message,
          },
          originalError: error instanceof Error ? error : undefined,
        },
      });
      throw error;
    }
  };

  private waitForUploadsInProgress = () => {
    const { attachmentManager } = this;

    if (!this.allowsPendingUploads || !attachmentManager.uploadsInProgressCount) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const unsubscribe = attachmentManager.state.subscribe(() => {
        if (attachmentManager.uploadsInProgressCount) return;

        unsubscribe();
        resolve();
      });
    });
  };

  private endScheduledMessageComposition = () => {
    const restore = this.restoreAfterScheduledMessageEdit ?? this.clear;

    this.restoreAfterScheduledMessageEdit = null;
    this.state.partialNext({
      editedScheduledMessage: null,
      failedScheduledMessage: null,
    });

    restore();
  };

  private saveCompositionBeforeScheduledMessage = () => {
    if (this.scheduledMessageInComposer) return;

    const snapshot = this.getSnapshot();
    const state = this.state.getLatestValue();

    this.restoreAfterScheduledMessageEdit = () => {
      this.restoreSnapshot(snapshot);
      this.state.next({
        ...state,
        editedScheduledMessage: null,
        failedScheduledMessage: null,
      });
    };
  };

  private fillFromScheduledMessage = async (
    scheduledMessage: ScheduledMessageResponse,
    scheduledMessageState: ScheduledMessageCompositionState,
  ) => {
    const { message } = scheduledMessage;
    const {
      mentioned_users: mentionedUserIds,
      quoted_message_id: quotedMessageId,
      show_in_channel: showReplyInChannel = false,
    } = message;

    const [mentionedUsers, quotedMessage] = await Promise.all([
      resolveMentionedUsers(this.client, mentionedUserIds),
      resolveQuotedMessage(this.channel, quotedMessageId),
    ]);

    this.saveCompositionBeforeScheduledMessage();

    this.initState({
      composition: toScheduledMessageComposition(scheduledMessage),
      stateOverrides: {
        ...scheduledMessageState,
        draftId: null,
        quotedMessage,
        showReplyInChannel,
      },
    });
    this.textComposer.setMentionedUsers(mentionedUsers);
  };

  private removeFailedScheduledMessage = (
    failedScheduledMessage: ScheduledMessageResponse,
  ) => {
    this.client.scheduledMessages
      .deleteScheduledMessage(failedScheduledMessage.id)
      .catch((error) =>
        logger
          .withExtraTags('removeFailedScheduledMessage', this.channel.cid)
          .error('Deleting the failed scheduled message failed.', { error }),
      );
  };

  /**
   * Schedules the composition to be sent at `scheduledAt`. Never rejects: see
   * {@link ScheduledMessageSubmitResult}. A scheduled message never enters the message list; the
   * server returns it and `client.scheduledMessages` stores it.
   *
   * @param scheduledAt - When the server should send the message.
   */
  schedule = async (scheduledAt: Date): Promise<ScheduledMessageSubmitResult> => {
    if (this.hasEditInProgress) return { status: 'nothing-to-send' };

    if (this.scheduleBlockReason) {
      await this.compose({ sendOptions: { scheduled_at: scheduledAt } });
      return { status: 'blocked' };
    }

    const { failedScheduledMessage } = this;

    await this.waitForUploadsInProgress();

    const compositionChanged =
      this.hasEditInProgress || this.failedScheduledMessage !== failedScheduledMessage;

    if (compositionChanged) return { status: 'nothing-to-send' };

    if (this.attachmentManager.failedUploadsCount) {
      const error = new Error('Some attachments failed to upload');
      this.reportSubmitFailure(
        CORE_NOTIFICATION_TYPE.scheduledMessageCreateFailed,
        'Failed to schedule the message',
        error,
      );
      return { error, status: 'failed' };
    }

    const composition = await this.compose({
      sendOptions: { scheduled_at: scheduledAt },
    });

    if (!composition?.message) return { status: 'nothing-to-send' };

    const { message, sendOptions } = composition;

    try {
      const { scheduled_message: scheduledMessage } =
        await this.client.scheduledMessages.scheduleMessage(this.channel, {
          ...sendOptions,
          message,
        });

      if (failedScheduledMessage) {
        this.endScheduledMessageComposition();
        this.removeFailedScheduledMessage(failedScheduledMessage);
      } else {
        this.clear();
      }

      return scheduledMessage
        ? { scheduledMessage, status: 'scheduled' }
        : { status: 'sent' };
    } catch (error) {
      this.reportSubmitFailure(
        CORE_NOTIFICATION_TYPE.scheduledMessageCreateFailed,
        'Failed to schedule the message',
        error,
      );
      return { error, status: 'failed' };
    }
  };

  /** Loads a scheduled message into the composer to edit it. Saved with `updateScheduledMessage()`. */
  editScheduledMessage = (scheduledMessage: ScheduledMessageResponse) =>
    this.fillFromScheduledMessage(scheduledMessage, {
      editedScheduledMessage: scheduledMessage,
      failedScheduledMessage: null,
    });

  /**
   * Loads a failed scheduled message into the composer so it can be scheduled or sent again. Either
   * way the failed message is deleted once the new one goes out.
   */
  rescheduleFailedMessage = async (failedMessage: ScheduledMessageResponse) => {
    if (failedMessage.status !== SCHEDULED_MESSAGE_STATUS.Failed) return;

    await this.fillFromScheduledMessage(failedMessage, {
      editedScheduledMessage: null,
      failedScheduledMessage: failedMessage,
    });
  };

  cancelRescheduleFailedMessage = () => {
    if (!this.failedScheduledMessage) return;

    this.endScheduledMessageComposition();
  };

  /** Saves the edit of the scheduled message, on the same terms as {@link schedule}. */
  updateScheduledMessage = async (): Promise<ScheduledMessageSubmitResult> => {
    const { editedScheduledMessage } = this;

    if (!editedScheduledMessage) return { status: 'nothing-to-send' };

    if (this.scheduleBlockReason) {
      await this.compose();
      return { status: 'blocked' };
    }

    const composition = await this.compose();

    if (!composition?.message) return { status: 'nothing-to-send' };

    const message = toScheduledMessagePayload(
      composition.message,
      editedScheduledMessage,
    );

    try {
      const scheduledMessage = await this.client.scheduledMessages.updateScheduledMessage(
        editedScheduledMessage.id,
        { message },
      );

      this.endScheduledMessageComposition();

      return { scheduledMessage, status: 'scheduled' };
    } catch (error) {
      this.reportSubmitFailure(
        CORE_NOTIFICATION_TYPE.scheduledMessageUpdateFailed,
        'Failed to update the scheduled message',
        error,
      );
      return { error, status: 'failed' };
    }
  };

  cancelEditScheduledMessage = () => {
    if (!this.editedScheduledMessage) return;

    this.endScheduledMessageComposition();
  };
}
