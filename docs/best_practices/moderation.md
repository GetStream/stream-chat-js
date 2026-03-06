Moderation is essential for a good user experience on chat.
There are also requirements from DSA and the app stores to take into account.

Stream has advanced AI moderation capabilities for text, images, video and audio.
Before we launched moderation, customers often struggled with the cost and difficulty of integrating external moderation APIs.
You can now setup moderation in minutes at an affordable price point.

There are 4 layers of moderation:

- **Limits / chat features**: Restrict what's allowed. Moderator permissions, disabling links or images, slow mode, enforce_unique_usernames, slash commands etc.
- **Simple**: Blocklist, regex, domain allow/block, email allow/block
- **User actions**: Flag, mute, ban etc.
- **[AI moderation](/moderation/docs/)**: AI on text, images, video, audio

Let's go over each of these and show what's supported.

## Limits & Chat features

### Disabling the permission to post links or add attachments

You can control links and attachments by revoking the relevant permissions for a role. The permissions to manage are:

- `add-links` - ability to post messages containing URLs
- `create-attachment` - ability to add attachments to messages
- `upload-attachment` - ability to upload files/images

Update the grants for a channel type to remove these permissions from a role:

```js
// Remove link and attachment permissions for channel_member role
await client.updateChannelType("messaging", {
  grants: {
    channel_member: [
      "read-channel",
      "create-message",
      "update-message-owner",
      "delete-message-owner",
      // "add-links" - removed to disable links
      // "create-attachment" - removed to disable attachments
      // "upload-attachment" - removed to disable uploads
    ],
  },
});
```

For more details on permissions, see [User Permissions](/chat/docs/node/chat_permission_policies/).

### Image & Video file types

You can restrict which file types users can upload using `image_upload_config` and `file_upload_config`. This allows you to set allowed or blocked file extensions and MIME types, as well as size limits.

Both configs accept the following fields:

| Field                     | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `allowed_file_extensions` | Array of allowed file extensions (e.g., `[".jpg", ".png"]`)       |
| `blocked_file_extensions` | Array of blocked file extensions                                  |
| `allowed_mime_types`      | Array of allowed MIME types (e.g., `["image/jpeg", "image/png"]`) |
| `blocked_mime_types`      | Array of blocked MIME types                                       |
| `size_limit`              | Maximum file size in bytes (default allows up to 100MB)           |

```js
// Restrict images to common formats only
await client.updateAppSettings({
  image_upload_config: {
    allowed_file_extensions: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    allowed_mime_types: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    size_limit: 5 * 1024 * 1024, // 5MB
  },
  // Restrict file uploads to documents only
  file_upload_config: {
    allowed_file_extensions: [".pdf", ".doc", ".docx"],
    allowed_mime_types: ["application/pdf", "application/msword"],
    size_limit: 10 * 1024 * 1024, // 10MB
  },
});
```

For more details, see [App Settings](/chat/docs/node/app_setting_overview/).

### Giving moderators more permissions

Moderators have elevated permissions like the ability to ban users, delete messages, and more. You can assign moderator roles to users at the channel level or across all channels.

**Add a Moderator to a Channel:**

```js
// Add a member with moderator role
await channel.addMembers([
  { user_id: "james_bond", channel_role: "channel_moderator" },
]);
```

**Make a User a Moderator Across All Channels:**

To grant a user moderator permissions across all channels in your app, update their global role:

```js
await client.partialUpdateUser({
  id: "james_bond",
  set: { role: "admin" },
});
```

For more details on permissions, see [User Permissions](/chat/docs/node/chat_permission_policies/).

### Slow mode

Slow mode helps reduce noise on a channel by limiting users to a maximum of 1 message per cooldown interval (1-120 seconds). Moderators, admins, and server-side API calls are not restricted.

```js
// enable slow mode and set cooldown to 1s
await channel.enableSlowMode(1);

// increase cooldown to 30s
await channel.enableSlowMode(30);

// disable slow mode
await channel.disableSlowMode();
```

For more details, see [Slow Mode & Throttling](/chat/docs/node/slow_mode/).

### Enforce unique usernames

This setting prevents users from using duplicate usernames. When enabled with `app`, it enforces uniqueness across the entire app. With `team`, it only enforces within the same team.

```js
// Enable uniqueness constraints on App level
await client.updateAppSettings({
  enforce_unique_usernames: "app",
});

// Enable uniqueness constraints on Team level
await client.updateAppSettings({
  enforce_unique_usernames: "team",
});
```

### Slash commands for banning

