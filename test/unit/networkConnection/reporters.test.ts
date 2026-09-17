import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserNetworkStatusReporter,
  createWSConnectionNetworkStatusReporter,
  getDefaultNetworkStatusReporter,
} from '../../../src/connection';
import { StateStore } from '../../../src/store';
import type { WSConnection, WSConnectionState } from '../../../src/connection';

type Listener = () => void;

/**
 * Installs a fake `window` and `navigator` for the duration of a test. The suite runs in vitest's
 * default `node` environment, where `window` does not exist and `navigator.onLine` is `undefined` —
 * which is conveniently the same shape React Native presents.
 */
const stubBrowser = (onLine: boolean) => {
  const listeners: Record<string, Listener[]> = {};

  vi.stubGlobal('window', {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      (listeners[type] ??= []).push(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    }),
  });

  const nav = { onLine };
  vi.stubGlobal('navigator', nav);

  return {
    listeners,
    /** Flip `navigator.onLine` and fire the matching DOM event, as a browser would. */
    goOnline: () => {
      nav.onLine = true;
      listeners.online?.forEach((l) => l());
    },
    goOffline: () => {
      nav.onLine = false;
      listeners.offline?.forEach((l) => l());
    },
    count: (type: string) => (listeners[type] ?? []).length,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserNetworkStatusReporter', () => {
  it.each([true, false])(
    'emits the current navigator.onLine (%s) on registration',
    (onLine) => {
      stubBrowser(onLine);
      const onStatusChange = vi.fn();

      browserNetworkStatusReporter(onStatusChange);

      // The contract requires the initial value, not just subsequent changes: a consumer that
      // registers while already offline must be told so.
      expect(onStatusChange).toHaveBeenCalledExactlyOnceWith(onLine);
    },
  );

  it('adds exactly one online/offline pair', () => {
    const browser = stubBrowser(true);

    browserNetworkStatusReporter(vi.fn());

    expect(browser.count('online')).toBe(1);
    expect(browser.count('offline')).toBe(1);
    expect(Object.keys(browser.listeners).sort()).toEqual(['offline', 'online']);
  });

  it('reports each transition with the then-current value', () => {
    const browser = stubBrowser(true);
    const onStatusChange = vi.fn();

    browserNetworkStatusReporter(onStatusChange);
    onStatusChange.mockClear();

    browser.goOffline();
    browser.goOnline();

    expect(onStatusChange.mock.calls).toEqual([[false], [true]]);
  });

  it('removes exactly the pair it added, and stops reporting', () => {
    const browser = stubBrowser(true);
    const onStatusChange = vi.fn();

    const unsubscribe = browserNetworkStatusReporter(onStatusChange);
    unsubscribe();

    expect(browser.count('online')).toBe(0);
    expect(browser.count('offline')).toBe(0);

    onStatusChange.mockClear();
    browser.goOffline();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('leaves a second registration untouched when the first unsubscribes', () => {
    const browser = stubBrowser(true);
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = browserNetworkStatusReporter(first);
    browserNetworkStatusReporter(second);
    unsubscribeFirst();

    expect(browser.count('online')).toBe(1);
    expect(browser.count('offline')).toBe(1);

    second.mockClear();
    browser.goOffline();
    expect(second).toHaveBeenCalledWith(false);
  });
});

describe('browserNetworkStatusReporter off-browser', () => {
  // It is exported, so it reaches hosts its name does not describe — a Node process, or a
  // server-side render of code written for the browser. It used to throw there on the first
  // dereference of `window`, where a reporter is meant to fail quietly.
  it('reports nothing instead of throwing when there is no window', () => {
    const onStatusChange = vi.fn();

    const unsubscribe = browserNetworkStatusReporter(onStatusChange);

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('reports nothing when the host has no boolean onLine (React Native)', () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('navigator', { onLine: undefined });
    const onStatusChange = vi.fn();

    // Half a browser is not a browser: reporting a status off one of the two halves would mean
    // inventing the value this module exists not to invent.
    browserNetworkStatusReporter(onStatusChange);

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(window.addEventListener).not.toHaveBeenCalled();
  });
});

describe('getDefaultNetworkStatusReporter', () => {
  /** A WebSocket store that a test drives directly, standing in for the real connection. */
  const fakeWSConnection = () => {
    const state = new StateStore<WSConnectionState>({
      isHealthy: false,
      lastHealthyAt: null,
      lastUnhealthyAt: null,
    });
    return {
      wsConnection: { state } as unknown as WSConnection,
      up: () => state.partialNext({ isHealthy: true, lastHealthyAt: new Date() }),
      down: () => state.partialNext({ isHealthy: false, lastUnhealthyAt: new Date() }),
    };
  };

  it('picks the browser reporter when window listeners and a boolean onLine are both present', () => {
    stubBrowser(true);
    expect(getDefaultNetworkStatusReporter(fakeWSConnection().wsConnection)).toBe(
      browserNetworkStatusReporter,
    );
  });

  it.each([
    [
      'navigator.onLine is not a boolean (React Native)',
      () => {
        vi.stubGlobal('window', {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        });
        vi.stubGlobal('navigator', { userAgent: 'ReactNative' });
      },
    ],
    [
      'window is absent (Node, SSR)',
      () => {
        vi.stubGlobal('window', undefined);
        vi.stubGlobal('navigator', { onLine: true });
      },
    ],
    [
      'navigator is absent entirely',
      () => {
        vi.stubGlobal('window', {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        });
        vi.stubGlobal('navigator', undefined);
      },
    ],
  ])('falls back to the socket-derived reporter when %s', (_label, stub) => {
    // It used to return `undefined` here, which left an integration with a missing line of setup
    // with no network signal at all and nothing to notice it by. The stand-in is coarse rather than
    // absent.
    stub();
    const fake = fakeWSConnection();

    const reporter = getDefaultNetworkStatusReporter(fake.wsConnection);

    expect(reporter).not.toBe(browserNetworkStatusReporter);
    expect(typeof reporter).toBe('function');
  });
});

describe('createWSConnectionNetworkStatusReporter', () => {
  const fakeWSConnection = () => {
    const state = new StateStore<WSConnectionState>({
      isHealthy: false,
      lastHealthyAt: null,
      lastUnhealthyAt: null,
    });
    return {
      wsConnection: { state } as unknown as WSConnection,
      up: () => state.partialNext({ isHealthy: true, lastHealthyAt: new Date() }),
      down: () => state.partialNext({ isHealthy: false, lastUnhealthyAt: new Date() }),
    };
  };

  it('reports nothing before the socket has ever been up', () => {
    // `isHealthy` is `false` from construction. Forwarding that would claim the device is offline
    // before anything had been attempted, which is the fabricated reading this module refuses to
    // produce — so the status stays unknown instead.
    const fake = fakeWSConnection();
    const onStatusChange = vi.fn();

    createWSConnectionNetworkStatusReporter(fake.wsConnection)(onStatusChange);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('mirrors the socket once it has been up', () => {
    const fake = fakeWSConnection();
    const onStatusChange = vi.fn();
    createWSConnectionNetworkStatusReporter(fake.wsConnection)(onStatusChange);

    fake.up();
    expect(onStatusChange).toHaveBeenLastCalledWith(true);

    fake.down();
    expect(onStatusChange).toHaveBeenLastCalledWith(false);
  });

  it('stops reporting once unsubscribed', () => {
    const fake = fakeWSConnection();
    const onStatusChange = vi.fn();
    const unsubscribe = createWSConnectionNetworkStatusReporter(fake.wsConnection)(
      onStatusChange,
    );
    fake.up();
    onStatusChange.mockClear();

    unsubscribe();
    fake.down();

    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
