Muting a channel prevents it from triggering push notifications, unhiding, or incrementing the unread count for that user.

By default, mutes remain active indefinitely until removed. You can optionally set an expiration time. The list of muted channels and their expiration times is returned when the user connects.

## Mute a Channel

```js
const reply = await client.connectUser(user, token);

// reply.me.channel_mutes contains the list of channel mutes
console.log(reply.me.channel_mutes);

const channel = client.channel("messaging", "channel-id");

// mute channel for current user
await channel.mute();

// mute channel for a user (server-side)
await channel.mute({ user_id: userId });

// mute a channel for 2 weeks
await channel.mute({ expiration: moment.duration(2, "weeks") });

// mute a channel for 10 seconds
await channel.mute({ expiration: 10000 });

// check if channel is muted
// { muted: true | false, createdAt: Date | null, expiresAt: Date | null}
channel.muteStatus();
```

> [!NOTE]
> Messages added to muted channels do not increase the unread messages count.


### Query Muted Channels

Muted channels can be filtered or excluded by using the `muted` in your query channels filter.

```js
// retrieve all channels excluding muted ones
await client.queryChannels({ members: { $in: [userId] }, muted: false });

// retrieve all muted channels
await client.queryChannels({ muted: true });
```

### Remove a Channel Mute

Use the unmute method to restore normal notifications and unread behavior for a channel.

```js
// unmute channel for current user
await channel.unmute();

// unmute channel for a user (server-side)
await channel.unmute({ user_id: userId });
```
