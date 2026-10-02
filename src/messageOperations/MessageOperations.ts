import type {
  MessageRequest,
  MessageResponse,
  ReactionRequest,
  SendReactionRequest,
  UpdateMessageOptions,
} from '../types';
import { applyReactionLocally } from './applyReactionLocally';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';
import type { StateStore } from '@stream-io/state-store';
import { ConfigController } from '../configuration/ConfigController';
import { formatMessage, localMessageToNewMessagePayload } from '../utils';
import { dateToNs } from '../utils/time';
import { MessageOperationStatePolicy } from './MessageOperationStatePolicy';
import type { QueueableType } from '../offline-support';
import type {
  DefaultOperationRequest,
  MessageOperationsContext,
  OperationKind,
  OperationParams,
  OperationRequestFn,
} from './types';

export type MessageOperationsConfig = {
  /** Most failed sends kept for retry; the oldest is evicted past this (defaults to 100). */
  failedSendCacheMaxSize: number;
  /** How long a failed send stays retryable (defaults to 5 minutes). */
  failedSendCacheTtlMs: number;
};

export const DEFAULT_MESSAGE_OPERATIONS_CONFIG: MessageOperationsConfig =
  deepFreezeConfig({
    failedSendCacheMaxSize: 100,
    failedSendCacheTtlMs: 5 * 60 * 1000,
  });

type FailedSendCacheEntry = {
  message: MessageRequest;
  options?: OperationParams<'send'>['options'];
  cachedAt: number;
};

/**
 * Every optimistic operation on a message, each one method reading top to bottom.
 *
 * Send, retry, update and delete are message REQUESTS with a status lifecycle, so they share
 * {@link run} and {@link MessageOperationStatePolicy}. Anything else (reactions, and whatever comes
 * next) applies its change, sends its request, and on failure calls {@link rollbackUnlessQueued}.
 */
export class MessageOperations {
  private ctx: MessageOperationsContext;
  private policy: MessageOperationStatePolicy;
  private failedSendCache = new Map<string, FailedSendCacheEntry>();
  private readonly normalizeOutgoingMessage: NonNullable<
    MessageOperationsContext['normalizeOutgoingMessage']
  >;
  private readonly sequenceRequests: NonNullable<
    MessageOperationsContext['sequenceRequests']
  >;

  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<MessageOperationsConfig>;

  constructor(ctx: MessageOperationsContext) {
    this.ctx = ctx;
    this.policy = new MessageOperationStatePolicy({
      get: ctx.get,
      ingest: ctx.ingest,
      isQueued: ctx.isQueued,
      persist: ctx.persist,
      purge: ctx.purge,
      remove: ctx.remove,
    });
    this.normalizeOutgoingMessage = ctx.normalizeOutgoingMessage ?? ((m) => m);
    this.sequenceRequests = ctx.sequenceRequests ?? ((_kind, request) => request());
    this.configController = new ConfigController<MessageOperationsConfig>({
      defaults: DEFAULT_MESSAGE_OPERATIONS_CONFIG,
    });
  }

  /**
   * Resolved configuration, as a store — the shape every configurable class exposes
   * (`configState` / `config` / `updateConfig`).
   */
  get configState(): StateStore<MessageOperationsConfig> {
    return this.configController.state;
  }

  /** The current resolved configuration. `Readonly` — change it through {@link updateConfig}. */
  get config(): Readonly<MessageOperationsConfig> {
    return this.configState.getLatestValue();
  }

  /** Merges a partial configuration into the resolved config and notifies subscribers. */
  updateConfig(config: Partial<MessageOperationsConfig>) {
    this.configController.patch(config);
  }

  /**
   * Rebuilds the resolved configuration from package defaults plus the declarative slice.
   *
   * The derivation entry point every configurable entity exposes, so the owner routes a slice here and
   * knows nothing about MessageOperations's defaults or merge semantics. This logic used to live in the owner,
   * which is how `reset()` became a no-op for the client key (F4) and how a registered
   * `notifications.sortComparator` became unremovable (G8) — an owner writing another object's
   * derivation gets that object's rules wrong sooner or later.
   *
   * Routed through {@link updateConfig} rather than replacing the store, which is exact here because
   * every field of `MessageOperationsConfig` is required and present in the defaults, so a patch naming all of
   * them amounts to a replacement. `NotificationManager` cannot do this — its `sortComparator` is
   * optional with no default, so a patch can never remove one — which is why it replaces outright.
   */
  initializeConfig(config?: Partial<MessageOperationsConfig>) {
    this.configController.initialize(config);
  }