Stream Chat supports built-in slash commands like `/ban` and `/unban` for quick moderation actions. Enable these commands on your channel type:

```js
// Enable ban/unban commands for a channel type
await client.updateChannelType("messaging", {
  commands: ["giphy", "ban", "unban", "mute", "unmute", "flag"],
});
```

## Simple Moderation features

### Blocklist

A Blocklist is a list of words that you can use to moderate chat messages. Stream Chat comes with a built-in Blocklist called `profanity_en_2020_v1` which contains over a thousand of the most common profane words.

You can manage your own blocklists via the Stream dashboard or APIs to a manage blocklists and configure your channel types to use them. Channel types can be configured to block or flag messages from your users based on your blocklists. To do this you need to configure your channel type(s) with these two configurations: `blocklist` and `blocklist_behavior` . The first one refers to the name of the blocklist and the second must be set as `block` or `flag` .

- Applications can have up to 15 blocklists in total alongside advanced filters

- A Blocklist can contain up to 10,000 words, each word can be up to 40 characters

- The blocklist words must be in lowercase

- Text matching is done with case insensitive word match (no prefix, post-fix support)

- Messages are split into words using white spaces and hyphens (cookie-monster matches both "cookie" and "monster")

So for instance, if you have a blocklist with the word "cream" these messages will be blocked or flagged:

- She jabbed the spoon in the ice cream and sighed

- Cream is the best

and it will not affect any of these

- Is creamcheese a word?

- I did not enjoy watching Scream

> [!NOTE]
> The default blocklist contains material that many will find offensive.


#### Setup example

Blocklists can be managed using the APIs like any other Chat feature. Here is a simple example on how to create a Blocklist and use it for a channel type.

```js
// add a new blocklist for this app
await client.createBlockList({
  name: "no-cakes",
  words: ["fudge", "cream", "sugar"],
});

// use the blocklist for all channels of type messaging
await client.updateChannelType("messaging", {
  blocklist: "no-cakes",
  blocklist_behavior: "block",
});
```

#### List available blocklists

All applications have the `profanity_en_2020_v1` blocklist available. This endpoint returns all blocklists available for this application.

```js
await client.listBlockLists();
```

#### Describe a blocklist

```js
await client.getBlockList("no-cakes");
```

#### Create new blocklist

```js
const words = ["fudge", "cream", "sugar"];
await client.createBlockList({
  name: "no-cakes",
  words,
});
```

#### Update a blocklist

```js
await client.updateBlockList("no-cakes", {
  words: ["fudge", "cream", "sugar", "vanilla"],
});
```

#### Delete a blocklist

When a blocklist is deleted, it will be automatically removed from all channel types that were using it.

```js
await client.deleteBlockList("no-cakes");
```

### Regex

Regex filters allow you to match and moderate messages using regular expressions. This is useful for filtering patterns like phone numbers, URLs, or complex word variations. Configure regex filters via the Stream dashboard under 'Blocklist & Regex Filters'.

For detailed configuration, see [Regex, Email, and Domain Filters](/moderation/docs/engines/blocklists-and-regex-filters/).

### Email/domain allow or block

You can configure domain and email filters to control what URLs and email addresses can be shared in messages. Set up allowlists or blocklists for specific domains via the Stream dashboard.

For detailed configuration, see [Regex, Email, and Domain Filters](/moderation/docs/engines/blocklists-and-regex-filters/).

## User Actions

### Flag

Any user can flag a message or user. Flagged content is added to your moderation review queue on the Stream Dashboard.

```js
// Flag a message
const flag = await client.flagMessage(messageId);

// Flag with a reason and custom data
const flag = await client.flagMessage(messageId, {
  reason: "spammy_user",
  custom: {
    user_comment: "This user is spamming.",
  },
});
```

#### Reasons & custom data

You can enhance flags by associating them with a specific reason and custom data. It is advisable to utilise a slug or keyword as a designated reason for easy translation or other forms of display customisation.

The custom data can encompass any object, offering supplementary metadata to the flag.

The Query Message Flags endpoint retrieves both reasons and custom data, and the reason can also be utilised for filtering these flags.

```js
// flag with a reason
let flag = await client.flagMessage(messageID, {
  reason: "spammy_user",
});

// flag with a reason and additional custom data
flag = await client.flagMessage(messageID, {
  reason: "spammy_user",
  custom: {
    user_comment: "This user is spamming the homepage.",
    page: "homepage",
  },
});

// flag with only custom data
flag = await client.flagMessage(messageID, {
  custom: {
    page: "homepage",
  },
});
```

