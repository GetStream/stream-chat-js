import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceConfigurationRegistry } from '../../../src/configuration/InstanceConfigurationRegistry';
import { chatLoggerSystem } from '../../../src/logger';

const noop = () => undefined;

describe('InstanceConfigurationRegistry', () => {
  let service: InstanceConfigurationRegistry;

  beforeEach(() => {
    service = new InstanceConfigurationRegistry();
  });

  describe('stores', () => {
    it('creates a store lazily and returns the same one for a key', () => {
      const first = service.getSetupState('channel');
      expect(first).toBe(service.getSetupState('channel'));
      expect(service.getConfigState('channel')).toBe(service.getConfigState('channel'));
    });

    it('creates stores for a key the SDK does not define', () => {
      expect(service.getSetupState('myWidget').getLatestValue()).toEqual({
        setupFunction: null,
      });
      expect(service.getConfigState('myWidget').getLatestValue()).toEqual({
        config: null,
      });
    });

    it('keeps the setup store and the config store independent', () => {
      service.setSetupFunction('channel', noop);
      expect(service.getConfig('channel')).toBeNull();

      service.setConfig('thread', { messagePaginator: { pageSize: 5 } });
      expect(service.getSetupFunction('thread')).toBeNull();
    });
  });

  describe('setup functions', () => {
    it('round-trips and clears', () => {
      service.setSetupFunction('channel', noop);
      expect(service.getSetupFunction('channel')).toBe(noop);

      service.setSetupFunction('channel', null);
      expect(service.getSetupFunction('channel')).toBeNull();
    });

    it('does not disturb other keys', () => {
      service.setSetupFunction('channel', noop);
      service.setSetupFunction('thread', null);
      expect(service.getSetupFunction('channel')).toBe(noop);
    });
  });

  describe('declarative configuration', () => {
    it('deep-merges rather than replacing', () => {
      service.setConfig('messageComposer', {
        drafts: { enabled: true },
        text: { publishTypingEvents: true },
      });
      service.setConfig('messageComposer', { text: { publishTypingEvents: false } });

      expect(service.getConfig('messageComposer')).toEqual({
        drafts: { enabled: true },
        text: { publishTypingEvents: false },
      });
    });

    it('fans a tree out per key', () => {
      service.set({
        channel: { messagePaginator: { pageSize: 50 } },
        messageComposer: { drafts: { enabled: true } },
      });

      expect(service.getConfig('channel')).toEqual({
        messagePaginator: { pageSize: 50 },
      });
      expect(service.getConfig('messageComposer')).toEqual({ drafts: { enabled: true } });
    });

    it('keeps going past an empty entry instead of dropping the rest of the tree', () => {
      service.set({
        channel: undefined,
        messageComposer: { drafts: { enabled: true } },
      });

      expect(service.getConfig('messageComposer')).toEqual({ drafts: { enabled: true } });
    });

    // The old `setSetupFunctions` used `return` where it meant `continue`, so one unrecognized key
    // silently discarded every remaining valid key in the same call.
    it('applies later keys even when an earlier one is unrecognized', () => {
      service.set({
        // @ts-expect-error deliberately unrecognized
        bogus: { nope: true },
        messageComposer: { drafts: { enabled: true } },
      });

      expect(service.getConfig('messageComposer')).toEqual({ drafts: { enabled: true } });
    });
  });

  describe('reset', () => {
    it('clears both tiers for one key and leaves other keys alone', () => {
      service.setConfig('channel', { messagePaginator: { pageSize: 50 } });
      service.setSetupFunction('channel', noop);
      service.setConfig('thread', { messagePaginator: { pageSize: 25 } });

      service.reset('channel');

      expect(service.getConfig('channel')).toBeNull();
      expect(service.getSetupFunction('channel')).toBeNull();
      expect(service.getConfig('thread')).toEqual({ messagePaginator: { pageSize: 25 } });
    });

    it('clears every touched key when called with no argument', () => {
      service.setConfig('channel', { messagePaginator: { pageSize: 50 } });
      service.setSetupFunction('thread', noop);

      service.reset();

      expect(service.getConfig('channel')).toBeNull();
      expect(service.getSetupFunction('thread')).toBeNull();
    });

    it('invokes each live instance’s reinitializeConfig after clearing', () => {
      const order: string[] = [];
      service.setSetupFunction('channel', () => () => order.push('teardown'));
      service.registerInstance('channel', {
        reinitializeConfig: () => order.push('reinitialize'),
      });

      service.reset('channel');

      // Re-derivation must come last, so a buggy teardown cannot undo it.
      expect(order).toEqual(['reinitialize']);
      expect(service.getSetupFunction('channel')).toBeNull();
    });

    it('contains a throwing reinitializeConfig', () => {
      service.registerInstance('channel', {
        reinitializeConfig: () => {
          throw new Error('boom');
        },
      });

      expect(() => service.reset('channel')).not.toThrow();
    });

    it('stops reaching a deregistered instance', () => {
      const reinitializeConfig = vi.fn();
      const deregister = service.registerInstance('channel', { reinitializeConfig });
      deregister();

      service.reset('channel');

      expect(reinitializeConfig).not.toHaveBeenCalled();
      expect(service.hasLiveInstances('channel')).toBe(false);
    });
  });

  it('keeps two services independent, so configuration cannot leak between clients', () => {
    const other = new InstanceConfigurationRegistry();
    service.setConfig('messageComposer', { drafts: { enabled: true } });

    expect(other.getConfig('messageComposer')).toBeNull();
  });

  describe('diagnostics', () => {
    // The service captures its logger at module scope, so spying on `getLogger` after import has no
    // effect. Route the scope through a sink instead — that is the supported seam.
    let records: { level: string; message: string }[];

    beforeEach(() => {
      records = [];
      chatLoggerSystem.configureLoggers({
        'instance-configuration': {
          level: 'debug',
          sink: (level, message) => records.push({ level, message }),
        },
      });
    });

    afterEach(() => {
      chatLoggerSystem.restoreDefaults();
    });

    it('warns for an unknown key with no subscriber', () => {
      // A misspelling is a compile error now, so this can only be reached from JavaScript or past a
      // cast — which is exactly when a warning is worth the noise.
      service.setSetupFunction('cahnnel' as never, noop);

      expect(records).toHaveLength(1);
      expect(records[0].level).toBe('warn');
      expect(records[0].message).toContain('a key this package does not define');
    });

    it('stays silent for a configuration-only key', () => {
      // `messagePaginator` takes configuration but no setup function, so it is absent from
      // `BUILT_IN_INSTANCE_KEYS` — the guard has to read the config tree instead, or this warns.
      service.setConfig('messagePaginator', { pageSize: 10 });

      expect(records).toEqual([]);
    });

    it('stays silent for a built-in key', () => {
      service.setSetupFunction('channel', noop);
      service.setConfig('messageComposer', { drafts: { enabled: true } });

      expect(records).toEqual([]);
    });

    it('stays silent for an unknown key that already has a subscriber', () => {
      // What a downstream SDK's declared key looks like from in here: this class cannot see the
      // augmentation, so a live instance is the only evidence the key is real.
      service.registerInstance('myWidget' as never, { reinitializeConfig: noop });

      service.setSetupFunction('myWidget' as never, noop);

      expect(records).toEqual([]);
    });

    it('warns — not debug — when a construction-only path is set after instances exist', () => {
      service.registerInstance('channel', { reinitializeConfig: noop });

      service.setConfig('channel', {
        messagePaginator: { pageSize: 10, unreadReferencePolicy: 'read-state-only' },
      });

      const warnings = records.filter(({ level }) => level === 'warn');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('messagePaginator.unreadReferencePolicy');
      // The value is still stored; the warning is that it cannot reach the existing instances.
      expect(service.getConfig('channel')).toMatchObject({
        messagePaginator: { unreadReferencePolicy: 'read-state-only' },
      });
    });

    it('does not warn about construction-only paths before anything is constructed', () => {
      service.setConfig('channel', {
        messagePaginator: { unreadReferencePolicy: 'read-state-only' },
      });

      expect(records.filter(({ level }) => level === 'warn')).toEqual([]);
    });

    it('does not warn about paths that are not construction-only', () => {
      service.registerInstance('channel', { reinitializeConfig: noop });

      service.setConfig('channel', { messagePaginator: { pageSize: 50 } });

      expect(records.filter(({ level }) => level === 'warn')).toEqual([]);
    });

    it('warns once, not once per identical re-registration', () => {
      // A settings UI applying on every keystroke, or any `set()` on a render path, otherwise produced one
      // warning per call about a value that had not moved. Nothing failed to apply the second time — the
      // registration is unchanged — so there is nothing to report.
      service.registerInstance('channel', { reinitializeConfig: noop });
      const register = () =>
        service.setConfig('channel', {
          messagePaginator: { unreadReferencePolicy: 'read-state-only' },
        });

      register();
      register();
      register();

      expect(records.filter(({ level }) => level === 'warn')).toHaveLength(1);
    });

    it('warns again when the construction-only value actually changes', () => {
      // The other half: silence must come from the value being unchanged, not from having warned before.
      service.registerInstance('channel', { reinitializeConfig: noop });

      service.setConfig('channel', {
        messagePaginator: { unreadReferencePolicy: 'read-state-only' },
      });
      service.setConfig('channel', {
        messagePaginator: { unreadReferencePolicy: 'snapshot' },
      });

      expect(records.filter(({ level }) => level === 'warn')).toHaveLength(2);
    });
  });

  describe('caller-owned patch objects', () => {
    it('does not alias a nested object the caller passed in', () => {
      // `mergeWith` reuses a source subtree verbatim where the target has nothing, and a first registration
      // has an empty target — so the registry used to hold the caller's own object. Mutating it afterwards
      // then changed resolved configuration behind every live instance's back, with no notification.
      const patch = { text: { maxLengthOnSend: 100 } };

      service.setConfig('messageComposer', patch);

      const stored = service.getConfig('messageComposer') as typeof patch;
      expect(stored.text).not.toBe(patch.text);
      expect(stored).toEqual(patch);

      patch.text.maxLengthOnSend = 5;
      expect(
        (service.getConfig('messageComposer') as typeof patch).text.maxLengthOnSend,
      ).toBe(100);
    });

    it('copies arrays rather than sharing them', () => {
      const patch = { scheduledOffsetsMs: [1, 2, 3] };

      service.setConfig('client', { reminders: patch } as never);
      patch.scheduledOffsetsMs.push(4);

      expect(
        (service.getConfig('client') as { reminders: typeof patch }).reminders
          .scheduledOffsetsMs,
      ).toEqual([1, 2, 3]);
    });

    it('passes functions through by reference, since a copy would be a different handler', () => {
      // Configuration is not JSON: request handlers, filters and comparators are functions, and the point of
      // registering one is that the SDK calls *that* function.
      const sendMessageRequest = () => undefined;

      service.setConfig('channel', { requestHandlers: { sendMessageRequest } } as never);

      expect(
        (
          service.getConfig('channel') as {
            requestHandlers: { sendMessageRequest: unknown };
          }
        ).requestHandlers.sendMessageRequest,
      ).toBe(sendMessageRequest);
    });

    it('passes a class instance through rather than walking its internals', () => {
      class Sentinel {
        constructor(readonly id = 'kept') {}
      }
      const instance = new Sentinel();

      service.setConfig('myWidget', { index: instance } as never);

      expect((service.getConfig('myWidget') as { index: unknown }).index).toBe(instance);
    });
  });
});
