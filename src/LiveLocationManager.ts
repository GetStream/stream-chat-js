/**
 * One live-location sharing message per channel per user. `created_by_device_id` is set at creation
 * and cannot be reassigned (`UpdateLiveLocationRequest` has no device field), so any of the user's
 * devices can update the same share: sharing is effectively per user and channel.
 */

import { withCancellation } from './utils/concurrency';
import { nowNs, nsToMs } from './utils/time';
import { deepFreezeConfig } from './configuration/utils/deepFreezeConfig';
import { StateStore } from '@stream-io/state-store';
import { ConfigController } from './configuration/ConfigController';
import { applyInstanceConfiguration } from './configuration/utils/applyInstanceConfiguration';
import { WithSubscriptions } from './utils/WithSubscriptions';
import type { StreamChat } from './client';
import type { Unsubscribe } from '@stream-io/state-store';
import type {
  EventType,
  MessageResponse,
  SharedLiveLocationResponse,
  SharedLocationResponseData,
} from './types';
import type { Coords } from './messageComposer';

export type WatchLocationHandler = (value: Coords) => void;
export type WatchLocation = (handler: WatchLocationHandler) => Unsubscribe;
type DeviceIdGenerator = () => string;
type MessageId = string;

export type ScheduledLiveLocationSharing = SharedLiveLocationResponse & {
  stopSharingTimeout: ReturnType<typeof setTimeout> | null;
};

export type LiveLocationManagerState = {
  ready: boolean;
  messages: Map<MessageId, ScheduledLiveLocationSharing>;
};

/** `setTimeout` silently clamps a longer delay to 1 ms, so longer waits are armed in steps. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Whether the manager can track this location: a finite `end_at` that has not passed. `end_at` is
 * optional on the wire, and `NaN < nowNs()` is `false`, so both would otherwise read as live.
 */
const canTrackLocation = (location: SharedLocationResponseData): boolean =>
  typeof location.end_at === 'number' &&
  Number.isFinite(location.end_at) &&
  location.end_at >= nowNs();

/** Type guard form of `canTrackLocation`. Negating it narrows `state.messages` to `never`. */
const isTrackableLocation = (
  location: SharedLocationResponseData,
): location is SharedLiveLocationResponse => canTrackLocation(location);

/** Milliseconds from now until `endAt` (unix nanoseconds), never negative. */
const msUntilExpiry = (endAt: number) => Math.max(0, nsToMs(endAt - nowNs()));

function isValidLiveLocationMessage(
  message?: MessageResponse,
): message is MessageResponse & { shared_location: SharedLiveLocationResponse } {
  if (!message || message.type === 'deleted' || !message.shared_location) return false;

  return isTrackableLocation(message.shared_location);
}

export type LiveLocationManagerConstructorParameters = {
  client: StreamChat;
  getDeviceId: DeviceIdGenerator;
  watchLocation: WatchLocation;
};

/** Default of `minUpdateThrottleMs`, in milliseconds. */
export const UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT = 3000;

export type LiveLocationManagerConfig = {
  /**
   * Shortest gap between live-location update requests in milliseconds (default 3000). A failsafe
   * against rate limiting for a chatty custom `watchLocation`; lowering it risks 429s.
   */
  minUpdateThrottleMs: number;
};

export const DEFAULT_LIVE_LOCATION_MANAGER_CONFIG: LiveLocationManagerConfig =
  deepFreezeConfig({
    minUpdateThrottleMs: UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT,
  });

export class LiveLocationManager extends WithSubscriptions {
  public state: StateStore<LiveLocationManagerState>;
  private client: StreamChat;
  private getDeviceId: DeviceIdGenerator;
  private _deviceId: string;
  private watchLocation: WatchLocation;

  private readonly configController: ConfigController<LiveLocationManagerConfig>;
  private unsubscribeConfiguration?: Unsubscribe;

  get configState(): StateStore<LiveLocationManagerConfig> {
    return this.configController.state;
  }

  static symbol = Symbol(LiveLocationManager.name);

