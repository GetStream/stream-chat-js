All changes to the chat state are exposed as events.
When a new message is sent, a reaction is added, or any other action occurs, the client receives an event in real-time.
You can also send custom events, enabling you to build your own pub/sub functionality on top of a channel.

### Listening for Events

The code sample below shows how to listen to events:

```js
channel.on("message.new", (event) => {
  console.log("received a new message", event.message.text);
});

channel.on("message.deleted", (event) => {
  console.log("message was deleted", event.message.id);
});
```

You can also listen to all events at once:

```js
channel.on((event) => {
  console.log("event", event);
  console.log("channel.state", channel.state);
});
```

### Event Types

There are different type of events

- User level/connection level events. You always receive these events.
- Notification events you receive if you are a member of the channel
- Channel level events you receive if you are watching the channel
- User presence events are sent when you specify presence=true
- Custom events. Your own pub/sub on top of the chat channel.

The example below shows how to watch a channel and enable user presence events.
You can also watch channels and enable user presence when using query channels.
See these links for more details on user presence, watching and query channels.

```js
// Watch a channel with presence enabled to receive user presence events
const channel = client.channel("messaging", "my-conversation-123", {
  members: ["john", "jack"],
});

const state = await channel.watch({ presence: true });

// Listen for user presence changes
channel.on("user.presence.changed", (event) => {
  console.log(
    `${event.user.name} is now ${event.user.online ? "online" : "offline"}`,
  );
});
```

### Connection Events

The official SDKs make sure that a connection to Stream is kept alive at all times and that chat state is recovered when the user's internet connection comes back online. Your application can subscribe to changes to the connection using client events.

```js
client.on("connection.changed", (e) => {
  if (e.online) {
    console.log("the connection is up!");
  } else {
    console.log("the connection is down!");
  }
});
```

### Stop Listening for Events

It is a good practice to unregister event handlers once they are not in use anymore. Doing so will save you from performance degradations coming from memory leaks or even from errors and exceptions (i.e. null pointer exceptions)

```js
// remove the handler from all client events
// const myClientEventListener = client.on('connection.changed', myClientEventHandler)
myClientEventListener.unsubscribe();

// remove the handler from all events on a channel
// const myChannelEventListener = channel.on('connection.changed', myChannelEventHandler)
myChannelEventListener.unsubscribe();
```

### Custom Events

Custom events allow you to build your own pub/sub functionality on top of a channel. You can send any event with custom data and have it delivered to all users watching the channel.

#### To a channel

Users connected to a channel, either as a watcher or member, can send custom events and have them delivered to all users [watching the channel](/chat/docs/node/creating_channels/).

```js
// sends an event for the current user to all connect clients on the channel
await channel.sendEvent({
  type: "friendship_request",
  text: "Hey there, long time no see!",
});

// custom events can also be sent server-side, in that case a user must be included in the event payload
await channel.sendEvent({
  type: "friendship_request",
  text: "Hey there, long time no see!",
  user: user,
});
```

> [!NOTE]
> Custom events are enabled by default on all channel types, you can disable them using the Dashboard or the API the same way as you would manage other channel features (ie. replies, URL previews, ...)


#### Permissions

Like every client-side API request, sending a custom event includes a permission check. By default users that can read messages on a channel can also send custom events. Check the [Auth & Permission](/chat/docs/node/chat_permission_policies/) section to find out more about how permissions can be customized for your application.

> [!NOTE]
> Keep in mind a clever user can send their own custom events. We recommend using the type attribute or custom data on the event to limit the kinds of events that are displayed to the recipient to ones that are safe e.g. if a bad actor sends a "password reset" or other malicious events, your client app should just ignore it.


#### To a user

This allows you to send custom events to a connected user. The event is delivered to all connected clients for that user.

It is only available with server-side authentication. A copy of the event is sent via web-hooks if it is enabled.

```js
await client.sendUserCustomEvent(targetUserID, {
  type: "friendship_request",
  text: "Tommaso wants to be your friend",
});
```

| name         | type   | description       | default | optional |
| ------------ | ------ | ----------------- | ------- | -------- |
| targetUserID | string | target user ID    | -       |          |
| data         | object | event to be sent  | -       |          |
| data.type    | string | type of the event | -       |          |

If the user doesn't exist, a `404 Not Found` error is returned.

The type of the event shouldn't contain any `.` character otherwise a `400 Bad Request` error is returned. This is a character used for built-in events, see the Built-in Events section below for more details.

### Event Object

