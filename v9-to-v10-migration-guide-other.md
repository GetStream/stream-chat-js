# v9 → v10 Migration Guide — Everything Else

> Scope: this guide catches breaking changes **not** covered by the topic-specific guides:
>
> - `v9-to-v10-migration-guide-client-construction.md` (constructor & options)
> - `v9-to-v10-migration-guide-logging.md` (`chatLoggerSystem`, sinks, scopes)
> - `v9-to-v10-migration-guide-methods.md` (per-method signatures on `StreamChat`, `Channel`, `ChannelState`, `Moderation`, `StableWSConnection`)
> - `v9-to-v10-migration-guide-sort.md` (`SortParamRequest[]` shape)
> - `v9-to-v10-migration-guide-server-side.md` (server-side surface removal, dropped Node-only deps)
> - `v9-to-v10-migration-guide-type-renames.md` (hand-rolled type aliases → generated names)
> - `v9-to-v10-migration-guide-i18n.md` (notification identity, poll-composer field errors, the `stream-chat/i18n` subpath)
>
> Read those first. This guide covers **exports, removed feature modules, event-type shape, filter constraints, small state/composer shape changes, and residual type/property renames** that the topic guides do not.

## TL;DR

- **`engines.node` is now `>=22.18.0`** (was `>=18`). Node 22.18 is the release that unflagged
  TypeScript type stripping, which the package's own build scripts need — `prepare` runs the build, so a
  git-ref install has to be able to execute them. A registry install never builds, so if you are pinned
  to an older Node the runtime code itself is unlikely to care; `engines` is advisory and most package
  managers warn rather than fail. But 18 and 20 are no longer tested. See the note below on what this
  means if you deploy the WebSocket client on Node 18 or 20.
- **Server-side is gone.** If you construct with a `secret` or call server-only admin endpoints, switch to `@stream-io/node-sdk`. The construction guide has the full list — every feature module below that was server-only is dropped for the same reason.
- Two barrels removed from the package root, one added: **`./events` and `./base64` are gone; `./logger` is new.** `./signing` survives with exactly one export left, `UserFromToken`. The `./campaign`, `./channel_batch_updater`, and `./segment` barrels are still exported but the modules are emptied (they contain only a comment pointing at the server SDK) — importing anything by name from them will fail.
- `Event` (type name) is kept, but its shape widened: `Event = WSEvent | LocalEvent | keyof CustomEventTypes`. `EventPayload<'<type>'>` narrows to a specific event.
- `EventTypes` (plural) renamed to `EventType` (singular). `CustomEventTypes` interface is unchanged — augment it to add custom event-type keys, same as v9.
- Filter payloads now carry **per-endpoint operator constraints** (inline `Filters<{ … }>` on each request type) — previously-permissive filter objects may stop type-checking. Only one operator per field is allowed, and `null` is no longer a valid `$in` element. `QueryPollsFilters`, `QueryVotesFilters`, and `ReminderFilters` were the last hand-written holdouts and now derive from their request types too.
- `ChannelState.membership` initializes to `undefined` (was `{}`); `ChannelState.typing` values are now `EventPayload<'typing.start' | 'typing.stop'>` (were `Event`); read receipts merged with the generated `ReadStateResponse`.
- Composer attachments now nest `mime_type` / `file_size` / `duration` under `.custom`; `LocationComposer` preview `end_at` is a `Date` (was ISO string).
- `Role` type renamed to `RoleName`.
- Assorted small tightenings: `TokenManager.setTokenOrProvider` user param narrowed, `revokeTokens(before)` no longer accepts `string`, `UserGroupPaginator` cursor field is a `Date`.

---

## Node version floor

`engines.node` moves from `>=18` to `>=22.18.0`.

The driver is the build, not the runtime: the package's build scripts are `.mts`, executed by `node`
with no loader, and unflagged type stripping landed in **22.18.0** (24.3.0 on the 24 line, 23.6.0 on
the 23 line). Because `prepare` runs `yarn build`, anyone installing from a git ref has to be able to
run them. Note that 22.12 — the `require(esm)` milestone — is _not_ sufficient for this; the two are
often conflated.

**If you install from the npm registry, nothing in the shipped runtime is known to need 22.18.** You get
a prebuilt `dist/` and never run the build. `engines` is advisory, and npm/yarn warn rather than fail by
default. Treat the bump as "18 and 20 are no longer tested" rather than "the code will not run".