  constructor({
    client,
    getDeviceId,
    watchLocation,
  }: LiveLocationManagerConstructorParameters) {
    if (!client.userId) {
      throw new Error('Live-location sharing is reserved for client-side use only');
    }

    super();

    this.client = client;
    this.state = new StateStore<LiveLocationManagerState>({
      messages: new Map(),
      ready: false,
    });
    this._deviceId = getDeviceId();
    this.getDeviceId = getDeviceId;
    this.watchLocation = watchLocation;
    this.configController = new ConfigController<LiveLocationManagerConfig>({
      defaults: DEFAULT_LIVE_LOCATION_MANAGER_CONFIG,
    });

    // Last statement, so a setup function sees a whole object. Subscribed here, not only in
    // `registerSubscriptions`, so a config registered before the async `init()` resolves still
    // applies.
    this.subscribeConfiguration();
  }

  /** Subscribes to the `'liveLocationManager'` configuration key. Idempotent. */
  private subscribeConfiguration = () => {
    if (this.unsubscribeConfiguration) return;

    this.unsubscribeConfiguration = applyInstanceConfiguration({
      args: { liveLocationManager: this },
      config: this.client.config,
      key: 'liveLocationManager',
      applyConfig: (config) => this.initializeConfig(config),
      reinitializeConfig: () =>
        this.initializeConfig(
          this.client.config.getConfig('liveLocationManager') ?? undefined,
        ),
    });
  };

  get config(): Readonly<LiveLocationManagerConfig> {
    return this.configState.getLatestValue();
  }

  updateConfig(config: Partial<LiveLocationManagerConfig>) {
    this.configController.patch(config);
  }

  initializeConfig(config?: Partial<LiveLocationManagerConfig>) {
    this.configController.initialize(config);
  }

  public async init() {
    await this.assureStateInit();
    this.registerSubscriptions();
  }

  public registerSubscriptions = () => {
    this.incrementRefCount();
    // Restores the configuration subscription after `dispose` (e.g. React StrictMode's
    // mount/cleanup/mount). No-op otherwise: the constructor already subscribed.
    this.subscribeConfiguration();

    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(this.subscribeLiveLocationSharingUpdates());
    this.addUnsubscribeFunction(this.subscribeTargetMessagesChange());
  };

  /** Ref-counted. Leaves the configuration subscription to {@link dispose}. */
  public unregisterSubscriptions = () => super.unregisterSubscriptions();

  /**
   * Releases the configuration subscription, running the `'liveLocationManager'` setup function's
   * teardown. Call it when finished with the manager: until then the client's configuration
   * registry holds a handle to it. A later {@link registerSubscriptions} re-subscribes.
   */
  public dispose = () => {
    this.unsubscribeConfiguration?.();
    this.unsubscribeConfiguration = undefined;
  };

  get messages() {
    return this.state.getLatestValue().messages;
  }

  get stateIsReady() {
    return this.state.getLatestValue().ready;
  }

  get deviceId() {
    if (!this._deviceId) {
      this._deviceId = this.getDeviceId();
    }
    return this._deviceId;
  }

  private async assureStateInit() {
    if (this.stateIsReady) return;
    const { active_live_locations } = await this.client.getUserLiveLocations();
    this.state.next({
      messages: new Map(
        active_live_locations.filter(isTrackableLocation).map((location) => [
          location.message_id,
          {
            ...location,
            stopSharingTimeout: this.scheduleStopSharing(
              location.message_id,
              location.end_at,
            ),
          },
        ]),
      ),
      ready: true,
    });
  }

  private subscribeTargetMessagesChange() {
    let unsubscribeWatchLocation: null | (() => void) = null;

    // The location watcher runs only while there are messages to update.
    const unsubscribe = this.state.subscribeWithSelector(
      ({ messages }) => ({ messages }),
      ({ messages }) => {
        if (!messages.size) {
          unsubscribeWatchLocation?.();
          unsubscribeWatchLocation = null;
        } else if (messages.size && !unsubscribeWatchLocation) {
          unsubscribeWatchLocation = this.subscribeWatchLocation();
        }
      },
    );

    return () => {
      unsubscribe();
      unsubscribeWatchLocation?.();
    };
  }

