Disabling a channel is a visibility and access toggle. The channel and all its data remain intact, but client-side read and write operations return a `403 Not Allowed` error. Server-side access is preserved for admin operations like moderation and data export.

Disabled channels still appear in query results by default. This means users see the channel in their list but receive errors when attempting to open it. To hide disabled channels from users, filter them out in your queries:

```js
await client.queryChannels({ disabled: false });
```

Re-enabling a channel restores full client-side access with all historical messages intact.

## Disable a Channel

```js
// disable a channel with full update
await channel.update({ disabled: true });

// disable a channel with partial update
await channel.updatePartial({ set: { disabled: true } });

// enable a channel with full update
await channel.update({ disabled: false });

// enable a channel with partial update
await channel.updatePartial({ set: { disabled: false } });
```

> [!NOTE]
> To prevent new messages while still allowing users to read existing messages, use [freeze the channel](/chat/docs/node/freezing_channels/) instead.
