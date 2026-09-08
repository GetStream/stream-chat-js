import { StateStore } from '../../store';
import { WithSubscriptions } from '../../utils/WithSubscriptions';
import { StableWSConnection } from '../../connection';
import { ConfigController } from '../../configuration/ConfigController';
import { chatLoggerSystem } from '../../logger';
import {
  clampWSConnectionConfig,
  DEFAULT_WS_CONNECTION_CONFIG,
  WS_CONNECTION_CONFIG_BOUNDS,
} from './config';
import type { WSConnectionConfig, WSConnectionState } from './types';
import type { StreamChat } from '../../client';
import type { ConnectAPIResponse } from '../../types';
import type { Unsubscribe } from '../../store';

const logger = chatLoggerSystem.getLogger('client');

/**
 * This client's WebSocket, as a stable object: `client.wsConnection` is created once with the client
 * and never replaced, so `state` is safe to subscribe to for the client's whole lifetime.
 *
 * The socket itself — {@link StableWSConnection}, which does the connecting, pinging and
 * reconnecting — hangs off {@link connection} and **is** replaced: `client.connect()` builds a new one
 * on every call. That is the reason this wrapper exists. Without it the status store would live on the
 * socket, where two things would go wrong: it would be unreadable before `connectUser` (the field
 * is `null` until the first connect), and every `closeConnection()` → `openConnection()` cycle — the
 * documented mobile background/foreground flow — would strand anyone already subscribed.
 *
 * The members below forward to the current socket so existing call sites keep working, with one
 * deliberate exception: {@link isOnline} is answered from `state`, not from `connection`, so it stays
 * correct across a replacement and while no socket exists yet.
 *
 * It also owns the **network-status subscription**, for the same reason it owns the store: subscribing
 * here means one subscription for the client's lifetime, routed to whichever socket is current. Per
 * socket it would leak — `client.connect()` overwrites `connection` without disconnecting the
 * previous one, leaving a dead socket still listening and still able to call `_reconnect()` on
 * itself.
 */
export class WSConnection extends WithSubscriptions {
  state: StateStore<WSConnectionState>;
  /**
   * The live socket, or `null` before the first {@link connect}. Built and replaced here, not from
   * outside — reach for {@link isOnline} / {@link connectionID} rather than this.
   *
   * @internal
   */
  connection: StableWSConnection | null = null;
  private client: StreamChat;
  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<WSConnectionConfig>;
  /**
   * The out-of-range values already warned about, so a bad setting is reported once rather than on
   * every derivation. Configuration is re-derived more than once at construction alone — the client
   * calls `initializeConfig` directly and again through the config store's immediate subscribe.
   */
  private warnedClamps = new Map<string, number>();

  constructor({ client }: { client: StreamChat }) {
    super();
    this.configController = new ConfigController<WSConnectionConfig>({
      defaults: DEFAULT_WS_CONNECTION_CONFIG,
      // The bounds hook, not a check in `updateConfig`: it runs on every derivation *and* on every
      // patch, so a limit cannot be escaped by setting the field again later.
      applyAuthority: (requested) => this.applyConfigBounds(requested),
    });
    this.client = client;
    this.state = new StateStore<WSConnectionState>({
      isOnline: false,
      connectionId: undefined,
      lastOnlineAt: null,
      lastOfflineAt: null,
    });
  }

  /**
   * Resolved configuration, as a store — the shape every configurable class exposes
   * (`configState` / `config` / `updateConfig`).
   */
  get configState(): StateStore<WSConnectionConfig> {
    return this.configController.state;
  }

  /**
   * The current resolved configuration. `Readonly` — change it through {@link updateConfig}.
   *
   * The socket reads this **live** rather than snapshotting it, so an update reaches the current
   * connection instead of waiting for the next one. That matters here more than for most configurable
   * classes, because {@link connect} replaces the socket every time it is called.
   */
  public get config(): Readonly<WSConnectionConfig> {
    return this.configState.getLatestValue();
  }

  /**
   * Holds the timing knobs inside {@link WS_CONNECTION_CONFIG_BOUNDS}, warning once per offending
   * value.
   *
   * Clamps rather than throws. An out-of-range timing value is a misconfiguration, not a
   * programming error, and refusing to construct a client over it would take down an application
   * that is otherwise fine — while silently using the requested value would break the socket in a
   * way that looks like a flaky network. So the socket keeps working at the nearest usable setting
   * and says what it did.
   */
  private applyConfigBounds(requested: WSConnectionConfig): WSConnectionConfig {
    const { clamped, corrections } = clampWSConnectionConfig(requested);

    for (const correction of corrections) {
      if (this.warnedClamps.get(correction.field) === correction.requested) continue;
      this.warnedClamps.set(correction.field, correction.requested);

      logger
        .withExtraTags('wsConnection')
        .warn(
          `The WebSocket setting '${correction.field}' is outside its supported range; using ${correction.used}ms instead of ${correction.requested}ms.`,
          { bounds: WS_CONNECTION_CONFIG_BOUNDS[correction.field as 'pingIntervalMs'] },
        );
    }

    return clamped;
  }

  /** Merges a partial configuration into the resolved config and notifies subscribers. */
  public updateConfig(config: Partial<WSConnectionConfig>) {
    this.configController.patch(config);
  }