**One place this needs care:** [`v9-to-v10-migration-guide-server-side.md`](./v9-to-v10-migration-guide-server-side.md)
documents running the WebSocket client on Node 18/20 by injecting a `WebSocketImpl` (Node only gained a
global `WebSocket` in 22). That guidance still works mechanically, and is still the right answer if you
are stuck on an older runtime — but it is now below the declared floor, so it is unsupported rather than
supported. If you are on Node 18 or 20 and rely on that path, plan the upgrade to 22.18+, where no
`WebSocketImpl` is needed at all.

## Public export surface

`src/index.ts` barrel changes:

| Removed export barrel      | Reason                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `export * from './events'` | `src/events.ts` deleted along with `EVENT_MAP`. Event-type set is now derived from the generated event decoders, no longer a hand-rolled map.                                                                                               |
| `export * from './base64'` | `src/base64.ts` deleted along with the `base64-js` dependency. `encodeBase64` / `decodeBase64` are gone; `UserFromToken` now decodes through the global `atob`. Take base64 helpers from a package of your own if you were importing these. |

| Emptied module (barrel still present, no named exports) | Reason                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `./campaign`                                            | `Campaign` was a server-side admin surface; module is a stub. |
| `./segment`                                             | Same as `campaign`.                                           |
| `./channel_batch_updater`                               | `ChannelBatchUpdater` was a server-side admin surface.        |

| Added export barrel        | What it exposes                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `export * from './logger'` | `chatLoggerSystem`, `LogLevel`, `LogLevelEnum`, `Sink`, `ScopedLogger`, `ChatLoggerScope`, `ConfigureLoggersOptions`. See logging guide. |

Any consumer doing `import { Campaign, Segment, ChannelBatchUpdater, EVENT_MAP, encodeBase64, decodeBase64 } from 'stream-chat'` will fail to resolve. Delete those imports; there is no drop-in replacement in this SDK. `CustomEventTypes` is still exported from `stream-chat` and its interface is unchanged — augment it to declare custom event-type keys the same way as in v9.

### `./signing` is down to one export

The barrel is still there, but it holds a **single** function: `UserFromToken`. Everything else it used to carry — `JWTUserToken`, `JWTServerToken`, `DevToken`, `verifySignature`, `CheckSignature`, `verifyAndParseWebhook`, `parseSqs`, `parseSns`, `gunzipPayload`, `decodeSqsPayload`, `decodeSnsPayload`, `parseEvent`, `InvalidWebhookError`, `InvalidWebhookErrorMessages` — needed the API secret or a Node builtin, and went out with the server-side surface. See [`v9-to-v10-migration-guide-server-side.md`](./v9-to-v10-migration-guide-server-side.md).

`UserFromToken` itself changed implementation: it decodes the JWT payload with the global `atob` instead of the removed `base64-js` helpers. It runs on the `connectUser` path, so older React Native / Hermes targets — Hermes only gained `atob` / `btoa` around React Native 0.74 — must install a base64 polyfill before the first `connectUser`, or connecting throws `ReferenceError: atob is not defined`. Verify with `typeof atob` on the target rather than by version number; browsers, Node 16+, Bun, and Deno all have it natively.

---

## Removed feature modules / subsystems

Beyond the individual server-side methods listed in the methods guide, entire subsystems are gone. If your app used one of these, the client-side wrapper is not coming back — move to `@stream-io/node-sdk`:

