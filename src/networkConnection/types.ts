import type { Unsubscribe } from '../store';

/**
 * Registers a platform-specific network status listener.
 *
 * The SDK cannot detect the device's network status itself — the browser has
 * `window.addEventListener('online' | 'offline')` plus `navigator.onLine`, React Native has
 * `@react-native-community/netinfo`, and other hosts have something else or nothing at all. So it has
 * to be told, and this one function is the whole contract.
 *
 * The registrar **MUST** call `onStatusChange` with the current status as soon as it is known —
 * synchronously where the platform allows it (`navigator.onLine`), after an await where it does not
 * (`NetInfo.fetch()`) — and again on every subsequent change. Making initial emission the registrar's
 * job is what lets one function cover both shapes, and it matches this package's convention:
 * `StateStore.subscribe` also fires once with the current value before returning.
 *
 * A registrar that never emits leaves {@link NetworkConnectionState.isOnline} as `undefined`, which is
 * a safe state rather than a broken one — see that field.
 *
 * @returns A function that removes the listener.
 *
 * @example React Native
 * ```ts
 * const netInfoRegistrar: NetworkStatusListenerRegistrar = (onStatusChange) => {
 *   NetInfo.fetch().then((s) => onStatusChange(!!s.isConnected));
 *   return NetInfo.addEventListener((s) => onStatusChange(!!s.isConnected));
 * };
 *
 * client.networkConnection.setStatusListenerRegistrar(netInfoRegistrar);
 * ```
 */
export type NetworkStatusListenerRegistrar = (
  onStatusChange: (isOnline: boolean) => void,
) => Unsubscribe;

export type NetworkConnectionObserverConfig = {
  /**
   * The platform listener that feeds `client.networkConnection`. `undefined` on any host where
   * the SDK cannot pick a default, which is everywhere except the browser.
   */
  statusListenerRegistrar: NetworkStatusListenerRegistrar | undefined;
};

export type NetworkConnectionState = {
  /**
   * Device network status, as reported by the registered listener.
   *
   * `undefined` means **unknown**: no registrar is installed, or it has not reported yet. It does not
   * mean offline, and guards must therefore test `isOnline === false` rather than `!isOnline` —
   * treating unknown as offline silently disables behaviour on every host without a built-in
   * registrar, React Native among them.
   *
   * Never derived from the WebSocket. That is a separate fact with separate causes: a socket dies on
   * a working network (server close, expired token, health-check timeout), and a device goes offline
   * while the socket has not noticed yet.
   */
  isOnline: boolean | undefined;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
};
