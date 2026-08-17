import { describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src/client';
import { applyInstanceConfiguration } from '../../../src/configuration/applyInstanceConfiguration';

describe('client.config', () => {
  it('exposes config', () => {
    const c = new StreamChat('k');
    expect(c.config).toBeDefined();
  });

  it('applies a client setup function immediately, to an already-built client', () => {
    const c = new StreamChat('k');
    const seen: string[] = [];
    c.config.setSetupFunction('client', ({ client }) => {
      seen.push(typeof client.reminders);
      return () => seen.push('teardown');
    });
    expect(seen).toEqual(['object']);
    c.config.setSetupFunction('client', null);
    expect(seen).toEqual(['object', 'teardown']);
  });

  it('declarative reminders config reaches the manager', () => {
    const c = new StreamChat('k');
    c.config.set({ client: { reminders: { scheduledOffsetsMs: [1234] } } });
    expect(c.reminders.configState.getLatestValue().scheduledOffsetsMs).toEqual([1234]);
  });

  it('options.config seeds before managers are built', () => {
    const c = new StreamChat('k', {
      config: { client: { reminders: { scheduledOffsetsMs: [42] } } },
    });
    expect(c.reminders.configState.getLatestValue().scheduledOffsetsMs).toEqual([42]);
  });

  it('setConfig deep-merges rather than replacing', () => {
    const c = new StreamChat('k');
    c.config.setConfig('messageComposer', { drafts: { enabled: true } });
    c.config.setConfig('messageComposer', { text: { publishTypingEvents: false } });
    expect(c.config.getConfig('messageComposer')).toEqual({
      drafts: { enabled: true },
      text: { publishTypingEvents: false },
    });
  });

  it('a throwing setup function is contained', () => {
    const c = new StreamChat('k');
    expect(() =>
      c.config.setSetupFunction('client', () => {
        throw new Error('boom');
      }),
    ).not.toThrow();
  });

  it('custom keys work in both tiers, in either order', () => {
    const c = new StreamChat('k');
    const applied: unknown[] = [];
    c.config.setConfig('myWidget', { pollIntervalMs: 10 });
    // subscriber arrives after the setter
    const unsub = applyInstanceConfiguration({
      args: { widget: {} },
      config: c.config,
      key: 'myWidget',
      applyConfig: (cfg: unknown) => applied.push(cfg),
    });
    expect(applied).toEqual([{ pollIntervalMs: 10 }]);
    unsub();
  });

  it('two clients do not share configuration', () => {
    const a = new StreamChat('k');
    const b = new StreamChat('k2');
    a.config.setConfig('messageComposer', { drafts: { enabled: true } });
    expect(b.config.getConfig('messageComposer')).toBeNull();
  });

  it('disconnectUser runs the client teardown exactly once', async () => {
    const c = new StreamChat('k');
    const teardown = vi.fn();
    c.config.setSetupFunction('client', () => teardown);
    await c.disconnectUser().catch(() => undefined);
    await c.disconnectUser().catch(() => undefined);
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  // `initializeManagerConfig` is a *derivation*, not a patch. It used to be four
  // `if (config?.x) manager.updateConfig(x)` guards, which made both of these fail: `reset` clears the
  // declarative store before instances re-derive, so every guard was false and nothing was restored.
  describe('reset restores the managers to their defaults', () => {
    it('reverts every manager the client key reaches', () => {
      const c = new StreamChat('k');
      const defaults = {
        reminders: c.reminders.config.scheduledOffsetsMs,
        threads: c.threads.config.connectionRecoveryThrottleMs,
        messageDelivery:
          c.messageDeliveryReporter.config.maxDeliveredMessageCountInPayload,
        notifications: c.notifications.config.durations.error,
      };

      c.config.set({
        client: {
          messageDelivery: { maxDeliveredMessageCountInPayload: 7 },
          notifications: { durations: { error: 99_999 } },
          reminders: { scheduledOffsetsMs: [1, 2, 3] },
          threads: { connectionRecoveryThrottleMs: 5 },
        },
      });

      // the probe has to be able to see the bug: assert the registration landed first
      expect(c.reminders.config.scheduledOffsetsMs).toEqual([1, 2, 3]);
      expect(c.threads.config.connectionRecoveryThrottleMs).toBe(5);
      expect(c.messageDeliveryReporter.config.maxDeliveredMessageCountInPayload).toBe(7);
      expect(c.notifications.config.durations.error).toBe(99_999);

      c.config.reset();

      expect(c.reminders.config.scheduledOffsetsMs).toEqual(defaults.reminders);
      expect(c.threads.config.connectionRecoveryThrottleMs).toBe(defaults.threads);
      expect(c.messageDeliveryReporter.config.maxDeliveredMessageCountInPayload).toBe(
        defaults.messageDelivery,
      );
      expect(c.notifications.config.durations.error).toBe(defaults.notifications);
    });

    it('drops a field removed from the tree, which a merge cannot express', () => {
      const c = new StreamChat('k');
      const defaultThrottle = c.threads.config.connectionRecoveryThrottleMs;

      c.config.set({ client: { threads: { connectionRecoveryThrottleMs: 5 } } });
      expect(c.threads.config.connectionRecoveryThrottleMs).toBe(5);

      // re-register the key without the field — the derivation must fall back to the default
      c.config.reset('client');
      c.config.set({ client: { reminders: { scheduledOffsetsMs: [1] } } });

      expect(c.threads.config.connectionRecoveryThrottleMs).toBe(defaultThrottle);
    });

    it('keeps sibling notification durations when only one is registered', () => {
      const c = new StreamChat('k');
      const defaultInfo = c.notifications.config.durations.info;

      c.config.set({ client: { notifications: { durations: { error: 10_000 } } } });

      expect(c.notifications.config.durations.error).toBe(10_000);
      expect(c.notifications.config.durations.info).toBe(defaultInfo);
    });
  });
});
