User presence allows you to show when a user was last active and if they are online right now. This feature can be enabled or disabled per channel type in the [channel type settings](/chat/docs/node/channel_features/).

## Listening to Presence Changes

To receive presence updates, you need to watch a channel or query channels with `presence: true`. This allows you to show a user as offline when they leave and update their status in real time.

```js
// If you pass presence: true to channel.watch it will watch the list of user presence changes.
// Note that you can listen to at most 10 users using this API call
const channel = client.channel("messaging", "my-conversation-123", {
  members: ["john", "jack"],
  color: "green",
});

const state = await channel.watch({ presence: true });

// queryChannels allows you to listen to the members of the channels that are returned
// so this does the same thing as above and listens to online status changes for john and jack
const channels = await client.queryChannels(
  { color: "green" },
  { last_message_at: -1 },
  { presence: true },
);
```

A users online status change can be handled via event delegation by subscribing to the `user.presence.changed` event the same you do for any other event.

## Presence Data Format

Whenever you read a user the presence data will look like this:

```js
{
  id: 'unique_user_id',
  online: true,
  status: 'Eating a veggie burger...',
  last_active: '2019-01-07T13:17:42.375Z'
}
```

> [!NOTE]
> The online field indicates if the user is online. The status field stores text indicating the current user status.


> [!NOTE]
> The last_active field is updated when a user connects and then refreshed every 15 minutes.


## Invisible

To mark your user as invisible, you can update your user to set the invisible property to _true_. Your user will remain invisible even if you disconnect and reconnect. You must explicitly set invisible to _false_ in order to become visible again.

```js
// become invisible
await client.upsertUser({
  id: "unique_user_id",
  invisible: true,
});

// become visible
await client.upsertUser({
  id: "unique_user_id",
  invisible: false,
});
```

You can also set your user to invisible when connecting by setting the invisible property to _true_. You can also set a custom status message at the same time:

```js
// mark a user as invisible
await client.connectUser({
  id: "unique_user_id",
  invisible: true,
});
```

> [!NOTE]
> When invisible is set to _true,_ the current user will appear as offline to other users.
