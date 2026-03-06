Freezing a channel prevents users from sending new messages and adding or deleting reactions.

Sending a message to a frozen channel returns an error message. Attempting to add or delete reactions returns a `403 Not Allowed` error.

User roles with the `UseFrozenChannel` permission can still use frozen channels normally. By default, no user role has this permission.

## Freeze a Channel

```js
const update = await channel.update(
	{ frozen: true },
	{ text: 'Thierry has frozen the channel', user_id: "Thierry" }
)

const update = await channel.updatePartial(
	{set: {frozen: true}
)
```

## Unfreeze a Channel

```js
const update = await channel.update(
  { frozen: false },
  { text: "Thierry has unfrozen the channel", user_id: "Thierry" },
);
```

## Granting the Frozen Channel Permission

Permissions are typically managed in the [Stream Dashboard](https://dashboard.getstream.io/) under your app's **Roles & Permissions** settings. This is the recommended approach for most use cases.

To grant permissions programmatically, update the channel type using a server-side API call. See [user permissions](/chat/docs/node/chat_permission_policies/) for more details.

```js
const { grants } = await client.getChannelType("messaging");
grants.admin.push("use-frozen-channel");
await client.updateChannelType("messaging", {
  grants: { admin: grants.admin },
});
```