  /**
   * Rebuilds the resolved configuration from package defaults plus the declarative slice — the
   * derivation entry point every configurable entity exposes.
   */
  public initializeConfig(config?: Partial<WSConnectionConfig>) {
    this.configController.initialize(config);
  }

  /**
   * Is this WebSocket up. Read from {@link state} rather than from the current socket, so it
   * survives the socket being replaced and answers `false` rather than throwing before the first
   * connect.
   */
  get isOnline(): boolean {
    return this.state.getLatestValue().isOnline;
  }

  /** The id the server keys watches by. Never cleared — see {@link WSConnectionState.connectionId}. */
  get connectionID(): string | undefined {
    return this.state.getLatestValue().connectionId;
  }

  /** Whether a connection attempt is in flight. */
  get isConnecting(): boolean {
    return this.connection?.isConnecting ?? false;
  }

  /**
   * Records this WebSocket's status. Returns whether it changed.
   *
   * {@link StableWSConnection} is the only caller, and it routes **every** status transition through
   * here — including the ones that deliberately dispatch no `connection.changed`: `disconnect()`,
   * which `closeConnection()` uses, and the two error paths. That is what makes this store truthful
   * on paths the event has always been silent about, and the reason it is worth publishing at all.
   *
   * @internal
   */
  _setStatus({
    isOnline,
    connectionId,
  }: {
    isOnline: boolean;
    connectionId?: string;
  }): boolean {
    if (this.isOnline === isOnline) return false;

    const now = new Date();
    this.state.partialNext(
      isOnline
        ? // `connectionId` is current by the time we go up. It is never cleared, which is why going
          // down leaves it alone rather than pretending to.
          { isOnline, connectionId, lastOnlineAt: now }
        : { isOnline, lastOfflineAt: now },
    );

    return true;
  }

  /**
   * Routes the device's network status to whichever socket is current.
   *
   * One subscription, registered once with the client. The socket used to hold this itself, which
   * leaked on every replacement and needed re-subscribing from both its constructor and `setClient` —
   * because `options.wsConnection` allows a socket to be built before its client exists. None of
   * that applies here: this object is created with the client and never replaced.
   */
  public registerSubscriptions = (): Unsubscribe => {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(
        this.client.on('connection.changed', (event) => {
          // The socket also *dispatches* the `'ws'` variant, so without narrowing this would feed
          // its own status back to it.
          if (event.connection !== 'network') return;
          this.connection?._applyNetworkStatus(event.online);
        }).unsubscribe,
      );
    }

    this.incrementRefCount();
    return () => this.unregisterSubscriptions();
  };

  /**
   * Builds a socket and opens it, replacing any previous one.
   *
   * A fresh `StableWSConnection` per connect is the existing behaviour, kept deliberately: it resets
   * `wsID`, the failure counters and the health-check timers, and `wsID` is what makes callbacks from
   * an abandoned socket recognisable and ignorable. Reusing one across connect cycles would carry
   * that state over.
   *
   * Creation lives here rather than in the constructor because a client that never calls
   * `connectUser` should never build a socket, and here rather than in `client.connect()` because a
   * field belongs to the object that owns it.
   */
  connect(timeout?: number): ConnectAPIResponse | undefined {
    const next = this.buildConnection();
    const previous = this.connection;

    // Close the socket being replaced. Without this it is abandoned rather than shut down: nothing
    // else clears its ping and connection-check timers, and only `disconnect()` sets
    // `isDisconnected`, which is the flag `_reconnect()` checks before giving up. So the old socket
    // stayed live and kept reconnecting *alongside* the new one — two sockets, two ping loops, and
    // whichever answered last winning the client's status.
    //
    // Safe here because `openConnection()` has already returned early if a healthy connection exists
    // or an attempt is in flight, so anything still held at this point is a socket we are done with.
    // Skipped when `buildConnection` hands back the same instance, which it does for an injected one.
    if (previous && previous !== next) {
      // Fire and forget: the parts that neutralise it — bumping `wsID`, clearing the timers, setting
      // `isDisconnected` — all happen synchronously, and only the socket close is awaited. Errors are
      // swallowed deliberately; this socket is being discarded either way.
      void Promise.resolve(previous.disconnect()).catch((error) => {
        logger
          .withExtraTags('wsConnection')
          .debug('Closing the replaced WebSocket failed; discarding it anyway.', {
            error,
          });
      });
    }

    this.connection = next;
    // Left to the socket to default from `config.connectTimeoutMs`, so the value lives in one place.
    return next.connect(timeout);
  }

  /**
   * `config.connection` lets a caller supply a pre-built socket — used by unit tests, and the reason
   * `StableWSConnection` accepts a client through `setClient` as well as its constructor.
   */
  private buildConnection(): StableWSConnection {
    const injected = this.config.connection;

    if (injected && this.client.node) {
      injected.setClient(this.client);
      return injected;
    }

    return new StableWSConnection({ client: this.client });
  }

  disconnect(timeout?: number): Promise<void> | undefined {
    return this.connection?.disconnect(timeout);
  }

  /**
   * @deprecated Report network status through `client.networkConnection.setStatus(isOnline)` instead,
   *   or register a listener with `client.networkConnection.setStatusListenerRegistrar(…)`. Forwarded
   *   here only because `stream-chat-react-native` calls it directly.
   */
  onlineStatusChanged(event: Event): void {
    this.connection?.onlineStatusChanged(event);
  }
}