| name               | type   | description                                                                       | default | optional |
| ------------------ | ------ | --------------------------------------------------------------------------------- | ------- | -------- |
| cid                | string | Channel ID                                                                        |         | ✓        |
| type               | string | Event type                                                                        |         |          |
| message            | object | [Message Object](/chat/docs/node/send_message/#message-response-structure) |         | ✓        |
| reaction           | object | [Reaction Object](/chat/docs/node/send_reaction/)                          |         | ✓        |
| channel            | object | [Channel Object](/chat/docs/node/creating_channels/)                       |         | ✓        |
| member             | object | User object for the channel member that was added/removed                         |         | ✓        |
| user               | object | User object of the current user                                                   |         | ✓        |
| me                 | object | User object of the health check user                                              |         | ✓        |
| total_unread_count | int    | the number of unread messages for current user                                    |         | ✓        |
| watcher_count      | int    | Number of users watching this channel                                             |         | ✓        |

### Built-in Events

The table below shows an overview of all built-in events:

| Event                              | Trigger                                                                                    | Recipients                                                                     | Type                |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------- |
| channel.deleted                    | when a channel is deleted                                                                  | clients watching the channel                                                   | channel event       |
| channel.hidden                     | when a channel is marked as hidden                                                         | clients from the user that marked the channel as hidden (see hiding channels)  | channel event       |
| channel.truncated                  | when a channel's history is truncated                                                      | clients watching the channel                                                   | channel event       |
| channel.updated                    | when a channel is updated                                                                  | clients watching the channel                                                   | channel event       |
| channel.visible                    | when a channel is made visible                                                             | clients from the user that marked the channel as visible (see hiding channels) | channel event       |
| connection.changed                 | when the state of the connection changed                                                   | local event                                                                    | client event        |
| connection.recovered               | when the connection to chat servers is back online                                         | local event                                                                    | client event        |
| health.check                       | every 30 seconds to confirm that the client connection is still alive                      | all clients                                                                    | client event        |
| member.added                       | when a member is added to a channel                                                        | clients watching the channel                                                   | channel event       |
| member.removed                     | when a member is removed from a channel                                                    | clients watching the channel                                                   | channel event       |
| member.updated                     | when a channel member is updated (promoted to moderator/accepted/rejected the invite)      | clients watching the channel                                                   | channel event       |
| message.deleted                    | when a message is deleted                                                                  | clients watching the channel                                                   | channel event       |
| message.new                        | when a new message is added on a channel                                                   | clients watching the channel                                                   | channel event       |
| message.read                       | when a channel is marked as read                                                           | clients watching the channel                                                   | channel event       |
| message.updated                    | when a message is updated                                                                  | clients watching the channel                                                   | channel event       |
| notification.added_to_channel      | when the user is added to the list of channel members                                      | clients from the user added that are not watching the channel                  | notification event  |
| notification.channel_deleted       | when a channel is deleted                                                                  | clients from members that are not watching the channel                         | notification event  |
| notification.channel_mutes_updated | when a channel is muted                                                                    | clients from the user that muted the channel                                   | notification event  |
| notification.channel_truncated     | when a channel's history is truncated                                                      | clients from members that are not watching the channel                         | notification event  |
| notification.invite_accepted       | when the user accepts an invite                                                            | clients from the user invited that are not watching the channel                | notification event  |
| notification.invite_rejected       | when the user rejects an invite                                                            | clients from the user invited that are not watching the channel                | notification event  |
| notification.invited               | when the user is invited to join a channel                                                 | clients from the user invited that are not watching the channel                | notification event  |
| notification.mark_read             | when the total count of unread messages (across all channels the user is a member) changes | clients from the user with the new unread count                                | notification event  |
| notification.mark_unread           | when the user marks a message as unread                                                    | clients from the user with the new unread count                                | notification event  |
| notification.message_new           | when a message is added to a channel                                                       | clients that are not currently watching the channel                            | notification event  |
| notification.mutes_updated         | when the user mutes are updated                                                            | clients from the user that updated the list of mutes                           | notification event  |
| notification.removed_from_channel  | when a user is removed from the list of channel members                                    | clients from the user removed that are not watching the channel                | notification event  |
| reaction.deleted                   | when a message reaction is deleted                                                         | clients watching the channel                                                   | channel event       |
| reaction.new                       | when a message reaction is added                                                           | clients watching the channel                                                   | channel event       |
| reaction.updated                   | when a message reaction is updated                                                         | clients watching the channel                                                   | channel event       |
| typing.start                       | when a user starts typing                                                                  | clients watching the channel                                                   | channel event       |
| typing.stop                        | when a user stops typing                                                                   | clients watching the channel                                                   | channel event       |
| user.banned                        | when the user is banned                                                                    | clients for the banned user                                                    | client event        |
| user.deleted                       | when a user is deleted                                                                     | clients subscribed to the user status                                          | user presence event |
| user.messages.deleted              | when the user's messages are deleted                                                       | clients for the banned user                                                    | client event        |
| user.messages.deleted              | when the user's messages are deleted                                                       | clients watching the channel where the user was banned                         | channel event       |
| user.presence.changed              | when a user status changes (eg. online, offline, away, etc.)                               | clients subscribed to the user status                                          | user presence event |
| user.unbanned                      | when the user ban is lifted                                                                | clients for the banned user                                                    | client event        |
| user.updated                       | when a user is updated                                                                     | clients subscribed to the user status                                          | user presence event |
| user.watching.start                | when a user starts watching a channel                                                      | clients watching the channel                                                   | channel event       |
| user.watching.stop                 | when a user stops watching a channel                                                       | clients watching the channel                                                   | channel event       |