| Subsystem                       | v9 shape                                                                                                                                                                                                                                                | v10 status                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Campaigns**                   | `client.campaign`, `queryCampaigns`, `createCampaign`, `startCampaign`, `stopCampaign`, `updateCampaign`, `deleteCampaign`, `getCampaign`                                                                                                               | removed                                                                                                                                                                                                                                                                                    |
| **Segments**                    | `client.segment`, `createSegment`, `createUserSegment`, `createChannelSegment`, `updateSegment`, `getSegment`, `deleteSegment`, `querySegments`, `segmentTargetExists`, `addSegmentTargets`, `removeSegmentTargets`, `querySegmentTargets`              | removed                                                                                                                                                                                                                                                                                    |
| **`ChannelBatchUpdater`**       | `client.channelBatchUpdater`, `client.updateChannelsBatch(...)`                                                                                                                                                                                         | removed                                                                                                                                                                                                                                                                                    |
| **Retention policies**          | `setRetentionPolicy`, `deleteRetentionPolicy`, `getRetentionPolicy`, `getRetentionPolicyRuns`                                                                                                                                                           | removed                                                                                                                                                                                                                                                                                    |
| **Team usage stats**            | `queryTeamUsageStats`                                                                                                                                                                                                                                   | removed                                                                                                                                                                                                                                                                                    |
| **User groups**                 | `createUserGroup`, `getUserGroup`, `searchUserGroups`, `updateUserGroup`, `deleteUserGroup`, `addUserGroupMembers`, `removeUserGroupMembers`                                                                                                            | mutations removed. Read path is now `listUserGroups` (v9 `queryUserGroups` renamed — see methods guide); `UserGroupPaginator` remains and delegates to `listUserGroups` internally.                                                                                                        |
| **Predefined filters (client)** | `deletePredefinedFilter`, `PredefinedFilterSort(Param)` types, `mapPredefinedFilterSortToChannelSort` helper                                                                                                                                            | removed. Read paths remain via the generated API.                                                                                                                                                                                                                                          |
| **Reminder client batch API**   | `client.createReminder`, `client.updateReminder`, `client.deleteReminder`, `client.queryReminders` (v9 `QueryRemindersOptions` shape)                                                                                                                   | hand-rolled `createReminder`/`updateReminder`/`deleteReminder` removed from `StreamChat`. `queryReminders` is still available via `ChatApi` inheritance but takes the generated `QueryRemindersRequest` shape. `ReminderManager` remains — use it. See "Reminders" below for shape change. |
| **Push provider admin**         | `upsertPushProvider`, `deletePushProvider`, `listPushProviders`, `setPushPreferences`                                                                                                                                                                   | removed                                                                                                                                                                                                                                                                                    |
| **Roles / Permissions admin**   | `createRole`, `listRoles`, `deleteRole`, `getPermission`, `createPermission`, `updatePermission`, `deletePermission`, `listPermissions`                                                                                                                 | removed. `searchRoles` remains, inherited from the generated API.                                                                                                                                                                                                                          |
| **Channel-types admin**         | `createChannelType`, `getChannelType`, `updateChannelType`, `deleteChannelType`, `listChannelTypes`                                                                                                                                                     | removed                                                                                                                                                                                                                                                                                    |
| **Commands admin**              | `createCommand`, `getCommand`, `updateCommand`, `deleteCommand`, `listCommands`                                                                                                                                                                         | removed                                                                                                                                                                                                                                                                                    |
| **Imports / Exports**           | `_createImport`, `_createImportURL`, `_getImport`, `_listImports`, `exportChannel`, `exportChannels`, `exportUsers`, `getExportChannelStatus`, `getTask`                                                                                                | removed                                                                                                                                                                                                                                                                                    |
| **App-settings mutations**      | `updateAppSettings`, `testPushSettings`, `testSQSSettings`, `testSNSSettings`, `translate`, `translateMessage`, `getHookEvents`                                                                                                                         | removed. `getAppSettings` remains.                                                                                                                                                                                                                                                         |
| **User admin**                  | `partialUpdateUser`, `deleteUser`, `restoreUsers`, `reactivateUser(s)`, `deactivateUser(s)`, `exportUser`, `revokeUserToken`, `revokeUsersToken`, `sendUserCustomEvent`, `deleteUsers`                                                                  | removed                                                                                                                                                                                                                                                                                    |
| **Flag admin**                  | `_queryFlags`, `_queryFlagReports`, `_reviewFlagReport`, `updateFlags`                                                                                                                                                                                  | removed. `queryMessageFlags` remains via `ChatApi` inheritance (generated request shape). User/message flagging by the connected user remains via `client.flagMessage` / `client.flagUser`.                                                                                                |
| **Webhook / SQS / SNS helpers** | `client.verifyWebhook`, `client.verifyAndParseWebhook`, `client.parseSqs`, `client.parseSns` (used `client.secret` implicitly)                                                                                                                          | removed. An intermediate v10 rc moved them to module exports on `./signing`; the final v10 drops them entirely, along with `verifySignature` / `CheckSignature` / `InvalidWebhookError`. Port the handler to `@stream-io/node-sdk`.                                                        |
| **Misc.**                       | `commitMessage`, `undeleteMessage`, `getSharedLocations`, `updateLocation`, `getUnreadCountBatch`, `getBlockList`, `enrichURL`, `_normalizeDate`, `validateServerSideAuth`, `_setupConnection`, `_enrichAxiosOptions`, `_logApiRequest`, `_logApiError` | removed                                                                                                                                                                                                                                                                                    |

If your call site was gated on `client._isUsingServerAuth()` (which is also removed), delete the branch — it was only ever true on the server-side path.

---

## Event system

`src/events.ts` — the single-source `EVENT_MAP` — is **deleted**. Event types are now driven by the generated event decoders (`src/gen/model-decoders/event-decoder-mapping.ts`) plus a small local overlay. The public `Event` type is kept but its definition changed:

### Union types you'll see

