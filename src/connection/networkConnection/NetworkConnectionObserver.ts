import { WithSubscriptions } from '../../utils/WithSubscriptions';
import { StateStore } from '../../store';
import { ConfigController } from '../../configuration/ConfigController';
import { deepFreezeConfig } from '../../configuration/utils/deepFreezeConfig';
import { chatLoggerSystem } from '../../logger';
import { getDefaultNetworkStatusListenerRegistrar } from './registrars';
import type {
  NetworkConnectionObserverConfig,
  NetworkConnectionState,
  NetworkStatusListenerRegistrar,
} from './types';
import type { StreamChat } from '../../client';
import type { Unsubscribe } from '../../store';

const logger = chatLoggerSystem.getLogger('client');

export const DEFAULT_NETWORK_CONNECTION_OBSERVER_CONFIG: NetworkConnectionObserverConfig =
  deepFreezeConfig({ statusListenerRegistrar: undefined });

/**
 * The status of every connection this client depends on, as reactive state — one store per
 * `ConnectionType` — this one owns the network half.
 *
 * They are two facts, not one, and they disagree in both directions. A socket dies on a working
 * network (server close, expired token, health-check timeout); a device goes offline while the socket
 * has not noticed yet and keeps looking healthy for up to its 35s connection-check window. Conflating them is
 * what makes offline UI blame the network for a dead socket, so nothing here derives one from the
 * other:
 *
 * - the `network*` fields are written **only** via {@link setStatus}, from the platform
 *   listener the integrator registers ({@link NetworkStatusListenerRegistrar}). The SDK cannot detect
 *   device network status itself — every platform reports it differently — so it has to be told. In a
 *   browser a listener is installed automatically; anywhere else, register one or `isOnline`
 *   stays `undefined`, meaning *unknown* rather than offline.
 * Combining the two is a presentation decision and deliberately absent: whether "network down and
 * socket down" reads as *no network* or as *reconnecting* is copy taxonomy, and a boolean named for
 * reachability invites gating requests on it, which network status must never do. Read both and branch.
 *
 * Each store answers *what is the status now*; `connection.changed` — carrying the same
 * `ConnectionType` — says *it just changed*. For the network, both are written from the same setter,
 * so they cannot drift.
 */
export class NetworkConnectionObserver extends WithSubscriptions {
  client: StreamChat;
  state: StateStore<NetworkConnectionState>;
  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<NetworkConnectionObserverConfig>;
  /**
   * Held separately from `addUnsubscribeFunction` because it has to be **replaced**, not just torn
   * down: that set only clears on unregister, so it cannot express a swap.
   */
  private unsubscribeStatusListener?: Unsubscribe;
  /**
   * The registrar currently installed, so re-installing the same one is a no-op. Configuration is
   * re-derived more than once — the client calls `initializeConfig` directly and again through the
   * config store's immediate subscribe — and tearing a platform listener down only to recreate it
   * identical is wasteful at best and, for something like `NetInfo`, a needless native round trip.
   */
  private installedRegistrar?: NetworkStatusListenerRegistrar;

  constructor({ client }: { client: StreamChat }) {
    super();
    this.configController = new ConfigController<NetworkConnectionObserverConfig>({
      defaults: DEFAULT_NETWORK_CONNECTION_OBSERVER_CONFIG,
    });
    this.client = client;
    this.state = new StateStore<NetworkConnectionState>({
      isOnline: undefined,
      lastOnlineAt: null,
      lastOfflineAt: null,
    });
  }

  /**
   * Resolved configuration, as a store — the shape every configurable class exposes
   * (`configState` / `config` / `updateConfig`).
   */
  get configState(): StateStore<NetworkConnectionObserverConfig> {
    return this.configController.state;
  }

  /** The current resolved configuration. `Readonly` — change it through {@link updateConfig}. */
  public get config(): Readonly<NetworkConnectionObserverConfig> {
    return this.configState.getLatestValue();
  }

  /** Merges a partial configuration into the resolved config and notifies subscribers. */
  public updateConfig(config: Partial<NetworkConnectionObserverConfig>) {
    this.configController.patch(config);
  }

  /**
   * Rebuilds the resolved configuration from package defaults plus the declarative slice — the
   * derivation entry point every configurable entity exposes, so the client routes a slice here and
   * knows nothing about this class's defaults or merge semantics.
   *
   * Installs whatever registrar the resolved config names, falling back to the platform default. This
   * is what makes `client.config.set({ client: { connections: { statusListenerRegistrar } } })` work.
   */
  public initializeConfig(config?: Partial<NetworkConnectionObserverConfig>) {
    this.configController.initialize(config);
    this.setStatusListenerRegistrar(
      this.config.statusListenerRegistrar ?? getDefaultNetworkStatusListenerRegistrar(),
    );
  }

  /**
   * Device network status. `undefined` means unknown — see {@link NetworkConnectionState.isOnline}.
   * Guards must test `=== false`, never `!isOnline`.
   */
  public get isOnline(): boolean | undefined {
    return this.state.getLatestValue().isOnline;
  }

  /**
   * Installs the platform listener that reports device network status, unsubscribing whatever was
   * there. Pass `null` to clear it, which leaves the last known status alone rather than reverting to
   * unknown — an edge is not a state, and forgetting what we were last told would be a regression.
   *
   * Available as a setter, not just a constructor option, because React Native registers its native
   * handlers *after* the client exists.
   */
  public setStatusListenerRegistrar(
    registrar: NetworkStatusListenerRegistrar | null | undefined,
  ) {
    if (registrar && registrar === this.installedRegistrar) return;

    this.unsubscribeStatusListener?.();
    this.unsubscribeStatusListener = undefined;
    this.installedRegistrar = undefined;

    if (!registrar) return;

    try {
      this.unsubscribeStatusListener = registrar((isOnline) => this.setStatus(isOnline));
      this.installedRegistrar = registrar;
    } catch (error) {
      logger
        .withExtraTags('connections')
        .error('The network status listener registrar threw; status stays unknown.', {
          error,
        });
    }
  }

  /**
   * Reports device network status.
   *
   * The registrar calls this; so may a host with no listener API to register at all, and it is the
   * supported replacement for reaching into `client.wsConnection.onlineStatusChanged` with a
   * synthesized DOM event.
   */
  public setStatus(isOnline: boolean) {
    // Guard before stamping: `StateStore.next` no-ops on an equal reference, but writing a fresh
    // timestamp would defeat that and publish an update for a status that did not change.
    if (this.isOnline === isOnline) return;

    const now = new Date();
    this.state.partialNext(
      isOnline ? { isOnline, lastOnlineAt: now } : { isOnline, lastOfflineAt: now },
    );

    this.client.dispatchEvent({
      type: 'connection.changed',
      connection: 'network',
      online: isOnline,
    });
  }

  /**
   * Nothing to subscribe to beyond the registrar, which {@link initializeConfig} installs — this
   * class has no client events to listen to, by design: deriving either status from an event would
   * be the conflation it exists to prevent. Present because `WithSubscriptions` requires it, and so
   * that teardown releases the platform listener.
   */
  public registerSubscriptions = () => {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(() => {
        this.unsubscribeStatusListener?.();
        this.unsubscribeStatusListener = undefined;
        this.installedRegistrar = undefined;
      });
    }

    this.incrementRefCount();
    return () => this.unregisterSubscriptions();
  };
}