  private pruneExpiredFailedSendCache() {
    const now = Date.now();

    for (const [messageId, entry] of this.failedSendCache) {
      if (now - entry.cachedAt > this.config.failedSendCacheTtlMs) {
        this.clearCachedFailedSend(messageId);
      }
    }
  }

  private cacheFailedSend(params: {
    messageId: string;
    message: MessageRequest;
    options?: OperationParams<'send'>['options'];
  }) {
    this.pruneExpiredFailedSendCache();

    if (
      !this.failedSendCache.has(params.messageId) &&
      this.failedSendCache.size >= this.config.failedSendCacheMaxSize
    ) {
      const oldestMessageId = this.failedSendCache.keys().next().value;
      if (oldestMessageId) {
        this.clearCachedFailedSend(oldestMessageId);
      }
    }

    this.failedSendCache.set(params.messageId, {
      cachedAt: Date.now(),
      message: params.message,
      options: params.options,
    });
  }

  private getCachedFailedSend(messageId: string) {
    const cached = this.failedSendCache.get(messageId);
    if (!cached) return;

    if (Date.now() - cached.cachedAt > this.config.failedSendCacheTtlMs) {
      this.clearCachedFailedSend(messageId);
      return;
    }

    return cached;
  }

  private clearCachedFailedSend(messageId: string) {
    this.failedSendCache.delete(messageId);
  }

  /**
   * Folds an edit into the payload cached for this message's failed send, so `retry` resends what the
   * message contains now rather than what it contained when the send failed.
   *
   * This exists so a retry while offline for example is also persisted, rather than just disappearing.
   */
  private rewriteCachedFailedSend(localMessage: OperationParams<'send'>['localMessage']) {
    const cached = this.getCachedFailedSend(localMessage.id);
    if (!cached) return;

    this.failedSendCache.set(localMessage.id, {
      ...cached,
      message: {
        ...cached.message,
        ...localMessageToNewMessagePayload(localMessage),
      },
    });
  }

  /**
   * Resolves any in-flight upload and folds the URLs back into both payloads. A no-op without
   * {@link MessageOperationsContext.settlePendingUploads} or a pending attachment.
   */
  private async withSettledUploads<K extends OperationKind>(
    params: OperationParams<K>,
  ): Promise<{ params: OperationParams<K>; failureReason?: unknown }> {
    const settle = this.ctx.settlePendingUploads;
    const attachments = params.localMessage.attachments;
    if (!settle || !attachments?.length) return { params };

    const { attachments: settledAttachments, failureReason } = await settle(attachments);
    // Same array reference unless something uploaded just now, in which case the payload has to be
    // rebuilt from it: the composition middleware left `message.attachments` holding only the
    // attachments that already had a URL.
    if (settledAttachments === attachments) return { failureReason, params };

    const wirePayload =
      'message' in params && params.message
        ? { message: { ...params.message, attachments: settledAttachments } }
        : {};

    return {
      failureReason,
      params: {
        ...params,
        ...wirePayload,
        localMessage: { ...params.localMessage, attachments: settledAttachments },
      } as OperationParams<K>,
    };
  }

