Channel members can archive a channel for themselves. This is a per-user setting that does not affect other members.

Archived channels function identically to regular channels via the API, but your UI can display them separately. When a channel is archived, the timestamp is recorded and returned as `archived_at` in the response.

When querying channels, filter by `archived: true` to retrieve only archived channels, or `archived: false` to exclude them.

## Archive a Channel

```js
// Get a channel
const channel = client.channel("messaging", "example");

// Archive the channel
await channel.archive();

// Query for channels that are not archived
const resp = await client.queryChannels({ archived: false });

// Unarchive the channel
await channel.unarchive();
```

## Global Archiving

Channels are archived for a specific member. If the channel should instead be archived for all users, this can be stored as custom data in the channel itself. The value cannot collide with existing fields, so use a value such as `globally_archived: true`.
