import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, Event, StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { retry } from '../../helpers/wait';

describe('_default/05-features/04-typing_indicators.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const otherId = uniqueId('jack');
  let client: StreamChat;
  let otherClient: StreamChat;

  // A fresh channel per test, watched by both users, with a parent message for thread typing.
  const createWatchedChannels = async () => {
    const id = uniqueId('channel');
    const channel = client.channel('messaging', id, { members: [userId, otherId] });
    cleanup.channels.push(`messaging:${id}`);
    await channel.watch();
    const otherChannel = otherClient.channel('messaging', id);
    await otherChannel.watch();
    const { message } = await channel.sendMessage({ text: 'Thread parent' });
    return { channel, otherChannel, parentId: message.id };
  };

  // Records the typing events a watched channel receives.
  const recordTypingEvents = (channel: Channel) => {
    const events: Event[] = [];
    channel.on((event) => {
      if (event.type === 'typing.start' || event.type === 'typing.stop') {
        events.push(event);
      }
    });
    return events;
  };

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    client = await getClientSideClient({ id: userId, name: 'John' });
    otherClient = await getClientSideClient({ id: otherId, name: 'Jack' });
  });

  afterAll(async () => {
    await disconnectClients(client, otherClient);
    await cleanup.run();
  });

  it('sends typing events', async () => {
    const { channel, otherChannel, parentId } = await createWatchedChannels();
    const received = recordTypingEvents(otherChannel);
    const thread_id = parentId;
    try {
      // #region snippet docs="_default/05-features/04-typing_indicators.md" heading="Sending Typing Events" tab="JavaScript" index=1
      // The JS client keeps track of the typing state for you.
      // Just call `channel.keystroke()` when the user types and
      // `channel.stopTyping()` when the user sends the message (or aborts)

      // sends a typing.start event at most once every two seconds
      await channel.keystroke();

      // sends a typing.start event for a particular thread
      await channel.keystroke(thread_id);

      // sends the typing.stop event
      await channel.stopTyping();
      // #endregion snippet

      await retry(() => {
        expect(received.map((e) => [e.type, e.user?.id])).toEqual(
          expect.arrayContaining([
            ['typing.start', userId],
            ['typing.stop', userId],
          ]),
        );
        return Promise.resolve();
      });
      expect(channel.isTyping).toBe(false);

      // The thread keystroke on its own (outside the two-second throttle) carries the parent id.
      await channel.keystroke(thread_id);
      await retry(() => {
        expect(
          received.some(
            (e) =>
              e.type === 'typing.start' &&
              e.user?.id === userId &&
              e.parent_id === thread_id,
          ),
        ).toBe(true);
        return Promise.resolve();
      });
      await channel.stopTyping(thread_id);
    } finally {
      otherChannel.listeners = {};
    }
  });

  it('receives typing events', async () => {
    const { channel, otherChannel, parentId } = await createWatchedChannels();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/05-features/04-typing_indicators.md" heading="Receiving typing indicator events" tab="JavaScript" index=1
      // channels keep track of the users that are currently typing.
      // `channel.state.typing` is an immutable object which gets regenerated
      // every time a new user is added or removed to this list
      console.log(channel.state.typing);

      // start typing event handling
      channel.on('typing.start', (event) => {
        if (event.parent_id) {
          console.log(`${event.user?.name} started typing in thread ${event.parent_id}`);
        } else {
          console.log(`${event.user?.name} started typing`);
        }
      });

      // stop typing event handling
      channel.on('typing.stop', (event) => {
        if (event.parent_id) {
          console.log(`${event.user?.name} stopped typing in thread ${event.parent_id}`);
        } else {
          console.log(`${event.user?.name} stopped typing`);
        }
      });
      // #endregion snippet

      expect(logSpy).toHaveBeenCalledWith({});

      await otherChannel.keystroke();
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('Jack started typing');
        expect(Object.keys(channel.state.typing)).toEqual([otherId]);
        return Promise.resolve();
      });

      await otherChannel.stopTyping();
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('Jack stopped typing');
        expect(channel.state.typing).toEqual({});
        return Promise.resolve();
      });

      await otherChannel.keystroke(parentId);
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith(`Jack started typing in thread ${parentId}`);
        return Promise.resolve();
      });

      await otherChannel.stopTyping(parentId);
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith(`Jack stopped typing in thread ${parentId}`);
        return Promise.resolve();
      });
    } finally {
      logSpy.mockRestore();
      channel.listeners = {};
    }
  });
});
