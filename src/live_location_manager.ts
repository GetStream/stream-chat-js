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
import type { MessageResponse, Attachment, EventTypes } from './types';
import type { StreamChat } from './client';
import type { Unsubscribe } from './store';

// type Unsubscribe = () => void;
type WatchLocation = (handler: (value: { latitude: number; longitude: number }) => void) => Unsubscribe;
type LiveLocationManagerState = {
  ready: boolean;
  targetMessages: MessageResponse[];
};

// LLS - live location sharing
function isAttachmentValidLLSEntity(attachment?: Attachment) {
  if (!attachment || typeof attachment.end_time !== 'string' || attachment.stopped_sharing) return false;

  const endTimeTimestamp = new Date(attachment.end_time).getTime();

  if (Number.isNaN(endTimeTimestamp)) return false;

  const nowTimestamp = Date.now();

  return attachment && attachment.type === 'live_location' && endTimeTimestamp > nowTimestamp;
}

class LiveLocationManager {
  private client: StreamChat;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private serializeAndStore: (state: MessageResponse[]) => void;
  private watchLocation: WatchLocation;
  public state: StateStore<LiveLocationManagerState>;
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
    retrieveAndDeserialize,
    watchLocation,
    serializeAndStore,
  }: {
    client: StreamChat;
    retrieveAndDeserialize: (userId: string) => MessageResponse[];
    serializeAndStore: (state: MessageResponse[]) => void;
    watchLocation: WatchLocation;
  }) {
    this.client = client;
    this.state = new StateStore<LiveLocationManagerState>({
      targetMessages: retrieveAndDeserialize(client.userID!),
      ready: false,
    });
    this.watchLocation = watchLocation;
    this.serializeAndStore = serializeAndStore;

    this.messagesByIdGetterCache = {
      targetMessages: this.state.getLatestValue().targetMessages,
      calculated: {},
    };

    this.messagesByChannelConfIdGetterCache = {
      targetMessages: this.state.getLatestValue().targetMessages,
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

  public subscribeWatchLocation() {
    const unsubscribe = this.watchLocation(({ latitude, longitude }) => {
      withCancellation(LiveLocationManager.symbol, async () => {
        const promises: Promise<void>[] = [];

        await this.recoverAndValidateMessages();

        const { targetMessages } = this.state.getLatestValue();

        for (const message of targetMessages) {
          const [attachment] = message.attachments!;

          const promise = this.client
            .partialUpdateMessage(message.id, {
              set: { attachments: [{ ...attachment, latitude, longitude }] },
            })
            // TODO: change this this
            .then((v) => console.log(v));

          promises.push(promise);
        }

        const values = await Promise.allSettled(promises);

        // TODO: handle values (remove failed - based on specific error code), keep re-trying others
      });
    });

    console.log(unsubscribe);

    return unsubscribe;
  }

  private async recoverAndValidateMessages() {
    const { targetMessages } = this.state.getLatestValue();

    if (!this.client.userID) return;

    const messages = await this.client.search(
      { members: { $in: [this.client.userID] } },
      { id: { $in: targetMessages.map((m) => m.id) } },
    );

    this.state.partialNext({ ready: true });
    console.log(messages);

    console.log('to consider...');
  }

  private registerMessage(message: MessageResponse) {
    if (!this.client.userID || message?.user?.id !== this.client.userID) return;

    const [attachment] = message.attachments ?? [];

    const messagesById = this.messagesById;

    // FIXME: get associatedChannelConfIds.indexOf(message.cid)
    if (message.cid && this.messagesByChannelConfId[message.cid]) {
      const [m] = messagesById[message.id];
      throw new Error(
        `[LocationUpdater.registerMessage]: one live location sharing message per channel limit has been reached, unregister message "${m.id}" first`,
      );
    }

    if (!attachment || attachment.type !== 'geolocation' || !attachment.geolocation_eol) {
      throw new Error(
        '[LocationUpdater.registerMessage]: Message has either no attachment, the attachment is not of type "geolocation" or the attachment is missing `geolocation_eol` property',
      );
    }

    if (typeof attachment.geolocation_eol !== 'string') {
      throw new Error(
        '[LocationUpdater.registerMessage]: `geolocation_eol` property is of incorrect type, should be date and time ISO 8601 string',
      );
    }

    const nowTimestamp = Date.now();
    const eolTimestamp = new Date(attachment.geolocation_eol).getTime();

    if (Number.isNaN(eolTimestamp) || eolTimestamp < nowTimestamp) {
      throw new Error(
        '[LocationUpdater.registerMessage]: `geolocation_eol` has either improper format or has not been set to some time in the future (is lesser than now)',
      );
    }

    this.state.next((currentValue) => ({ ...currentValue, targetMessages: [...currentValue.targetMessages, message] }));
  }

  private unregisterMessage(message: MessageResponse) {
    this.state.next((currentValue) => {
      const [, messageIndex] = this.messagesById[message.id];

      if (typeof messageIndex !== 'number') return currentValue;

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

  private subscribeNewMessages() {
    const subscriptions = (['notification.message_new', 'message.new'] as EventTypes[]).map((eventType) =>
      this.client.on(eventType, (event) => {
        // TODO: switch to targeted event based on userId
        if (!event.message) return;

        try {
          this.registerMessage(event.message);
        } catch {
          // do nothing
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

    this.unsubscribeFunctions.add(this.subscribeNewMessages());
    // this.unsubscribeFunctions.add()
    // TODO - handle message registration during message updates too, message updated eol added
    // TODO - handle message unregistration during message updates - message updated, eol removed
    // this.unsubscribeFunctions.add(this.subscribeMessagesUpdated());
  };
}
