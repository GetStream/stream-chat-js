/**
 * RULES:
 *
 * 1. one loc-sharing message per channel per user
 * 2. mandatory geolocation_eol (maxnow + 24h max), which should be unchangeable by anyone (set once)
 * 3. serialized object must be stored
 * 4. live location is per-device, no other device which did not store the message locally, should be updating the live location attachment
 */

import { withCancellation } from './concurrency';
import { StateStore } from './store';
import type { MessageResponse, Attachment, EventTypes, ExtendableGenerics } from './types';
import type { StreamChat } from './client';
import type { Unsubscribe } from './store';

// type Unsubscribe = () => void;
type WatchLocation = (handler: (value: { latitude: number; longitude: number }) => void) => Unsubscribe;
type SerializeAndStore = (state: MessageResponse[], userId: string) => void;
type RetrieveAndDeserialize = (userId: string) => MessageResponse[];

export type LiveLocationManagerState = {
  ready: boolean;
  targetMessages: MessageResponse[];
};

// if (message.cid && this.messagesByChannelConfId[message.cid]) {
//   const [m] = this.messagesByChannelConfId[message.cid];
//   throw new Error(
//     `[LocationUpdater.registerMessage]: one live location sharing message per channel limit has been reached, unregister message "${m.id}" first`,
//   );
// }

// if (!attachment || attachment.type !== 'geolocation' || !attachment.geolocation_eol) {
//   throw new Error(
//     '[LocationUpdater.registerMessage]: Message has either no attachment, the attachment is not of type "geolocation" or the attachment is missing `geolocation_eol` property',
//   );
// }

// if (typeof attachment.geolocation_eol !== 'string') {
//   throw new Error(
//     '[LocationUpdater.registerMessage]: `geolocation_eol` property is of incorrect type, should be date and time ISO 8601 string',
//   );
// }

// const nowTimestamp = Date.now();
// const eolTimestamp = new Date(attachment.geolocation_eol).getTime();

// if (Number.isNaN(eolTimestamp) || eolTimestamp < nowTimestamp) {
//   throw new Error(
//     '[LocationUpdater.registerMessage]: `geolocation_eol` has either improper format or has not been set to some time in the future (is lesser than now)',
//   );
// }

// private async getCompleteMessage(messageId: string) {
//   const [cachedMessage, cachedMessageIndex] = this.messagesById[messageId] ?? [];

//   const [cachedMessageAttachment] = cachedMessage?.attachments ?? [];

//   if (isAttachmentValidLLSEntity(cachedMessageAttachment)) {
//     return cachedMessage;
//   }

//   const queriedMessage = (await this.client.getMessage(messageId)).message;

//   const [queriedMessageAttachment] = queriedMessage.attachments ?? [];

//   if (isAttachmentValidLLSEntity(queriedMessageAttachment)) {
//     this.state.next((currentValue) => {
//       const newTargetMessages = [...currentValue.targetMessages];

//       if (typeof cachedMessageIndex === 'number') {
//         newTargetMessages[cachedMessageIndex] = queriedMessage;
//       } else {
//         newTargetMessages.push(queriedMessage);
//       }

//       return {
//         ...currentValue,
//         targetMessages: newTargetMessages,
//       };
//     });

//     return queriedMessage;
//   }

//   return null;
// }

function isValidLiveLocationAttachment(attachment?: Attachment) {
  if (!attachment || typeof attachment.end_time !== 'string' || attachment.stopped_sharing) return false;

  const endTimeTimestamp = new Date(attachment.end_time).getTime();

  if (Number.isNaN(endTimeTimestamp)) return false;

  const nowTimestamp = Date.now();

  return attachment && attachment.type === 'live_location' && endTimeTimestamp > nowTimestamp;
}

export type LiveLocationManagerConstructorParameters<SCG extends ExtendableGenerics> = {
  client: StreamChat<SCG>;
  watchLocation: WatchLocation;
  retrieveAndDeserialize?: RetrieveAndDeserialize;
  serializeAndStore?: SerializeAndStore;
};

const MIN_THROTTLE_TIMEOUT = 1000;

export class LiveLocationManager<SCG extends ExtendableGenerics> {
  public state: StateStore<LiveLocationManagerState>;
  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private serializeAndStore: SerializeAndStore;
  private watchLocation: WatchLocation;
  private messagesByChannelConfIdGetterCache: {
    calculated: { [key: string]: [MessageResponse, number] };
    targetMessages: LiveLocationManagerState['targetMessages'];
  };
  private messagesByIdGetterCache: {
    calculated: { [key: string]: [MessageResponse, number] };
    targetMessages: LiveLocationManagerState['targetMessages'];
  };

