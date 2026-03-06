Silent and system messages provide ways to add informational content to channels without disrupting users.

## Silent Messages

Silent messages do not increment unread counts or mark channels as unread. Use them for transactional or automated content such as:

- "Your ride is waiting"
- "James updated the trip information"
- "You and Jane are now matched"

Set `silent: true` when sending a message.

```js
const message = {
  text: "You completed your trip",
  user: systemUser,
  silent: true,
  attachments: [{ type: "trip", ...tripData }],
};
await channel.sendMessage(message);
```

> [!NOTE]
> Existing messages cannot be converted to silent messages.


> [!NOTE]
> Silent replies still increment the parent message's `reply_count`.


> [!NOTE]
> Silent messages still trigger push notifications by default. Set `skip_push: true` to disable push notifications. See [Messages Overview](/chat/docs/node/send_message/) for details.


## System Messages

System messages have a distinct visual presentation, typically styled differently from user messages. Set `type: "system"` to create a system message.

Stream's UI SDKs include default styling for system messages. However, customizing their appearance is common to match your application's design. See your platform's UI customization documentation for details on styling system messages.

Client-side users require the `Create System Message` permission. Server-side system messages do not require this permission.

```js
const message = {
  text: "You completed your trip",
  user: systemUser,
  type: "system",
};
await channel.sendMessage(message);
```
