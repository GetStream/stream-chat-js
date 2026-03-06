The `queryMembers` method allows you to list and paginate members for a channel. It supports filtering on numerous criteria to efficiently return member information. This is useful for channels with large member lists where you need to search for specific members or display the complete member roster.

```js
// Query members by user name
channel.queryMembers({ name: "tommaso" });

// Autocomplete members by user name
channel.queryMembers({ name: { $autocomplete: "tom" } });

// Query all members
channel.queryMembers({});
```

> [!NOTE]
> Stream Chat does not run MongoDB on the backend, only a [subset](/chat/docs/node/#query_syntax/) of the query options are available.


### Query Parameters

| Name    | Type   | Description                                                                       | Default                     | Optional |
| ------- | ------ | --------------------------------------------------------------------------------- | --------------------------- | -------- |
| filters | object | The query filters to use. You can query on any of the custom fields defined above | `{}`                        |          |
| sort    | object | The sort parameters                                                               | `{ created_at: 1 }`         | ✓        |
| options | object | Pagination options                                                                | `{ limit: 100, offset: 0 }` | ✓        |

> [!NOTE]
> By default, when `queryMembers` is called without any filter, it matches all members in the channel.


### Member Queryable Built-In Fields

The following fields can be used to filter your query results:

| Name         | Type                                                               | Description                                    | Supported Operators                 | Example                 |
| ------------ | ------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------- | ----------------------- |
| id           | string                                                             | The ID of the user                             | `$eq`, `$in`                        | tom                     |
| name         | string                                                             | The name of the user                           | `$eq`, `$in`, `$autocomplete`, `$q` | Tommaso                 |
| channel_role | string                                                             | The member role                                | `$eq`                               | channel_moderator       |
| banned       | boolean                                                            | The banned status                              | `$eq`                               | false                   |
| invite       | string, must be one of these values: (pending, accepted, rejected) | The status of the invite                       | `$eq`                               | pending                 |
| joined       | boolean                                                            | Whether the member has joined the channel      | `$eq`                               | true                    |
| created_at   | string, must be formatted as an RFC3339 timestamp                  | The time the member was created                | `$eq`, `$gt`, `$gte`, `$lt`, `$lte` | 2021-01-15T09:30:20.45Z |
| updated_at   | string, must be formatted as an RFC3339 timestamp                  | The time the member was last updated           | `$eq`, `$gt`, `$gte`, `$lt`, `$lte` | 2021-01-15T09:30:20.45Z |
| last_active  | string, must be formatted as an RFC3339 timestamp                  | The time the user was last active              | `$eq`, `$gt`, `$gte`, `$lt`, `$lte` | 2021-01-15T09:30:20.45Z |
| cid          | string                                                             | The CID of the channel the user is a member of | `$eq`                               | messaging:general       |
| user.email   | string                                                             | The email property of the user                 | `$eq`, `$in`, `$autocomplete`       | <user@example.com>      |

You can also filter by any field available in the custom data.

## Paginating Channel Members

By default, members are ordered from oldest to newest. You can paginate results using offset-based pagination or by the `created_at` or `user_id` fields.

Offset-based pagination is the simplest to implement, but it can lead to incorrect results if the member list changes while you are paginating. The recommended approach is to sort by `created_at` or `user_id`.

```js
// Returns up to 100 members ordered by created_at descending
let sort = { created_at: -1 };
await channel.queryMembers({}, sort, {});

// Returns up to 100 members ordered by user_id descending
sort = { user_id: -1 };
await channel.queryMembers({}, sort, {});

// Paginate by user_id in ascending order
sort = { user_id: 1 };
let options = { user_id_lt: lastMember.user_id };
await channel.queryMembers({}, sort, options);

// Paginate by created_at in descending order
sort = { created_at: -1 };
options = { created_at_before: lastMember.created_at };
await channel.queryMembers({}, sort, options);

// Paginate using offset
options = { offset: 20 };
await channel.queryMembers({}, sort, options);
```

### Pagination Options

| Name                       | Type    | Description                                                                     | Default | Optional |
| -------------------------- | ------- | ------------------------------------------------------------------------------- | ------- | -------- |
| limit                      | integer | The number of members to return (max is 100)                                    | 100     | ✓        |
| offset                     | integer | The offset (max is 1000)                                                        | 0       | ✓        |
| user_id_lt                 | string  | Pagination option: excludes members with ID greater than or equal to the value  | -       | ✓        |
| user_id_lte                | string  | Pagination option: excludes members with ID greater than the value              | -       | ✓        |
| user_id_gt                 | string  | Pagination option: excludes members with ID less than or equal to the value     | -       | ✓        |
| user_id_gte                | string  | Pagination option: excludes members with ID less than the value                 | -       | ✓        |
| created_at_after           | string  | Pagination option: select members created after the date (RFC3339)              | -       | ✓        |
| created_at_before          | string  | Pagination option: select members created before the date (RFC3339)             | -       | ✓        |
| created_at_before_or_equal | string  | Pagination option: select members created before or equal to the date (RFC3339) | -       | ✓        |
| created_at_after_or_equal  | string  | Pagination option: select members created after or equal to the date (RFC3339)  | -       | ✓        |
