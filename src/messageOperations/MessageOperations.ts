// todo: add tests
import type { MessageRequest, UpdateMessageOptions } from '../types';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';
import type { StateStore } from '../store';
import { ConfigController } from '../configuration/ConfigController';
import { formatMessage, localMessageToNewMessagePayload } from '../utils';
import { MessageOperationStatePolicy } from './MessageOperationStatePolicy';
import type {
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

export class MessageOperations {
  private ctx: MessageOperationsContext;
  private policy: MessageOperationStatePolicy;
  private failedSendCache = new Map<string, FailedSendCacheEntry>();

  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<MessageOperationsConfig>;
  /**
   * Resolved configuration, as a store — the shape every configurable class exposes
   * (`configState` / `config` / `updateConfig`).
   */
  get configState(): StateStore<MessageOperationsConfig> {
    return this.configController.state;
  }

  constructor(ctx: MessageOperationsContext) {
    this.ctx = ctx;
    this.policy = new MessageOperationStatePolicy({ ingest: ctx.ingest, get: ctx.get });
    this.configController = new ConfigController<MessageOperationsConfig>({
      defaults: DEFAULT_MESSAGE_OPERATIONS_CONFIG,
    });
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

  private normalizeMessage(message: MessageRequest): MessageRequest {
    return this.ctx.normalizeOutgoingMessage
      ? this.ctx.normalizeOutgoingMessage(message)
      : message;
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

  private async run<K extends OperationKind>(
    params: OperationParams<K>,
    doRequest: OperationRequestFn<K>,
  ): Promise<void> {
    const messageId = params.localMessage.id;

    this.policy.optimistic(params.localMessage);

    try {
      const { message: messageFromResponse } = await doRequest(params);
      this.policy.success({ messageFromResponse, messageId });
    } catch (e) {
      this.policy.failure({ error: e, localMessage: params.localMessage, messageId });
      throw e;
    }
  }

  async send(
    params: OperationParams<'send'>,
    requestFn?: OperationRequestFn<'send'>,
  ): Promise<void> {
    const handlers = this.ctx.handlers();
    const messageToSend = this.normalizeMessage(
      params.message ?? localMessageToNewMessagePayload(params.localMessage),
    );

    try {
      await this.run<'send'>(
        { ...params, message: messageToSend },
        requestFn ??
          handlers.send ??
          (async (p) =>
            await this.ctx.defaults.send(p.message ?? messageToSend, p.options)),
      );

      this.clearCachedFailedSend(params.localMessage.id);
    } catch (error) {
      this.cacheFailedSend({
        messageId: params.localMessage.id,
        message: messageToSend,
        options: params.options,
      });
      throw error;
    }
  }

  async retry(
    params: OperationParams<'retry'>,
    requestFn?: OperationRequestFn<'retry'>,
  ): Promise<void> {
    const handlers = this.ctx.handlers();
    const cachedPayload = this.getCachedFailedSend(params.localMessage.id);
    const messageToSend = this.normalizeMessage(
      params.message ??
        cachedPayload?.message ??
        localMessageToNewMessagePayload(params.localMessage),
    );
    const optionsToSend = params.options ?? cachedPayload?.options;

    const send = handlers.send;
    const sendAsRetry: OperationRequestFn<'retry'> | undefined = send
      ? (p) => send({ ...p } as OperationParams<'send'>)
      : undefined;

    try {
      await this.run<'retry'>(
        {
          ...params,
          message: messageToSend,
          options: optionsToSend,
        },
        requestFn ??
          handlers.retry ??
          sendAsRetry ??
          (async (p) =>
            await this.ctx.defaults.send(p.message ?? messageToSend, p.options)),
      );

      this.clearCachedFailedSend(params.localMessage.id);
    } catch (error) {
      this.cacheFailedSend({
        messageId: params.localMessage.id,
        message: messageToSend,
        options: optionsToSend,
      });
      throw error;
    }
  }

  async update(
    params: OperationParams<'update'>,
    requestFn?: OperationRequestFn<'update'>,
  ): Promise<void> {
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
      params,
      requestFn ??
        handlers.update ??
        (async (p) => await this.ctx.defaults.update(p.localMessage, updateOptions)),
    );
  }

  async delete(
    params: OperationParams<'delete'>,
    requestFn?: OperationRequestFn<'delete'>,
  ): Promise<void> {
    const handlers = this.ctx.handlers();
    const doRequest =
      requestFn ??
      handlers.delete ??
      (async (p: OperationParams<'delete'>) =>
        await this.ctx.defaults.delete(p.localMessage.id, p.options));

    const { message: messageFromResponse } = await doRequest(params);
    this.ctx.ingest(formatMessage(messageFromResponse));
  }
}
