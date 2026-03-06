Stream can support [millions of watchers](https://getstream.io/blog/scaling-chat-5-million-concurrent-connections/) in a channel, but sometimes, this can create a lot of noise when many people send messages simultaneously. Dynamic partitioning allows for splitting the channel into virtual partitions where users only interact with users within the same partition. It boosts engagement by grouping users into smaller partitions with balanced capacities according to configurable settings.

Dynamic partitioning is particularly useful in scenarios where a large number of people are engaging in a live event, such as a game, a live stream, or a webinar. With so many messages flooding the channel, it can quickly become overwhelming, making it difficult for meaningful engagement to occur among participants. To address this, dynamic partitioning divides watchers into smaller partitions within the channel, boosting the chances of meaningful and enjoyable interactions without restricting the volume of messages sent.

Dynamic Partitioning is transparent to connected clients, except for receiving fewer messages.

![Partition split](https://getstream.imgix.net/docs/88b388d1-1367-4fea-a80f-359b0041954f.png?auto=compress&fit=clip&w=800&h=600)

[System messages](/chat/docs/node/silent_messages/) are always delivered to all partitions.

### Enabling Dynamic Partitioning

> [!NOTE]
> This feature is only available on Stream's Enterprise pricing plans. Request the Stream team to enable this feature for your app by [contacting support](https://getstream.io/contact/support/).


Dynamic partitioning is configured on a channel type level and can be enabled by setting the `partition_size` to a number for how many people should appear in each partition, such as `100` . When enabled, the channel is divided into smaller partitions that all attempt to keep approximately the desired number of users in each partition. When a user sends a message, it is only delivered to other users on the same partition.

```js
await client.createChannelType({
  name: "example",
  partition_size: 100,
});

const channel = client.channel("example", "test", {
  created_by_id: "admin",
});
await channel.create();
```

The minimum partition size is `10` , and there is no maximum. Dynamic partitioning can only be configured from server clients.

Partitions are added and removed automatically, and clients are moved to new partitions as needed. Most clients stay on the same partition during a split, but some are moved to balance partitions. For example, assume 1000 clients are connected, and the target partition size is 100. 1000 users / 100 per partition = 10 partitions. If a new client is connected, we end up with 11 partitions and some existing clients are moved to this partition to keep them balanced at ~91/partition.

Partitions are also removed when a client disconnects so that no partition becomes empty or unbalanced. The system will attempt to keep all partitions at approximately the desired target size.

![Partition merge](https://getstream.imgix.net/docs/3b8ac296-3d9c-4284-b5ae-5a17f04dc75e.png?auto=compress&fit=clip&w=800&h=600)

### Updating dynamic partitioning

The `partition_size` can be changed at any time without impacting existing connected clients. For example, with 5000 connected clients and a `partition_size` of 100, we have 50 partitions. If the value is changed to 200, the partitions merge to 25 with 200 users each.

```js
await client.updateChannelType("example", {
  partition_size: 200,
});
```

### Disabling dynamic partitioning

To disable dynamic partitioning, update the channel type and set the `partition_size` to `null` . All connected clients will now receive all messages.

```js
await client.updateChannelType("example", {
  partition_size: null,
});
```

### Partition TTL

When users connect, they are placed on the same partition as before, if it still exists. This allows users to stay close by and see familiar users. However, sometimes, this is not desired if the chat should feel vibrant with new users. We can use Partition TTL to do this without increasing the partition size. This will move users to a random partition at a set interval. Partition TTL is disabled by default.

![Partition randomization with TTL](https://getstream.imgix.net/docs/942259b4-935a-47ec-87f5-c73ed375c95c.png?auto=compress&fit=clip&w=800&h=600)

Partition TTL can be enabled by setting `partition_ttl` to a value for how frequently partitions should be randomized. The duration is provided as a string, such as `3h` , `24h` , or `2h30m` . Value units are `s` , `m` and `h` . For example, with a value of `partition_ttl: "6h"` , all partitions are randomly shuffled every 6 hours. The minimum value is 1 minute. There is no maximum value.

```js
await client.updateChannelType("example", {
  partition_ttl: "24h",
});
```

The value can be updated at any time, and it can be disabled by setting the value to `null` . Updating it (including disabling it) will move any connected users to a new partition.

### Caveats

- Users may be moved to a new partition at any time. This means a user may reply to a message, but the original author may not receive the reply as they are now in a different partition.

- The distribution of the partitions is not perfect by design. For example, if we have a desired size of 100, some partitions may end up with 95 users, and others may end up with 105. Partitions will stay within approximately 10% of the desired size.

- Reloading the channel's history will return all messages. If this is not desired, the existing messages should be retained on the client side.

- When reconnecting, the client may not end up on the same partition.

- Randomizing the partitions with `partition_ttl` is not guaranteed to happen at a specific time of day ( `24h` does not mean every midnight)
