import type { NetworkStatusReporter } from './types';
import type { WSConnection } from '../wsConnection/WSConnection';

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
 * The stand-in reporter for hosts that cannot report their own network status.
 *
 * It mirrors this client's WebSocket, which is **not** a measurement of the device's network: the two
 * are different facts and routinely disagree. It exists because the alternative is worse. React
 * Native has no built-in way to answer the question, so an integrator who forgets to install
 * `@react-native-community/netinfo` would otherwise leave `isOnline` unknown forever, and every
 * consumer branching on it dead. Mirroring the socket is wrong in the cases where the two disagree,
 * and right in the common case where the device really did lose its network and took the socket with
 * it.
 *
 * Nothing is reported until the socket has been up once. `isOnline` on the WebSocket store is `false`
 * from construction, and forwarding that would claim the device is offline before anything had been
 * attempted — a fabricated reading, which is the one thing this module refuses to produce. Until
 * then the device's status stays `undefined`, meaning unknown.
 *
 * Install a real reporter wherever one exists. This one can only ever repeat what the socket already
 * said, so it cannot tell you that the network came back before the socket noticed, which is the
 * whole reason the network signal is worth having.
 */
export const createWSConnectionNetworkStatusReporter =
  (wsConnection: WSConnection): NetworkStatusReporter =>
  (onStatusChange) =>
    wsConnection.state.subscribeWithSelector(
      ({ isOnline, lastOnlineAt }) => ({ isOnline, lastOnlineAt }),
      ({ isOnline, lastOnlineAt }) => {
        if (!lastOnlineAt) return;
        onStatusChange(isOnline);
      },
    );

/**
 * The reporter to install when the integrator supplied none.
 *
 * {@link browserNetworkStatusReporter} in a browser, where the platform answers the question
 * properly, and {@link createWSConnectionNetworkStatusReporter} everywhere else.
 *
 * Always returns something, so an integration missing a line of setup gets a coarse signal rather
 * than none at all, which would fail silently. Nothing is fabricated: the stand-in reports nothing
 * until the socket has been up once, so a client that has never connected still answers `undefined`.
 */
export const getDefaultNetworkStatusReporter = (
  wsConnection: WSConnection,
): NetworkStatusReporter =>
  hasBrowserNetworkStatus()
    ? browserNetworkStatusReporter
    : createWSConnectionNetworkStatusReporter(wsConnection);
