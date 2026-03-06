There are two ways to update a channel with the Stream API: partial updates and full updates. A partial update preserves existing custom key–value data, while a full update replaces the entire channel object and removes any fields not included in the request.

## Partial Update

A partial update lets you set or unset specific fields without affecting the rest of the channel’s custom data — essentially a patch-style update.

```js
// Here's a channel with some custom field data that might be useful
const channel = client.channel(type, id, {
  source: "user",
  source_detail: { user_id: 123 },
  channel_detail: { topic: "Plants and Animals", rating: "pg" },
});

// let's change the source of this channel
await channel.updatePartial({ set: { source: "system" } });

// since it's system generated we no longer need source_detail
await channel.updatePartial({ unset: ["source_detail"] });

// and finally update one of the nested fields in the channel_detail
await channel.updatePartial({ set: { "channel_detail.topic": "Nature" } });

// and maybe we decide we no longer need a rating
await channel.updatePartial({ unset: ["channel_detail.rating"] });
```

## Full Update

The `update` function updates all of the channel data. **Any data that is present on the channel and not included in a full update will be deleted.**

```js
const update = await channel.update({
  name: "myspecialchannel",
  color: "green",
});
```

### Request Params

| Name         | Type   | Description                                                                                                                                                                          | Optional |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| channel data | object | Object with the new channel information. One special field is "frozen". Setting this field to true will freeze the channel. Read more about freezing channels in "Freezing Channels" |          |
| text         | object | Message object allowing you to show a system message in the Channel that something changed.                                                                                          | Yes      |

> [!NOTE]
> Updating a channel using these methods cannot be used to add or remove members. For this, you must use specific methods for adding/removing members, more information can be found [here](/chat/docs/node/channel_members/).
