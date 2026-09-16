import type { NetworkStatusReporter } from './types';

/** Whether this host can both report a network status and tell us when it changes. */
const hasBrowserNetworkStatus = () =>
  typeof window !== 'undefined' &&
  typeof window.addEventListener === 'function' &&
  typeof navigator !== 'undefined' &&
  typeof navigator.onLine === 'boolean';

/**
 * The built-in reporter for browsers: `navigator.onLine` plus one `online`/`offline` listener pair.
 * Installed automatically where {@link getDefaultNetworkStatusReporter} can pick it.
 *
 * Feature-detects rather than trusting its own name. It is exported, so it can be handed to
 * `client.config.set` on any host — a Node process, a server-side render of code written for the
 * browser — and dereferencing `window` there threw, where a reporter is meant to fail quietly.
 */
export const browserNetworkStatusReporter: NetworkStatusReporter = (onStatusChange) => {
  // Both halves, because reporting a status off one without the other would mean inventing the
  // value this module exists not to invent. Nothing installed means `isOnline` stays `undefined`,
  // the same honest answer every non-browser host already gets.
  if (!hasBrowserNetworkStatus()) return () => undefined;

  const handle = () => onStatusChange(navigator.onLine);

  // Emit the current value before returning, as the contract requires.
  handle();

  window.addEventListener('online', handle);
  window.addEventListener('offline', handle);

  return () => {
    window.removeEventListener('online', handle);
    window.removeEventListener('offline', handle);
  };
};

/**
 * The reporter to install when the integrator supplied none.
 *
 * Returns {@link browserNetworkStatusReporter} in a browser, and **`undefined` everywhere
 * else** — deliberately, rather than falling back to something that always reports "online". The
 * `isOnline()` helper in `utils.ts` did exactly that until Task 5 deleted it: it returned `true` when
 * it could not tell, including on React Native where `navigator.onLine` is not a boolean. A fabricated
 * value is worse than an absent one, because nothing downstream can distinguish it from a real
 * reading. With no reporter, `isOnline` stays `undefined` and consumers can see that they have not
 * been told.
 */
export const getDefaultNetworkStatusReporter = (): NetworkStatusReporter | undefined =>
  hasBrowserNetworkStatus() ? browserNetworkStatusReporter : undefined;
