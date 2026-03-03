// todo: add tests
import type { Message, UpdateMessageOptions } from '../types';
import { localMessageToNewMessagePayload } from '../utils';
import { MessageOperationStatePolicy } from './MessageOperationStatePolicy';
import type {
  MessageOperationsContext,
  OperationKind,
  OperationParams,
  OperationRequestFn,
} from './types';

const FAILED_SEND_CACHE_MAX_SIZE = 100;
const FAILED_SEND_CACHE_TTL_MS = 5 * 60 * 1000;

type FailedSendCacheEntry = {
  message: Message;
  options?: OperationParams<'send'>['options'];
  cachedAt: number;
};

export class MessageOperations {
  private ctx: MessageOperationsContext;
  private policy: MessageOperationStatePolicy;
  private failedSendCache = new Map<string, FailedSendCacheEntry>();

  constructor(ctx: MessageOperationsContext) {
    this.ctx = ctx;
    this.policy = new MessageOperationStatePolicy({ ingest: ctx.ingest, get: ctx.get });
  }

  private normalizeMessage(message: Message): Message {
    return this.ctx.normalizeOutgoingMessage
      ? this.ctx.normalizeOutgoingMessage(message)
      : message;
  }

  private pruneExpiredFailedSendCache() {
    const now = Date.now();

    for (const [messageId, entry] of this.failedSendCache) {
      if (now - entry.cachedAt > FAILED_SEND_CACHE_TTL_MS) {
        this.clearCachedFailedSend(messageId);
      }
    }
  }

  private cacheFailedSend(params: {
    messageId: string;
    message: Message;
    options?: OperationParams<'send'>['options'];
  }) {
    this.pruneExpiredFailedSendCache();

    if (
      !this.failedSendCache.has(params.messageId) &&
      this.failedSendCache.size >= FAILED_SEND_CACHE_MAX_SIZE
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

    if (Date.now() - cached.cachedAt > FAILED_SEND_CACHE_TTL_MS) {
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
}
