import { WithSubscriptions } from '../../utils/WithSubscriptions';
import { StateStore } from '@stream-io/state-store';
import { ConfigController } from '../../configuration/ConfigController';
import { deepFreezeConfig } from '../../configuration/utils/deepFreezeConfig';
import { chatLoggerSystem } from '../../logger';
import {
  browserNetworkStatusReporter,
  getDefaultNetworkStatusReporter,
} from './reporters';
import type {
  NetworkConnectionObserverConfig,
  NetworkConnectionState,
  NetworkStatusReporter,
} from './types';
import type { StreamChat } from '../../client';
import type { Unsubscribe } from '@stream-io/state-store';

const logger = chatLoggerSystem.getLogger('client');

export const DEFAULT_NETWORK_CONNECTION_OBSERVER_CONFIG: NetworkConnectionObserverConfig =
  deepFreezeConfig({ statusReporter: undefined });

/**
 * Device network status as reactive `state`, written only through {@link setStatus} (by a
 * {@link NetworkStatusReporter}). It is a separate fact from the WebSocket status in
 * `client.wsConnection.state`: a socket can die on a working network, and a device can go offline
 * before the socket notices. Read both and branch; network status must never gate requests.
 *
 * Browsers get their reporter automatically. Elsewhere a stand-in mirrors the WebSocket until a real
 * one is installed, and `isOnline` stays `undefined` (unknown) until the socket has been up once.
 */
export class NetworkConnectionObserver extends WithSubscriptions {
  client: StreamChat;
  state: StateStore<NetworkConnectionState>;
  private readonly configController: ConfigController<NetworkConnectionObserverConfig>;
  /** Replaced on each install, which `addUnsubscribeFunction` (cleared on unregister) cannot do. */
  private unsubscribeStatusReporter?: Unsubscribe;
  /** The installed reporter, so re-installing the same one (config is re-derived) is a no-op. */
  private installedReporter?: NetworkStatusReporter;
  /**
   * What `setStatusReporter` was last given (`null` clears, `undefined` if never called). Kept out
   * of the resolved config, which derivations rebuild.
   */
  private imperativeReporter?: NetworkStatusReporter | null;
  /** The declared reporter the last install saw, to tell a changed declaration from a re-derive. */
  private declaredReporter?: NetworkStatusReporter;
  /**
   * Whether config was derived at least once. `registerSubscriptions` runs mid-construction, when
   * the client cannot take a status report yet.
   */
  private configInitialized = false;
  /** The host default, built once: the socket-mirroring one is a fresh closure per call. */
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

  get configState(): StateStore<NetworkConnectionObserverConfig> {
    return this.configController.state;
  }

  public get config(): Readonly<NetworkConnectionObserverConfig> {
    return this.configState.getLatestValue();
  }

  /** Also installs the reporter the patched config names. */
  public updateConfig(config: Partial<NetworkConnectionObserverConfig>) {
    this.configController.patch(config);
    this.installConfiguredReporter();
  }

  /** Also installs the reporter the resolved config names, else the host default. */
  public initializeConfig(config?: Partial<NetworkConnectionObserverConfig>) {
    this.configController.initialize(config);
    this.configInitialized = true;
    this.installConfiguredReporter();
  }

  private get hostDefaultReporter(): NetworkStatusReporter {
    return (this.defaultReporter ??= getDefaultNetworkStatusReporter(
      this.client.wsConnection,
    ));
  }

  /** Installs the imperative reporter if set, else the declared one, else the host default. */
  private installConfiguredReporter() {
    const declared = this.config.statusReporter;

    if (declared !== this.declaredReporter) {
      this.declaredReporter = declared;
      // A changed declaration outranks an earlier imperative call: the last source to speak wins.
      this.imperativeReporter = undefined;
    }

    this.installReporter(
      this.imperativeReporter !== undefined
        ? (this.imperativeReporter ?? undefined)
        : (declared ?? this.hostDefaultReporter),
    );
  }

  /** Device network status; `undefined` is unknown, so test `=== false`, never `!isOnline`. */
  public get isOnline(): boolean | undefined {
    return this.state.getLatestValue().isOnline;
  }

  /**
   * Whether the installed reporter is the default that mirrors the WebSocket
   * (`createWSConnectionNetworkStatusReporter`), where `isOnline === false` means "socket down".
   *
   * @internal
   */
  public get usesDefaultWSConnectionNetworkStatusReporter(): boolean {
    return (
      this.installedReporter !== undefined &&
      this.installedReporter === this.defaultReporter &&
      this.defaultReporter !== browserNetworkStatusReporter
    );
  }

  /**
   * Installs the platform listener that reports device network status, replacing the previous one.
   * `null` clears it and keeps the last known status. It survives later config derivations and is
   * superseded only when the config names a different reporter
   * (`client.config.set({ client: { networkConnection: { statusReporter } } })`).
   */
  public setStatusReporter(reporter: NetworkStatusReporter | null | undefined) {
    // `null` ("explicitly none") stays distinct from `undefined` (never set) across derivations.
    this.imperativeReporter = reporter ?? null;
    this.installConfiguredReporter();
  }

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

  /** Reports device network status. Called by the reporter, or by a host with no listener API. */
  public setStatus(isOnline: boolean) {
    // Guard before stamping: a fresh timestamp would publish an update for an unchanged status.
    if (this.isOnline === isOnline) return;

    const now = new Date();
    this.state.partialNext(
      isOnline ? { isOnline, lastOnlineAt: now } : { isOnline, lastOfflineAt: now },
    );
  }

  /** Listens to no client events; teardown only releases the platform listener. */
  public registerSubscriptions = () => {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(() => {
        this.unsubscribeStatusReporter?.();
        this.unsubscribeStatusReporter = undefined;
        this.installedReporter = undefined;
      });

      // Re-registering reinstalls the listener released by the teardown above. Skipped before the
      // first derivation, when there is nothing resolved to install.
      if (this.configInitialized) this.installConfiguredReporter();
    }

    this.incrementRefCount();
    return () => this.unregisterSubscriptions();
  };
}