  /**
   * The shared lifecycle: apply the optimistic state, settle any attachment upload still in flight,
   * fire the request, then reconcile or record the failure. `kind` is threaded through because the
   * three operations want materially different state transitions — see
   * {@link MessageOperationStatePolicy}.
   */
  private async run<K extends OperationKind>(
    kind: K,
    params: OperationParams<K>,
    doRequest: DefaultOperationRequest<K>,
  ): Promise<void> {
    const messageId = params.localMessage.id;

    const optimistic = this.policy.optimistic(kind, params);

    // Carries whatever the settle step resolved, so a failure records partial progress and a
    // retry re-uploads only what is missing.
    let effective = params;

    try {
      // Ordering starts here, after the optimistic update and around the settle + request — the
      // transfer is the slow part being ordered.
      const response = await this.sequenceRequests(kind, async () => {
        // An edit composes through the same middleware as a send, so it too can carry a pending
        // upload. Only a delete is excluded — it discards the message. Deliberately not the
        // `sequenceRequests` predicate, which asks a different question.
        if (kind !== 'delete') {
          const settled = await this.withSettledUploads(params);
          // Writes the outer `effective`, not a new local — the `catch` is outside this callback
          // and needs the settled attachments to report partial success.
          effective = settled.params;
          if (settled.failureReason) throw settled.failureReason;

          // Settling released the local previews, so publish the URLs now or the list points at a
          // revoked blob for a round-trip. Patches what is held, since `effective.localMessage`
          // still carries the caller's status and a retry would revert to `failed`.
          const settledAttachments = effective.localMessage.attachments;
          const held =
            settledAttachments === params.localMessage.attachments
              ? undefined
              : this.ctx.get(messageId);
          if (held) {
            const withUrls = { ...held, attachments: settledAttachments };
            this.ctx.ingest(withUrls);
            this.ctx.persist(withUrls);
          }
        }

        // Destructured defensively: a custom request handler is free to resolve with nothing, and
        // the policy's own guard treats a missing message as "no server copy to apply".
        return await doRequest(effective);
      });
      this.policy.success({
        kind,
        messageFromResponse: response?.message,
        messageId,
        optimistic,
        options: params.options,
      });
    } catch (e) {
      await this.policy.failure({
        error: e,
        kind,
        localMessage: effective.localMessage,
        messageId,
        optimistic,
        options: params.options,
      });
      throw e;
    }
  }

  /*
   * Each operation resolves its request as `requestFn ?? handlers.<kind> ?? defaults.<kind>`, and a
   * replacing one is handed the default as `defaultRequest`.
   *
   * `handlers` is the integrator seam (`ChannelConfig.requestHandlers`). `requestFn` is a direct
   * injection point for tests; it is not exposed on the public methods because it wins over
   * `handlers`, so a caller reaching for it would bypass whatever the host SDK registered.
   */

  private resolveRequest<K extends OperationKind>(
    replacement: OperationRequestFn<K> | undefined,
    defaultRequest: DefaultOperationRequest<K>,
  ): DefaultOperationRequest<K> {
    return replacement ? (p) => replacement(p, defaultRequest) : defaultRequest;
  }

  async send(
    params: OperationParams<'send'>,
    requestFn?: OperationRequestFn<'send'>,
  ): Promise<void> {
    this.ctx.beforeSend?.();
    const handlers = this.ctx.handlers();
    await this.sendWithFailedSendCache(
      'send',
      {
        ...params,
        message: this.normalizeOutgoingMessage(
          params.message ?? localMessageToNewMessagePayload(params.localMessage),
        ),
      },
      requestFn ?? handlers.send,
    );
  }

  /** A send with a cached payload: resends what failed, unless the caller passes a new one. */
  async retry(
    params: OperationParams<'retry'>,
    requestFn?: OperationRequestFn<'retry'>,
  ): Promise<void> {
    const handlers = this.ctx.handlers();
    // A failed message can carry an `error` type; what is resent is a regular message.
    const localMessage = { ...params.localMessage, type: 'regular' as const };
    const cachedPayload = this.getCachedFailedSend(localMessage.id);
    await this.sendWithFailedSendCache(
      'retry',
      {
        ...params,
        localMessage,
        message: this.normalizeOutgoingMessage(
          params.message ??
            cachedPayload?.message ??
            localMessageToNewMessagePayload(localMessage),
        ),
        options: params.options ?? cachedPayload?.options,
      },
      requestFn ?? handlers.retry ?? handlers.send,
    );
  }

  /** Runs a send or retry, keeping the payload cached for a later retry until one succeeds. */
  private async sendWithFailedSendCache(
    kind: 'send' | 'retry',
    params: OperationParams<'send'> & { message: MessageRequest },
    requestFn: OperationRequestFn<'send'> | OperationRequestFn<'retry'> | undefined,
  ): Promise<void> {
    const { localMessage, message, options } = params;
    const defaultRequest: DefaultOperationRequest<'send' | 'retry'> = async (p) =>
      await this.ctx.defaults.send(p.message ?? message, p.options);

    try {
      await this.run(
        kind,
        params,
        requestFn ? (p) => requestFn(p, defaultRequest) : defaultRequest,
      );
      this.clearCachedFailedSend(localMessage.id);
    } catch (error) {
      this.cacheFailedSend({ message, messageId: localMessage.id, options });
      throw error;
    }
  }

