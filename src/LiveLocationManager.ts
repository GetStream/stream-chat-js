/**
 * RULES:
 *
 * 1. one loc-sharing message per channel per user
 * 2. live location is intended to be per device, but `created_by_device_id` is set once
 * when the share is created and cannot be reassigned — `UpdateLiveLocationRequest` has no
 * device field at all, by design. Any of the user's devices can therefore push coordinate
 * updates to the same share, which makes location sharing effectively per user and
 * channel rather than per device.
 */

import { withCancellation } from './utils/concurrency';
import { nowNs, nsToMs } from './utils/time';
import { deepFreezeConfig } from './configuration/utils/deepFreezeConfig';
import { StateStore } from './store';
import { ConfigController } from './configuration/ConfigController';
import { applyInstanceConfiguration } from './configuration/utils/applyInstanceConfiguration';
import { WithSubscriptions } from './utils/WithSubscriptions';
import type { StreamChat } from './client';
import type { Unsubscribe } from './store';
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

const isExpiredLocation = (location: SharedLiveLocationResponse) =>
  location.end_at < nowNs();

/**
 * Milliseconds from now until a live location stops sharing, for `setTimeout`. Never negative.
 * `end_at` is a wire timestamp, so the subtraction happens in nanoseconds and is converted once.
 */
const msUntilExpiry = (endAt: number) => Math.max(0, nsToMs(endAt - nowNs()));

function isValidLiveLocationMessage(
  message?: MessageResponse,
): message is MessageResponse & { shared_location: SharedLiveLocationResponse } {
  if (!message || message.type === 'deleted' || message.shared_location?.end_at == null)
    return false;

  return !isExpiredLocation(message.shared_location as SharedLiveLocationResponse);
}

export type LiveLocationManagerConstructorParameters = {
  client: StreamChat;
  getDeviceId: DeviceIdGenerator;
  watchLocation: WatchLocation;
};

// Hard-coded minimal throttle timeout
export const UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT = 3000;

export type LiveLocationManagerConfig = {
  /**
   * Shortest gap between live-location update requests (defaults to 3000ms).
   *
   * A failsafe against rate limiting, not a protocol limit: integrators already control the update
   * cadence through a custom `watchLocation`, and this floor stops a chatty one from flooding the API.
   * Raising it is always safe; lowering it risks 429s, so only do so against a known quota.
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

  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<LiveLocationManagerConfig>;
  /** Teardown for this manager's configuration subscription, released by {@link dispose}. */
  private unsubscribeConfiguration?: Unsubscribe;

  /**
   * Resolved configuration, as a store — the shape every configurable class exposes
   * (`configState` / `config` / `updateConfig`).
   */
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

    // Last statement of the constructor, so a setup function sees a whole object. Registered here rather
    // than only in `registerSubscriptions` — this manager is constructed by whoever needs it and `init()`
    // is async, so gating configuration on registration would leave a window where a registered value did
    // not apply.
    this.subscribeConfiguration();
  }

  /**
   * Subscribes this instance to the `'liveLocationManager'` configuration key, if it is not subscribed
   * already. Idempotent, which is what lets both the constructor and {@link registerSubscriptions} call
   * it: the first gives a value registered before `init()` resolves somewhere to land, the second brings
   * a manager back after {@link dispose}.
   */
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

  /** The current resolved configuration. `Readonly` — change it through {@link updateConfig}. */
  get config(): Readonly<LiveLocationManagerConfig> {
    return this.configState.getLatestValue();
  }

  /** Merges a partial configuration into the resolved config and notifies subscribers. */
  updateConfig(config: Partial<LiveLocationManagerConfig>) {
    this.configController.patch(config);
  }

  /** Rebuilds the resolved configuration from package defaults plus the declarative slice. */
  initializeConfig(config?: Partial<LiveLocationManagerConfig>) {
    this.configController.initialize(config);
  }

  public async init() {
    await this.assureStateInit();
    this.registerSubscriptions();
  }

  public registerSubscriptions = () => {
    this.incrementRefCount();
    // Restores configuration after a {@link dispose}, so a manager that is torn down and then used again
    // is configurable again — React StrictMode's mount/cleanup/mount runs exactly that sequence against
    // one instance. A no-op in the ordinary case: the constructor already subscribed.
    this.subscribeConfiguration();

    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(this.subscribeLiveLocationSharingUpdates());
    this.addUnsubscribeFunction(this.subscribeTargetMessagesChange());
  };

  /**
   * Ref-counted, and deliberately does **not** touch the configuration subscription: several callers can
   * share one manager, so an early caller leaving must not take anything the remaining ones still need.
   * Use {@link dispose} for the instance-level teardown.
   */
  public unregisterSubscriptions = () => super.unregisterSubscriptions();

  /**
   * Releases the configuration subscription, running the `'liveLocationManager'` setup function's
   * teardown. Call it when you are finished with the manager.
   *
   * Separate from {@link unregisterSubscriptions} because the two have different lifetimes. Event
   * subscriptions are shared and ref-counted; configuration is registered once, by the constructor, for
   * the life of the instance. Releasing it from the ref-counted call meant the first of two callers to
   * leave silently stopped a still-live manager from tracking `client.config` — permanently, since
   * nothing but the constructor registers it. Mirrors `SearchController.dispose` and the configuration
   * half of `Channel._disconnect`.
   *
   * Until this is called, the client's configuration registry holds a handle to this manager, so a
   * long-lived client and many short-lived managers need it to be called.
   *
   * Recoverable: a later {@link registerSubscriptions} re-subscribes, so disposing a manager that is
   * then reused costs a re-run of the setup function rather than silence.
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
        (active_live_locations as SharedLiveLocationResponse[])
          .filter((location) => !isExpiredLocation(location))
          .map((location) => [
            location.message_id,
            {
              ...location,
              stopSharingTimeout: setTimeout(() => {
                this.unregisterMessages([location.message_id]);
              }, msUntilExpiry(location.end_at)),
            },
          ]),
      ),
      ready: true,
    });
  }

  private subscribeTargetMessagesChange() {
    let unsubscribeWatchLocation: null | (() => void) = null;

    // Subscribe to location updates only if there are relevant messages to
    // update, no need for the location watcher to be active/instantiated otherwise
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
      // Integrators can adjust the update interval by supplying custom watchLocation subscription,
      // but the minimal timeout still has to be set as a failsafe (to prevent rate-limitting)
      if (Date.now() < nextAllowedUpdateCallTimestamp) return;

      nextAllowedUpdateCallTimestamp = Date.now() + this.config.minUpdateThrottleMs;

      withCancellation(LiveLocationManager.symbol, async () => {
        const promises: Promise<SharedLocationResponseData>[] = [];
        await this.assureStateInit();
        const expiredLocations: string[] = [];

        for (const [messageId, location] of this.messages) {
          if (isExpiredLocation(location)) {
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
    /**
     * Both message.updated & live_location_sharing.stopped get emitted when message gets an
     * update, live_location_sharing.stopped gets emitted only locally and only if the update goes
     * through, it's a failsafe for when channel is no longer being watched for whatever reason
     */
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
        stopSharingTimeout: setTimeout(() => {
          this.unregisterMessages([message.id]);
        }, msUntilExpiry(message.shared_location.end_at)),
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
