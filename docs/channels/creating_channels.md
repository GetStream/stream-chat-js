Channels must be created before users can start chatting. Channel creation can occur either client-side or server-side, depending on your app’s requirements. Client-side creation is ideal for apps where users can freely start conversations (for example, a Slack-style workforce management app). Server-side creation is preferred in apps that require business logic before a chat can begin, such as dating apps where users must match first. To limit channel creation to server-side only, remove Create Channel [permissions](/chat/docs/node/chat_permission_policies/) for your users.

There are two ways to create channels: by specifying a channel ID or by creating distinct channels.

## Creating a Channel Using a Channel ID

This approach works best when your app already has a database object that naturally maps to a chat channel. For example, in a Twitch-style live-streaming service, each streamer has a unique ID you can reuse as the channel ID, making it easy to route users to the correct chat. Using explicit IDs keeps channels predictable and easy to reference throughout your application.

```js
const channel = client.channel("messaging", "travel", {
  name: "Awesome channel about traveling",
});
// Here, 'travel' will be the channel ID
await channel.create();
```

## Distinct Channels

Distinct channels are ideal when you want a single, unique conversation for a specific set of users. By leaving the channel ID empty and specifying only the channel type and members, Stream automatically generates a channel ID by hashing the list of members (order does not matter). This ensures that the same group of users will always reference the same channel, preventing duplicate conversations.

> [!NOTE]
> You cannot add members for channels created this way, but members can be removed.


```js
const channel = client.channel("messaging", {
  members: ["thierry", "tommaso"],
});
await channel.create();
```

When you create a channel using one of the above approaches, you'll specify the following fields:

| name         | type   | description                                                                                                                             | default | optional |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| type         | string | The channel type. Default types are livestream, messaging, team, gaming and commerce. You can also create your own types.               | -       |          |
| id           | string | The channel id (optional). If you don't specify an ID the ID will be generated based on the list of members. (max length 64 characters) | -       | ✓        |
| channel data | object | Extra data for the channel. Must not exceed 5KB in size.                                                                                | default | ✓        |

## Channel Data

Channel data can include any number of custom fields as long as the total payload stays under 5KB. Some fields are reserved—such as `members`—and our UI components also use `name` and `image` when rendering channel lists and headers. In general, you should store only the data that's essential to your chat experience and avoid adding fields that change frequently.

| Name        | Type          | Description                                                                                                                                                                                                                                                         |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| name        | string        | The channel name. No special meaning, but by default the UI component will try to render this if the property is present.                                                                                                                                           |
| image       | string        | The channel image. Again there is no special meaning but by default, the UI component will try to render this if the property is present.                                                                                                                           |
| members     | array         | The members participating in this Channel. Note that you don't need to specify members for a live stream or other public chat. You only need to specify the members if you want to limit access of this chat to these members and subscribe them to future updates. |
| custom_data | various types | Channels can contain up to 5KB of custom data.                                                                                                                                                                                                                      |

## Watching Channels

Once a channel exists—or as it is being created on the client—it can be watched by client devices. Watching a channel subscribes the client’s WebSocket connection to real-time updates, such as new messages, membership changes, and reactions. This allows the SDKs to keep channel state and UI in sync automatically.

If your app lets users navigate to a channel client-side, you should use `channel.watch()`. This is a get-or-create method: it fetches and watches the channel if it already exists, or creates and watches it if it doesn't. `channel.watch()` returns the full channel state—including members, watchers, and messages—so your UI can render immediately.

For loading many channels at once, use [client.queryChannels()](/chat/docs/node/query_channels/)—this fetches and watches multiple channels in a single call, reducing API traffic.

Note that watching a channel is different from being a channel member. A watcher is a temporary, real-time subscription to updates, while a member is a persistent association with the channel.

```js
const channel = client.channel("messaging", "travel-channel");

const state = await channel.watch();
```
