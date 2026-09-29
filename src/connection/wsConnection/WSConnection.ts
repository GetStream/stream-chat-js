import { StateStore } from '@stream-io/state-store';
import { WithSubscriptions } from '../../utils/WithSubscriptions';
import { StableWSConnection } from '../../connection';
import { WSConnectionFallback } from '../WSConnectionFallback';
import { isWSFailure } from '../../errors';
import { ConfigController } from '../../configuration/ConfigController';
import { chatLoggerSystem } from '../../logger';
import {
  clampWSConnectionConfig,
  DEFAULT_WS_CONNECTION_CONFIG,
  WS_CONNECTION_CONFIG_BOUNDS,
} from './config';
import type { WSConnectionConfig, WSConnectionState } from './types';
import type { StreamChat } from '../../client';
import type { APIError } from '../../errors';
import type { ConnectAPIResponse } from '../../types';
import type { Unsubscribe } from '@stream-io/state-store';

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
 * deliberate exception: {@link isHealthy} is answered from `state`, not from `connection`, so it stays
 * correct across a replacement and while no socket exists yet.
 *
 * It also owns the **network-status subscription**, for the same reason it owns the store: subscribing
 * here means one subscription for the client's lifetime, routed to whichever socket is current. Per
 * socket it would leak — `client.connect()` overwrites `connection` without disconnecting the
 * previous one, leaving a dead socket still listening and still able to call `_reconnect()` on
 * itself.
 *
 * **With `enableWSFallback`, the store can describe the long-poll instead.** Once {@link connect}
 * has switched to `WSConnectionFallback` ({@link fallback}), that class writes {@link state}
 * through {@link _setStatus}, and {@link connection} is left holding the disconnected socket. The
 * client never switches back, so from then on `state`, {@link isHealthy}, {@link isConnecting} and
 * the network-status subscription follow the long-poll.
 */
export class WSConnection extends WithSubscriptions {
  state: StateStore<WSConnectionState>;
  /**
   * The live socket, or `null` before the first {@link connect}. Built and replaced here, not from
   * outside — reach for {@link isHealthy} rather than this. After an `enableWSFallback` switch it
   * keeps the socket that failed, disconnected, since nothing builds a new one again.
   *
   * @internal
   */
  connection: StableWSConnection | null = null;
  /**
   * The long-poll, once `enableWSFallback` has switched to it; `undefined` until then. Built by
   * {@link connect} and never cleared: as in v9, the client does not go back to the WebSocket, not
   * even across `disconnectUser()`.
   *
   * @internal
   */
  fallback?: WSConnectionFallback;
  /**
   * Readable by the socket this object owns, which reaches the client through its parent rather than
   * holding one of its own. Not part of the public surface — `client.wsConnection.client` is a
   * round trip back to where you started.
   *
   * @internal
   */
  readonly client: StreamChat;
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
      isHealthy: false,
      lastHealthyAt: null,
      lastUnhealthyAt: null,
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
   * Is this WebSocket up — or, after an `enableWSFallback` switch, the long-poll. Read from
   * {@link state} rather than from the current socket, so it survives the socket being replaced and
   * answers `false` rather than throwing before the first connect.
   */
  get isHealthy(): boolean {
    return this.state.getLatestValue().isHealthy;
  }

  /** Whether a connection attempt is in flight — the long-poll's after an `enableWSFallback` switch. */
  get isConnecting(): boolean {
    return (this.fallback ?? this.connection)?.isConnecting ?? false;
  }

  /**
   * Records this connection's status. Returns whether it changed.
   *
   * {@link StableWSConnection} routes **every** status transition through here — including
   * `disconnect()`, which `closeConnection()` uses, and the two error paths. The one other
   * caller is {@link fallback}, which takes over once `enableWSFallback` has switched to
   * long-polling.
   *
   * @internal
   */
  _setStatus({ isHealthy }: { isHealthy: boolean }): boolean {
    if (this.isHealthy === isHealthy) return false;

    const now = new Date();
    this.state.partialNext(
      isHealthy ? { isHealthy, lastHealthyAt: now } : { isHealthy, lastUnhealthyAt: now },
    );

    return true;
  }

