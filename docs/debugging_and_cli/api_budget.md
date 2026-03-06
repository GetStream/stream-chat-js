In addition to [rate limits](/chat/docs/node/rate_limits/), Stream enforces **API budgets** on expensive
endpoints. While rate limits count requests, API budgets measure actual **database execution time** in milliseconds.
This prevents a single application from consuming disproportionate database resources with costly queries, even when the
request count stays within limits.

> [!NOTE]
> API budgets are currently enforced on the **Query Channels** endpoint. Other endpoints may be added in the future.


## Why API Budgets Exist

`rate limits` effectively prevent excessive request volume, but they do not account for the cost of individual requests.
A single expensive query can consume orders of magnitude more database time than an optimized query.

API budgets addresses this by measuring how long your queries take to execute. Each application receives a **time budget** (
milliseconds per minute) for registered endpoints. Expensive queries deduct more budget than cheap ones, naturally
throttling resource-heavy usage patterns.

### Per-Query Cap

No single query can exhaust your entire budget. Each query's cost is capped at a configurable maximum (default: 3,000
ms), so even an unusually slow query will not consume your full allowance in one call.

## Detecting Budget Limits

### Response Headers

All responses from budgeted endpoints include headers that let you monitor your usage in real time:

| Header                  | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `X-Budget-Used-Ms`      | Current usage in the sliding window (milliseconds)              |
| `X-Budget-Limit-Ms`     | Your total budget for this endpoint (milliseconds)              |
| `X-Budget-Remaining-Ms` | Available budget before denial (milliseconds)                   |
| `Retry-After`           | Seconds until budget frees up (only present on `429` responses) |

### HTTP 429 Response

When your budget is exhausted, the API returns HTTP `429 Too Many Requests`. The response includes the `Retry-After`
header indicating how many seconds to wait before retrying.

> [!NOTE]
> Budget denials return the same `429` status code as rate limit errors. Check the `X-Budget-Used-Ms` header to
> distinguish between a rate limit and a budget limit.


## Reducing Query Cost

The single most effective way to stay within your budget is to write efficient queries. Not all `QueryChannels` calls
cost the same &mdash; a simple filter on indexed fields executes orders of magnitude faster than a complex filter on
custom data. The following guidelines help you write queries that execute quickly and consume less budget.

### Use Efficient Filter Fields

These filter fields are optimized and execute efficiently:

| Filter field      | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `cid`             | Channel ID                                                         |
| `type`            | Channel type                                                       |
| `last_message_at` | Timestamp of last message                                          |
| `last_updated`    | Last updated timestamp                                             |
| `created_at`      | Channel creation timestamp                                         |
| `updated_at`      | Channel updated timestamp                                          |
| `members`         | Channel membership (see rules below)                               |
| `has_unread`      | Whether the channel has unread messages (only `true` is supported) |
| `team`            | Team identifier                                                    |

Filtering on fields **not** in this list &mdash; including `hidden`, `frozen`, `member_count`, `created_by_id`, `muted`, `pinned`,
`archived`, and any **custom field** on the channel &mdash; is significantly more expensive. If your query filters on
custom data (e.g., `custom.priority`, `custom.category`), expect higher budget consumption.

### Use Efficient Sort Fields

These sort fields use database indexes and execute efficiently:

| Sort field        | Description                       |
| ----------------- | --------------------------------- |
| `last_updated`    | Default when no sort is specified |
| `last_message_at` | Sort by last message timestamp    |
| `created_at`      | Sort by creation time             |
| `updated_at`      | Sort by update time               |

Sorting by other fields &mdash; including `has_unread`, `unread_count`, `pinned_at`, or any custom field &mdash;
requires more processing and increases query cost.

### Avoid Restricted Operators

These operators are always expensive regardless of which field they are used on:

- **`$nin`** &mdash; The "not in" operator forces full table scans. Restructure your query to use positive matches (
  `$in`, `$eq`) when possible
- **`$ne`** &mdash; The "not equal" operator cannot use indexes efficiently. Filter for the values you want instead of
  excluding values you don't
- **`$nor`** &mdash; Logical NOR evaluates every row. Replace with positive `$and` conditions when possible
- **`$autocomplete`** &mdash; Autocomplete queries use full-text search and are inherently expensive. Use them sparingly
  and consider caching results client-side
- **`$contains`** &mdash; Pattern matching that cannot leverage indexes. Avoid in high-frequency queries
- **`$q`** &mdash; Full-text search operator that requires text-search computation on every candidate row. Use targeted
  filters instead when possible

