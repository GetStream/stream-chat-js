# v9 → v10 Migration Guide — Everything Else

> Scope: this guide catches breaking changes **not** covered by the four topic-specific guides:
>
> - `v9-to-v10-migration-guide-client-construction.md` (constructor & options)
> - `v9-to-v10-migration-guide-logging.md` (`chatLoggerSystem`, sinks, scopes)
> - `v9-to-v10-migration-guide-methods.md` (per-method signatures on `StreamChat`, `Channel`, `ChannelState`, `Moderation`, `StableWSConnection`)
> - `v9-to-v10-migration-guide-sort.md` (`SortParamRequest[]` shape)
>
> Read those first. This guide covers **exports, removed feature modules, event-type shape, filter constraints, small state/composer shape changes, and residual type/property renames** that the topic guides do not.

## TL;DR

- **Server-side is gone.** If you construct with a `secret` or call server-only admin endpoints, switch to `@stream-io/node-sdk`. The construction guide has the full list — every feature module below that was server-only is dropped for the same reason.
- Four barrels removed from the package root, one added: **`./events`, `./campaign`, `./channel_batch_updater`, `./segment` are gone; `./logger` is new.**
- `CustomEventTypes` module augmentation is **removed**; augment `ListenerKeys` (union of known WS + local event types) instead.
- `Event` (union) is removed; use `WSEvent | LocalEvent = CombinedEvents` and `EventPayload<'<type>'>` for narrowing.
- Filter payloads now carry **per-endpoint operator constraints** (`Query*FilterConditions` types) — previously-permissive filter objects may stop type-checking.
- `ChannelState.membership` initializes to `undefined` (was `{}`); `ChannelState.typing` values are now `EventPayload<'typing.start' | 'typing.stop'>` (were `Event`); read receipts merged with the generated `ReadStateResponse`.
- Composer attachments now nest `mime_type` / `file_size` / `duration` under `.custom`; `LocationComposer` preview `end_at` is a `Date` (was ISO string).
- `Role` type renamed to `RoleName`.
- Assorted small tightenings: `TokenManager.setTokenOrProvider` user param narrowed, `revokeTokens(before)` no longer accepts `string`, `UserGroupPaginator` cursor field is a `Date`.

---

## Public export surface

`src/index.ts` barrel changes:

| Removed export barrel                      | Reason                                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `export * from './events'`                 | `src/events.ts` deleted along with `EVENT_MAP`. Event-type set is now derived from the generated event decoders, no longer a hand-rolled map. |
| `export * from './campaign'`               | `Campaign` was a server-side admin surface; the module is emptied.                                                                            |
| `export * from './segment'`                | Same as `campaign`.                                                                                                                           |
| `export * from './channel_batch_updater'`  | `ChannelBatchUpdater` was a server-side admin surface.                                                                                        |
| `CustomEventTypes` (re-exported interface) | Interface deleted from `custom_types.ts` — see event section below.                                                                           |

| Added export barrel        | What it exposes                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `export * from './logger'` | `chatLoggerSystem`, `LogLevel`, `LogLevelEnum`, `Sink`, `ScopedLogger`, `ChatLoggerScope`, `ConfigureLoggersOptions`. See logging guide. |

Any consumer doing `import { Campaign, Segment, ChannelBatchUpdater, EVENT_MAP } from 'stream-chat'` will fail to resolve. Delete those imports; there is no drop-in replacement in this SDK.

---

## Removed feature modules / subsystems

Beyond the individual server-side methods listed in the methods guide, entire subsystems are gone. If your app used one of these, the client-side wrapper is not coming back — move to `@stream-io/node-sdk`:

