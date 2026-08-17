import { describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src/client';
import { DEFAULT_NOTIFICATION_MANAGER_CONFIG } from '../../../src/notifications/configuration';
import { DEFAULT_REMINDER_MANAGER_CONFIG } from '../../../src/reminders/ReminderManager';
import { applyInstanceConfiguration } from '../../../src/configuration/utils/applyInstanceConfiguration';

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
  /**
   * Every leaf owns its derivation, so the client only routes slices. Before, the client spread each
   * manager's defaults itself — which is how `reset()` became a no-op for this key (F4) and how a
   * registered `notifications.sortComparator` became unremovable (G8).
   */
  describe('each manager derives its own configuration', () => {
    it.each([
      ['reminders', (c: StreamChat) => c.reminders],
      ['threads', (c: StreamChat) => c.threads],
      ['messageDeliveryReporter', (c: StreamChat) => c.messageDeliveryReporter],
      ['notifications', (c: StreamChat) => c.notifications],
    ])('%s exposes initializeConfig', (_name, pick) => {
      expect(typeof pick(new StreamChat('k')).initializeConfig).toBe('function');
    });

    it('derives from defaults when called with nothing', () => {
      const c = new StreamChat('k');
      const defaultThrottle = c.threads.config.connectionRecoveryThrottleMs;
      c.threads.updateConfig({ connectionRecoveryThrottleMs: 999 });

      c.threads.initializeConfig();

      // A derivation, not a patch: the imperative value is gone rather than merged over.
      expect(c.threads.config.connectionRecoveryThrottleMs).toBe(defaultThrottle);
    });

    it('applies a slice over the defaults', () => {
      const c = new StreamChat('k');

      c.reminders.initializeConfig({ stopTimerRefreshBoundaryMs: 4242 });

      expect(c.reminders.config.stopTimerRefreshBoundaryMs).toBe(4242);
      // Untouched fields come from the defaults, not from whatever was there before.
      expect(c.reminders.config.scheduledOffsetsMs).toEqual(
        DEFAULT_REMINDER_MANAGER_CONFIG.scheduledOffsetsMs,
      );
    });

    it('rebuilds the read throttle, not just the stored value', () => {
      // The throttle captures its interval in a closure, so storing a new number is not enough. Asserted
      // on the throttle's identity rather than on whichever method happens to rebuild it — the whole
      // point of the `onChanged` hook is that no single route owns the pairing any more.
      const c = new StreamChat('k');
      const reporter = c.messageDeliveryReporter as unknown as {
        throttledMarkRead: unknown;
      };
      const before = reporter.throttledMarkRead;

      c.messageDeliveryReporter.initializeConfig({ markAsReadThrottleTimeoutMs: 77 });

      expect(c.messageDeliveryReporter.config.markAsReadThrottleTimeoutMs).toBe(77);
      expect(reporter.throttledMarkRead).not.toBe(before);
    });

    it('rebuilds it on an imperative update too, which it did not always', () => {
      const c = new StreamChat('k');
      const reporter = c.messageDeliveryReporter as unknown as {
        throttledMarkRead: unknown;
      };
      const before = reporter.throttledMarkRead;

      c.messageDeliveryReporter.updateConfig({ markAsReadThrottleTimeoutMs: 88 });

      expect(reporter.throttledMarkRead).not.toBe(before);
    });

    it('still publishes nothing when the derivation has not moved', () => {
      const c = new StreamChat('k');
      const listener = vi.fn();
      c.reminders.configState.subscribe(listener);
      listener.mockClear();

      c.reminders.initializeConfig();
      c.reminders.initializeConfig();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('notifications — a field absent from the defaults', () => {
    // Every other manager config has all-required fields, all present in its `DEFAULT_*_CONFIG`, so the
    // derivation's spread overwrites each one and a reset lands. `NotificationManagerConfig` is the sole
    // exception: `sortComparator` is optional and has no default, so there was nothing to overwrite it
    // with — and `updateConfig` deep-merges, which cannot express a removal. Once registered it survived
    // every reset for the client's lifetime.
    it('reset clears a declaratively registered sortComparator', () => {
      const c = new StreamChat('k');
      const sortComparator = () => 0;

      c.config.set({ client: { notifications: { sortComparator } } });
      // the probe has to be able to see the bug: assert the registration landed first
      expect(c.notifications.config.sortComparator).toBe(sortComparator);

      c.config.reset();

      expect(c.notifications.config.sortComparator).toBeUndefined();
    });

    it('re-registering without it does not drop it — the registry merges', () => {
      // Worth pinning, because it is the natural thing to assume and it is wrong. The *derivation* is a
      // replacement, but the registry `setConfig` writes into is a deep merge, so the slice still
      // carries `sortComparator` on the next read. `reset()` is what clears a registration.
      const c = new StreamChat('k');
      const sortComparator = () => 0;
      c.config.set({ client: { notifications: { sortComparator } } });

      c.config.setConfig('client', { notifications: { durations: { error: 10 } } });

      expect(c.notifications.config.sortComparator).toBe(sortComparator);
      expect(c.notifications.config.durations.error).toBe(10);
    });

    it('still deep-merges durations rather than replacing them', () => {
      const c = new StreamChat('k');
      const defaultInfo = c.notifications.config.durations.info;

      c.config.set({ client: { notifications: { durations: { error: 42 } } } });

      expect(c.notifications.config.durations.error).toBe(42);
      expect(c.notifications.config.durations.info).toBe(defaultInfo);
    });

    it('cannot corrupt the package default through config', () => {
      // An untouched subtree *is* the module default, by reference — that is how the merge works and it
      // is cheap. What makes it safe is the freeze, so the guarantee is asserted rather than the
      // mechanism: an earlier version of this test compared identities, which said nothing about whether
      // a write could get through.
      const a = new StreamChat('k');
      const b = new StreamChat('k2');
      const before = { ...b.notifications.config.durations };

      expect(() => {
        (a.notifications.config.durations as { error: number }).error = 1;
      }).toThrow(TypeError);

      expect(b.notifications.config.durations).toEqual(before);
      expect(DEFAULT_NOTIFICATION_MANAGER_CONFIG.durations).toEqual(before);
    });

    it('stays safe after a derivation that actually publishes', () => {
      // Dropping a `sortComparator` is the case that republishes *without* naming `durations`, so it is
      // the one where an unfrozen default would slip into the store.
      const c = new StreamChat('k');
      c.config.set({ client: { notifications: { sortComparator: () => 0 } } });

      c.config.reset();

      expect(c.notifications.config.sortComparator).toBeUndefined();
      expect(() => {
        (c.notifications.config.durations as { error: number }).error = 1;
      }).toThrow(TypeError);
    });

    it('an imperative updateConfig still merges, so a caller keeps patch semantics', () => {
      const c = new StreamChat('k');
      const sortComparator = () => 0;

      c.notifications.updateConfig({ sortComparator });
      c.notifications.updateConfig({ durations: { error: 5 } });

      expect(c.notifications.config.sortComparator).toBe(sortComparator);
      expect(c.notifications.config.durations.error).toBe(5);
    });
  });

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
