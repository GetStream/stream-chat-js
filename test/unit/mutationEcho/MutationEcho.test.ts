import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MUTATION_ECHO_CONFIG,
  MutationEcho,
} from '../../../src/mutationEcho/MutationEcho';

describe('MutationEcho', () => {
  let echo: MutationEcho;

  beforeEach(() => {
    vi.useFakeTimers();
    echo = new MutationEcho();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordApplied / wasApplied', () => {
    it('reports a recorded key as applied', () => {
      echo.recordApplied('k1');

      expect(echo.wasApplied('k1')).toBe(true);
    });

    it('reports an unrecorded key as not applied', () => {
      echo.recordApplied('k1');

      expect(echo.wasApplied('k2')).toBe(false);
    });

    // Load-bearing: one WS event can drive writes at several gated sites (a `show_in_channel` reply
    // reaches both the channel and the thread). Consuming on match would make the first caller skip and
    // the second apply, decided by dispatch order.
    it('does not consume the entry on read', () => {
      echo.recordApplied('k1');

      expect(echo.wasApplied('k1')).toBe(true);
      expect(echo.wasApplied('k1')).toBe(true);
      expect(echo.wasApplied('k1')).toBe(true);
      expect(echo.size).toBe(1);
    });

    it('treats an undefined key as a no-op in both directions', () => {
      echo.recordApplied(undefined);

      expect(echo.size).toBe(0);
      expect(echo.wasApplied(undefined)).toBe(false);
    });

    it('treats an empty-string key as a no-op in both directions', () => {
      echo.recordApplied('');

      expect(echo.size).toBe(0);
      expect(echo.wasApplied('')).toBe(false);
    });

    it('records the same key twice without growing', () => {
      echo.recordApplied('k1');
      echo.recordApplied('k1');

      expect(echo.size).toBe(1);
      expect(echo.wasApplied('k1')).toBe(true);
    });
  });

  describe('TTL', () => {
    it('stops reporting a key once its TTL has elapsed', () => {
      echo.recordApplied('k1');
      vi.advanceTimersByTime(DEFAULT_MUTATION_ECHO_CONFIG.ttlMs + 1);

      expect(echo.wasApplied('k1')).toBe(false);
    });

    it('still reports a key on the last millisecond of its TTL', () => {
      echo.recordApplied('k1');
      vi.advanceTimersByTime(DEFAULT_MUTATION_ECHO_CONFIG.ttlMs);

      expect(echo.wasApplied('k1')).toBe(true);
    });

    it('drops an expired entry when read, rather than leaving it', () => {
      echo.recordApplied('k1');
      vi.advanceTimersByTime(DEFAULT_MUTATION_ECHO_CONFIG.ttlMs + 1);
      echo.wasApplied('k1');

      expect(echo.size).toBe(0);
    });

    it('sweeps expired entries on write', () => {
      echo.recordApplied('k1');
      echo.recordApplied('k2');
      vi.advanceTimersByTime(DEFAULT_MUTATION_ECHO_CONFIG.ttlMs + 1);
      echo.recordApplied('k3');

      expect(echo.size).toBe(1);
      expect(echo.wasApplied('k3')).toBe(true);
    });

    it('restarts the TTL when the same key is recorded again', () => {
      echo.recordApplied('k1');
      vi.advanceTimersByTime(DEFAULT_MUTATION_ECHO_CONFIG.ttlMs - 1);
      echo.recordApplied('k1');
      vi.advanceTimersByTime(DEFAULT_MUTATION_ECHO_CONFIG.ttlMs - 1);

      expect(echo.wasApplied('k1')).toBe(true);
    });
  });

  describe('eviction', () => {
    it('evicts the oldest entry past maxSize', () => {
      echo.updateConfig({ maxSize: 3 });

      echo.recordApplied('k1');
      echo.recordApplied('k2');
      echo.recordApplied('k3');
      echo.recordApplied('k4');

      expect(echo.size).toBe(3);
      expect(echo.wasApplied('k1')).toBe(false);
      expect(echo.wasApplied('k4')).toBe(true);
    });

    it('never exceeds maxSize', () => {
      echo.updateConfig({ maxSize: 5 });

      for (let i = 0; i < 100; i++) echo.recordApplied(`k${i}`);

      expect(echo.size).toBe(5);
    });

    // Eviction fails open: a dropped entry costs a redundant re-render, never a lost update.
    it('re-recording an existing key does not evict another', () => {
      echo.updateConfig({ maxSize: 3 });

      echo.recordApplied('k1');
      echo.recordApplied('k2');
      echo.recordApplied('k3');
      echo.recordApplied('k3');

      expect(echo.size).toBe(3);
      expect(echo.wasApplied('k1')).toBe(true);
    });
  });

  describe('enabled: false', () => {
    it('makes recordApplied a no-op', () => {
      echo.updateConfig({ enabled: false });
      echo.recordApplied('k1');

      expect(echo.size).toBe(0);
    });

    it('makes wasApplied always false, even for a key recorded while enabled', () => {
      echo.recordApplied('k1');
      echo.updateConfig({ enabled: false });

      expect(echo.wasApplied('k1')).toBe(false);
    });

    it('restores the recorded entry when re-enabled', () => {
      echo.recordApplied('k1');
      echo.updateConfig({ enabled: false });
      echo.updateConfig({ enabled: true });

      expect(echo.wasApplied('k1')).toBe(true);
    });
  });

  describe('clear', () => {
    it('drops every entry', () => {
      echo.recordApplied('k1');
      echo.recordApplied('k2');
      echo.clear();

      expect(echo.size).toBe(0);
      expect(echo.wasApplied('k1')).toBe(false);
    });
  });

  describe('config', () => {
    it('exposes the package defaults', () => {
      expect(echo.config).toEqual(DEFAULT_MUTATION_ECHO_CONFIG);
    });

    it('publishes a config change to subscribers', () => {
      const handler = vi.fn();
      echo.configState.subscribe(handler);
      handler.mockClear();

      echo.updateConfig({ ttlMs: 1234 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(echo.config.ttlMs).toBe(1234);
    });

    // The defaults are a module-level constant shared by every client in the process, so a write
    // through them would change the default for instances created later too.
    it('freezes the package defaults', () => {
      expect(Object.isFrozen(DEFAULT_MUTATION_ECHO_CONFIG)).toBe(true);
      expect(() => {
        (DEFAULT_MUTATION_ECHO_CONFIG as { ttlMs: number }).ttlMs = 1;
      }).toThrow();
    });

    it("keeps two clients' configs independent", () => {
      const other = new MutationEcho();
      echo.updateConfig({ ttlMs: 1234 });

      expect(other.config.ttlMs).toBe(DEFAULT_MUTATION_ECHO_CONFIG.ttlMs);
    });
  });
  describe('trackRequest / hasOpenRequest', () => {
    it('reports an id with an open request', () => {
      echo.trackRequest('m1');

      expect(echo.hasOpenRequest('m1')).toBe(true);
    });

    it('reports an untracked id as having no open request', () => {
      expect(echo.hasOpenRequest('m1')).toBe(false);
    });

    it('treats an undefined id as having no open request', () => {
      expect(echo.hasOpenRequest(undefined)).toBe(false);
    });

    it('clears the mark when the disposer runs', () => {
      const end = echo.trackRequest('m1');
      end();

      expect(echo.hasOpenRequest('m1')).toBe(false);
    });

    // The reason this is a refcount and not a Set: an edit and a delete of the same message can be
    // open at once, and the first to settle must not clear the other's mark.
    it('keeps the mark until every overlapping operation on the id has settled', () => {
      const endFirst = echo.trackRequest('m1');
      const endSecond = echo.trackRequest('m1');

      endFirst();
      expect(echo.hasOpenRequest('m1')).toBe(true);

      endSecond();
      expect(echo.hasOpenRequest('m1')).toBe(false);
    });

    it('ignores a disposer called more than once', () => {
      const endFirst = echo.trackRequest('m1');
      const endSecond = echo.trackRequest('m1');

      endFirst();
      endFirst();

      expect(echo.hasOpenRequest('m1')).toBe(true);
      endSecond();
      expect(echo.hasOpenRequest('m1')).toBe(false);
    });

    it('tolerates a disposer whose entry clear() already dropped', () => {
      const end = echo.trackRequest('m1');
      echo.clear();

      expect(() => end()).not.toThrow();
      expect(echo.openRequestCount).toBe(0);
    });

    it('drops open marks on clear', () => {
      echo.trackRequest('m1');
      echo.trackRequest('m2');
      echo.clear();

      expect(echo.hasOpenRequest('m1')).toBe(false);
      expect(echo.openRequestCount).toBe(0);
    });

    it('tracks nothing while disabled', () => {
      echo.updateConfig({ enabled: false });
      const end = echo.trackRequest('m1');

      expect(echo.hasOpenRequest('m1')).toBe(false);
      expect(() => end()).not.toThrow();
    });

    // Open marks gate arming only. They must never be mistaken for "this write has been applied",
    // which is the W3 failure mode the whole design is built to avoid.
    it('does not make an id look applied', () => {
      echo.trackRequest('m1');

      expect(echo.wasApplied('m1')).toBe(false);
      expect(echo.size).toBe(0);
    });
  });
});
