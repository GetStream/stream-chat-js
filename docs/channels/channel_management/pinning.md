Channel members can pin a channel for themselves. This is a per-user setting that does not affect other members.

Pinned channels function identically to regular channels via the API, but your UI can display them separately. When a channel is pinned, the timestamp is recorded and returned as `pinned_at` in the response.

When querying channels, filter by `pinned: true` to retrieve only pinned channels, or `pinned: false` to exclude them. You can also sort by `pinned_at` to display pinned channels first.

## Pin a Channel

```js
// Get a channel
const channel = client.channel("messaging", "example");

// Pin the channel
await channel.pin();

// Query for channels that are pinned
const resp = await client.queryChannels({ pinned: true });

// Query for channels for specific members and show pinned first
const pinnedFirst = await client.queryChannels(
  { members: { $in: ["amy", "ben"] } },
  { pinned_at: -1 },
);

// Unpin the channel
await channel.unpin();
```

## Global Pinning

Channels are pinned for a specific member. If the channel should instead be pinned for all users, this can be stored as custom data in the channel itself. The value cannot collide with existing fields, so use a value such as `globally_pinned: true`.