  private subscribeWatchLocation() {
    let nextAllowedUpdateCallTimestamp = Date.now();

    const unsubscribe = this.watchLocation(({ latitude, longitude }) => {
      // Failsafe against rate limiting, whatever interval a custom `watchLocation` uses.
      if (Date.now() < nextAllowedUpdateCallTimestamp) return;

      nextAllowedUpdateCallTimestamp = Date.now() + this.config.minUpdateThrottleMs;

      withCancellation(LiveLocationManager.symbol, async () => {
        const promises: Promise<SharedLocationResponseData>[] = [];
        await this.assureStateInit();
        const expiredLocations: string[] = [];

        for (const [messageId, location] of this.messages) {
          // Also drops a location with an absent or non-finite `end_at`.
          if (!canTrackLocation(location)) {
            expiredLocations.push(location.message_id);
            continue;
          }
          if (location.latitude === latitude && location.longitude === longitude)
            continue;
          const promise = this.client.updateLiveLocation({
            message_id: messageId,
            latitude,
            longitude,
          });

          promises.push(promise);
        }
        this.unregisterMessages(expiredLocations);
        if (promises.length > 0) {
          await Promise.allSettled(promises);
        }
        // TODO: handle values (remove failed - based on specific error code), keep re-trying others
      });
    });

    return unsubscribe;
  }

  private subscribeLiveLocationSharingUpdates() {
    // `live_location_sharing.stopped` is dispatched locally once the stop request succeeds: a
    // failsafe for when the channel is no longer watched.
    const subscriptions = [
      ...(
        [
          'live_location_sharing.started',
          'message.updated',
          'message.deleted',
        ] satisfies EventType[]
      ).map((eventType) =>
        this.client.on(eventType, (event) => {
          if (!event.message) return;

          if (event.type === 'live_location_sharing.started') {
            this.registerMessage(event.message);
          } else if (event.type === 'message.updated') {
            const isRegistered = this.messages.has(event.message.id);
            if (isRegistered && !isValidLiveLocationMessage(event.message)) {
              this.unregisterMessages([event.message.id]);
            }
            this.registerMessage(event.message);
          } else {
            this.unregisterMessages([event.message.id]);
          }
        }),
      ),
      this.client.on('live_location_sharing.stopped', (event) => {
        if (!event.live_location) return;

        this.unregisterMessages([event.live_location?.message_id]);
      }),
    ];

    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  /** Arms the stop-sharing timer, in steps past `MAX_TIMEOUT_MS` (~24.9 days). */
  private scheduleStopSharing(
    messageId: MessageId,
    endAt: number,
  ): ReturnType<typeof setTimeout> | null {
    if (!Number.isFinite(endAt)) return null;

    const remaining = msUntilExpiry(endAt);
    if (remaining <= MAX_TIMEOUT_MS) {
      return setTimeout(() => {
        this.unregisterMessages([messageId]);
      }, remaining);
    }

    return setTimeout(() => {
      this.state.next((currentValue) => {
        const current = currentValue.messages.get(messageId);
        if (!current) return currentValue; // unregistered while waiting
        const messages = new Map(currentValue.messages);
        messages.set(messageId, {
          ...current,
          stopSharingTimeout: this.scheduleStopSharing(messageId, endAt),
        });
        return { ...currentValue, messages };
      });
    }, MAX_TIMEOUT_MS);
  }

  private registerMessage(message: MessageResponse) {
    if (
      !this.client.userId ||
      message?.user?.id !== this.client.userId ||
      !isValidLiveLocationMessage(message)
    )
      return;

    this.state.next((currentValue) => {
      const messages = new Map(currentValue.messages);
      messages.set(message.id, {
        ...message.shared_location,
        stopSharingTimeout: this.scheduleStopSharing(
          message.id,
          message.shared_location.end_at,
        ),
      });
      return {
        ...currentValue,
        messages,
      };
    });
  }

  private unregisterMessages(messageIds: string[]) {
    const messages = this.messages;
    const removedMessages = new Set(messageIds);
    const newMessages = new Map(
      Array.from(messages).filter(([messageId, location]) => {
        if (removedMessages.has(messageId) && location.stopSharingTimeout) {
          clearTimeout(location.stopSharingTimeout);
          location.stopSharingTimeout = null;
        }
        return !removedMessages.has(messageId);
      }),
    );

    if (newMessages.size === messages.size) return;

    this.state.partialNext({
      messages: newMessages,
    });
  }
}
