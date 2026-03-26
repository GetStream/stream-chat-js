import type { StreamChat } from '../client';
import { cloneMessageComposerFrom } from './cloneMessageComposer';
import type { MessageComposer } from './messageComposer';

export type PendingMessagesManagerOptions = {
  client: StreamChat;
};

/**
 * Holds {@link MessageComposer} snapshots keyed by pending (e.g. optimistic) message id.
 */
export class PendingMessagesManager {
  private readonly composers = new Map<string, MessageComposer>();
  readonly client: StreamChat;

  constructor({ client }: PendingMessagesManagerOptions) {
    this.client = client;
  }

  /**
   * Stores a clone of `composer` under {@link MessageComposer.id}.
   * The clone has identical composition state and a new composer id.
   */
  addPendingMessage(composer: MessageComposer): MessageComposer {
    const clone = cloneMessageComposerFrom(composer);
    this.composers.set(composer.id, clone);
    return clone;
  }

  removePendingMessage(messageId: string): void {
    this.composers.delete(messageId);
  }

  clear(): void {
    this.composers.clear();
  }
}
