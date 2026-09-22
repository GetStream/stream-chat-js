import type { MessageOperations } from './MessageOperations';
import type { OperationParams } from './types';
import type { ReactionRequest, SendReactionRequest } from '../types';

/**
 * Abstract so the mixin can wrap `WithSubscriptions`, which is itself abstract. `any[]` is the
 * standard mixin signature — the base's constructor arguments pass straight through.
 */
type MixinBase = abstract new (...args: any[]) => object;

/**
 * The optimistic message API a collection exposes, mixed into both `Channel` and `Thread`.
 *
 * Written as a mixin rather than a base class because single inheritance is already spent on both
 * sides — `Channel` extends the generated `ChannelApi`, `Thread` extends `WithSubscriptions` — and
 * rather than as two sets of forwarders because that was one API surface maintained twice.
 *
 * Every method forwards to `messageOperations`, which the mixing class constructs and assigns; see
 * `createMessageOperations`. Nothing here is collection-specific, which is the point: a `Thread`
 * reply and a channel message take the same path, and the operations object built for each is what
 * knows the difference.
 */
export const WithMessageOperations = <TBase extends MixinBase>(Base: TBase) => {
  abstract class WithMessageOperationsMixin extends Base {
    /**
     * Supplied by the mixing class, which builds it with `createMessageOperations`. Abstract rather
     * than declared here, so a class that mixes this in without providing one fails to compile —
     * the same contract `WithSubscriptions` states with `abstract registerSubscriptions()`.
     */
    abstract readonly messageOperations: MessageOperations;

    /**
     * Sends a message with optimistic local state update.
     */
    async sendMessageWithLocalUpdate(params: OperationParams<'send'>): Promise<void> {
      await this.messageOperations.send(params);
    }

    /**
     * Retry sending a failed message.
     */
    async retrySendMessageWithLocalUpdate(
      params: Omit<OperationParams<'retry'>, 'message'>,
    ): Promise<void> {
      await this.messageOperations.retrySendWithLocalUpdate(params);
    }

    /**
     * Updates a message with optimistic local state update.
     */
    async updateMessageWithLocalUpdate(params: OperationParams<'update'>): Promise<void> {
      await this.messageOperations.update(params);
    }

    /**
     * Deletes a message with local state update.
     */
    async deleteMessageWithLocalUpdate(params: OperationParams<'delete'>): Promise<void> {
      await this.messageOperations.delete(params);
    }

    /**
     * Adds a reaction with an optimistic local state update. The request routes through the channel
     * because reactions are channel-level, while the local write is addressed by message id and so
     * reaches a pure thread reply that no channel collection holds.
     */
    async addReactionWithLocalUpdate(params: {
      messageId: string;
      reaction: ReactionRequest;
      options?: Pick<SendReactionRequest, 'enforce_unique' | 'skip_push'>;
    }): Promise<void> {
      await this.messageOperations.addReactionWithLocalUpdate(params);
    }

    /**
     * Removes the current user's reaction with an optimistic local state update.
     */
    async deleteReactionWithLocalUpdate(params: {
      messageId: string;
      type: string;
    }): Promise<void> {
      await this.messageOperations.deleteReactionWithLocalUpdate(params);
    }
  }

  return WithMessageOperationsMixin;
};
