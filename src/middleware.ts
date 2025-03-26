import { withCancellation } from './utils/concurrency';

export type MiddlewareStatus = 'complete' | 'discard';

export type MiddlewareValue<TState> = {
  state: TState;
  status?: MiddlewareStatus;
};

export type MiddlewareHandler<TValue> = (params: {
  input: TValue;
  nextHandler: (input: TValue) => Promise<TValue>;
}) => Promise<TValue>;

export type Middleware<TState, TValue extends MiddlewareValue<TState>> = {
  id: string;
  [key: string]: string | MiddlewareHandler<TValue>;
};

export class MiddlewareExecutor<TState, TValue extends MiddlewareValue<TState>> {
  private middleware: Middleware<TState, TValue>[] = [];

  use(middleware: Middleware<TState, TValue> | Middleware<TState, TValue>[]) {
    this.middleware = this.middleware.concat(middleware);
    return this;
  }

  // todo: document how to re-arrange the order of middleware using upsert
  upsert(middleware: Middleware<TState, TValue>[]) {
    const newMiddleware = [...this.middleware];
    middleware.forEach((upserted) => {
      const existingIndex = this.middleware.findIndex(
        (existing) => existing.id === upserted.id,
      );
      if (existingIndex >= 0) {
        newMiddleware.splice(existingIndex, 1, upserted);
      } else {
        newMiddleware.push(upserted);
      }
    });
    this.middleware = newMiddleware;
    return this;
  }

  protected async executeMiddlewareChain(
    eventName: string,
    initialInput: TValue,
    extraParams: Record<string, unknown> = {},
  ): Promise<TValue> {
    let index = -1;

    const execute = async (i: number, input: TValue): Promise<TValue> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }

      index = i;

      const returnFromChain =
        i === this.middleware.length ||
        (input.status && ['complete', 'discard'].includes(input.status));
      if (returnFromChain) return input;

      const middleware = this.middleware[i];
      const handler = middleware[eventName];

      if (!handler || typeof handler === 'string') {
        return execute(i + 1, input);
      }

      return await handler({
        input,
        nextHandler: (nextInput: TValue) => execute(i + 1, nextInput),
        ...extraParams,
      });
    };

    const result = await withCancellation(
      'middleware-execution',
      async () => await execute(0, initialInput),
    );

    return result === 'canceled' ? { ...initialInput, status: 'discard' } : result;
  }

  async execute(eventName: string, initialInput: TValue): Promise<TValue> {
    return await this.executeMiddlewareChain(eventName, initialInput);
  }
}
