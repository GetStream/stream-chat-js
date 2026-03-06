Pinned messages highlight important content in a channel. Use them for announcements, key information, or temporarily promoted content. Each channel can have multiple pinned messages, with optional expiration times.

## Pinning and Unpinning Messages

Pin an existing message using `pinMessage`, or create a pinned message by setting `pinned: true` when sending.

```js
// Create a pinned message
const { message } = await channel.sendMessage({
  text: "Important announcement",
  pinned: true,
  pin_expires: "2077-01-01T00:00:00Z",
});

// Pin an existing message for 120 seconds
await client.pinMessage(message, 120);

// Pin with a specific expiration date
await client.pinMessage(message, "2077-01-01T00:00:00Z");

// Pin indefinitely (remove expiration)
await client.pinMessage(message, null);

// Unpin a message
await client.unpinMessage(message);
```

### Pin Parameters

| Name        | Type    | Description                                                            | Default | Optional |
| ----------- | ------- | ---------------------------------------------------------------------- | ------- | -------- |
| pinned      | boolean | Whether the message is pinned                                          | false   | ✓        |
| pinned_at   | string  | Timestamp when the message was pinned                                  | -       | ✓        |
| pin_expires | string  | Timestamp when the pin expires. Null means the message does not expire | null    | ✓        |
| pinned_by   | object  | The user who pinned the message                                        | -       | ✓        |

> [!NOTE]
> Pinning a message requires the `PinMessage` permission. See [Permission Resources](/chat/docs/node/permissions_reference/) and [Default Permissions](/chat/docs/node/chat_permission_policies/) for details.


## Retrieving Pinned Messages

Query a channel to retrieve the 10 most recent pinned messages from `pinned_messages`.

```js
const channelState = await client.channel("messaging", channelId).query();
const pinnedMessages = channelState.pinned_messages;
```

## Paginating Pinned Messages

Use the dedicated pinned messages endpoint to retrieve all pinned messages with pagination.

```js
// First page, newest first
const page1 = await channel.getPinnedMessages({ limit: 10 }, { pinned_at: -1 });

// Next page
const lastMsg = page1.messages[page1.messages.length - 1];
const page2 = await channel.getPinnedMessages(
  { limit: 10, id_lt: lastMsg.id },
  { pinned_at: -1 },
);

// Oldest first
const ascPage = await channel.getPinnedMessages({ limit: 10 });
const ascLastMsg = ascPage.messages[ascPage.messages.length - 1];
const ascPage2 = await channel.getPinnedMessages({
  limit: 10,
  id_gt: ascLastMsg.id,
});
```
