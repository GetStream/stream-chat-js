import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChannel } from '../test-utils/generateChannel';
import { getClientWithUser } from '../test-utils/getClient';
import { SearchController } from '../../../src/search';
import { DEFAULT_COMPOSER_CONFIG } from '../../../src/messageComposer/configuration';
import type { StreamChat } from '../../../src/client';

/**
 * Every configurable class exposes its **resolved** configuration the same way: `configState` for the
 * store, `config` for the current value, `updateConfig` to change it.
 *
 * `MessageComposer`, `ReminderManager`, `Channel` and `Thread` already did. `BasePaginator`,
 * `NotificationManager` and `SearchController` held a plain object that changed silently, so anything
 * displaying their settings had to poll to notice a `client.config.set()` or a `reset()`. These tests
 * pin the notification, which is the entire point of the change — a plain-object regression would still
 * satisfy every assertion about *values*.
 */
describe('resolved configuration is reactive on every configurable class', () => {
  let client: StreamChat;
  let channelResponse: ReturnType<typeof generateChannel>['channel'];

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
    channelResponse = generateChannel().channel;
  });

  describe('BasePaginator', () => {
    it('notifies subscribers when declarative configuration is registered afterwards', () => {
      const channel = client.channel('messaging', channelResponse.id);
      const listener = vi.fn();

      // `subscribe` fires immediately with the current value; ignore that first call.
      channel.messagePaginator.configState.subscribe(listener);
      listener.mockClear();

      client.config.set({ messagePaginator: { pageSize: 7 } });

      expect(listener).toHaveBeenCalled();
      expect(channel.messagePaginator.config.pageSize).toBe(7);
      expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ pageSize: 7 });
    });

    it('notifies on updateConfig and reflects it through the config getter', () => {
      const channel = client.channel('messaging', channelResponse.id);
      const listener = vi.fn();
      channel.messagePaginator.configState.subscribe(listener);
      listener.mockClear();

      channel.messagePaginator.updateConfig({ retryCount: 4 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(channel.messagePaginator.config.retryCount).toBe(4);
    });

    it('notifies on reset, when the paginator falls back to defaults', () => {
      const channel = client.channel('messaging', channelResponse.id);
      client.config.set({ messagePaginator: { pageSize: 7 } });
      expect(channel.messagePaginator.config.pageSize).toBe(7);

      const listener = vi.fn();
      channel.messagePaginator.configState.subscribe(listener);
      listener.mockClear();

      client.config.reset();

      expect(listener).toHaveBeenCalled();
      expect(channel.messagePaginator.config.pageSize).not.toBe(7);
    });

    it('settles on the final value, and every emission carries a complete config', () => {
      // A re-derivation emits more than once by design: the base writes the derived config, then
      // subclasses re-install structural wiring they own (`MessageIntervalPaginator` its `deriveCursor`
      // and `itemOrderComparator`). Both emissions are complete configs, so a subscriber is never shown
      // a half-applied state — asserting an exact count would just pin the subclass count in place.
      const channel = client.channel('messaging', channelResponse.id);
      const seen: number[] = [];
      channel.messagePaginator.configState.subscribe((next) => seen.push(next.pageSize));
      seen.length = 0;

      client.config.set({ messagePaginator: { pageSize: 11 } });

      expect(seen.length).toBeGreaterThan(0);
      expect(new Set(seen)).toEqual(new Set([11]));
      expect(channel.messagePaginator.config.pageSize).toBe(11);
      expect(channel.messagePaginator.config.deriveCursor).toBeDefined();
    });
  });

  describe('NotificationManager', () => {
    it('notifies when notification configuration is registered through the client', () => {
      const listener = vi.fn();
      client.notifications.configState.subscribe(listener);
      listener.mockClear();

      client.config.set({ client: { notifications: { durations: { error: 9000 } } } });

      expect(listener).toHaveBeenCalled();
      expect(client.notifications.config.durations.error).toBe(9000);
    });

    it('deep-merges rather than replacing, so sibling durations survive', () => {
      const before = client.notifications.config.durations.info;

      client.notifications.updateConfig({ durations: { error: 1234 } } as never);

      expect(client.notifications.config.durations.error).toBe(1234);
      expect(client.notifications.config.durations.info).toBe(before);
    });
  });

  describe('SearchController', () => {
    it('notifies on updateConfig', () => {
      const controller = new SearchController();
      const listener = vi.fn();
      controller.configState.subscribe(listener);
      listener.mockClear();

      controller.updateConfig({ keepSingleActiveSource: false });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(controller.config.keepSingleActiveSource).toBe(false);
    });
  });

  it('exposes the same shape on the classes that already had it', () => {
    const channel = client.channel('messaging', channelResponse.id);

    for (const configurable of [
      channel.messagePaginator,
      channel.pinnedMessagesPaginator,
      channel.messageComposer,
      channel.messageOperations,
      client.notifications,
      client.reminders,
      client.threads,
      client.messageDeliveryReporter,
    ]) {
      expect(configurable.configState).toBeDefined();
      expect(configurable.configState.getLatestValue()).toBe(
        (configurable as { config: unknown }).config,
      );
    }
  });

  /**
   * `Channel` and `Thread` deliberately stop at `configState`: `channel.getConfig()` already returns the
   * channel *type*'s server configuration, so a `channel.config` beside it would read as the same thing in
   * getter form while meaning something unrelated, with nothing to catch the confusion.
   *
   * Pinned as an absence because the docs state it as a deliberate exception. If someone adds the getter,
   * this fails and points at the table that has to change with it.
   */
  it('leaves Channel and Thread with the store alone, and no colliding getter', () => {
    const channel = client.channel('messaging', channelResponse.id);

    expect(channel.configState).toBeDefined();
    expect('config' in channel).toBe(false);
    expect('updateConfig' in channel).toBe(false);
    // the member the name would have collided with, which does exist
    expect(typeof channel.getConfig).toBe('function');
  });

  /**
   * `config` returns the store's live object, so a write through it changes state while notifying nobody.
   * `Readonly<T>` rejects the top-level form (`config.pageSize = 5`) but is shallow, and the *nested* form
   * is the one that escapes the instance: the resolved config only copies a subtree some configuration
   * layer actually touched, so a subtree nobody configured is identical by reference to the package
   * default. `composer.config.drafts.enabled = true` therefore reached process-global state — it changed
   * the default for every composer on every client in the process, including ones built afterwards.
   *
   * The invariant these pin is the one that matters: **no write through a resolved config can reach the
   * package defaults.** A per-instance subtree (one some layer copied, such as `text`, which the
   * `max_message_length` upper bound always touches) is still writable and still a mistake — that is what
   * the `Readonly` type and `updateConfig` are for — but it cannot leak past the instance.
   */
  describe('package defaults cannot be reached through a resolved config', () => {
    const write = (target: unknown, key: string, value: unknown) => () => {
      (target as Record<string, unknown>)[key] = value;
    };

    it('rejects a write into an unconfigured subtree, which is the shared default', () => {
      const composer = client.channel('messaging', channelResponse.id).messageComposer;

      expect(composer.config.drafts).toBe(DEFAULT_COMPOSER_CONFIG.drafts);
      expect(write(composer.config.drafts, 'enabled', true)).toThrow(TypeError);
    });

    it('leaves the package default untouched, and later composers reading it', () => {
      const composerA = client.channel('messaging', channelResponse.id).messageComposer;
      const draftsDefault = DEFAULT_COMPOSER_CONFIG.drafts.enabled;

      expect(write(composerA.config.drafts, 'enabled', !draftsDefault)).toThrow();

      expect(DEFAULT_COMPOSER_CONFIG.drafts.enabled).toBe(draftsDefault);
      const other = getClientWithUser({ id: 'other' });
      const composerB = other.channel('messaging', channelResponse.id).messageComposer;
      expect(composerB.config.drafts.enabled).toBe(draftsDefault);
    });

    it('freezes every subtree of the defaults, not only the ones read here', () => {
      const frozen = Object.entries(DEFAULT_COMPOSER_CONFIG)
        .filter(([, value]) => typeof value === 'object' && value !== null)
        .map(([key, value]) => [key, Object.isFrozen(value)]);

      expect(Object.fromEntries(frozen)).toEqual({
        attachments: true,
        commands: true,
        drafts: true,
        linkPreviews: true,
        location: true,
        text: true,
      });
    });

    it('still lets updateConfig change the value, by copying rather than mutating', () => {
      const composer = client.channel('messaging', channelResponse.id).messageComposer;

      composer.updateConfig({ drafts: { enabled: true } });

      expect(composer.config.drafts.enabled).toBe(true);
      expect(composer.config.drafts).not.toBe(DEFAULT_COMPOSER_CONFIG.drafts);
      expect(DEFAULT_COMPOSER_CONFIG.drafts.enabled).toBe(false);
    });
  });
});
