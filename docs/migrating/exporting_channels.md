Export channels and users to retrieve messages, metadata, and associated data. All exports run asynchronously and return a task ID for tracking status.

> [!NOTE]
> All export endpoints require server-side authentication.


## Exporting Channels

```js
// Export a single channel
const response = await serverClient.exportChannel(
  {
    type: "livestream",
    id: "white-room",
    messages_since: "2020-11-10T09:30:00.000Z",
    messages_until: "2020-11-10T11:30:00.000Z",
  },
  {
    include_truncated_messages: true,
    include_soft_deleted_channels: true,
  },
);

const taskID = response.task_id;

// Export multiple channels
const response = await serverClient.exportChannels(
  [
    {
      type: "livestream",
      id: "white-room",
      messages_since: "2020-11-10T09:30:00.000Z",
      messages_until: "2020-11-10T11:30:00.000Z",
    },
    {
      type: "livestream",
      id: "white-room2",
    },
  ],
  {
    include_truncated_messages: true,
    include_soft_deleted_channels: true,
  },
);
const taskID = response.task_id;
```

### Channel Export Options

| Parameter                       | Description                                                 |
| ------------------------------- | ----------------------------------------------------------- |
| `type`                          | Channel type (required)                                     |
| `id`                            | Channel ID (required)                                       |
| `messages_since`                | Export messages after this timestamp (RFC3339 format)       |
| `messages_until`                | Export messages before this timestamp (RFC3339 format)      |
| `include_truncated_messages`    | Include messages that were truncated (default: `false`)     |
| `include_soft_deleted_channels` | Include soft-deleted channels (default: `false`)            |
| `version`                       | Export format: `v1` (default) or `v2` (line-separated JSON) |

> [!NOTE]
> A single request can export up to 25 channels.


### Export Format (v2)

Add `version: "v2"` for line-separated JSON output, where each entity appears on its own line.

```js
const response = await serverClient.exportChannel(
  {
    type: "livestream",
    id: "white-room",
  },
  {
    version: "v2",
  },
);
```

### Checking Export Status

Poll the task status using the returned task ID. When the task completes, the response includes a URL to download the JSON export file.

```js
const response = await serverClient.getExportChannelStatus(taskId);

console.log(response.status); // Task status
console.log(response.result); // Result object (when completed)
console.log(response.result.url); // Download URL
console.log(response.error); // Error description (if failed)
```

> [!NOTE]
> - Download URLs expire after 24 hours but are regenerated on each status request
> - Export files remain available for 60 days
> - Timestamps use UTC in RFC3339 format (e.g., `2021-02-17T08:17:49.745857Z`)


## Exporting Users

Export user data including messages, reactions, calls, and custom data. The export uses line-separated JSON format (same as channel export v2).

```js
const response = await serverClient.exportUsers({
  user_ids: [user1.id, user2.id],
});
const taskID = response.task_id;
```

> [!NOTE]
> A single request can export up to 25 users with a maximum of 10,000 messages per user. [Contact support](https://getstream.io/contact/support/) to export users with more than 10,000 messages.


### Checking Export Status

```js
const response = await serverClient.getTask(taskId);

if (response.status === "completed") {
  console.log(response.result.url);
}
```