### Keep Filters Simple

Query complexity has a direct impact on execution time:

- **Keep `$in` arrays small** &mdash; Queries with `$in` containing 3 or fewer values are efficient. Larger arrays
  increase cost significantly.
- **Limit `$and` branches** &mdash; Combining more than 3 filter conditions with `$and` increases cost. Each top-level
  field in your filter object counts as one `$and` condition, even without an explicit `$and` wrapper
- **Limit `$or` branches** &mdash; Queries with more than 2 `$or` branches are expensive. Each branch adds a separate
  database execution path
- **Use at most one logical operator** &mdash; Combining `$and` inside `$or` (or vice versa) creates complex query
  plans. A query should use a single `$and` or a single `$or` at the top level, not both
- **Anchor queries with `members`** &mdash; Filtering by membership (e.g., `members: { "$in": ["user-id"] }`) narrows
  the candidate set to the user's channels, making all other filters and sorts much faster

### Examples: Efficient vs Expensive Queries

The examples below illustrate common query patterns and their relative cost. Efficient queries stick to optimized
fields, simple operators, and indexed sort fields. Expensive queries violate one or more of these rules.

#### Efficient Queries

**User inbox** &mdash; membership anchor with indexed sort (the most common and fastest pattern):

```json
{
  "filter": {
    "type": "messaging",
    "members": {
      "$in": ["alice"]
    }
  },
  "sort": [
    {
      "field": "last_message_at",
      "direction": -1
    }
  ]
}
```

**Date range** &mdash; range filter on indexed field with matching sort:

```json
{
  "filter": {
    "last_message_at": {
      "$gt": "2024-01-01T00:00:00Z"
    }
  },
  "sort": [
    {
      "field": "last_message_at",
      "direction": -1
    }
  ]
}
```

**Direct lookup** &mdash; fetching specific channels by `CID`:

```json
{
  "filter": {
    "cid": {
      "$in": ["messaging:general", "messaging:support"]
    }
  },
  "sort": [
    {
      "field": "last_message_at",
      "direction": -1
    }
  ]
}
```

**Team filter with membership** &mdash; multiple indexed fields within the `$and` limit:

```json
{
  "filter": {
    "type": "messaging",
    "members": {
      "$in": ["alice"]
    },
    "team": "engineering"
  },
  "sort": [
    {
      "field": "last_updated",
      "direction": -1
    }
  ]
}
```

> [!TIP]
> When all `$or` branches filter on the **same field**, use `$in` instead. For example,
> `"type": { "$in": ["messaging", "livestream"] }` is equivalent to an `$or` on `type` but simpler and more efficient.


```json
{
  "filter": {
    "$in": ["messaging", "livestream"]
  },
  "sort": [
    {
      "field": "last_message_at",
      "direction": -1
    }
  ]
}
```

#### Expensive Queries

**Custom field filter with non-indexed sort** &mdash; custom data fields and `pinned_at` sort are both expensive:

```json
{
  "filter": {
    "$or": [
      {
        "custom.is_archived": false
      },
      {
        "custom.is_priority": true
      },
      {
        "custom.is_flagged": true
      }
    ]
  },
  "sort": [
    {
      "field": "pinned_at",
      "direction": -1
    }
  ]
}
```

This query has three problems: custom field filters (`custom.*`), three `$or` branches (limit is 2), and sorting by
`pinned_at` (not indexed).

**Too many `$and` conditions** &mdash; exceeding the branch limit:

```json
{
  "filter": {
    "type": "messaging",
    "members": {
      "$in": ["alice"]
    },
    "last_message_at": {
      "$exists": true
    },
    "member_count": {
      "$eq": 2
    }
  }
}
```

This query has four top-level conditions (exceeding the `$and` limit of 3) and uses `member_count` (not an optimized
field).

**Large `$in` array** &mdash; too many values:

```json
{
  "filter": {
    "cid": {
      "$in": [
        "messaging:ch1",
        "messaging:ch2",
        "messaging:ch3",
        "messaging:ch4",
        "messaging:ch5",
        "messaging:ch6"
      ]
    }
  }
}
```

The `$in` array contains 6 values (limit is 3). Restructure to batch multiple smaller queries instead.

**Negation operators** &mdash; `$nin` and `$ne` are always expensive:

```json
{
  "filter": {
    "members": {
      "$nin": ["bob"]
    },
    "type": {
      "$ne": "livestream"
    }
  }
}
```

