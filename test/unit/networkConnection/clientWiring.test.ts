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
