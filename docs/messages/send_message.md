Messages are the core building blocks of a chat application. This page covers sending, retrieving, updating, and deleting messages, as well as how Stream processes and formats message content.

## Sending a Message

To send a message to a channel, use the `sendMessage` method:

```js
const message = await channel.sendMessage({
  text: "Hello, world!",
});
```

> [!NOTE]
> Server-side SDKs require a `user_id` parameter to specify who is sending the message. Client-side SDKs set this automatically based on the connected user.


### Message Parameters

| Name                  | Type   | Description                                                                                                              | Default | Optional |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ | ------- | -------- |
| text                  | string | The message text. Supports markdown and automatic URL enrichment.                                                        |         | ✓        |
| attachments           | array  | A list of attachments (audio, video, image, text). Maximum 30 attachments per message with a combined size limit of 5KB. |         | ✓        |
| user_id               | object | Required for server-side SDKs. Set automatically in client-side mode.                                                    |         | ✓        |
| mentioned_users       | array  | A list of user IDs mentioned in the message. You receive back the full user data in the response. Maximum 25 users.      |         | ✓        |
| custom data           | object | Extra data for the message. Must not exceed 5KB in size.                                                                 |         | ✓        |
| skip_push             | bool   | If true, do not send a push notification for this message.                                                               | false   | ✓        |
| restricted_visibility | array  | Send the message only to specific channel members, identified by their user IDs.                                         |         | ✓        |

### Sending Messages with Attachments

Messages can include attachments such as images, videos, audio files, and custom content. The following example shows how to send a message with an image attachment and user mentions:

```js
const message = await channel.sendMessage(
  {
    text: "@Josh Check out this image!",
    attachments: [
      {
        type: "image",
        asset_url: "https://bit.ly/2K74TaG",
        thumb_url: "https://bit.ly/2Uumxti",
        myCustomField: 123,
      },
    ],
    mentioned_users: [josh.id],
    priority: "high",
  },
  { skip_push: true },
);
```

### Supported Attachment Types

Stream's UI components support the following attachment types by default:

- **Audio**: Audio files and recordings
- **Video**: Video files
- **Image**: Photos and images
- **Text**: Text-based attachments

You can define custom attachment types as long as you implement the frontend rendering logic to handle them. Common use cases include embedding products (with photos, descriptions, and links) or sharing user locations.

