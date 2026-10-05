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
 * The payloads of sends that failed, kept so a retry sends exactly what failed. An entry expires after
 * `failedSendCacheTtlMs`, and past `failedSendCacheMaxSize` the oldest one is dropped. Both limits are
 * read from the owner's current configuration on every call, so a config change applies at once.
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

  /**
   * Folds an edit into the payload cached for this message's failed send, so a retry resends what the
   * message contains now rather than what it contained when the send failed.
   *
   * This exists so a retry while offline for example is also persisted, rather than just disappearing.
   */
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
