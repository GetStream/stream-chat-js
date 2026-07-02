# v9 → v10 Migration Guide — Sort Parameter Shape

> Scope: this guide covers **only** the wire/SDK shape of `sort` arguments on `StreamChat` (client) and `Channel` query methods, plus the moderation/poll/reminder query methods that hang off the client. Method-signature shape changes (positional args → single request object) are mentioned only to show where `sort` now lives; the comprehensive per-method migration is covered in a separate guide.

## TL;DR

- Every `sort` argument is now `Array<SortParamRequest>` — the exact wire format. No more `{ field: direction }` objects, no more `Sort | Sort[]` unions.
- `SortParamRequest = { field?: string; direction?: number; type?: string }`. `direction` is a `number` (use `1` / `-1`); `type` is a new optional cast hint (`'number' | 'boolean'`).
- The `normalizeQuerySort` helper is gone (no longer exported). Callers were the only normalizers in v9 — in v10 the SDK passes the array straight through to the API.
- All `*SortBase` types (`ChannelSortBase`, `BannedUsersSortBase`, `SearchMessageSortBase`, `PollSortBase`, `VoteSortBase`, `DraftSortBase`, `PinnedMessagesSortBase`, `ReactionSortBase`, `ThreadSortBase`, `QueryMessageHistorySortBase`) are removed.
- The `Sort<T>` generic mapping type is removed. The `QuerySort` union type is removed.
- Sort type aliases that still exist (`ChannelSort`, `UserSort`, `MemberSort`, `BannedUsersSort`, `ReactionSort`, `PinnedMessagesSort`, `SearchMessageSort`, `DraftSort`, `PollSort`, `VoteSort`, `ThreadSort`, `ReminderSort`) all collapse to the same `Gen_SortParamRequest[]` type — they're convenience aliases, not field-typed shapes.
- Removed sort types with no replacement: `SortParam`, `CampaignSort`, `QueryMessageHistorySort`, `ReviewQueueSort`, `QueryModerationConfigsSort`, `QueryModerationRulesSort`, `PredefinedFilterSort`, `PredefinedFilterSortParam`. Their carrier methods either moved to the generated API (and now accept `SortParamRequest[]` inline via the request type) or were removed with the rest of server-side functionality. If you were typing a local variable as one of these, retype it as `SortParamRequest[]`.

## The shape change

### v9 — keyed object form

In v9 the SDK accepted (and normalized) a per-field-keyed object, or an array of them:

```ts
// any of these were valid
client.queryChannels(filters, { last_message_at: -1 });
client.queryChannels(filters, [{ last_message_at: -1 }, { has_unread: 1 }]);
channel.queryMembers(filters, [{ created_at: -1 }]);
```

Field order in multi-key objects was not guaranteed; the SDK warned at runtime when it saw more than one key on a single object. `normalizeQuerySort` rewrote any of these forms into the `[{ field, direction }, ...]` array before hitting the wire.

### v10 — array of `SortParamRequest`

In v10, every method takes the array form directly:

```ts
// v10 — only this shape is valid
client.queryChannels({
  filter_conditions: filters,
  sort: [{ field: 'last_message_at', direction: -1 }],
});

client.queryChannels({
  filter_conditions: filters,
  sort: [
    { field: 'last_message_at', direction: -1 },
    { field: 'has_unread', direction: 1 },
  ],
});

channel.queryMembers({
  payload: {
    filter_conditions: filters,
    sort: [{ field: 'created_at', direction: -1 }],
  },
});
```

`SortParamRequest` is defined in `src/gen/models/index.ts`:

```ts
export interface SortParamRequest {
  direction?: number; // -1 (desc) or 1 (asc), defaults to 1
  field?: string;
  type?: string; // 'number' | 'boolean' — cast hint for custom fields (new in v10)
}
```

Multi-key sort objects are no longer expressible — each `{ field, direction }` entry has exactly one field, and field order is the array order.

## Where `sort` lives now

All v9 methods that took `(filters, sort, options, ...)` as positional arguments have been collapsed to a single `request` object (or `{ payload: request }` for endpoints whose payload is sent as a JSON-encoded query param). `sort` is now a property on that request/payload. The signature consolidation itself is covered in the per-method migration guide; the relevant point for the sort migration is that **the value you previously passed as the `sort` positional argument is now the value of `request.sort` (or `request.payload.sort`)** — only its shape changed (see above).

### Client methods that take `sort`

POST-style endpoints — `sort` lives directly on the request body:

| Method                                                        | Sort location  |
| ------------------------------------------------------------- | -------------- |
| `client.queryChannels(request)` / `queryChannelsAndHydrate`   | `request.sort` |
| `client.queryReactions(request)` / `queryReactionsAndHydrate` | `request.sort` |
| `client.queryThreads(request)` / `queryThreadsAndHydrate`     | `request.sort` |
| `client.queryDrafts(request)`                                 | `request.sort` |
| `client.queryPolls(request)`                                  | `request.sort` |
| `client.queryPollVotes(request)` / `queryPollAnswers`         | `request.sort` |
| `client.queryReminders(request)`                              | `request.sort` |
| `client.moderation.queryAppeals(request)`                     | `request.sort` |
| `client.moderation.queryReviewQueue(request)`                 | `request.sort` |
| `client.moderation.queryModerationConfigs(request)`           | `request.sort` |

