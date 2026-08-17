import { AttachmentManager } from './attachmentManager';
import { CustomDataManager } from './CustomDataManager';
import { LinkPreviewsManager } from './linkPreviewsManager';
import { LocationComposer } from './LocationComposer';
import { MessageComposerEffectHandlers } from './MessageComposerEffectHandlers';
import { PollComposer } from './pollComposer';
import { TextComposer } from './textComposer';
import { applyCommandValidatorOverride, DEFAULT_COMPOSER_CONFIG } from './configuration';
import type { MessageComposerMiddlewareValue } from './middleware';
import {
  MessageComposerMiddlewareExecutor,
  MessageDraftComposerMiddlewareExecutor,
} from './middleware';
import type { Unsubscribe } from '../store';
import { StateStore } from '../store';
import { formatMessage, generateUUIDv4, isLocalMessage } from '../utils';
import { mergeWith } from '../utils/mergeWith';
import { isEqual } from '../utils/mergeWith/mergeWithCore';
import { copyConfigPatch } from '../utils/copyConfigPatch';
import { deepFreezeConfig } from '../utils/deepFreezeConfig';
import { mergeServerRestrictions } from '../configuration/serverAuthority';
import type {
  ServerRestrictions,
  ServerUpperBounds,
} from '../configuration/serverAuthority';
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
  UserResponse,
} from '../types';
import { chatLoggerSystem } from '../logger';
import { applyInstanceConfiguration } from '../configuration/applyInstanceConfiguration';
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

type UnregisterSubscriptions = Unsubscribe;

export type LastComposerChange = { draftUpdate: number | null; stateUpdate: number };

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

export type LocalMessageWithLegacyThreadId = LocalMessage & { legacyThreadId?: string };
// todo: remove LocalMessageWithLegacyThreadId
export type CompositionContext = Channel | Thread | LocalMessageWithLegacyThreadId;

export type MessageComposerState = {
  id: string;
  draftId: string | null;
  pollId: string | null;
  quotedMessage: LocalMessage | null;
  showReplyInChannel: boolean;
  /**
   * Baseline snapshot of the message being edited (if any).
   * This is intentionally immutable with respect to the editing session and can be used for restore/cancel.
   */
  editedMessage: LocalMessage | null;
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
      editedMessage: null,
    };
  }

  const quotedMessage = composition.quoted_message;
  const editedMessage = compositionIsDraftResponse(composition)
    ? null
    : formatMessage(composition);
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
    quotedMessage: quotedMessage ? formatMessage(quotedMessage) : null,
    showReplyInChannel: false,
    editedMessage,
  };
};

const logger = chatLoggerSystem.getLogger('message-composer');
const offlineDbLogger = chatLoggerSystem.getLogger('offline-db');

export class MessageComposer extends WithSubscriptions {
  readonly channel: Channel;
  readonly state: StateStore<MessageComposerState>;
  readonly editingAuditState: StateStore<EditingAuditState>;
  readonly configState: StateStore<MessageComposerConfig>;
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
  private effectHandlers: MessageComposerEffectHandlers;
  /**
   * Configuration passed to this composer's constructor, kept so {@link initializeConfig} can
   * reproduce the constructor's derivation rather than restoring a snapshot of its result.
   *
   * Copied on the way in — it is read on *every* resolution, for the composer's whole life, so holding
   * the caller's object would let a later mutation of it change resolved configuration silently. Same
   * boundary rule as {@link updateConfig} and `InstanceConfigurationService.setConfig`.
   */
  private readonly explicitConfig?: DeepPartial<MessageComposerConfig>;
  /**
   * Every {@link updateConfig} patch so far, merged in the order they arrived.
   *
   * Stages 4 and 5 of the resolution order both arrive through `updateConfig`, so this one layer holds a
   * setup function's work and a caller's own changes alike — they are equally "asked for", and both have
   * to outlive a re-resolution. Cleared by {@link initializeConfig}, which is what a reset means.
   */
  private imperativeConfig: DeepPartial<MessageComposerConfig> = {};
  // todo: mediaRecorder: MediaRecorderController;

