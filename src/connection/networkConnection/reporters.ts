import type { NetworkStatusReporter } from './types';
import type { WSConnection } from '../wsConnection/WSConnection';

/** Whether this host can both report a network status and tell us when it changes. */
const hasBrowserNetworkStatus = () =>
  typeof window !== 'undefined' &&
  typeof window.addEventListener === 'function' &&
  typeof navigator !== 'undefined' &&
  typeof navigator.onLine === 'boolean';

/**
 * Reports `navigator.onLine` and `online`/`offline` events. Installed automatically in browsers.
 * It reports nothing (so `isOnline` stays `undefined`) on a host without those APIs, where it can
 * still be passed in the config.
 */
export const browserNetworkStatusReporter: NetworkStatusReporter = (onStatusChange) => {
  if (!hasBrowserNetworkStatus()) return () => undefined;

  const handle = () => onStatusChange(navigator.onLine);

  handle();

  window.addEventListener('online', handle);
  window.addEventListener('offline', handle);

  return () => {
    window.removeEventListener('online', handle);
    window.removeEventListener('offline', handle);
  };
};

/**
 * Stand-in for hosts that cannot report their own network status: mirrors this client's WebSocket,
 * which is not a measurement of the device's network (a socket can die on a working network). It
 * reports nothing until the socket has been up once, so a client that never connected stays unknown.
 * Install a real reporter where one exists.
 */
export const createWSConnectionNetworkStatusReporter =
  (wsConnection: WSConnection): NetworkStatusReporter =>
  (onStatusChange) =>
    wsConnection.state.subscribeWithSelector(
      ({ isHealthy, lastHealthyAt }) => ({ isHealthy, lastHealthyAt }),
      ({ isHealthy, lastHealthyAt }) => {
        if (!lastHealthyAt) return;
        onStatusChange(isHealthy);
      },
    );

/**
 * The reporter installed when none is configured: {@link browserNetworkStatusReporter} in a browser,
 * {@link createWSConnectionNetworkStatusReporter} elsewhere.
 */
export const getDefaultNetworkStatusReporter = (
  wsConnection: WSConnection,
): NetworkStatusReporter =>
  hasBrowserNetworkStatus()
    ? browserNetworkStatusReporter
    : createWSConnectionNetworkStatusReporter(wsConnection);
