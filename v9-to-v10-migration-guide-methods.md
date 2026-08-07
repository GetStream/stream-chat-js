# v9 → v10 Migration Guide — Method Signatures

> Scope: this guide covers **method signature changes** on `StreamChat`, `Channel`, `ChannelState`, `Moderation`, and `StableWSConnection`. Construction changes are in `v9-to-v10-migration-guide-client-construction.md`. Server-side surfaces are gone in v10 — server-side callers should switch to `@stream-io/node-sdk` (https://github.com/GetStream/stream-node) and ignore this guide.
>
> This document is written for AI agents doing mechanical rewrites. Each entry has the exact v9 signature and the exact v10 replacement. Removed methods are labeled **REMOVED** with the recommended replacement (or "no replacement" when the entire feature is dropped).
>
> **Sort arguments:** every `sort` argument shown below has also changed shape — the v9 `{ field_name: direction }` object form is gone, replaced by `SortParamRequest[]` (`[{ field, direction }]`). This guide shows sort values in the new shape but does **not** re-explain the sort migration itself. For the sort shape change, the full field→field/direction rewrite recipe, and the removed `Sort<T>` / `*SortBase` / `normalizeQuerySort` imports, see `v9-to-v10-migration-guide-sort.md` — agents rewriting call sites that pass a `sort` must consult that guide.

## Global renames applied everywhere

Before applying any per-method entry below, apply these repo-wide renames — they are consistent across every class:

| v9                                                                                                                                         | v10                                                                                                                 | Notes                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `userID` (param and field)                                                                                                                 | `userId`                                                                                                            | Field: `client.userID` still readable via a deprecated getter; assignment (`client.userID = …`) no longer compiles.                                                                                                                                                                              |
| `clientID` (param and field)                                                                                                               | `clientId`                                                                                                          | Field: `client.clientID` kept as a deprecated getter+setter.                                                                                                                                                                                                                                     |
| `messageID`, `targetID`, `targetMessageID`, `targetUserID`, `flaggedUserID`, `entityCreatorID`, `wsID`, `channelID`, `channelId` parameter | `messageId`, `targetId`, `targetMessageId`, `targetUserId`, `flaggedUserId`, `entityCreatorId`, `wsId`, `channelId` | Named-parameter rename only; call sites using positional args are unaffected.                                                                                                                                                                                                                    |
| `parent_id` parameter on `keystroke` / `stopTyping`                                                                                        | `parentId`                                                                                                          | Positional; call sites unaffected.                                                                                                                                                                                                                                                               |
| `Event` (type)                                                                                                                             | `Event` (still exported; shape changed)                                                                             | `Event` is now `WSEvent \| LocalEvent \| keyof CustomEventTypes`. The name is unchanged; the wire shape is what's different. Internal handlers that took an untyped `Event` are the same. `EventPayload<'…'>` narrows to a specific event type.                                                  |
| `EventTypes` (type import)                                                                                                                 | `EventType \| string` (via generic)                                                                                 | The public alias renamed to singular `EventType = Event['type'] \| 'all'`. Callers annotating handlers as `EventHandler` are safe; callers importing `EventTypes` need to switch to `EventType`. `CustomEventTypes` module augmentation is unchanged — augment it to add custom event-type keys. |
| `Logger` option / `client.logger()`                                                                                                        | `chatLoggerSystem` from `./logger`                                                                                  | See "Logging" note at the end of the guide.                                                                                                                                                                                                                                                      |

The `secret` parameter, `client.secret`, `client._isUsingServerAuth()`, and all server-only methods are gone. Where a v9 method took a `user_id?` / `userID?` / `currentUserID?` override, that argument has been dropped in v10 (the connected user is always used).

---

## StreamChat

### Removed — no replacement in this SDK (server-side, use `@stream-io/node-sdk`)

The following `StreamChat` methods no longer exist. All were server-side or admin-only. Rewrites should either delete the call site or move it to the server SDK:

`updateAppSettings`, `revokeUserToken`, `revokeUsersToken`, `testPushSettings`, `testSQSSettings`, `testSNSSettings`, `createToken`, `devToken`, user-groups mutations (`createUserGroup` / `getUserGroup` / `searchUserGroups` / `updateUserGroup` / `deleteUserGroup` / `addUserGroupMembers` / `removeUserGroupMembers`) — the read path is renamed, see below, `upsertPushProvider`, `deletePushProvider`, `listPushProviders`, `setPushPreferences`, `_queryFlags`, `_queryFlagReports`, `_reviewFlagReport`, `queryFutureChannelBans`-write paths, `getHookEvents`, `partialUpdateUser`, `deleteUser`, `restoreUsers`, `reactivateUser`, `reactivateUsers`, `deactivateUser`, `deactivateUsers`, `exportUser`, `getSharedLocations`, `translate`, `translateMessage`, `updateFlags`, `queryCampaigns`, `_createImportURL`, `_createImport`, `_getImport`, `_listImports`, `commitMessage`, `queryTeamUsageStats`, `updateLocation`, `updateChannelsBatch`, `deletePredefinedFilter`, `setRetentionPolicy`, `deleteRetentionPolicy`, `getRetentionPolicy`, `getRetentionPolicyRuns`, hand-rolled reminder client methods (`createReminder`/`updateReminder`/`deleteReminder` — see note under `Reminder` handling; the inherited `queryReminders` from `ChatApi` remains but with the generated request shape, not the v9 `QueryRemindersOptions`), `createCommand`/`getCommand`/`updateCommand`/`deleteCommand`/`listCommands`/`createChannelType`/`getChannelType`/`updateChannelType`/`deleteChannelType`/`listChannelTypes`/`exportChannel`/`exportChannels`/`exportUsers`/`getExportChannelStatus`/`getTask`/`enrichURL`/`sendUserCustomEvent`, `deleteChannels`, `deleteUsers`, `createRole`/`listRoles`/`deleteRole` (only `searchRoles` remains, inherited), `getPermission`/`createPermission`/`updatePermission`/`deletePermission`/`listPermissions`, `getBlockList` (only `listBlockLists`/`createBlockList`/`updateBlockList`/`deleteBlockList` remain, inherited), `verifyWebhook`, `verifyAndParseWebhook`, `parseSqs`, `parseSns` (moved — see below), `campaign`, `segment`, `channelBatchUpdater`, `validateServerSideAuth`, `createSegment`, `createUserSegment`, `createChannelSegment`, `getSegment`, `updateSegment`, `addSegmentTargets`, `querySegmentTargets`, `removeSegmentTargets`, `querySegments`, `deleteSegment`, `segmentTargetExists`, `createCampaign`, `getCampaign`, `startCampaign`, `updateCampaign`, `deleteCampaign`, `stopCampaign`, `_normalizeDate`. Note: `queryDrafts`, `queryPolls`, `queryPollVotes`, `queryMessageFlags`, and `markChannelsDelivered` — all of which were hand-rolled in v9 — now come from `ChatApi` inheritance with generated request shapes; they still exist on `client`.

### Renamed / signature-changed

#### `client.queryChannels`

```ts
// v9 — three overloads with positional filter/sort/options
client.queryChannels(filter, sort?, options?, stateOptions?): Promise<Channel[]>;
client.queryChannels(filter, options?, stateOptions?): Promise<Channel[]>;

// v10 — split into two methods
client.queryChannels(request?: QueryChannelsRequest): Promise<QueryChannelsResponse>;      // raw response (inherited from ChatApi)
client.queryChannelsAndHydrate(
  options?: QueryChannelsRequest,
  stateOptions?: ChannelStateOptions,
): Promise<Channel[]>;                                                                     // v9 behavior lives here
client.queryChannelsAndHydrate(
  options,
  stateOptions: ChannelStateOptions & { withResponse: true },
): Promise<QueryChannelsResponseWithChannels>;                                             // returns Channels + raw response
```

Rewrite:

```ts
// v9
const channels = await client.queryChannels(
  { type: 'messaging' },
  { last_message_at: -1 },
  { limit: 20 },
);

// v10
const channels = await client.queryChannelsAndHydrate({
  filter_conditions: { type: 'messaging' },
  sort: [{ field: 'last_message_at', direction: -1 }],
  limit: 20,
});
```

Sort now uses `Gen_SortParamRequest[]` (`{ field, direction }`), not the v9 record form. See `v9-to-v10-migration-guide-sort.md` for the full sort migration.

#### `client.queryReactions`

```ts
// v9
client.queryReactions(messageID, filter, sort?, options?);

// v10 — inherited from ChatApi
client.queryReactions(request: QueryReactionsRequest);                     // raw response
client.queryReactionsAndHydrate(request: QueryReactionsRequest);           // wraps offline-db merge
```

Use `queryReactionsAndHydrate` where v9 code depended on the offline-db reaction reconciliation; otherwise use inherited `queryReactions`.

#### `client.queryUsers`

```ts
// v9
client.queryUsers(filterConditions, sort?, options?);

// v10 — inherited/overridden
client.queryUsers(request?: { payload?: Gen_QueryUsersPayload });
// payload: { filter_conditions, sort, limit, offset, presence, ... }
```

#### `client.search`

```ts
// v9
client.search(filterConditions, query, options?);

// v10
client.search(request?: { payload?: SearchPayload });
// payload combines filter_conditions, message_filter_conditions, query, sort, limit, next, ...
```

#### `client.queryThreads` / `client.getThread`

```ts
// v9
client.queryThreads(options?);                    // returned hydrated Thread[]
client.getThread(messageId, options?);            // returned hydrated Thread

// v10
client.queryThreads(request?);                    // inherited, raw QueryThreadsResponse
client.queryThreadsAndHydrate(options?);          // v9 behavior
client.getThread(request: { message_id });        // inherited, raw
client.getThreadAndHydrate(messageId, options?);  // v9 behavior
```

Callers that want hydrated `Thread` instances (the v9 default) must call the `*AndHydrate` variants.

#### `client.updateMessage` / `client.deleteMessage`

```ts
// v9
client.updateMessage(message, userId?, options?);
client.deleteMessage(messageID, hardDelete?);

// v10 — inherited/overridden from ChatApi
client.updateMessage(request: Parameters<ChatApi['updateMessage']>[0] & { message: { cid?: string } });
// request: { id, message, skip_enrich_url? }
client.deleteMessage(request: { id: string; hard?: boolean; delete_for_me?: boolean });
```

Note: `hardDelete` boolean is now `hard` on the request. `user_id` override is gone.

#### `client.partialUpdateMessage` / `client.ephemeralUpdateMessage` / `client.undeleteMessage`

```ts
// v9
client.partialUpdateMessage(messageID, updates, userId?, options?);
client.ephemeralUpdateMessage(messageID, updates, userId?, options?);
client.undeleteMessage(messageID, userID);

// v10
client.updateMessagePartial(request: UpdateMessagePartialRequest);   // inherited; no user_id override
// ephemeralUpdateMessage: REMOVED — call updateMessagePartial with the ephemeral payload directly.
// undeleteMessage: REMOVED — no client-side replacement (was server-side).
```

#### `client.getMessage`

```ts
// v9
client.getMessage(messageID, options?);

// v10 — inherited
client.getMessage(request: { id: string });
```

Options like `show_deleted_message` are no longer accepted here (server-side only).

#### `client.pinMessage` / `client.unpinMessage`

Unchanged behavior; parameter name normalized:

```ts
// v9
client.pinMessage(messageOrMessageId, timeoutOrExpirationDate?, pinnedAt?);
client.unpinMessage(messageOrMessageId);

// v10 — same signatures; `userId` positional (v9 fourth arg) is removed
client.pinMessage(messageOrMessageId, timeoutOrExpirationDate?, pinnedAt?);
client.unpinMessage(messageOrMessageId);
```

#### `client.markChannelsRead` (and alias `markAllRead`)

```ts
// v9
client.markChannelsRead(data?: MarkChannelsReadOptions);
client.markAllRead(data?);      // alias — REMOVED

// v10 — inherited
client.markChannelsRead(request?: Gen_MarkChannelsReadRequest);
```

#### `client.markChannelsDelivered`

```ts
// v9
client.markChannelsDelivered(data: MarkDeliveredOptions);

// v10
client.markChannelsDelivered(request?: Gen_MarkDeliveredRequest);
// v10 short-circuits when `latest_delivered_messages` is empty; still available.
```

#### `client.upsertUser` / `client.upsertUsers` (+ aliases `updateUser` / `updateUsers`)

```ts
// v9
client.upsertUser(user);
client.upsertUsers([user1, user2]);
client.updateUser(user); // alias — REMOVED
client.updateUsers([user1]); // alias — REMOVED (name reused for the new bulk method)

// v10 — inherited
client.updateUsers({ users: { [user.id]: user } });
// `users` is a Record<string, UserRequest> keyed by user ID, not an array.
```

Mechanical rewrite for a single user:

```ts
// v9
await client.upsertUser({ id: 'u1', name: 'A' });

// v10
await client.updateUsers({ users: { u1: { id: 'u1', name: 'A' } } });
```

#### `client.partialUpdateUsers`

```ts
// v9
client.partialUpdateUsers(users: PartialUserUpdate[]);

// v10 — inherited
client.updateUsersPartial({ users: PartialUserUpdate[] });
```

#### `client.addDevice` / `client.getDevices` / `client.removeDevice`

```ts
// v9
client.addDevice(id, pushProvider, userID?, pushProviderName?);
client.getDevices(userID?);
client.removeDevice(id, userID?);

// v10 — inherited (userID param dropped; server-only)
client.createDevice({ id, push_provider, push_provider_name?, hardware_id? });
client.listDevices();
client.deleteDevice({ id });
```

`userID` is gone from all three — server-side callers using the target-user form must move to `@stream-io/node-sdk`.

#### `client.getUnreadCount` / `client.getUnreadCountBatch`

```ts
// v9
client.getUnreadCount(userID?);            // could query for another user server-side
client.getUnreadCountBatch(userIDs);       // server-side

// v10 — inherited
client.unreadCounts();                     // connected user only
// getUnreadCountBatch: no replacement — was server-side only.
```

#### `client.banUser` / `client.unbanUser` / `client.shadowBan` / `client.removeShadowBan`

```ts
// v9
client.banUser(targetUserID, options?);
client.unbanUser(targetUserID, options?);
client.shadowBan(targetUserID, options?);
client.removeShadowBan(targetUserID, options?);

// v10 — same shape; positional rename only
client.banUser(targetUserId, options?);
client.unbanUser(targetUserId, options?);
client.shadowBan(targetUserId, options?);
client.removeShadowBan(targetUserId, options?);
```

#### `client.blockUser` / `client.unBlockUser` / `client.getBlockedUsers`

```ts
// v9
client.blockUser(blockedUserID, user_id?);           // user_id was server-side override
client.unBlockUser(blockedUserID, userID?);          // note the mixed-case original name
client.getBlockedUsers(user_id?);

// v10
client.blockUser(blockedUserId);                     // takes only the target
client.unblockUser(blockedUserId);                   // renamed to lowercase `b`
client.getBlockedUsers();                            // no user_id override
```

**Rename:** `unBlockUser` → `unblockUser` (lowercase `b`).

#### `client.muteUser` / `client.unmuteUser`

```ts
// v9
client.muteUser(targetID, userID?, options?);        // userID was server-side override
client.unmuteUser(targetID, currentUserID?);

// v10
client.muteUser(targetId, options?);
client.unmuteUser(targetId);
```

#### `client.flagMessage` / `client.flagUser` / `client.unflagMessage` / `client.unflagUser` / `client.unblockMessage`

```ts
// v9
client.flagMessage(targetMessageID, options?: { reason?; user_id? });
client.flagUser(targetID, options?: { reason?; user_id? });
client.unflagMessage(targetMessageID, options?: { user_id? });
client.unflagUser(targetID, options?: { user_id? });
client.unblockMessage(targetMessageID, options?: { user_id? });

// v10
client.flagMessage(targetMessageId, options?: { reason? });
client.flagUser(targetId, options?: { reason? });
client.unflagMessage(targetMessageId);
client.unflagUser(targetId);
client.unblockMessage(targetMessageId);
```

`user_id` overrides dropped everywhere.

#### `client.userMuteStatus`

```ts
// v9
client.userMuteStatus(targetID);

// v10
client.userMuteStatus(targetId);
```

#### `client.getChannelById` / `client.channel(...)` overload

```ts
// v9
client.channel(channelType, channelID?, custom?);
client.channel(channelType, custom?);
client.getChannelById(channelType, channelID, custom);

// v10 — same overload shape; positional param renamed
client.channel(channelType, channelId?, custom?);
client.channel(channelType, custom?);
client.getChannelById(channelType, channelId, custom);
```

#### `client.setAnonymousUser` alias

```ts
// v9
client.setAnonymousUser = this.connectAnonymousUser; // REMOVED

// v10
await client.connectAnonymousUser();
```

#### `client.doAxiosRequest` / `client.dispatchEvent` / `client.errorFromResponse` / `client.sendFile`

```ts
// v9 — direct methods on the client
client.doAxiosRequest(type, url, data?, options?);
client.dispatchEvent(event);
client.errorFromResponse(response);
client.sendFile(url, uri, name?, contentType?, user?, axiosRequestConfig?);

// v10
client.api.doAxiosRequest(type, url, data?, options?);
client.dispatchEvent(event: Event);                     // Event union expanded to WSEvent | LocalEvent | keyof CustomEventTypes
client.api.errorFromResponse(response);                 // moved to ApiClient
client.api.sendFile(url, uri, name?, contentType?, user?, axiosRequestConfig?);
```

`client.api` is a new getter returning the internal `ApiClient` instance.

#### `client.uploadFile` / `client.uploadImage`

```ts
// v9
client.uploadFile(uri, name?, contentType?, user?, axiosRequestConfig?);
client.uploadImage(uri, name?, contentType?, user?, axiosRequestConfig?);

// v10 — TWO shapes now exist, pick the right one:
client.uploadFile(request: { file? });                  // inherited from ChatApi — generated payload
client.uploadImage(request: { file? });                 // inherited from ChatApi

client.uploadFile_(uri, name?, contentType?, user?, axiosRequestConfig?);   // v9 positional args preserved under trailing-underscore name
client.uploadImage_(uri, name?, contentType?, user?, axiosRequestConfig?);
```

`uploadFile_` and `uploadImage_` are the direct replacements for v9 code that passed positional args (uri + name + contentType + user + axios config). Ports should prefer these unless the caller wants to switch to the request-object shape.

#### `client.deleteFile` / `client.deleteImage`

```ts
// v9
client.deleteFile(url);
client.deleteImage(url);

// v10 — inherited
client.deleteFile(request?: { url? });
client.deleteImage(request?: { url? });
```

#### `client.revokeTokens`

```ts
// v9
client.revokeTokens(before: Date | string | null);

// v10
client.revokeTokens(before?: Date | null);       // string form dropped
```

#### `client.getAppSettings`

Still present but the return type changed (`Gen_GetApplicationResponse` wrapped as `StreamResponse<...>`); no signature change.

#### `client.partialUpdateThread`

Unchanged signature: `partialUpdateThread(messageId, partialThreadObject)`.

#### `client.hydrateActiveChannels`

Unchanged.

#### `client.setLocalDevice` / `client.setBaseURL` / `client.setUserAgent` / `client.getUserAgent`

Unchanged. `setUserAgent` is still marked `@deprecated` — prefer setting `sdkIdentifier`.

#### `client.setOfflineDBApi` / `client.setMessageComposerSetupFunction`

Unchanged (composer setup function is new in v10 but not a rename).

#### `client.createChannelManager`

Removed. The client instantiates the **new** `ChannelManager` (see [ChannelManager](#channelmanager)
below) in its constructor and exposes it as `client.channelManager`; register the channel lists on it
instead of building a manager of your own:

```diff
- const manager = client.createChannelManager({
-   eventHandlerOverrides: { newMessageHandler: (setChannels, event) => { /* … */ } },
-   options: { lockChannelOrder: true },
-   queryChannelsOverride: (options, stateOptions) => client.queryChannelsAndHydrate(options, stateOptions),
- });
- await manager.queryChannels({ filter_conditions: { members: { $in: [userId] } }, sort, limit: 20 });
+ const paginator = new ChannelPaginator({
+   client,
+   filters: { members: { $in: [userId] } },
+   sort,
+   paginatorOptions: { pageSize: 20, lockItemOrder: true },
+ });
+ client.channelManager.insertPaginator({ paginator });
+ client.channelManager.registerSubscriptions();
+ await paginator.toTail();
```

The manager is not configurable through the client options; everything is set on
`client.channelManager` itself — `insertPaginator` / `removePaginator` for the lists,
`setOwnershipResolver` for cross-list ownership, and `addEventHandler` / `setEventHandlers` /
`removeEventHandlers` for the pipelines. `ChannelManagerOptions.eventHandlers` still exists for a
manager you construct yourself; the client-owned one starts from
`ChannelManager.getDefaultHandlers()` and is customized through those methods.

#### `client._enrichAxiosOptions` / `client._logApiRequest` / `client._logApiError` / `client._normalizeDate` / `client._setupConnection`

Removed. Callers should not rely on these internals; `_setupConnection` was an alias for `openConnection`.

#### `client.recoverState` / `client.connect` / `client._sayHi` / `client._buildWSPayload`

Signatures unchanged.

#### `client.queryUserGroups`

```ts
// v9 — hand-rolled GET on `/usergroups`
client.queryUserGroups(options?: QueryUserGroupsOptions): Promise<QueryUserGroupsResponse>;
// QueryUserGroupsResponse = APIResponse & { user_groups: UserGroupResponse[] }

// v10 — inherited from ChatApi (same underlying endpoint)
client.listUserGroups(request?: ListUserGroupsOptions): Promise<StreamResponse<ListUserGroupsResponse>>;
```

Mechanical rewrite:

```ts
// v9
const { user_groups } = await client.queryUserGroups({ team_id: 'engineering' });

// v10
const { user_groups } = await client.listUserGroups({ team_id: 'engineering' });
```

`UserGroupPaginator` still exists and now calls `listUserGroups` internally — consumers using the paginator do not need to change anything. Direct callers of `queryUserGroups` must rename to `listUserGroups`. The request shape is identical (`{ limit?, id_gt?, created_at_gt?, team_id? }`); the response gains a `metadata: RequestMetadata` field via the `StreamResponse<...>` wrapper. See the type-renames guide for the `QueryUserGroupsOptions` / `QueryUserGroupsResponse` type entries.

#### `client.sync`

```ts
// v9
client.sync(channel_cids: string[], last_sync_at: string, options?: SyncOptions);

// v10 — inherited (payload object)
client.sync(request: { channel_cids, last_sync_at, ... });
```

#### `client.createBlockList` / `client.listBlockLists` / `client.updateBlockList` / `client.deleteBlockList`

```ts
// v9
client.createBlockList(blockList: BlockList);
client.listBlockLists(data?: { team? });
client.getBlockList(name, data?: { team? });                 // REMOVED
client.updateBlockList(name, data: { words; team? });
client.deleteBlockList(name, data?: { team? });

// v10 — inherited (request objects)
client.createBlockList(request);
client.listBlockLists(request?);
// getBlockList: no replacement.
client.updateBlockList(request);
client.deleteBlockList(request);
```

#### Webhook / SNS / SQS helpers

Moved off the client to module-level exports (`src/signing.ts`):

```ts
// v9
client.verifyWebhook(requestBody, xSignature);
client.verifyAndParseWebhook(rawBody, signature);
client.parseSqs(messageBody);
client.parseSns(notificationBody);

// v10 — module exports; return WSEvent
import { verifySignature, verifyAndParseWebhook, parseSqs, parseSns } from 'stream-chat';

verifySignature(body, signature, secret);
verifyAndParseWebhook(rawBody, signature, secret);
parseSqs(messageBody); // SQS deliveries carry no application-level HMAC — decode-only
parseSns(notificationBody); // SNS deliveries carry no application-level HMAC — decode-only
```

The v9 `verifyWebhook` / `verifyAndParseWebhook` reused `client.secret` implicitly; the v10 module-level replacements require the secret to be passed in. `parseSqs` / `parseSns` do not take a `secret` — Stream never attaches an application-level HMAC to SQS/SNS deliveries; use `verifyAndParseWebhook` for HTTP webhooks when you need signature verification.

---

## Channel

### Constructor and lifecycle

`getClient()`, `getConfig()`, `clean()`, `_channelURL()`, `_checkInitialized()`, `_initializeState(...)`, `_disconnect()`, and `create(options?)` are unchanged.

### Removed with a rename → note

- `channel._update(payload)` — REMOVED. Use `channel.update(request)` (inherited from `ChannelApi`).
- `channel.updateMemberPartial(updates, options?: { userId? })` — REMOVED (v9 wrapper). Use the inherited `channel.updateMemberPartial(request?)` — same name, generated shape.
- `channel.partialUpdateMember(user_id, updates)` — REMOVED. Use `channel.updateMemberPartial({ user_id, ...updates })`.
- `channel.sendEvent(event)` — replaced by `channel.sendEvent(request: { event })` (override).

### Signature-changed methods

#### `channel.sendMessage`

```ts
// v9
channel.sendMessage(message: Message, options?: SendMessageOptions);

// v10
channel.sendMessage(request: Gen_SendMessageRequest);
// { message, skip_enrich_url?, skip_push?, keep_channel_hidden?, ... }
```

Mechanical rewrite:

```ts
// v9
await channel.sendMessage({ text: 'hi' }, { skip_push: true });

// v10
await channel.sendMessage({ message: { text: 'hi' }, skip_push: true });
```

#### `channel.sendEvent`

```ts
// v9
channel.sendEvent(event: Event);

// v10
channel.sendEvent(request: { event: Event });
// Event now unions the generated WSEvent, the SDK-only LocalEvent, and keyof CustomEventTypes.
```

#### `channel.search`

```ts
// v9
channel.search(query: MessageFilters | string, options?);

// v10
channel.search(request?: { payload?: SearchPayload });
```

#### `channel.queryMembers`

```ts
// v9
channel.queryMembers(filterConditions, sort?, options?);

// v10
channel.queryMembers(request?: { payload?: Partial<QueryMembersPayload> });
// payload accepts filter_conditions, sort ([{field, direction}]), limit, offset
```

For rewriting the `sort` value, see `v9-to-v10-migration-guide-sort.md`.

#### `channel.sendReaction` / `channel._sendReaction` / `channel.deleteReaction` / `channel._deleteReaction`

```ts
// v9
channel.sendReaction(messageID, reaction: Reaction, options?);
channel.deleteReaction(messageID, reactionType, user_id?);

// v10
channel.sendReaction(request: Parameters<ChatApi['sendReaction']>[0]);
// { id: messageId, reaction, enforce_unique?, skip_push? }
channel.deleteReaction(request: Parameters<ChatApi['deleteReaction']>[0]);
// { id: messageId, type: reactionType }
```

`user_id` overrides dropped. `_sendReaction` and `_deleteReaction` take the same shape as their public counterparts.

#### `channel.getReactions`

```ts
// v9
channel.getReactions(message_id, options: { limit?; offset? });

// v10
channel.getReactions(request: Parameters<ChatApi['getReactions']>[0]);
// { id: messageId, limit?, offset? }
```

#### `channel.getReplies`

```ts
// v9
channel.getReplies(parent_id, options?, sort?);

// v10
channel.getReplies(request: GetRepliesRequest);
// { parent_id, id_gt?, id_lt?, id_gte?, id_lte?, limit?, offset?, sort?, ... }
```

`sort` inside the request uses `Gen_SortParamRequest[]` (`{ field, direction }`). See `v9-to-v10-migration-guide-sort.md`.

#### `channel.update`

```ts
// v9
channel.update(channelData?, updateMessage?, options?);

// v10 (override)
channel.update(request?: Gen_UpdateChannelRequest);
// { data?, message?, skip_push?, hide_history?, ... }
```

Mechanical rewrite:

```ts
// v9
await channel.update({ name: 'X' }, { text: 'renamed' });

// v10
await channel.update({ data: { name: 'X' }, message: { text: 'renamed' } });
```

#### `channel.updatePartial`

Same signature: `updatePartial(update: PartialUpdateChannel)`. Internally now calls `updateChannelPartial` (inherited).

#### `channel.delete` / `channel.truncate`

```ts
// v9
channel.delete(options?: { hard_delete? });
channel.truncate(options?: TruncateOptions);

// v10 — inherited from ChannelApi
channel.delete(request?: { hard_delete? });
channel.truncate(request?: TruncateChannelRequest);
// TruncateChannelRequest: { message?, skip_push?, hard_delete?, truncated_at?, user_id? }
```

#### `channel.acceptInvite` / `channel.rejectInvite`

```ts
// v9
channel.acceptInvite(options?: UpdateChannelOptions);
channel.rejectInvite(options?: UpdateChannelOptions);

// v10 — options type renamed
channel.acceptInvite(options?: ChannelUpdateOptions);
channel.rejectInvite(options?: ChannelUpdateOptions);
```

`ChannelUpdateOptions` = `Omit<Gen_UpdateChannelRequest, 'message' | 'members'>`.

#### `channel.mute` / `channel.unmute`

```ts
// v9
channel.mute(opts?: { expiration?; user_id? });
channel.unmute(opts?: { user_id? });

// v10
channel.mute(options?: Gen_MuteChannelRequest);      // { channel_cids?, expiration?, user? }
channel.unmute(options?: Gen_UnmuteChannelRequest);  // { channel_cids?, user? }
```

#### `channel.archive` / `channel.unarchive` / `channel.pin` / `channel.unpin`

```ts
// v9
channel.archive(opts?: { user_id? });
channel.unarchive(opts?: { user_id? });
channel.pin(opts?: { user_id? });
channel.unpin(opts?: { user_id? });

// v10 — arguments removed; always acts on the connected user
channel.archive();
channel.unarchive();
channel.pin();
channel.unpin();
```

These now delegate to `channel.updateMemberPartial({ set: { archived: true } })` (etc.) internally.

#### `channel.muteStatus` / `channel.sendAction` / `channel.keystroke` / `channel.stopTyping`

```ts
// v9
channel.muteStatus(): { muted: boolean; createdAt: Date | null; expiresAt: Date | null };
channel.sendAction(messageID, formData);
channel.keystroke(parent_id?, options?: { user_id });
channel.stopTyping(parent_id?, options?: { user_id });

// v10 — same shape; positional rename to `messageId` / `parentId`
channel.muteStatus();                               // same return shape
channel.sendAction(messageId, formData);
channel.keystroke(parentId?, options?);
channel.stopTyping(parentId?, options?);
```

#### `channel.markRead` / `channel.markAsReadRequest`

**Semantic swap** — read carefully:

```ts
// v9
channel.markRead(data?: MarkReadOptions);              // batched through MessageDeliveryReporter
channel.markAsReadRequest(data?: MarkReadOptions);     // direct API call

// v10
channel.markRead(data?: MarkReadRequest);              // direct API call (override, requires _checkInitialized + read_events)
channel.markReadViaReporter(data?: MarkReadRequest);   // batched through MessageDeliveryReporter — v9 markRead behavior
```

`MarkReadOptions` (v9) → `MarkReadRequest` (v10 generated type). See the type-renames guide.

Migration rule: if you want to preserve the v9 batching behavior, rename `markRead` → `markReadViaReporter`. If your v9 code was calling `markAsReadRequest`, rename it to `markRead`.

#### `channel.markUnread`

```ts
// v9
channel.markUnread(data: MarkUnreadOptions);

// v10 — inherited/override; data is optional
channel.markUnread(data?: MarkUnreadRequest);
```

#### `channel.stopWatching`

```ts
// v9
channel.stopWatching();

// v10 — override
channel.stopWatching(request?: Gen_ChannelStopWatchingRequest);
```

#### `channel.hide` / `channel.show`

```ts
// v9
channel.hide(userId: string | null = null, clearHistory = false);
channel.show(userId: string | null = null);

// v10 — override; positional args replaced with a request payload
channel.hide(request?: Gen_HideChannelRequest);    // { clear_history?, user_id?, ... }
channel.show(request?: Gen_ShowChannelRequest);    // { user_id?, ... }
```

Mechanical rewrite:

```ts
// v9
await channel.hide(null, true);
// v10
await channel.hide({ clear_history: true });
```

#### `channel.banUser` / `channel.unbanUser` / `channel.shadowBan` / `channel.removeShadowBan`

Same signatures, positional rename only:

```ts
channel.banUser(targetUserId, options);
channel.unbanUser(targetUserId, options?);
channel.shadowBan(targetUserId, options);
channel.removeShadowBan(targetUserId);
```

#### `channel.vote` / `channel.removeVote`

```ts
// v9
channel.vote(messageId, pollId, vote: PollVoteData);
channel.removeVote(messageId, pollId, voteId);

// v10
channel.vote(request: Parameters<ChatApi['castPollVote']>[0]);
// { message_id, poll_id, vote: { option_id?, answer_text? } }
channel.removeVote(request: Parameters<ChatApi['deletePollVote']>[0]);
// { message_id, poll_id, vote_id }
```

#### `channel.createDraft` / `channel._createDraft` / `channel.deleteDraft` / `channel._deleteDraft` / `channel.getDraft`

```ts
// v9
channel.createDraft(message: DraftMessagePayload);
channel.deleteDraft(options?: { parent_id? });
channel.getDraft(options?: { parent_id? });

// v10 — inherited/override with generated shape
channel.createDraft(request: Gen_CreateDraftRequest);   // { message: DraftPayload }
channel.deleteDraft(request?: { parent_id? });
channel.getDraft(request?: { parent_id? });             // inherited unchanged
channel._createDraft(request);                          // same shape
channel._deleteDraft(request?);                         // same shape
```

Mechanical rewrite for `createDraft`:

```ts
// v9
await channel.createDraft({ text: 'draft' });

// v10
await channel.createDraft({ message: { text: 'draft' } });
```

#### `channel.on` / `channel.off`

```ts
// v9 — signatures
channel.on(eventType: EventTypes, callback: EventHandler): { unsubscribe: () => void };
channel.on(callback: EventHandler): { unsubscribe: () => void };
channel.off(eventType: EventTypes, callback: EventHandler): void;
channel.off(callback: EventHandler): void;

// v10
channel.on<T extends EventType | string>(eventType: T, callback: EventHandler<T>): { unsubscribe: () => void };
channel.on(callback: EventHandler): { unsubscribe: () => void };
channel.off<T extends EventType | string>(eventType: T, callback: EventHandler): void;
channel.off(callback: EventHandler): void;
```

Callers that imported `EventTypes` need to switch to `EventType` (`EventType = Event['type'] | 'all'`). The `CustomEventTypes` interface is still exported — augment it to add custom event-type keys, same as v9.

#### `channel.sendFile` / `channel.sendImage` / `channel.deleteFile` / `channel.deleteImage` / `channel.getPinnedMessages` / `channel.getMessagesById` / `channel.lastRead` / `channel.countUnread` / `channel.countUnreadMentions` / `channel.lastMessage` / `channel.watch` / `channel.query`

Signatures unchanged.

#### `channel._handleChannelEvent` / `channel._callChannelListeners`

Both still take `Event` — the union shape of `Event` itself changed (now `WSEvent | LocalEvent | keyof CustomEventTypes`), but the parameter type name did not.

---

## ChannelState

Mostly unchanged. The relevant tweaks:

- `formatMessage`: v9 accepted `MessageResponse | MessageResponseBase | LocalMessage`. v10 accepts only `MessageResponse | LocalMessage` (`MessageResponseBase` no longer exists).
- `deleteUserMessages(...)` internally: `deletedAt` propagation now passes `undefined` where v9 defaulted to `null` — check for `null` guards in downstream code.
- `removeReaction(reaction, message?)` return shape unchanged.
- All other methods (`addMessageSorted`, `addMessagesSorted`, `addPinnedMessages`, `addPinnedMessage`, `removePinnedMessage`, `addReaction`, `_addReactionToState`, `_addOwnReactionToMessage`, `_removeOwnReactionFromMessage`, `_removeReactionFromState`, `_updateQuotedMessageReferences`, `removeQuotedMessageReferences`, `_updateMessage`, `setIsUpToDate`, `_addToMessageList`, `removeMessage`, `removeMessageFromArray`, `updateUserMessages`, `filterErrorMessages`, `clean`, `clearMessages`, `initMessages`, `loadMessageIntoState`, `findMessage`, `findMessageByTimestamp`, `pruneOldest`) — signatures unchanged.

---

## ChannelManager

`ChannelManager` was **rewritten**, not renamed: v10's class (`src/ChannelManager.ts`) is the former
`ChannelPaginatorsOrchestrator`, and the v9 `src/channel_manager.ts` is deleted. One manager now holds N
channel lists — each a `ChannelPaginator` — instead of one hand-sorted array.

The manager is no longer created by the integrator: the client builds it in its constructor and owns it
for its whole lifetime as `client.channelManager`. Lists are registered on it with
`insertPaginator({ paginator, index? })` and detached again with `removePaginator(paginatorOrId)` — a
removed paginator leaves `manager.state.paginators` (so UIs rendering one list per paginator drop its
list), stops receiving WS updates and gets its ownership-filtering wrapper removed, while keeping the
items it had loaded. For batches use `setPaginators(paginators)` / `clearPaginators()`, the primitives
those two build on: one state update for the whole set instead of one per paginator (and none at all
when the set is unchanged). The manager still only handles events once something calls the ref-counted
`registerSubscriptions()`.

Because the manager now outlives any UI, `client.disconnectUser()` clears the lists' contents through
`resetPaginatorStates()` — every registered paginator goes back to "never queried", since its channels
belong to the user being disconnected — but the registrations survive, so the next connection reuses
the lists the integrator configured. A UI that renders a list should therefore query whenever its
paginator reports no loaded page, not only on mount.

### State

| v9 (`manager.state`)       | v10                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `channels: Channel[]`      | `paginator.state.items`                                                                                                  |
| `pagination.hasNext`       | `paginator.state.hasMoreTail` (`hasNext` getter still exists, deprecated)                                                |
| `pagination.isLoading`     | `paginator.state.isLoading`                                                                                              |
| `pagination.isLoadingNext` | removed — one `isLoading` flag; combine with `hasMoreTail` if needed                                                     |
| `pagination.options`       | the paginator's `filters` / `sort` / `options` / `pageSize`                                                              |
| `initialized`              | removed — `paginator.state.items === undefined` means "never queried"; `paginator.isInitialized` for an imperative check |
| `error`                    | `paginator.state.lastQueryError`                                                                                         |
| —                          | `manager.state.paginators` (the lists this manager drives)                                                               |

### Methods

| v9                                           | v10                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `manager.queryChannels(request, stateOpts?)` | `paginator.toTail({ reset: 'yes' })` (or `paginator.reload()`)         |
| `manager.loadNext()`                         | `paginator.toTail()` / `paginator.toTailDebounced()`                   |
| `manager.setChannels(valueOrFactory)`        | `paginator.setItems({ valueOrFactory })`                               |
| `manager.setQueryChannelsRequest(fn)`        | `paginatorOptions.doRequest`                                           |
| `manager.setOptions(...)`                    | per-paginator options (see below)                                      |
| `manager.setEventHandlerOverrides(...)`      | `manager.setEventHandlers` / `addEventHandler` / `removeEventHandlers` |
| `manager.registerSubscriptions()`            | unchanged, but now returns an unsubscribe and is ref-counted           |

### Options

| v9 option                                | v10                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lockChannelOrder`                       | `paginatorOptions.lockItemOrder`                                                                                                                                                                                                                                                                                                                                                  |
| `abortInFlightQuery`                     | removed — a query is never started while one is in flight; `paginator.cancelScheduledQuery()` cancels a debounced one                                                                                                                                                                                                                                                             |
| `allowNotLoadedChannelPromotionForEvent` | removed — insert the exported `ignoreEventsForUnknownChannels` handler at the head of the pipeline (`index: 0`) for the event types you want to ignore: <br>`manager.addEventHandler({ eventType: 'message.new', handle: ignoreEventsForUnknownChannels, id: 'ignore-unknown', index: 0 })` <br>It stops the chain for any event whose channel is not in `client.activeChannels`. |

### Event handlers

The 10 named overrides (`newMessageHandler`, `channelDeletedHandler`, …), each receiving
`(setChannels, event)`, are replaced by an `EventHandlerPipeline` per event type. Handlers receive
`{ event, ctx: { channelManager } }` and can stop the chain by returning `{ action: 'stop' }`:

```diff
- const manager = client.createChannelManager({
-   eventHandlerOverrides: {
-     newMessageHandler: (setChannels, event) => setChannels((channels) => reorder(channels, event)),
-   },
- });
+ manager.setEventHandlers({
+   eventType: 'message.new',
+   handlers: [{ handle: ({ event, ctx: { channelManager } }) => { /* … */ }, id: 'my-handler' }],
+ });
```

Default-handler ids are `ChannelManager:default-handler:<event.type>` — pass them to `removeEventHandlers`
or to `position` when inserting. Unlike v9, `channel.updated` and `channel.truncated` are **not** no-ops by
default (they re-emit the affected lists), `channel.hidden` re-evaluates the filters instead of removing
the channel outright (so a list filtering `{ hidden: true }` keeps it), and
`notification.channel_mutes_updated` re-routes every loaded channel so `muted` filters settle on their own.

### Types

Three separate situations — the first is the dangerous one, because that code still compiles.

**1. Same name, different shape.** These keep their v9 names but now describe the new class:

| Type                    | v9                                                                                                               | v10                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ChannelManagerState`   | `{ channels: Channel[]; initialized: boolean; pagination: ChannelManagerPagination; error: Error \| undefined }` | `{ paginators: ChannelPaginator[] }` — the list state moved to `paginator.state` (see the table above)                     |
| `ChannelManagerOptions` | `{ abortInFlightQuery?; allowNotLoadedChannelPromotionForEvent?; lockChannelOrder? }`                            | `{ client: StreamChat; paginators?: ChannelPaginator[]; eventHandlers?: ChannelManagerEventHandlers; ownershipResolver? }` |

**2. Replaced by a differently-named type.** The mechanism changed, so this is a rewrite rather than a
find-and-replace:

| v9                                                                          | v10                                                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ChannelManagerEventHandlerOverrides` (handler-name → override fn)          | `ChannelManagerEventHandlers` (event type → ordered `LabeledEventHandler[]` pipeline)                            |
| `EventHandlerType` / `EventHandlerOverrideType` / `GenericEventHandlerType` | `EventHandlerPipelineHandler<ChannelManagerEventHandlerContext>` — receives `{ event, ctx: { channelManager } }` |
| `ChannelSetterParameterType` / `ChannelSetterType`                          | `SetPaginatorItemsParams<Channel>['valueOrFactory']` (passed to `paginator.setItems`)                            |
| `QueryChannelsRequestType` / `QueryChannelsRequestOutput`                   | `PaginatorOptions<Channel, ChannelQueryShape>['doRequest']`                                                      |

**3. Removed with no replacement:** `ChannelManagerPagination`, `ChannelManagerEventTypes`,
`ChannelManagerEventHandlerNames`, `ExecuteChannelsQueryPayload`, `channelManagerEventToHandlerMapping`,
`DEFAULT_CHANNEL_MANAGER_OPTIONS`, `DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS`.

### Coming from a v10 release candidate?

`10.0.0-rc.1` and earlier shipped this class as **`ChannelPaginatorsOrchestrator`**. If you are upgrading
from an RC rather than from v9, the change is a pure rename:

| RC                                                    | v10 final                           |
| ----------------------------------------------------- | ----------------------------------- |
| `ChannelPaginatorsOrchestrator`                       | `ChannelManager`                    |
| `ChannelPaginatorsOrchestratorState`                  | `ChannelManagerState`               |
| `ChannelPaginatorsOrchestratorOptions`                | `ChannelManagerOptions`             |
| `ChannelPaginatorsOrchestratorEventHandlers`          | `ChannelManagerEventHandlers`       |
| `ChannelPaginatorsOrchestratorEventHandlerContext`    | `ChannelManagerEventHandlerContext` |
| handler ctx key `{ orchestrator }`                    | `{ channelManager }`                |
| ids `ChannelPaginatorsOrchestrator:default-handler:*` | `ChannelManager:default-handler:*`  |
| module `stream-chat` (unchanged)                      | `stream-chat` (unchanged)           |

Nothing else in the RC API changed, and no deprecated alias is exported — the old names are gone.

### Removed helpers (were exported from `stream-chat`)

`promoteChannel`, `findLastPinnedChannelIndex`, `findPinnedAtSortOrder`, `shouldConsiderPinnedChannels`,
`shouldConsiderArchivedChannels`, `extractSortValue`, `isChannelPinned`, `isChannelArchived`,
`getAndWatchChannel` and the `PromoteChannelParams` type existed only to serve the v9 manager's
hand-written ordering. Replacements:

| Removed                                                                                                                     | Use instead                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `promoteChannel`, `findLastPinnedChannelIndex`, `findPinnedAtSortOrder`, `shouldConsiderPinnedChannels`, `extractSortValue` | nothing — stop reordering the list yourself; see [If you called `promoteChannel`](#if-you-called-promotechannel)                                         |
| `isChannelPinned`, `isChannelArchived`, `shouldConsiderArchivedChannels`                                                    | `paginator.matchesFilter(channel)` with `{ pinned: true }` / `{ archived: true }` filters                                                                |
| `getAndWatchChannel`                                                                                                        | `client.channel(type, id).watch()`. The SDK's own helper (`getChannel`, which additionally coalesces concurrent watches of the same cid) stays internal. |

#### If you called `promoteChannel`

In v9 the list was a plain array you reordered by hand: `promoteChannel` moved a channel to the top, and
the pinned-channel helpers existed to stop it from jumping above the pinned block. In v10 **you do not
reorder the list at all** — position is derived from `sort` by a comparator the paginator compiles, and
every `ingestItem` re-inserts the channel where that comparator says it belongs.

So the replacement is a sort, declared once:

```ts
const paginator = new ChannelPaginator({
  client,
  filters: { members: { $in: [userId] } },
  // pinned channels form a contiguous block at the top, most recently pinned first;
  // everything else follows, most recent activity first
  sort: [
    { field: 'pinned_at', direction: -1 },
    { field: 'last_message_at', direction: -1 },
  ],
});
```

Why that puts pins on top: an unpinned channel has no `pinned_at`, and the comparator sorts
missing values to the tail **regardless of direction** — so a leading `pinned_at` splits the list into
"pinned, then the rest", and each group is ordered by the next sort term. Note this only holds while
`pinned_at` is the _first_ term; with anything ahead of it, that term dominates and the pins are no longer a
block.

Three consequences for code that used to call `promoteChannel` on a WS event:

- **New message in a loaded channel** — nothing to do. `channel.messagePaginator.lastMessageAt` advances
  when the message is ingested, so the next `ingestItem` (which the manager's default handlers perform)
  places the channel correctly.
- **Surfacing a channel that is not in the list** — a search result, a freshly created DM — use
  `manager.ingestChannel(channel)`. It routes the channel into every list whose filter it matches (honoring
  the ownership resolver) and removes it from those it no longer matches.
- **Surfacing a channel whose sort key did not change** — use `paginator.boost(channel.cid, { ttlMs })`.
  A boost outranks the sort for that one item until it expires. It is deliberately not pin-aware: if a list
  should keep its pins on top, do not boost, and let the sort decide.

### Paginator method rename

`buildFilters()` is gone from the whole paginator stack, because it meant "request filters" on
`ChannelPaginator` and "matching filters" on the base/message paginators:

- **`ChannelPaginator.buildQueryFilters()`** — filters sent to the server (and used as the offline-db cache
  key).
- **`buildMatchFilters()`** (on `BasePaginator`, `ChannelPaginator`, `MessageIntervalPaginator`,
  `PinnedMessagePaginator`) — filters items are matched against locally, consumed by `matchesFilter()`.

`ChannelQueryShape` is now the `queryChannels` request itself (`filter_conditions`, `sort`, `limit`, …)
plus `stateOptions`, rather than a `{ filters, sort, options }` wrapper — relevant if you implement
`paginatorOptions.doRequest`.

---

## Moderation

`Moderation` now `extends ModerationApi`. All complex admin methods were removed; the kept methods have positional-param renames only.

### Removed — no replacement in this SDK

- `moderation.muteUser(targetID, options?: ModerationMuteOptions)` — REMOVED (previously used `POST /api/v2/moderation/mute` directly). Use the inherited `moderation.mute(request: MuteRequest)` from `ModerationApi` (accepts `{ target_ids, timeout?, ... }`).
- `moderation.getUserModerationReport` — REMOVED.
- `moderation.queryReviewQueue` — the class-level implementation is gone but `queryReviewQueue` is inherited from `ModerationApi` (request-object shape).
- `moderation.upsertConfig` / `getConfig` / `deleteConfig` / `queryConfigs` — the class-level implementations are gone; `upsertConfig` / `getConfig` / `deleteConfig` / `queryModerationConfigs` (note the last is renamed) are inherited from `ModerationApi`.
- `moderation.submitAction` — inherited from `ModerationApi`.
- `moderation.check` / `moderation.checkUserProfile` — REMOVED.
- `moderation.addCustomFlags` / `moderation.addCustomMessageFlags` — REMOVED.
- `moderation.upsertModerationRule` / `queryModerationRules` / `getModerationRule` / `deleteModerationRule` — REMOVED.

### Signature-changed

#### `moderation.flagUser` / `moderation.flagMessage`

```ts
// v9
moderation.flagUser(flaggedUserID, reason, options?);
moderation.flagMessage(messageID, reason, options?);

// v10 — positional rename only; body still built internally
moderation.flagUser(flaggedUserId, reason, options?);
moderation.flagMessage(messageId, reason, options?);
```

#### `moderation.flag`

```ts
// v9
moderation.flag(entityType, entityId, entityCreatorID, reason, options?);   // custom method

// v10 — inherited
moderation.flag(request: FlagRequest);
// { entity_type, entity_id, entity_creator_id, reason, ...options }
```

#### `moderation.unmuteUser`

```ts
// v9
moderation.unmuteUser(targetID, options: { user_id? });

// v10 — user_id override dropped (server-side only)
moderation.unmuteUser(targetId);
```

---

## StableWSConnection

Parameter renames only (`wsID` → `wsId`) and the internal `_log(msg, extra, level)` method has been removed. Everything else (`connect`, `disconnect`, `_connect`, `_reconnect`, `_waitForHealthy`, `_buildUrl`, `onopen` / `onmessage` / `onclose` / `onerror`, `onlineStatusChanged`, `_setHealth`, `_errorFromWSEvent`, `_destroyCurrentWSConnection`, `_setupConnectionPromise`, `scheduleNextPing`, `scheduleConnectionCheck`) keeps the v9 signature.

```ts
// v9
_log(msg, extra?, level?);   // REMOVED

// v10 — use the module-scoped logger instead
import { chatLoggerSystem } from './logger';
const logger = chatLoggerSystem.getLogger('connection');
logger.info(msg, extra);
```

---

## Property renames on `StreamChat` (referenced by other classes)

| v9                               | v10                                                   | Availability                                                                                                 |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `client.userID`                  | `client.userId`                                       | Getter `userID` deprecated. Assignment (`client.userID = …`) no longer supported.                            |
| `client.clientID`                | `client.clientId`                                     | Getter+setter `clientID` deprecated.                                                                         |
| `client.secret`                  | —                                                     | REMOVED.                                                                                                     |
| `client.logger`                  | —                                                     | REMOVED — see logging note below.                                                                            |
| `client.appSettingsPromise` type | `Promise<StreamResponse<Gen_GetApplicationResponse>>` | Wrapper type changed.                                                                                        |
| `client._user` type              | `ClientUser`                                          | Type alias replacing v9's `OwnUserResponse \| UserResponse`.                                                 |
| `client.api`                     | new                                                   | Public getter that returns the internal `ApiClient` for `doAxiosRequest` / `sendFile` / `errorFromResponse`. |

`_setToken`, `_setUser`, `_setupConnection` are still present but `_setUser` now takes `TokenManagerMinimalUser`; `_setupConnection` is REMOVED.

---

## Logging (applies to every class)

`options.logger` (function) and `client.logger(level, msg, extra?)` are gone. To capture logs in v10, configure the shared `chatLoggerSystem` before constructing the client:

```ts
import { chatLoggerSystem, type Sink } from 'stream-chat';

const sink: Sink = (level, message, ...rest) => {
  /* forward to your logger; message is prefixed with `[<scope>](<tags>): ` */
};

chatLoggerSystem.configureLoggers({
  default: { level: 'info', sink },
});
```

Class-internal call sites use scoped loggers such as `chatLoggerSystem.getLogger('client')`, `'channel'`, `'connection'`, `'api-client'`, `'thread'`, `'thread-manager'`, `'upload-manager'`, `'offline-db'`, `'state-store'`, `'token-manager'`, `'message-composer'`, `'text-composer'`, `'utils'`, `'channel-manager'`, `'connection-fallback'`. See `v9-to-v10-migration-guide-logging.md` for the full logging system reference.
