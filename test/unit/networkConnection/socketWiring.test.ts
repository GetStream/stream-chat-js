import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src';
import { StableWSConnection } from '../../../src/connection';
import type { NetworkStatusListenerRegistrar } from '../../../src';

const fakeRegistrar = () => {
  let emit: ((isOnline: boolean) => void) | undefined;
  const registrar: NetworkStatusListenerRegistrar = (onStatusChange) => {
    emit = onStatusChange;
    return vi.fn();
  };
  return {
    registrar,
    emit: (isOnline: boolean) => {
      if (!emit) throw new Error('registrar was never installed');
      emit(isOnline);
    },
  };
};

/** A client with a live socket, without opening a socket. */
const clientWithSocket = () => {
  const client = new StreamChat('api-key');
  const source = fakeRegistrar();
  client.networkConnection.setStatusListenerRegistrar(source.registrar);

  const connection = new StableWSConnection({ client });
  client.wsConnection.connection = connection;

  return { client, connection, source };
};

describe('socket ↔ network wiring', () => {
  describe('no window listeners', () => {
    it('the socket registers none — the browser registrar is the only place that touches window', () => {
      const addEventListener = vi.fn();
      vi.stubGlobal('window', { addEventListener, removeEventListener: vi.fn() });

      const client = new StreamChat('api-key');
      new StableWSConnection({ client });

      const networkListeners = addEventListener.mock.calls.filter(([type]) =>
        ['online', 'offline'].includes(type as string),
      );
      expect(networkListeners).toHaveLength(0);

      vi.unstubAllGlobals();
    });
  });

  describe('reacting to the network', () => {
    it('does not reconnect merely because it was constructed while the network is up', () => {
      // The reason this subscribes to the event and not to `client.networkConnection.state`:
      // `StateStore.subscribe` fires synchronously with the current value, so a store subscription
      // would call `_reconnect` during construction.
      const client = new StreamChat('api-key');
      const source = fakeRegistrar();
      client.networkConnection.setStatusListenerRegistrar(source.registrar);
      source.emit(true);

      const connection = new StableWSConnection({ client });
      const reconnect = vi.spyOn(connection, '_reconnect').mockResolvedValue(undefined);

      expect(reconnect).not.toHaveBeenCalled();
    });

    it('marks itself down when the network goes offline', () => {
      const { connection, source } = clientWithSocket();
      connection.isOnline = true;

      source.emit(false);

      expect(connection.isOnline).toBe(false);
    });

    it('reconnects with the fast interval when the network returns and the socket is down', () => {
      const { connection, source } = clientWithSocket();
      const reconnect = vi.spyOn(connection, '_reconnect').mockResolvedValue(undefined);
      connection.isOnline = false;

      source.emit(true);

      // 10ms short-circuits the randomised backoff: a fresh network is the one moment an immediate
      // retry is likely to succeed.
      expect(reconnect).toHaveBeenCalledWith({ interval: 10 });
    });

    it('leaves a healthy socket alone when the network returns', () => {
      const { connection, source } = clientWithSocket();
      const reconnect = vi.spyOn(connection, '_reconnect').mockResolvedValue(undefined);
      connection.isOnline = true;

      source.emit(true);

      expect(reconnect).not.toHaveBeenCalled();
    });

    it('ignores its own ws status events', () => {
      // Without the `connection !== 'network'` guard the handler would receive the events this very
      // socket dispatches. The compiler cannot catch a missing guard: both variants carry the
      // same payload shape.
      const { client, connection } = clientWithSocket();
      const reconnect = vi.spyOn(connection, '_reconnect').mockResolvedValue(undefined);
      connection.isOnline = false;

      client.dispatchEvent({
        type: 'connection.changed',
        connection: 'ws',
        online: true,
      });

      expect(reconnect).not.toHaveBeenCalled();
    });

    it('still works through the deprecated DOM-shaped entry point React Native calls', () => {
      const { connection } = clientWithSocket();
      connection.isOnline = true;

      connection.onlineStatusChanged({ type: 'offline' } as Event);

      expect(connection.isOnline).toBe(false);
    });
  });

  describe('publishing into client.wsConnection.state', () => {
    let client: StreamChat;
    let connection: StableWSConnection;

    beforeEach(() => {
      ({ client, connection } = clientWithSocket());
    });

    it('reports going up, with the connection id', () => {
      connection.connectionID = 'conn-1';
      connection._setOnline(true);

      const state = client.wsConnection.state.getLatestValue();
      expect(state.isOnline).toBe(true);
      expect(state.connectionId).toBe('conn-1');
      expect(state.lastOnlineAt).toBeInstanceOf(Date);
    });

    it('reports going down after disconnect(), which dispatches no event at all', async () => {
      // The case the store exists for. `closeConnection()` calls `disconnect()`, which sets the
      // status directly and never reaches `_setOnline` — so `connection.changed` stays silent while
      // the store still tells the truth.
      connection._setOnline(true);

      const onEvent = vi.fn();
      client.on('connection.changed', onEvent);

      await connection.disconnect(0);

      expect(client.wsConnection.state.getLatestValue().isOnline).toBe(false);
      expect(client.wsConnection.state.getLatestValue().lastOfflineAt).toBeInstanceOf(
        Date,
      );
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('leaves the connection id alone when going down', () => {
      // `connectionID` is never cleared anywhere, so blanking it here would misrepresent the field
      // rather than reflect it. Its own doc says a value does not imply the socket is up.
      connection.connectionID = 'conn-2';
      connection._setOnline(true);
      connection._setOnline(false);

      expect(client.wsConnection.state.getLatestValue().connectionId).toBe('conn-2');
    });

    it('does not stamp a timestamp for a repeated identical status', () => {
      connection._setOnline(true);
      const first = client.wsConnection.state.getLatestValue().lastOnlineAt;

      connection._setOnline(true);

      expect(client.wsConnection.state.getLatestValue().lastOnlineAt).toBe(first);
    });

    it('publishes immediately while connection.changed keeps its 5s going-offline delay', () => {
      vi.useFakeTimers();
      try {
        connection._setOnline(true);

        const onEvent = vi.fn();
        client.on('connection.changed', onEvent);

        connection._setOnline(false);

        // The store is the raw edge; the event keeps the anti-flicker debounce UI depends on. The
        // two must not have been collapsed into one.
        expect(client.wsConnection.state.getLatestValue().isOnline).toBe(false);
        expect(onEvent).not.toHaveBeenCalled();

        vi.advanceTimersByTime(5000);
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ connection: 'ws', online: false }),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
