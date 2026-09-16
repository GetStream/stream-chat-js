import { WithSubscriptions } from '../../utils/WithSubscriptions';
import { StateStore } from '../../store';
import { ConfigController } from '../../configuration/ConfigController';
import { deepFreezeConfig } from '../../configuration/utils/deepFreezeConfig';
import { chatLoggerSystem } from '../../logger';
import { getDefaultNetworkStatusReporter } from './reporters';
import type {
  NetworkConnectionObserverConfig,
  NetworkConnectionState,
  NetworkStatusReporter,
} from './types';
import type { StreamChat } from '../../client';
import type { Unsubscribe } from '../../store';

const logger = chatLoggerSystem.getLogger('client');

export const DEFAULT_NETWORK_CONNECTION_OBSERVER_CONFIG: NetworkConnectionObserverConfig =
  deepFreezeConfig({ statusReporter: undefined });

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
 *   listener the integrator registers ({@link NetworkStatusReporter}). The SDK cannot detect
 *   device network status itself — every platform reports it differently — so it has to be told. A
 *   browser reports it properly and that reporter is installed automatically; everywhere else the
 *   stand-in mirrors the WebSocket until a real reporter is installed, and `isOnline` stays
 *   `undefined` — *unknown* rather than offline — until the socket has been up once.
 * Combining the two is a presentation decision and deliberately absent: whether "network down and
 * socket down" reads as *no network* or as *reconnecting* is copy taxonomy, and a boolean named for
 * reachability invites gating requests on it, which network status must never do. Read both and branch.
 *
 * The store is the whole interface. There is no companion event: a store already says both what the
 * status is and that it just changed, and publishing the same fact twice only created the chance for
 * the two to disagree.
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
  private unsubscribeStatusReporter?: Unsubscribe;
  /**
   * The reporter currently installed, so re-installing the same one is a no-op. Configuration is
   * re-derived more than once — the client calls `initializeConfig` directly and again through the
   * config store's immediate subscribe — and tearing a platform listener down only to recreate it
   * identical is wasteful at best and, for something like `NetInfo`, a needless native round trip.
   */
  private installedReporter?: NetworkStatusReporter;
  /**
   * What {@link setStatusReporter} was last given — `null` when it was used to clear one,
   * and `undefined` when it has never been called.
   *
   * Held here rather than written into the resolved configuration because a derivation rebuilds that
   * from the declarative tree, so an imperatively installed reporter was torn down by the next
   * `client.config.set` on **any** `client` key and replaced by the platform default, which is
   * nothing at all on React Native.
   */
  private imperativeReporter?: NetworkStatusReporter | null;
  /**
   * The declared reporter the last installation saw, so a *change* to it can be told apart from a
   * re-derivation that named the same thing. Whichever source spoke last wins, and this is what makes
   * that comparison possible.
   */
  private declaredReporter?: NetworkStatusReporter;
  /**
   * Whether configuration has been derived at least once. {@link registerSubscriptions} runs while
   * the client is still being constructed, before its event machinery exists, so installing a
   * reporter there on the first call could report a status into a half-built client.
   */
  private configInitialized = false;
  /**
   * The host default, built once. {@link getDefaultNetworkStatusReporter} returns a fresh closure for
   * the socket-derived variant, and a fresh identity every derivation would defeat the
   * re-installation guard below — tearing a platform listener down only to recreate it identical.
   */
  private defaultReporter?: NetworkStatusReporter;

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

  /**
   * Merges a partial configuration into the resolved config and notifies subscribers.
   *
   * Installs whatever reporter the result names, so this is a real alternative to
   * {@link setStatusReporter} rather than a write nobody acts on. Without it the field was
   * stored and never invoked, leaving `isOnline` `undefined` forever with no error anywhere.
   */
  public updateConfig(config: Partial<NetworkConnectionObserverConfig>) {
    this.configController.patch(config);
    this.installConfiguredReporter();
  }

  /**
   * Rebuilds the resolved configuration from package defaults plus the declarative slice — the
   * derivation entry point every configurable entity exposes, so the client routes a slice here and
   * knows nothing about this class's defaults or merge semantics.
   *
   * Installs whatever reporter the resolved config names, falling back to the platform default. This
   * is what makes `client.config.set({ client: { connections: { statusReporter } } })` work.
   */
  public initializeConfig(config?: Partial<NetworkConnectionObserverConfig>) {
    this.configController.initialize(config);
    this.configInitialized = true;
    this.installConfiguredReporter();
  }

  /**
   * Installs the reporter the resolved configuration names, falling back to the platform default.
   *
   * The single place installation happens, so every path that can change what should be installed —
   * a derivation, a patch — goes through the same resolution instead of each reimplementing the
   * fallback.
   */
  private get hostDefaultReporter(): NetworkStatusReporter {
    return (this.defaultReporter ??= getDefaultNetworkStatusReporter(
      this.client.wsConnection,
    ));
  }

  private installConfiguredReporter() {
    const declared = this.config.statusReporter;

    if (declared !== this.declaredReporter) {
      this.declaredReporter = declared;
      // The declarative tree just named something different, which outranks an earlier imperative
      // call: whichever source spoke last is what the integrator meant.
      this.imperativeReporter = undefined;
    }

    this.installReporter(
      this.imperativeReporter !== undefined
        ? (this.imperativeReporter ?? undefined)
        : (declared ?? this.hostDefaultReporter),
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
   *
   * What is set here survives every later configuration derivation, and is only superseded by the
   * declarative tree naming a *different* reporter — `client.config.set({ client: { networkConnection:
   * { statusReporter } } })`.
   */
  public setStatusReporter(reporter: NetworkStatusReporter | null | undefined) {
    // Recorded before installing, so the next derivation reinstalls this rather than the platform
    // default. `null` is kept distinct from `undefined`: it means "explicitly none", which must
    // survive a derivation too.
    this.imperativeReporter = reporter ?? null;
    this.installConfiguredReporter();
  }

  /** Installs one reporter, unsubscribing whatever was there. */
  private installReporter(reporter: NetworkStatusReporter | null | undefined) {
    if (reporter && reporter === this.installedReporter) return;

    this.unsubscribeStatusReporter?.();
    this.unsubscribeStatusReporter = undefined;
    this.installedReporter = undefined;

    if (!reporter) return;

    try {
      this.unsubscribeStatusReporter = reporter((isOnline) => this.setStatus(isOnline));
      this.installedReporter = reporter;
    } catch (error) {
      logger
        .withExtraTags('connections')
        .error('The network status listener reporter threw; status stays unknown.', {
          error,
        });
    }
  }

  /**
   * Reports device network status.
   *
   * The reporter calls this; so may a host with no listener API to register at all, and it is the
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
  }

  /**
   * Nothing to subscribe to beyond the reporter, which {@link initializeConfig} installs — this
   * class has no client events to listen to, by design: deriving either status from an event would
   * be the conflation it exists to prevent. Present because `WithSubscriptions` requires it, and so
   * that teardown releases the platform listener.
   */
  public registerSubscriptions = () => {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(() => {
        this.unsubscribeStatusReporter?.();
        this.unsubscribeStatusReporter = undefined;
        this.installedReporter = undefined;
      });

      // Re-registering has to reinstall. The teardown above released the platform listener, and
      // nothing else puts it back — so an unregister/register cycle left the observer permanently
      // deaf, unlike `WSConnection` and `ConnectionRecoveryManager`, which both resubscribe here.
      // Skipped before the first derivation, when there is nothing resolved to install yet.
      if (this.configInitialized) this.installConfiguredReporter();
    }

    this.incrementRefCount();
    return () => this.unregisterSubscriptions();
  };
}
