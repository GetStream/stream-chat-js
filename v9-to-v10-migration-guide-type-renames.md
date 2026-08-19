# v9 → v10 Migration Guide — Type Renames

> Scope: this guide covers **type aliases that were hand-rolled in `types.ts` and have been removed in v10 in favor of a differently-named type**. In most cases, the removed alias pointed at a type generated from the OpenAPI spec (imported from `./gen/models`), and the v10 target is that generated name — now re-exported directly from `stream-chat`. A handful of entries (`Automod`, `AutomodBehavior`, `TranslationLanguage`) resolve to a derived alias in `src/types.ts` — a lookup on a generated type rather than a raw re-export; those are noted per row. Consumers should switch to the v10 name in every case.
>
> This document is written for AI agents doing mechanical rewrites. Each entry lists the v9 name, the v10 name, and the file(s) where the type is exported from. All v10 names are still importable from the package root (`stream-chat`) or from `stream-chat/dist/types` — nothing has moved outside the package surface.
>
> If a codebase imports one of these names it will fail to resolve in v10; apply the table below as a find/replace. For most rows behavior is unchanged — the underlying type is identical to what the removed alias resolved to in v9.
>
> **Three rows are the exception.** `APIErrorResponse`, `DraftMessagePayload`, and `EventAPIResponse` were hand-rolled object types in v9, not aliases of a generated type, and their v10 targets differ field-by-field. A mechanical find/replace on those three will compile in some places and silently change meaning in others — stop at them and read [Rows that are shape changes, not renames](#rows-that-are-shape-changes-not-renames) below.

## How to apply

For every entry in the table below:

1. Rewrite every occurrence of the v9 name (imports, type annotations, generic arguments, casts, JSDoc) to the v10 name. Match on **whole-word boundaries** — do not blindly replace substrings. Several v9 names appear as prefixes or suffixes of unrelated identifiers (`PollVote` is a substring of `castPollVote`, `PollVoteResponseData`, `PollVoteChanged`; `ReminderResponse` is a substring of `ReminderResponseData`; `Mute` is a substring of `MuteResponse`, `MuteUserOptions`, `UserMuteResponse`, and many method/field names; `RequestOptions` is a substring of `UploadRequestOptions`, which is a **different** type and is not renamed). Blind `s/PollVote/PollVoteResponseData/g` will corrupt method names and produce identifiers like `castPollVoteResponseData` that do not exist.
2. Keep the import path unchanged — `import { X } from 'stream-chat'` still works with the v10 name.
3. Do **not** rewrite string literals, JSDoc prose, or command-name data (e.g. `{ name: 'mute', description: 'Mute a user' }`) — only identifiers used in type positions.

## Two v9 names collide with unrelated generated names — do not merge

v10 exposes two generated types whose names collide with v9 aliases that pointed at a **different** generated type. After the rename you must import the v10 target (right column below) — importing the identically-named `MuteResponse` or `SharedLocationResponse` will give you the wrong shape:

| v9 alias                 | Aliased in v9 to             | v10 replacement (use this)   | Also in v10 but a different, unrelated shape                                       |
| ------------------------ | ---------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `MuteResponse`           | `UserMuteResponse`           | `UserMuteResponse`           | `MuteResponse` (server response for `/mute`, distinct from `UserMuteResponse`)     |
| `SharedLocationResponse` | `SharedLocationResponseData` | `SharedLocationResponseData` | `SharedLocationResponse` (endpoint response wrapping `SharedLocationResponseData`) |

## Rename table

| v9 (removed)                   | v10 (use this)                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APIErrorResponse`             | `APIError`                               | ⚠️ **Shape change, not an alias** — `StatusCode` becomes `status_code`, `code` becomes required, `details` becomes `Array<number>`. See [below](#apierrorresponse--apierror).                                                                                                                                                                                                                                                                                  |
| `AppSettings`                  | `AppResponseFields`                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `AppSettingsAPIResponse`       | `GetApplicationResponse`                 | Return type of `client.getAppSettings()`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `AutomodDetails`               | `AutomodDetailsResponse`                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ChannelAPIResponse`           | `ChannelStateResponseFields`             | The per-channel entry inside a `queryChannels` response (fields only, no top-level `duration`).                                                                                                                                                                                                                                                                                                                                                                |
| `ChannelConfigAutomod`         | `Automod`                                | ⚠️ **Narrowed after `rc.4`.** `Automod` is now `ChannelConfigWithInfo['automod']` — exactly `'disabled' \| 'simple' \| 'AI'`. It previously carried a `\| (string & {})` tail that let any string through.                                                                                                                                                                                                                                                     |
| `ChannelConfigAutomodBehavior` | `AutomodBehavior`                        | ⚠️ **Narrowed after `rc.4`.** Now `ChannelConfigWithInfo['automod_behavior']` — exactly `'flag' \| 'block' \| 'shadow_block'`, without the `\| (string & {})` tail.                                                                                                                                                                                                                                                                                            |
| `ChannelQueryOptions`          | `ChannelGetOrCreateRequest`              | Payload for `channel.watch()`, `channel.create()`, and `channel.query()`. The v9 alias masked the OpenAPI name; v10 uses the generated name directly.                                                                                                                                                                                                                                                                                                          |
| `CommandResponse`              | `Command`                                | Slash-command descriptor — matches the shape stored under `channel.getConfig().commands`.                                                                                                                                                                                                                                                                                                                                                                      |
| `CreatePollData`               | `CreatePollRequest`                      | Payload for `client.createPoll()` / `PollManager.createPoll()`.                                                                                                                                                                                                                                                                                                                                                                                                |
| `DraftMessagePayload`          | `MessageRequest`                         | ⚠️ **Shape change, and the payload is now nested** — `channel.createDraft` takes `{ message: MessageRequest }`. See [below](#draftmessagepayload--messagerequest).                                                                                                                                                                                                                                                                                             |
| `ErrorFromResponse`            | `StreamAPIError`                         | **Runtime value**, not just a type — was `export const ErrorFromResponse = StreamAPIError;`. Rewrite `instanceof ErrorFromResponse` and `new ErrorFromResponse(...)` call sites too.                                                                                                                                                                                                                                                                           |
| `EventAPIResponse`             | depends on the endpoint                  | ⚠️ **One v9 alias became three generated response types.** HTTP endpoints still return an event — only `markDelivered` lost it. See [below](#eventapiresponse--one-type-per-endpoint).                                                                                                                                                                                                                                                                         |
| `EventTypes`                   | `EventType`                              | Simple singular/plural rename.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `MarkDeliveredOptions`         | `MarkDeliveredRequest`                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `MarkReadOptions`              | `MarkReadRequest`                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `MarkUnreadOptions`            | `MarkUnreadRequest`                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Message`                      | `MessageRequest`                         | The v9 `Message` alias resolved to the generated `MessageRequest` (send-message payload). Rewrite in type positions only — `Message` is a common English noun and appears in JSDoc, permission names, and error strings; leave those alone.                                                                                                                                                                                                                    |
| `Mute`                         | `UserMuteResponse`                       | Both v9 `Mute` and v9 `MuteResponse` aliased `UserMuteResponse` — the v10 name is the same for both.                                                                                                                                                                                                                                                                                                                                                           |
| `MuteResponse`                 | `UserMuteResponse`                       | See collision note above — v10 also exports a different `MuteResponse` from the server-side `mute` endpoint. Use `UserMuteResponse` when replacing the v9 alias.                                                                                                                                                                                                                                                                                               |
| `PartialUpdateChannel`         | `UpdateChannelPartialRequest`            | Payload for `channel.updatePartial`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `PartialUserUpdate`            | `UpdateUserPartialRequest`               | Payload for the partial-user-update endpoint.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `PollAnswer`                   | `PollVoteResponseData`                   | v9 modeled answers as a separate type; v10 treats them uniformly with vote responses.                                                                                                                                                                                                                                                                                                                                                                          |
| `PollData`                     | `UpdatePollRequest`                      | Payload for `client.updatePoll()`. Also used internally by `PartialPollUpdate` (its `set`/`unset` are keyed on this type).                                                                                                                                                                                                                                                                                                                                     |
| `PollOption`                   | `PollOptionResponseData`                 | The v9 alias pointed at the generated `PollOptionResponseData`. Not to be confused with `PollOptionData` (the update-poll-option request payload), which is a different local type and is **not** renamed.                                                                                                                                                                                                                                                     |
| `PollVote`                     | `PollVoteResponseData`                   | Applied to type positions only. Do **not** rewrite method names such as `castPollVote`, `deletePollVote`, `queryPollVotes` or event guards like `isPollVoteCastedEvent`.                                                                                                                                                                                                                                                                                       |
| `PrivacySettings`              | `PrivacySettingsResponse`                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PushPreference`               | `PushPreferenceInput`                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `QueryChannelAPIResponse`      | `ChannelStateResponse`                   | The full response of `client.getOrCreateChannel` (has top-level `duration`).                                                                                                                                                                                                                                                                                                                                                                                   |
| `QueryChannelsAPIResponse`     | `QueryChannelsResponse`                  | Return type of the raw `client.queryChannels` inherited from the generated `ChatApi`.                                                                                                                                                                                                                                                                                                                                                                          |
| `QueryThreadsOptions`          | `QueryThreadsRequest`                    | Payload for `client.queryThreadsAndHydrate` / `ThreadManager.queryThreads`.                                                                                                                                                                                                                                                                                                                                                                                    |
| `QueryUserGroupsOptions`       | `ListUserGroupsOptions`                  | Same underlying shape (`NonNullable<Parameters<ChatApi['listUserGroups']>[0]>`) — pure rename to match the new `client.listUserGroups` method. See the methods guide.                                                                                                                                                                                                                                                                                          |
| `QueryUserGroupsResponse`      | `StreamResponse<ListUserGroupsResponse>` | Was a hand-rolled `APIResponse & { user_groups: UserGroupResponse[] }`; v10 uses the generated `ListUserGroupsResponse` wrapped in `StreamResponse<...>`, which adds a `metadata: RequestMetadata` field alongside `duration` and `user_groups`. Callers that only destructure `user_groups` are unaffected.                                                                                                                                                   |
| `ReadResponse`                 | `ReadStateResponse`                      | Per-user read state on a channel/thread.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `ReminderResponse`             | `ReminderResponseData`                   | The single-reminder entry returned by the reminders paginator. Note: this is only the type; helper names like `generateReminderResponse` in test utilities should stay as-is.                                                                                                                                                                                                                                                                                  |
| `RequestOptions`               | `StreamRequestOptions`                   | Per-request options that are never serialized into the payload — still `{ signal?: AbortSignal }`, so the type itself is a 1:1 rename. **The positions that accept it changed**, see [below](#requestoptions--streamrequestoptions).                                                                                                                                                                                                                           |
| `SharedLocationResponse`       | `SharedLocationResponseData`             | See collision note above — v10 also exports a different `SharedLocationResponse` from the generated shared-location endpoint. Use `SharedLocationResponseData` when replacing the v9 alias.                                                                                                                                                                                                                                                                    |
| `StaticLocationPayload`        | `SharedLocation`                         | Payload for static (non-live) shared-location attachments.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ThreadResponse`               | `ThreadStateResponse`                    | The v9 alias wrapped the generated `ThreadStateResponse` with a `custom` overlay. In v10 the custom-overlay pattern is dropped and `ThreadResponse` in `stream-chat` refers to the minimal generated shape — which is missing `read`, `latest_replies`, and `draft`. Anything using those fields must switch to `ThreadStateResponse`. (`thread_participants` and `parent_message` are on both shapes.) `generateThreadResponse` in test-utils keeps its name. |
| `TranslationLanguages`         | `TranslationLanguage`                    | Renamed from plural to singular. The v9 literal union is gone; the v10 alias is `TranslateMessageRequest['language']` — a hand-defined alias in `src/types.ts` that reads the `language` field type off the generated `TranslateMessageRequest` model (the underlying `client.translateMessage` endpoint is not exposed by this SDK; the request/language model is still generated).                                                                           |
| `UpdateLocationPayload`        | `UpdateLiveLocationRequest`              | Payload for `channel.stopLiveLocationSharing`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `User_old`                     | `UserResponse`                           | Trivial 1:1 alias.                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Rows that are shape changes, not renames

Three entries in the table above were **hand-rolled object types** in v9 rather than aliases of a generated type. Renaming the identifier is necessary but not sufficient — the field sets differ, so read the field the call site actually touches.

### `APIErrorResponse` → `APIError`

|             | v9 `APIErrorResponse`                            | v10 `APIError`                                                              |
| ----------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| status code | `StatusCode: number`                             | **`status_code: number`** — field renamed                                   |
| `code`      | `code?: number`                                  | **`code: number`** — now required                                           |
| `details`   | `details?: { code: number; messages: string[] }` | **`details: Array<number>`** — required, and a different type               |
| —           | —                                                | adds `unrecoverable?: boolean`, `exception_fields?: Record<string, string>` |

The trap is `StatusCode`: it is still a live field name elsewhere in the SDK — on WS errors and on the local error type in `src/errors.ts` — so a blind `StatusCode` → `status_code` sweep will corrupt those call sites. Only rewrite it where the value came out of `err.response.data` on an HTTP error.

There is **no name collision on the public surface**: `src/errors.ts` is not re-exported from the package root, so `import { APIError } from 'stream-chat'` unambiguously resolves to the generated model. (Inside this repo, files that need both import the generated one as `Gen_APIError`.)

### `DraftMessagePayload` → `MessageRequest`

v9's type was `PartializeKeys<Omit<DraftMessage, 'mentioned_groups'>, 'id'> & { user_id?: string }`. Against `MessageRequest`:

- `text` was **required**, and is now optional.
- `html` and `user_id` **do not exist** on `MessageRequest`.
- `MessageRequest` **adds** `pinned`, `pinned_at`, `pin_expires`, `restricted_visibility`, and narrows `type` to `'regular' | 'system'`.

The payload is also **nested** now — `channel.createDraft` takes `CreateDraftRequest`, i.e. `{ message: MessageRequest }`, not a bare message. See `channel.createDraft` in `v9-to-v10-migration-guide-methods.md` for the call-site rewrite.

### `EventAPIResponse` → one type per endpoint

v9 used this one alias for three endpoints. v10 gives each its own generated response type, and **two of the three still return the event over HTTP** — the v9 advice to "pick the event up from the WS stream" applies only to `markDelivered`.

| v9 call site                                         | v10 return type                         | Event                                                              |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `channel.sendEvent`                                  | `StreamResponse<EventResponse>`         | `event: WSEvent` — still required; structural match for v9         |
| `channel.markAsReadRequest` → v10 `channel.markRead` | `StreamResponse<MarkReadResponse>`      | `event?: MarkReadResponseEvent` — now **optional**                 |
| `client.markChannelsDelivered` → v10 `markDelivered` | `StreamResponse<MarkDeliveredResponse>` | none — `{ duration }` only. Read the event off the WS stream here. |

Two things to watch on the `markRead` row: `event` became optional, so destructuring it needs narrowing; and `MarkReadResponseEvent` is a **narrower shape than the WS `Event` union** (`type: string` rather than the `'message.read'` literal, and none of the WS read-event extras such as `total_unread_count` / `unread_channels`). It is not assignable to `Event` — do not feed it to code that expects a WS event.

## Rows where the type is unchanged but the call sites moved

### `RequestOptions` → `StreamRequestOptions`

The type is a 1:1 rename — both are `{ signal?: AbortSignal }`, "per-request options that are never part of the serialized request payload". `StreamRequestOptions` is exported from the package root like every other row here. What changed is **where you pass it**.

In v9 it arrived two ways: as a trailing positional parameter (`requestOptions: RequestOptions = {}`) on a handful of hand-written client/channel methods, and as part of `ChannelStateOptions`, which composed `RequestOptions` so that `queryChannels` could carry the abort signal in the same bag as its state flags. In v10 there is exactly one way to pass it:

- **It is always the last parameter**, immediately after the method's own arguments — on every method generated from the OpenAPI spec (`chatApi.search(request, requestOptions)`) and on every hand-written wrapper around one, on both `StreamChat` and `Channel`.
- `ChannelStateOptions` **no longer composes it** — it is `{ offlineMode?; skipInitialization?; skipHydration?; withResponse? }` only. A `{ ..., signal }` passed there is no longer read. `client.queryChannelsAndHydrate` takes `requestOptions` as its own third parameter, after `stateOptions`.

Mapping for the v9 methods that took a `RequestOptions` — all six still accept one, only the arguments ahead of it changed shape:

| v9 call site                                                      | v10                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| `client.queryUsers(filters, sort, options, requestOptions)`       | `client.queryUsers(request, requestOptions)`        |
| `client.searchRoles(options, requestOptions)`                     | `client.searchRoles(request, requestOptions)`       |
| `client.searchUserGroups(options, requestOptions)`                | `client.searchUserGroups(request, requestOptions)`  |
| `client.search(filterConditions, query, options, requestOptions)` | `client.search(request, requestOptions)`            |
| `client.queryChannelsRequestWithResponse(…, requestOptions)`      | `client.queryChannels(request, requestOptions)`     |
| `channel.queryMembers(filters, sort, options, requestOptions)`    | `channel.queryMembers({ payload }, requestOptions)` |

For a request with no wrapper at all, `client.api.sendRequest(method, url, pathParams, queryParams, body, contentType, { signal })` is the layer that reads the option and puts `signal` on the axios request config.

v9 also had `client.createAbortControllerForNextRequest()`, which armed a controller that the **next** outgoing request picked up implicitly — with concurrent requests in flight, there was no telling which call the signal would land on. It is **removed**; pass a `signal` through `StreamRequestOptions` on the specific call instead. See `v9-to-v10-migration-guide-methods.md` for the before/after and the offline-queue interaction.

## Types that are **not** renamed (kept as-is)

These v9 names look like they'd be caught by the same rewrite pass but are **not** simple aliases — they either have hand-authored shape on top of the generated type (via `RequireLiteral`, compound intersections, etc.) or point at a locally-defined type. Some names now re-export the generated shape directly through `export * from './gen/models'`; the name is the same but the shape may have narrowed since v9. Do not rewrite these:

- `MessageResponse`, `UserResponse`, `OwnUserResponse`, `ReactionResponse`, `ChannelResponse`, `ChannelMemberResponse`, `DraftResponse`, `Attachment`, `PollResponseData`, `PollOptionResponseData`, `MessageRequest` — in v9 these were wrapped with `ReplacePropertyTypes<…, { custom: Custom*Data }>`; in v10 the custom-overlay pattern is dropped and the raw generated shape is re-exported. The v9 name is retained.
- `PollOptionData`, `DraftMessage`, `SharedLiveLocationResponse` — compound types (locally-defined or `RequireLiteral<…, 'end_at'>`). Keep as-is.
- `LiveLocationPayload`, `ChannelData` and `PollResponse_old` **were** in this list and are now removed — see [below](#aliases-that-restated-a-generated-type).
- `AppSettings` is the only "settings"-ish name that IS renamed here (to `AppResponseFields`). Do not confuse it with `AppSettingsAPIResponse` (also removed; renamed to `GetApplicationResponse`) — they were two different aliases that shared a prefix.

## Removed after `10.0.0-rc.4` — convergence on the generated types

Skip this section if you are upgrading from v9; everything below is already reflected in the tables above. It exists for integrations pinned to the `rc` dist-tag, because these types still shipped in `10.0.0-rc.4` and are deleted afterwards. **No back-compat alias remains for any of them.**

Every removal here has the same rationale: the type restated something the OpenAPI generator already emits, so it was one more place a spec change had to be mirrored by hand — and several had already drifted from the spec they were copied from.

### Own-user and device shapes

| Removed after `rc.4` | Replacement      | Detail                                                      |
| -------------------- | ---------------- | ----------------------------------------------------------- |
| `Device`             | `DeviceResponse` | ⚠️ **Shape change.** See [below](#device--deviceresponse).  |
| `DeviceFields`       | `DeviceResponse` | Same — the v10 trio collapsed into the one generated shape. |
| `BaseDeviceFields`   | `DeviceResponse` | Same.                                                       |

`OwnUserBase` keeps its name but **changes shape**: it is now derived as `Pick<OwnUserResponse, Exclude<keyof OwnUserResponse, keyof UserResponse>>` rather than hand-listed.

- **Gained** `latest_hidden_channels?: Array<string>` — previously missing from the list, which caused a real defect (see below).
- **Lost** `roles?: string[]` — this field does not exist on `OwnUserResponse` at all. If you were reading it, the value was always `undefined`; the nearest real field is `teams_role?: Record<string, string>`.
- `devices` is now `Array<DeviceResponse>` instead of `Device[]`, and `total_unread_count_by_team` is `Record<string, number>` instead of `Record<string, number> | null`.

#### Behaviour fix — `client.user.latest_hidden_channels` no longer disappears

`client._handleUserEvent` prunes `client.user` on every `user.updated` event: any key that the event body does not carry, and that is not an own-user-only field, is deleted. It decided "own-user-only" from `OwnUserBase` via `isOwnUserBaseProperty()`.

Because the hand-written list omitted `latest_hidden_channels`, and a `user.updated` event body is a plain `UserResponse` (which has no such field), **every `user.updated` event for the connected user deleted `client.user.latest_hidden_channels`**. Reading it after any user update returned `undefined` regardless of server state. Deriving the type fixes this; no call-site change is required.

#### `Device` → `DeviceResponse`

| Field                 | v10 `Device` (removed)                        | `DeviceResponse`   |
| --------------------- | --------------------------------------------- | ------------------ |
| `created_at`          | `string`                                      | `Date`             |
| `push_provider`       | `'firebase' \| 'apn' \| 'huawei' \| 'xiaomi'` | `string`           |
| `user_id`             | `string \| undefined`                         | `string`           |
| `provider`, `user`    | present                                       | **gone**           |
| `hardware_id`, `voip` | **absent**                                    | present (optional) |

`created_at` is the one that bites: the response decoders have always produced a `Date` here, so the old `string` annotation was wrong. Call sites doing `new Date(device.created_at)` still work; ones doing `device.created_at.slice(...)` were already broken at runtime and now fail to compile.

### Stale `Omit` keys — two types quietly widened

Neither is a rename; both **gain** surface, so no call site breaks.

| Type                             | Was                                                         | Now                                     |
| -------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| `ChannelUpdateOptions`           | `Omit<UpdateChannelRequest, 'message' \| 'members'>`        | `Omit<UpdateChannelRequest, 'message'>` |
| `PinnedMessagePaginationOptions` | omits `'id' \| 'member_custom_include' \| 'sort' \| 'type'` | omits `'id' \| 'sort' \| 'type'`        |

`UpdateChannelRequest` has no `members` key (it has `add_members` / `remove_members`), so that omit was a no-op left over from an older payload shape. `member_custom_include` **is** accepted by `getPinnedMessages`, so omitting it was narrowing the API — it can now be passed through.

### Orphans of the server-side split — removed, no replacement

These described admin/server-side surface (push-provider credentials, permission policies, blocklists, channel-type config) that moved to `@stream-io/node-sdk` when the server-side API left this package. Nothing in the SDK referenced them and no endpoint here returns them.

`APNConfig`, `AsyncModerationOptions`, `BlockList`, `CommandVariants`, `FirebaseConfig`, `GetRepliesRequest`, `GiphyVersions`, `HuaweiConfig`, `Policy`, `PolicyRequest`, `Product`, `PushProviderAPN`, `PushProviderCommon`, `PushProviderConfig`, `PushProviderFirebase`, `PushProviderHuawei`, `PushProviderID`, `PushProviderXiaomi`, `UR`, `VotesFiltersOptions`, `XiaomiConfig`.

Two notes:

- **`Product` was an `enum`**, so it was a runtime value in the bundle, not just a type. `import { Product } from 'stream-chat'` fails at runtime now, not only at compile time. Inline the string (`'chat'`, `'video'`, `'moderation'`, `'feeds'`).
- **`UR`** (`Record<string, unknown>`) was a v9 type utility that outlived its callers. It joins `Readable`, `KnownKeys`, `PartializeKeys` and `UnknownType` in [Type utilities dropped](./v9-to-v10-migration-guide-other.md#type-utilities-dropped) — inline `Record<string, unknown>`.

`PushProvider` is **kept** — it is `CreateDeviceRequest['push_provider']`, the union `client.createDevice()` accepts, and it derives from the generated request rather than restating it.

### `Automod` / `AutomodBehavior` narrowed

Both now read their union off the generated channel config instead of restating it:

```ts
// before rc.4
type Automod = 'disabled' | 'simple' | 'AI' | (string & {});
type AutomodBehavior = 'flag' | 'block' | 'shadow_block' | (string & {});

// after
type Automod = ChannelConfigWithInfo['automod']; //          'disabled' | 'simple' | 'AI'
type AutomodBehavior = ChannelConfigWithInfo['automod_behavior']; // 'flag' | 'block' | 'shadow_block'
```

The `| (string & {})` tail meant the unions accepted _any_ string — the documented values were a hint, not a constraint. Assigning an arbitrary string to one of these now fails to compile. `channel.getConfig().automod` reads are unaffected; the generated config has always had the narrow type.

### Aliases that restated a generated type

Each of these was structurally identical to a type the generator already emits — verified by compiling a mutual-assignability assertion, not by inspection. They are removed; the replacement is a pure find/replace with no behaviour change.

| Removed after `rc.4`   | Replacement                                      | Detail                                                                                                                                                             |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ChannelData`          | `ChannelInput`                                   | Was `ReplacePropertyTypes<ChannelInput, { custom: CustomChannelData }>`, but `ChannelInput.custom` is _already_ `CustomChannelData` — the mapped type was a no-op. |
| `PollResponse_old`     | `PollResponseData`                               | Was `PollResponseData & PollEnrichData`; all six `PollEnrichData` fields are already on `PollResponseData`.                                                        |
| `PollEnrichData`       | `PollResponseData`                               | Fully subsumed. Its fields are `answers_count`, `latest_answers`, `latest_votes_by_option`, `vote_count`, `vote_counts_by_option`, `own_votes`.                    |
| `LiveLocationPayload`  | `SharedLocation`                                 | Was `RequireLiteral<SharedLocation, 'end_at'>`; its only consumer immediately did `Omit<…, 'end_at'>`, undoing the requirement.                                    |
| `Pager`                | the request type's own `limit` / `next` / `prev` | Also removes its two aliases — see the row below.                                                                                                                  |
| `ReplacePropertyTypes` | none                                             | Type utility whose only remaining consumer was `ChannelData`. Inline the `Omit<…> & {…}` if you were using it.                                                     |

`ChannelOptions`, `UserOptions`, `QueryPollsOptions` and `QueryVotesOptions` keep their names but are now **derived** from the request types instead of restating them:

```ts
type ChannelOptions = Omit<QueryChannelsRequest, 'filter_conditions' | 'sort'>;
type UserOptions = Omit<QueryUsersPayload, 'filter_conditions' | 'sort'>;
type QueryPollsOptions = Omit<QueryPollsRequest, 'filter' | 'sort'>;
type QueryVotesOptions = Omit<QueryPollVotesRequest, 'filter' | 'sort'>;
```

Two of those change shape:

- **`ChannelOptions` gains `member_custom_include?: Array<string>`** (the endpoint has always accepted it) and **loses `user_id?: string`** (`QueryChannelsRequest` has no such field — it was never sent). Additive for almost everyone; if you were setting `user_id` here it was being dropped silently.
- **`UserOptions` is unchanged field-for-field** — it happened to be an exact copy. It is derived now so it cannot drift.

`ChannelUpdateOptions` and the `*Filters` family are deliberately **kept**: they were already derived (`Omit<UpdateChannelRequest, 'message'>`, `NonNullable<Request['filter']>`), so they update themselves when the spec moves and restate nothing.

### The `APIResponse` envelope

`APIResponse` was `{ duration: string }` — the response envelope from before the generated layer existed. Every generated response already carries `duration`, and the transport wraps results in `StreamResponse<T>`, which carries `metadata` (rate-limit headers, response code, client request id) as well. Anything typed with `APIResponse` was therefore not just redundant but **weaker** than the real return type.

| Removed after `rc.4`       | Replacement                                       | Detail                                                                          |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `SearchAPIResponse`        | `SearchResponse`                                  | `results` entries are `SearchResult`, not an inline `{ message }`.              |
| `SendFileAPIResponse`      | `FileUploadResponse` / `ImageUploadResponse`      | Pick the one matching the endpoint you called.                                  |
| `UpdateChannelAPIResponse` | `UpdateChannelResponse`                           |                                                                                 |
| `UsersAPIResponse`         | `UpdateUsersResponse` / `QueryUsersResponse`      | Two endpoints shared this alias; pick by endpoint.                              |
| `TaskResponse`             | the endpoint's own response type                  | Was `{ task_id: string }`; the generated responses name the field the same way. |
| `ReactionAPIResponse`      | `SendReactionResponse` / `DeleteReactionResponse` | Was one alias for two endpoints.                                                |
| `Flag`, `FlagDetails`      | `FlagDetailsResponse`                             | Neither had a reference anywhere in `src` — they only referred to each other.   |

Every replacement is reached through `StreamResponse<…>` when it is a method return value, so it gains a required `metadata` field. Code that only destructures the payload (`const { message } = await …`) is unaffected; code that annotates a variable with the old alias needs the new name.

**Still present, deliberately:** `APIResponse` itself, plus `FlagMessageResponse`, `FlagUserResponse`, `MuteUserResponse` and `UnmuteUserResponse`. Every remaining reference to these sits inside the hand-written `/moderation/*` methods on `StreamChat` that bypass the generated client; they are removed together with those methods, which is tracked separately.

### `UpdatedMessage` → `MessageRequest`

`UpdatedMessage` built a **request** type by subtracting a hand-maintained constant (`RESERVED_UPDATED_MESSAGE_FIELDS`) from a **response** type (`MessageResponse`), then re-adding the `mentioned_*` fields. The generated `MessageRequest` already is that shape, and gets two things right that `UpdatedMessage` did not:

- **`type` is narrower.** `MessageRequest['type']` is `'regular' | 'system'`. `UpdatedMessage['type']` was `MessageLabel` — six members including `'deleted'`, `'error'`, `'ephemeral'` and `'reply'`, none of which a client may send.
- **Server-owned fields no longer typecheck.** Anything on `MessageResponse` that was not in the reserved list — `cid`, `shadowed`, `reaction_groups`, and so on — was assignable to an update payload. It is not on `MessageRequest`.

```ts
// before
import type { UpdatedMessage } from 'stream-chat';
const payload: UpdatedMessage = { id, text, type: 'reply' }; // compiled, and was wrong

// after
import type { MessageRequest } from 'stream-chat';
const payload: MessageRequest = { id, text }; // `type: 'reply'` is now a compile error
```

`MessageLabel` and `ReservedUpdatedMessageFields` are removed with it. The **runtime** constant `RESERVED_UPDATED_MESSAGE_FIELDS` stays — `toUpdatedMessagePayload()` still uses it to strip server-owned keys off a `LocalMessage`; it just no longer drives a type.

`MessageComposerMiddlewareState.message` is now `MessageRequest` rather than `MessageRequest | UpdatedMessage`. Custom composer middleware that annotated the union should drop the `UpdatedMessage` arm.

### `PartialThreadUpdate` removed

`PartialThreadUpdate` (`{ set?: Partial<Record<string, unknown>>; unset?: Array<string> }`) went with `client.partialUpdateThread`. Use the generated `UpdateThreadPartialRequest`, which is the same `set` / `unset` pair plus the required `message_id`. See [redundant guards and pass-throughs](./v9-to-v10-migration-guide-methods.md#removed-after-1000-rc4--redundant-guards-and-pass-throughs).

## Verification

After applying the renames, `yarn types` should pass. If a call site errors with `Cannot find name 'X'` where X is one of the v9 names in the left column, the rewrite is incomplete.
