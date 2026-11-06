import { describe, expect, it, vi } from 'vitest';
import { ConfigController } from '../../../src/configuration/ConfigController';

type Config = {
  debounceMs: number;
  durations: { error: number; info: number };
  pageSize: number;
};

const DEFAULTS: Config = {
  debounceMs: 300,
  durations: { error: 3000, info: 3000 },
  pageSize: 10,
};

const make = (options: Partial<Parameters<typeof ConfigController<Config>>[0]> = {}) =>
  new ConfigController<Config>({ defaults: DEFAULTS, ...options });

describe('ConfigController', () => {
  describe('defaults', () => {
    it('freezes the defaults it is handed, even unfrozen ones', () => {
      // Every default constant in the package freezes itself, so this looks redundant — it is not. It is
      // what stops the *next* entity reintroducing the leak that was found three times (F3, the
      // notification durations under G8, and the reminder offsets) by forgetting to freeze its own.
      const unfrozen: Config = {
        debounceMs: 1,
        durations: { error: 1, info: 1 },
        pageSize: 1,
      };

      make({ defaults: unfrozen });

      expect(Object.isFrozen(unfrozen)).toBe(true);
      expect(Object.isFrozen(unfrozen.durations)).toBe(true);
    });
  });

  describe('layering', () => {
    it('applies defaults, built-in defaults, the slice, then constructor options', () => {
      // `docs/instance-configuration.md` §3 order. The integrator's construction argument is stage 3 and
      // outranks the declarative tree at stage 2; anything the SDK supplies on the instance's behalf is
      // stage 1 and loses to both.
      const controller = make({
        builtInDefaults: { pageSize: 15, debounceMs: 15 },
        constructorOptions: { pageSize: 20 },
      });

      controller.initialize({ pageSize: 30, debounceMs: 40 });

      expect(controller.value.pageSize).toBe(20); // construction argument wins
      expect(controller.value.debounceMs).toBe(40); // slice beats the built-in default
    });

    it('lets a declarative slice override a built-in default', () => {
      const controller = make({ builtInDefaults: { pageSize: 15 } });

      controller.initialize({ pageSize: 30 });

      expect(controller.value.pageSize).toBe(30);
    });

    it('ignores an explicit undefined rather than writing it', () => {
      // `Partial<T>` admits `undefined`, and a plain spread would write it — turning "I did not set this"
      // into "I set this to nothing" and wiping the default underneath.
      const controller = make({ constructorOptions: { pageSize: undefined } });

      expect(controller.value.pageSize).toBe(10);

      controller.initialize({ debounceMs: undefined });

      expect(controller.value.debounceMs).toBe(300);
    });

    it('drops a previous slice on re-derivation but keeps constructor options', () => {
      const controller = make({ constructorOptions: { pageSize: 20 } });
      controller.initialize({ pageSize: 30 });

      controller.initialize();

      expect(controller.value.pageSize).toBe(20);
    });

    it('keeps nested siblings when mergeSlice is deep', () => {
      const controller = make({ mergeSlice: 'deep' });

      controller.initialize({ durations: { error: 99 } } as Partial<Config>);

      expect(controller.value.durations).toEqual({ error: 99, info: 3000 });
    });

    it('seeds from initialSlice without running getBehaviourOverrides', () => {
      // The hook is an override on the owning class; running it from the controller's constructor would
      // reach a subclass before its own fields exist.
      const getBehaviourOverrides = vi.fn(() => ({ pageSize: 999 }));

      const controller = make({ getBehaviourOverrides, initialSlice: { pageSize: 30 } });

      expect(getBehaviourOverrides).not.toHaveBeenCalled();
      expect(controller.value.pageSize).toBe(30);
    });

    it('lets behaviour overrides outrank everything on initialize', () => {
      const controller = make({
        constructorOptions: { pageSize: 20 },
        getBehaviourOverrides: () => ({ pageSize: 999 }),
      });

      controller.initialize({ pageSize: 30 });

      expect(controller.value.pageSize).toBe(999);
    });
  });

  describe('writes', () => {
    it('skips a patch that changes nothing', () => {
      const controller = make();
      const listener = vi.fn();
      controller.state.subscribe(listener);
      listener.mockClear();

      controller.patch({ pageSize: DEFAULTS.pageSize });

      expect(listener).not.toHaveBeenCalled();
    });

    it('skips a derivation that changes nothing', () => {
      const controller = make();
      const listener = vi.fn();
      controller.state.subscribe(listener);
      listener.mockClear();

      controller.initialize();
      controller.initialize();

      expect(listener).not.toHaveBeenCalled();
    });

    it('publishes once when something moves', () => {
      const controller = make();
      const listener = vi.fn();
      controller.state.subscribe(listener);
      listener.mockClear();

      controller.patch({ pageSize: 42 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(controller.value.pageSize).toBe(42);
    });
  });

  /**
   * `serverAuthority.ts` says the restrictions have to run on every route a configuration can change by,
   * because one applied at construction alone stops holding the first time anything updates the config.
   * `patch` was the exception: without `retainPatches` it spreads into the resolved value and writes it
   * directly, which is the one path that does not go through `resolve`.
   */
  describe('applyAuthority on the patch path', () => {
    const cap = (config: Config) => ({
      ...config,
      pageSize: Math.min(config.pageSize, 25),
    });

    it('applies authority to a patch when patches are not retained', () => {
      const controller = make({ applyAuthority: cap });

      controller.patch({ pageSize: 500 });

      expect(controller.value.pageSize).toBe(25);
    });

    it('applies authority to a patch when patches are retained', () => {
      const controller = make({ applyAuthority: cap, retainPatches: true });

      controller.patch({ pageSize: 500 });

      expect(controller.value.pageSize).toBe(25);
      // Retained, so the request survives for a later resolution to honour if the ceiling lifts.
      expect(controller.requested.pageSize).toBe(500);
    });

    it('does not retain the request without retainPatches', () => {
      const controller = make({ applyAuthority: cap });

      controller.patch({ pageSize: 500 });

      // Refused outright rather than remembered — the documented consequence of leaving retainPatches off
      // on a controller a server can narrow.
      expect(controller.requested.pageSize).toBe(DEFAULTS.pageSize);
    });

    it('still lets an explicit undefined clear a field', () => {
      const controller = make({ applyAuthority: cap });

      controller.patch({ debounceMs: undefined as never });

      expect(controller.value.debounceMs).toBeUndefined();
    });
  });

  describe('onChanged', () => {
    it('is not called for the initial value', () => {
      const onChanged = vi.fn();

      make({ onChanged, initialSlice: { pageSize: 30 } });

      expect(onChanged).not.toHaveBeenCalled();
    });

    it('receives the new and previous values', () => {
      const onChanged = vi.fn();
      const controller = make({ onChanged });

      controller.patch({ pageSize: 42 });

      expect(onChanged).toHaveBeenCalledTimes(1);
      const [next, previous] = onChanged.mock.calls[0];
      expect(next.pageSize).toBe(42);
      expect(previous.pageSize).toBe(10);
    });

    it('is not called when the write was skipped', () => {
      const onChanged = vi.fn();
      const controller = make({ onChanged });

      controller.patch({ pageSize: DEFAULTS.pageSize });

      expect(onChanged).not.toHaveBeenCalled();
    });
  });
});
