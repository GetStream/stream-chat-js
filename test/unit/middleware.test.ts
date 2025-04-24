import { beforeEach, describe, expect, it } from 'vitest';
import {
  InsertPosition,
  Middleware,
  MiddlewareExecutor,
  MiddlewareStatus,
} from '../../src/middleware';

describe('MiddlewareExecutor', () => {
  let executor: MiddlewareExecutor<{ value: number }>;

  beforeEach(() => {
    executor = new MiddlewareExecutor<{ value: number }>();
  });

  describe('use', () => {
    it('should add middleware to the executor', () => {
      const middleware: Middleware<{ value: number }> = {
        id: 'test-middleware',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      executor.use(middleware);

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(1);
      expect(middlewareList[0]).toBe(middleware);
    });

    it('should add multiple middleware when array is provided', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'test-middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'test-middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      executor.use([middleware1, middleware2]);

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(2);
      expect(middlewareList[0]).toBe(middleware1);
      expect(middlewareList[1]).toBe(middleware2);
    });

    it('should return the executor for chaining', () => {
      const middleware: Middleware<{ value: number }> = {
        id: 'test-middleware',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const result = executor.use(middleware);
      expect(result).toBe(executor);
    });
  });

  describe('replace', () => {
    it('should replace existing middleware with the same id', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'test-middleware',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'test-middleware',
        test: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value + 1 } });
        },
      };

      executor.use(middleware1);
      executor.replace([middleware2]);

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(1);
      expect(middlewareList[0]).toBe(middleware2);
    });

    it('should add new middleware if id does not exist', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'test-middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'test-middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      executor.use(middleware1);
      executor.replace([middleware2]);

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(2);
      expect(middlewareList[0]).toBe(middleware1);
      expect(middlewareList[1]).toBe(middleware2);
    });

    it('should return the executor for chaining', () => {
      const middleware: Middleware<{ value: number }> = {
        id: 'test-middleware',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const result = executor.replace([middleware]);
      expect(result).toBe(executor);
    });
  });

  describe('insert', () => {
    it('should insert middleware after specified middleware', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware3: Middleware<{ value: number }> = {
        id: 'middleware-3',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      executor.use([middleware1, middleware3]);

      const position: InsertPosition = { after: 'middleware-1' };
      executor.insert({ middleware: [middleware2], position });

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(3);
      expect(middlewareList[0]).toBe(middleware1);
      expect(middlewareList[1]).toBe(middleware2);
      expect(middlewareList[2]).toBe(middleware3);
    });

    it('should insert middleware before specified middleware', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware3: Middleware<{ value: number }> = {
        id: 'middleware-3',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      executor.use([middleware1, middleware3]);

      const position: InsertPosition = { before: 'middleware-3' };
      executor.insert({ middleware: [middleware2], position });

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(3);
      expect(middlewareList[0]).toBe(middleware1);
      expect(middlewareList[1]).toBe(middleware2);
      expect(middlewareList[2]).toBe(middleware3);
    });

    it('should remove existing middleware with the same id if unique is true', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2Updated: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value + 1 } });
        },
      };

      executor.use([middleware1, middleware2]);

      const position: InsertPosition = { after: 'middleware-1' };
      executor.insert({ middleware: [middleware2Updated], position, unique: true });

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(2);
      expect(middlewareList[0]).toBe(middleware1);
      expect(middlewareList[1]).toBe(middleware2Updated);
    });

    it('should return the executor for chaining', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      executor.use(middleware1);

      const position: InsertPosition = { after: 'middleware-1' };
      const result = executor.insert({ middleware: [middleware2], position });

      expect(result).toBe(executor);
    });
  });

  describe('setOrder', () => {
    it('should reorder middleware based on provided order', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware3: Middleware<{ value: number }> = {
        id: 'middleware-3',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      executor.use([middleware1, middleware2, middleware3]);

      executor.setOrder(['middleware-3', 'middleware-1', 'middleware-2']);

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(3);
      expect(middlewareList[0]).toBe(middleware3);
      expect(middlewareList[1]).toBe(middleware1);
      expect(middlewareList[2]).toBe(middleware2);
    });

    it('should filter out middleware that does not exist in the order', () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler(input);
        },
      };

      executor.use([middleware1, middleware2]);

      executor.setOrder(['middleware-2', 'non-existent-middleware', 'middleware-1']);

      // Access private property for testing
      const middlewareList = (executor as any).middleware;
      expect(middlewareList).toHaveLength(2);
      expect(middlewareList[0]).toBe(middleware2);
      expect(middlewareList[1]).toBe(middleware1);
    });
  });

  describe('execute', () => {
    it('should execute middleware chain in order', async () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value + 1 } });
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value * 2 } });
        },
      };

      executor.use([middleware1, middleware2]);

      const result = await executor.execute('test', { state: { value: 5 } });

      expect(result.state.value).toBe(12); // (5 + 1) * 2
    });

    it('should skip middleware that does not have the specified event handler', async () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value + 1 } });
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        testX: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value - 2 } });
        },
      };

      const middleware3: Middleware<{ value: number }> = {
        id: 'middleware-3',
        test: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value * 2 } });
        },
      };

      executor.use([middleware1, middleware2, middleware3]);

      const result = await executor.execute('test', { state: { value: 5 } });

      expect(result.state.value).toBe(12); // (5 + 1) * 2
    });

    it('should handle middleware that returns complete status', async () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler({
            ...input,
            state: { value: input.state.value + 1 },
            status: 'complete' as MiddlewareStatus,
          });
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value * 2 } });
        },
      };

      executor.use([middleware1, middleware2]);

      const result = await executor.execute('test', { state: { value: 5 } });

      expect(result.state.value).toBe(6); // 5 + 1, middleware2 is not executed
      expect(result.status).toBe('complete');
    });

    it('should handle middleware that returns discard status', async () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          return nextHandler({
            ...input,
            state: { value: input.state.value + 1 },
            status: 'discard' as MiddlewareStatus,
          });
        },
      };

      const middleware2: Middleware<{ value: number }> = {
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          return nextHandler({ ...input, state: { value: input.state.value * 2 } });
        },
      };

      executor.use([middleware1, middleware2]);

      const result = await executor.execute('test', { state: { value: 5 } });

      expect(result.state.value).toBe(6); // 5 + 1, middleware2 is not executed
      expect(result.status).toBe('discard');
    });

    it('should handle concurrent execute calls by discarding the first one', async () => {
      // Create a middleware that delays execution
      const middleware: Middleware<{ value: number }> = {
        id: 'delayed-middleware',
        test: async ({ input, nextHandler }) => {
          // Simulate a longer delay to ensure the first execution is still in progress
          await new Promise((resolve) => setTimeout(resolve, 500));
          return nextHandler({ ...input, state: { value: input.state.value + 1 } });
        },
      };

      executor.use(middleware);

      // Start the first execution
      const firstExecution = executor.execute('test', { state: { value: 5 } });

      // Wait a short time to ensure the first execution has started but not completed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Start the second execution before the first one completes
      const secondExecution = executor.execute('test', { state: { value: 10 } });

      // Wait for both executions to complete
      const [firstResult, secondResult] = await Promise.all([
        firstExecution,
        secondExecution,
      ]);

      // The first execution should be discarded
      expect(firstResult.status).toBe('discard');

      // The second execution should complete successfully
      expect(secondResult.status).toBeUndefined();
      expect(secondResult.state.value).toBe(11); // 10 + 1
    });

    it('should handle middleware that calls nextHandler multiple times', async () => {
      const middleware1: Middleware<{ value: number }> = {
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          const result1 = await nextHandler({
            ...input,
            state: { value: input.state.value + 1 },
          });
          // This should throw an error
          return nextHandler(result1);
        },
      };

      executor.use([middleware1]);

      await expect(executor.execute('test', { state: { value: 5 } })).rejects.toThrow(
        'next() called multiple times',
      );
    });

    it('should handle concurrent execute calls with different event names', async () => {
      // Create middleware that handles different event names
      const middleware: Middleware<{ value: number }> = {
        id: 'multi-event-middleware',
        test1: async ({ input, nextHandler }) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return nextHandler({ ...input, state: { value: input.state.value + 1 } });
        },
        test2: async ({ input, nextHandler }) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return nextHandler({ ...input, state: { value: input.state.value * 2 } });
        },
      };

      executor.use(middleware);

      // Start executions with different event names
      const firstExecution = executor.execute('test1', { state: { value: 5 } });
      const secondExecution = executor.execute('test2', { state: { value: 10 } });

      // Wait for both executions to complete
      const [firstResult, secondResult] = await Promise.all([
        firstExecution,
        secondExecution,
      ]);

      // Both executions should complete successfully since they use different event names
      expect(firstResult.status).toBeUndefined();
      expect(firstResult.state.value).toBe(6); // 5 + 1

      expect(secondResult.status).toBeUndefined();
      expect(secondResult.state.value).toBe(20); // 10 * 2
    });

    it('should execute two different middleware executors with the same event name without cancellation', async () => {
      const results: number[] = [];

      // Create two different middleware executors
      const executor1 = new MiddlewareExecutor<{ value: number }>();
      const executor2 = new MiddlewareExecutor<{ value: number }>();

      // Add middleware to each executor
      executor1.use({
        id: 'middleware-1',
        test: async ({ input, nextHandler }) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          results.push(1);
          return nextHandler({ ...input, state: { value: input.state.value + 1 } });
        },
      });

      executor2.use({
        id: 'middleware-2',
        test: async ({ input, nextHandler }) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          results.push(2);
          return nextHandler({ ...input, state: { value: input.state.value * 2 } });
        },
      });

      // Execute the same event name on different executors concurrently
      const p1 = executor1.execute('test', { state: { value: 5 } });
      const p2 = executor2.execute('test', { state: { value: 10 } });

      // Wait for both executions to complete
      const [r1, r2] = await Promise.all([p1, p2]);

      // Both executions should complete successfully
      expect(results).toEqual([1, 2]);
      expect(r1.state.value).toBe(6); // 5 + 1
      expect(r2.state.value).toBe(20); // 10 * 2
    });
  });
});