  static symbol = Symbol(LiveLocationManager.name);

  constructor({
    client,
    watchLocation,
    retrieveAndDeserialize = (userId) => {
      const targetMessagesString = localStorage.getItem(`${userId}-${LiveLocationManager.name}`);
      if (!targetMessagesString) return [];
      return JSON.parse(targetMessagesString);
    },
    serializeAndStore = (messages, userId) => {
      localStorage.setItem(
        `${userId}-${LiveLocationManager.name}`,
        // Strip sensitive data (these will be recovered at on first location watch call)
        JSON.stringify(messages.map((message) => ({ id: message.id }))),
      );
    },
  }: LiveLocationManagerConstructorParameters<SCG>) {
    this.client = client;

    const retreivedTargetMessages = retrieveAndDeserialize(client.userID!);

    this.state = new StateStore<LiveLocationManagerState>({
      targetMessages: retreivedTargetMessages,
      // If there are no messages to validate, the manager is considered "ready"
      ready: retreivedTargetMessages.length === 0,
    });
    this.watchLocation = watchLocation;
    this.serializeAndStore = serializeAndStore;

    this.messagesByIdGetterCache = {
      targetMessages: retreivedTargetMessages,
      calculated: {},
    };

    this.messagesByChannelConfIdGetterCache = {
      targetMessages: retreivedTargetMessages,
      calculated: {},
    };
  }

  public get messagesById() {
    const { targetMessages } = this.state.getLatestValue();

    if (this.messagesByIdGetterCache.targetMessages !== targetMessages) {
      this.messagesByIdGetterCache.targetMessages = targetMessages;

      this.messagesByIdGetterCache.calculated = targetMessages.reduce<{ [key: string]: [MessageResponse, number] }>(
        (messagesById, message, index) => {
          messagesById[message.id] = [message, index];
          return messagesById;
        },
        {},
      );
    }

    return this.messagesByIdGetterCache.calculated;
  }

  public get messagesByChannelConfId() {
    const { targetMessages } = this.state.getLatestValue();

    if (this.messagesByChannelConfIdGetterCache.targetMessages !== targetMessages) {
      this.messagesByChannelConfIdGetterCache.targetMessages = targetMessages;

      this.messagesByChannelConfIdGetterCache.calculated = targetMessages.reduce<{
        [key: string]: [MessageResponse, number];
      }>((messagesByChannelConfIds, message, index) => {
        if (!message.cid) return messagesByChannelConfIds;

        messagesByChannelConfIds[message.cid] = [message, index];
        return messagesByChannelConfIds;
      }, {});
    }

    return this.messagesByChannelConfIdGetterCache.calculated;
  }

  private subscribeTargetMessagesChange() {
    let unsubscribeWatchLocation: null | (() => void) = null;

    // Subscribe to location updates only if there are relevant messages to
    // update, no need for the location watcher to active/instantiated otherwise
    const unsubscribe = this.state.subscribeWithSelector(
      ({ targetMessages }) => ({ targetMessages }),
      ({ targetMessages }) => {
        if (!targetMessages.length) {
          unsubscribeWatchLocation?.();
          unsubscribeWatchLocation = null;
        } else if (targetMessages.length && !unsubscribeWatchLocation) {
          unsubscribeWatchLocation = this.subscribeWatchLocation();
        }

        if (this.client.userID) {
          this.serializeAndStore(this.state.getLatestValue().targetMessages, this.client.userID);
        }
      },
    );

    return () => {
      unsubscribe();
      unsubscribeWatchLocation?.();
    };
  }

