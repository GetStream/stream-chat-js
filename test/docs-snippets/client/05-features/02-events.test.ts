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

describe('_default/05-features/02-events.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const otherId = uniqueId('jack');
  let client: StreamChat;
  let otherClient: StreamChat | undefined;

  // A fresh channel per test, watched by `client`, so the listeners a snippet adds don't see
  // the events of other tests.
  const createWatchedChannel = async () => {
    const id = uniqueId('channel');
    const channel = client.channel('messaging', id, { members: [userId, otherId] });
    cleanup.channels.push(`messaging:${id}`);
    await channel.watch();
    return channel;
  };

  // Drops the listeners a snippet registered on a channel, once its test is done.
  const removeListeners = (channel: Channel) => {
    channel.listeners = {};
  };

  const sendAsOther = (channel: Channel, text: string) =>
    serverClient
      .channel(channel.type, channel.id)
      .sendMessage({ text, user_id: otherId });

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUser({ id: otherId, name: 'Jack' });
    client = await getClientSideClient({ id: userId, name: 'John' });
  });

  afterAll(async () => {
    await disconnectClients(client, ...(otherClient ? [otherClient] : []));
    await cleanup.run();
  });

  it('listens for events', async () => {
    const channel = await createWatchedChannel();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/05-features/02-events.md" heading="Listening for Events" tab="JavaScript" index=1
      channel.on('message.new', (event) => {
        console.log('received a new message', event.message?.text);
      });

      channel.on('message.deleted', (event) => {
        console.log('message was deleted', event.message?.id);
      });
      // #endregion snippet

      const { message } = await sendAsOther(channel, 'Hello from Jack');
      await serverClient.deleteMessage(message.id);

      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('received a new message', 'Hello from Jack');
        expect(logSpy).toHaveBeenCalledWith('message was deleted', message.id);
        return Promise.resolve();
      });
    } finally {
      logSpy.mockRestore();
      removeListeners(channel);
    }
  });

  it('listens to all events', async () => {
    const channel = await createWatchedChannel();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/05-features/02-events.md" heading="Listening for Events" tab="JavaScript" index=2
      channel.on((event) => {
        console.log('event', event);
        console.log('channel.state', channel.state);
      });
      // #endregion snippet

      const { message } = await sendAsOther(channel, 'Any event');

      await retry(() => {
        const events = logSpy.mock.calls
          .filter(([label]) => label === 'event')
          .map(([, event]) => event as Event);
        expect(
          events.some((e) => e.type === 'message.new' && e.message?.id === message.id),
        ).toBe(true);
        expect(logSpy).toHaveBeenCalledWith('channel.state', channel.state);
        return Promise.resolve();
      });
    } finally {
      logSpy.mockRestore();
      removeListeners(channel);
    }
  });

  it('watches a channel with presence', async () => {
    const channelId = uniqueId('my-conversation');
    const johnId = userId;
    const jackId = otherId;
    cleanup.channels.push(`messaging:${channelId}`);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let presenceListener: { unsubscribe: () => void } | undefined;
    const onSpy = vi.spyOn(client, 'on');
    try {
      // #region snippet docs="_default/05-features/02-events.md" heading="Event Types" tab="JavaScript" index=1
      // COPY: channelId="my-conversation-123", johnId="john", jackId="jack"
      // Watch a channel with presence enabled to receive user presence events
      const channel = client.channel('messaging', channelId, {
        members: [johnId, jackId],
      });

      const state = await channel.watch({ presence: true });

      // Listen for user presence changes
      client.on('user.presence.changed', (event) => {
        console.log(
          `${event.user?.name} is now ${event.user?.online ? 'online' : 'offline'}`,
        );
      });
      // #endregion snippet

      presenceListener = onSpy.mock.results[0]?.value as { unsubscribe: () => void };
      expect(state.channel.id).toBe(channelId);
      expect(state.members.map((m) => m.user_id).sort()).toEqual([johnId, jackId].sort());

      // Jack comes online, then goes offline.
      otherClient = await getClientSideClient({ id: jackId, name: 'Jack' });
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('Jack is now online');
        return Promise.resolve();
      });
      await disconnectClients(otherClient);
      otherClient = undefined;
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('Jack is now offline');
        return Promise.resolve();
      });
    } finally {
      presenceListener?.unsubscribe();
      onSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('listens for connection events', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const onSpy = vi.spyOn(client, 'on');
    let listener: { unsubscribe: () => void } | undefined;
    try {
      // #region snippet docs="_default/05-features/02-events.md" heading="Connection Events" tab="JavaScript" index=1
      client.on('connection.changed', (e) => {
        if (e.online) {
          console.log('the connection is up!');
        } else {
          console.log('the connection is down!');
        }
      });
      // #endregion snippet

      listener = onSpy.mock.results[0]?.value as { unsubscribe: () => void };

      // Simulate the browser going offline and back online.
      client.wsConnection?.onlineStatusChanged(new globalThis.Event('offline'));
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('the connection is down!');
        return Promise.resolve();
      });
      client.wsConnection?.onlineStatusChanged(new globalThis.Event('online'));
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('the connection is up!');
        return Promise.resolve();
      });
      await retry(() => {
        expect(client.wsConnection?.isHealthy).toBe(true);
        return Promise.resolve();
      });
    } finally {
      listener?.unsubscribe();
      onSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('stops listening for events', async () => {
    const channel = await createWatchedChannel();
    const myClientEventHandler = vi.fn();
    const myChannelEventHandler = vi.fn();

    // #region snippet docs="_default/05-features/02-events.md" heading="Stop Listening for Events" tab="JavaScript" index=1
    // remove the handler from all client events
    const myClientEventListener = client.on('connection.changed', myClientEventHandler);
    myClientEventListener.unsubscribe();

    // remove the handler from all events on a channel
    const myChannelEventListener = channel.on('message.new', myChannelEventHandler);
    myChannelEventListener.unsubscribe();
    // #endregion snippet

    // A control listener proves the events did arrive.
    const clientControl = vi.fn();
    const channelControl = vi.fn();
    const controls = [
      client.on('connection.changed', clientControl),
      channel.on('message.new', channelControl),
    ];
    try {
      client.dispatchEvent({ type: 'connection.changed', online: true });
      await sendAsOther(channel, 'Nobody listens');
      await retry(() => {
        expect(channelControl).toHaveBeenCalled();
        return Promise.resolve();
      });
      expect(clientControl).toHaveBeenCalled();
      expect(myClientEventHandler).not.toHaveBeenCalled();
      expect(myChannelEventHandler).not.toHaveBeenCalled();
    } finally {
      controls.forEach((c) => c.unsubscribe());
      removeListeners(channel);
    }
  });

  it('sends a custom event to a channel', async () => {
    const channel = await createWatchedChannel();
    otherClient = await getClientSideClient({ id: otherId, name: 'Jack' });
    const otherChannel = otherClient.channel(channel.type, channel.id);
    await otherChannel.watch();
    const received: Event[] = [];
    otherChannel.on('friendship_request', (event) => received.push(event));

    // #region snippet docs="_default/05-features/02-events.md" heading="To a channel" tab="JavaScript" index=1
    // sends an event for the current user to all connect clients on the channel
    await channel.sendEvent({
      type: 'friendship_request',
      text: 'Hey there, long time no see!',
    });
    // #endregion snippet

    await retry(() => {
      expect(received).toHaveLength(1);
      return Promise.resolve();
    });
    expect(received[0].text).toBe('Hey there, long time no see!');
    expect(received[0].user?.id).toBe(userId);
    expect(received[0].cid).toBe(channel.cid);

    await disconnectClients(otherClient);
    otherClient = undefined;
  });
});
