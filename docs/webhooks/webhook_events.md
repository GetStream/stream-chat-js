Below you can find the complete list of events that are sent via webhooks together with the description of the data payload.

For message and channel events the webhook request body will also include the list of channel members and attach additional information about their read status. For performance reasons, such list is truncated up to 50 members.

When applicable, the following attributes are included to the event user and to the event members:

| total_unread_count   | the total count of messages across all channels.        |
| -------------------- | ------------------------------------------------------- |
| unread_channels      | the count of channels with at least one unread message. |
| channel_last_read_at | the last time the channel was marked as read.           |
| channel_unread_count | the count of unread messages on this channel            |

### Webhook Event Types

| Event                        | Triggered                                                           |
| ---------------------------- | ------------------------------------------------------------------- |
| message.new                  | when a new message is added.                                        |
| message.read                 | when a user calls mark as read.                                     |
| message.updated              | when a message is updated.                                          |
| message.deleted              | when a message is deleted.                                          |
| reaction.new                 | when a message reaction is added.                                   |
| reaction.deleted             | when a message reaction deleted                                     |
| reaction.updated             | when a reaction is updated.                                         |
| member.added                 | when a member is added to a channel.                                |
| member.updated               | when a member is updated.                                           |
| member.removed               | when a member is removed from a channel.                            |
| channel.created              | when a channel is created.                                          |
| channel.updated              | when a channel is updated.                                          |
| channel.muted                | when a channel is muted.                                            |
| channel.unmuted              | when a channel is unmuted.                                          |
| channel.truncated            | when a channel is truncated.                                        |
| channel.deleted              | when a channel is deleted.                                          |
| channel.hidden               | when a channel is hidden.                                           |
| user.deactivated             | when a user is deactivated                                          |
| user.deleted                 | when a user is deleted                                              |
| user.reactivated             | when a user is reactivated                                          |
| user.updated                 | when a user is updated.                                             |
| user.muted                   | when a user is muted.                                               |
| user.unmuted                 | when a user is unmuted.                                             |
| user.banned                  | when a user is banned.                                              |
| user.messages.deleted        | when a user's messages are deleted.                                 |
| user.unbanned                | when a user is unbanned.                                            |
| user.flagged                 | when a user is flagged.                                             |
| user.unread_message_reminder | when the user has at least 1 unread message (see reminders section) |
| export.users.success         | when an async users export is successful.                           |
| export.users.error           | when an async users export fails.                                   |
| export.channels.success      | when an async channels export is successful.                        |
| export.channels.success      | when an async channels export fails.                                |
| reminder.created             | when a message reminder is created.                                 |
| reminder.updated             | when a message reminder is updated.                                 |
| reminder.deleted             | when a message reminder is deleted.                                 |
| notification.reminder_due    | when a message reminder's due time is reached.                      |

### `message.new`

> [!NOTE]
> Custom message metadata will be included in the _message.new_ webhook event but custom channel data will not be.