```ts
// Wire events (over WS) — every generated event type.
type WSEvent = /* union of all generated Gen_*Event shapes */;

// SDK-only events not received over the wire.
type LocalEvent = (
  | ({ type: 'live_location_sharing.started' } & { message: MessageResponse })
  | ({ type: 'live_location_sharing.stopped' } & { live_location?: SharedLocationResponseData })
  | ({ type: 'channels.queried' } & {
      queriedChannels: {
        channels: ChannelStateResponseFields[];
        isLatestMessageSet: boolean;
      };
    })
  | ({ type: 'transport.changed' } & { mode: string })
  | ({ type: 'connection.changed' } & { online: boolean })
  | { type: 'connection.recovered' }
  | ({ type: 'offline_reactions.queried' } & { offlineReactions: ReactionResponse[] })
  | ({ type: 'capabilities.changed' } & {
      cid: string;
      own_capabilities: ChannelOwnCapability[];
    })
  | ({ type: 'message.read_locally' } & {
      channel_type: string;
      cid: string;
      created_at: Date;
      channel_id?: string;
      last_read_message_id?: string;
      team?: string;
      user?: UserResponse;
    })
) & { received_at?: Date };

// Public alias — same name as in v9, wider shape.
export type Event = WSEvent | LocalEvent | keyof CustomEventTypes;
export type EventType = Event['type'] | 'all';
export type EventHandler<T = string> = (event: Extract<Event, { type: T }>) => void;

export type EventPayload<T extends Event['type'] | (string & {})> = Extract<
  Event,
  { type: T }
>;
```

### v9 → v10 replacement table

| v9                                                                                                                                                                                                                                   | v10                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import { Event } from 'stream-chat'`                                                                                                                                                                                                | still `import { Event } from 'stream-chat'` — the alias is retained; the union it resolves to widened to `WSEvent \| LocalEvent \| keyof CustomEventTypes`.                                          |
| `Event` as a callback argument type                                                                                                                                                                                                  | `Event` still works; prefer `EventPayload<'message.new'>` for narrowed events.                                                                                                                       |
| `import { EventTypes } from 'stream-chat'`                                                                                                                                                                                           | `import { EventType } from 'stream-chat'` — singular; same shape (`Event['type'] \| 'all'`)                                                                                                          |
| `import { EVENT_MAP } from 'stream-chat'`                                                                                                                                                                                            | removed — no runtime table. Match on `event.type` directly.                                                                                                                                          |
| `interface CustomEventTypes { my_custom: 'my_custom'; ... }` (module augmentation)                                                                                                                                                   | unchanged — augment `CustomEventTypes` exactly the same way. The interface is still exported from `stream-chat`.                                                                                     |
| Hand-rolled `ReminderEvent`, `PollEvent`, `PollUpdatedEvent`, `PollVoteCastedEvent`, `PollClosedEvent`, `PollAnswerCastedEvent`, `VoteChangedEvent`, `VoteCastedEvent`, `VoteRemovedEvent`, `AnswerCastedEvent`, and similar aliases | replaced by `EventPayload<'reminder.created' \| 'reminder.updated' \| ...>` etc. `ReminderManager.ReminderEvent` now aliases to `EventPayload<`reminder.${string}` \| 'notification.reminder_due'>`. |

### Narrowing a listener

```ts
// v9
client.on('message.new', (event: Event) => {
  event.message; // any-typed
});

// v10
client.on('message.new', (event) => {
  event.message; // narrowed via EventPayload<'message.new'>
});

// Or explicit:
import type { EventPayload } from 'stream-chat';
const handler = (event: EventPayload<'message.new'>) => event.message;
```

### Custom event types (module augmentation)

The `CustomEventTypes` module-augmentation contract is unchanged from v9:

```ts
declare module 'stream-chat' {
  interface CustomEventTypes {
    my_app_custom: 'my_app_custom';
  }
}
```

Because the v10 generic on `channel.on<T extends EventType | string>` accepts any `string`, unknown listener keys still type-check without augmentation, but the event payload will not be narrowed. Augmenting `CustomEventTypes` adds the custom key to `Event['type']`, which flows through `EventType` and `EventHandler` narrowing.

> **Larger topic** — the event system rewrite (removed hand-rolled event types across `poll`, `poll_manager`, `thread`, `reminders`, live-location, and the client itself; the shift from a hand-maintained `EVENT_MAP` to generated decoders) touches enough call sites that it may warrant a dedicated guide. Flag me if you want one written.

---

## Filter payloads — per-endpoint operator constraints

The generated client is produced with `typed_filters` enabled, so each request interface declares its filter inline as `Filters<{ … }>` (the helper lives at the top of `src/gen/models/index.ts`) rather than as a permissive `Record<string, any>`. The filter spec names one entry per legal field:

```ts
// src/gen/models/index.ts — QueryRemindersRequest
filter?: Filters<{
  channel_cid: { type: string; operators: '$eq' | '$in' };
  created_at: { type: Date | string; operators: '$eq' | '$gt' | '$gte' | '$lt' | '$lte' };
  message_id: { type: string; operators: '$eq' | '$in' };
  remind_at: { type: Date | string; operators: '$eq' | '$exists' | '$gt' | '$gte' | '$lt' | '$lte' };
}>;
```

Endpoints carrying a typed filter, and the property it sits on:

| Request type                                                                                                                                                                                                                   | Property                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `QueryBannedUsersPayload`, `QueryChannelsRequest`, `QueryMembersPayload`, `QueryMessageFlagsPayload`, `QueryUsersPayload`                                                                                                      | `filter_conditions`                                 |
| `SearchPayload`                                                                                                                                                                                                                | `filter_conditions` and `message_filter_conditions` |
| `QueryAppealsRequest`, `QueryDraftsRequest`, `QueryModerationConfigsRequest`, `QueryPollsRequest`, `QueryPollVotesRequest`, `QueryReactionsRequest`, `QueryRemindersRequest`, `QueryReviewQueueRequest`, `QueryThreadsRequest` | `filter`                                            |

**Breaking effect 1 — undeclared operators.** Any v9 filter object using an operator not declared for a field stops type-checking:

```ts
// v9 — accepted (typing was permissive)
client.queryChannels({ frozen: { $exists: true } as any }, sort);

