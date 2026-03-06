Channel members are users who have been added to a channel and can participate in conversations. This page covers how to manage channel membership, including adding and removing members, controlling message history visibility, and managing member roles.

## Adding and Removing Members

### Adding Members

Using the `addMembers()` method adds the given users as members to a channel.

```js
await channel.addMembers(["thierry", "josh"]);

// Add user to the channel with role set
await channel.addMembers([
  { user_id: "james_bond", channel_role: "channel_moderator" },
]);

// Add new channel member with custom data
await channel.addMembers([{ user_id: "james_bond", code_name: "007" }]);
```

> [!NOTE]
> **Note:** You can only add/remove up to 100 members at once.


Members can also be added when creating a channel:

```js
const channel = client.channel("messaging", randomID, {
  members: [
    { user_id: "james_bond", code_name: "007" },
    { user_id: "alec_trevelyan", code_name: "006" },
  ],
});
await channel.create();
```

### Removing Members

Using the `removeMembers()` method removes the given users from the channel.

```js
await channel.removeMembers(["tommaso"]);
```

### Leaving a Channel

Users can leave a channel without moderator-level permissions. Ensure channel members have the `Leave Own Channel` permission enabled.

```js
// Remove own channel membership
await channel.removeMembers(["my_user_id"]);
```

> [!NOTE]
> You can familiarize yourself with all permissions in the [Permissions section](/chat/docs/node/chat_permission_policies/).


## Hide History

When members join a channel, you can specify whether they have access to the channel's message history. By default, new members can see the history. Set `hide_history` to `true` to hide it for new members.

```js
await channel.addMembers(["thierry"], undefined, { hide_history: true });
```

### Hide History Before a Specific Date

Alternatively, `hide_history_before` can be used to hide any history before a given timestamp while giving members access to later messages. The value must be a timestamp in the past in RFC 3339 format. If both parameters are defined, `hide_history_before` takes precedence over `hide_history`.

```js
const cutoff = new Date();
cutoff.setDate(date.getDate() - 7); // Last 7 days
await channel.addMembers(["thierry"], undefined, {
  hide_history_before: cutoff.toISOString(),
});
```

## System Message Parameter

You can optionally include a message object when adding or removing members that client-side SDKs will use to display a system message. This works for both adding and removing members.

```js
// Using client-side client
await channel.addMembers(["tommaso"], { text: "Tommaso joined the channel." });

// Using server-side client, you need to specify the sender user_id
await channel.addMembers(["tommaso"], {
  text: "Tommaso joined the channel.",
  user_id: "tommaso",
});
```

## Adding and Removing Moderators

Using the `addModerators()` method adds the given users as moderators (or updates their role to moderator if already members), while `demoteModerators()` removes the moderator status.

### Add Moderators

```js
await channel.addModerators(["thierry", "josh"]);
```

### Remove Moderators

```js
await channel.demoteModerators(["tommaso"]);
```

> [!NOTE]
> These operations can only be performed server-side, and a maximum of 100 moderators can be added or removed at once.


## Member Custom Data

Custom data can be added at the channel member level. This is useful for storing member-specific information that is separate from user-level data. Ensure custom data does not exceed 5KB.

### Adding Custom Data

```js
// Add custom data while creating the channel
const channel = client.channel("messaging", randomID, {
  members: [
    { user_id: "userid1", key1: "value1" },
    { user_id: "userid2", key1: "value1" },
    { user_id: "userid3", key2: "value2" },
  ],
});

// Add custom data with addMembers method
await channel.addMembers([{ user_id: "userid1", key1: "value1" }]);
```

### Updating Member Data

Channel members can be partially updated. Only custom data and channel roles are eligible for modification. You can set or unset fields, either separately or in the same call.

```js
// Set some fields
await channel.updateMemberPartial(
  {
    set: {
      key1: "new value 1",
      key2: "new value 2",
      channel_role: "channel_moderator",
    },
  },
  { userId: "jane" },
);

// Unset some fields
await channel.updateMemberPartial(
  {
    unset: ["key1", "key2"],
  },
  { userId: "jane" },
);

// Set and unset in the same call
await channel.updateMemberPartial(
  {
    set: {
      key1: "new value 1",
      key2: "new value 2",
    },
    unset: ["key3"],
  },
  { userId: "jane" },
);
```
