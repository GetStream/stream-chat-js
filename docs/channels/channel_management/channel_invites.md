Invites allow you to add users to a channel with a pending state. The invited user receives a notification and can accept or reject the invite.

Unread counts are not incremented for channels with a pending invite.

## Invite Users

```js
await channel.inviteMembers(["nick"]);
```

## Accept an Invite

Call `acceptInvite` to accept a pending invite. You can optionally include a `message` parameter to post a system message when the user joins (e.g., "Nick joined this channel!").

```js
// initialize the channel
const channel = client.channel("messaging", "awesome-chat");

// accept the invite
await channel.acceptInvite({
  message: { text: "Nick joined this channel!" },
});

// accept the invite server side
await channel.acceptInvite({ user_id: "nick" });
```

## Reject an Invite

Call `rejectInvite` to decline a pending invite. Client-side calls use the currently connected user. Server-side calls require a `user_id` parameter.

```js
await channel.rejectInvite();

//server side
await channel.rejectInvite({ user_id: "rob" });
```

## Query Invites by Status

Use `queryChannels` with the `invite` filter to retrieve channels based on invite status. Valid values are `pending`, `accepted`, and `rejected`.

### Query Accepted Invites

```js
const invites = await client.queryChannels({
  invite: "accepted",
});

//server side (query invites for user rob)
const invites = await client.queryChannels(
  {
    invite: "accepted",
  },
  {},
  { user_id: "rob" },
);
```

### Query Rejected Invites

```js
const rejected = client.queryChannels({
  invite: "rejected",
});

//server side (query invites for user rob)
const invites = await client.queryChannels(
  {
    invite: "rejected",
  },
  {},
  { user_id: "rob" },
);
```

### Query Pending Invites

```js
const rejected = client.queryChannels({
  invite: "pending",
});

//server side (query invites for user rob)
const invites = await client.queryChannels(
  {
    invite: "pending",
  },
  {},
  { user_id: "rob" },
);
```