// v10 — `frozen` declares only `{ type: boolean; operators: '$eq' }`.
// Use { frozen: true } or { frozen: { $eq: true } } instead.
```

**Breaking effect 2 — one operator per field.** The generated shape uses `RequireOnlyOne`, so combining operators on a single field is now an error. Use `$and` to intersect:

```ts
// ✗ v10 — rejected
const bad: ReminderFilters = { created_at: { $gt: a, $lt: b } };
// ✓ v10
const good: ReminderFilters = {
  $and: [{ created_at: { $gt: a } }, { created_at: { $lt: b } }],
};
```

**Breaking effect 3 — `null` is no longer a valid array element.** In v9 the hand-written filter types built on `PrimitiveFilter<T> = T | null`, which made `$in` an array of _nullable_ elements. The generated shape puts the nullability outside the array:

```ts
// v9: $in?: (string | null)[]      v10: $in: string[] | null
const bad: ReminderFilters = { message_id: { $in: ['a', null] } }; // ✗ now rejected
const good: ReminderFilters = { message_id: { $in: ['a', 'b'] } }; // ✓
```

Field-name typos in a typed filter are now compile errors. If you were relying on the v9 permissive shape, casting is the escape hatch; the correct fix is to use the declared fields and operators.

### Filter aliases now derive from the request types

`ChannelFilters`, `MessageFilters`, `ReactionFilters`, `ThreadFilters`, `UserFilters` still exist as convenience aliases but derive from the constrained request types. The three remaining hand-written poll/reminder filter types are now migrated the same way:

| Alias               | Now derives from                               |
| ------------------- | ---------------------------------------------- |
| `QueryPollsFilters` | `NonNullable<QueryPollsRequest['filter']>`     |
| `QueryVotesFilters` | `NonNullable<QueryPollVotesRequest['filter']>` |
| `ReminderFilters`   | `NonNullable<QueryRemindersRequest['filter']>` |

`QueryRemindersOptions` is **not** in that table: unlike the aliases above it does not survive at all. v9 defined it as `Pager & { filter?: ReminderFilters; sort?: ReminderSort }`; v10 removes it with no replacement alias — use `QueryRemindersRequest` directly. (It is not a pure rename: `sort` is now `SortParamRequest[]` and `filter` is operator-constrained, per the sections above.) `ReminderPaginator`'s second generic parameter moved with it, so `PaginatorOptions<ReminderResponseData, QueryRemindersOptions>` becomes `PaginatorOptions<ReminderResponseData, QueryRemindersRequest>`.

Beyond the three breaking effects above, the field sets shifted to match the API spec:

- **Removed** — `ReminderFilters.user_id`, `QueryPollsFilters.user_id`, `QueryVotesFilters.created_by_id`. These were never declared by the endpoints; filter on a supported field instead (e.g. `created_by_id` for polls).
- **Added** — `QueryVotesFilters` gains `poll_id`, and `QueryPollsFilters` gains a `custom.${string}` index signature for filtering on custom poll data.

The legacy building blocks (`QueryFilter`, `PrimitiveFilter`, `QueryFilters`, `RequireOnlyOne`) remain exported for callers who compose their own filter types against `itemMatchesFilter` and the paginators.

### Removed — `ArrayOneOrMore` and `ArrayTwoOrMore`

The two non-empty-array utilities are gone from `stream-chat`. In v9 they existed only to constrain the logical operators — `$and` / `$nor` required at least one element (`ArrayOneOrMore`), `$or` at least two (`ArrayTwoOrMore`):

```ts
// v9 — src/types.ts
export type ArrayOneOrMore<T> = { 0: T } & Array<T>;
export type ArrayTwoOrMore<T> = { 0: T; 1: T } & Array<T>;
```

**Why they were dropped.** That encoding is only satisfied by a value whose length TypeScript knows statically, so any array _variable_ is rejected. It probably wasn't a common use-case for the logical operators, but the helpers were generically named, and cause issues when used in other places, for example:

```ts
declare const ids: string[];

