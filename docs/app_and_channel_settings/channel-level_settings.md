In most cases, you define your channel settings and features at the [Channel Type](/chat/docs/node/channel_features/) level and then have these inherited by all the channels of the same type. For instance you can configure [Livestream](/chat/docs/node/channel_features/) channels without typing events and enable reactions and replies for all [Messaging](/chat/docs/node/channel_features/) type channels.

This approach does not work well if your application has many different combination of settings for channels and that is when channel-level settings can be useful.

Channel-level settings allow you to override one or more settings for a channel without changing other channels of the same type. A few important things to mention about channel-level settings:

1. Settings that are not overridden at channel level will use the current setting from the channel type

2. Changing channel-level settings can only be done server-side

### List of settings that can be overridden

Not all channel type settings can be configured at the channel level, here is the complete list of settings that can be overridden.

- **typing_events** : Controls if typing indicators are shown.

- **reactions** : Controls if users are allowed to add reactions to messages.

- **replies** : Enables message threads and replies.

- **uploads** : Allows image and file uploads within messages.

- **url_enrichment** : When enabled, messages containing URLs will be enriched automatically with image and text related to the message.

- **commands** : Enable a set of commands for this channel.

- **max_message_length** : The max message length.

- **blocklist** : A list of words you can define to moderate chat messages. More information can be found [here](/moderation/docs/engines/blocklists-and-regex-filters/).

- **blocklist_behavior** : set as  `block`  or  `flag` to determine what happens to a message containing blocked words.

- **grants** : Allows to modify channel-type permission grants for particular channel. More information can be found [here](/chat/docs/node/chat_permission_policies/)

- **user_message_reminders** : Allow users to set reminders for messages. More information can be found [here](/chat/docs/node/message_reminders/)

- **shared_locations** : Allow users to share their current location. More information can be found [here](/chat/docs/node/location_sharing/)

- **count_messages** : Enables counting messages on new channels.

### Examples

#### Use a different blocklist

```js
await channel.updatePartial({
  set: {
    config_overrides: {
      blocklist: "medical_blocklist",
      blocklist_behavior: "block",
    },
  },
});
```

#### Disables replies

```js
await channel.updatePartial({ set: { config_overrides: { replies: false } } });
```

#### Remove overrides and go back to default settings

```js
await channel.updatePartial({ set: { config_overrides: {} } });
```
