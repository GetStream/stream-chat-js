You can delete or truncate a channel to remove its contents. To remove only messages while preserving the channel, see [Truncate Channel](/chat/docs/node/truncate_channel/).

## Deleting a Channel

You can delete a single Channel using the  `delete`  method. This marks the channel as deleted and hides all the messages.

```js
const destroy = await channel.delete();
```

> [!NOTE]
> If you recreate this channel, it will show up empty. Recovering old messages is not supported. Use the disable method if you want a reversible change.


## Deleting Many Channels

You can delete up to 100 channels and optionally all of their messages using this method. This can be a large amount of data to delete, so this endpoint processes asynchronously, meaning responses contain a `task ID` which can be polled using the [getTask endpoint](/chat/docs/node#tasks-gettask) to check status of the deletions. Channels will be soft-deleted immediately so that channels no longer return from queries, but permanently deleting the channel and deleting messages takes longer to process.

By default, messages are soft deleted, which means they are removed from client but are still available via server-side export functions. You can also hard delete messages, which deletes them from everywhere, by setting `"hard_delete": true` in the request. Messages that have been soft or hard deleted cannot be recovered.

This is currently supported on the following SDK versions (or higher):

- Javascript 4.3.0, Python 3.14.0, Ruby 2.12.0, PHP 2.6.0, Go 3.13.0, Java 1.4.0, Unity 2.0.0 and .NET 0.22.0

```js
// client-side soft delete
const response = await client.deleteChannels([cid1, cid2]);
// client-side hard delete
const response = await client.deleteChannels([cid1, cid2], {
  hard_delete: true,
});
const result = response.result; // holds deletion result

// server-side soft delete
const response = await serverClient.deleteChannels([cid1, cid2]);
// server-side hard delete
const response = await serverClient.deleteChannels([cid1, cid2], {
  hard_delete: true,
});

const result = await serverClient.getTask(response.task_id);
if (result["status"] === "completed") {
  // success!
}
```

The  `deleteChannels`  response contain a taskID which can be polled using the [getTask endpoint](/chat/docs/node#tasks-gettask) to check the status of the deletions.
