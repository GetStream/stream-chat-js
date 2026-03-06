Message history lets you keep a history of changes to messages. These **only** include the changes to the following fields:

- Text

- Attachments

- Any custom field

- Whether the message is soft deleted

The value of the fields **before the update** , will be stored in the message history. Since the present state is already available and otherwise some information will be lost.

The **time** when the change was made ( `message_updated_at` ) and the **user** who made the change ( `message_updated_by_id` ) will also be stored.

> [!NOTE]
> This feature is only available on Stream’s Enterprise pricing plans. Request the Stream team to enable this feature for your app by [contacting support](https://getstream.io/contact/support/).


## Example

Let's assume we have a channel with users **alice** and **bob** . We have the user **admin** with the `admin` role as well.

- **alice** sends a message:

```js
const message = await channel.sendMessage({
  id: "message-1",
  text: "Hello bob! give me a call.",
});
```

Note that sending a new message won't create a history record.

- **alice** notices she didn't include her number. So she edits the message to include it:

```js
await client.updateMessage({
  id: "message-1",
  text: "Hello bob! give me a call. Here is my number: +31 6 12345678",
});
```

This step will be recorded in the message history.

- **admin** notices the message and since sending numbers is not allowed, he/she edits the message to remove the number:

```js
await adminClient.updateMessage({
  id: "message-1",
  text: "Hello bob! give me a call. Here is my number: [removed]",
});
```

This step will also be recorded in the message history.

- Now customer support takes a look at message history by calling the **server-side only** API:

```js
const history = await serverClient.queryMessageHistory({
  message_id: "message-1",
});
```

There will be two histories:

```json
[
 {
   "message_id": "message-1",
   "text": "Hello bob! give me a call. Here is my number: +31 6 12345678",
   "message_updated_by_id": "admin",
   "message_updated_at" "2024-04-24T15:50:21"
 },
 {
   "message_id": "message-1",
   "text": "Hello bob! give me a call.",
   "message_updated_by_id": "alice",
   "message_updated_at" "2024-04-24T15:47:46"
 }
]
```

By default, you get the history sorted by latest first.

## Querying message history

It is possible to filter and sort when querying message history. Note that this is a **server-side only** API.

| Name                  | type                                             | Description                                     | Supported operations      | Example                                                  |
| --------------------- | ------------------------------------------------ | ----------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| message_id            | string or list of strings                        | the ID of the message                           | $in, $eq                  | { message_id: { $in: [ 'message-1', 'message-2' ] } }    |
| message_updated_by_id | string or list of strings                        | the ID of the user who made updates to messages | $in, $eq                  | { message_updated_by_id: { $in: [ 'alice', 'bob' ] } }   |
| message_updated_at    | string, must be formatted as a RFC3339 timestamp | the time the update was made                    | $eq, $gt, $lt, $gte, $lte | { message_updated_at: {$gte: ‘2024-04-24T15:50:00.00Z’ } |

Example query:

```js
// sorted by `message_updated_at` ascending:
const history = await client.queryMessageHistory(
  { message_id: "message-1" },
  { message_updated_at: 1 },
);
```

Response:

```json
[
  {
    "message_id": "message-1",
    "text": "Hello bob! give me a call.",
    "is_deleted": false
    "message_updated_by_id": "alice",
    "message_updated_at" "2024-04-24T15:47:46"
  },
  {
    "message_id": "message-1",
    "text": "Hello bob! give me a call. Here is my number: +31 6 12345678",
    "is_deleted": false,
    "message_updated_by_id": "admin",
    "message_updated_at" "2024-04-24T15:50:21"
  }
]
```
