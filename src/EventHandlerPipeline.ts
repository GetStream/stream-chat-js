import { generateUUIDv4 } from './utils';
import type { Event, EventType } from './types';
import type { KeysOfUnion, ValueOfUnion } from './types.utility';
import type { Unsubscribe } from '@stream-io/state-store';

type EventObject = Extract<Event, object>;

/**
 * Flat view of an event for routing without narrowing: every field any `Event` member can carry,
 * all optional. Derived from the `Event` union, so new generated fields are routable automatically.
 */
export type PipelineEvent = {
  type: EventType | (string & {});
} & {
  [Key in KeysOfUnion<EventObject>]?: ValueOfUnion<EventObject, Key>;
};

type MatchById = { id: string | RegExp; regexMatch?: boolean };
export type FindEventHandlerParams<CTX extends Record<string, unknown>> = {
  handler?: LabeledEventHandler<CTX> | EventHandlerPipelineHandler<CTX>;
  idMatch?: MatchById;
};

export type EventHandlerResult = { action: 'stop' }; // event processing run will be cancelled

export type InsertEventHandlerPayload<CTX extends Record<string, unknown>> = {
  handle: EventHandlerPipelineHandler<CTX>;
  index?: number;
  id?: string;
  replace?: boolean;
  revertOnUnsubscribe?: boolean;
};

export type EventHandlerPipelineHandler<CTX extends Record<string, unknown>> = (payload: {
  event: PipelineEvent;
  ctx: CTX;
}) => EventHandlerResult | void | Promise<EventHandlerResult | void>;

export type LabeledEventHandler<CTX extends Record<string, unknown>> = {
  handle: EventHandlerPipelineHandler<CTX>;
  id?: string;
};

export class EventHandlerPipeline<CTX extends Record<string, unknown> = {}> {
  id: string;
  protected handlers: LabeledEventHandler<CTX>[] = [];
  private runnerExecutionPromise = Promise.resolve();

  constructor({ id }: { id: string }) {
    this.id = id;
  }

  get size(): number {
    return this.handlers.length;
  }

  findIndex({ handler, idMatch }: FindEventHandlerParams<CTX>): number {
    let index = -1;
    if (handler) {
      index = this.handlers.findIndex((existingHandler) =>
        typeof (handler as LabeledEventHandler<CTX>).handle === 'function'
          ? (handler as LabeledEventHandler<CTX>).handle === existingHandler.handle
          : handler === existingHandler.handle,
      );
    }

    if (idMatch) {
      index = this.handlers.findIndex((h) => {
        if (!h.id) return false;
        if (idMatch.regexMatch || idMatch.id instanceof RegExp)
          return !!h.id.match(idMatch.id);
        return h.id === idMatch.id;
      });
    }
    return index;
  }

  /**
   * Inserts a handler at `index` (clamped to the pipeline size, default append). With `replace` and
   * an in-bounds index it overwrites the handler there instead, and `revertOnUnsubscribe` restores
   * that handler when the returned unsubscribe runs.
   */
  insert({
    handle,
    id,
    index,
    replace = false,
    revertOnUnsubscribe,
  }: InsertEventHandlerPayload<CTX>): Unsubscribe {
    const validIndex = Math.max(
      0,
      Math.min(index ?? this.handlers.length, this.handlers.length),
    );
    const handler: LabeledEventHandler<CTX> = {
      handle,
      id: id ?? generateUUIDv4(),
    };

    if (replace && validIndex < this.handlers.length) {
      const old = this.handlers[validIndex];
      this.handlers[validIndex] = handler;
      return () => {
        this.remove({ handler });
        if (revertOnUnsubscribe) this.handlers.splice(validIndex, 0, old);
      };
    } else {
      this.handlers.splice(validIndex, 0, handler);
      return () => this.remove({ handler });
    }
  }

  /** Removes every handler matching by function identity, exact id or regexp. */
  remove(params: FindEventHandlerParams<CTX>): void {
    let index = this.findIndex(params);
    while (index > -1) {
      this.handlers.splice(index, 1);
      index = this.findIndex(params);
    }
  }

  replaceAll(handlers: LabeledEventHandler<CTX>[]): void {
    this.handlers = handlers.slice();
  }

  clear(): void {
    this.handlers = [];
  }

  /**
   * Queues an event. Events are processed serially in call order. The promise settles for this
   * event only, a rejection does not break the queue.
   */
  run(event: Event, ctx: CTX): Promise<void> {
    let resolveTask!: () => void;
    let rejectTask!: (e: unknown) => void;
    const taskPromise = new Promise<void>((res, rej) => {
      resolveTask = res;
      rejectTask = rej;
    });

    this.runnerExecutionPromise = this.runnerExecutionPromise
      .then(async () => {
        try {
          await this.processOne(event, ctx);
          resolveTask();
        } catch (e) {
          // Reject this task only, keep the chain alive.
          rejectTask(e);
        }
      })
      .catch((e) => {
        console.error(`[pipeline:${this.id}] execution error`, e);
        this.runnerExecutionPromise = Promise.resolve();
      });

    return taskPromise;
  }

  /** Resolves once all queued events have been processed. */
  async drain(): Promise<void> {
    await this.runnerExecutionPromise;
  }

  /** Runs the event through a snapshot of the handlers, so mid-run changes do not affect it. */
  private async processOne(event: Event, ctx: CTX): Promise<void> {
    const snapshot = this.handlers.slice();
    for (let i = 0; i < snapshot.length; i++) {
      const handler = snapshot[i];
      try {
        const result = await handler.handle({
          event: event as unknown as PipelineEvent,
          ctx,
        });
        if (result?.action === 'stop') return;
      } catch (error) {
        console.error(`[pipeline:${this.id}] handler failed`, {
          error,
          handlerId: handler.id ?? 'unknown',
          handlerIndex: i,
        });
      }
    }
  }
}
