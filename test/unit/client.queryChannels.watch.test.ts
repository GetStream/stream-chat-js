import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelWatchStatus, StreamChat } from '../../src';
import { StableWSConnection } from '../../src/connection';
import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from './test-utils/getClient';

/**
 * `client.queryChannels()` had the same defect as `channel.watch()`, verbatim: it awaited
 * `client.wsPromise` — already resolved during a socket-internal reconnect — and then downgraded to
 * `watch: false` if there was no connection ID, a value that is never cleared and so stays truthy
 * right through a drop. The result was a query that sent `watch: true` against a dead connection, or
 * one that returned unwatched data a second query had to follow.
 *
 * It now waits for a live socket, so `watch: true` always goes out exactly once and always binds to a
 * connection ID that is current.
 */
describe('client.queryChannels and the WebSocket', () => {
  let client: StreamChat;
  let request: ReturnType<typeof vi.fn>;

  const socketDown = () => {
    client.wsConnection.connection = new StableWSConnection({ client });
    client.wsConnection._setStatus({ isOnline: false });
  };

  beforeEach(() => {
    client = getClientWithUser({ id: 'me' }) as StreamChat;
    request = vi.fn().mockResolvedValue({
      data: { channels: [generateChannel()] },
    });
    vi.spyOn(client.axiosInstance, 'request').mockImplementation(request as never);
  });

  it('sends watch: true when the socket is already up', async () => {
    await client.queryChannels({});

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].data).toMatchObject({ watch: true });
  });

  it('waits for the socket and then sends one watched request', async () => {
    socketDown();

    const querying = client.queryChannels({});
    // The old code would already have sent an unwatched query by now.
    expect(request).not.toHaveBeenCalled();

    client.wsConnection._setStatus({ isOnline: true, connectionId: 'reconnected-id' });
    await querying;

    // One request, watched, after the socket came up — not one unwatched then one watched.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].data).toMatchObject({ watch: true });
  });

  it('never sends watch: false of its own accord', async () => {
    await client.queryChannels({});
    client.wsConnection._setStatus({ isOnline: false });
    client.wsConnection._setStatus({ isOnline: true, connectionId: 'again' });
    await client.queryChannels({});

    for (const call of request.mock.calls) {
      expect(call[0].data).toMatchObject({ watch: true });
    }
  });

  it('still honours an explicit watch: false from the caller', async () => {
    // One request object, not (filter, sort, options) — `watch` rides on it.
    await client.queryChannels({ watch: false });

    expect(request.mock.calls[0][0].data).toMatchObject({ watch: false });
  });

  it('rejects rather than querying unwatched when the socket does not come back', async () => {
    socketDown();
    client.config.set({ client: { wsConnection: { connectTimeoutMs: 20 } } });

    await expect(client.queryChannels({})).rejects.toThrow(/Timed out after 20ms/);

    expect(request).not.toHaveBeenCalled();
  });

  it('rejects at once after closeConnection rather than burning the timeout', async () => {
    const socket = new StableWSConnection({ client });
    socket.isDisconnected = true;
    client.wsConnection.connection = socket;
    client.wsConnection._setStatus({ isOnline: false });
    client.config.set({ client: { wsConnection: { connectTimeoutMs: 60_000 } } });

    await expect(client.queryChannels({})).rejects.toThrow(/closed deliberately/);
  });

  describe('watchStatus truthfulness', () => {
    it('records Watching only when the query that set it actually watched', async () => {
      const response = generateChannel({ channel: { id: 'watched' } });

      const [watched] = client.hydrateActiveChannels([response]);
      expect(watched.watchStatus).toBe(ChannelWatchStatus.Watching);

      // Offline hydration populates state without a live watch, so it must never count.
      const offline = generateChannel({ channel: { id: 'from-db' } });
      const [hydrated] = client.hydrateActiveChannels([offline], { offlineMode: true });
      expect(hydrated.watchStatus).toBe(ChannelWatchStatus.NotWatching);
    });

    it('does not record Watching while the socket is down', async () => {
      // The backstop behind the wait: it now reads `isOnline` rather than the connection ID, which is
      // never cleared and so stayed truthy through a drop — the bug that made a false `Watching`
      // possible in the first place.
      client.wsConnection._setStatus({ isOnline: false });
      const response = generateChannel({ channel: { id: 'socket-down' } });

      const [hydrated] = client.hydrateActiveChannels([response]);

      expect(hydrated.watchStatus).toBe(ChannelWatchStatus.NotWatching);
    });
  });

  describe('composition with what already exists', () => {
    it('two concurrent getChannel calls for one cid still make one request', async () => {
      // `getChannel` keys in-flight watches by cid so concurrent callers share one request. With the
      // wait added, N concurrent openers of the same channel become one wait and one watched
      // request — the "no duplicate requests" property now actually held rather than approximated.
      const { getChannel } = await import('../../src/pagination/utility.queryChannel');
      const channel = client.channel('messaging', 'shared');
      client.wsConnection._setStatus({ isOnline: false });
      client.wsConnection.connection = new StableWSConnection({ client });
      vi.spyOn(channel, 'watch').mockResolvedValue(undefined as never);

      const both = Promise.all([
        getChannel({ client, channel }),
        getChannel({ client, channel }),
      ]);
      client.wsConnection._setStatus({ isOnline: true, connectionId: 'shared-id' });
      await both;

      expect(channel.watch).toHaveBeenCalledTimes(1);
    });

    it('a channel whose watch timed out is still recovered on the next reconnect', async () => {
      // Why a throwing `watch()` is an acceptable outcome rather than a dead end:
      // `recoverableActiveChannels` filters on `active`, never on `watchStatus`, precisely so a
      // channel that failed to watch is picked up by the next recovery.
      const channel = client.channel('messaging', 'timed-out');
      channel.initialized = true;
      channel.activate();
      client.wsConnection.connection = new StableWSConnection({ client });
      client.wsConnection._setStatus({ isOnline: false });
      client.config.set({ client: { wsConnection: { connectTimeoutMs: 20 } } });

      await expect(channel.watch()).rejects.toThrow(/Timed out/);
      expect(channel.watchStatus).toBe(ChannelWatchStatus.NotWatching);

      const reload = vi.spyOn(channel, 'reload').mockResolvedValue(undefined);
      client.connectionRecovery.registerSubscriptions();
      client.wsConnection._setStatus({ isOnline: true, connectionId: 'back' });
      client.dispatchEvent({
        type: 'connection.changed',
        connection: 'ws',
        online: true,
      });

      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    });
  });
});
