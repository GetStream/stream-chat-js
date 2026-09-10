import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkConnectionObserver } from '../../../src/connection';
import type {
  NetworkConnectionState,
  NetworkStatusListenerRegistrar,
} from '../../../src/connection';
import type { StreamChat } from '../../../src/client';

/**
 * A stand-in for the client, carrying only what the observer touches. Nothing in this suite
 * constructs a `StreamChat` or opens a WebSocket — deliberately: the observer's whole point is that
 * device network status is independent of the socket, and a test that needed a client would mean
 * that independence had been lost.
 */
const fakeClient = () => {
  const dispatchEvent = vi.fn();
  return {
    client: { dispatchEvent } as unknown as StreamChat,
    dispatchEvent,
  };
};

/** A registrar whose callback the test drives directly, standing in for any platform listener. */
const fakeRegistrar = () => {
  const unsubscribe = vi.fn();
  let emit: ((isOnline: boolean) => void) | undefined;

  const registrar: NetworkStatusListenerRegistrar = (onStatusChange) => {
    emit = onStatusChange;
    return unsubscribe;
  };

  return {
    registrar,
    unsubscribe,
    emit: (isOnline: boolean) => {
      if (!emit) throw new Error('registrar was never installed');
      emit(isOnline);
    },
  };
};

