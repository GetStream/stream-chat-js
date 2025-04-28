import { describe, it, expect, vi } from 'vitest';
import {
  withCancellation,
  withoutConcurrency,
  hasPending,
  settled,
} from '../../../src/utils/concurrency';

describe('concurrency', () => {
  describe('withCancellation', () => {
    it('should cancel previous function when a new one is scheduled', async () => {
      const results: number[] = [];

      const fn1 = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          return 'canceled';
        }
        results.push(1);
        return 1;
      };

      const fn2 = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          return 'canceled';
        }
        results.push(2);
        return 2;
      };

      const fn3 = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          return 'canceled';
        }
        results.push(3);
        return 3;
      };

      const tag = 'test-tag';

      // Run functions serially
      const p1 = withCancellation(tag, fn1);
      const p2 = withCancellation(tag, fn2);
      const p3 = withCancellation(tag, fn3);

      // Wait for all promises to resolve
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      // Check that functions ran in order
      expect(results).toEqual([3]);
      expect(r1).toBe('canceled');
      expect(r2).toBe('canceled');
      expect(r3).toBe(3);
    });

    it('should not cancel functions with different tags', async () => {
      const results: number[] = [];
      const abortedSignals: AbortSignal[] = [];

      const fn1 = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          abortedSignals.push(signal);
          return 'canceled';
        }
        results.push(1);
        return 1;
      };

      const fn2 = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          abortedSignals.push(signal);
          return 'canceled';
        }
        results.push(2);
        return 2;
      };

      const tag1 = 'test-tag-1';
      const tag2 = 'test-tag-2';

      // Start functions with different tags
      const p1 = withCancellation(tag1, fn1);
      const p2 = withCancellation(tag2, fn2);

      // Wait for both promises to resolve
      const [r1, r2] = await Promise.all([p1, p2]);

      // Check that no functions were aborted
      expect(abortedSignals.length).toBe(0);

      // Check that both functions completed successfully
      expect(results).toEqual([1, 2]);
      expect(r1).toBe(1);
      expect(r2).toBe(2);
    });

    it('should handle errors in functions', async () => {
      const fn = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          return 'canceled';
        }
        throw new Error('Test error');
      };

      const tag = 'test-tag';

      // Run the function and expect it to throw
      await expect(withCancellation(tag, fn)).rejects.toThrow('Test error');
    });

    it('should handle cancellation of a function that throws an error', async () => {
      const results: number[] = [];

      const fn1 = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (signal.aborted) {
          return 'canceled';
        }
        throw new Error('Test error');
      };

      const fn2 = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          return 'canceled';
        }
        results.push(2);
        return 2;
      };

      const tag = 'test-tag';

      // Start the first function
      const p1 = withCancellation(tag, fn1);

      // Wait a short time to ensure the first function has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start the second function before the first one completes
      const p2 = withCancellation(tag, fn2);

      // Wait for both promises to resolve
      const [r1, r2] = await Promise.all([p1, p2]);

      // Check that the first function was canceled
      expect(r1).toBe('canceled');

      // Check that the second function completed successfully
      expect(results).toEqual([2]);
      expect(r2).toBe(2);
    });
  });

  describe('withoutConcurrency', () => {
    it('should run functions serially', async () => {
      const fn1 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 1;
      };

      const fn2 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 2;
      };

      const fn3 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 3;
      };

      const tag = 'test-tag';

      // Run functions serially
      const p1 = withoutConcurrency(tag, fn1);
      const p2 = withoutConcurrency(tag, fn2);
      const p3 = withoutConcurrency(tag, fn3);

      // Wait for all promises to resolve
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      // Check that functions ran in order
      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(r3).toBe(3);
    });

    it('should not cancel previous function when a new one is scheduled', async () => {
      const fn1 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 1;
      };

      const fn2 = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 2;
      };

      const tag = 'test-tag';

      // Start the first function
      const p1 = withoutConcurrency(tag, fn1);

      // Wait a short time to ensure the first function has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Start the second function before the first one completes
      const p2 = withoutConcurrency(tag, fn2);

      // Wait for both promises to resolve
      const [r1, r2] = await Promise.all([p1, p2]);

      // Check that both functions completed successfully
      expect(r1).toBe(1);
      expect(r2).toBe(2);
    });
  });

  describe('hasPending', () => {
    it('should return true if there is a pending promise', async () => {
      const fn = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          return 'canceled';
        }
        return 1;
      };

      const tag = 'test-tag';

      // Start the function
      const p = withCancellation(tag, fn);

      // Check that there is a pending promise
      expect(hasPending(tag)).toBe(true);

      // Wait for the promise to resolve
      await p;

      // Check that there is no pending promise
      expect(hasPending(tag)).toBe(false);
    });

    it('should return false if there is no pending promise', () => {
      const tag = 'test-tag';

      // Check that there is no pending promise
      expect(hasPending(tag)).toBe(false);
    });
  });

  describe('settled', () => {
    it('should wait for the pending promise to resolve', async () => {
      const results: number[] = [];

      const fn = async (signal: AbortSignal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          return 'canceled';
        }
        results.push(1);
        return 1;
      };

      const tag = 'test-tag';

      // Start the function
      const p = withCancellation(tag, fn);

      // Wait for the promise to settle
      await settled(tag);

      // Check that the function completed
      expect(results).toEqual([1]);

      // Wait for the promise to resolve
      await p;
      expect(p).resolves.toBe(1);
    });
  });
});
