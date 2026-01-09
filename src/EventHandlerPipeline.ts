import { generateUUIDv4 } from './utils';
import type { Event } from './types';
import type { Unsubscribe } from './store';

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
  event: Event;
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
   * Insert a handler into the pipeline at the given index.
   *
   * - If `replace` is `true` and the index is within bounds, the existing handler
   *   at that position will be replaced by the new one.
   *   - If `revertOnUnsubscribe` is also `true`, then calling the returned
   *     unsubscribe will both remove the inserted handler *and* restore the
   *     previously replaced handler at the same index.
   * - If `replace` is `false` (default), the new handler is inserted at the index
   *   (or appended if the index is greater than the pipeline size). Unsubscribe
   *   will only remove this handler.
   *
   * @param handler             The handler function to insert.
   * @param index               Target index in the pipeline (clamped to valid range).
   * @param replace             If true, replace existing handler at index instead of inserting.
   * @param revertOnUnsubscribe   If true, restore the replaced handler when unsubscribing.
   * @returns                   An unsubscribe function that removes (and optionally restores) the handler.
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

  /**
   * Remove handler by:
   * - handler function identity or
   * - by id that could be an exact match or
   * - match by regexp.
   * @param params {FindEventHandlerParams}
   */
  remove(params: FindEventHandlerParams<CTX>): void {
    let index = this.findIndex(params);
    // need to perform n+1 searches in case the search is done by regex => there can be multiple matches
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
   * Queue an event for processing. Events are processed serially, in the order
   * `run` is called. Returns a promise that resolves/rejects for this specific
   * event’s processing, while the internal chain continues (errors won’t break it).
   */
  run(event: Event, ctx: CTX): Promise<void> {
    let resolveTask!: () => void;
    let rejectTask!: (e: unknown) => void;
    // Per-task promise the caller can await
    const taskPromise = new Promise<void>((res, rej) => {
      resolveTask = res;
      rejectTask = rej;
    });

    // Queue this event’s work
    this.runnerExecutionPromise = this.runnerExecutionPromise
      .then(async () => {
        try {
          await this.processOne(event, ctx);
          resolveTask();
        } catch (e) {
          // Reject this task’s promise, but keep the chain alive.
          rejectTask(e);
        }
      })
      .catch((e) => {
        console.error(`[pipeline:${this.id}] execution error`, e);
        // Ensure the chain remains resolved for the next enqueue:
        this.runnerExecutionPromise = Promise.resolve();
      });

    return taskPromise;
  }

  /**
   * Wait until all queued events have been processed.
   */
  async drain(): Promise<void> {
    await this.runnerExecutionPromise;
  }

  /**
   * Process a single event through a stable snapshot of handlers to avoid
   * mid-iteration mutations (insert/remove) affecting this run.
   */
  private async processOne(event: Event, ctx: CTX): Promise<void> {
    const snapshot = this.handlers.slice();
    for (let i = 0; i < snapshot.length; i++) {
      const handler = snapshot[i];
      try {
        const result = await handler.handle({ event, ctx });
        if (result?.action === 'stop') return;
      } catch {
        console.error(`[pipeline:${this.id}] handler failed`, {
          handlerId: handler.id ?? 'unknown',
          handlerIndex: i,
        });
      }
    }
  }
}