| Subsystem                          | v9 shape                                                                             | v10 status                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Campaigns**                      | `client.campaign`, `queryCampaigns`, `createCampaign`, `startCampaign`, `stopCampaign`, `updateCampaign`, `deleteCampaign`, `getCampaign` | removed                                                                                                                                        |
| **Segments**                       | `client.segment`, `createSegment`, `createUserSegment`, `createChannelSegment`, `updateSegment`, `getSegment`, `deleteSegment`, `querySegments`, `segmentTargetExists`, `addSegmentTargets`, `removeSegmentTargets`, `querySegmentTargets` | removed                                                                                                                                        |
| **`ChannelBatchUpdater`**          | `client.channelBatchUpdater`, `client.updateChannelsBatch(...)`                      | removed                                                                                                                                        |
| **Retention policies**             | `setRetentionPolicy`, `deleteRetentionPolicy`, `getRetentionPolicy`, `getRetentionPolicyRuns` | removed                                                                                                                                        |
| **Team usage stats**               | `queryTeamUsageStats`                                                                | removed                                                                                                                                        |
| **User groups**                    | `createUserGroup`, `getUserGroup`, `searchUserGroups`, `updateUserGroup`, `deleteUserGroup`, `addUserGroupMembers`, `removeUserGroupMembers` | mutations removed. Read paths (`queryUserGroups` + `UserGroupPaginator`) remain; see paginator note below.                                     |
| **Predefined filters (client)**    | `deletePredefinedFilter`, `PredefinedFilterSort(Param)` types, `mapPredefinedFilterSortToChannelSort` helper | removed. Read paths remain via the generated API.                                                                                              |
| **Reminder client batch API**      | `client.createReminder`, `client.updateReminder`, `client.deleteReminder`, `client.queryReminders` | removed from `StreamChat`. `ReminderManager` remains — use it. See "Reminders" below for shape change.                                          |
| **Push provider admin**            | `upsertPushProvider`, `deletePushProvider`, `listPushProviders`, `setPushPreferences` | removed                                                                                                                                        |
| **Roles / Permissions admin**      | `createRole`, `listRoles`, `deleteRole`, `getPermission`, `createPermission`, `updatePermission`, `deletePermission`, `listPermissions` | removed. `searchRoles` remains, inherited from the generated API.                                                                              |
| **Channel-types admin**            | `createChannelType`, `getChannelType`, `updateChannelType`, `deleteChannelType`, `listChannelTypes` | removed                                                                                                                                        |
| **Commands admin**                 | `createCommand`, `getCommand`, `updateCommand`, `deleteCommand`, `listCommands`      | removed                                                                                                                                        |
| **Imports / Exports**              | `_createImport`, `_createImportURL`, `_getImport`, `_listImports`, `exportChannel`, `exportChannels`, `exportUsers`, `getExportChannelStatus`, `getTask` | removed                                                                                                                                        |
| **App-settings mutations**         | `updateAppSettings`, `testPushSettings`, `testSQSSettings`, `testSNSSettings`, `translate`, `translateMessage`, `getHookEvents` | removed. `getAppSettings` remains.                                                                                                             |
| **User admin**                     | `partialUpdateUser`, `deleteUser`, `restoreUsers`, `reactivateUser(s)`, `deactivateUser(s)`, `exportUser`, `revokeUserToken`, `revokeUsersToken`, `sendUserCustomEvent`, `deleteUsers` | removed                                                                                                                                        |
| **Flag admin**                     | `_queryFlags`, `_queryFlagReports`, `_reviewFlagReport`, `queryMessageFlags`, `updateFlags` | removed. User/message flagging by the connected user remains via `client.flagMessage` / `client.flagUser`.                                     |
| **Webhook / SQS / SNS helpers**    | `client.verifyWebhook`, `client.verifyAndParseWebhook`, `client.parseSqs`, `client.parseSns` (used `client.secret` implicitly) | Moved to module exports on `./signing`, `secret` now required explicitly. See methods guide for signatures.                                    |
| **Misc.**                          | `commitMessage`, `undeleteMessage`, `getSharedLocations`, `updateLocation`, `getUnreadCountBatch`, `getBlockList`, `enrichURL`, `_normalizeDate`, `validateServerSideAuth`, `_setupConnection`, `_enrichAxiosOptions`, `_logApiRequest`, `_logApiError` | removed                                                                                                                                        |

If your call site was gated on `client._isUsingServerAuth()` (which is also removed), delete the branch — it was only ever true on the server-side path.

---

## Event system

`src/events.ts` — the single-source `EVENT_MAP` — is **deleted**. Event types are now driven by the generated event decoders (`src/gen/model-decoders/event-decoder-mapping.ts`) plus a small local overlay. As a result:

### Union types you'll see

