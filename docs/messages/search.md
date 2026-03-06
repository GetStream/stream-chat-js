Search messages across channels using full-text search or specific field filters. Enable or disable search indexing per channel type in the Stream Dashboard.

## Searching Messages

Search requires a channel filter and either a text query or message filter conditions.

```js
// Search for messages containing text
const results = await client.search(
  { members: { $in: ["john"] } },
  "supercalifragilisticexpialidocious",
  { limit: 10 },
);

// Search with message filters
const filtered = await client.search(
  { members: { $in: ["john"] } },
  { text: { $autocomplete: "super" }, attachments: { $exists: true } },
  { limit: 10 },
);
```

### Query Parameters

| Name                      | Type         | Description                                                                                                             | Default                    | Optional |
| ------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| filter_conditions         | object       | Channel filters. Maximum 500 channels are searched. See [Querying Channels](/chat/docs/node/query_channels/).    | -                          |          |
| message_filter_conditions | object       | Message filters. See Message Filter Conditions below. Either this or `query` is required.                               | -                          | ✓        |
| query                     | string       | Full-text search string. Equivalent to `{text: {$q: <query>}}`. Either this or `message_filter_conditions` is required. | -                          | ✓        |
| limit                     | integer      | Number of messages to return.                                                                                           | 100                        | ✓        |
| offset                    | integer      | Pagination offset. Cannot be used with `sort` or `next`.                                                                | 0                          | ✓        |
| sort                      | object/array | Sort order. Use field names with `1` (ascending) or `-1` (descending).                                                  | [{relevance: -1}, {id: 1}] | ✓        |
| next                      | string       | Pagination cursor. See Pagination below.                                                                                | -                          | ✓        |

### Message Filter Conditions

| Field              | Description                                            | Operators                                         |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------- |
| id                 | Message ID                                             | $eq, $gt, $gte, $lt, $lte, $in                    |
| text               | Message text                                           | $q, $autocomplete, $eq, $gt, $gte, $lt, $lte, $in |
| type               | Message type. System and deleted messages are excluded | $eq, $gt, $gte, $lt, $lte, $in                    |
| parent_id          | Parent message ID (for replies)                        | $eq, $gt, $gte, $lt, $lte, $in                    |
| reply_count        | Number of replies                                      | $eq, $gt, $gte, $lt, $lte, $in                    |
| attachments        | Whether message has attachments                        | $exists, $eq, $gt, $gte, $lt, $lte, $in           |
| attachments.type   | Attachment type                                        | $eq, $in                                          |
| mentioned_users.id | Mentioned user ID                                      | $contains                                         |
| user.id            | Sender user ID                                         | $eq, $gt, $gte, $lt, $lte, $in                    |
| created_at         | Creation timestamp                                     | $eq, $gt, $gte, $lt, $lte, $in                    |
| updated_at         | Update timestamp                                       | $eq, $gt, $gte, $lt, $lte, $in                    |
| pinned             | Whether message is pinned                              | $eq                                               |
| custom field       | Any custom field on the message                        | $eq, $gt, $gte, $lt, $lte, $in                    |

## Sorting

Results are sorted by relevance by default, with message ID as a tiebreaker. If your query does not use `$q` or `$autocomplete`, all results are equally relevant.

Sort by any filterable field, including custom fields. Numeric custom fields are sorted numerically; string fields are sorted lexicographically.

## Pagination

Two pagination methods are available:

**Offset pagination** allows access to up to 1,000 results. Results are sorted by relevance and message ID. You cannot use custom sorting with offset pagination.

**Cursor pagination** (using `next`/`previous`) allows access to all matching results with custom sorting. The response includes `next` and `previous` cursors to navigate between pages.

```js
const channelFilters = { cid: "messaging:my-channel" };
const messageFilters = { text: { $autocomplete: "supercali" } };

// First page with custom sorting
const page1 = await client.search(channelFilters, messageFilters, {
  sort: [{ relevance: -1 }, { updated_at: 1 }, { my_custom_field: -1 }],
  limit: 10,
});

// Next page using cursor
const page2 = await client.search(channelFilters, messageFilters, {
  limit: 10,
  next: page1.next,
});

// Previous page
const page1Again = await client.search(channelFilters, messageFilters, {
  limit: 10,
  next: page2.previous,
});
```