These operators force full scans. Use positive matches (`$in`, `$eq`) to filter for what you want instead of excluding
what you don't.

**Nested logical operators** &mdash; combining `$and` and `$or`:

```json
{
  "filter": {
    "$and": [
      {
        "type": "messaging"
      },
      {
        "$or": [
          {
            "team": "sales"
          },
          {
            "team": "support"
          }
        ]
      }
    ]
  }
}
```

This query nests `$or` inside `$and`. Use a single level of logical operators instead. In this case, filtering by
`team: { "$in": ["sales", "support"] }` achieves the same result more efficiently.

**No membership anchor with broad filter** &mdash; querying without narrowing by user:

```json
{
  "filter": {
    "type": "messaging"
  },
  "sort": [
    {
      "field": "created_at",
      "direction": -1
    }
  ]
}
```

This query uses only optimized fields, but without a `members` filter the database must scan all channels of the given
type. For applications with many channels, this leads to high execution time and budget consumption. Adding
`members: { "$in": ["user-id"] }` narrows the candidate set to the user's channels and dramatically reduces cost.

### Quick Reference: Optimization Rules

A query is considered **optimized** only when every part of it meets the criteria below. A single violation makes the
entire query expensive.

| Rule                 | Optimized                                                                                                     | Expensive                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Filter fields**    | `cid`, `type`, `last_message_at`, `last_updated`, `created_at`, `updated_at`, `members`, `has_unread`, `team` | Any other field, including `frozen`, `hidden`, `muted`, `member_count`, and any `custom.*` field |
| **Sort fields**      | `last_updated`, `last_message_at`, `created_at`, `updated_at`                                                 | Any other field, including `has_unread`, `pinned_at`, and any custom field                       |
| **`$in` array size** | 3 or fewer values                                                                                             | 4 or more values                                                                                 |
| **`$and` branches**  | 3 or fewer conditions                                                                                         | 4 or more conditions                                                                             |
| **`$or` branches**   | 2 or fewer branches                                                                                           | 3 or more branches                                                                               |
| **Logical nesting**  | A single `$and` or `$or` at the top level                                                                     | Combining `$and` with `$or` at any depth                                                         |
| **Operators**        | `$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$exists`                                                         | `$nin`, `$ne`, `$nor`, `$autocomplete`, `$contains`, `$q`                                        |

> [!TIP]
> **Start with the user inbox pattern.** The most efficient query shape is `members: { "$in": ["user-id"] }` combined with
> `type` and sorted by `last_message_at`. This anchors the query to the user's channels and uses indexed fields
> throughout.


### Monitor Your Usage

Use the `X-Budget-Used-Ms` and `X-Budget-Remaining-Ms` response headers to track your consumption. If you see usage
consistently approaching the limit, review which queries are most expensive and optimize them using the guidelines
above.

## Handling Budget Errors

When you receive a `429` response due to budget exhaustion:

1. **Read the `Retry-After` header** to determine when budget will be available
2. **Implement exponential back-off** &mdash; Wait and retry with increasing delays
3. **Review your query patterns** &mdash; Frequent budget exhaustion indicates queries that are too expensive, not just
   too many requests

> [!CAUTION]
> Do **not** simply retry immediately on a `429`. The budget is time-based, so rapid retries will not succeed and may
> delay recovery.


## Relationship to Rate Limits

API budgets and [rate limits](/chat/docs/node/rate_limits/) work together but measure different things:

| Aspect       | Rate Limits                      | API Budget                                |
| ------------ | -------------------------------- | ----------------------------------------- |
| **Measures** | Number of requests               | Database execution time (ms)              |
| **Window**   | 1 minute                         | 1 minute (sliding)                        |
| **Scope**    | Per endpoint, per platform       | Per endpoint, per application             |
| **Denial**   | HTTP `429`                       | HTTP `429`                                |
| **Headers**  | `X-RateLimit-*`                  | `X-Budget-*`                              |
| **Purpose**  | Prevent excessive request volume | Prevent excessive database resource usage |

You can hit budget limits even when well within rate limits, and vice versa. Both constraints must be satisfied for a
request to proceed.

## Requesting Budget Adjustments

If your application consistently hits budget limits after optimizing your queries:

- **Standard plans** &mdash; Contact Stream support with details about your query patterns. Stream will review your
  usage and may adjust your budget
- **Enterprise plans** &mdash; Stream works with you to set appropriate budgets for your production workload

Budget values are configured per application and can be adjusted without code changes on your side.