```ts
// Wire events (over WS) — every generated event type.
type WSEvent = /* union of all generated Gen_*Event shapes */;

// SDK-only events not received over the wire.
type LocalEvent =
  | ({ type: 'live_location_sharing.started'; message: MessageResponse })
  | ({ type: 'live_location_sharing.stopped'; live_location?: SharedLocationResponse })
  | ({ type: 'channels.queried';
       queriedChannels: { channels: ChannelAPIResponse[]; isLatestMessageSet: boolean } })
  | ({ type: 'transport.changed'; mode: string })
  | ({ type: 'connection.changed'; online: boolean })
  | { type: 'connection.recovered' }
  | ({ type: 'offline_reactions.queried'; offlineReactions: ReactionResponse[] })
  | ({ type: 'capabilities.changed'; cid: string; own_capabilities: ChannelOwnCapability[] })
  & { received_at?: Date };

export type CombinedEvents = WSEvent | LocalEvent;
export type EventHandler<T = string> = (
  event: Extract<CombinedEvents, { type: T }>,
) => void;

export type EventPayload<T extends CombinedEvents['type'] | (string & {})> = Extract<
  CombinedEvents,
  { type: T }
>;

// From client.ts
export type ListenerKeys = CombinedEvents['type'] | 'all';
```

### v9 → v10 replacement table

| v9                                                                | v10                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `import { Event } from 'stream-chat'`                             | `import { CombinedEvents, WSEvent, LocalEvent } from 'stream-chat'`                                            |
| `Event` as a callback argument type                               | `CombinedEvents` (or the specific `EventPayload<'message.new'>`)                                               |
| `import { EventTypes } from 'stream-chat'`                        | `import { ListenerKeys } from 'stream-chat'` (values are the same strings)                                     |
| `import { EVENT_MAP } from 'stream-chat'`                         | removed — no runtime table. Match on `event.type` directly.                                                    |
| `interface CustomEventTypes { my_custom: 'my_custom'; ... }` (module augmentation) | augment `ListenerKeys` from `stream-chat` — see below                                                          |
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

v9:

```ts
// v9
declare module 'stream-chat' {
  interface CustomEventTypes {
    my_app_custom: 'my_app_custom';
  }
}
```

v10:

```ts
// v10 — augment ListenerKeys via a local module declaration
declare module 'stream-chat' {
  type ListenerKeys = import('stream-chat').ListenerKeys | 'my_app_custom';
}
// Alternative: fall through to `string` where you use the listener key generic:
client.on<'my_app_custom'>('my_app_custom', (event) => { /* event is CombinedEvents */ });
```

Because the v10 generic on `on<T extends ListenerKeys | string>` accepts any `string`, unknown listener keys still type-check without augmentation, but the event payload will not be narrowed.

> **Larger topic** — the event system rewrite (removed hand-rolled event types across `poll`, `poll_manager`, `thread`, `reminders`, live-location, and the client itself; the shift from a hand-maintained `EVENT_MAP` to generated decoders; module-augmentation shape) touches enough call sites that it may warrant a dedicated guide. Flag me if you want one written.

---

## Filter payloads — per-endpoint operator constraints

New generated types under `src/gen/models/filter-conditions.ts` narrow what operators are legal per field per endpoint:

```
QueryBannedUsersPayloadFilterConditions
QueryChannelsRequestFilterConditions
QueryMembersPayloadFilterConditions
QueryMessageFlagsPayloadFilterConditions
QueryReactionsRequestFilter
QueryThreadsRequestFilter
QueryUsersPayloadFilterConditions
SearchPayloadFilterConditions
SearchPayloadMessageFilterConditions
```

Each entry looks like `{ field_name: { type: <ts-type>; operators: '$eq' | '$in' | ... } }`. The public request types (`QueryChannelsRequest`, `QueryReactionsRequest`, `QueryBannedUsersPayload`, ...) are wrapped with `WithTypedFilters<Base, FilterConditions>` so `filter_conditions` at the call site can only use operator/value combinations declared in the corresponding constraint.

**Breaking effect:** any v9 filter object that used an operator not declared for a given field will stop type-checking:

```ts
// v9 — accepted (typing was permissive)
client.queryChannels({ frozen: { $exists: true } as any }, sort);

// v10 — QueryChannelsRequestFilterConditions.frozen only declares `{ type: boolean; operators: '$eq' }`.
// This now fails to compile — use { frozen: true } or { frozen: { $eq: true } } instead.
```

Field-name typos in `filter_conditions` are now compile errors for endpoints that ship a constraint type (previously only some endpoints narrowed field names). If you were relying on the v9 permissive shape, casting through `as any` is the escape hatch; the correct fix is to use the declared operators.

