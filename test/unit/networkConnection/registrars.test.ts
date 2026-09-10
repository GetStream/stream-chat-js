import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserNetworkStatusListenerRegistrar,
  getDefaultNetworkStatusListenerRegistrar,
} from '../../../src/connection';

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

describe('browserNetworkStatusListenerRegistrar', () => {
  it.each([true, false])(
    'emits the current navigator.onLine (%s) on registration',
    (onLine) => {
      stubBrowser(onLine);
      const onStatusChange = vi.fn();

      browserNetworkStatusListenerRegistrar(onStatusChange);

      // The contract requires the initial value, not just subsequent changes: a consumer that
      // registers while already offline must be told so.
      expect(onStatusChange).toHaveBeenCalledExactlyOnceWith(onLine);
    },
  );

  it('adds exactly one online/offline pair', () => {
    const browser = stubBrowser(true);

    browserNetworkStatusListenerRegistrar(vi.fn());

    expect(browser.count('online')).toBe(1);
    expect(browser.count('offline')).toBe(1);
    expect(Object.keys(browser.listeners).sort()).toEqual(['offline', 'online']);
  });

  it('reports each transition with the then-current value', () => {
    const browser = stubBrowser(true);
    const onStatusChange = vi.fn();

    browserNetworkStatusListenerRegistrar(onStatusChange);
    onStatusChange.mockClear();

    browser.goOffline();
    browser.goOnline();

    expect(onStatusChange.mock.calls).toEqual([[false], [true]]);
  });

  it('removes exactly the pair it added, and stops reporting', () => {
    const browser = stubBrowser(true);
    const onStatusChange = vi.fn();

    const unsubscribe = browserNetworkStatusListenerRegistrar(onStatusChange);
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

    const unsubscribeFirst = browserNetworkStatusListenerRegistrar(first);
    browserNetworkStatusListenerRegistrar(second);
    unsubscribeFirst();

    expect(browser.count('online')).toBe(1);
    expect(browser.count('offline')).toBe(1);

    second.mockClear();
    browser.goOffline();
    expect(second).toHaveBeenCalledWith(false);
  });
});

describe('getDefaultNetworkStatusListenerRegistrar', () => {
  it('picks the browser registrar when window listeners and a boolean onLine are both present', () => {
    stubBrowser(true);
    expect(getDefaultNetworkStatusListenerRegistrar()).toBe(
      browserNetworkStatusListenerRegistrar,
    );
  });

  it('returns undefined when navigator.onLine is not a boolean (React Native)', () => {
    // RN's navigator has no `onLine`. The answer must be `undefined` — "we have not been told" —
    // and NOT a fabricated `true`, which is the mistake the old `isOnline()` helper in `utils.ts`
    // made, and which nothing downstream could distinguish from a real reading.
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('navigator', { userAgent: 'ReactNative' });

    expect(getDefaultNetworkStatusListenerRegistrar()).toBeUndefined();
  });

  it('returns undefined when window is absent (Node, SSR)', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', { onLine: true });

    expect(getDefaultNetworkStatusListenerRegistrar()).toBeUndefined();
  });

  it('returns undefined when navigator is absent entirely', () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('navigator', undefined);

    expect(getDefaultNetworkStatusListenerRegistrar()).toBeUndefined();
  });
});
