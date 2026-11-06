import type { Unsubscribe } from '@stream-io/state-store';

/**
 * Registers a platform network status listener and returns a function that removes it. The SDK
 * cannot detect the device's network status itself, so the host reports it (browser
 * `online`/`offline` events, `@react-native-community/netinfo`, ...).
 *
 * The reporter **MUST** call `onStatusChange` with the current status as soon as it is known
 * (synchronously or after an await) and again on every change. One that never emits leaves
 * {@link NetworkConnectionState.isOnline} `undefined`.
 *
 * @example React Native
 * ```ts
 * const netInfoReporter: NetworkStatusReporter = (onStatusChange) => {
 *   NetInfo.fetch().then((s) => onStatusChange(!!s.isConnected));
 *   return NetInfo.addEventListener((s) => onStatusChange(!!s.isConnected));
 * };
 *
 * client.networkConnection.setStatusReporter(netInfoReporter);
 * ```
 */
export type NetworkStatusReporter = (
  onStatusChange: (isOnline: boolean) => void,
) => Unsubscribe;

export type NetworkConnectionObserverConfig = {
  /**
   * The platform listener that feeds `client.networkConnection`. When `undefined`, browsers use the
   * built-in browser reporter and other hosts a reporter that mirrors the WebSocket.
   */
  statusReporter: NetworkStatusReporter | undefined;
};

export type NetworkConnectionState = {
  /**
   * Device network status, as reported by the installed reporter. `undefined` means unknown (no
   * reporter, or none has reported yet), not offline: test `isOnline === false`, never `!isOnline`.
   *
   * Outside the browser the default reporter mirrors the WebSocket, so `false` then means the socket
   * is down.
   */
  isOnline: boolean | undefined;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
};
