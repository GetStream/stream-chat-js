import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src';
import { StableWSConnection } from '../../../src/connection';
import type { NetworkStatusReporter } from '../../../src/connection';

/** A reporter whose callback the test drives, standing in for any platform listener. */
const fakeReporter = () => {
  const unsubscribe = vi.fn();
  let emit: ((isOnline: boolean) => void) | undefined;
  const reporter: NetworkStatusReporter = (onStatusChange) => {
    emit = onStatusChange;
    return unsubscribe;
  };
  return {
    reporter,
    unsubscribe,
    emit: (isOnline: boolean) => {
      if (!emit) throw new Error('reporter was never installed');
      emit(isOnline);
    },
  };
};

describe('client wiring — network + ws status', () => {
  describe('the network half', () => {
    let client: StreamChat;

    beforeEach(() => {
      client = new StreamChat('api-key');
    });

    it('exists and is reactive with no user connected and no socket opened', () => {
      // Nothing here calls connectUser or openConnection: device network status is independent of
      // the socket, which is the whole point of the observer.
      expect(client.networkConnection.isOnline).toBeUndefined();

      const onChange = vi.fn();
      client.networkConnection.state.subscribe(onChange);
      onChange.mockClear();

      client.networkConnection.setStatus(true);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(client.networkConnection.isOnline).toBe(true);
    });

    it('installs no reporter in a non-browser host, leaving status unknown', () => {
      // Node has no `window` and `navigator.onLine` is not a boolean — the same shape React Native
      // presents. `undefined` is the honest answer, and must not be a fabricated `true`.
      expect(client.networkConnection.config.statusReporter).toBeUndefined();
      expect(client.networkConnection.isOnline).toBeUndefined();
    });

    it('installs a reporter supplied through options.config, and no default alongside it', () => {
      const source = fakeReporter();
      const configured = new StreamChat('api-key-2', {
        config: {
          client: { networkConnection: { statusReporter: source.reporter } },
        },
      });

      expect(configured.networkConnection.config.statusReporter).toBe(source.reporter);

      source.emit(false);
      expect(configured.networkConnection.isOnline).toBe(false);
    });

    it('lets setStatusReporter replace a config-supplied one cleanly', () => {
      const first = fakeReporter();
      const configured = new StreamChat('api-key-3', {
        config: {
          client: { networkConnection: { statusReporter: first.reporter } },
        },
      });

      const second = fakeReporter();
      configured.networkConnection.setStatusReporter(second.reporter);

      expect(first.unsubscribe).toHaveBeenCalledTimes(1);
      second.emit(true);
      expect(configured.networkConnection.isOnline).toBe(true);
    });

    it('reaches subscribers through the store, not the event bus', () => {
      const source = fakeReporter();
      client.networkConnection.setStatusReporter(source.reporter);

      const handler = vi.fn();
      client.networkConnection.state.subscribeWithSelector(
        ({ isOnline }) => ({ isOnline }),
        handler,
      );
      handler.mockClear();

      source.emit(false);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ isOnline: false }),
        expect.anything(),
      );
    });
  });

  describe('with no reporter supplied', () => {
    // The case an integration lands in by forgetting a line of setup, which used to leave the device
    // status unknown forever and every consumer branching on it dead. A stand-in mirrors the socket
    // instead. These assert that the stand-in is coarse without being wrong, and that it cannot feed
    // back into the socket it is derived from.
    let client: StreamChat;

    beforeEach(() => {
      client = new StreamChat('api-key');
      client.wsConnection.connection = new StableWSConnection({ client });
    });

    it('reports nothing before the socket has ever been up', () => {
      expect(client.networkConnection.isOnline).toBeUndefined();
      expect(client.networkConnection.state.getLatestValue().lastOnlineAt).toBeNull();
      expect(client.networkConnection.state.getLatestValue().lastOfflineAt).toBeNull();
    });

    it('follows the socket once it has been up', () => {
      client.wsConnection._setStatus({ isOnline: true, connectionId: 'conn' });
      expect(client.networkConnection.isOnline).toBe(true);

      client.wsConnection._setStatus({ isOnline: false });
      expect(client.networkConnection.isOnline).toBe(false);
    });

    it('does not tear the socket down by feeding its own status back to it', () => {
      // The socket reads the network store and the stand-in reads the socket's, so the two are wired
      // in a circle. It terminates because the derived value can never lead: applying a status the
      // socket already holds changes nothing.
      const socket = client.wsConnection.connection as StableWSConnection;
      const reconnect = vi.spyOn(socket, '_reconnect').mockResolvedValue(undefined);
      socket._setOnline(true);

      socket._setOnline(false);

      expect(client.networkConnection.isOnline).toBe(false);
      expect(client.wsConnection.isOnline).toBe(false);
      expect(reconnect).not.toHaveBeenCalled();
    });

    it('is replaced by a real reporter, which then wins', () => {
      client.wsConnection._setStatus({ isOnline: true, connectionId: 'conn' });
      expect(client.networkConnection.isOnline).toBe(true);

      const source = fakeReporter();
      client.networkConnection.setStatusReporter(source.reporter);
      source.emit(false);

      // The device says no network while the socket is still up, which is exactly the disagreement
      // the stand-in cannot express.
      expect(client.networkConnection.isOnline).toBe(false);
      expect(client.wsConnection.isOnline).toBe(true);
    });
  });

  describe('client.wsConnection', () => {
    it('starts down, with no connection id', () => {
      const client = new StreamChat('api-key');

      expect(client.wsConnection.state.getLatestValue()).toEqual({
        isOnline: undefined,
        lastOnlineAt: null,
        lastOfflineAt: null,
        isOnline: false,
        connectionId: undefined,
        lastOnlineAt: null,
        lastOfflineAt: null,
      });
    });

    it('survives the socket being replaced, so subscribers are not stranded', () => {
      // The regression test for putting this store on the client rather than on `wsConnection`:
      // `connect()` builds a brand-new StableWSConnection every call, so a store hanging off the
      // instance would be swapped out from under anyone who subscribed before the first reconnect.
      const client = new StreamChat('api-key');
      const store = client.wsConnection.state;

      const onChange = vi.fn();
      store.subscribe(onChange);
      onChange.mockClear();

      client.wsConnection.connection = new StableWSConnection({ client });
      client.wsConnection.connection = new StableWSConnection({ client });

      expect(client.wsConnection.state).toBe(store);

      store.partialNext({ isOnline: true });
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('what is deliberately absent', () => {
    it('exposes no composite connectivity getter', () => {
      const client = new StreamChat('api-key') as unknown as Record<string, unknown>;

      // Combining the two facts is a product decision, not an SDK one: whether "network down and
      // socket down" reads as *no network* or *reconnecting* is copy taxonomy, and a boolean named
      // for reachability invites gating requests on it, which network status must never do.
      expect(client.canReachStream).toBeUndefined();
      expect(client.isConnected).toBeUndefined();
    });
  });
});
