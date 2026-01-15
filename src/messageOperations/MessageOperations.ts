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

export class MessageOperations {
  private ctx: MessageOperationsContext;
  private policy: MessageOperationStatePolicy;

  constructor(ctx: MessageOperationsContext) {
    this.ctx = ctx;
    this.policy = new MessageOperationStatePolicy({ ingest: ctx.ingest, get: ctx.get });
  }

  private normalizeMessage(message: Message): Message {
    return this.ctx.normalizeOutgoingMessage
      ? this.ctx.normalizeOutgoingMessage(message)
      : message;
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

    return await this.run<'send'>(
      { ...params, message: messageToSend },
      requestFn ??
        handlers.send ??
        (async (p) =>
          await this.ctx.defaults.send(p.message ?? messageToSend, p.options)),
    );
  }

  async retry(
    params: OperationParams<'retry'>,
    requestFn?: OperationRequestFn<'retry'>,
  ): Promise<void> {
    const handlers = this.ctx.handlers();
    const messageToSend = this.normalizeMessage(
      params.message ?? localMessageToNewMessagePayload(params.localMessage),
    );

    const send = handlers.send;
    const sendAsRetry: OperationRequestFn<'retry'> | undefined = send
      ? (p) => send({ ...p } as OperationParams<'send'>)
      : undefined;

    return await this.run<'retry'>(
      { ...params, message: messageToSend },
      requestFn ??
        handlers.retry ??
        sendAsRetry ??
        (async (p) =>
          await this.ctx.defaults.send(p.message ?? messageToSend, p.options)),
    );
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