  async update(
    params: OperationParams<'update'>,
    requestFn?: OperationRequestFn<'update'>,
  ): Promise<void> {
    this.rewriteCachedFailedSend(params.localMessage);

    const handlers = this.ctx.handlers();
    let updateOptions: UpdateMessageOptions | undefined;
    if (params.options) {
      updateOptions = {};
      if (typeof params.options.skip_enrich_url === 'boolean')
        updateOptions.skip_enrich_url = params.options.skip_enrich_url;
      if (typeof params.options.skip_push === 'boolean')
        updateOptions.skip_push = params.options.skip_push;
    }

    return await this.run<'update'>(
      'update',
      params,
      this.resolveRequest(
        requestFn ?? handlers.update,
        async (p) => await this.ctx.defaults.update(p.localMessage, updateOptions),
      ),
    );
  }

  async delete(
    params: OperationParams<'delete'>,
    requestFn?: OperationRequestFn<'delete'>,
  ): Promise<void> {
    const handlers = this.ctx.handlers();

    return await this.run<'delete'>(
      'delete',
      params,
      this.resolveRequest(
        requestFn ?? handlers.delete,
        async (p) => await this.ctx.defaults.delete(p.localMessage.id, p.options),
      ),
    );
  }

  /**
   * Adds a reaction with an optimistic local state update: the reaction is applied to the cached
   * message immediately, then the request is sent through the offline queue. The server-authoritative counts reconcile on the response; the reaction is
   * rolled back on a definitive failure, and left alone when the request was queued for replay.
   *
   * The request routes through the channel because reactions are channel-level, while the local write
   * is addressed by message id and so reaches a pure thread reply that no channel collection holds.
   */
  async addReaction({
    messageId,
    options,
    reaction,
  }: {
    messageId: string;
    reaction: ReactionRequest;
    options?: Pick<SendReactionRequest, 'enforce_unique' | 'skip_push'>;
  }): Promise<void> {
    const { channel } = this.ctx;
    // `reaction` is a REQUEST, so any timestamps on it are `Date`s. The local store speaks the wire
    // unit, so bring them across rather than handing a `Date` to a numeric field.
    const { created_at, updated_at, ...restOfReaction } = reaction;
    const undo = applyReactionLocally(channel.getClient(), {
      enforceUnique: options?.enforce_unique ?? false,
      messageId,
      reaction: {
        ...restOfReaction,
        ...(created_at ? { created_at: dateToNs(created_at) } : {}),
        ...(updated_at ? { updated_at: dateToNs(updated_at) } : {}),
      },
    });

    try {
      const response = await this.ctx.defaults.sendReaction({
        id: messageId,
        reaction,
        ...options,
      });
      this.reconcileHeldMessage(response?.message);
    } catch (error) {
      await this.rollbackUnlessQueued(messageId, ['send-reaction'], undo);
      throw error;
    }
  }

  /** Removes the current user's reaction optimistically, mirroring {@link addReaction}. */
  async deleteReaction({
    messageId,
    type,
  }: {
    messageId: string;
    type: string;
  }): Promise<void> {
    const { channel } = this.ctx;
    const undo = applyReactionLocally(channel.getClient(), {
      messageId,
      reaction: { type },
      removed: true,
    });

    try {
      const response = await this.ctx.defaults.deleteReaction({ id: messageId, type });
      this.reconcileHeldMessage(response?.message);
    } catch (error) {
      await this.rollbackUnlessQueued(messageId, ['delete-reaction'], undo);
      throw error;
    }
  }

  /**
   * The failure rule every operation outside {@link run} shares: a request queued for replay is
   * pending, not failed, so its optimistic change stays. Name the operation's OWN task types — every
   * task carries the same `messageId`, so "anything queued" would let an unrelated task answer.
   */
  private async rollbackUnlessQueued(
    messageId: string,
    types: readonly QueueableType[],
    undo: (() => unknown) | undefined,
  ) {
    if (!(await this.ctx.isQueued(messageId, types))) undo?.();
  }

  /**
   * Reconciles the server-authoritative copy, but only if we still hold it — a bare upsert of an unheld
   * id would orphan it (the store's refcount GC only reclaims held ids).
   */
  private reconcileHeldMessage(message: MessageResponse | undefined | null) {
    if (!message) return;
    const { messageStore } = this.ctx.channel.getClient();
    if (!messageStore.has(message.id)) return;
    messageStore.upsert(formatMessage(message));
  }
}
