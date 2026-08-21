import { describe, expect, it } from 'vitest';
import { StreamChat } from '../../../src/client';
import { DEFAULT_CHANNEL_CONFIG } from '../../../src/channel';
import { DEFAULT_COMPOSER_CONFIG } from '../../../src/messageComposer/configuration';
import { DEFAULT_LIVE_LOCATION_MANAGER_CONFIG } from '../../../src/LiveLocationManager';
import { DEFAULT_MESSAGE_DELIVERY_REPORTER_CONFIG } from '../../../src/messageDelivery';
import { DEFAULT_MESSAGE_OPERATIONS_CONFIG } from '../../../src/messageOperations/MessageOperations';
import { DEFAULT_NOTIFICATION_MANAGER_CONFIG } from '../../../src/notifications/configuration';
import { DEFAULT_PAGINATION_OPTIONS } from '../../../src/pagination/paginators/BasePaginator';
import { DEFAULT_REMINDER_MANAGER_CONFIG } from '../../../src/reminders/ReminderManager';
import { DEFAULT_THREAD_CONFIG } from '../../../src/thread';
import { DEFAULT_THREAD_MANAGER_CONFIG } from '../../../src/thread_manager';

/**
 * Resolved configuration is built by spreading or merging over these constants, and a spread only copies
 * the top level — so any nested value no layer touches stays identical *by reference* to the module
 * object, reachable through the entity's public `config` getter. A write through it changes the package
 * default for every instance in the process, including ones created later.
 *
 * This has now been found three times in three places: `DEFAULT_COMPOSER_CONFIG` (**F3**),
 * `DEFAULT_NOTIFICATION_MANAGER_CONFIG.durations` (**G8**) and
 * `DEFAULT_REMINDER_MANAGER_CONFIG.scheduledOffsetsMs`. Each was fixed where it was found, which is why
 * there was a third. The sweep below is the part that stops a fourth: a new default config constant is
 * caught here rather than by whoever mutates it in production.
 *
 * Freezing is the guard rather than copying, because it makes the violation loud — in ESM, which is
 * always strict, the offending line throws instead of quietly corrupting shared state somewhere else.
 */
describe('package default configurations are immutable', () => {
  const DEFAULTS = {
    DEFAULT_CHANNEL_CONFIG,
    DEFAULT_COMPOSER_CONFIG,
    DEFAULT_LIVE_LOCATION_MANAGER_CONFIG,
    DEFAULT_MESSAGE_DELIVERY_REPORTER_CONFIG,
    DEFAULT_MESSAGE_OPERATIONS_CONFIG,
    DEFAULT_NOTIFICATION_MANAGER_CONFIG,
    DEFAULT_PAGINATION_OPTIONS,
    DEFAULT_REMINDER_MANAGER_CONFIG,
    DEFAULT_THREAD_CONFIG,
    DEFAULT_THREAD_MANAGER_CONFIG,
  };

  const deepFrozen = (value: unknown, path: string, out: string[]) => {
    if (value === null || typeof value !== 'object') return;
    if (!Object.isFrozen(value)) out.push(path);
    for (const [key, nested] of Object.entries(value)) {
      deepFrozen(nested, `${path}.${key}`, out);
    }
  };

  it.each(Object.entries(DEFAULTS))('%s is deep-frozen', (_name, defaults) => {
    const unfrozen: string[] = [];
    deepFrozen(defaults, 'root', unfrozen);
    expect(unfrozen).toEqual([]);
  });

  describe('the reminder offsets, which leaked in the working tree', () => {
    it('does not hand the module-level array out through config', () => {
      // Both seeding routes aliased it: the `ReminderManager` constructor reads
      // `DEFAULT_REMINDER_MANAGER_CONFIG.scheduledOffsetsMs` directly, and the client's derivation
      // spreads the defaults shallowly. So `client.reminders.config.scheduledOffsetsMs` *was* the module
      // array, shared by every client in the process.
      const client = new StreamChat('k');

      expect(() =>
        (client.reminders.config.scheduledOffsetsMs as number[]).push(999),
      ).toThrow(TypeError);
      expect(client.reminders.config.scheduledOffsetsMs).toEqual(
        DEFAULT_REMINDER_MANAGER_CONFIG.scheduledOffsetsMs,
      );
    });

    it('two clients cannot corrupt each other through it', () => {
      const a = new StreamChat('k');
      const b = new StreamChat('k2');
      const before = [...b.reminders.config.scheduledOffsetsMs];

      expect(() =>
        (a.reminders.config.scheduledOffsetsMs as number[]).splice(0, 1),
      ).toThrow(TypeError);

      expect(b.reminders.config.scheduledOffsetsMs).toEqual(before);
    });

    it('still lets a caller replace the offsets through updateConfig', () => {
      // The supported route has to keep working — freezing the defaults must not freeze the surface.
      const client = new StreamChat('k');

      client.reminders.updateConfig({ scheduledOffsetsMs: [1, 2] });

      expect(client.reminders.config.scheduledOffsetsMs).toEqual([1, 2]);
    });

    it('still lets the declarative tree set and reset them', () => {
      const client = new StreamChat('k');
      const defaults = DEFAULT_REMINDER_MANAGER_CONFIG.scheduledOffsetsMs;

      client.config.set({ client: { reminders: { scheduledOffsetsMs: [5] } } });
      expect(client.reminders.config.scheduledOffsetsMs).toEqual([5]);

      client.config.reset();
      expect(client.reminders.config.scheduledOffsetsMs).toEqual(defaults);
    });
  });
});
