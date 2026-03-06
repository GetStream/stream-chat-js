Hiding a channel removes it from query channel requests for that user until a new message is added. Only channel members can hide a channel.

Hidden channels may still have unread messages. Consider [marking the channel as read](/chat/docs/node/unread/) before hiding it.

You can optionally clear the message history for that user when hiding. When a new message is received, it will be the only message visible to that user.

## Hide a Channel

```js
// hides the channel until a new message is added there
await channel.hide();

// hides the channel until a new message is added there. This also clears the history for the user
await channel.hide(null, true);

// shows a previously hidden channel
await channel.show();
```

> [!NOTE]
> You can still retrieve the list of hidden channels using the `{ "hidden" : true }` query parameter.
