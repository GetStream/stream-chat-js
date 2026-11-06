import { localMessageToNewMessagePayload } from '../utils';
import type { LocalMessage, MessageRequest } from '../types';
import type { MessageOperationsConfig } from './MessageOperations';
import type { OperationParams } from './types';

type FailedSendCacheEntry = {
  message: MessageRequest;
  options?: OperationParams<'send'>['options'];
  cachedAt: number;
};

/**
 * Payloads of failed sends, kept so a retry sends exactly what failed. Entries expire after
 * `failedSendCacheTtlMs`, and past `failedSendCacheMaxSize` the oldest is dropped. Both limits are read
 * from the owner's config on every call.
 */
export class FailedSendCache {
  private readonly entries = new Map<string, FailedSendCacheEntry>();

  constructor(private readonly getConfig: () => Readonly<MessageOperationsConfig>) {}

  add({
    message,
    messageId,
    options,
  }: {
    messageId: string;
    message: MessageRequest;
    options?: OperationParams<'send'>['options'];
  }) {
    this.pruneExpired();

    if (
      !this.entries.has(messageId) &&
      this.entries.size >= this.getConfig().failedSendCacheMaxSize
    ) {
      const oldestMessageId = this.entries.keys().next().value;
      if (oldestMessageId) {
        this.clear(oldestMessageId);
      }
    }

    this.entries.set(messageId, { cachedAt: Date.now(), message, options });
  }

  get(messageId: string) {
    const cached = this.entries.get(messageId);
    if (!cached) return;

    if (Date.now() - cached.cachedAt > this.getConfig().failedSendCacheTtlMs) {
      this.clear(messageId);
      return;
    }

    return cached;
  }

  clear(messageId: string) {
    this.entries.delete(messageId);
  }

  /** Folds an edit into the cached payload, so a retry resends the message as it is now. */
  rewriteWithEdit(localMessage: LocalMessage) {
    const cached = this.get(localMessage.id);
    if (!cached) return;

    this.entries.set(localMessage.id, {
      ...cached,
      message: {
        ...cached.message,
        ...localMessageToNewMessagePayload(localMessage),
      },
    });
  }

  private pruneExpired() {
    const now = Date.now();

    for (const [messageId, entry] of this.entries) {
      if (now - entry.cachedAt > this.getConfig().failedSendCacheTtlMs) {
        this.clear(messageId);
      }
    }
  }
}
