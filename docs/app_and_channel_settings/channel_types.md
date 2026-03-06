Channel types allow you to configure which features are enabled, and how permissions work.
For example you can disable typing indicators, give rights to moderators, or configure channels to be accessible even if you're not a member.

The easiest way to change your channel types is the dashboard. The docs below show how to change channel types via the API.

### Built-in Channel types

There are five built-in channel types with good default for these use cases.

- [Messaging](https://getstream.io/chat/demos/messaging/): Good default for dating, marketplace, and other social app chat use cases
- [AI](https://getstream.io/chat/solutions/gaming/): For creating user to LLM style chat experiences, text, voice & video.
- [Livestream](https://getstream.io/chat/demos/livestream/): For livestreaming or live shopping experiences
- [Team](https://getstream.io/chat/demos/team/): If you want to build your own version of Slack or something similar, start here.
- [Gaming](https://getstream.io/chat/solutions/gaming/): Defaults for adding chat to video games.

The five default channel types come with good default permission policies. You can find more information on how to manage permissions in the [Channel Types section](/chat/docs/node/chat_permission_policies/).

### Updating or creating a channel type

```js
// Create a new channel type
await client.createChannelType({
  name: "my-channel-type",
  typing_events: true,
  read_events: true,
  reactions: true,
  replies: true,
});

// Update an existing channel type
await client.updateChannelType("my-channel-type", {
  reactions: false,
  max_message_length: 1000,
});
```

### Features you can enable/disable

Channel types can be configured with specific permissions and features.

As you can see in the examples below, you can define your own Channel types and configure them to fit your needs. The Channel type allows you to configure these features:

- **typing_events** : Controls if typing indicators are shown.
- **read_events** : Controls whether the chat shows how far you've read.
- **connect_events** : Determines if events are fired for connecting and disconnecting to a chat.
- **custom_events** : Determines if channel watchers will receive custom events.
- **reactions** : If users are allowed to add reactions to messages.
- **search** : Controls if messages should be searchable.
- **replies** : Enables message threads and replies.
- **quotes** : Allows members to quote messages (inline replies).
- **mutes** : Determines if users are able to mute other users.
- **uploads** : Allows image and file uploads within messages.
- **url_enrichment** : When enabled, messages containing URLs will be enriched automatically with image and text related to the message. This is disabled by default for the livestream channel type and we do not recommend enabling it for performance reasons.
- **count_messages** : Enables message counting on new channels. When enabled the message count will be present in the channel response.
- **user_message_reminders** : Allow users to set reminders for messages. More information can be found [here](/chat/docs/node/message_reminders/).
- **mark_messages_pending** : When enabled, messages marked as pending are only visible to the sender until approved.
- **polls** : Allows channel members to create and vote on polls.
- **skip_last_msg_update_for_system_msgs** : When disabled, system messages will affect the channel's last_message_at timestamp.
- **location_sharing** : Allows members to share their locations with other members.
- **read_receipts** : Allows members to see when messages are delivered (delivery events).
- **partitioning** : Automatically chunks messages into virtual partitions for better performance at larger scales (dynamic partitioning).
- **push_notifications** : If messages are allowed to generate push notifications.

### Channel Types Fields

| name                                 | type           | description                                                                                         | default | optional |
| ------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------- | ------- | -------- |
| name                                 | string         | The name of the channel type must be unique per application                                         |         |          |
| max_message_length                   | int            | The max message length                                                                              | 5,000   | ✓        |
| typing_events                        | boolean        | Enable typing events                                                                                | true    | ✓        |
| read_events                          | boolean        | Enable read events                                                                                  | true    | ✓        |
| connect_events                       | boolean        | Enable connect events                                                                               | true    | ✓        |
| custom_events                        | boolean        | Enable custom events                                                                                | true    | ✓        |
| reactions                            | boolean        | Enable message reactions                                                                            | true    | ✓        |
| search                               | boolean        | Enable message search                                                                               | true    | ✓        |
| replies                              | boolean        | Enable replies (threads)                                                                            | true    | ✓        |
| quotes                               | boolean        | Allow quotes/inline replies                                                                         | true    | ✓        |
| mutes                                | boolean        | Enable mutes                                                                                        | true    | ✓        |
| uploads                              | boolean        | Enable file and image upload                                                                        | true    | ✓        |
| url_enrichment                       | boolean        | Automatically enrich URLs                                                                           | true    | ✓        |
| count_messages                       | boolean        | Enables message counting on new channels                                                            | false   | ✓        |
| user_message_reminders               | boolean        | Allow users to set reminders and bookmarks for messages                                             | false   | ✓        |
| mark_messages_pending                | boolean        | Messages marked as pending are only visible to the sender until approved                            | false   | ✓        |
| polls                                | boolean        | Allow channel members to create and vote on polls                                                   | false   | ✓        |
| skip_last_msg_update_for_system_msgs | boolean        | When disabled, system messages will affect the channel's last_message_at timestamp                  | false   | ✓        |
| location_sharing                     | boolean        | Allow members to share their locations with other members                                           | false   | ✓        |
| read_receipts                        | boolean        | Allow members to see when messages are delivered (delivery events)                                  | true    | ✓        |
| partitioning                         | boolean        | Automatically chunks messages into virtual partitions for better performance at larger scales       | false   | ✓        |
| push_notifications                   | boolean        | Enable push notifications                                                                           | true    | ✓        |
| automod                              | string         | Disabled, simple or AI are valid options for the Automod (AI based moderation is a premium feature) | simple  | ✓        |
| commands                             | list of string | The commands that are available on this channel type                                                | []      | ✓        |

> [!WARNING]
> You need to use server-side authentication to create, edit, or delete a channel type.


### Creating a Channel Type

```js
import { DenyAll, AnyRole } from "stream-chat";

await client.createChannelType({
  name: "public",
  mutes: false,
  reactions: false,
});
```

> [!WARNING]
> If not provided, the permission settings will default to the ones from the built-in "messaging" type.


Please note that applications have a hard limit of 50 channel types. If you need more than this please have a look at the [Multi-tenant & Teams](/chat/docs/node/multi_tenant_chat/) section.

### List Channel Types

You can retrieve the list of all channel types defined for your application.

```js
const channelTypes = await client.listChannelTypes();
```

### Get a Channel Type

You can retrieve a channel type definition with this endpoint.

> [!NOTE]
> Features and commands are also returned by other channel endpoints.


```js
const channelType = await client.getChannelType("public");
```

### Edit a Channel Type

Channel type features, commands and permissions can be changed. Only the fields that must change need to be provided, fields that are not provided to this API will remain unchanged.

```js
const update = await client.updateChannelType("public", {
  replies: false,
  commands: ["all"],
});
```

Features of a channel can be updated by passing the boolean flags:

```js
const update = await client.updateChannelType("public", {
  typing_events: false,
  read_events: true,
  connect_events: true,
  search: false,
  reactions: true,
  replies: false,
  mutes: true,
});
```

Settings can also be updated by passing in the desired new values:

```js
const update = await client.updateChannelType("public", {
  automod: "disabled",
  max_message_length: 140,
  commands: ["giphy", "ban"],
});
```

### Remove a Channel Type

```js
const destroy = await client.deleteChannelType("public");
```

> [!NOTE]
> You cannot delete a channel type if there are any active channels of that type.