  private subscribeWatchLocation() {
    let nextWatcherCallTimestamp = Date.now();

    // eslint-disable-next-line sonarjs/prefer-immediate-return
    const unsubscribe = this.watchLocation(({ latitude, longitude }) => {
      // Integrators can adjust the update interval by supplying custom watchLocation subscription,
      // but the minimal timeout still has to be set as a failsafe (to prevent rate-limitting)
      if (Date.now() < nextWatcherCallTimestamp) return;

      nextWatcherCallTimestamp = Date.now() + MIN_THROTTLE_TIMEOUT;

      withCancellation(LiveLocationManager.symbol, async () => {
        const promises: Promise<void>[] = [];
        const { ready } = this.state.getLatestValue();

        if (!ready) {
          await this.recoverAndValidateMessages();
        }

        const { targetMessages } = this.state.getLatestValue();
        // if validator removes messages, we need to check
        if (!targetMessages.length) return;

        for (const message of targetMessages) {
          const [attachment] = message.attachments ?? [];

          if (!isValidLiveLocationAttachment(attachment)) {
            this.unregisterMessage(message);
            continue;
          }

          // TODO: client.updateLiveLocation instead
          const promise = this.client
            .partialUpdateMessage(message.id, {
              // @ts-expect-error valid update
              set: { attachments: [{ ...attachment, latitude, longitude }] },
            })
            // TODO: change this this
            .then((v) => console.log(v));

          promises.push(promise);
        }

        const values = await Promise.allSettled(promises);
        console.log(values);
        // TODO: handle values (remove failed - based on specific error code), keep re-trying others
      });
    });

    return unsubscribe;
  }

  /**
   * Messages stored locally might've been updated while the device which registered message for updates has been offline.
   */
  private async recoverAndValidateMessages() {
    const { targetMessages } = this.state.getLatestValue();

    if (!this.client.userID || !targetMessages.length) return;

    const response = await this.client.search(
      // @ts-expect-error valid filter
      { members: { $in: [this.client.userID] } },
      { id: { $in: targetMessages.map(({ id }) => id) } },
    );

    const newTargetMessages = [];

    for (const result of response.results) {
      const { message } = result;

      const [attachment] = message.attachments ?? [];

      if (isValidLiveLocationAttachment(attachment)) {
        newTargetMessages.push(message);
      }
    }

    this.state.partialNext({ ready: true, targetMessages: newTargetMessages });
  }

  private registerMessage(message: MessageResponse) {
    if (!this.client.userID || message?.user?.id !== this.client.userID) return;

    const [attachment] = message.attachments ?? [];

    if (!isValidLiveLocationAttachment(attachment)) {
      return;
    }

    this.state.next((currentValue) => ({ ...currentValue, targetMessages: [...currentValue.targetMessages, message] }));
  }

  private updateRegisteredMessage(message: MessageResponse) {
    if (!this.client.userID || message?.user?.id !== this.client.userID) return;

    const [, targetMessageIndex] = this.messagesById[message.id];

    this.state.next((currentValue) => {
      const newTargetMessages = [...currentValue.targetMessages];

      newTargetMessages[targetMessageIndex] = message;

      return {
        ...currentValue,
        targetMessages: newTargetMessages,
      };
    });
  }

  private unregisterMessage(message: MessageResponse) {
    const [, messageIndex] = this.messagesById[message.id] ?? [];

    if (typeof messageIndex !== 'number') return;

    this.state.next((currentValue) => {
      const newTargetMessages = [...currentValue.targetMessages];

      newTargetMessages.splice(messageIndex, 1);

      return {
        ...currentValue,
        targetMessages: newTargetMessages,
      };
    });
  }

  public unregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    this.unsubscribeFunctions.clear();
  };

  private subscribeLiveLocationSharingUpdates() {
    const subscriptions = ([
      'live_location_sharing.started',
      /**
       * Both message.updated & live_location_sharing.stopped get emitted when message attachment gets an
       * update, live_location_sharing.stopped gets emitted only locally and only if the update goes
       * through, it's a failsafe for when channel is no longer being watched for whatever reason
       */
      'message.updated',
      'live_location_sharing.stopped',
      'message.deleted',
    ] as EventTypes[]).map((eventType) =>
      this.client.on(eventType, (event) => {
        if (!event.message) return;

        if (event.type === 'live_location_sharing.started') {
          this.registerMessage(event.message);
        } else if (event.type === 'message.updated') {
          const localMessage = this.messagesById[event.message.id];

          if (!localMessage) return;

          const [attachment] = event.message.attachments ?? [];

          if (!isValidLiveLocationAttachment(attachment)) {
            this.unregisterMessage(event.message);
          } else {
            this.updateRegisteredMessage(event.message);
          }
        } else {
          this.unregisterMessage(event.message);
        }
      }),
    );

    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // LocationUpdater is already listening for events and changes
      return;
    }

    this.unsubscribeFunctions.add(this.subscribeLiveLocationSharingUpdates());
    this.unsubscribeFunctions.add(this.subscribeTargetMessagesChange());
    // TODO? - handle message registration during message updates too, message updated eol added (I hope not)
  };
}
