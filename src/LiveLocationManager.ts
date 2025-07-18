/**
 * RULES:
 *
 * 1. one loc-sharing message per channel per user
 * 2. mandatory geolocation_eol (maxnow + 24h max), which should be unchangeable by anyone (set once)
 * 3. serialized object must be stored
 * 4. live location is per-device, no other device which did not store the message locally, should be updating the live location attachment
 */

import { withCancellation } from './utils/concurrency';
import { StateStore } from './store';
import { WithSubscriptions } from './utils/WithSubscriptions';
import type { StreamChat } from './client';
import type { Unsubscribe } from './store';
import type {
  EventTypes,
  MessageResponse,
  SharedLiveLocationResponse,
  SharedLocationResponse,
} from './types';
import type { Coords } from './messageComposer';

export type WatchLocationHandler = (value: Coords) => void;

// type Unsubscribe = () => void;
type WatchLocation = (handler: WatchLocationHandler) => Unsubscribe;
type DeviceIdGenerator = () => string;
type MessageId = string;

export type LiveLocationManagerState = {
  ready: boolean;
  messages: Map<MessageId, SharedLiveLocationResponse>;
};

function isValidLiveLocationMessage(
  message?: MessageResponse,
): message is MessageResponse & { shared_location: SharedLiveLocationResponse } {
  if (!message || message.type === 'deleted' || !message.shared_location?.end_at)
    return false;

  const endTimeTimestamp = new Date(message.shared_location.end_at).getTime();

  return Date.now() < endTimeTimestamp;
}

export type LiveLocationManagerConstructorParameters = {
  client: StreamChat;
  getDeviceId: DeviceIdGenerator;
  watchLocation: WatchLocation;
};

// Hard-coded minimal throttle timeout
export const UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT = 3000;

export class LiveLocationManager extends WithSubscriptions {
  public state: StateStore<LiveLocationManagerState>;
  private client: StreamChat;
  private getDeviceId: DeviceIdGenerator;
  private _deviceId: string;
  private watchLocation: WatchLocation;

  static symbol = Symbol(LiveLocationManager.name);

  constructor({
    client,
    getDeviceId,
    watchLocation,
  }: LiveLocationManagerConstructorParameters) {
    if (!client.userID) {
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
  }

  public async init() {
    await this.assureStateInit();
    this.registerSubscriptions();
  }

  public registerSubscriptions = () => {
    this.incrementRefCount();
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(this.subscribeLiveLocationSharingUpdates());
    this.addUnsubscribeFunction(this.subscribeTargetMessagesChange());
  };

  public unregisterSubscriptions = () => super.unregisterSubscriptions();

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
    const { active_live_locations } = await this.client.getSharedLocations();
    this.state.next({
      messages: new Map(
        active_live_locations.map((location) => [location.message_id, location]),
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

      nextAllowedUpdateCallTimestamp =
        Date.now() + UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT;

      withCancellation(LiveLocationManager.symbol, async () => {
        const promises: Promise<SharedLocationResponse>[] = [];
        await this.assureStateInit();

        for (const [messageId, location] of this.messages) {
          if (location.latitude === latitude && location.longitude === longitude)
            continue;
          const promise = this.client.updateLocation({
            created_by_device_id: location.created_by_device_id,
            message_id: messageId,
            latitude,
            longitude,
          });

          promises.push(promise);
        }

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
        ] as EventTypes[]
      ).map((eventType) =>
        this.client.on(eventType, (event) => {
          if (!event.message) return;

          if (event.type === 'live_location_sharing.started') {
            this.registerMessage(event.message);
          } else if (event.type === 'message.updated') {
            const isRegistered = this.messages.has(event.message.id);
            if (isRegistered && !isValidLiveLocationMessage(event.message)) {
              this.unregisterMessage(event.message.id);
            }
            this.registerMessage(event.message);
          } else {
            this.unregisterMessage(event.message.id);
          }
        }),
      ),
      this.client.on('live_location_sharing.stopped', (event) => {
        if (!event.live_location) return;

        this.unregisterMessage(event.live_location?.message_id);
      }),
    ];

    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  private registerMessage(message: MessageResponse) {
    if (
      !this.client.userID ||
      message?.user?.id !== this.client.userID ||
      !isValidLiveLocationMessage(message)
    )
      return;

    this.state.next((currentValue) => {
      const messages = new Map(currentValue.messages);
      messages.set(message.id, message.shared_location);
      return {
        ...currentValue,
        messages,
      };
    });
  }

  private unregisterMessage(messageId: string) {
    const messages = this.messages;
    const newMessages = new Map(messages);
    newMessages.delete(messageId);

    if (newMessages.size === messages.size) return;

    this.state.partialNext({
      messages: newMessages,
    });
  }
}
