import { withCancellation } from './utils/concurrency';
import { generateUUIDv4 } from './utils';

export type InsertPosition =
  | {
      after: string;
      before?: never;
    }
  | {
      after?: never;
      before: string;
    };

export type MiddlewareStatus = 'complete' | 'discard';

export type MiddlewareExecutionResult<TValue> = {
  state: TValue;
  status?: MiddlewareStatus;
};

export type ExecuteParams<TValue> = {
  eventName: string;
  initialValue: TValue;
  /*
  Determines how the concurrently run middleware handlers will be executed:
  - async - all handlers are executed even though the same handler is invoked more than once
  - cancelable - previously invoked handlers of the same eventName that have not yet resolved are canceled
   */
  mode?: 'concurrent' | 'cancelable'; // default 'cancelable'
};

export type MiddlewareHandlerParams<TValue> = {
  state: TValue;
  next: (state: TValue) => Promise<MiddlewareExecutionResult<TValue>>;
  complete: (state: TValue) => Promise<MiddlewareExecutionResult<TValue>>;
  discard: () => Promise<MiddlewareExecutionResult<TValue>>;
  forward: () => Promise<MiddlewareExecutionResult<TValue>>;
};

export type MiddlewareHandler<TValue> = (
  params: MiddlewareHandlerParams<TValue>,
) => Promise<MiddlewareExecutionResult<TValue>>;

export type MiddlewareHandlers<TValue, THandlers extends string> = {
  [K in THandlers]: MiddlewareHandler<TValue>;
};

export type Middleware<TValue, THandlers extends string> = {
  id: string;
  handlers: MiddlewareHandlers<TValue, THandlers>;
};

export class MiddlewareExecutor<TValue, THandlers extends string> {
  readonly id: string;
  private middleware: Middleware<TValue, THandlers>[] = [];

  constructor() {
    this.id = generateUUIDv4();
  }

  use(middleware: Middleware<TValue, THandlers> | Middleware<TValue, THandlers>[]) {
    this.middleware = this.middleware.concat(middleware);
    return this;
  }

  // todo: document how to re-arrange the order of middleware using replace
  replace(middleware: Middleware<TValue, THandlers>[]) {
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

  insert({
    middleware,
    position,
    unique,
  }: {
    middleware: Middleware<TValue, THandlers>[];
    position: InsertPosition;
    unique?: boolean;
  }) {
    if (unique) {
      middleware.forEach((md) => {
        const existingMiddlewareIndex = this.middleware.findIndex((m) => m.id === md.id);
        if (existingMiddlewareIndex >= 0) {
          this.middleware.splice(existingMiddlewareIndex, 1);
        }
      });
    }
    const targetId = position.after || position.before;
    const targetIndex = this.middleware.findIndex((m) => m.id === targetId);
    const insertionIndex = position.after ? targetIndex + 1 : targetIndex;
    this.middleware.splice(insertionIndex, 0, ...middleware);
    return this;
  }

  setOrder(order: string[]) {
    this.middleware = order
      .map((id) => this.middleware.find((middleware) => middleware.id === id))
      .filter(Boolean) as Middleware<TValue, THandlers>[];
  }

  remove(middlewareIds: string | string[]) {
    if (!middlewareIds && !middlewareIds.length) return;
    this.middleware = this.middleware.filter((md) =>
      typeof middlewareIds === 'string'
        ? middlewareIds !== md.id
        : !middlewareIds.includes(md.id),
    );
  }

  protected async executeMiddlewareChain({
    eventName,
    initialValue,
    mode = 'cancelable',
  }: ExecuteParams<TValue>): Promise<MiddlewareExecutionResult<TValue>> {
    let index = -1;

    const execute = async (
      i: number,
      state: TValue,
      status?: MiddlewareStatus,
    ): Promise<MiddlewareExecutionResult<TValue>> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }

      index = i;

      const returnFromChain =
        i === this.middleware.length ||
        (status && ['complete', 'discard'].includes(status));
      if (returnFromChain) return { state, status };

      const middleware = this.middleware[i];
      const handler = middleware.handlers[eventName as THandlers];

      if (!handler) {
        return execute(i + 1, state, status);
      }

      const next = (adjustedState: TValue) => execute(i + 1, adjustedState);
      const complete = (adjustedState: TValue) =>
        execute(i + 1, adjustedState, 'complete');
      const discard = () => execute(i + 1, state, 'discard');
      const forward = () => execute(i + 1, state);

      return await handler({
        state,
        next,
        complete,
        discard,
        forward,
      });
    };

    const result =
      mode === 'cancelable'
        ? await withCancellation(
            `middleware-execution-${this.id}-${eventName}`,
            async (abortSignal) => {
              const result = await execute(0, initialValue);
              if (abortSignal.aborted) {
                return 'canceled';
              }
              return result;
            },
          )
        : await execute(0, initialValue);

    return result === 'canceled' ? { state: initialValue, status: 'discard' } : result;
  }

  async execute({
    eventName,
    initialValue: initialState,
    mode,
  }: ExecuteParams<TValue>): Promise<MiddlewareExecutionResult<TValue>> {
    return await this.executeMiddlewareChain({
      eventName,
      initialValue: initialState,
      mode,
    });
  }
}
