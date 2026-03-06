---
title: Batch updates
slug: /chat/docs/$REPLACE_FRAMEWORK/batch_updates/
---

## Batch updates

You can perform batch updates on multiple channels at once. This is useful for making changes to a large number of channels without having to update each one individually, which could result in potentially thousands of API calls.

This functionality, unlike the single version of update channel, works asynchronously. This means that the request will return immediately, and the updates will be processed in the background.

When the update is requested, a task will be created and the task ID will be returned in the response. You can use this task ID to check the status of the update operation.

## How to target channels

In order to perform batch updates, you need to target which channels you want to update.

You can do this by providing a filter that matches the channels you want to update.

The filters that are supported for batch updates are:

| Name    | Description                                                                                                                                                | Available Operators                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cids`  | Filters channels by Channel ID (CID) in the format `type:id` (e.g., `"messaging:channel1"`). Must use explicit operators. Direct arrays are not supported. | `$eq`: Single CID value (e.g., `{"cids": {"$eq": "messaging:channel1"}}`)<br>`$in`: Multiple CID values (e.g., `{"cids": {"$in": ["messaging:channel1", "livestream:channel2"]}}`) |
| `types` | Filters channels by channel type (e.g., `"messaging"`, `"livestream"`, `"team"`). Must use explicit operators. Direct arrays are not supported.            | `$eq`: Single channel type (e.g., `{"types": {"$eq": "messaging"}}`)<br>`$in`: Multiple channel types (e.g., `{"types": {"$in": ["messaging", "livestream"]}}`)                    |

### Filter examples

```js
// 1) Filter by type
const filters = {
  types: { $in: ["messaging"] },
};

// 2) Filter by specific CIDs
const filtersByCIDS = {
  channel_cids: {
    $in: [
      "messaging:3b11838a-7734-4ece-8547-4b8524257671",
      "messaging:a266bee6-dc3c-4188-a37d-e554d4bfac34",
      "messaging:40fef12a-0b7c-4bcf-bd97-3ddf604efed5",
      "messaging:2a58963e-d769-4ce3-9309-bff93c14db57",
    ],
  },
};
```

## Supported operations

You can perform different operations on the channels but only once at a time. The supported operations are:

| Operation Name   | Description                                           | Parameters  |
| ---------------- | ----------------------------------------------------- | ----------- |
| addMembers       | Add members to the channels.                          | members     |
| removeMembers    | Remove members from the channels.                     | members     |
| addModerators    | Add moderators to the channels.                       | members     |
| demoteModerators | Remove moderator status from members in the channels. | members     |
| hide             | Hide the channels for members.                        | members     |
| show             | Show the channels for members.                        | members     |
| archive          | Archive the channels for members.                     | members     |
| unarchive        | Unarchive the channels for members.                   | members     |
| updateData       | Update the channel data for the channels.             | channelData |
| assignRoles      | Assign roles to members in the channels.              | members     |
| inviteMembers    | Send invites to users to join the channels.           | members     |

## Channel data update properties

When using the `updateData` operation, you can update the following channel properties. All properties are optional - only the provided values will be updated.

| Property                    | Type    | Description                                  |
| --------------------------- | ------- | -------------------------------------------- |
| `frozen`                    | boolean | Freeze the channel to prevent new messages   |
| `disabled`                  | boolean | Disable the channel                          |
| `custom`                    | object  | Custom data fields for the channel           |
| `team`                      | string  | Team ID to assign the channel to             |
| `config_overrides`          | object  | Override channel type configuration settings |
| `auto_translation_enabled`  | boolean | Enable automatic message translation         |
| `auto_translation_language` | string  | Language code for auto translation           |

### Config overrides

The `config_overrides` object allows you to override the default channel type configuration for specific channels:

| Property             | Type    | Description                              |
| -------------------- | ------- | ---------------------------------------- |
| `typing_events`      | boolean | Enable/disable typing indicators         |
| `reactions`          | boolean | Enable/disable message reactions         |
| `replies`            | boolean | Enable/disable message replies (threads) |
| `quotes`             | boolean | Enable/disable message quotes            |
| `uploads`            | boolean | Enable/disable file uploads              |
| `url_enrichment`     | boolean | Enable/disable URL preview enrichment    |
| `max_message_length` | integer | Maximum message length (1-20000)         |
| `blocklist`          | string  | Name of the blocklist to apply           |
| `blocklist_behavior` | string  | Blocklist behavior: `flag` or `block`    |
| `grants`             | object  | Permission grants modifiers              |
| `commands`           | array   | List of enabled command names            |

Most of the operations require additional parameters to be specified, such as the _members_ to add or remove, or the _channelData_ to update.

We've prepared convenience methods for all operations, some examples are shown below:

```js
// Add members
const updater = client.channelBatchUpdater();
const filter = {
  types: {
    $in: ["messaging"],
  },
};

const members = ["user-123"];

const resp = await updater.addMembers(filter, members);

// Update channel data
const updater = client.channelBatchUpdater();
const filter = {
  types: {
    $in: ["messaging", "team"],
  },
};

const data = {
  frozen: true,
  custom: {
    color: "blue",
  },
};

const resp = await updater.updateData(filter, data);
```

## Webhooks

When an update is started via batch updates, a webhook event `channel_batch_update.started` will be triggered.

Additionally, for each channel that is updated, the corresponding webhook events will be triggered as well.
For example, if members are added to channels, the `member.added` event will be triggered for each channel that is updated.

When the batch update operation is completed, a webhook event `channel_batch_update.completed` will be triggered. This event will contain the task ID and the status of the operation (success or failure).

For the format of the status please see next section.

## Status

You can check the status of a batch update operation by using the task ID returned when the operation was started.

To get the status of the task, you use the `Get Task` endpoint with the task ID.

```js
const taskResponse = await client.getTask({ id: response.task_id });
```

The response will contain information about the task, including its status, result, and any errors that occurred during the operation.

```json
{
  "task_id": "23685bb3-d1c7-492b-a02a-3dbaa12855e1",
  "status": "completed",
  "created_at": "2025-12-13T10:25:15.856428Z",
  "updated_at": "2025-12-13T10:35:00.512601Z",
  "result": {
    "operation": "show",
    "status": "completed",
    "success_channels_count": 1080,
    "task_id": "23685bb3-d1c7-492b-a02a-3dbaa12855e1",
    "batch_created_at": "2025-12-13T10:25:16Z",
    "failed_channels": [
      {
        "reason": "cannot invite members to the distinct channel",
        "cids": ["messaging:550e8400-e29b-41d4-a716-446655440000"]
      },
      {
        "reason": "user not found: user_id 'user_12345' does not exist",
        "cids": ["team:7c9e6679-7425-40de-944b-e07fc1f90ae7"]
      }
    ],
    "finished_at": "2025-12-13T10:35:00.512579053Z"
  },
  "duration": "36.23ms"
}
```

You can try to re apply the operation on the failed channels again by creating a new task with the same operation and just the CIDs of the failed channels.
