import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceConfigurationService } from '../../../src/configuration/InstanceConfigurationService';
import { applyInstanceConfiguration } from '../../../src/configuration/applyInstanceConfiguration';

/** Stands in for a keyed instance. `applyInstanceConfiguration` never inspects its argument. */
const instance = () => ({ widget: {} }) as never;

describe('applyInstanceConfiguration', () => {
  let service: InstanceConfigurationService;

  beforeEach(() => {
    service = new InstanceConfigurationService();
  });

  describe('setup functions', () => {
    it('applies a function that was registered before subscribing', () => {
      const setup = vi.fn();
      service.setSetupFunction('myWidget', setup);

      applyInstanceConfiguration({ args: instance(), config: service, key: 'myWidget' });

      expect(setup).toHaveBeenCalledTimes(1);
    });

    it('applies a function that is registered after subscribing', () => {
      const setup = vi.fn();
      applyInstanceConfiguration({ args: instance(), config: service, key: 'myWidget' });

      service.setSetupFunction('myWidget', setup);

      expect(setup).toHaveBeenCalledTimes(1);
    });

    it('applies exactly once at subscribe time, despite watching two stores', () => {
      const setup = vi.fn();
      service.setSetupFunction('myWidget', setup);
      service.setConfig('myWidget', { a: 1 });

      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig: vi.fn(),
      });

      expect(setup).toHaveBeenCalledTimes(1);
    });

    it('runs the previous teardown before applying a replacement', () => {
      const order: string[] = [];
      service.setSetupFunction('myWidget', () => {
        order.push('first');
        return () => order.push('first-teardown');
      });
      applyInstanceConfiguration({ args: instance(), config: service, key: 'myWidget' });

      service.setSetupFunction('myWidget', () => {
        order.push('second');
        return () => order.push('second-teardown');
      });

      expect(order).toEqual(['first', 'first-teardown', 'second']);
    });

    it('runs the teardown when the function is cleared', () => {
      const teardown = vi.fn();
      service.setSetupFunction('myWidget', () => teardown);
      applyInstanceConfiguration({ args: instance(), config: service, key: 'myWidget' });

      service.setSetupFunction('myWidget', null);

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('runs the teardown on unsubscribe', () => {
      const teardown = vi.fn();
      service.setSetupFunction('myWidget', () => teardown);
      const unsubscribe = applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
      });

      unsubscribe();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('stops reacting after unsubscribe', () => {
      const setup = vi.fn();
      const unsubscribe = applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
      });
      unsubscribe();

      service.setSetupFunction('myWidget', setup);

      expect(setup).not.toHaveBeenCalled();
    });

    it('ignores changes to a different key', () => {
      const setup = vi.fn();
      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig: setup,
      });
      setup.mockClear();

      service.setConfig('otherWidget', { a: 1 });
      service.setSetupFunction('otherWidget', vi.fn());

      expect(setup).not.toHaveBeenCalled();
    });
  });

  describe('declarative configuration', () => {
    it('passes the registered slice to applyConfig', () => {
      const applyConfig = vi.fn();
      service.setConfig('myWidget', { pollIntervalMs: 10 });

      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig,
      });

      expect(applyConfig).toHaveBeenCalledWith({ pollIntervalMs: 10 });
    });

    // Called even with nothing registered, and that matters: an instance may derive from inputs other
    // than its own key — the shared `messagePaginator` key, or the server's channel config — so it has
    // to be told to re-derive rather than skipped.
    it('calls applyConfig with undefined when nothing is registered', () => {
      const applyConfig = vi.fn();

      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig,
      });

      expect(applyConfig).toHaveBeenCalledWith(undefined);
    });

    it('is safe to omit applyConfig while configuration is registered', () => {
      service.setConfig('myWidget', { pollIntervalMs: 10 });

      expect(() =>
        applyInstanceConfiguration({
          args: instance(),
          config: service,
          key: 'myWidget',
        }),
      ).not.toThrow();
    });

    it('applies declarative configuration before the setup function', () => {
      const order: string[] = [];
      service.setConfig('myWidget', { pollIntervalMs: 10 });
      service.setSetupFunction('myWidget', () => {
        order.push('setup');
      });

      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig: () => order.push('config'),
      });

      // Tier 2 runs last, so it can override any value tier 1 set.
      expect(order).toEqual(['config', 'setup']);
    });

    it('re-runs the setup function when only the configuration changes, keeping tier 2 on top', () => {
      const order: string[] = [];
      service.setSetupFunction('myWidget', () => {
        order.push('setup');
        return () => order.push('teardown');
      });
      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig: () => order.push('config'),
      });
      order.length = 0;

      service.setConfig('myWidget', { pollIntervalMs: 10 });

      expect(order).toEqual(['teardown', 'config', 'setup']);
    });
  });

  describe('error containment', () => {
    it('contains a throwing setup function', () => {
      service.setSetupFunction('myWidget', () => {
        throw new Error('boom');
      });

      expect(() =>
        applyInstanceConfiguration({
          args: instance(),
          config: service,
          key: 'myWidget',
        }),
      ).not.toThrow();
    });

    it('contains a throwing teardown, and does not retry it', () => {
      const teardown = vi.fn(() => {
        throw new Error('boom');
      });
      service.setSetupFunction('myWidget', () => teardown);
      const unsubscribe = applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
      });

      expect(() => service.setSetupFunction('myWidget', null)).not.toThrow();
      unsubscribe();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('contains a throwing applyConfig and still applies the setup function', () => {
      const setup = vi.fn();
      service.setConfig('myWidget', { pollIntervalMs: 10 });
      service.setSetupFunction('myWidget', setup);

      expect(() =>
        applyInstanceConfiguration({
          args: instance(),
          config: service,
          key: 'myWidget',
          applyConfig: () => {
            throw new Error('boom');
          },
        }),
      ).not.toThrow();
      expect(setup).toHaveBeenCalledTimes(1);
    });

    it('remains usable after a setup function threw', () => {
      applyInstanceConfiguration({ args: instance(), config: service, key: 'myWidget' });
      service.setSetupFunction('myWidget', () => {
        throw new Error('boom');
      });

      const recovered = vi.fn();
      service.setSetupFunction('myWidget', recovered);

      expect(recovered).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset integration', () => {
    it('invokes reinitializeConfig on reset, after the teardown', () => {
      const order: string[] = [];
      service.setSetupFunction('myWidget', () => () => order.push('teardown'));
      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        reinitializeConfig: () => order.push('reinitialize'),
      });

      service.reset('myWidget');

      expect(order).toEqual(['teardown', 'reinitialize']);
    });

    it('does not invoke reinitializeConfig after unsubscribe', () => {
      const reinitializeConfig = vi.fn();
      const unsubscribe = applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        reinitializeConfig,
      });
      unsubscribe();

      service.reset('myWidget');

      expect(reinitializeConfig).not.toHaveBeenCalled();
    });

    // One instance registered under three keys must re-derive **once** per reset, not once per key.
    // Registration used to allocate a fresh `{ reinitializeConfig }` handle per key, so `reset`'s
    // identity-based Set could never collapse them.
    it('re-derives once per reset, not once per registered key', () => {
      const reinitializeConfig = vi.fn();
      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        reinitializeConfig,
        alsoWatch: ['sharedThing', 'otherSharedThing'],
      });

      service.reset();

      expect(reinitializeConfig).toHaveBeenCalledTimes(1);
    });

    it('a global reset does not run a cycle per cleared-but-empty watched key', () => {
      const applyConfig = vi.fn();
      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig,
        alsoWatch: ['sharedThing', 'otherSharedThing'],
      });
      applyConfig.mockClear();

      // Nothing was ever registered on any of the three keys, so clearing them changes nothing —
      // but `partialNext` always allocates, so a plain `subscribe` on a watched store still fired.
      service.reset();

      expect(applyConfig).not.toHaveBeenCalled();
    });
  });

  describe('alsoWatch', () => {
    it('runs the full cycle when a watched store changes, so the setup function stays on top', () => {
      const order: string[] = [];
      service.setSetupFunction('myWidget', () => {
        order.push('setup');
      });
      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig: () => order.push('config'),
        alsoWatch: ['sharedThing'],
      });
      order.length = 0;

      service.setConfig('sharedThing', { a: 1 });

      // Not just `applyConfig` — the setup function is re-applied after it, preserving precedence.
      expect(order).toEqual(['config', 'setup']);
    });

    it('does not fire on subscribe, only on change', () => {
      const applyConfig = vi.fn();
      service.setConfig('sharedThing', { a: 1 });

      applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig,
        alsoWatch: ['sharedThing'],
      });

      // Exactly one apply at wiring time, despite three stores being watched.
      expect(applyConfig).toHaveBeenCalledTimes(1);
    });

    it('stops watching after unsubscribe', () => {
      const applyConfig = vi.fn();
      const unsubscribe = applyInstanceConfiguration({
        args: instance(),
        config: service,
        key: 'myWidget',
        applyConfig,
        alsoWatch: ['sharedThing'],
      });
      unsubscribe();
      applyConfig.mockClear();

      service.setConfig('sharedThing', { a: 1 });

      expect(applyConfig).not.toHaveBeenCalled();
    });
  });
});