  constructor({
    composition,
    config,
    compositionContext,
    client,
  }: MessageComposerOptions) {
    super();

    this.compositionContext = compositionContext;

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

    this.explicitConfig = config && copyConfigPatch(config);
    this.configState = new StateStore<MessageComposerConfig>(this.resolvedConfig);

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

  static generateId = generateUUIDv4;

  /**
   * The current resolved configuration.
   *
   * `Readonly` for the same reason every other configurable class's getter is: the value is the store's
   * live object, so assigning to a field would change state while notifying nobody. Use
   * {@link updateConfig}. `Readonly` is shallow, so nested writes are caught at runtime instead — the
   * whole resolution is deep-frozen by {@link resolvedConfig}, not only the untouched defaults.
   */
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

  getCommandDisabledReason = (
    command: Command,
  ): CommandSuggestionDisabledReason | undefined => {
    if (this.editedMessage) return 'editing';

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

  get hasSendableData() {
    return (
      this.isCommandSendable &&
      !!(
        (!this.attachmentManager.uploadsInProgressCount &&
          (!this.textComposer.textIsEmpty ||
            this.attachmentManager.successfulUploadsCount > 0)) ||
        this.pollId ||
        !!this.locationComposer.validLocation
      )
    );
  }

  get compositionIsEmpty() {
    return !this.quotedMessage && this.contentIsEmpty;
  }

  get contentIsEmpty() {
    return (
      this.textComposer.textIsEmpty &&
      !this.attachmentManager.attachments.length &&
      !this.pollId &&
      !this.locationComposer.validLocation
    );
  }

  get lastChangeOriginIsLocal() {
    const initiatedWithoutDraft = this.lastChange.draftUpdate === null;
    const composingMessageFromScratch = initiatedWithoutDraft && !this.editedMessage;

    // does not mean that the original edited message is different from the current state
    const editedMessageWasUpdated =
      !!this.editedMessage?.updated_at &&
      new Date(this.editedMessage.updated_at).getTime() < this.lastChange.stateUpdate;

    const draftWasChanged =
      !!this.lastChange.draftUpdate &&
      this.lastChange.draftUpdate < this.lastChange.stateUpdate;

    return editedMessageWasUpdated || draftWasChanged || composingMessageFromScratch;
  }

  /**
   * Records a configuration change as something *you* asked for, then republishes.
   *
   * The patch is kept — see {@link imperativeConfig} — rather than merged into the published result and
   * forgotten. That is what makes the request survive a later re-resolution, including one triggered by
   * the server changing its mind.
   */
  updateConfig(config: DeepPartial<MessageComposerConfig>) {
    // Copied at the boundary, for the same reason `InstanceConfigurationService.setConfig` does it:
    // `mergeWith` reuses a source subtree verbatim where the target has nothing, and `imperativeConfig`
    // starts empty — so without this a caller's `patch.text` was stored by reference, and a later
    // `patch.text.maxLengthOnSend = 5` changed every subsequent resolution with no notification.
    this.imperativeConfig = mergeWith(this.imperativeConfig, copyConfigPatch(config));
    this.publishConfig();
  }

  /**
   * The configuration fields this composer's channel decides server-side.
   *
   * Reading them is the composer's job rather than the shared helper's: only the composer knows that
   * `location.enabled` is gated on `shared_locations`, and only an existing composer has a channel to
   * ask. `getConfig()` is re-read on every call, so a restriction that changes mid-session is picked up
   * rather than captured once.
   */
  private get serverRestrictions(): ServerRestrictions<MessageComposerConfig> {
    return { location: { enabled: this.channel.getConfig()?.shared_locations } };
  }

  /**
   * What this composer has been **asked** for, before the server has any say — stages 1 to 5 of
   * `docs/instance-configuration.md` §3, later layers winning:
   *
   * 1. package defaults;
   * 2. the declarative tree for the `messageComposer` key, re-read live so a change is picked up;
   * 3. this composer's constructor argument;
   * 4. and 5. every patch handed to {@link updateConfig} — which is where a setup function's work and a
   *    caller's own imperative change both land, in the order they happened.
   *
   * Keeping this separate from the published configuration is what lets a restriction be *re-applied*
   * rather than *accumulated*. Applying restrictions to the previous published result made them
   * one-directional: a server `false` written into the config was indistinguishable from a client's own
   * `false`, so it either became permanent or overwrote the client's intent, depending on which way the
   * call was written (**DV-18**). Resolving from the request every time makes the operation idempotent,
   * so neither can happen.
   */
  private get requestedConfig(): MessageComposerConfig {
    const declarative = (this.client.config.getConfig('messageComposer') ??
      {}) as DeepPartial<MessageComposerConfig>;
    const layers: DeepPartial<MessageComposerConfig>[] = [
      declarative,
      this.explicitConfig ?? {},
      this.imperativeConfig,
    ];

    const requested = layers.reduce<MessageComposerConfig>(
      (resolved, layer) => mergeWith(resolved, layer),
      { ...DEFAULT_COMPOSER_CONFIG },
    );

    // `sendValidator` is a function, and the deep merge is not the right tool for choosing between two of
    // them — hence the explicit override, given the most specific layer that actually names one. Searched
    // from the most specific end, so a later layer that stayed silent does not erase an earlier choice.
    const validatorSource = [...layers]
      .reverse()
      .find((layer) => typeof layer.commands?.sendValidator === 'function');

    return applyCommandValidatorOverride(requested, validatorSource);
  }

  /**
   * Ceilings this composer's channel imposes server-side.
   *
   * `max_message_length` caps both length limits rather than setting them: a composer asking for something
   * shorter keeps its own number, and one asking for nothing at all inherits the server's — which is the
   * default, and the case worth having. Left unlimited, the composer happily accepts text the send endpoint
   * then rejects, so the limit is enforced late and as an API error instead of in the editor.
   */
  private get serverUpperBounds(): ServerUpperBounds<MessageComposerConfig> {
    const maxMessageLength = this.channel.getConfig()?.max_message_length;

    return {
      text: { maxLengthOnEdit: maxMessageLength, maxLengthOnSend: maxMessageLength },
    };
  }

  /**
   * The requested configuration with the server's restrictions applied — the value callers read.
   *
   * Frozen on the way out, so the "nested writes are caught at runtime" guarantee holds for the whole
   * tree rather than for whichever subtrees the merge happened to leave pointing at the frozen defaults.
   * It did not: `serverRestrictions` names `location` and `serverUpperBounds` names `text` on *every*
   * resolution, so those two were always copied into fresh, writable objects — and they are the two
   * subtrees callers actually configure. `composer.config.text.maxLengthOnSend = 5` therefore mutated
   * published state while notifying nobody, while the identical write to `drafts` threw.
   *
   * Freezing here rather than in {@link publishConfig} because the constructor seeds `configState` from
   * this getter directly, and a composer that is never re-published would otherwise keep an unfrozen
   * value for its whole life.
   */
  private get resolvedConfig(): MessageComposerConfig {
    return deepFreezeConfig(
      mergeServerRestrictions(
        this.requestedConfig,
        this.serverRestrictions,
        this.serverUpperBounds,
      ),
    ) as MessageComposerConfig;
  }

  /**
   * Resolves the configuration and publishes it, unless the result is deep-equal to what is already there.
   *
   * The guard is needed because `StateStore.next`'s own `===` no-op can never apply here: every resolution
   * allocates a new object, so without a comparison *every* publish notifies, whether or not any value
   * moved. In the React SDK that is a re-render for any consumer whose selector returns part of the config
   * rather than a scalar.
   *
   * Worth the walk: `isEqual` over a resolved composer config measures ~1.7µs, against a resolution at
   * ~3.5µs plus every subscriber's work. The dominant source of no-op publishes is fixed upstream in
   * `StreamChat._addChannelConfig`, which stops a repeated channel query from waking composers at all; this
   * catches the rest — re-registering a declarative value that has not changed, a `reset` with nothing
   * registered, an empty `updateConfig({})`.
   */
  private publishConfig = () => {
    const nextConfig = this.resolvedConfig;
    if (isEqual(this.configState.getLatestValue(), nextConfig)) return;
    this.configState.next(nextConfig);
  };

  /**
   * Rebuilds the configuration from its inputs and **discards imperative changes** — every
   * {@link updateConfig} patch, including those made through a sub-composer setter such as
   * `textComposer.defaultValue` or `attachmentManager.maxNumberOfFilesPerMessage`.
   *
   * Called by the constructor and by `client.config.reset()`, where dropping them is the point: a reset
   * means "back to what is registered". Anything that merely needs the configuration re-resolved — the
   * server's answer arriving, a declarative change — must use {@link publishConfig} or
   * {@link applyServerRestrictions}, which keep them.
   */
  initializeConfig = () => {
    this.imperativeConfig = {};
    this.publishConfig();
  };

  /**
   * Re-resolves the configuration against the channel's current server-side restrictions.
   *
   * Call this when the server's answer may have changed — its config has just arrived, or it was updated.
   * Safe in both directions, which is the whole reason it exists: a feature you disabled stays disabled
   * when the server permits it, and a feature the server *stops* restricting goes back to whatever you
   * asked for, because the restriction is applied to your request rather than to the previous result.
   *
   * Reachable rather than public: `Channel.query` is the only caller, covering a composer that has not
   * registered subscriptions and so cannot hear the answer change through
   * {@link subscribeChannelConfigChanged}. Nothing outside this package needs it — registering subscriptions
   * is the supported way to stay current, and a composer that has done so is already covered. Marked
   * `@internal` so it is not read as a supported extension point; the name is kept because what it does
   * is* re-assert the server's restrictions, even though the whole resolution is what performs that.
   *
   * @internal
   */
  applyServerRestrictions = () => {
    this.publishConfig();
  };

  refreshId = () => {
    this.state.partialNext({ id: MessageComposer.generateId() });
  };

  initState = ({
    composition,
  }: { composition?: DraftResponse | MessageResponse | LocalMessage } = {}) => {
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
    this.state.next(initState(composition));
  };

  initStateFromChannelResponse = (channelApiResponse: ChannelStateResponseFields) => {
    if (this.channel.cid !== channelApiResponse.channel?.cid) {
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
      this.addUnsubscribeFunction(this.subscribeChannelConfigChanged());
      this.addUnsubscribeFunction(this.subscribeMessageUpdated());
      this.addUnsubscribeFunction(this.subscribeMessageDeleted());

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

  private subscribeMessageComposerSetupStateChange = () =>
    applyInstanceConfiguration({
      args: { composer: this },
      config: this.client.config,
      key: 'messageComposer',
      // Re-resolve rather than merge the slice in. `requestedConfig` reads the declarative slice live, so
      // there is nothing to copy — and copying it through `updateConfig` would file it under *imperative*
      // changes, letting a later declarative change override an imperative one. That inverts stages 2 and
      // 5 of the documented order, which says the more specific, later request wins.
      applyConfig: () => this.publishConfig(),
      reinitializeConfig: this.initializeConfig,
    });

  /**
   * The channel's server-side config (`client.channelConfigsByType[type]`) is populated by `query`/`watch`, which for
   * a channel opened via `client.channel(type, id)` happens *after* this composer was constructed. Left
   * unwatched, the composer would keep the defaults it derived when `getConfig()` was still undefined —
   * so `location.enabled` would stay `true` for an app that disables `shared_locations` server-side.
   * Re-deriving when the config lands keeps the server authoritative.
   */
  private subscribeChannelConfigChanged = () =>
    this.client.channelConfigsByTypeStore.subscribeWithSelector(
      ({ configs }) => ({ channelConfig: configs[this.channel.type] }),
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
      if (this.editedMessage) return;

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
          attachments: [] as Attachment[],
          cid: this.channel.cid, // it is needed to match local paginator filters to be ingested into its state
          created_at, // only assigned to localMessage as this is used for optimistic update
          deleted_at: undefined,
          error: undefined,
          id: this.id,
          mentioned_users: [] as UserResponse[],
          parent_id: this.threadId ?? undefined,
          pinned_at: this.editedMessage?.pinned_at || undefined,
          reaction_groups: undefined,
          status: this.editedMessage ? this.editedMessage.status : 'sending',
          text,
          type: 'regular',
          updated_at: created_at,
        } as LocalMessage,
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
          created_at: new Date(),
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
        offlineDbLogger
          .withExtraTags('deleteDraft', this.channel.cid)
          .error('Deleting the draft from the offline database failed.', { error });
      }
    }
    this.logDraftUpdateTimestamp();
    await this.channel.deleteDraft({ parent_id: parentId });
  };

  getDraft = async () => {
    if (this.editedMessage || !this.config.drafts.enabled || !this.client.userId) return;

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
          type: 'api:location:create:failed',
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