`ChannelFilters`, `MessageFilters`, `ReactionFilters`, `UserFilters` etc. still exist as convenience aliases but derive from the constrained request types.

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
type ChannelReadStatus = Record<string, ReadStateResponse & { first_unread_message_id?: string }>;
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
export type LiveLocationPreview = Omit<LiveLocationPayload, 'end_at'> & { durationMs?: number };
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
Promise<GetAppSettingsAPIResponse>

// v10
Promise<StreamResponse<Gen_GetApplicationResponse>>
```

`StreamResponse<T> = T & { metadata: RequestMetadata }` — pre-existing fields are all still there; the wrapper only adds `metadata`.

### `client._user` type

```ts
// v9
_user?: OwnUserResponse | UserResponse

// v10
_user?: ClientUser
```

`ClientUser` collapses the two into a single alias. Fields present on both are unchanged; anything specific to `OwnUserResponse` (e.g. `total_unread_count`) reads the same way.

---

## Type utilities dropped

The following v9 helper types are removed from the public surface. They mostly served the old hand-rolled types and are no longer needed:

`Readable<T>`, `KnownKeys<T>`, `PartializeKeys`, `UnknownType`, `MessageResponseBase`, `LocalMessageBase`, `FormatMessageResponse`, `ChannelAPIResponse` variants, `QueryChannelsAPIResponse`, `QueryReactionsOptions`/`APIResponse`, `TranslateResponse`, `ModerationResult`, `AutomodDetails`, `FlagsResponse`, `MessageFlagsResponse`, `FlagReport(s)Response`, `ReviewFlagReportResponse`, `BannedUsersResponse`, `FutureChannelBan(s)Response`, `HookEvent(s)Response`, `CheckPush/SQS/SNSResponse`, `CommandResponse` family, `ExportChannel*`/`ExportUsers*` types, push-preference types (`ChatLevelPushPreference`, `CallLevelPushPreference`, `PushPreferenceLevel`, `ChatPreferences`, `PushPreference`).

For any of these that survive as a generated shape, the replacement is the generator's `Gen_*` re-export (re-exported through `./types` or `./gen/models`). For the type utilities (`Readable`, `KnownKeys`, `PartializeKeys`, `UnknownType`) there is no replacement — inline the built-in equivalent or drop the constraint.

> **Larger topic** — the `types.ts` cleanup (~4.6k lines removed, most hand-rolled response/request types replaced by generated shapes) is large enough that a per-type cheat sheet ("`FormatMessageResponse` → …", "`FlagReportsResponse` → …", …) may deserve its own guide. Flag me if you want one written.

---

## Mechanical migration checklist

For each source file that touches the SDK:

1. **Delete removed imports.** `Event`, `EventTypes`, `EVENT_MAP`, `CustomEventTypes`, `Campaign*`, `Segment*`, `ChannelBatchUpdater`, `Role` (rename), `MessageResponseBase`, `FormatMessageResponse`, `PredefinedFilterSort(Param)`, and any of the removed type utilities.
2. **Rename `Role` → `RoleName`** at every import + annotation site.
3. **Rewrite event-handler callbacks** to take `CombinedEvents` (or `EventPayload<'…'>`) instead of `Event`. Where you had a custom event-type augmentation via `CustomEventTypes`, rewrite it as a `ListenerKeys` augmentation.
4. **Guard `channel.state.membership` reads** with `?.` — it's `undefined` on freshly constructed channels.
5. **Fix filter objects that used undeclared operators** for constrained endpoints (`queryChannels`, `queryUsers`, `queryReactions`, `queryThreads`, `queryMembers`, `queryBannedUsers`, `queryMessageFlags`, `search`). If the filter must stay as-is, cast; otherwise use a declared operator.
6. **Move composer attachment metadata reads** from `attachment.mime_type` / `attachment.file_size` / `attachment.duration` to `attachment.custom?.<same>`.
7. **Format `LocationComposer` preview `end_at` at read sites** — it's a `Date` now.
8. **Rename `ReminderManager` call-site keys** `messageId` → `message_id`. Same for any place you were shaping a reminder-event body.
9. **Delete any code that used `client.secret`, `client._isUsingServerAuth()`, `client.setAnonymousUser`, `client.markAllRead`, or assigned to `client.userID`.** Move server-side callers to `@stream-io/node-sdk`.
10. **Rewrite `client.revokeTokens(isoString)`** to `client.revokeTokens(new Date(isoString))`.
