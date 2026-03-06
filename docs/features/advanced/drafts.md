Draft messages allow users to save messages as drafts for later use. This feature is useful when users want to compose a message but aren't ready to send it yet.

## Creating a draft message

It is possible to create a draft message for a channel or a thread. Only one draft per channel/thread can exist at a time, so a newly created draft overrides the existing one.

```js
const draft = await channel.createDraft({
  text: "this is a draft message",
});

// Update the draft
const draft = await channel.createDraft({
  text: "this is an updated draft message",
});

// Create a draft on a thread
const draft = await channel.createDraft({
  text: "this is a draft message",
  parent_id: parentMessageId,
});
```

## Deleting a draft message

You can delete a draft message for a channel or a thread as well.

```js
// Channel draft
await channel.deleteDraft();

// Thread draft
await channel.deleteDraft({ parent_id: parentMessageId });
```

## Loading a draft message

It is also possible to load a draft message for a channel or a thread. Although, when querying channels, each channel will contain the draft message payload, in case there is one. The same for threads (parent messages). So, for the most part this function will not be needed.

```js
// Channel draft
const draft = await channel.getDraft();

// Thread draft
const threadDraft = await channel.getDraft({ parent_id: parentMessageId });
```

## Querying draft messages

The Stream Chat SDK provides a way to fetch all the draft messages for the current user. This can be useful to for the current user to manage all the drafts they have in one place.

```js
// Query all user drafts
const response = await client.queryDrafts({});

// Query drafts for certain channels and sort
const response = await client.queryDrafts({
  filter: {
    channel_cid: { $in: ["messaging:channel-1", "messaging:channel-2"] },
  },
  sort: [{ field: "created_at", direction: -1 }],
});
```

Filtering is possible on the following fields:

| Name        | Type                       | Description                    | Supported operations      | Example                                                |
| ----------- | -------------------------- | ------------------------------ | ------------------------- | ------------------------------------------------------ |
| channel_cid | string                     | the ID of the message          | $in, $eq                  | { channel_cid: { $in: [ 'channel-1', 'channel-2' ] } } |
| parent_id   | string                     | the ID of the parent message   | $in, $eq, $exists         | { parent_id: 'parent-message-id' }                     |
| created_at  | string (RFC3339 timestamp) | the time the draft was created | $eq, $gt, $lt, $gte, $lte | { created_at: { $gt: '2024-04-24T15:50:00.00Z' }       |

Sorting is possible on the `created_at` field. By default, draft messages are returned with the newest first.

### Pagination

In case the user has a lot of draft messages, you can paginate the results.

```js
// Query drafts with a limit
const firstPage = await client.queryDrafts({
  limit: 5,
});

// Query the next page
const secondPage = await client.queryDrafts({
  limit: 5,
  next: firstPage.next,
});
```

## Events

The following WebSocket events are available for draft messages:

- `draft.updated`, triggered when a draft message is updated.
- `draft.deleted`, triggered when a draft message is deleted.

You can subscribe to these events using the Stream Chat SDK.

```js
client.on("draft.updated", (event) => {
  // Handle event
  console.log("event", event);
  console.log("channel_cid", event.draft.channel_cid);
});
```
