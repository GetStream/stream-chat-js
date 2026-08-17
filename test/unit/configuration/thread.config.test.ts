import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChannel } from '../test-utils/generateChannel';
import { generateMsg } from '../test-utils/generateMessage';
import { generateThreadResponse } from '../test-utils/generateThreadResponse';
import { getClientWithUser } from '../test-utils/getClient';
import { Thread } from '../../../src/thread';
import type { StreamChat } from '../../../src/client';

describe("the 'thread' configuration key", () => {
  let client: StreamChat;
  let channelResponse: ReturnType<typeof generateChannel>['channel'];
  let parentMessage: ReturnType<typeof generateMsg>;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
    channelResponse = generateChannel().channel;
    parentMessage = generateMsg();
  });

  const openThread = () =>
    new Thread({
      client,
      threadData: generateThreadResponse(channelResponse, parentMessage),
    });

  describe('declarative configuration', () => {
    it('reaches a thread created after registration', () => {
      client.config.set({ thread: { messagePaginator: { pageSize: 25 } } });

      expect(openThread().messagePaginator.config.pageSize).toBe(25);
    });

    it('installs request handlers into configState', () => {
      const markReadRequest = vi.fn();
      client.config.set({ thread: { requestHandlers: { markReadRequest } } });

      expect(openThread().configState.getLatestValue().requestHandlers).toEqual({
        markReadRequest,
      });
    });

    it('applies without registerSubscriptions — the constructor derives it directly', () => {
      client.config.set({ thread: { messagePaginator: { pageSize: 25 } } });

      const thread = openThread();

      // Only the *setup function* needs a subscription; declarative configuration does not.
      expect(thread.hasSubscriptions).toBe(false);
      expect(thread.messagePaginator.config.pageSize).toBe(25);
    });

    it('reaches a subscribed thread that already exists', () => {
      const thread = openThread();
      thread.registerSubscriptions();

      client.config.set({ thread: { messagePaginator: { pageSize: 25 } } });

      expect(thread.messagePaginator.config.pageSize).toBe(25);
    });

    it('leaves the thread page-size default alone when unconfigured', () => {
      expect(openThread().messagePaginator.config.pageSize).toBe(50);
    });
  });

  describe('construction-time injection', () => {
    it('applies a read-once field registered before the thread exists', () => {
      client.config.set({
        thread: { messagePaginator: { unreadReferencePolicy: 'read-state-only' } },
      });

      const thread = openThread();

      expect(
        (thread.messagePaginator as unknown as { unreadReferencePolicy: string })
          .unreadReferencePolicy,
      ).toBe('read-state-only');
    });

    it('does not accept composer configuration under the thread key', () => {
      client.config.set({ messageComposer: { drafts: { enabled: true } } });

      expect(openThread().messageComposer.config.drafts.enabled).toBe(true);
    });
  });

  describe('setup functions', () => {
    it('runs on registerSubscriptions with every sub-object present', () => {
      const seen: string[] = [];
      client.config.setSetupFunction('thread', ({ thread }) => {
        seen.push(
          [
            typeof thread.messagePaginator,
            typeof thread.messageComposer,
            typeof thread.messageOperations,
          ].join(','),
        );
      });

      openThread().registerSubscriptions();

      expect(seen).toEqual(['object,object,object']);
    });

    it('does not run for a thread that never subscribes', () => {
      const setup = vi.fn();
      client.config.setSetupFunction('thread', setup);

      openThread();

      expect(setup).not.toHaveBeenCalled();
    });

    it('tears down on unregisterSubscriptions', () => {
      const teardown = vi.fn();
      client.config.setSetupFunction('thread', () => teardown);
      const thread = openThread();
      thread.registerSubscriptions();

      thread.unregisterSubscriptions();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('tears down and re-applies when the function is replaced', () => {
      const order: string[] = [];
      client.config.setSetupFunction('thread', () => {
        order.push('first');
        return () => order.push('first-teardown');
      });
      openThread().registerSubscriptions();

      client.config.setSetupFunction('thread', () => {
        order.push('second');
      });

      expect(order).toEqual(['first', 'first-teardown', 'second']);
    });

    it('overrides a declarative value for the same field', () => {
      client.config.set({ thread: { messagePaginator: { pageSize: 25 } } });
      client.config.setSetupFunction('thread', ({ thread }) => {
        thread.messagePaginator.updateConfig({ pageSize: 75 });
      });

      const thread = openThread();
      thread.registerSubscriptions();

      expect(thread.messagePaginator.config.pageSize).toBe(75);
    });

    it('cannot break Thread construction by throwing', () => {
      client.config.setSetupFunction('thread', () => {
        throw new Error('boom');
      });

      expect(() => openThread().registerSubscriptions()).not.toThrow();
    });
  });

  describe('reset', () => {
    it('returns the reply paginator to its derived baseline', () => {
      client.config.set({ thread: { messagePaginator: { pageSize: 25 } } });
      const thread = openThread();
      thread.registerSubscriptions();

      client.config.reset('thread');

      expect(thread.messagePaginator.config.pageSize).toBe(50);
    });

    it('clears declaratively installed request handlers', () => {
      client.config.set({ thread: { requestHandlers: { markReadRequest: vi.fn() } } });
      const thread = openThread();
      thread.registerSubscriptions();

      client.config.reset('thread');

      expect(thread.configState.getLatestValue().requestHandlers).toBeUndefined();
    });

    it('does not disturb the channel key', () => {
      client.config.set({
        channel: { messagePaginator: { pageSize: 50 } },
        thread: { messagePaginator: { pageSize: 25 } },
      });
      const channel = client.channel('messaging', channelResponse.id);

      client.config.reset('thread');

      expect(channel.messagePaginator.config.pageSize).toBe(50);
    });
  });
});
