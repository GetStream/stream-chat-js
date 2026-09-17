import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelWatchStatus, StreamChat } from '../../src';
import { StableWSConnection } from '../../src/connection';
import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from './test-utils/getClient';

/**
 * `client.queryChannels()` sends `watch: true` exactly once and always against a current connection
 * id, because `ApiClient` holds any subscribing request until one exists. A query that asks for
 * neither a watch nor presence is not held at all.
 */
describe('client.queryChannels and the WebSocket', () => {
  let client: StreamChat;
  let request: ReturnType<typeof vi.fn>;

  /** A socket that has dropped: the id is invalidated and a fresh deferred armed for the reconnect. */
  const socketDown = () => {
    const socket = new StableWSConnection({ wsConnection: client.wsConnection });
    client.wsConnection.connection = socket;
    socket._setHealth(true);
    socket._setHealth(false);
  };

  /** A socket that was closed deliberately, so nothing is coming. */
  const socketClosed = () => {
    const socket = new StableWSConnection({ wsConnection: client.wsConnection });
    socket.isDisconnected = true;
    client.wsConnection.connection = socket;
    client.connectionIdManager.reset();
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

    client.connectionIdManager.resolveConnectionId('reconnected-id');
    await querying;

    // One request, watched, after the socket came up — not one unwatched then one watched.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].data).toMatchObject({ watch: true });
  });

  it('never sends watch: false of its own accord', async () => {
    await client.queryChannels({});
    socketDown();
    client.connectionIdManager.resolveConnectionId('again');
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

  it('does not wait for a socket when the caller asked for no watch and no presence', async () => {
    // A plain read needs no connection id, which is what makes it usable offline.
    socketDown();

    await client.queryChannels({ watch: false, presence: false });

    expect(request.mock.calls[0][0].data).toMatchObject({ watch: false });
  });

  it('still waits when the caller asked for presence without watch', async () => {
    // Presence is a server-side subscription keyed by connection id too, so it is held exactly as a
    // watch is.
    socketDown();

    const querying = client.queryChannels({ watch: false, presence: true });
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();

    client.connectionIdManager.resolveConnectionId('back');
    await querying;
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('holds the query rather than sending it unwatched while the socket is down', async () => {
    socketDown();

    void client.queryChannels({});
    await Promise.resolve();

    expect(request).not.toHaveBeenCalled();
  });

  it('abandons the wait when the caller aborts', async () => {
    // The signal reaches the wait for a connection id, not only the HTTP call it precedes.
    socketDown();
    const controller = new AbortController();

    const querying = client.queryChannels({}, { signal: controller.signal });
    controller.abort();

    await expect(querying).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects with the reason the caller aborted with', async () => {
    socketDown();
    const controller = new AbortController();
    const reason = new Error('the search moved on');

    const querying = client.queryChannels({}, { signal: controller.signal });
    controller.abort(reason);

    await expect(querying).rejects.toBe(reason);
  });

  it('rejects immediately for a signal that was already aborted', async () => {
    socketDown();

    await expect(
      client.queryChannels({}, { signal: AbortSignal.abort(new Error('gone')) }),
    ).rejects.toThrow('gone');
  });

  it('rejects at once after closeConnection rather than waiting for a reconnect', async () => {
    socketClosed();

    // Not a wait: there is no socket and none is being opened, so the error says what to do about
    // it rather than leaving the caller to guess why nothing happened.
    await expect(client.queryChannels({})).rejects.toThrow(
      /No connection id is available/,
    );
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
      // back then never cleared and so stayed truthy through a drop — the bug that made a false `Watching`
      // possible in the first place.
      client.wsConnection._setStatus({ isHealthy: false });
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
      client.wsConnection._setStatus({ isHealthy: false });
      client.wsConnection.connection = new StableWSConnection({
        wsConnection: client.wsConnection,
      });
      vi.spyOn(channel, 'watch').mockResolvedValue(undefined as never);

      const both = Promise.all([
        getChannel({ client, channel }),
        getChannel({ client, channel }),
      ]);
      client.wsConnection._setStatus({ isHealthy: true, connectionId: 'shared-id' });
      await both;

      expect(channel.watch).toHaveBeenCalledTimes(1);
    });

    it('a channel whose watch failed is still recovered on the next reconnect', async () => {
      // Why a throwing `watch()` is an acceptable outcome rather than a dead end:
      // `recoverableActiveChannels` filters on `active`, never on `watchStatus`, precisely so a
      // channel that failed to watch is picked up by the next recovery.
      const channel = client.channel('messaging', 'failed-watch');
      channel.initialized = true;
      channel.activate();
      socketClosed();

      await expect(channel.watch()).rejects.toThrow(/No connection id is available/);
      expect(channel.watchStatus).toBe(ChannelWatchStatus.NotWatching);

      const reload = vi.spyOn(channel, 'reload').mockResolvedValue(undefined);
      client.connectionRecovery.registerSubscriptions();
      const socket = new StableWSConnection({ wsConnection: client.wsConnection });
      client.wsConnection.connection = socket;
      socket._setHealth(true);
      socket._setHealth(false);
      client.connectionIdManager.resolveConnectionId('back');
      socket._setHealth(true);

      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    });
  });
});