describe('NetworkConnectionObserver', () => {
  let observer: NetworkConnectionObserver;
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const fake = fakeClient();
    dispatchEvent = fake.dispatchEvent;
    observer = new NetworkConnectionObserver({ client: fake.client });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial state', () => {
    it('starts unknown rather than assuming online', () => {
      // `undefined` is the honest answer before any registrar reports, and it is what every host
      // without a built-in registrar keeps. Defaulting to `true` here would be indistinguishable
      // from a real reading.
      expect(observer.isOnline).toBeUndefined();
      expect(observer.state.getLatestValue()).toEqual({
        isOnline: undefined,
        lastOnlineAt: null,
        lastOfflineAt: null,
      });
    });

    it('dispatches nothing before it is told anything', () => {
      expect(dispatchEvent).not.toHaveBeenCalled();
    });
  });

  describe('tracking a registrar', () => {
    it('adopts the first reported status and stamps only the matching timestamp', () => {
      const source = fakeRegistrar();
      observer.setStatusListenerRegistrar(source.registrar);

      source.emit(true);

      const state = observer.state.getLatestValue();
      expect(state.isOnline).toBe(true);
      expect(state.lastOnlineAt).toBeInstanceOf(Date);
      expect(state.lastOfflineAt).toBeNull();
    });

    it('advances each timestamp independently across online → offline → online', () => {
      const source = fakeRegistrar();
      observer.setStatusListenerRegistrar(source.registrar);

      source.emit(true);
      const firstOnlineAt = observer.state.getLatestValue().lastOnlineAt;

      source.emit(false);
      const offlineAt = observer.state.getLatestValue().lastOfflineAt;
      expect(offlineAt).toBeInstanceOf(Date);
      // Going offline must not disturb the record of when we were last online.
      expect(observer.state.getLatestValue().lastOnlineAt).toBe(firstOnlineAt);

      source.emit(true);
      expect(observer.state.getLatestValue().lastOnlineAt).not.toBe(firstOnlineAt);
      expect(observer.state.getLatestValue().lastOfflineAt).toBe(offlineAt);
    });

    it('dispatches connection.changed for the network, never for the socket', () => {
      const source = fakeRegistrar();
      observer.setStatusListenerRegistrar(source.registrar);

      source.emit(true);
      source.emit(false);

      expect(dispatchEvent.mock.calls.flat()).toEqual([
        { type: 'connection.changed', connection: 'network', online: true },
        { type: 'connection.changed', connection: 'network', online: false },
      ]);
    });

    it('ignores a repeated identical status', () => {
      const source = fakeRegistrar();
      observer.setStatusListenerRegistrar(source.registrar);

      const onStateChange = vi.fn();
      // `StateStore.subscribe` fires once with the current value, so that first call is the baseline.
      observer.state.subscribe(onStateChange);
      expect(onStateChange).toHaveBeenCalledTimes(1);

      source.emit(true);
      expect(onStateChange).toHaveBeenCalledTimes(2);

      dispatchEvent.mockClear();
      source.emit(true);
      source.emit(true);

      // No store update and no event: a repeat is not an edge. Without the guard the timestamp
      // write alone would defeat `StateStore.next`'s equality check and publish anyway.
      expect(onStateChange).toHaveBeenCalledTimes(2);
      expect(dispatchEvent).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    it('reports status without any registrar installed', () => {
      // The supported replacement for reaching into `client.wsConnection.onlineStatusChanged` with a
      // synthesized DOM event, and the escape hatch for hosts with no listener API to register.
      observer.setStatus(false);

      expect(observer.isOnline).toBe(false);
      expect(dispatchEvent).toHaveBeenCalledExactlyOnceWith({
        type: 'connection.changed',
        connection: 'network',
        online: false,
      });
    });
  });

  describe('swapping the registrar', () => {
    it('unsubscribes the previous one exactly once and adopts the new value immediately', () => {
      const first = fakeRegistrar();
      observer.setStatusListenerRegistrar(first.registrar);
      first.emit(false);

      observer.setStatusListenerRegistrar((onStatusChange) => {
        onStatusChange(true);
        return vi.fn();
      });

      expect(first.unsubscribe).toHaveBeenCalledTimes(1);
      expect(observer.isOnline).toBe(true);
    });

    it('leaves the last known status alone when cleared with null', () => {
      const source = fakeRegistrar();
      observer.setStatusListenerRegistrar(source.registrar);
      source.emit(true);

      observer.setStatusListenerRegistrar(null);

      // Clearing the listener is not "forget what we were told" — an edge is not a state, and
      // reverting to unknown would lose information rather than reset it.
      expect(source.unsubscribe).toHaveBeenCalledTimes(1);
      expect(observer.isOnline).toBe(true);
    });

    it('survives a registrar that throws, leaving status unknown', () => {
      observer.setStatusListenerRegistrar(() => {
        throw new Error('registrar exploded');
      });

      expect(observer.isOnline).toBeUndefined();
    });
  });

  describe('configuration', () => {
    it('installs the registrar named by the declarative config', () => {
      const source = fakeRegistrar();

      observer.initializeConfig({ statusListenerRegistrar: source.registrar });
      source.emit(true);

      expect(observer.config.statusListenerRegistrar).toBe(source.registrar);
      expect(observer.isOnline).toBe(true);
    });

    it('falls back to the platform default when none is configured', () => {
      // In this environment (`node`) there is no default to pick, so nothing is installed and the
      // status stays unknown — the same outcome as React Native.
      observer.initializeConfig();

      expect(observer.config.statusListenerRegistrar).toBeUndefined();
      expect(observer.isOnline).toBeUndefined();
    });

    it('replaces a previously installed registrar on re-initialization', () => {
      const first = fakeRegistrar();
      observer.initializeConfig({ statusListenerRegistrar: first.registrar });

      const second = fakeRegistrar();
      observer.initializeConfig({ statusListenerRegistrar: second.registrar });

      expect(first.unsubscribe).toHaveBeenCalledTimes(1);
      second.emit(false);
      expect(observer.isOnline).toBe(false);
    });

    it('exposes config as a store, so a consumer can react to a swap', () => {
      const onConfigChange = vi.fn();
      observer.configState.subscribe(onConfigChange);
      onConfigChange.mockClear();

      const source = fakeRegistrar();
      observer.updateConfig({ statusListenerRegistrar: source.registrar });

      expect(onConfigChange).toHaveBeenCalled();
      expect(observer.config.statusListenerRegistrar).toBe(source.registrar);
    });
  });

  describe('subscription lifecycle', () => {
    it('releases the platform listener on the last unregister, not the first', () => {
      const source = fakeRegistrar();
      observer.setStatusListenerRegistrar(source.registrar);

      const unregisterA = observer.registerSubscriptions();
      const unregisterB = observer.registerSubscriptions();

      unregisterA();
      expect(source.unsubscribe).not.toHaveBeenCalled();

      unregisterB();
      expect(source.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — registering twice does not stack teardown', () => {
      observer.registerSubscriptions();
      observer.registerSubscriptions();

      expect(observer.hasSubscriptions).toBe(true);
    });

    it('keeps the last known status after teardown', () => {
      const source = fakeRegistrar();
      observer.setStatusListenerRegistrar(source.registrar);
      source.emit(true);

      observer.registerSubscriptions()();

      const state: NetworkConnectionState = observer.state.getLatestValue();
      expect(state.isOnline).toBe(true);
    });
  });
});

describe('NetworkConnectionObserver — idempotent installation', () => {
  it('re-installing the same registrar is a no-op', () => {
    // Configuration is re-derived more than once at construction (the client calls
    // `initializeConfig` directly, and again through the config store's immediate subscribe), so a
    // naive implementation tore the platform listener down and recreated it identical.
    const { client } = { client: { dispatchEvent: vi.fn() } as never };
    const observer = new NetworkConnectionObserver({ client });

    const unsubscribe = vi.fn();
    const registrar: NetworkStatusListenerRegistrar = () => unsubscribe;

    observer.setStatusListenerRegistrar(registrar);
    observer.setStatusListenerRegistrar(registrar);
    observer.setStatusListenerRegistrar(registrar);

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('still swaps when handed a different registrar', () => {
    const { client } = { client: { dispatchEvent: vi.fn() } as never };
    const observer = new NetworkConnectionObserver({ client });

    const firstUnsubscribe = vi.fn();
    observer.setStatusListenerRegistrar(() => firstUnsubscribe);
    observer.setStatusListenerRegistrar(() => vi.fn());

    expect(firstUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
