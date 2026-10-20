import { StateStore } from '@stream-io/state-store';
import { WithSubscriptions } from '../../utils/WithSubscriptions';
import { StableWSConnection } from '../../connection';
import { WSConnectionFallback } from './WSConnectionFallback';
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
 * This client's WebSocket as a stable object: `client.wsConnection` is created once with the client,
 * so `state` can be subscribed to for its whole lifetime. The socket ({@link StableWSConnection}, in
 * {@link connection}) is replaced on every {@link connect}, so a store living on it would be
 * unreadable before `connectUser` and strand subscribers across `closeConnection()` and
 * `openConnection()`.
 *
 * It also owns the single network-status subscription, routed to the current socket. After an
 * `enableWSFallback` switch `state` and that routing describe the long-poll ({@link fallback}).
 */
export class WSConnection extends WithSubscriptions {
  state: StateStore<WSConnectionState>;
  /**
   * The live socket, or `null` before the first {@link connect}. Prefer {@link isHealthy} to it.
   *
   * @internal
   */
  connection: StableWSConnection | null = null;
  /**
   * The long-poll, once `enableWSFallback` has switched to it. Never cleared, not even by
   * `disconnectUser()`.
   *
   * @internal
   */
  fallback?: WSConnectionFallback;
  /**
   * For the socket this object owns, which reaches the client through it.
   *
   * @internal
   */
  readonly client: StreamChat;
  private readonly configController: ConfigController<WSConnectionConfig>;
  /** Out-of-range values already warned about, so a bad setting is reported once per value. */
  private warnedClamps = new Map<string, number>();

  constructor({ client }: { client: StreamChat }) {
    super();
    this.configController = new ConfigController<WSConnectionConfig>({
      defaults: DEFAULT_WS_CONNECTION_CONFIG,
      // Runs on every derivation and every patch, so a limit cannot be escaped by setting it again.
      applyAuthority: (requested) => this.applyConfigBounds(requested),
    });
    this.client = client;
    this.state = new StateStore<WSConnectionState>({
      isHealthy: false,
      lastHealthyAt: null,
      lastUnhealthyAt: null,
    });
  }

  get configState(): StateStore<WSConnectionConfig> {
    return this.configController.state;
  }

  /** Read live by the socket, so an update reaches the current connection. */
  public get config(): Readonly<WSConnectionConfig> {
    return this.configState.getLatestValue();
  }

  /** Clamps the timing knobs into {@link WS_CONNECTION_CONFIG_BOUNDS}, warning once per value. */
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

  public updateConfig(config: Partial<WSConnectionConfig>) {
    this.configController.patch(config);
  }

  public initializeConfig(config?: Partial<WSConnectionConfig>) {
    this.configController.initialize(config);
  }

  /** Read from {@link state}, so it survives socket replacement and is `false` before connecting. */
  get isHealthy(): boolean {
    return this.state.getLatestValue().isHealthy;
  }

  /** Whether a connection attempt is in flight (the long-poll's, after a fallback switch). */
  get isConnecting(): boolean {
    return (this.fallback ?? this.connection)?.isConnecting ?? false;
  }

  /**
   * Records this connection's status and returns whether it changed. Called by
   * {@link StableWSConnection} on every status transition, and by {@link fallback} once it takes over.
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

  /** Routes the device's network status to the current socket, or to {@link fallback} once set. */
  public registerSubscriptions = (): Unsubscribe => {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(
        this.client.networkConnection.state.subscribeWithSelector(
          ({ isOnline }) => ({ isOnline }),
          ({ isOnline }) => {
            // `undefined` is unknown, not offline: acting on it would tear down a healthy socket on
            // hosts with no reporter.
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
   * Builds a fresh socket (resetting `wsID`, the failure counters and the health-check timers) and
   * opens it, closing any previous one. A socket injected through `config.connection` (Node only) is
   * reused as is. With `enableWSFallback`, a network failure switches to the long-poll
   * ({@link fallback}), which every later call connects instead.
   */
  async connect(timeout?: number): ConnectAPIResponse {
    // Once switched, stay on the long-poll.
    if (this.fallback) {
      return await this.fallback.connect();
    }

    const next = this.buildConnection();
    const previous = this.connection;

    // Close the socket being replaced, else it keeps reconnecting alongside the new one (only
    // `disconnect()` sets `isDisconnected`, which `_reconnect()` checks). Safe: `openConnection()`
    // returns early while a healthy connection exists or an attempt is in flight.
    if (previous && previous !== next) {
      // Fire and forget: the neutralising steps (`wsID`, timers, `isDisconnected`) run synchronously.
      // Errors are ignored since the socket is discarded either way.
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
      return await next.connect(timeout);
    } catch (error) {
      // Fall back only on a WS/network error, and not when the device is offline. The socket-mirroring
      // default reporter's "offline" only means the socket is down, so it is ignored.
      const { networkConnection } = this.client;
      const isDeviceOffline =
        networkConnection.isOnline === false &&
        !networkConnection.usesDefaultWSConnectionNetworkStatusReporter;
      if (
        this.config.enableWSFallback &&
        isWSFailure(error as APIError) &&
        !isDeviceOffline
      ) {
        logger.withExtraTags('connect').info('WS failed, fallback to longpoll');
        this.client.dispatchEvent({
          type: 'connection.fallback_activated',
          mode: 'longpoll',
        });

        next._destroyCurrentWSConnection();
        void next.disconnect(); // close WS so no retry
        this.fallback = new WSConnectionFallback({ client: this.client });
        return await this.fallback.connect();
      }

      // A failure the socket does not retry must settle the pending connection ID.
      if (!isWSFailure(error as APIError)) {
        this.client.connectionIdManager.rejectConnectionId(error);
      }
      throw error;
    }
  }

  /** Uses the pre-built `config.connection` when given (and `client.node`), else builds a socket. */
  private buildConnection(): StableWSConnection {
    const injected = this.config.connection;

    if (injected && this.client.node) {
      injected.setWSConnection(this);
      return injected;
    }

    return new StableWSConnection({ wsConnection: this });
  }

  /**
   * Closes the socket and, after an `enableWSFallback` switch, the long-poll too, telling the server
   * to close its connection ID. `timeout` (ms) bounds the socket's close frame and the long-poll's
   * close request. Defaults to 1s and 2s respectively.
   */
  async disconnect(timeout?: number): Promise<void> {
    // Read before the socket's `disconnect()` drops it: the long-poll's close request must carry it.
    const connectionId = this.client.connectionIdManager.connectionId;
    await Promise.all([
      this.connection?.disconnect(timeout),
      this.fallback?.disconnect(timeout, connectionId),
    ]);
  }

  /**
   * @deprecated Use `client.networkConnection.setStatus(isOnline)` or
   *   `client.networkConnection.setStatusReporter(…)` instead.
   */
  onlineStatusChanged(event: Event): void {
    this.connection?.onlineStatusChanged(event);
  }
}