```json
{
  "type": "message.new",
  "cid": "messaging:fun-d5f396e3-fbaf-469c-9b45-8837b4f75baa",
  "message": {
    "id": "8bffc454-e1da-4d91-8b88-a87853dfb41c",
    "text": "67d61fa4-74b6-4e1a-bfe7-589d84b8215b",
    "html": "<p>67d61fa4-74b6-4e1a-bfe7-589d84b8215b</p>\n",
    "type": "regular",
    "user": {
      "id": "tommaso-52ec3a5f-e916-469f-bf54-b53b5247a4b0",
      "role": "user",
      "created_at": "2020-03-30T07:54:46.207332Z",
      "updated_at": "2020-03-30T07:54:46.207719Z",
      "banned": false,
      "online": false
    },
    "attachments": [],
    "latest_reactions": [],
    "own_reactions": [],
    "reaction_counts": null,
    "reaction_scores": {},
    "reply_count": 0,
    "created_at": "2020-03-30T07:54:46.277381Z",
    "updated_at": "2020-03-30T07:54:46.277382Z",
    "mentioned_users": []
  },
  "user": {
    "id": "tommaso-52ec3a5f-e916-469f-bf54-b53b5247a4b0",
    "role": "user",
    "created_at": "2020-03-30T07:54:46.207332Z",
    "updated_at": "2020-03-30T07:54:46.207719Z",
    "banned": false,
    "online": false,
    "channel_unread_count": 0,
    "channel_last_read_at": "2020-03-30T07:54:46.270208768Z",
    "total_unread_count": 0,
    "unread_channels": 0,
    "unread_count": 0
  },
  "created_at": "2020-03-30T07:54:46.295138Z",
  "members": [
    {
      "user_id": "thierry-735d0d44-8bf1-40df-81db-fa83363ac790",
      "user": {
        "id": "tommaso-52ec3a5f-e916-469f-bf54-b53b5247a4b0",
        "role": "user",
        "created_at": "2020-03-30T07:54:46.207332Z",
        "updated_at": "2020-03-30T07:54:46.207719Z",
        "banned": false,
        "online": false
      },
      "created_at": "2020-03-30T07:54:46.255628Z",
      "updated_at": "2020-03-30T07:54:46.255628Z",
      "notifications_muted": true //user muted notifications from this channel
    }
  ],
  "channel_type": "messaging",
  "channel_id": "fun-d5f396e3-fbaf-469c-9b45-8837b4f75baa",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `message.read`

```json
{
  "cid": "messaging:fun",
  "type": "message.read",
  "user": {
    "id": "a6e21b36-798b-408a-9cd1-0cf6c372fc7f",
    "role": "user",
    "created_at": "2019-04-24T08:49:58.170034Z",
    "updated_at": "2019-04-24T08:49:59.345304Z",
    "last_active": "2019-04-24T08:49:59.344201Z",
    "online": true,
    "total_unread_count": 0,
    "unread_channels": 0,
    "unread_count": 0,
    "channel_unread_count": 0,
    "channel_last_read_at": "2019-04-24T08:49:59.365498Z"
  },
  "created_at": "2019-04-24T08:49:59.365489Z",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `message.updated`

```json
{
 "cid": "messaging:fun",
 "type": "message.updated",
 "message": {
  "id": "93163f53-4174-4be8-90cd-e59bef78da00",
  "text": "new stuff",
  "html": "<p>new stuff</p>\n",
  "type": "regular",
  "user": {
   "id": "75af03a7-fe83-4a2a-a447-9ed4fac2ea36",
   "role": "user",
   "created_at": "2019-04-24T08:51:26.846395Z",
   "updated_at": "2019-04-24T08:51:27.973941Z",
   "last_active": "2019-04-24T08:51:27.972713Z",
   "online": false
  },
  "attachments": [],
  "latest_reactions": [],
  "own_reactions": [],
  "reaction_counts": null,
  "reply_count": 0,
  "created_at": "2019-04-24T08:51:28.005691Z",
  "updated_at": "2019-04-24T08:51:28.138422Z",
  "mentioned_users": []
  "message_text_updated_at": "2024-02-26T10:06:55.302552Z"
 },
 "user": {
  "id": "75af03a7-fe83-4a2a-a447-9ed4fac2ea36",
  "role": "user",
  "created_at": "2019-04-24T08:51:26.846395Z",
  "updated_at": "2019-04-24T08:51:27.973941Z",
  "last_active": "2019-04-24T08:51:27.972713Z",
  "online": true,
  "channel_unread_count": 1,
  "channel_last_read_at": "2019-04-24T08:51:27.994245Z",
  "total_unread_count": 2,
  "unread_channels": 2,
  "unread_count": 2
 },
 "message_update": {
  "old_text": "old text",
  "change_set": {
   "custom": false,
   "text": true,
   "html": false,
   "attachments": false,
   "mentioned_user_ids": false,
   "quoted_message_id": false,
   "silent": false,
   "pin": false
  }
 },
 "created_at": "2019-04-24T10:51:28.142291+02:00",
  "request_info": {
   "type": "client",
   "ip": "86.84.2.2",
   "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
   "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `message.deleted`

```json
{
  "cid": "messaging:fun",
  "type": "message.deleted",
  "message": {
    "id": "268d121f-82e0-4de1-8c8b-ef1201efd7a3",
    "text": "new stuff",
    "html": "<p>new stuff</p>\n",
    "type": "regular",
    "user": {
      "id": "76cd8430-2f91-4059-90e5-02dffb910297",
      "role": "user",
      "created_at": "2019-04-24T09:44:21.390868Z",
      "updated_at": "2019-04-24T09:44:22.537305Z",
      "last_active": "2019-04-24T09:44:22.535872Z",
      "online": false
    },
    "attachments": [],
    "latest_reactions": [],
    "own_reactions": [],
    "reaction_counts": {},
    "reply_count": 0,
    "created_at": "2019-04-24T09:44:22.57073Z",
    "updated_at": "2019-04-24T09:44:22.717078Z",
    "deleted_at": "2019-04-24T09:44:22.730524Z",
    "mentioned_users": []
  },
  "created_at": "2019-04-24T09:44:22.733305Z",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `reaction.new`

```json
{
  "cid": "messaging:fun",
  "type": "reaction.new",
  "message": {
    "id": "4b3c7b6c-a39d-4069-9450-2a3716cf4ca6",
    "text": "new stuff",
    "html": "<p>new stuff</p>\n",
    "type": "regular",
    "user": {
      "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
      "role": "user",
      "created_at": "2019-04-24T09:49:47.158005Z",
      "updated_at": "2019-04-24T09:49:48.301933Z",
      "last_active": "2019-04-24T09:49:48.300566Z",
      "online": false
    },
    "attachments": [],
    "latest_reactions": [
      {
        "message_id": "4b3c7b6c-a39d-4069-9450-2a3716cf4ca6",
        "user": {
          "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
          "role": "user",
          "created_at": "2019-04-24T09:49:47.158005Z",
          "updated_at": "2019-04-24T09:49:48.301933Z",
          "last_active": "2019-04-24T09:49:48.300566Z",
          "online": true
        },
        "type": "lol",
        "created_at": "2019-04-24T09:49:48.481994Z"
      }
    ],
    "own_reactions": [],
    "reaction_counts": {
      "lol": 1
    },
    "reply_count": 0,
    "created_at": "2019-04-24T09:49:48.334808Z",
    "updated_at": "2019-04-24T09:49:48.483028Z",
    "mentioned_users": []
  },
  "reaction": {
    "message_id": "4b3c7b6c-a39d-4069-9450-2a3716cf4ca6",
    "user": {
      "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
      "role": "user",
      "created_at": "2019-04-24T09:49:47.158005Z",
      "updated_at": "2019-04-24T09:49:48.301933Z",
      "last_active": "2019-04-24T09:49:48.300566Z",
      "online": true
    },
    "type": "lol",
    "created_at": "2019-04-24T09:49:48.481994Z"
  },
  "user": {
    "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
    "role": "user",
    "created_at": "2019-04-24T09:49:47.158005Z",
    "updated_at": "2019-04-24T09:49:48.301933Z",
    "last_active": "2019-04-24T09:49:48.300566Z",
    "online": true,
    "unread_channels": 2,
    "unread_count": 2,
    "channel_unread_count": 1,
    "channel_last_read_at": "2019-04-24T09:49:48.321138Z",
    "total_unread_count": 2
  },
  "created_at": "2019-04-24T09:49:48.488497Z"
}
```

### `reaction.deleted`

```json
{
  "cid": "messaging:fun",
  "type": "reaction.deleted",
  "message": {
    "id": "4b3c7b6c-a39d-4069-9450-2a3716cf4ca6",
    "text": "new stuff",
    "html": "<p>new stuff</p>\n",
    "type": "regular",
    "user": {
      "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
      "role": "user",
      "created_at": "2019-04-24T09:49:47.158005Z",
      "updated_at": "2019-04-24T09:49:48.301933Z",
      "last_active": "2019-04-24T09:49:48.300566Z",
      "online": false
    },
    "attachments": [],
    "latest_reactions": [],
    "own_reactions": [],
    "reaction_counts": {},
    "reply_count": 0,
    "created_at": "2019-04-24T09:49:48.334808Z",
    "updated_at": "2019-04-24T09:49:48.511631Z",
    "mentioned_users": []
  },
  "reaction": {
    "message_id": "4b3c7b6c-a39d-4069-9450-2a3716cf4ca6",
    "user": {
      "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
      "role": "user",
      "created_at": "2019-04-24T09:49:47.158005Z",
      "updated_at": "2019-04-24T09:49:48.301933Z",
      "last_active": "2019-04-24T11:49:48.497656+02:00",
      "online": true
    },
    "type": "lol",
    "created_at": "2019-04-24T09:49:48.481994Z"
  },
  "user": {
    "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
    "role": "user",
    "created_at": "2019-04-24T09:49:47.158005Z",
    "updated_at": "2019-04-24T09:49:48.301933Z",
    "last_active": "2019-04-24T11:49:48.497656+02:00",
    "online": true,
    "total_unread_count": 2,
    "unread_channels": 2,
    "unread_count": 2,
    "channel_unread_count": 1,
    "channel_last_read_at": "2019-04-24T09:49:48.321138Z"
  },
  "created_at": "2019-04-24T09:49:48.511082Z"
}
```

### `member.added`

```json
{
  "cid": "messaging:fun",
  "type": "member.added",
  "member": {
    "user_id": "d4d7b21a-78d4-4148-9830-eb2d3b99c1ec",
    "user": {
      "id": "d4d7b21a-78d4-4148-9830-eb2d3b99c1ec",
      "role": "user",
      "created_at": "2019-04-24T09:49:47.149933Z",
      "updated_at": "2019-04-24T09:49:47.151159Z",
      "online": false
    },
    "created_at": "2019-04-24T09:49:48.534412Z",
    "updated_at": "2019-04-24T09:49:48.534412Z"
  },
  "user": {
    "id": "d4d7b21a-78d4-4148-9830-eb2d3b99c1ec",
    "role": "user",
    "created_at": "2019-04-24T09:49:47.149933Z",
    "updated_at": "2019-04-24T09:49:47.151159Z",
    "online": false,
    "channel_last_read_at": "2019-04-24T09:49:48.537084Z",
    "total_unread_count": 0,
    "unread_channels": 0,
    "unread_count": 0,
    "channel_unread_count": 0
  },
  "created_at": "2019-04-24T09:49:48.537082Z",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `member.updated`

```json
{
  "cid": "messaging:fun",
  "type": "member.updated",
  "member": {
    "user_id": "d4d7b21a-78d4-4148-9830-eb2d3b99c1ec",
    "user": {
      "id": "d4d7b21a-78d4-4148-9830-eb2d3b99c1ec",
      "role": "user",
      "created_at": "2019-04-24T09:49:47.149933Z",
      "updated_at": "2019-04-24T09:49:47.151159Z",
      "online": false
    },
    "is_moderator": true,
    "created_at": "2019-04-24T09:49:48.534412Z",
    "updated_at": "2019-04-24T09:49:48.547034Z"
  },
  "user": {
    "id": "d4d7b21a-78d4-4148-9830-eb2d3b99c1ec",
    "role": "user",
    "created_at": "2019-04-24T09:49:47.149933Z",
    "updated_at": "2019-04-24T09:49:47.151159Z",
    "online": false,
    "total_unread_count": 0,
    "unread_channels": 0,
    "unread_count": 0,
    "channel_unread_count": 0,
    "channel_last_read_at": "2019-04-24T09:49:48.549211Z"
  },
  "created_at": "2019-04-24T09:49:48.54921Z",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `member.removed`

```json
{
  "cid": "messaging:fun",
  "type": "member.removed",
  "user": {
    "id": "6585dbbb-3d46-4943-9b14-a645aca11df4",
    "role": "user",
    "created_at": "2019-03-22T14:22:04.581208Z",
    "online": false
  },
  "created_at": "2019-03-22T14:22:07.040496Z",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `channel.created`

```json
{
  "type": "channel.created",
  "cid": "messaging:custom-channel-7-channel-chat-1",
  "channel_id": "custom-channel-7-channel-chat-1",
  "channel_type": "messaging",
  "channel": {
    "id": "custom-channel-7-channel-chat-1",
    "type": "messaging",
    "cid": "messaging:custom-channel-7-channel-chat-1",
    "created_at": "2024-10-15T10:12:00.378448Z",
    "updated_at": "2024-10-15T10:12:00.378448Z",
    "created_by": {
      "id": "harshini-demo-ajgsteuyrgfhadbfk3858495-5608sdfhcvnmx-krjsqdgffz-hsdgfhsdfgruytghrfdgdfakytfjsdhgvsjdhfsdfgdmv",
      "role": "user",
      "created_at": "2024-09-09T09:42:59.197933Z",
      "updated_at": "2024-09-09T09:42:59.197933Z",
      "banned": false,
      "online": false
    },
    "frozen": false,
    "disabled": false,
    "members": [
      {
        "user_id": "harshini-demo",
        "user": {
          "id": "harshini-demo",
          "role": "admin",
          "created_at": "2023-10-23T06:34:21.940631Z",
          "updated_at": "2024-09-06T12:10:00.798961Z",
          "last_active": "2023-10-23T06:34:23.218561Z",
          "banned": false,
          "online": false,
          "language": "hi",
          "last_name": "Jayabalan",
          "first_name": "Harshini",
          "staff_user": true,
          "dashboard_user": true,
          "name": "Harshini",
          "image": "https://getstream.io/random_png/?name=Harshini"
        },
        "status": "member",
        "created_at": "2024-10-15T10:12:00.386198Z",
        "updated_at": "2024-10-15T10:12:00.386198Z",
        "banned": false,
        "shadow_banned": false,
        "role": "admin",
        "channel_role": "channel_member",
        "notifications_muted": false,
        "Custom": null
      }
    ],
    "member_count": 1,
    "config": {
      "created_at": "2024-02-07T08:29:49.879703Z",
      "updated_at": "2024-09-02T06:04:24.918939Z",
      "name": "messaging",
      "typing_events": true,
      "read_events": true,
      "connect_events": true,
      "search": true,
      "reactions": true,
      "replies": true,
      "quotes": true,
      "mutes": true,
      "uploads": true,
      "url_enrichment": true,
      "custom_events": true,
      "push_notifications": true,
      "reminders": false,
      "mark_messages_pending": false,
      "polls": false,
      "message_retention": "infinite",
      "max_message_length": 5000,
      "automod": "disabled",
      "automod_behavior": "flag",
      "blocklist_behavior": "flag",
      "blocklists": [
        {
          "blocklist": "profanity_en_2020_v1",
          "behavior": "block"
        }
      ],
      "commands": [
        {
          "name": "giphy",
          "description": "Post a random gif to the channel",
          "args": "[text]",
          "set": "fun_set"
        },
        {
          "name": "mute",
          "description": "Mute a user",
          "args": "[@username]",
          "set": "moderation_set"
        },
        {
          "name": "ban",
          "description": "Ban a user",
          "args": "[@username] [text]",
          "set": "moderation_set"
        },
        {
          "name": "unmute",
          "description": "Unmute a user",
          "args": "[@username]",
          "set": "moderation_set"
        },
        {
          "name": "unban",
          "description": "Unban a user",
          "args": "[@username]",
          "set": "moderation_set"
        }
      ]
    },
    "custom_data2": "test"
  },
  "user": {
    "id": "harshini-demo-ajgsteuyrgfhadbfk3858495-5608sdfhcvnmx-krjsqdgffz-hsdgfhsdfgruytghrfdgdfakytfjsdhgvsjdhfsdfgdmv",
    "role": "user",
    "created_at": "2024-09-09T09:42:59.197933Z",
    "updated_at": "2024-09-09T09:42:59.197933Z",
    "banned": false,
    "online": false
  },
  "created_at": "2024-10-15T10:12:00.402858186Z",
  "members": [
    {
      "user_id": "harshini-demo",
      "user": {
        "id": "harshini-demo",
        "role": "admin",
        "created_at": "2023-10-23T06:34:21.940631Z",
        "updated_at": "2024-09-06T12:10:00.798961Z",
        "last_active": "2023-10-23T06:34:23.218561Z",
        "banned": false,
        "online": false,
        "language": "hi",
        "dashboard_user": true,
        "channel_unread_count": 0,
        "unread_channels": 0,
        "unread_count": 0,
        "unread_threads": 0,
        "unread_thread_messages": 0,
        "first_name": "Harshini",
        "image": "https://getstream.io/random_png/?name=Harshini",
        "last_name": "Jayabalan",
        "staff_user": true,
        "channel_last_read_at": "2024-10-15T10:12:00.395195904Z",
        "total_unread_count": 0,
        "name": "Harshini"
      },
      "status": "member",
      "created_at": "2024-10-15T10:12:00.386198Z",
      "updated_at": "2024-10-15T10:12:00.386198Z",
      "banned": false,
      "shadow_banned": false,
      "role": "admin",
      "channel_role": "channel_member",
      "notifications_muted": false,
      "Custom": null
    }
  ],
  "request_info": {
    "type": "server",
    "ip": "117.201.40.78",
    "user_agent": "axios/1.6.8",
    "sdk": "stream-chat-javascript-client-node-8.31.0"
  }
}
```

### `channel.updated`

```json
{
  "cid": "messaging:fun",
  "type": "channel.updated",
  "channel": {
    "cid": "messaging:fun",
    "id": "fun",
    "type": "messaging",
    "last_message_at": "2019-04-24T09:49:48.576202Z",
    "created_by": {
      "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
      "role": "user",
      "created_at": "2019-04-24T09:49:47.158005Z",
      "updated_at": "2019-04-24T09:49:48.301933Z",
      "last_active": "2019-04-24T09:49:48.497656Z",
      "online": true
    },
    "created_at": "2019-04-24T09:49:48.180908Z",
    "updated_at": "2019-04-24T09:49:48.180908Z",
    "frozen": false,
    "config": {
      "created_at": "2016-08-18T16:42:30.586808Z",
      "updated_at": "2016-08-18T16:42:30.586808Z",
      "name": "messaging",
      "typing_events": true,
      "read_events": true,
      "connect_events": true,
      "search": true,
      "reactions": true,
      "replies": true,
      "mutes": true,
      "message_retention": "infinite",
      "max_message_length": 5000,
      "automod": "disabled",
      "commands": ["giphy", "flag", "ban", "unban", "mute", "unmute"]
    },
    "awesome": "yes"
  },
  "created_at": "2019-04-24T09:49:48.594316Z",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `channel.hidden`

```json
{
  "cid": "messaging:fun",
  "type": "channel.hidden",
  "channel": {
    "cid": "messaging:fun",
    "id": "fun",
    "type": "messaging",
    "last_message_at": "2019-04-24T09:49:48.576202Z",
    "created_by": {
      "id": "57fabaed-446a-40b4-a6ec-e0ac8cad57e3",
      "role": "user",
      "created_at": "2019-04-24T09:49:47.158005Z",
      "updated_at": "2019-04-24T09:49:48.301933Z",
      "last_active": "2019-04-24T09:49:48.497656Z",
      "online": true
    },
    "created_at": "2019-04-24T09:49:48.180908Z",
    "updated_at": "2019-04-24T09:49:48.180908Z",
    "frozen": false,
    "config": {
      "created_at": "2016-08-18T16:42:30.586808Z",
      "updated_at": "2016-08-18T16:42:30.586808Z",
      "name": "messaging",
      "typing_events": true,
      "read_events": true,
      "connect_events": true,
      "search": true,
      "reactions": true,
      "replies": true,
      "mutes": true,
      "message_retention": "infinite",
      "max_message_length": 5000,
      "automod": "disabled",
      "commands": ["giphy", "flag", "ban", "unban", "mute", "unmute"]
    },
    "awesome": "yes"
  },
  "created_at": "2019-04-24T09:49:48.594316Z",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `channel.deleted`

```json
{
  "cid": "messaging:fun",
  "type": "channel.deleted",
  "channel": {
    "cid": "messaging:fun",
    "id": "fun",
    "type": "messaging",
    "created_at": "2019-04-24T09:49:48.180908Z",
    "updated_at": "2019-04-24T09:49:48.180908Z",
    "deleted_at": "2019-04-24T09:49:48.626704Z",
    "frozen": false,
    "config": {
      "created_at": "2016-08-18T18:42:30.586808+02:00",
      "updated_at": "2016-08-18T18:42:30.586808+02:00",
      "name": "messaging",
      "typing_events": true,
      "read_events": true,
      "connect_events": true,
      "search": true,
      "reactions": true,
      "replies": true,
      "mutes": true,
      "message_retention": "infinite",
      "max_message_length": 5000,
      "automod": "disabled",
      "commands": ["giphy", "flag", "ban", "unban", "mute", "unmute"]
    }
  },
  "created_at": "2019-04-24T09:49:48.630913Z",
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### `channel.muted`

```json
{
  "type": "channel.muted",
  "user": {
    "id": "jose",
    "role": "user",
    "created_at": "2021-08-20T08:16:15.591073Z",
    "updated_at": "2024-02-14T14:12:42.275493Z",
    "last_active": "2024-02-26T13:00:34.618485977Z",
    "banned": false,
    "online": true,
    "name": "joselito"
  },
  "created_at": "2024-02-26T13:07:04.881181537Z",
  "mute": {
    "user": {
      "id": "jose",
      "role": "user",
      "created_at": "2021-08-20T08:16:15.591073Z",
      "updated_at": "2024-02-14T14:12:42.275493Z",
      "banned": false,
      "online": true,
      "name": "joselito"
    },
    "channel": {
      "id": "TeamBlue",
      "type": "messaging",
      "cid": "messaging:TeamBlue",
      "last_message_at": "2024-02-22T14:02:39.746554Z",
      "created_at": "2022-04-29T12:48:21.589157Z",
      "updated_at": "2022-04-29T12:48:21.589157Z",
      "created_by": {
        "id": "jose",
        "role": "user",
        "created_at": "2021-08-20T08:16:15.591073Z",
        "updated_at": "2024-02-14T14:12:42.275493Z",
        "last_active": "2024-02-26T13:00:34.618485977Z",
        "banned": false,
        "online": true,
        "name": "joselito"
      },
      "frozen": false,
      "disabled": false,
      "member_count": 2,
      "config": {
        "created_at": "2021-10-05T16:07:41.544996Z",
        "updated_at": "2024-02-14T16:38:03.417269Z",
        "name": "messaging",
        "typing_events": true,
        "read_events": true,
        "connect_events": true,
        "search": true,
        "reactions": true,
        "replies": true,
        "quotes": true,
        "mutes": true,
        "uploads": true,
        "url_enrichment": true,
        "custom_events": true,
        "push_notifications": true,
        "reminders": true,
        "mark_messages_pending": false,
        "message_retention": "infinite",
        "max_message_length": 5000,
        "automod": "disabled",
        "automod_behavior": "flag",
        "blocklist": "profanity_en_2020_v1",
        "blocklist_behavior": "block",
        "automod_thresholds": {},
        "commands": [
          {
            "name": "giphy",
            "description": "Post a random gif to the channel",
            "args": "[text]",
            "set": "fun_set"
          },
          {
            "name": "ban",
            "description": "Ban a user",
            "args": "[@username] [text]",
            "set": "moderation_set"
          },
          {
            "name": "unban",
            "description": "Unban a user",
            "args": "[@username]",
            "set": "moderation_set"
          },
          {
            "name": "mute",
            "description": "Mute a user",
            "args": "[@username]",
            "set": "moderation_set"
          },
          {
            "name": "unmute",
            "description": "Unmute a user",
            "args": "[@username]",
            "set": "moderation_set"
          }
        ]
      },
      "muted": true,
      "team": "blue"
    },
    "created_at": "2024-02-26T13:07:04.856723Z",
    "updated_at": "2024-02-26T13:07:04.856723Z"
  }
}
```

### `user.banned`

```json
{
  "type": "user.banned",
  "user": {
    "id": "2a653a76-ae41-4608-8092-5ce9adf5e608",
    "role": "user",
    "created_at": "2020-06-24T14:01:56.934997Z",
    "updated_at": "2020-06-24T14:01:56.935431Z",
    "banned": false,
    "online": false
  },
  "reason": "testy mctestify",
  "created_by": {
    "id": "thierry",
    "role": "user",
    "created_at": "2020-06-24T14:01:56.184699Z",
    "updated_at": "2020-06-24T14:01:56.621791Z",
    "banned": false,
    "online": true,
    "awesome": true
  },
  "created_at": "2020-06-24T14:01:56.940165Z",
  "expiration": "2020-06-24T16:01:56.93919Z"
}
```

### `user.messages.deleted`

```json
{
  "type": "user.messages.deleted",
  "created_at": "2025-05-22T15:04:28.288564946Z",
  "cid": "messaging:055e05e7-d0ed-4563-962e-db6b21ce2a5c",
  "channel_type": "messaging",
  "channel_id": "055e05e7-d0ed-4563-962e-db6b21ce2a5c",
  "user": {
    "id": "myuserid",
    "language": "",
    "role": "user",
    "teams": [],
    "created_at": "2025-05-22T14:52:12.286322Z",
    "updated_at": "2025-05-22T14:52:12.286322Z",
    "banned": false,
    "online": false,
    "blocked_user_ids": [],
    "channel_last_read_at": "0001-01-01T00:00:00Z",
    "total_unread_count": 0,
    "unread_channels": 0,
    "unread_count": 0,
    "unread_threads": 0,
    "unread_thread_messages": 0,
    "channel_unread_count": 0
  },
  "soft_delete": true,
  "hard_delete": false,
  "channel_last_message_at": "2025-05-22T15:04:26.41134Z"
}
```

```json
{
  "type": "user.messages.deleted",
  "created_at": "2025-05-22T15:11:49.761354607Z",
  "user": {
    "id": "myuserid",
    "language": "",
    "role": "user",
    "teams": [],
    "created_at": "2025-05-22T14:52:12.286322Z",
    "updated_at": "2025-05-22T14:52:12.286322Z",
    "banned": true,
    "online": false,
    "blocked_user_ids": []
  },
  "soft_delete": true,
  "hard_delete": false
}
```

### `user.deactivated`

```json
{
  "type": "user.deactivated",
  "user": {
    "id": "5f96e5dd-3998-4d0a-ae37-bd77cc67c2ce",
    "role": "user",
    "created_at": "2020-06-23T10:41:51.322897Z",
    "updated_at": "2020-06-23T10:41:51.323291Z",
    "banned": false,
    "online": false
  },
  "created_by_id": "thierry",
  "created_at": "2020-06-23T10:41:51.33211Z"
}
```

### `user.deleted`

```json
{
  "type": "user.deleted",
  "user": {
    "id": "bfdf5075-fe36-4b84-9732-39c09843dfd8",
    "role": "user",
    "created_at": "2020-06-23T10:48:37.391206Z",
    "updated_at": "2020-06-23T10:48:37.39151Z",
    "deleted_at": "2020-06-23T10:48:37.394938Z",
    "banned": false,
    "online": false
  },
  "created_at": "2020-06-23T10:48:37.396179Z"
}
```

### `user.reactivated`

```json
{
  "type": "user.reactivated",
  "user": {
    "id": "dad409c6-424c-4534-9d40-06620dbe47d8",
    "role": "user",
    "created_at": "2020-06-23T10:49:37.632951Z",
    "updated_at": "2020-06-23T10:49:37.633248Z",
    "banned": false,
    "online": false
  },
  "created_by": {
    "id": "thierry-edb850ba-9dc2-4299-91f9-73e7066daff2",
    "role": "user",
    "created_at": "2020-06-23T10:49:36.952668Z",
    "updated_at": "2020-06-23T10:49:37.337261Z",
    "last_active": "2020-06-23T10:49:37.170582Z",
    "banned": false,
    "online": true,
    "awesome": true
  },
  "created_at": "2020-06-23T10:49:37.646512Z"
}
```

### `user.unbanned`

```json
{
  "type": "user.unbanned",
  "user": {
    "id": "f867-46ed-b9ef-7dfb64f5dae2",
    "role": "user",
    "created_at": "2020-06-23T10:55:01.361163Z",
    "updated_at": "2020-06-23T10:55:01.361762Z",
    "banned": true,
    "online": false
  },
  "created_at": "2020-06-23T10:55:01.373079Z"
}
```

### `user.updated`

```json
{
  "type": "user.updated",
  "user": {
    "id": "thierry",
    "role": "user",
    "online": false,
    "awesome": true
  },
  "created_at": "2019-04-24T12:54:58.956621Z",
  "members": []
}
```

### `user.unread_message_reminder`

```json
{
  "type": "user.unread_message_reminder",
  "created_at": "2022-03-25T09:47:42.98920218Z",
  "user": {
    "id": "thierry",
    "role": "user",
    "created_at": "2022-03-25T09:47:31.683109Z",
    "updated_at": "2022-03-25T09:47:31.683109Z",
    "banned": false,
    "online": false
  },
  "channels": {
    "messaging:fun": {
      "channel": {
        "id": "be5dd20e-c65c-4b2b-b101-bc989753fff5",
        "type": "messaging",
        "cid": "messaging:fun",
        "last_message_at": "2022-03-25T09:47:42.328548Z",
        "created_at": "2022-03-25T09:47:31.615993Z",
        "updated_at": "2022-03-25T09:47:31.615993Z",
        "created_by": {
          "id": "tommaso-9564c144-05cc-4cbe-9548-2cc55e948311",
          "role": "user",
          "created_at": "2022-03-25T09:47:31.614033Z",
          "updated_at": "2022-03-25T09:47:31.614033Z",
          "banned": false,
          "online": false
        },
        "frozen": false,
        "disabled": false,
        "members": [
          {
            "user_id": "thierry",
            "user": {
              "id": "thierry",
              "role": "user",
              "created_at": "2022-03-25T09:47:31.683109Z",
              "updated_at": "2022-03-25T09:47:31.683109Z",
              "banned": false,
              "online": false
            },
            "created_at": "2022-03-25T09:47:31.748936Z",
            "updated_at": "2022-03-25T09:47:31.748936Z",
            "banned": false,
            "shadow_banned": false,
            "role": "member",
            "channel_role": "channel_member"
          },
          {
            "user_id": "tommaso",
            "user": {
              "id": "tommaso",
              "role": "user",
              "created_at": "2022-03-25T09:47:31.614033Z",
              "updated_at": "2022-03-25T09:47:31.614033Z",
              "banned": false,
              "online": false
            },
            "created_at": "2022-03-25T09:47:31.748936Z",
            "updated_at": "2022-03-25T09:47:31.748936Z",
            "banned": false,
            "shadow_banned": false,
            "role": "owner",
            "channel_role": "channel_member"
          }
        ],
        "member_count": 2,
        "config": {
          "created_at": "2022-02-02T09:07:58.934909Z",
          "updated_at": "2022-03-25T09:47:22.348561Z",
          "name": "messaging",
          "typing_events": true,
          "read_events": true,
          "connect_events": true,
          "search": true,
          "reactions": true,
          "replies": true,
          "quotes": true,
          "mutes": true,
          "uploads": true,
          "url_enrichment": true,
          "custom_events": true,
          "push_notifications": true,
          "reminders": true,
          "message_retention": "infinite",
          "max_message_length": 5000,
          "automod": "disabled",
          "automod_behavior": "flag",
          "blocklist": "forbidden-words",
          "blocklist_behavior": "flag",
          "commands": [
            {
              "name": "giphy",
              "description": "Post a random gif to the channel",
              "args": "[text]",
              "set": "fun_set"
            },
            {
              "name": "mute",
              "description": "Mute a user",
              "args": "[@username]",
              "set": "moderation_set"
            },
            {
              "name": "unmute",
              "description": "Unmute a user",
              "args": "[@username]",
              "set": "moderation_set"
            }
          ]
        }
      },
      "messages": [
        {
          "id": "aeea313d-3b89-41e3-a2dd-48508164bdf2",
          "text": "d594c5d5-b75f-488d-bf9a-129dafd90786",
          "html": "<p>d594c5d5-b75f-488d-bf9a-129dafd90786</p>\n",
          "type": "regular",
          "user": {
            "id": "tommaso",
            "role": "user",
            "created_at": "2022-03-25T09:47:31.614033Z",
            "updated_at": "2022-03-25T09:47:31.614033Z",
            "banned": false,
            "online": false
          },
          "attachments": [],
          "latest_reactions": [],
          "own_reactions": [],
          "reaction_counts": null,
          "reaction_scores": null,
          "reply_count": 0,
          "cid": "messaging:fun",
          "created_at": "2022-03-25T09:47:42.328548Z",
          "updated_at": "2022-03-25T09:47:42.328548Z",
          "shadowed": false,
          "mentioned_users": [],
          "silent": false,
          "pinned": false,
          "pinned_at": null,
          "pinned_by": null,
          "pin_expires": null
        }
      ]
    }
  }
}
```

### `export.users.success`

```json
{
  "type": "export.users.success",
  "created_at": "2025-02-23T21:16:37.747470731Z",
  "url": "https://example.com/signed-s3-url",
  "task_id": "55e445f2-0987-42a5-ab1f-4c76e896173c",
  "started_at": "2025-02-23T21:16:37.625385788Z",
  "finished_at": "2025-02-23T21:16:37.747469255Z"
}
```

### `export.users.error`

```json
{
  "type": "export.users.error",
  "created_at": "2025-02-23T21:16:37.747470731Z",
  "error": "error message",
  "task_id": "55e445f2-0987-42a5-ab1f-4c76e896173c",
  "started_at": "2025-02-23T21:16:37.625385788Z",
  "finished_at": "2025-02-23T21:16:37.747469255Z"
}
```

### `export.channels.success`

```json
{
  "type": "export.channels.success",
  "created_at": "2025-02-23T21:16:37.747470731Z",
  "url": "https://example.com/signed-s3-url",
  "task_id": "55e445f2-0987-42a5-ab1f-4c76e896173c",
  "started_at": "2025-02-23T21:16:37.625385788Z",
  "finished_at": "2025-02-23T21:16:37.747469255Z"
}
```

### `export.channels.error`

```json
{
  "type": "export.channels.error",
  "created_at": "2025-02-23T21:16:37.747470731Z",
  "error": "error message",
  "task_id": "55e445f2-0987-42a5-ab1f-4c76e896173c",
  "started_at": "2025-02-23T21:16:37.625385788Z",
  "finished_at": "2025-02-23T21:16:37.747469255Z"
}
```

### `reminder.created`

```json
{
  "type": "reminder.created",
  "created_at": "2024-01-15T10:30:00.123456Z",
  "received_at": "2024-01-15T10:30:00.124000Z",
  "message_id": "msg_12345",
  "user_id": "user_67890",
  "cid": "messaging:channel_abc123",
  "parent_id": "parent_msg_456",
  "reminder": {
    "remind_at": "2024-01-16T09:00:00.000000Z",
    "channel_cid": "messaging:channel_abc123",
    "channel": {
      "id": "channel_abc123",
      "type": "messaging",
      "cid": "messaging:channel_abc123",
      "created_at": "2024-01-10T08:00:00.000000Z",
      "updated_at": "2024-01-15T10:30:00.000000Z"
    },
    "message_id": "msg_12345",
    "message": {
      "id": "msg_12345",
      "text": "Don't forget about the meeting tomorrow",
      "created_at": "2024-01-15T10:25:00.000000Z",
      "updated_at": "2024-01-15T10:25:00.000000Z",
      "user": {
        "id": "user_67890",
        "name": "John Doe",
        "created_at": "2024-01-01T00:00:00.000000Z"
      }
    },
    "user_id": "user_67890",
    "user": {
      "id": "user_67890",
      "name": "John Doe",
      "created_at": "2024-01-01T00:00:00.000000Z"
    },
    "created_at": "2024-01-15T10:30:00.000000Z",
    "updated_at": "2024-01-15T10:30:00.000000Z"
  }
}
```

### `reminder.updated`

```json
{
  "type": "reminder.updated",
  "created_at": "2024-01-15T11:45:00.123456Z",
  "received_at": "2024-01-15T11:45:00.124000Z",
  "message_id": "msg_12345",
  "user_id": "user_67890",
  "cid": "messaging:channel_abc123",
  "parent_id": "parent_msg_456",
  "reminder": {
    "remind_at": "2024-01-16T10:00:00.000000Z",
    "channel_cid": "messaging:channel_abc123",
    "channel": {
      "id": "channel_abc123",
      "type": "messaging",
      "cid": "messaging:channel_abc123",
      "created_at": "2024-01-10T08:00:00.000000Z",
      "updated_at": "2024-01-15T11:45:00.000000Z"
    },
    "message_id": "msg_12345",
    "message": {
      "id": "msg_12345",
      "text": "Don't forget about the meeting tomorrow",
      "created_at": "2024-01-15T10:25:00.000000Z",
      "updated_at": "2024-01-15T10:25:00.000000Z",
      "user": {
        "id": "user_67890",
        "name": "John Doe",
        "created_at": "2024-01-01T00:00:00.000000Z"
      }
    },
    "user_id": "user_67890",
    "user": {
      "id": "user_67890",
      "name": "John Doe",
      "created_at": "2024-01-01T00:00:00.000000Z"
    },
    "created_at": "2024-01-15T10:30:00.000000Z",
    "updated_at": "2024-01-15T11:45:00.000000Z"
  }
}
```

### `reminder.deleted`

```json
{
  "type": "reminder.deleted",
  "created_at": "2024-01-15T12:15:00.123456Z",
  "received_at": "2024-01-15T12:15:00.124000Z",
  "message_id": "msg_12345",
  "user_id": "user_67890",
  "cid": "messaging:channel_abc123",
  "parent_id": "parent_msg_456",
  "reminder": {
    "remind_at": "2024-01-16T10:00:00.000000Z",
    "channel_cid": "messaging:channel_abc123",
    "channel": {
      "id": "channel_abc123",
      "type": "messaging",
      "cid": "messaging:channel_abc123",
      "created_at": "2024-01-10T08:00:00.000000Z",
      "updated_at": "2024-01-15T11:45:00.000000Z"
    },
    "message_id": "msg_12345",
    "message": {
      "id": "msg_12345",
      "text": "Don't forget about the meeting tomorrow",
      "created_at": "2024-01-15T10:25:00.000000Z",
      "updated_at": "2024-01-15T10:25:00.000000Z",
      "user": {
        "id": "user_67890",
        "name": "John Doe",
        "created_at": "2024-01-01T00:00:00.000000Z"
      }
    },
    "user_id": "user_67890",
    "user": {
      "id": "user_67890",
      "name": "John Doe",
      "created_at": "2024-01-01T00:00:00.000000Z"
    },
    "created_at": "2024-01-15T10:30:00.000000Z",
    "updated_at": "2024-01-15T11:45:00.000000Z"
  }
}
```

### `notification.reminder_due`

```json
{
  "type": "notification.reminder_due",
  "created_at": "2024-01-16T10:00:00.123456Z",
  "received_at": "2024-01-16T10:00:00.124000Z",
  "message_id": "msg_12345",
  "user_id": "user_67890",
  "cid": "messaging:channel_abc123",
  "parent_id": "parent_msg_456",
  "reminder": {
    "remind_at": "2024-01-16T10:00:00.000000Z",
    "channel_cid": "messaging:channel_abc123",
    "channel": {
      "id": "channel_abc123",
      "type": "messaging",
      "cid": "messaging:channel_abc123",
      "created_at": "2024-01-10T08:00:00.000000Z",
      "updated_at": "2024-01-15T11:45:00.000000Z"
    },
    "message_id": "msg_12345",
    "message": {
      "id": "msg_12345",
      "text": "Don't forget about the meeting tomorrow",
      "created_at": "2024-01-15T10:25:00.000000Z",
      "updated_at": "2024-01-15T10:25:00.000000Z",
      "user": {
        "id": "user_67890",
        "name": "John Doe",
        "created_at": "2024-01-01T00:00:00.000000Z"
      }
    },
    "user_id": "user_67890",
    "user": {
      "id": "user_67890",
      "name": "John Doe",
      "created_at": "2024-01-01T00:00:00.000000Z"
    },
    "created_at": "2024-01-15T10:30:00.000000Z",
    "updated_at": "2024-01-15T11:45:00.000000Z"
  }
}
```