GET-style endpoints — `sort` lives inside the `payload` query param object:

| Method                                  | Sort location  |
| --------------------------------------- | -------------- |
| `client.queryUsers({ payload })`        | `payload.sort` |
| `client.queryBannedUsers({ payload })`  | `payload.sort` |
| `client.queryMessageFlags({ payload })` | `payload.sort` |
| `client.search({ payload })`            | `payload.sort` |

### Channel methods that take `sort`

| Method                                     | Sort location                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `channel.queryMembers({ payload })`        | `payload.sort`                                                                      |
| `channel.getPinnedMessages(options, sort)` | second positional arg (unchanged signature, but `sort` is now `SortParamRequest[]`) |
| `channel.getReplies(request)`              | `request.sort`                                                                      |

`channel.getPinnedMessages` is the one method that kept its v9-style two-positional-arg signature; only the `sort` shape changed.

## Mechanical migration recipe

For every call site that passes a `sort`:

1. Rewrite each `{ field_name: direction }` entry as `{ field: 'field_name', direction }`.
   - `{ created_at: -1 }` → `{ field: 'created_at', direction: -1 }`
   - `{ 'user.id': 1 }` → `{ field: 'user.id', direction: 1 }`
2. If you passed a single object (not an array), wrap it: `{ created_at: -1 }` → `[{ field: 'created_at', direction: -1 }]`.
3. If a single v9 object contained multiple keys, split them — preserve the order you wanted, since v9 field order was undefined and v10 array order is honored:
   - `{ last_message_at: -1, has_unread: 1 }` → `[{ field: 'last_message_at', direction: -1 }, { field: 'has_unread', direction: 1 }]`
4. If you were sorting on a **custom** field whose stored JSON value isn't a string (numeric scores, boolean flags), add `type`:
   - `[{ field: 'score', direction: -1, type: 'number' }]`
   - `[{ field: 'is_archived', direction: 1, type: 'boolean' }]`
5. Move the sort value into the new request-object slot for the method (see tables above). The per-method signature migration is in the separate guide.
6. Delete any local re-implementation of `normalizeQuerySort` — the SDK no longer needs it, and the helper is no longer exported from `src/utils.ts`.
7. Remove imports of `Sort`, `*SortBase`, `QuerySort`, `SortParam`, `CampaignSort`, `QueryMessageHistorySort`, `ReviewQueueSort`, `QueryModerationConfigsSort`, `QueryModerationRulesSort`, `PredefinedFilterSort`, `PredefinedFilterSortParam`. If you typed a local variable as one of these, retype it as `SortParamRequest[]` (or the matching remaining domain alias such as `ChannelSort`).

## Type-import mapping cheat sheet

| v9 import                                                                                                                                                                                | v10 replacement                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sort<T>`                                                                                                                                                                                | removed — no per-field-typed analogue                                                                                                         |
| `ChannelSortBase`, `UserSortBase` etc.                                                                                                                                                   | removed — use `SortParamRequest`                                                                                                              |
| `ChannelSort`, `UserSort`, `MemberSort`, `ReactionSort`, `PinnedMessagesSort`, `SearchMessageSort`, `PollSort`, `VoteSort`, `ThreadSort`, `ReminderSort`, `BannedUsersSort`, `DraftSort` | unchanged name, now `SortParamRequest[]`                                                                                                      |
| `BannedUsersSort`, `DraftSort`                                                                                                                                                           | removed — use `SortParamRequest[]` directly (or read the `sort` field type off the generated request type, e.g. `QueryDraftsRequest['sort']`) |
| `QuerySort`                                                                                                                                                                              | removed                                                                                                                                       |
| `SortParam`                                                                                                                                                                              | removed — use `SortParamRequest`                                                                                                              |
| `normalizeQuerySort` (from `utils`)                                                                                                                                                      | removed                                                                                                                                       |
| `CampaignSort`, `QueryMessageHistorySort`, `ReviewQueueSort`, `QueryModerationConfigsSort`, `QueryModerationRulesSort`, `PredefinedFilterSort`, `PredefinedFilterSortParam`              | removed (carrier methods either gone or now generated and take `SortParamRequest[]`)                                                          |

`SortParamRequest` is exported from `src/gen/models/index.ts` and re-exported through the package root.

## Things that did NOT change

- The set of fields you may sort by is unchanged — server-side validation is the source of truth, the SDK no longer narrows the field names at the type level. If you relied on TypeScript catching a typo in `{ wrong_field_name: -1 }` you no longer get that check; the string `field` lands directly in the request body.
- Direction semantics are unchanged: `1` ascending, `-1` descending. `direction` is now typed `number` rather than `AscDesc`, but only `1` and `-1` are valid server-side.
- Pagination, filter shape, and result shape for these methods are unchanged by the sort migration.
- An empty `sort` (`[]` or omitted) still falls through to the server's default ordering.
