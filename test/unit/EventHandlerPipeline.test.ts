import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EventHandlerPipeline,
  type LabeledEventHandler,
} from '../../src/EventHandlerPipeline';

type TestEvent = { type: string; payload?: any };
type TestCtx = { tag: string };

const makeEvt = (type: string): TestEvent => ({ type });
const ctx: TestCtx = { tag: 'ctx' };

describe('EventHandlerPipeline', () => {
  let pipeline: EventHandlerPipeline<TestCtx>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pipeline = new EventHandlerPipeline<TestCtx>({ id: 'test-pipe' });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('constructor & size', () => {
    it('initializes with id and zero handlers', () => {
      expect(pipeline.id).toBe('test-pipe');
      expect(pipeline.size).toBe(0);
    });
  });

  describe('insert', () => {
    it('appends by default when no index', async () => {
      const calls: string[] = [];
      const h1 = {
        id: 'h1',
        handle: () => {
          calls.push('h1');
        },
      };
      const h2 = {
        id: 'h2',
        handle: () => {
          calls.push('h2');
        },
      };

      pipeline.insert(h1);
      pipeline.insert(h2);

      expect(pipeline.size).toBe(2);
      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('x'), ctx).then(() => {
        expect(calls).toEqual(['h1', 'h2']);
      });
    });

    it('inserts at clamped index (negative -> 0, too large -> append)', () => {
      const order: string[] = [];
      const a = {
        id: 'a',
        handle: () => {
          order.push('a');
        },
      };
      const b = {
        id: 'b',
        handle: () => {
          order.push('b');
        },
      };
      const c = {
        id: 'c',
        handle: () => {
          order.push('c');
        },
      };
      const d = {
        id: 'd',
        handle: () => {
          order.push('d');
        },
      };

      pipeline.insert(a); // [a]
      pipeline.insert(b); // [a,b]
      pipeline.insert({ ...c, index: -10 }); // clamp to 0 => [c,a,b]
      pipeline.insert({ ...d, index: 999 }); // append => [c,a,b,d]

      expect(pipeline.size).toBe(4);
      // @ts-expect-error passing custom event type
      return pipeline.run(makeEvt('e'), ctx).then(() => {
        expect(order).toEqual(['c', 'a', 'b', 'd']);
      });
    });

    it('replace=false inserts and unsubscribe removes only target handler', async () => {
      const calls: string[] = [];
      const a = {
        id: 'a',
        handle: () => {
          calls.push('a');
        },
      };
      const b = {
        id: 'b',
        handle: () => {
          calls.push('b');
        },
      };

      const unsubA = pipeline.insert({ ...a, index: 0, replace: false });
      const unsubB = pipeline.insert({ ...b, index: 0, replace: false });
      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('x'), ctx);
      expect(calls).toEqual(['b', 'a']);

      unsubB(); // remove only b
      expect(pipeline.size).toBe(1);

      // reset the array contents
      calls.length = 0;
      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('y'), ctx);
      expect(calls).toEqual(['a']);

      unsubA();
      expect(pipeline.size).toBe(0);
    });

    it('replace=true replaces existing handler and revertOnUnsubscribe restores it', async () => {
      const calls: string[] = [];
      const orig = {
        id: 'orig',
        handle: () => {
          calls.push('orig');
        },
      };
      const repl = {
        id: 'repl',
        handle: () => {
          calls.push('repl');
        },
      };

      // seed
      pipeline.insert({ ...orig, index: 0 });
      // replace at 0 with repl
      const unsub = pipeline.insert({
        ...repl,
        index: 0,
        replace: true,
        revertOnUnsubscribe: true,
      });

      // handlers: [repl]
      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('1'), ctx);
      expect(calls).toEqual(['repl']);

      // unsubscribe => remove repl and restore orig at index 0
      unsub();
      calls.length = 0;

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('2'), ctx);
      expect(calls).toEqual(['orig']);
    });

    it('replace=true at index >= length behaves like insert (does not revert)', async () => {
      const calls: string[] = [];
      const a = {
        id: 'a',
        handle: () => {
          calls.push('a');
        },
      };
      const repl = {
        id: 'repl',
        handle: () => {
          calls.push('repl');
        },
      };

      pipeline.insert(a); // [a]
      const unsub = pipeline.insert({
        ...repl,
        index: 5,
        replace: true,
        revertOnUnsubscribe: true,
      }); //[a,repl]

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('x'), ctx);
      expect(calls).toEqual(['a', 'repl']); // reverse exec

      unsub(); // should only remove repl; no original to restore
      calls.length = 0;
      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('y'), ctx);
      expect(calls).toEqual(['a']);
    });
  });

  describe('remove', () => {
    it('removes by handler object identity', async () => {
      const out: string[] = [];
      const h1: LabeledEventHandler<TestCtx> = {
        id: 'h1',
        handle: () => {
          out.push('h1');
        },
      };
      const h2: LabeledEventHandler<TestCtx> = {
        id: 'h2',
        handle: () => {
          out.push('h2');
        },
      };

      pipeline.insert(h1);
      pipeline.insert(h2);
      pipeline.remove(h2); // remove by object

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('evt'), ctx);
      expect(out).toEqual(['h1']); // reverse exec; only h1 left
    });

    it('removes by function reference', async () => {
      const out: string[] = [];
      const fn = () => {
        out.push('fn');
      };
      const h1: LabeledEventHandler<TestCtx> = { id: 'h1', handle: fn };
      pipeline.insert(h1);
      pipeline.remove(fn); // remove by function ref

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('evt'), ctx);
      expect(out).toEqual([]); // removed
    });

    it('no-op remove for unknown handler', async () => {
      const out: string[] = [];
      const fn = () => {
        out.push('a');
      };
      pipeline.remove(fn); // nothing inserted yet

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('evt'), ctx); // no errors
      expect(out).toEqual([]);
      expect(pipeline.size).toBe(0);
    });
  });

  describe('replaceAll & clear', () => {
    it('replaceAll swaps the entire handler list', async () => {
      const out: string[] = [];
      const a = {
        id: 'a',
        handle: () => {
          out.push('a');
        },
      };
      const b = {
        id: 'b',
        handle: () => {
          out.push('b');
        },
      };
      const c = {
        id: 'c',
        handle: () => {
          out.push('c');
        },
      };

      pipeline.insert(a);
      pipeline.insert(b);
      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('e'), ctx);
      expect(out).toEqual(['a', 'b']);
      out.length = 0;

      pipeline.replaceAll([c]);
      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('e2'), ctx);
      expect(out).toEqual(['c']);
      expect(pipeline.size).toBe(1);
    });

    it('clear removes all handlers', async () => {
      const out: string[] = [];
      pipeline.insert({
        id: 'a',
        handle: () => {
          out.push('a');
        },
      });
      pipeline.insert({
        id: 'b',
        handle: () => {
          out.push('b');
        },
      });
      expect(pipeline.size).toBe(2);

      pipeline.clear();
      expect(pipeline.size).toBe(0);

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('e'), ctx);
      expect(out).toEqual([]); // nothing ran
    });
  });

  describe('run / drain / execution order', () => {
    it('serializes events: second run waits for the first to finish', async () => {
      const seen: string[] = [];
      let hAsyncHandlerRunCount = 0;
      let resolveRun1!: () => void;
      const hAsync = {
        id: 'async',
        handle: () =>
          new Promise<void>((res) => {
            if (hAsyncHandlerRunCount === 0) {
              resolveRun1 = () => {
                seen.push('A-done');
                res();
              };
              ++hAsyncHandlerRunCount;
            } else {
              setTimeout(() => {
                seen.push('A-done');
                res();
              }, 0);
            }
            seen.push('A-start');
          }),
      };

      const hSync = {
        id: 'sync',
        handle: () => {
          seen.push('B-run');
        },
      };

      pipeline.insert(hAsync);
      pipeline.insert(hSync);

      // @ts-expect-error passing custom event type
      const eventRun1 = pipeline.run(makeEvt('ev1'), ctx);
      // @ts-expect-error passing custom event type
      const eventRun2 = pipeline.run(makeEvt('ev2'), ctx);

      // At this point, first run has started (A-start),
      // but the hSync is not run until we resolveRun1 and then eventRun1 can be resolved
      await Promise.resolve(); // tick microtasks
      expect(seen).toEqual(['A-start']);

      resolveRun1();
      await eventRun1;
      expect(seen).toEqual(['A-start', 'A-done', 'B-run']);

      // Now second event runs
      await eventRun2;

      // total should be 6 entries
      expect(seen).toEqual(['A-start', 'A-done', 'B-run', 'A-start', 'A-done', 'B-run']);
    });

    it('drain waits for the last queued event to finish', async () => {
      const marks: string[] = [];
      let handlerRunCount = 0;
      let resolveLater!: () => void;

      pipeline.insert({
        id: 'hold',
        handle: () =>
          new Promise<void>((res) => {
            if (handlerRunCount === 0) {
              resolveLater = () => {
                marks.push('released');
                res();
              };
              ++handlerRunCount;
            } else {
              setTimeout(() => {
                marks.push('released');
                res();
              }, 0);
            }
            marks.push('held');
          }),
      });

      // @ts-expect-error passing custom event type
      pipeline.run(makeEvt('e1'), ctx);
      // @ts-expect-error passing custom event type
      pipeline.run(makeEvt('e2'), ctx);
      const drained = pipeline.drain();

      await Promise.resolve();
      expect(marks).toEqual(['held']); // first event started

      resolveLater(); // finish first; second starts then finishes too
      expect(marks).toEqual(['held', 'released']); // first event started
      await drained;
      expect(marks).toEqual(['held', 'released', 'held', 'released']);
    });

    it('stop action halts remaining handlers for that event only', async () => {
      const order: string[] = [];
      pipeline.insert({
        id: 'a',
        handle: () => {
          order.push('a');
        },
      });
      pipeline.insert({
        id: 'stopper',
        handle: () => {
          order.push('stopper');
          return { action: 'stop' };
        },
      });
      pipeline.insert({
        id: 'c',
        handle: () => {
          order.push('c');
        },
      });

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('e'), ctx);
      expect(order).toEqual(['a', 'stopper']);
    });

    it('handler exceptions are logged but do not break processing', async () => {
      const order: string[] = [];
      const before = {
        id: 'before',
        handle: () => {
          order.push('before');
        },
      };

      const boom = {
        id: 'boom',
        handle: () => {
          order.push('boom');
          throw new Error('fail');
        },
      };

      const after = {
        id: 'after',
        handle: () => {
          order.push('after');
        },
      };

      pipeline.insert(before);
      pipeline.insert(boom);
      pipeline.insert(after);

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('e'), ctx);
      // reverse exec: after -> boom -> before; boom throws but processing continues
      expect(order).toEqual(['before', 'boom', 'after']);
      expect(consoleErrorSpy).toHaveBeenCalled(); // logged
    });

    it('snapshot isolation: handlers added during a run do not affect the current event', async () => {
      const order: string[] = [];

      const late = {
        id: 'late',
        handle: () => {
          order.push('late');
        },
      };
      const head = {
        id: 'head',
        handle: () => {
          order.push('head');
        },
      };
      const inserter = {
        id: 'inserter',
        handle: () => {
          order.push('inserter');
          // insert a new handler while processing this event
          pipeline.insert(late);
        },
      };
      const tail = {
        id: 'tail',
        handle: () => {
          order.push('tail');
        },
      };

      pipeline.insert(head);
      pipeline.insert(inserter);
      pipeline.insert(tail);

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('e1'), ctx);
      // 'late' must NOT run for e1
      expect(order).toEqual(['head', 'inserter', 'tail']);

      order.length = 0;

      // @ts-expect-error passing custom event type
      await pipeline.run(makeEvt('e2'), ctx);
      // For the next event, late is present
      expect(order).toEqual(['head', 'inserter', 'tail', 'late']);
    });
  });
});