// TS2322: Property '0' is missing in type 'string[]'
const a: ChannelFilters = { members: { $in: ids } };
// same
const b: ChannelFilters = { members: { $in: [...ids] } };
// only literals and non-empty tuples pass
const c: ChannelFilters = { members: { $in: ['u1'] } };
```

No non-empty encoding avoids this: TypeScript cannot prove a `T[]` has at least one element, so the guarantee costs a hard compile error on working code. An empty array stays a runtime 400 with a clear message, which is the cheaper failure.

**What to do.** Use a plain `Array<T>` (or `T[]`) wherever you referenced them:

```ts
// v9
import type { ArrayOneOrMore, ArrayTwoOrMore } from 'stream-chat';

type MyLogicalOperators<T> = {
  $and?: ArrayOneOrMore<MyFilters<T>>;
  $nor?: ArrayOneOrMore<MyFilters<T>>;
  $or?: ArrayTwoOrMore<MyFilters<T>>;
};

// v10
type MyLogicalOperators<T> = {
  $and?: Array<MyFilters<T>>;
  $nor?: Array<MyFilters<T>>;
  $or?: Array<MyFilters<T>>;
};
```

This mirrors what the SDK itself now does in `ExtendedQueryLogicalOperators` (`src/pagination/FilterBuilder.ts`). The change is widening, not narrowing: everything that compiled in v9 still compiles, and the array-variable cases above now compile too. The only thing you lose is the compile error on an empty (or single-element `$or`) array, which the API rejects at runtime anyway.

---

## State shape changes

### `ChannelState.membership`

```ts
// v9
membership: ChannelMemberResponse; // initialized to {}
if (channel.state.membership.role === 'admin') { ... } // OK

// v10
membership: ChannelMemberResponse | undefined; // initialized to undefined
if (channel.state.membership?.role === 'admin') { ... } // must guard
```

Unguarded reads of `channel.state.membership.<field>` now crash on freshly-constructed channels. Add `?.` or a `membership &&` guard at every read site.

### `ChannelState.typing`

```ts
// v9
typing: Record<string, Event>;

// v10
typing: Record<string, EventPayload<'typing.start' | 'typing.stop'>>;
```

Any code that inspected the typing entry's fields is now narrowed to typing-event fields only. Reading `state.typing[userId].message` etc. no longer compiles.

### `ChannelState.read` (`ChannelReadStatus`)

The per-user record now composes the generated `ReadStateResponse` plus an SDK-only `first_unread_message_id`:

```ts
type ChannelReadStatus = Record<
  string,
  ReadStateResponse & { first_unread_message_id?: string }
>;
```

Field names are unchanged (`last_read`, `unread_messages`, `user`, `last_read_message_id`, `last_delivered_at`, `last_delivered_message_id`), but `user` is now `UserResponseCommonFields`-shaped (from the generator) rather than the v9 `UserResponse`. Downstream code that reads fields off `read[uid].user` should be fine; code that assigned back onto it may not.

### `ChannelState.formatMessage`

`MessageResponseBase` is removed from the type signature (see methods guide, ChannelState section). Callers passing a hand-rolled `MessageResponseBase`-typed value must cast or reshape to `MessageResponse | LocalMessage`.

---

## Composer & attachment shape

### Attachment previews — flat metadata moved under `.custom`

`AttachmentManager.fileToLocalUploadAttachment` (and downstream identity checks) no longer place `mime_type`, `file_size`, or `duration` at the attachment root. They are nested under `custom`:

```ts
// v9 — flat
{ mime_type: 'image/png', file_size: 1024, type: 'image', duration: 3.5, ... }

