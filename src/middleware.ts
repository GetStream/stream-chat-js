import { withCancellation } from './utils/concurrency';

export type MiddlewareExecutor<
  TState,
  TValue extends { state: TState; stop?: boolean },
> = {
  id: string;
  [key: string]:
    | string
    | ((params: {
        input: TValue;
        nextHandler: (input: TValue) => Promise<TValue>;
      }) => Promise<TValue>);
};

export class Middleware<TState, TValue extends { state: TState; stop?: boolean }> {
  private middleware: MiddlewareExecutor<TState, TValue>[] = [];

  use(
    middleware: MiddlewareExecutor<TState, TValue> | MiddlewareExecutor<TState, TValue>[],
  ) {
    this.middleware = this.middleware.concat(middleware);
    return this;
  }

  upsert(middleware: MiddlewareExecutor<TState, TValue>[]) {
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
  ): Promise<TValue | 'canceled'> {
    let index = -1;

    const execute = (i: number, input: TValue): Promise<TValue> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }

      index = i;

      if (i === this.middleware.length || input.stop) {
        return Promise.resolve({ state: input.state, stop: input.stop } as TValue);
      }

      const middleware = this.middleware[i];
      const handler = middleware[eventName];

      if (!handler || typeof handler === 'string') {
        return execute(i + 1, input);
      }

      return handler({
        input,
        nextHandler: (nextInput) => execute(i + 1, nextInput),
        ...extraParams,
      });
    };

    return await withCancellation(
      'middleware-execution',
      async () => await execute(0, initialInput),
    );
  }

  async execute(eventName: string, initialInput: TValue): Promise<TValue | 'canceled'> {
    return await this.executeMiddlewareChain(eventName, initialInput);
  }
}
