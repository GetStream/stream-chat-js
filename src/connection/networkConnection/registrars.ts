import type { NetworkStatusListenerRegistrar } from './types';

/**
 * The built-in registrar for browsers: `navigator.onLine` plus one `online`/`offline` listener pair.
 * Installed automatically where {@link getDefaultNetworkStatusListenerRegistrar} can pick it.
 */
export const browserNetworkStatusListenerRegistrar: NetworkStatusListenerRegistrar = (
  onStatusChange,
) => {
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
 * The registrar to install when the integrator supplied none.
 *
 * Returns {@link browserNetworkStatusListenerRegistrar} in a browser, and **`undefined` everywhere
 * else** — deliberately, rather than falling back to something that always reports "online". The
 * `isOnline()` helper in `utils.ts` did exactly that until Task 5 deleted it: it returned `true` when
 * it could not tell, including on React Native where `navigator.onLine` is not a boolean. A fabricated
 * value is worse than an absent one, because nothing downstream can distinguish it from a real
 * reading. With no registrar, `isOnline` stays `undefined` and consumers can see that they have not
 * been told.
 */
export const getDefaultNetworkStatusListenerRegistrar = ():
  | NetworkStatusListenerRegistrar
  | undefined => {
  const hasWindowListeners =
    typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  const reportsOnLine =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean';

  return hasWindowListeners && reportsOnLine
    ? browserNetworkStatusListenerRegistrar
    : undefined;
};