// v10 — nested
{ custom: { mime_type: 'image/png', file_size: 1024, duration: 3.5 }, type: 'image', ... }
```

Consequences:

- `isFileAttachment(a)` and `isVideoAttachment(a)` now read `(a as FileAttachment).custom?.mime_type`.
- `duration` is only populated for `type === 'voiceRecording'` (v9 populated it whenever a `FileReference` carried one).
- Any UI code reading `attachment.mime_type` / `attachment.file_size` from a preview built by the composer must switch to `attachment.custom?.mime_type` / `attachment.custom?.file_size`.

### `LocationComposer` preview

```ts
// v9
export type LiveLocationPreview = Omit<LiveLocationPayload, 'end_at'> & {
  durationMs?: number;
};
// end_at was set to `new Date(...).toISOString()`

// v10
export type StaticLocationPreview = StaticLocationPayload & { message_id?: string };
export type LiveLocationPreview = Omit<LiveLocationPayload, 'end_at'> & {
  durationMs?: number;
  message_id?: string;
};
// end_at is now a Date (or undefined when durationMs is not a number)
```

If your app called `preview.end_at.toISOString()` or passed `end_at` directly to a `<time>` element expecting a string, format it (`.toISOString()`) at the read site.

### `PollComposer`

Reference to a `user_id` getter on the poll composer is removed. Consumers that read `pollComposer.user_id` should use `client.userId` directly.

---

## Reminders — `messageId` → `message_id`

`ReminderManager` now speaks the OpenAPI-generated snake_case:

```ts
// v9
await reminderManager.upsertReminder({ messageId, remind_at, ... });

// v10
await reminderManager.upsertReminder({ message_id, remind_at, ... });
```

Same shift applies to `deleteReminder`, `updateReminder`, `createReminder`, `queryReminders`, and the internal state lookup helpers. Rewriting the property is mechanical, but easy to miss on TypeScript projects that had `messageId` inferred from a variable of that name.

`ReminderManager.ReminderEvent` is now `EventPayload<`reminder.${string}` | 'notification.reminder_due'>`; the v9 hand-rolled shape (`{ cid, created_at, message_id, reminder, type, user_id }`) is not exported anymore.

---

## `Role` → `RoleName`

```ts
// v9
import type { Role } from 'stream-chat';
const isModerator = (u: User): u is User & { role: Role } => ...

// v10
import type { RoleName } from 'stream-chat';
```

The `Role` type in the generated models (`src/gen/models/index.ts`) is a **different** shape — a role object with permissions, not a role name string. `RoleName` is the union that used to be called `Role`.

---

## Small residual changes

### `TokenManager.setTokenOrProvider(token, user)`

`user` is narrowed:

```ts
// v9
setTokenOrProvider(tokenOrProvider, user: UserResponse);

// v10
export type TokenManagerMinimalUser = { id: string; anon?: boolean };
setTokenOrProvider(tokenOrProvider, user: TokenManagerMinimalUser);
```

Callers passing a full `UserResponse` still satisfy the shape, but anyone reading `tokenManager.user.<some-field-other-than-id-or-anon>` needs to widen.

### `client.revokeTokens(before)`

```ts
// v9
client.revokeTokens(before: Date | string | null);

// v10
client.revokeTokens(before?: Date | null);
```

ISO-string form is gone — construct a `Date` at the call site.

### `UserGroupPaginator` cursor

The `created_at_gt` cursor field is derived from `lastItem.created_at`, which is now a `Date` (was a string). The paginator internally calls `.toISOString()` on it — read paths (`useNextCursor`) are unchanged, but any custom sub-class or off-path consumer that pulled `.created_at` off the paginator's items must handle the `Date` type.

### Aliases dropped on `StreamChat`

- `client.setAnonymousUser` — use `client.connectAnonymousUser()`.
- `client.markAllRead` — use `client.markChannelsRead()`.
- `client.updateUser` / `client.updateUsers` (single/array upsert aliases) — the **names** are reused for the new bulk update: `client.updateUsers({ users: Record<id, user> })`. The upsert behavior lives at the same names but with a different payload shape (see methods guide, `upsertUser`).

Also, `client.userID = ...` no longer compiles (getter is deprecated; setter is gone). Any test that did `client.userID = 'test-user'` must set `client.userId` (through `_setUser` or `connectUser`) instead.

### `client.appSettingsPromise` return type

```ts
// v9
Promise<GetAppSettingsAPIResponse>;

// v10
Promise<StreamResponse<Gen_GetApplicationResponse>>;
```

`StreamResponse<T> = T & { metadata: RequestMetadata }` — pre-existing fields are all still there; the wrapper only adds `metadata`.

### `client._user` type

```ts
// v9
_user?: OwnUserResponse | UserResponse

