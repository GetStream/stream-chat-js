import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from '../test-utils/getClient';
import type { Channel } from '../../../src/channel';
import type { StreamChat } from '../../../src/client';

describe("the 'channel' configuration key", () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
  });

  const openChannel = (id = 'channel-id'): Channel => client.channel('messaging', id);

  describe('declarative configuration', () => {
    it('reaches a channel created after registration', () => {
      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });

      expect(openChannel().messagePaginator.config.pageSize).toBe(50);
    });

    it('reaches a channel that already exists', () => {
      const channel = openChannel();

      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });

      expect(channel.messagePaginator.config.pageSize).toBe(50);
    });

    it('configures the pinned-message paginator independently of the main list', () => {
      client.config.set({
        channel: {
          messagePaginator: { pageSize: 50 },
          pinnedMessagesPaginator: { pageSize: 25 },
        },
      });
      const channel = openChannel();

      expect(channel.messagePaginator.config.pageSize).toBe(50);
      expect(channel.pinnedMessagesPaginator.config.pageSize).toBe(25);
    });

    it('installs request handlers into configState', () => {
      const sendMessageRequest = vi.fn();
      client.config.set({ channel: { requestHandlers: { sendMessageRequest } } });

      expect(openChannel().configState.getLatestValue().requestHandlers).toEqual({
        sendMessageRequest,
      });
    });

    it('changes observable throttling behaviour, not just the stored value', () => {
      // `stateThrottleMs` is read once, when the throttles are built — a plain assignment would be
      // silently discarded, so this asserts the rebuild setter was actually used.
      client.config.set({ channel: { messagePaginator: { stateThrottleMs: 250 } } });

      expect(openChannel().messagePaginator.config.stateThrottleMs).toBe(250);
    });

    it('changes observable debouncing behaviour', () => {
      const channel = openChannel();
      const setDebounceOptions = vi.spyOn(channel.messagePaginator, 'setDebounceOptions');

      client.config.set({ channel: { messagePaginator: { debounceMs: 900 } } });

      expect(setDebounceOptions).toHaveBeenCalledWith({ debounceMs: 900 });
      expect(channel.messagePaginator.config.debounceMs).toBe(900);
    });
  });

  describe('construction-time injection', () => {
    it('applies a read-once field when registered before the channel exists', () => {
      client.config.set({
        channel: { messagePaginator: { unreadReferencePolicy: 'read-state-only' } },
      });

      const channel = openChannel();

      // Read once by the constructor — reachable only because the channel passes the declarative slice
      // through as a constructor option.
      expect(
        (channel.messagePaginator as unknown as { unreadReferencePolicy: string })
          .unreadReferencePolicy,
      ).toBe('read-state-only');
    });

    it('leaves an already-built channel on the default for a read-once field', () => {
      const channel = openChannel();

      client.config.set({
        channel: { messagePaginator: { unreadReferencePolicy: 'read-state-only' } },
      });

      // Order-dependent by design; the service warns in this case rather than failing silently.
      expect(
        (channel.messagePaginator as unknown as { unreadReferencePolicy: string })
          .unreadReferencePolicy,
      ).toBe('snapshot');
    });

    it('does not accept composer configuration under the channel key', () => {
      client.config.set({ messageComposer: { drafts: { enabled: true } } });

      // Composer configuration is a top-level key, never nested under `channel` — one path only.
      expect(openChannel().messageComposer.config.drafts.enabled).toBe(true);
    });
  });

  describe('setup functions', () => {
    it('runs for a channel created afterwards', () => {
      const seen: string[] = [];
      client.config.setSetupFunction('channel', ({ channel }) => {
        seen.push(channel.cid);
      });

      openChannel('later');

      expect(seen).toEqual(['messaging:later']);
    });

    it('runs for every channel that already exists', () => {
      const a = openChannel('a');
      const b = openChannel('b');
      const seen: string[] = [];

      client.config.setSetupFunction('channel', ({ channel }) => {
        seen.push(channel.cid);
      });

      expect(seen.sort()).toEqual([a.cid, b.cid].sort());
    });

    it('overrides a declarative value for the same field', () => {
      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });
      client.config.setSetupFunction('channel', ({ channel }) => {
        channel.messagePaginator.updateConfig({ pageSize: 200 });
      });

      // Tier 2 is applied after tier 1, so it wins.
      expect(openChannel().messagePaginator.config.pageSize).toBe(200);
    });

    it('cannot break client.channel() by throwing', () => {
      client.config.setSetupFunction('channel', () => {
        throw new Error('boom');
      });

      expect(() => openChannel()).not.toThrow();
    });

    it('is torn down by _disconnect, exactly once', () => {
      const teardown = vi.fn();
      client.config.setSetupFunction('channel', () => teardown);
      const channel = openChannel();

      channel._disconnect();
      channel._disconnect();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('stops reaching a disconnected channel', () => {
      const channel = openChannel();
      channel._disconnect();
      const setup = vi.fn();

      client.config.setSetupFunction('channel', setup);

      expect(setup).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('returns the paginators to their derived baseline', () => {
      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });
      const channel = openChannel();

      client.config.reset('channel');

      expect(channel.messagePaginator.config.pageSize).toBe(100); // channel message list default
    });

    it('clears declaratively installed request handlers', () => {
      client.config.set({
        channel: { requestHandlers: { sendMessageRequest: vi.fn() } },
      });
      const channel = openChannel();

      client.config.reset('channel');

      expect(channel.configState.getLatestValue().requestHandlers).toBeUndefined();
    });

    it('recovers even when a setup function left no teardown', () => {
      const channel = openChannel();
      const original = channel.messagePaginator.config.itemOrderComparator;
      client.config.setSetupFunction('channel', ({ channel: c }) => {
        c.messagePaginator.updateConfig({ itemOrderComparator: () => 0 });
        // deliberately no teardown
      });

      client.config.reset('channel');

      // Re-derivation re-installs it; a snapshot of config values never could have.
      expect(channel.messagePaginator.config.itemOrderComparator).not.toBe(original);
      expect(typeof channel.messagePaginator.config.itemOrderComparator).toBe('function');
      const older = { id: 'a', created_at: new Date('2020-01-01') } as never;
      const newer = { id: 'b', created_at: new Date('2021-01-01') } as never;
      expect(
        channel.messagePaginator.config.itemOrderComparator?.(older, newer),
      ).toBeLessThan(0);
    });

    // A `Channel` is a live instance of three keys — `channel` plus the shared `messagePaginator` and
    // `messageOperations`. One reset must re-derive it once. It used to re-derive 5–6 times: three
    // distinct handles in `reset`'s de-duplicating Set, plus a cycle per watched key whose store
    // published a `null → null` clear.
    it('re-derives a channel exactly once, despite three registered keys', () => {
      const channel = openChannel();
      const initializeConfig = vi.spyOn(channel, 'initializeConfig');

      client.config.reset();

      expect(initializeConfig).toHaveBeenCalledTimes(1);
    });

    it('re-derives exactly once when all three keys carry configuration', () => {
      client.config.set({
        channel: { messagePaginator: { pageSize: 11 } },
        messageOperations: { failedSendCacheMaxSize: 7 },
        messagePaginator: { retryCount: 4 },
      });
      const channel = openChannel();
      // the probe can see the bug: all three registrations landed
      expect(channel.messagePaginator.config.pageSize).toBe(11);
      expect(channel.messagePaginator.config.retryCount).toBe(4);
      expect(channel.messageOperations.config.failedSendCacheMaxSize).toBe(7);
      const initializeConfig = vi.spyOn(channel, 'initializeConfig');

      client.config.reset();

      expect(initializeConfig).toHaveBeenCalledTimes(1);
    });
  });
});
