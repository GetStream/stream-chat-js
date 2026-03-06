Messages go through multiple states reflecting recipient interaction:

- **Sent** - The message reached the Stream server. Confirmed via the `message.new` WebSocket event.
- **Delivered** - The recipient's device confirmed delivery. Confirmed via the `message.delivered` WebSocket event. Disabled by default.
- **Read** - The recipient marked the channel as read. Confirmed via the `message.read` WebSocket event.

For marking channels as read/unread and retrieving unread counts, see [Unread Counts](/chat/docs/node/unread/).

## Delivery Receipts

Delivery receipts track when messages are delivered to recipient devices.

> [!NOTE]
> Contact support to enable message delivery tracking for your app.


> [!WARNING]
> The Android SDK requires the [offline plugin](/chat/docs/sdk/android/client/guides/offline-support/) for delivery receipts to function correctly.


### Enabling Delivery Receipts

#### Channel Type Configuration

Enable delivery tracking for all channels of a type.

```js
// When creating a channel type
await client.createChannelType("targetChannelType", { delivery_events: true });

// When updating an existing channel type
await client.updateChannelType("targetChannelType", { delivery_events: true });
```

You can also enable this in the Dashboard under channel type configuration.

#### User Privacy Settings

Control whether a user's delivery status is shared with others.

```js
await client.upsertUser({
  id: "user-id",
  privacy_settings: {
    delivery_receipts: {
      enabled: false, // Do not report delivery status
    },
  },
});
```

When `privacy_settings.delivery_receipts.enabled` is `false`, the user's delivery status is not exposed to others, and the `message.delivered` event is not sent when this user confirms delivery.

### Automatic Delivery Confirmation

The SDK automatically handles delivery confirmation, including request throttling and duplicate prevention.

> [!NOTE]
> Delivery tracking is currently supported for channel messages only, not thread replies.


### Delivery Events

The `message.delivered` event is triggered when a message is delivered to a recipient's device. The event includes:

- `last_delivered_at` - Timestamp when messages were last confirmed as delivered
- `last_delivered_message_id` - ID of the last message confirmed as delivered

## Read Receipts

Read receipts track when users have read messages in a channel.

### Enabling Read Receipts

#### Channel Type Configuration

Enable read tracking for all channels of a type.

```js
// When creating a channel type
await client.createChannelType("targetChannelType", { read_events: true });

// When updating an existing channel type
await client.updateChannelType("targetChannelType", { read_events: true });
```

You can also enable this in the Dashboard under channel type configuration.

#### User Privacy Settings

Control whether a user's read status is shared with others.

```js
await client.upsertUser({
  id: "user-id",
  privacy_settings: {
    read_receipts: {
      enabled: false, // Do not report read status
    },
  },
});
```

When `privacy_settings.read_receipts.enabled` is `false`, the user's read state is not exposed to others, and `message.read` and `notification.mark_read` events are not sent when this user reads messages.

### Read Events

The following events are triggered for read status:

- `message.read` - When any channel member marks the channel as read
- `notification.mark_read` - When the connected user marks a channel as read
- `notification.mark_unread` - When the connected user marks a message as unread

For handling these events and updating unread counts, see [Unread Counts](/chat/docs/node/unread/).

## Push Notification Delivery Confirmation

By default, when a push notification is received while the app is inactive, the message is not marked as delivered. To mark messages as delivered from push notifications, customize your push notification handling.

- [iOS Custom Push Notifications](/chat/docs/sdk/ios/client/push-notifications/#customising-remote-push-notifications)
- [Android Custom Push Notifications](/chat/docs/sdk/android/client/guides/push-notifications/#customizing-push-notifications)