// v10
_user?: ClientUser
// ClientUser = PartializeAllBut<OwnUserResponse, 'id'> & { anon?: boolean }
```

`ClientUser` is an `OwnUserResponse` with every field except `id` made optional, plus an optional `anon` flag for anonymous connections. Fields specific to `OwnUserResponse` (e.g. `total_unread_count`) still read the same way; anywhere that previously narrowed to `UserResponse` should assume all fields except `id` may be missing until the connect-user response arrives.

---

## Type utilities dropped

The following v9 helper types are removed from the public surface. They mostly served the old hand-rolled types and are no longer needed:

`Readable<T>`, `KnownKeys<T>`, `PartializeKeys`, `UnknownType`, `MessageResponseBase`, `LocalMessageBase`, `FormatMessageResponse`, `ChannelAPIResponse` variants, `QueryChannelsAPIResponse`, `QueryReactionsOptions`/`QueryReactionsAPIResponse`, `TranslateResponse`, `ModerationResult`, `AutomodDetails`, `FlagsResponse`, `MessageFlagsResponse`, `FlagReport(s)Response`, `ReviewFlagReportResponse`, `BannedUsersResponse`, `FutureChannelBan(s)Response`, `HookEvent(s)Response`, `CheckPush/SQS/SNSResponse`, `CommandResponse` family, `ExportChannel*`/`ExportUsers*` types, push-preference types (`ChatLevelPushPreference`, `CallLevelPushPreference`, `PushPreferenceLevel`, `ChatPreferences`, `PushPreference`).

For any of these that survive as a generated shape, the replacement is the generator's `Gen_*` re-export (re-exported through `./types` or `./gen/models`). For the type utilities (`Readable`, `KnownKeys`, `PartializeKeys`, `UnknownType`) there is no replacement — inline the built-in equivalent or drop the constraint.

> **Larger topic** — the `types.ts` cleanup (~4.6k lines removed, most hand-rolled response/request types replaced by generated shapes) is large enough that a per-type cheat sheet ("`FormatMessageResponse` → …", "`FlagReportsResponse` → …", …) may deserve its own guide. Flag me if you want one written.

---

## Mechanical migration checklist

For each source file that touches the SDK:

1. **Delete removed imports.** `EVENT_MAP`, `Campaign*`, `Segment*`, `ChannelBatchUpdater`, `encodeBase64`, `decodeBase64`, the webhook / JWT helpers from `./signing` (`verifyAndParseWebhook`, `parseSqs`, `parseSns`, `verifySignature`, `CheckSignature`, `InvalidWebhookError`, `JWTUserToken`, `JWTServerToken`, `DevToken`), `Role` (rename), `MessageResponseBase`, `FormatMessageResponse`, `PredefinedFilterSort(Param)`, and any of the removed type utilities. `Event`, `CustomEventTypes`, and `UserFromToken` are kept — do not delete them.
2. **Rename `Role` → `RoleName`** at every import + annotation site.
3. **Rewrite event-handler callback types where needed.** `Event` is still valid (its union widened) — prefer `EventPayload<'…'>` for narrowed access. Custom event-type augmentation still goes on `CustomEventTypes`, unchanged from v9. Rename any imports of the plural `EventTypes` to the singular `EventType`.
4. **Guard `channel.state.membership` reads** with `?.` — it's `undefined` on freshly constructed channels.
5. **Fix filter objects that used undeclared operators** for constrained endpoints (`queryChannels`, `queryUsers`, `queryReactions`, `queryThreads`, `queryMembers`, `queryBannedUsers`, `queryMessageFlags`, `search`). If the filter must stay as-is, cast; otherwise use a declared operator.
6. **Move composer attachment metadata reads** from `attachment.mime_type` / `attachment.file_size` / `attachment.duration` to `attachment.custom?.<same>`.
7. **Format `LocationComposer` preview `end_at` at read sites** — it's a `Date` now.
8. **Rename `ReminderManager` call-site keys** `messageId` → `message_id`. Same for any place you were shaping a reminder-event body.
9. **Delete any code that used `client.secret`, `client._isUsingServerAuth()`, `client.setAnonymousUser`, `client.markAllRead`, or assigned to `client.userID`.** Move server-side callers to `@stream-io/node-sdk`.
10. **Rewrite `client.revokeTokens(isoString)`** to `client.revokeTokens(new Date(isoString))`.
11. **Fix upload call sites.** `channel.sendFile` / `sendImage` / `client.uploadFile_` / `uploadImage_` take `string | File` now — no `Buffer`, no readable streams. Pass `contentType` explicitly when the source is a React-Native URI string.
12. **Delete bundler shims** added for `stream-chat`'s Node-only deps (`crypto`, `https`, `zlib`, `jsonwebtoken`, `ws`) — `package.json#browser` is gone because nothing imports them anymore.
13. **Polyfill `atob`** if your React Native / Hermes target lacks it (`typeof atob === 'undefined'`); `UserFromToken` depends on it during `connectUser`.