#### Query Flagged Messages

If you prefer to build your own in-app moderation dashboard, rather than use the Stream dashboard, you can query flagged messages using the `QueryReviewQueue` API endpoint.

Both server-authenticated and user-authenticated clients can use this method. For client-side requests, the user needs moderator or admin permissions.

```js
const response = await client.moderation.queryReviewQueue(
  { entity_type: "stream:chat:v1:message" },
  [{ field: "created_at", direction: -1 }],
  { next: null },
);

for (const item of response.items) {
  console.log(item.message.id);
  console.log(item.message.text);
  console.log(item.message.type);
  console.log(item.message.created_at);
}

console.log(next); // <-- next cursor for pagination
```

Please refer to the [Moderation API](/moderation/docs/api/#query-review-queue) documentation for more details.

### Mute

Users can mute other users. Mutes are stored at the user level and returned when `connectUser` is called. Messages from muted users are still delivered via websocket but not via push notifications.

See [Mute in the Moderation API](/moderation/docs/api/flag-mute-ban/#mute) for full documentation and SDK examples.

### Block

The user block feature allows users to control their 1-on-1 interactions within the chat application by blocking other users.

```js
await client.blockUser("user-to-block");
```

#### How blocking impacts chat

When a user is blocked, several changes occur:

- **Direct Communication Termination**: When a user blocks another user, communication in all 1-on-1 channels are hidden for the blocking user.
- **Adding to Channels**: If a blocked user tries to add the blocking user to a channel as a member, the action is ignored. The channel will not include the blocking user but will have the remaining members.
- **Push Notifications**: The blocking user will not receive push notifications from blocked users for 1-on-1 channels.
- **Channel Events**: The blocking user will not receive any events from blocked users in 1-on-1 channels (e.g., message.new).
- **Group Channels**: Group channels are unaffected by the block. Both the blocking and blocked users can participate, receive push notifications, and events in group channels.
- **Query Channels**: When hidden channels are requested, 1-on-1 channels with blocked users will be returned with a `blocked:true` flag and all the messages.
- **Active Chats and Unread Counts**: Blocked users will not appear in the blocking user's list of active chats. Messages from blocked users will not contribute to unread counts.
- **Unblocking Users**: After unblocking, all previous messages in 1-on-1 channels become visible again, including those sent during the block period.
- **Hidden Channels**: Channels with only the blocked and blocking users are marked as hidden for the blocking user by default. If a blocked user sends a message in a hidden channel, the channel remains hidden for the blocking user.
- **Group Channel Messages**: Messages from blocked users will still appear when retrieving messages from a group channel.
- **WebSocket Connection**: When connecting to the WebSocket, the blocking user receives a list of users they have blocked (user.blocked_users). This is only available for the blocking user's own account.
- **Message Actions**: Actions such as sending, updating, reacting to, and deleting messages will still work in blocked channels. However, since the channels are hidden, these actions will not be visible to the blocking user.

#### Block User

Any user is allowed to block another user. Blocked users are stored at the user level and returned with the rest of the user information when connectUser is called. A user will be blocked until the user is unblocked.

```js
await client.blockUser("user-to-block");
```

#### Unblock user

```js
await client.unBlockUser(blockedUser);
```

#### List of Blocked Users

```js
const resp = await client.getBlockedUsers();
```

#### Server Side

**Block User:**

```js
const blockingUser = "user1";
const blockedUser = "user2";
await ctx.createUsers([blockingUser, blockedUser]);
const serverClient = await ctx.serverClient();

await serverClient.blockUser(blockedUser, blockingUser);
const resp = await serverClient.getBlockedUsers(blockingUser);
```

**Unblock user:**

```js
await serverClient.unBlockUser(blockedUser, blockingUser);
```

**Get List of Blocked Users:**

```js
const resp = await client.getBlockedUsers(blockingUser);
```

## AI moderation

AI moderation can detect over 40 harms in 50+ different languages.
In addition to these classification models LLM based moderation is also supported.
Moderation APIs are available at additional costs.
It's priced to be cost-effective and typically is a fraction of the cost of other moderation APIs.

[Read the full AI moderation docs](/moderation/docs/).

## Ban

Users can be banned from an app entirely or from a channel. When banned, they cannot post messages until the ban is removed or expires. You can also apply IP bans and optionally delete the user's messages.

See [Ban in the Moderation API](/moderation/docs/api/flag-mute-ban/#ban) for full documentation, including shadow bans, query endpoints, and SDK examples.
