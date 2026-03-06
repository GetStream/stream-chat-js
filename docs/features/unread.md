The following unread counts are provided by Stream

- A total count of unread messages
- Number of unread channels
- A count of unread threads
- Unread @mentions
- Unread messages per channel
- Unread @mentions per channel
- Unread counts by team
- Unread counts by channel type

Unread counts are first fetched when a user connects.
After that they are updated by events. (new message, mark read, delete message, delete channel etc.)

### Reading Unread Counts

Unread counts are returned when a user connects. After that, you can listen to events to keep them updated in real-time.

```js
// Step 1: Get initial unread counts when connecting
const user = await client.connectUser({ id: "myid" }, token);

console.log(user.me.total_unread_count); // total unread messages
console.log(user.me.unread_channels); // number of channels with unread messages
console.log(user.me.unread_threads); // number of unread threads

// Step 2: Listen to events for real-time updates
client.on((event) => {
  if (event.total_unread_count !== undefined) {
    console.log(event.total_unread_count);
  }

  if (event.unread_channels !== undefined) {
    console.log(event.unread_channels);
  }
});
```

Note that the higher level SDKs offer convenient endpoints for this. Hooks on react, stateflow on Android etc.
So you only need to use the events manually if you're using plain JS.

### Unread Counts - Server side

The unread endpoint can fetch unread counts server-side, eliminating the need for a client-side connection. It can also be used client-side without requiring a persistent connection to the chat service. This can be useful for including an unread count in notifications or for gently polling when a user loads the application to keep the client up to date without loading up the entire chat.

> [!NOTE]
> A user_id whose unread count is fetched through this method is automatically counted as a Monthly Active User. This may affect your bill.


```js
const response = await client.getUnreadCount(userID);
console.log(response.total_unread_count); // total unread count for user
console.log(response.channels); // distribution of unread counts across channels
console.log(response.channel_type); // distribution of unread counts across channel types
console.log(response.total_unread_threads_count); // total unread threads
console.log(response.threads); // list of unread counts per thread
```

> [!NOTE]
> This endpoint will return the last 100 unread channels, they are sorted by last_message_at.


#### Batch Fetch Unread

The batch unread endpoint works the same way as the non-batch version with the exception that it can handle multiple user IDs at once and that it is restricted to server-side only.

```js
const response = await client.getUnreadCountBatch([userID1, userID2]);
console.log(response.counts_by_user[userID1].total_unread_count); // total unread count for userID1
console.log(response.counts_by_user[userID1].channels); // distribution of unread counts across channels for userID1
console.log(response.counts_by_user[userID1].channel_type); // distribution of unread counts across channel types for userID1
console.log(response.counts_by_user[userID1].total_unread_threads_count); // total unread threads count for userID1
console.log(response.counts_by_user[userID1].threads); // list of unread counts per thread for userID1
```

> [!NOTE]
> If a user ID is not returned in the response then the API couldn't find a user with that ID


### Mark Read

By default the UI component SDKs (React, React Native, ...) mark messages as read automatically when the channel is visible. You can also make the call manually like this:

```js
// mark all messages on a channel as read
await channel.markRead();
```

The `markRead` function can also be executed server-side by passing a user ID as shown in the example below:

```js
// mark all messages on a channel as read (server side)
await channel.markRead({ user_id: "foo" });
```

It's also possible to mark an already read message as unread:

```js
await channel.markUnread({ message_id: "<message_id>" });
```

The mark unread operation can also be executed server-side by passing a user ID:

```js
await channel.markUnread({ message_id: "<message_id>", user_id: "<user_id>" });
```

#### Mark All As Read

You can mark all channels as read for a user like this:

```js
// client-side
await client.markAllRead();

// mark all as read for one user server-side
await serverSideClient.markAllRead({ user: { id: "myid" } });
```

## Read State - Showing how far other users have read

When you retrieve a channel from the API (e.g. using query channels), the read state for all members is included in the response. This allows you to display which messages are read by each user. For each member, we include the last time they marked the channel as read.

```js
const channel = client.channel("messaging", "test");
await channel.watch();

console.log(channel.state.read);

//{ '2fe6019c-872f-482a-989e-ecf4f786501b':
// { user:
//  {
//   id: '2fe6019c-872f-482a-989e-ecf4f786501b',
//   role: 'user',
//   created_at: '2019-04-24T13:09:19.664378Z',
//   updated_at: '2019-04-24T13:09:23.784642Z',
//   last_active: '2019-04-24T13:09:23.781641Z',
//   online: true
//  },
//  last_read: '2019-04-24T13:09:21.623Z',
// }
//}
```

### Unread Messages Per Channel

You can retrieve the count of unread messages for the current user on a channel like this:

```js
channel.countUnread();
```

### Unread Mentions Per Channel

You can retrieve the count of unread messages mentioning the current user on a channel like this:

```js
channel.countUnreadMentions();
```
