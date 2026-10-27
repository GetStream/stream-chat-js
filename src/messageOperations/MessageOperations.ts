import type {
  MessageRequest,
  MessageResponse,
  ReactionRequest,
  SendReactionRequest,
  UpdateMessageOptions,
} from '../types';
import { applyReactionLocally } from './applyReactionLocally';
import { FailedSendCache } from './FailedSendCache';
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

/** Keeps only the options the update request takes, `skip_enrich_url` and `skip_push`. */
const pickUpdateOptions = (
  options: UpdateMessageOptions | undefined,
): UpdateMessageOptions | undefined => {
  if (!options) return undefined;
  const picked: UpdateMessageOptions = {};
  if (typeof options.skip_enrich_url === 'boolean')
    picked.skip_enrich_url = options.skip_enrich_url;
  if (typeof options.skip_push === 'boolean') picked.skip_push = options.skip_push;
  return picked;
};

/**
 * Every optimistic operation on a message. Send, retry, update and delete have a status lifecycle and
 * share {@link run} and {@link MessageOperationStatePolicy}. Reactions apply their change, send their
 * request, and on failure call {@link rollbackUnlessQueued}.
 */
export class MessageOperations {
  private ctx: MessageOperationsContext;
  private policy: MessageOperationStatePolicy;
  private readonly failedSendCache = new FailedSendCache(() => this.config);
  private readonly normalizeOutgoingMessage: NonNullable<
    MessageOperationsContext['normalizeOutgoingMessage']
  >;
  private readonly sequenceRequests: NonNullable<
    MessageOperationsContext['sequenceRequests']
  >;

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

  get configState(): StateStore<MessageOperationsConfig> {
    return this.configController.state;
  }

  get config(): Readonly<MessageOperationsConfig> {
    return this.configState.getLatestValue();
  }

  /**
   * Merges a partial configuration into the resolved config.
   *
   * @param config - Fields to merge into the resolved config.
   */
  updateConfig(config: Partial<MessageOperationsConfig>) {
    this.configController.patch(config);
  }

  /**
   * Re-derives the configuration from the declarative slice.
   *
   * @param config - The declarative slice. Leave it out to rebuild from the defaults.
   */
  initializeConfig(config?: Partial<MessageOperationsConfig>) {
    this.configController.initialize(config);
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
    // Same reference unless an upload just resolved. Then the payload is rebuilt, since
    // `message.attachments` only holds the attachments that already had a URL.
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
   * The shared lifecycle: apply the optimistic state, settle uploads still in flight, fire the request,
   * then reconcile or record the failure. The per-kind rules are in {@link MessageOperationStatePolicy}.
   */
  private async run<K extends OperationKind>(
    kind: K,
    params: OperationParams<K>,
    doRequest: DefaultOperationRequest<K>,
  ): Promise<void> {
    const messageId = params.localMessage.id;

    const optimistic = this.policy.optimistic(kind, params);

    // Carries what the settle step resolved, so a failure records partial progress.
    let effective = params;

    try {
      // Ordering covers the settle and the request, not the optimistic update.
      const response = await this.sequenceRequests(kind, async () => {
        // An edit composes like a send, so it can carry a pending upload. A delete cannot.
        if (kind !== 'delete') {
          const settled = await this.withSettledUploads(params);
          // Assigns the outer `effective`: the `catch` below needs the settled attachments.
          effective = settled.params;
          if (settled.failureReason) throw settled.failureReason;

          // Settling released the local previews, so publish the URLs now or the list points at a
          // revoked blob until the response. Patches what is held, since `effective.localMessage` still
          // has the caller's status (a retry would revert to `failed`).
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

        // A custom handler may resolve with nothing, which the policy treats as "no server copy".
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
   * Each operation sends through the integrator's handler for its kind (`ChannelConfig.requestHandlers`)
   * when one is registered, else through `defaults.<kind>`. A handler receives the default as
   * `defaultRequest`. There is no per-call override: it would win over the host SDK's handler.
   */

  private resolveRequest<K extends OperationKind>(
    handler: OperationRequestFn<K> | undefined,
    defaultRequest: DefaultOperationRequest<K>,
  ): DefaultOperationRequest<K> {
    return handler ? (p) => handler(p, defaultRequest) : defaultRequest;
  }

  async send(params: OperationParams<'send'>): Promise<void> {
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
      handlers.send,
    );
  }

  /** A send with a cached payload: resends what failed, unless the caller passes a new one. */
  async retry(params: OperationParams<'retry'>): Promise<void> {
    const handlers = this.ctx.handlers();
    // A failed message can carry an `error` type; what is resent is a regular message.
    const localMessage = { ...params.localMessage, type: 'regular' as const };
    const cachedPayload = this.failedSendCache.get(localMessage.id);
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
      handlers.retry ?? handlers.send,
    );
  }

  /** Runs a send or retry, keeping the payload cached for a later retry until one succeeds. */
  private async sendWithFailedSendCache(
    kind: 'send' | 'retry',
    params: OperationParams<'send'> & { message: MessageRequest },
    handler: OperationRequestFn<'send'> | OperationRequestFn<'retry'> | undefined,
  ): Promise<void> {
    const { localMessage, message, options } = params;
    const defaultRequest: DefaultOperationRequest<'send' | 'retry'> = async (p) =>
      await this.ctx.defaults.send(p.message ?? message, p.options);

    try {
      await this.run(
        kind,
        params,
        handler ? (p) => handler(p, defaultRequest) : defaultRequest,
      );
      this.failedSendCache.clear(localMessage.id);
    } catch (error) {
      this.failedSendCache.add({ message, messageId: localMessage.id, options });
      throw error;
    }
  }

  async update(params: OperationParams<'update'>): Promise<void> {
    this.failedSendCache.rewriteWithEdit(params.localMessage);

    const handlers = this.ctx.handlers();

    return await this.run<'update'>(
      'update',
      params,
      this.resolveRequest(
        handlers.update,
        async (p) =>
          await this.ctx.defaults.update(p.localMessage, pickUpdateOptions(p.options)),
      ),
    );
  }

  async delete(params: OperationParams<'delete'>): Promise<void> {
    const handlers = this.ctx.handlers();

    return await this.run<'delete'>(
      'delete',
      params,
      this.resolveRequest(
        handlers.delete,
        async (p) => await this.ctx.defaults.delete(p.localMessage.id, p.options),
      ),
    );
  }

  /**
   * Adds a reaction optimistically: it is applied to the cached message at once, then sent through the
   * offline queue. The response's counts reconcile; a definitive failure rolls it back, a request queued
   * for replay does not. The local write is by message ID, so it also reaches a thread reply that no
   * channel collection holds.
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
    // `reaction` is a request, so its timestamps are `Date`s. The local store uses the wire unit.
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
      const response = await this.ctx.defaults.sendReaction(
        { id: messageId },
        { reaction, ...options },
      );
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
   * The failure rule for operations outside {@link run}: a request queued for replay is pending, so its
   * optimistic change stays. Pass the operation's own task types, as every task carries the same
   * `messageId`.
   */
  private async rollbackUnlessQueued(
    messageId: string,
    types: readonly QueueableType[],
    undo: (() => unknown) | undefined,
  ) {
    if (!(await this.ctx.isQueued(messageId, types))) undo?.();
  }

  /** Reconciles the server copy only if still held: a bare upsert of an unheld ID would orphan it. */
  private reconcileHeldMessage(message: MessageResponse | undefined | null) {
    if (!message) return;
    const { messageStore } = this.ctx.channel.getClient();
    if (!messageStore.has(message.id)) return;
    messageStore.upsert(formatMessage(message));
  }
}
