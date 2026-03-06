Unread reminders notify users about messages they have not read. Use them to trigger emails, push notifications, or SMS.

When enabled, Stream Chat sends a webhook or SQS event when a user has an unread message in a channel (with 10 or fewer members) for longer than the configured interval.

## Enabling Unread Reminders

Enable reminders for a channel type and configure the reminder interval.

```js
// Enable reminders for the messaging channel type
await client.updateChannelType("messaging", {
  reminders: true,
});

// Change reminders interval to 1 hour (default is 5 minutes)
await client.updateAppSettings({ reminders_interval: 3600 });
```

The reminder interval can be set between 60 seconds and 86,400 seconds (24 hours). The default is 5 minutes.

### Requirements

Reminders are sent only when all conditions are met:

- The channel has 10 members or fewer
- The channel type has `reminders` enabled
- The channel has at least one unread message
- The channel has `read_events` enabled
- The unread message type is `regular` or `system`
- The message is not deleted
- The channel is not deleted

> [!NOTE]
> The default channel member limit is 10. To increase this limit, [upgrade to an Enterprise plan](https://getstream.io/chat/pricing) and [contact support](https://getstream.io/contact/support/).


## Reminder Event

Reminder events contain all information needed to send notifications without additional API calls.

### Event Fields

| Field      | Description                                                         |
| ---------- | ------------------------------------------------------------------- |
| type       | Event type: `user.unread_message_reminder`                          |
| user       | The user who has unread messages                                    |
| channels   | Object containing channels with unread messages (up to 10 channels) |
| created_at | Timestamp when the event was sent                                   |

### Channel Object Fields

| Field    | Description                                          |
| -------- | ---------------------------------------------------- |
| channel  | Channel object including member list                 |
| messages | Last 5 messages in the channel (in descending order) |

<details>
<summary>Example Event</summary>

```json
{
  "type": "user.unread_message_reminder",
  "created_at": "2022-09-22T12:11:01.258013863Z",
  "user": {
    "id": "jose",
    "role": "user",
    "created_at": "2021-08-20T08:16:15.591073Z",
    "updated_at": "2022-09-22T12:07:39.675943Z",
    "last_active": "2022-09-21T09:49:09.750498Z",
    "banned": false,
    "online": false,
    "teams": ["blue"],
    "name": "jose"
  },
  "channels": {
    "messaging:!members-NsJg6rJv7n1wrpi4NyA5zNGBCpih_eYaQdY6KARmEHo": {
      "channel": {
        "id": "!members-NsJg6rJv7n1wrpi4NyA5zNGBCpih_eYaQdY6KARmEHo",
        "type": "messaging",
        "cid": "messaging:!members-NsJg6rJv7n1wrpi4NyA5zNGBCpih_eYaQdY6KARmEHo",
        "last_message_at": "2022-09-22T12:10:01.833367Z",
        "created_at": "2022-08-24T17:19:28.792836Z",
        "updated_at": "2022-08-24T17:19:28.792836Z",
        "frozen": false,
        "disabled": false,
        "member_count": 2,
        "members": [
          {
            "user_id": "jose",
            "user": {
              "id": "jose",
              "name": "jose"
            },
            "role": "member"
          },
          {
            "user_id": "pepe",
            "user": {
              "id": "pepe"
            },
            "role": "owner"
          }
        ]
      },
      "messages": [
        {
          "id": "8009180a-ef37-4818-b4fd-e69a7312d77e",
          "text": "hola",
          "type": "regular",
          "user": {
            "id": "pepe"
          },
          "created_at": "2022-09-22T12:05:05.641171Z"
        }
      ]
    }
  }
}
```

</details>