The [React tutorial](https://getstream.io/chat/react-chat/tutorial/) explains how to customize the `Attachment` component.

## Message Processing

When you send a message, Stream performs several processing steps:

1. **Markdown parsing**: The message text is parsed for markdown formatting.
2. **URL enrichment**: The first URL in the message text is scraped for Open Graph data, adding preview information automatically.
3. **Slash commands**: Commands like `/giphy`, `/ban`, and `/flag` are processed and executed.

### URL Enrichment

When a message contains a URL, Stream automatically scrapes the page for Open Graph metadata and creates an attachment with the preview information:

```js
const response = await channel.sendMessage({
  text: "Check this out https://imgur.com/r/bears/4zmGbMN",
});
```

The resulting message includes an automatically generated attachment:

```json
{
  "id": "message-id",
  "text": "Check this out https://imgur.com/r/bears/4zmGbMN",
  "attachments": [
    {
      "type": "image",
      "author_name": "Imgur",
      "title": "An update: Dushi made it safe to Bear Sanctuary",
      "title_link": "https://imgur.com/4zmGbMN",
      "text": "1678 views on Imgur",
      "image_url": "https://i.imgur.com/4zmGbMN.jpg?fb",
      "thumb_url": "https://i.imgur.com/4zmGbMN.jpg?fb",
      "og_scrape_url": "https://imgur.com/r/bears/4zmGbMN"
    }
  ]
}
```

### URL Attachment Fields

| Name          | Type   | Description                                                                 |
| ------------- | ------ | --------------------------------------------------------------------------- |
| type          | string | The attachment type based on the URL resource: `audio`, `image`, or `video` |
| author_name   | string | The name of the author                                                      |
| title         | string | The attachment title                                                        |
| title_link    | string | The link the attachment points to                                           |
| text          | string | The attachment description text                                             |
| image_url     | string | The URL to the attached image                                               |
| thumb_url     | string | The URL to the attachment thumbnail                                         |
| asset_url     | string | The URL to the audio, video, or image resource                              |
| og_scrape_url | string | The original URL that was scraped                                           |

> [!NOTE]
> The Open Graph scraper uses this user agent: `getstream.io/opengraph-bot facebookexternalhit/1.1`. If you control the target website, ensure this user agent is not blocked for optimal results.


## Message Response Structure

The API returns a message object containing all information about the message, including the author, attachments, reactions, and metadata.

### Message Fields

| Field Name              | Description                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------- |
| id                      | Unique message identifier. Maximum 255 characters; cannot contain `,` or `%`.      |
| text                    | The raw message text                                                               |
| html                    | Safe HTML generated from the text. Can only be set via server-side APIs or import. |
| type                    | Message type: `regular`, `ephemeral`, `error`, `reply`, `system`, or `deleted`     |
| cid                     | The channel ID in the format `type:id`                                             |
| user                    | The author user object                                                             |
| attachments             | List of attachments (maximum 30)                                                   |
| mentioned_users         | Users mentioned in the message                                                     |
| reaction_counts         | Reaction counts by type (deprecated, use `reaction_groups`)                        |
| reaction_scores         | Reaction scores by type                                                            |
| reaction_groups         | Reaction statistics grouped by type with count, scores, and timestamps             |
| latest_reactions        | The 10 most recent reactions                                                       |
| own_reactions           | Reactions added by the current user                                                |
| reply_count             | Number of replies to this message                                                  |
| thread_participants     | Users who have participated in the thread                                          |
| parent_id               | ID of the parent message if this is a reply                                        |
| quoted_message_id       | ID of a quoted message                                                             |
| pinned                  | Whether the message is pinned                                                      |
| pinned_at               | When the message was pinned                                                        |
| pinned_by               | User who pinned the message                                                        |
| pin_expires             | When the pin expires (null for no expiration)                                      |
| silent                  | Whether this is a silent message (no push notifications)                           |
| created_at              | When the message was created                                                       |
| updated_at              | When the message was last updated                                                  |
| deleted_at              | When the message was deleted                                                       |
| message_text_updated_at | When the message text was last updated                                             |

<details>
<summary>Example Response</summary>

```json
{
  "id": "msg-a8f3b2c1-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "text": "Hey @sarah-miller, the new design mockups are ready! Let me know what you think 🎨",
  "html": "",
  "type": "regular",
  "cid": "messaging:project-apollo",
  "user": {
    "id": "alex-chen",
    "name": "Alex Chen",
    "image": "https://cdn.example.com/avatars/alex-chen.jpg",
    "role": "user",
    "created_at": "2024-03-12T09:15:00.000Z",
    "updated_at": "2024-11-28T16:42:00.000Z"
  },
  "attachments": [
    {
      "type": "image",
      "image_url": "https://cdn.example.com/uploads/mockup-v2-homepage.png",
      "thumb_url": "https://cdn.example.com/uploads/thumbs/mockup-v2-homepage.png",
      "title": "Homepage Redesign v2",
      "fallback": "Homepage Redesign v2"
    },
    {
      "type": "image",
      "image_url": "https://cdn.example.com/uploads/mockup-v2-dashboard.png",
      "thumb_url": "https://cdn.example.com/uploads/thumbs/mockup-v2-dashboard.png",
      "title": "Dashboard Redesign v2",
      "fallback": "Dashboard Redesign v2"
    }
  ],
  "mentioned_users": [
    {
      "id": "sarah-miller",
      "name": "Sarah Miller",
      "image": "https://cdn.example.com/avatars/sarah-miller.jpg"
    }
  ],
  "reaction_counts": {
    "love": 3,
    "fire": 2,
    "thumbsup": 1
  },
  "reaction_scores": {
    "love": 3,
    "fire": 2,
    "thumbsup": 1
  },
  "reaction_groups": {
    "love": {
      "count": 3,
      "sum_scores": 3,
      "first_reaction_at": "2024-12-11T14:32:00.000Z",
      "last_reaction_at": "2024-12-11T15:18:00.000Z"
    },
    "fire": {
      "count": 2,
      "sum_scores": 2,
      "first_reaction_at": "2024-12-11T14:35:00.000Z",
      "last_reaction_at": "2024-12-11T14:52:00.000Z"
    },
    "thumbsup": {
      "count": 1,
      "sum_scores": 1,
      "first_reaction_at": "2024-12-11T16:05:00.000Z",
      "last_reaction_at": "2024-12-11T16:05:00.000Z"
    }
  },
  "latest_reactions": [
    {
      "type": "thumbsup",
      "user_id": "sarah-miller",
      "created_at": "2024-12-11T16:05:00.000Z"
    },
    {
      "type": "love",
      "user_id": "mike-johnson",
      "created_at": "2024-12-11T15:18:00.000Z"
    },
    {
      "type": "fire",
      "user_id": "emma-wilson",
      "created_at": "2024-12-11T14:52:00.000Z"
    }
  ],
  "own_reactions": [],
  "reply_count": 2,
  "deleted_reply_count": 0,
  "parent_id": "",
  "show_in_channel": false,
  "thread_participants": [
    {
      "id": "sarah-miller",
      "name": "Sarah Miller"
    },
    {
      "id": "alex-chen",
      "name": "Alex Chen"
    }
  ],
  "quoted_message_id": "",
  "quoted_message": null,
  "pinned": true,
  "pinned_at": "2024-12-11T17:00:00.000Z",
  "pinned_by": {
    "id": "sarah-miller",
    "name": "Sarah Miller"
  },
  "pin_expires": null,
  "silent": false,
  "shadowed": false,
  "i18n": {},
  "image_labels": {},
  "custom": {},
  "restricted_visibility": [],
  "poll_id": "",
  "poll": null,
  "created_at": "2024-12-11T14:30:00.000Z",
  "updated_at": "2024-12-11T17:00:00.000Z"
}
```

</details>

### Message Types

| Type      | Description                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| regular   | A standard message posted to the channel. This is the default type.                                            |
| ephemeral | A temporary message delivered only to one user. Not stored in channel history. Used by commands like `/giphy`. |
| error     | An error message from a failed command. Ephemeral and only delivered to one user.                              |
| reply     | A message in a reply thread. Messages with a `parent_id` are automatically this type.                          |
| system    | A message generated by a system event, such as updating the channel or muting a user.                          |
| deleted   | A soft-deleted message.                                                                                        |

## Retrieving a Message

Use `getMessage` to retrieve a single message by its ID:

```js
const message = await client.getMessage(messageID);

// For soft-deleted messages, retrieve the original content (server-side only)
const deletedMessage = await serverClient.getMessage(messageID, {
  show_deleted_message: true,
});
```

### Get Message Options

| Name                 | Type    | Description                                                     | Default | Optional |
| -------------------- | ------- | --------------------------------------------------------------- | ------- | -------- |
| show_deleted_message | boolean | If true, returns the original content of a soft-deleted message | false   | ✓        |

> [!NOTE]
> The `show_deleted_message` option is only available for server-side calls.


## Updating a Message

To update a message, call `updateMessage` with a message object that includes the message ID:

```js
const message = { id: messageId, text: "Updated message text" };
const updated = await client.updateMessage(message);
```

### Partial Update

Use partial updates to modify specific fields without replacing the entire message. This is useful when you want to retain existing custom data:

```js
// Update text
await client.partialUpdateMessage(originalMessage.id, {
  set: { text: "Updated text" },
});

// Remove a custom field
await client.partialUpdateMessage(originalMessage.id, {
  unset: ["color"],
});

// Update nested properties
await client.partialUpdateMessage(originalMessage.id, {
  set: { "details.status": "complete" },
});
```

## Deleting a Message

Messages can be deleted in three ways:

- **Soft delete**: The message is marked as deleted but data is preserved. Can be undeleted.
- **Hard delete**: The message and all related data (reactions, replies) are permanently removed.
- **Delete for me**: The message is marked as deleted only for the current user. Other channel members are not affected.

> [!WARNING]
> Deleting a message does not delete its file attachments. See [deleting attachments](/chat/docs/node/file_uploads/#deleting-files-and-images/) for more information.


```js
// Soft delete
await client.deleteMessage(messageID);

// Hard delete
await client.deleteMessage(messageID, { hardDelete: true });

// Delete for me
await client.deleteMessage(messageID, { deleteForMe: true });
```

### Delete Type Comparison

| Behavior                      | Soft Delete | Hard Delete | Delete for Me |
| ----------------------------- | ----------- | ----------- | ------------- |
| Can be done client-side       | ✓           | ✓           | ✓             |
| Message type set to "deleted" | ✓           | -           | ✓             |
| Data preserved                | ✓           | -           | ✓ (for user)  |
| Reactions and replies kept    | ✓           | -           | ✓             |
| Can be undeleted              | ✓           | -           | -             |
| Affects other users           | ✓           | ✓           | -             |
| Recoverable                   | ✓           | -           | -             |

> [!NOTE]
> Delete for me is limited to 100 messages per user per channel. Contact support to increase this limit.


### Undeleting a Message

Soft-deleted messages can be restored using a server-side call:

```js
await client.undeleteMessage(messageID, userID);
```

Messages can be undeleted if:

- The message was soft-deleted (not hard-deleted)
- The channel has not been deleted
- It is not a reply to a deleted message (the parent must be undeleted first)
- The user performing the undelete is valid
