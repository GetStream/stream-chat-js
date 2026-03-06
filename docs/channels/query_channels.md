Channel lists are a core part of most messaging applications, and our SDKs make them easy to build using the Channel List components. These lists are powered by the Query Channels API, which retrieves channels based on filter criteria, sorting options, and pagination settings.

Here's an example of how you can query the list of channels:

```js
const filter = { type: "messaging", members: { $in: ["thierry"] } };
const sort = [{ last_message_at: -1 }];
const options = { limit: 15 };

const channels = await chatClient.queryChannels(filter, sort, options);
```

## Query Parameters

| Name    | Type                       | Description                                                                                                                                                                                                                                                                            | Default              | Optional |
| ------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------- |
| filters | object                     | Filter criteria for channel fields. See [Queryable Fields](#channel-queryable-built-in-fields) for available options.                                                                                                                                                                  | {}                   |          |
| sort    | object or array of objects | Sorting criteria based on field and direction. You can sort by **last_updated**, **last_message_at**, **updated_at**, **created_at**, **member_count**, **unread_count**, or **has_unread**. Direction can be ascending (1) or descending (-1). Multiple sort options can be provided. | [{last_updated: -1}] |          |
| options | object                     | Additional query options. See [Query Options](#query-options).                                                                                                                                                                                                                         | {}                   |          |

> [!NOTE]
> An empty filter matches all channels in your application. In production, always include at least `members: { $in: [userID] }` to return only channels the user belongs to.


The API only returns channels that the user has permission to read. For messaging channels, this typically means the user must be a member. Include appropriate filters to match your channel type's permission model.

## Common Filters

Understanding which filters perform well at scale helps you build efficient channel queries. This section covers common filter patterns with their performance characteristics.

> [!TIP]
> **Performance Summary**: Filters using indexed fields (`cid`, `type`, `members`, `last_message_at`) perform best. See [Performance Considerations](#performance-considerations) for detailed guidance.


### Messaging and Team Channels

For most messaging applications, filter by channel type and membership. This pattern uses indexed fields and performs well at scale.

> [!WARNING]
> **High membership counts**: For users with a large number of channel memberships (more than a few thousand), filtering by `members: { $in: [userID] }` becomes less selective and may cause performance issues. In these cases, consider adding additional filters (like `last_message_at`) to narrow the result set.


```js
const filter = { members: { $in: ["thierry"] }, type: "messaging" };
```

## Channel Queryable Built-In Fields

The following fields can be used in your filter criteria:

| Name             | Type                                 | Description                                                                    | Supported Operators                | Example                 |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------- | ----------------------- |
| frozen           | boolean                              | Channel frozen status                                                          | $eq                                | false                   |
| type             | string or list of string             | Channel type                                                                   | $in, $eq                           | messaging               |
| cid              | string or list of string             | Full channel ID (type:id)                                                      | $in, $eq                           | messaging:general       |
| members          | list of string                       | User IDs of channel members                                                    | $in                                | [thierry, marcelo]      |
| invite           | string (pending, accepted, rejected) | Invite status                                                                  | $eq                                | pending                 |
| joined           | boolean                              | Whether the current user has joined the channel                                | $eq                                | true                    |
| muted            | boolean                              | Whether the current user has muted the channel                                 | $eq                                | true                    |
| member.user.name | string                               | Name property of a channel member                                              | $autocomplete, $eq                 | marc                    |
| created_by_id    | string                               | ID of the user who created the channel                                         | $eq                                | marcelo                 |
| hidden           | boolean                              | Whether the current user has hidden the channel                                | $eq                                | false                   |
| last_message_at  | string (RFC3339 timestamp)           | Time of the last message                                                       | $eq, $gt, $lt, $gte, $lte, $exists | 2021-01-15T09:30:20.45Z |
| member_count     | integer                              | Number of members                                                              | $eq, $gt, $lt, $gte, $lte          | 5                       |
| created_at       | string (RFC3339 timestamp)           | Channel creation time                                                          | $eq, $gt, $lt, $gte, $lte, $exists | 2021-01-15T09:30:20.45Z |
| updated_at       | string (RFC3339 timestamp)           | Channel update time                                                            | $eq, $gt, $lt, $gte, $lte          | 2021-01-15T09:30:20.45Z |
| team             | string                               | Team associated with the channel                                               | $eq                                | stream                  |
| last_updated     | string (RFC3339 timestamp)           | Time of last message, or channel creation time if no messages exist            | $eq, $gt, $lt, $gte, $lte          | 2021-01-15T09:30:20.45Z |
| disabled         | boolean                              | Channel disabled status                                                        | $eq                                | false                   |
| has_unread       | boolean                              | Whether the user has unread messages (only `true` supported, max 100 channels) | true                               | true                    |
| app_banned       | string                               | Filter by application-banned users (only for 2-member channels)                | excluded, only                     | excluded                |

> [!NOTE]
> For supported query operators, see [Query Syntax Operators](/chat/docs/node/query_syntax_operators/).


> [!NOTE]
> The `app_banned` filter only works on direct message channels with exactly 2 members.


## Query Options

| Name          | Type    | Description                                          | Default | Optional |
| ------------- | ------- | ---------------------------------------------------- | ------- | -------- |
| state         | boolean | Return channel state                                 | true    | ✓        |
| watch         | boolean | Subscribe to real-time updates for returned channels | true    | ✓        |
| limit         | integer | Number of channels to return (max 30)                | 10      | ✓        |
| offset        | integer | Number of channels to skip (max 1000)                | 0       | ✓        |
| message_limit | integer | Messages to include per channel (max 300)            | 25      | ✓        |
| member_limit  | integer | Members to include per channel (max 100)             | 100     | ✓        |

> [!TIP]
> **Performance Tip**: Setting `state: false` and `watch: false` reduces response size and processing time. Use these options when you only need channel IDs or basic metadata—for example, during background syncs, administrative operations, or when building lightweight channel lists that don't require full state.


## Response

The API returns a list of `ChannelState` objects containing all information needed to render channels without additional API calls.

### ChannelState Fields

| Field Name      | Description                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| channel         | Channel data                                                                                                    |
| messages        | Recent messages (based on message_limit)                                                                        |
| watcher_count   | Number of users currently watching                                                                              |
| read            | Read state for up to 100 members, ordered by most recently added (current user's read state is always included) |
| members         | Up to 100 members, ordered by most recently added                                                               |
| pinned_messages | Up to 10 most recent pinned messages                                                                            |

<details>
<summary>Example Response</summary>

```json
[
  {
    "id": "f8IOxxbt",
    "type": "messaging",
    "cid": "messaging:f8IOxxbt",
    "last_message_at": "2020-01-10T07:26:46.791232Z",
    "created_at": "2020-01-10T07:25:37.63256Z",
    "updated_at": "2020-01-10T07:25:37.632561Z",
    "created_by": {
      "id": "8ce4c6e11118ca103a0a7c633dcf60dd",
      "role": "admin",
      "created_at": "2019-08-27T17:33:14.442265Z",
      "updated_at": "2020-01-10T07:25:36.402819Z",
      "last_active": "2020-01-10T07:25:36.395796Z",
      "banned": false,
      "online": false,
      "image": "https://ui-avatars.com/api/?name=mezie&size=192&background=000000&color=6E7FFE&length=1",
      "name": "mezie",
      "username": "mezie"
    },
    "frozen": false,
    "config": {
      "created_at": "2020-01-20T10:23:44.878185331Z",
      "updated_at": "2020-01-20T10:23:44.878185458Z",
      "name": "messaging",
      "typing_events": true,
      "read_events": true,
      "connect_events": true,
      "search": true,
      "reactions": true,
      "replies": true,
      "mutes": true,
      "uploads": true,
      "url_enrichment": true,
      "max_message_length": 5000,
      "automod": "disabled",
      "automod_behavior": "flag",
      "commands": [
        {
          "name": "giphy",
          "description": "Post a random gif to the channel",
          "args": "[text]",
          "set": "fun_set"
        }
      ]
    },
    "name": "Video Call"
  }
]
```

</details>

## Pagination

Use `limit` and `offset` to paginate through results:

```js
const filter = { members: { $in: ["thierry"] } };
const sort = { last_message_at: -1 };

// Get channels 11-30
const channels = await authClient.queryChannels(filter, sort, {
  limit: 20,
  offset: 10,
});
```

> [!NOTE]
> Always include `members: { $in: [userID] }` in your filter to ensure consistent pagination results. Without this filter, channel list changes may cause pagination issues.


## Best Practices

### Channel Creation and Watching

A channel is not created in the API until one of the following methods is called. Each method has subtle differences:

```js
channel.create();
channel.query();
channel.watch();
```

Only one of these is necessary. For example, calling `watch` automatically creates the channel in addition to subscribing to real-time updates—there's no need to call `create` separately.

With `queryChannels`, a user can watch up to 30 channels in a single API call. This eliminates the need to watch channels individually using `channel.watch()` after querying. Using `queryChannels` can substantially decrease API calls, reducing network traffic and improving performance when working with many channels.

### Filter Best Practices

Channel lists often form the backbone of the chat experience and are typically one of the first views users see. Use the most selective filter possible:

- **Filter by CID** is the most performant query you can use
- **For social messaging** (DMs, group chats), use at minimum `type` and `members: { $in: [userID] }`
- **Avoid overly complex queries** with more than one AND or OR statement
- **Filtering by type alone** is not recommended—always include additional criteria
- **Use Predefined Filters** in production for frequently used query patterns

```js
// Most performant: Filter by CID
const filter = { cid: channelCID };

// Recommended for social messaging
const filter = { type: "messaging", members: { $in: [userID] } };

// Not recommended: type alone
const filter = { type: "messaging" };
```

> [!TIP]
> If your filter returns more than a few thousand channels, consider adding more selective criteria. For frequently used query patterns, use [Predefined Filters](#predefined-filters) to enable performance monitoring through the Dashboard. [Contact support](https://getstream.io/contact/support/) if you plan on having millions of channels and need guidance on optimal filters.


### Sort Best Practices

Always specify a sort parameter in your query. The default is `last_updated` (the more recent of `created_at` and `last_message_at`).

The most optimized sort options are:

- `last_updated` (default)
- `last_message_at`

```js
const sort = { last_message_at: -1 };
```

For the full list of supported query operators, see [Query Syntax Operators](/chat/docs/node/query_syntax_operators/).

### Recommended Query Patterns

Following recommended patterns helps ensure your queries perform well as your application scales. Here are examples of good and bad query patterns for all server-side SDKs.

#### Good Pattern: Selective Filter with Indexed Fields

Use indexed fields like `type`, `members`, and `last_message_at` for efficient queries:

```js
// ✅ GOOD: Selective filter using indexed fields
const filter = {
  type: "messaging",
  members: { $in: [userId] },
  last_message_at: { $gte: thirtyDaysAgo },
};
const sort = { last_message_at: -1 };

const channels = await serverClient.queryChannels(filter, sort, { limit: 20 });
```

#### Bad Pattern: Overly Broad or Complex Filters

Avoid overly broad filters or deep nesting of logical operators, which can cause performance issues at scale and may result in dynamic rate limiting:

```js
// ❌ BAD: Type-only filter (too broad)
const broadFilter = { type: "messaging" };

// ❌ BAD: Deep nesting of logical operators
const nestedFilter = {
  $and: [
    {
      $or: [{ frozen: true }, { disabled: true }],
    },
    {
      $or: [{ hidden: true }, { muted: true }],
    },
  ],
};
```

### Using Predefined Filters in Production

For frequently used query patterns, use [Predefined Filters](#predefined-filters) in production. They provide several benefits:

- **Consistency**: Define filter logic once and reuse across your application
- **Performance Monitoring**: View performance analysis through the Dashboard
- **Optimization Insights**: Receive recommendations for improving slow queries

```js
// Production-ready: Use Predefined Filter
const channels = await serverClient.queryChannels(
  {}, // filter_conditions ignored with predefined_filter
  { last_message_at: -1 },
  {
    predefined_filter: "user_messaging_channels",
    filter_values: { user_id: userId },
    limit: 20,
  },
);
```

### Monitoring Query Performance

Use the [Stream Dashboard](https://beta.dashboard.getstream.io) to monitor and optimize your QueryChannels performance:

1. **Create Predefined Filters** for your frequently used query patterns
2. **View Performance Analysis** in the Dashboard once filters receive traffic
3. **Review Recommendations** for optimization opportunities
4. **Track Improvements** over time as you optimize your queries

> [!NOTE]
> **Performance insights availability**: Performance scores and recommendations become available once a filter/sort combination receives significant traffic. Not all filters will show analysis immediately—the system needs sufficient usage data to provide meaningful insights.


## Predefined Filters

Predefined Filters are reusable, templated filter configurations that you create and manage in the [Stream Dashboard](https://beta.dashboard.getstream.io). They provide a recommended approach for production QueryChannels usage.

### Why Use Predefined Filters

- **Consistency**: Define filter logic once and reuse it across your application
- **Dashboard Management**: Create, update, and monitor filters through the Dashboard
- **Performance Insights**: View performance analysis for your filters directly in the Dashboard once they receive significant traffic
- **Dynamic Values**: Use placeholders for values that change at query time (like user IDs)

### Creating Predefined Filters

Create and manage Predefined Filters in the [Stream Dashboard](https://beta.dashboard.getstream.io). Navigate to your app's settings to define filter templates with placeholders for dynamic values.

### Using Predefined Filters

Reference a predefined filter by name and provide values for any placeholders:


### Placeholder Syntax

Placeholders use double curly braces: `{{placeholder_name}}`

When creating a predefined filter in the Dashboard, you can define templates like:

```json
{
  "type": "{{channel_type}}",
  "members": {
    "$in": "{{users}}"
  }
}
```

At query time, provide the actual values via `filter_values`:

```json
{
  "predefined_filter": "user_messaging_channels",
  "filter_values": {
    "channel_type": "messaging",
    "users": ["user123", "user456"]
  }
}
```

You can also use placeholders in sort field names. Provide these values via `sort_values`:

```json
{
  "predefined_filter": "team_channels",
  "filter_values": {
    "team_id": "engineering"
  },
  "sort_values": {
    "sort_field": "last_message_at"
  }
}
```

### Performance Analysis

The Dashboard displays performance analysis for your Predefined Filters. Performance scores and recommendations become available once a filter receives significant traffic or exhibits notable latency. Not all filters will show analysis immediately—the system needs sufficient usage data to provide meaningful insights.

## Performance Considerations

QueryChannels performance depends on your filter complexity and the volume of data. Understanding which fields perform well helps you build efficient queries.

### Well-Optimized Fields

These fields are indexed and perform efficiently at scale:

- `cid` (full channel ID)
- `type`
- `members`
- `created_at`
- `last_message_at`
- `last_updated`

### Fields to Use with Caution

These fields may have performance implications at scale:

- `member_count`: Can be slow for large datasets
- `frozen`: Limited index support
- **Complex nested queries**: Multiple `$and`/`$or` combinations

### Query Complexity

Simple, selective filters perform better than complex queries:


### Sort Performance

The most efficient sort fields are:

- `last_message_at`
- `last_updated`
- `created_at`

### Pagination Best Practices

For consistent and efficient pagination:

- **Use reasonable limits**: The default limit is 10 and max is 30. Larger page sizes increase response time and payload size.
- **Include a members filter**: Always include `members: { $in: [userID] }` in your filter for consistent pagination. Without this, channel list changes during pagination can cause channels to be skipped or duplicated.
- **Respect the offset maximum**: The maximum offset is 1000. For datasets larger than this, use time-based filtering (e.g., `last_message_at` or `created_at`) to paginate through older data.


### Recommendations

1. **Use Predefined Filters** for frequently used query patterns in production
2. **Filter by indexed fields** (`cid`, `type`, `members`, `last_message_at`, `created_at`)
3. **Add time-based filters** to limit the scan scope (e.g., `last_message_at` within last 30 days)
4. **Avoid deep nesting** of `$and`/`$or` operators
5. **Monitor performance** through the Dashboard when using Predefined Filters
