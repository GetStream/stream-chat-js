import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src';
import { StableWSConnection } from '../../../src/connection';

describe('client.wsConnection', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api-key');
  });

  describe('existing before the first connect', () => {
    it('is present on a fresh client, with no socket and no connection id', () => {
      // The reason this is a wrapper rather than the socket itself: a consumer must be able to
      // subscribe before `connectUser` resolves, and the socket does not exist until then.
      expect(client.wsConnection).toBeDefined();
      expect(client.wsConnection.connection).toBeNull();
      expect(client.wsConnection.connectionID).toBeUndefined();
    });

    it('answers isOnline as false rather than throwing', () => {
      // Read from `state`, not from `connection` — which is null here.
      expect(client.wsConnection.isOnline).toBe(false);
    });

    it('is subscribable before any socket exists', () => {
      const onChange = vi.fn();
      client.wsConnection.state.subscribe(onChange);

      // `StateStore.subscribe` fires once with the current value, so this proves the store is live.
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('reports isConnecting as false with no socket', () => {
      expect(client.wsConnection.isConnecting).toBe(false);
    });
  });

  describe('surviving socket replacement', () => {
    it('keeps the same object and store across replacements, so subscribers are not stranded', () => {
      // This is the regression test for the whole task. `client.connect()` builds a new
      // StableWSConnection every call, and `closeConnection()` → `openConnection()` is the
      // documented mobile background/foreground flow — so a store on the `StableWSConnection` instance would
      // be swapped out from under anyone who subscribed before it.
      const wrapper = client.wsConnection;
      const store = client.wsConnection.state;

      const onChange = vi.fn();
      store.subscribe(onChange);
      onChange.mockClear();

      client.wsConnection.connection = new StableWSConnection({ client });
      client.wsConnection.connection = new StableWSConnection({ client });

      expect(client.wsConnection).toBe(wrapper);
      expect(client.wsConnection.state).toBe(store);

      client.wsConnection.connection?._setOnline(true);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(client.wsConnection.isOnline).toBe(true);
    });

    it('answers isOnline from the store, not from the freshly-built socket', () => {
      client.wsConnection.connection = new StableWSConnection({ client });
      client.wsConnection.connection._setOnline(true);

      // A replacement socket starts internally down. If `isOnline` read the socket we would
      // report a regression to `false` here, having never gone down.
      client.wsConnection.connection = new StableWSConnection({ client });

      expect(client.wsConnection.isOnline).toBe(true);
    });
  });

  describe('owning the network subscription', () => {
    it('routes network status to the current socket, not a replaced one', () => {
      // The subscription lives here rather than on the socket because `client.connect()`
      // overwrites `connection` *without* disconnecting the previous one. Held per socket, the old
      // subscription would survive and a dead socket would keep reacting to network-online by
      // calling `_reconnect()` on itself.
      const stale = new StableWSConnection({ client });
      client.wsConnection.connection = stale;

      const current = new StableWSConnection({ client });
      client.wsConnection.connection = current;

      const staleApply = vi.spyOn(stale, '_applyNetworkStatus');
      const currentApply = vi.spyOn(current, '_applyNetworkStatus');

      client.networkConnection.setStatus(false);

      expect(currentApply).toHaveBeenCalledWith(false);
      expect(staleApply).not.toHaveBeenCalled();
    });

    it('registers exactly one listener however many sockets come and go', () => {
      const before = client.listeners.get('connection.changed')?.size ?? 0;

      client.wsConnection.connection = new StableWSConnection({ client });
      client.wsConnection.connection = new StableWSConnection({ client });
      client.wsConnection.connection = new StableWSConnection({ client });

      expect(client.listeners.get('connection.changed')?.size ?? 0).toBe(before);
    });

    it('stops routing once unregistered', () => {
      const connection = new StableWSConnection({ client });
      client.wsConnection.connection = connection;
      const apply = vi.spyOn(connection, '_applyNetworkStatus');

      // Ref-counted: the client registered once, so one more register needs two unregisters.
      client.wsConnection.registerSubscriptions()();
      client.wsConnection.unregisterSubscriptions();

      client.networkConnection.setStatus(false);

      expect(apply).not.toHaveBeenCalled();
    });
  });

  describe('building the socket', () => {
    it('has none until connect is called', () => {
      const fresh = new StreamChat('api-key-fresh');
      expect(fresh.wsConnection.connection).toBeNull();
    });

    it('builds one on connect and replaces any previous', () => {
      // A fresh socket per connect is the existing behaviour, kept deliberately: it resets `wsID`,
      // the failure counters and the health-check timers, and `wsID` is what makes callbacks from an
      // abandoned socket recognisable and ignorable.
      const built = new StreamChat('api-key-build');
      vi.spyOn(StableWSConnection.prototype, 'connect').mockResolvedValue(
        undefined as never,
      );

      built.wsConnection.connect(10);
      const first = built.wsConnection.connection;
      expect(first).toBeInstanceOf(StableWSConnection);

      built.wsConnection.connect(10);
      expect(built.wsConnection.connection).not.toBe(first);
    });

    it('closes the socket it replaces, rather than abandoning it', () => {
      // Left unclosed, the old socket kept both its timers armed and `isDisconnected` false — and
      // `isDisconnected` is the flag `_reconnect()` checks before giving up. So it stayed live and
      // reconnected alongside its replacement: two sockets, two ping loops, and whichever answered
      // last winning the client's status.
      vi.spyOn(StableWSConnection.prototype, '_connect').mockResolvedValue(
        undefined as never,
      );
      vi.spyOn(StableWSConnection.prototype, '_waitForHealthy').mockResolvedValue(
        undefined as never,
      );
      // Fake timers installed BEFORE anything is armed, so the socket's timers register on the fake
      // clock. Installed afterwards, the real timers stay pending on the real clock and advancing
      // this one proves nothing.
      vi.useFakeTimers();
      const replacing = new StreamChat('api-key-replace', {
        allowServerSideConnect: true,
      });

      replacing.wsConnection.connect(10);
      const first = replacing.wsConnection.connection;
      if (!first) throw new Error('socket missing');

      // The state a health-check timeout leaves behind: down, timers running, never disconnected.
      first._setOnline(true);
      first.scheduleNextPing();
      first.scheduleConnectionCheck();
      first._setOnline(false);
      expect(first.isDisconnected).toBe(false);

      const reconnect = vi.spyOn(first, '_reconnect').mockResolvedValue(undefined);
      const send = vi.fn();
      first.ws = { send, close: vi.fn(), readyState: 1 } as never;

      replacing.wsConnection.connect(10);

      expect(replacing.wsConnection.connection).not.toBe(first);
      // `isDisconnected` is what makes `_reconnect()` give up, and only `disconnect()` sets it.
      expect(first.isDisconnected).toBe(true);

      // And the timers really are dead: nothing fires however far the clock is advanced. Asserted by
      // running the clock rather than by checking the handles, because `disconnect()` cancels the
      // timers without nulling the fields — so `healthCheckTimeoutRef` stays truthy while being a
      // stale handle.
      vi.advanceTimersByTime(10 * 60_000);
      vi.useRealTimers();

      expect(reconnect).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('bumps the replaced socket wsID so its in-flight callbacks are ignored', () => {
      // `wsID` is how every callback in `StableWSConnection` recognises that it belongs to a socket
      // that has moved on (`if (this.wsID !== wsId) return`). A frame already in flight when the
      // socket is replaced has to land on a stale id, or a discarded socket can still drive status.
      vi.spyOn(StableWSConnection.prototype, '_connect').mockResolvedValue(
        undefined as never,
      );
      vi.spyOn(StableWSConnection.prototype, '_waitForHealthy').mockResolvedValue(
        undefined as never,
      );
      const replacing = new StreamChat('api-key-wsid', { allowServerSideConnect: true });

      replacing.wsConnection.connect(10);
      const first = replacing.wsConnection.connection;
      if (!first) throw new Error('socket missing');
      const idBefore = first.wsID;

      replacing.wsConnection.connect(10);

      expect(first.wsID).toBeGreaterThan(idBefore);
    });

    it('does not close an injected socket that is being reused', () => {
      // `buildConnection` hands back the same instance every time when one is injected, so the
      // replacement check must compare identity — disconnecting it here would shut down the very
      // socket about to be connected.
      const injected = new StableWSConnection({} as never);
      injected.connect = vi.fn().mockResolvedValue(undefined) as never;
      const disconnect = vi.spyOn(injected, 'disconnect');
      const reusing = new StreamChat('api-key-reuse', { allowServerSideConnect: true });
      reusing.wsConnection.updateConfig({ connection: injected });

      reusing.wsConnection.connect(10);
      reusing.wsConnection.connect(10);

      expect(reusing.wsConnection.connection).toBe(injected);
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('uses a socket supplied through options.wsConnection instead of building one', () => {
      const injected = new StableWSConnection({} as never);
      injected.connect = vi.fn().mockResolvedValue(undefined) as never;

      const withInjected = new StreamChat('api-key-injected', {
        allowServerSideConnect: true,
      });
      // Properly typed now that it is a config field — no `as never` to get past `StreamChatOptions`.
      withInjected.wsConnection.updateConfig({ connection: injected });

      withInjected.wsConnection.connect(10);

      expect(withInjected.wsConnection.connection).toBe(injected);
      // Handed the client it was built without — which is why `setClient` exists.
      expect(injected.client).toBe(withInjected);
    });
  });

  describe('delegated members', () => {
    beforeEach(() => {
      client.wsConnection.connection = new StableWSConnection({ client });
    });

    it('forwards isConnecting', () => {
      expect(client.wsConnection.isConnecting).toBe(false);

      const connection = client.wsConnection.connection;
      if (!connection) throw new Error('socket missing');
      connection.isConnecting = true;

      expect(client.wsConnection.isConnecting).toBe(true);
    });

    it('records a disconnect in the store without announcing it as a drop', async () => {
      // `disconnect()` is what `closeConnection()` uses — the mobile background path — and it
      // deliberately dispatches no `connection.changed`: announcing a deliberate shutdown as a
      // connection drop would be wrong. The store must still tell the truth, and that asymmetry is
      // the reason `client.wsConnection.state` is worth publishing separately from the event.
      //
      // `ThreadManager` used to gate its post-reconnect reload on that event and so never reloaded
      // after a backgrounded app came back.
      const socket = client.wsConnection.connection;
      if (!socket) throw new Error('socket missing');
      socket._setOnline(true);

      const dispatch = vi.spyOn(client, 'dispatchEvent');
      await client.wsConnection.disconnect(0);

      expect(client.wsConnection.state.getLatestValue().isOnline).toBe(false);
      expect(client.wsConnection.state.getLatestValue().lastOfflineAt).toBeInstanceOf(
        Date,
      );
      expect(
        dispatch.mock.calls.filter(([event]) => event.type === 'connection.changed'),
      ).toHaveLength(0);
    });

    it('forwards disconnect', async () => {
      const connection = client.wsConnection.connection;
      if (!connection) throw new Error('socket missing');
      const disconnect = vi.spyOn(connection, 'disconnect').mockResolvedValue(undefined);

      await client.wsConnection.disconnect(0);

      expect(disconnect).toHaveBeenCalledWith(0);
    });

    it('forwards onlineStatusChanged, which React Native still calls directly', () => {
      // Deprecated, and must keep working for one major: `stream-chat-react-native` calls
      // `client.wsConnection.onlineStatusChanged({ type: … })` with a synthesized DOM event.
      const connection = client.wsConnection.connection;
      if (!connection) throw new Error('socket missing');
      connection._setOnline(true);

      client.wsConnection.onlineStatusChanged({ type: 'offline' } as Event);

      expect(client.wsConnection.isOnline).toBe(false);
    });
  });

  describe('_setStatus', () => {
    it('stamps only the matching timestamp and carries the connection id up', () => {
      client.wsConnection._setStatus({ isOnline: true, connectionId: 'conn-1' });

      const state = client.wsConnection.state.getLatestValue();
      expect(state.isOnline).toBe(true);
      expect(state.connectionId).toBe('conn-1');
      expect(state.lastOnlineAt).toBeInstanceOf(Date);
      expect(state.lastOfflineAt).toBeNull();
    });

    it('leaves the connection id alone when going down', () => {
      // It is never cleared anywhere in the SDK, so blanking it here would misrepresent the field
      // rather than reflect it.
      client.wsConnection._setStatus({ isOnline: true, connectionId: 'conn-2' });
      client.wsConnection._setStatus({ isOnline: false });

      expect(client.wsConnection.state.getLatestValue().connectionId).toBe('conn-2');
    });

    it('returns false and publishes nothing for an unchanged status', () => {
      client.wsConnection._setStatus({ isOnline: true, connectionId: 'conn-3' });
      const first = client.wsConnection.state.getLatestValue().lastOnlineAt;

      expect(client.wsConnection._setStatus({ isOnline: true })).toBe(false);
      expect(client.wsConnection.state.getLatestValue().lastOnlineAt).toBe(first);
    });
  });

  describe('the options.wsConnection injection path', () => {
    it('assigns into the wrapper rather than replacing it', async () => {
      // A socket can be built before its client exists and handed one later via `setClient`,
      // which is why this path must keep working.
      const injected = new StableWSConnection({} as never);
      injected.isConnecting = false;
      injected.connect = vi.fn().mockResolvedValue({ connection_id: 'x' }) as never;

      const withInjected = new StreamChat('api-key-2', {
        allowServerSideConnect: true,
      });
      withInjected.wsConnection.updateConfig({ connection: injected });
      const wrapper = withInjected.wsConnection;
      withInjected._setUser({ id: 'u' });

      await withInjected.openConnection();

      expect(withInjected.wsConnection).toBe(wrapper);
      expect(withInjected.wsConnection.connection).toBe(injected);
    });
  });
});