  /**
   * Routes the device's network status to whichever socket is current.
   *
   * One subscription, held here rather than on the socket: this object is created with the client and
   * never replaced, while a socket is replaced on every connect and may be built before its client
   * exists at all.
   *
   * Read from the store rather than from an event, so there is one description of the device's
   * network rather than two that can disagree.
   *
   * After an `enableWSFallback` switch it routes to {@link fallback} instead, leaving the
   * disconnected socket out of it.
   */
  public registerSubscriptions = (): Unsubscribe => {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(
        this.client.networkConnection.state.subscribeWithSelector(
          ({ isOnline }) => ({ isOnline }),
          ({ isOnline }) => {
            // `undefined` is *unknown*, not offline: no reporter has said anything yet, and acting on
            // it would tear down a healthy socket on every host that cannot answer the question.
            if (typeof isOnline !== 'boolean') return;
            (this.fallback ?? this.connection)?._applyNetworkStatus(isOnline);
          },
        ),
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
   *
   * With `enableWSFallback`, a socket that fails with a network error is replaced by the long-poll
   * ({@link fallback}), which every later call connects instead of building a socket.
   */
  async connect(timeout?: number): ConnectAPIResponse {
    // if fallback is used before, continue using it instead of waiting for WS to fail
    if (this.fallback) {
      return await this.fallback.connect();
    }

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

    try {
      // Left to the socket to default from `config.connectTimeoutMs`, so the value lives in one place.
      return await next.connect(timeout);
    } catch (error) {
      // run fallback only if it's WS/Network error and not a normal API error
      // make sure the device is online before even trying the longpoll. The default reporter on
      // hosts without a network API mirrors the WebSocket, so its "offline" only means the socket
      // is down, and is ignored.
      const { networkConnection } = this.client;
      const isDeviceOffline =
        networkConnection.isOnline === false &&
        !networkConnection.isStatusDerivedFromSocket;
      if (
        this.config.enableWSFallback &&
        isWSFailure(error as APIError) &&
        !isDeviceOffline
      ) {
        logger.withExtraTags('connect').info('WS failed, fallback to longpoll');
        this.client.dispatchEvent({ type: 'transport.changed', mode: 'longpoll' });

        next._destroyCurrentWSConnection();
        void next.disconnect(); // close WS so no retry
        this.fallback = new WSConnectionFallback({ client: this.client });
        return await this.fallback.connect();
      }

      // A failure the socket does not retry leaves nothing else to settle the pending connection id.
      if (!isWSFailure(error as APIError)) {
        this.client.connectionIdManager.rejectConnectionId(error);
      }
      throw error;
    }
  }

  /**
   * `config.connection` lets a caller supply a pre-built socket — used by unit tests, and the reason
   * `StableWSConnection` accepts a parent through `setWSConnection` as well as its constructor.
   */
  private buildConnection(): StableWSConnection {
    const injected = this.config.connection;

    if (injected && this.client.node) {
      injected.setWSConnection(this);
      return injected;
    }

    return new StableWSConnection({ wsConnection: this });
  }

  /**
   * Closes the socket and, after an `enableWSFallback` switch, the long-poll too, telling the
   * server to close its connection id. The long-poll's close request uses `timeout` as its timeout
   * (2s when omitted).
   */
  async disconnect(timeout?: number): Promise<void> {
    await Promise.all([
      this.connection?.disconnect(timeout),
      this.fallback?.disconnect(timeout),
    ]);
  }

  /**
   * @deprecated Report network status through `client.networkConnection.setStatus(isOnline)` instead,
   *   or register a listener with `client.networkConnection.setStatusReporter(…)`. Forwarded
   *   here only because `stream-chat-react-native` calls it directly.
   */
  onlineStatusChanged(event: Event): void {
    this.connection?.onlineStatusChanged(event);
  }
}
