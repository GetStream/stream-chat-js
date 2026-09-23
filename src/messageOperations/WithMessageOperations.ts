import type { MessageOperations } from './MessageOperations';
import type { OperationParams } from './types';
import type { ReactionRequest, SendReactionRequest } from '../types';

/** Abstract so the mixin can wrap `WithSubscriptions`, which is itself abstract. */
type MixinBase = abstract new (...args: any[]) => object;

/**
 * The optimistic message API, mixed into both `Channel` and `Thread`.
 *
 * A mixin rather than a base class because single inheritance is spent on both sides: `Channel`
 * extends the generated `ChannelApi`, `Thread` extends `WithSubscriptions`.
 */
export const WithMessageOperations = <TBase extends MixinBase>(Base: TBase) => {
  abstract class WithMessageOperationsMixin extends Base {
    /** Supplied by the mixing class, which builds it with `createMessageOperations`. */
    abstract readonly messageOperations: MessageOperations;

    /** Sends a message with optimistic local state update. */
    async sendMessageWithLocalUpdate(params: OperationParams<'send'>): Promise<void> {
      await this.messageOperations.send(params);
    }

    /** Retry sending a failed message. */
    async retrySendMessageWithLocalUpdate(
      params: Omit<OperationParams<'retry'>, 'message'>,
    ): Promise<void> {
      await this.messageOperations.retrySendWithLocalUpdate(params);
    }

    /** Updates a message with optimistic local state update. */
    async updateMessageWithLocalUpdate(params: OperationParams<'update'>): Promise<void> {
      await this.messageOperations.update(params);
    }

    /** Deletes a message with local state update. */
    async deleteMessageWithLocalUpdate(params: OperationParams<'delete'>): Promise<void> {
      await this.messageOperations.delete(params);
    }

    /** Adds a reaction with an optimistic local state update. */
    async addReactionWithLocalUpdate(params: {
      messageId: string;
      reaction: ReactionRequest;
      options?: Pick<SendReactionRequest, 'enforce_unique' | 'skip_push'>;
    }): Promise<void> {
      await this.messageOperations.addReactionWithLocalUpdate(params);
    }

    /** Removes the current user's reaction with an optimistic local state update. */
    async deleteReactionWithLocalUpdate(params: {
      messageId: string;
      type: string;
    }): Promise<void> {
      await this.messageOperations.deleteReactionWithLocalUpdate(params);
    }
  }

  return WithMessageOperationsMixin;
};
