# stream-chat v9 → v10: AI migration guide

Execution guide for a coding agent migrating an app from `stream-chat` v9 to v10. It covers every app that calls `stream-chat` directly: custom UIs, Angular / Vue / Svelte / vanilla apps, Node scripts and bots that connect as a user, and the direct `stream-chat` calls inside `stream-chat-react` and `stream-chat-react-native` apps (their guides send LLC errors here). Server-side code (API secret, token signing, webhooks, admin endpoints) no longer belongs on `stream-chat`: it moves to `@stream-io/node-sdk` ([§1.4](#s1-4-server-side-code)).

Verified against `release-v10` @ `fdfcb296` (`stream-chat@0.0.0-development` in `package.json`; last release cut from it: `10.0.0-rc.30`), 2026-11-03.

The exhaustive reference is [`v10-breaking-changes.md`](https://github.com/GetStream/stream-chat-js/blob/release-v10/ai-docs/v10-breaking-changes.md). This guide covers the common path inline and links to the reference entry (by anchor) for everything else.

<a id="rules"></a>

## Rules for the agent

1. **The installed package is the source of truth.** Read `node_modules/stream-chat/dist/types/index.d.ts` (and the `.d.ts` files next to it: `client.d.ts`, `channel.d.ts`, `channel_state.d.ts`, `ChannelManager.d.ts`, `thread.d.ts`, `pagination/paginators/*.d.ts`, `gen/models/index.d.ts` for every generated request / response type). The TypeScript source ships too, under `node_modules/stream-chat/src/`. Do not write a `stream-chat` v10 symbol from memory: v9 is heavily represented in training data and v10 is not.
2. **Verify before writing.** Before you use a method, type, option key or event name on the "after" side, grep the installed `.d.ts` for it and read its current signature.
3. **Stop on a missing symbol.** If a symbol this guide names is not in the installed package, stop and report it (installed version, symbol, section). Do not invent a fallback, a cast or a shim.
4. **Smallest edit.** Fix what a section says is broken and nothing else. Code that still type-checks and behaves the same stays as it is. The snippets show one valid form, not a shape to rewrite working code into.
5. **Detect before editing.** Run [Detection](#detection) first; skip every section with zero hits and record it as skipped.
6. **A green build is not done.** Several v10 changes compile and still break at runtime, and plain JavaScript gets no compile errors at all. Walk [Breaks that compile](#breaks-that-compile) and run the leftover-identifier grep in [Verification](#verification).
7. **Do not hand-edit generated files or lockfiles.** Change dependencies with the app's package manager only.
8. **Keep app behaviour.** Change behaviour only where a section says the SDK default changed and the app relied on the old one (for example logging, link previews, list ordering); then restore the old behaviour with the documented option, or list it as an open decision for the human.
9. **Server-side code is not ported onto `stream-chat`.** Anything that uses the API secret, signs tokens, verifies webhooks or calls admin endpoints moves to `@stream-io/node-sdk` ([§1.4](#s1-4-server-side-code)). If that is out of scope for the task, leave it on v9 and report it; never reintroduce a secret into client code.
10. **Paths in this guide are root-agnostic.** Search the whole repository, excluding `node_modules` and build output; never assume `src/`.

<a id="companion-documents"></a>

## Companion documents

Fetch only when a section sends you there.

| Document                                     | Raw URL                                                                                                    | When to fetch                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stream-chat` v10 breaking-changes reference | https://raw.githubusercontent.com/GetStream/stream-chat-js/release-v10/ai-docs/v10-breaking-changes.md     | A section links to a reference anchor; a compile error on a `stream-chat` symbol this guide does not name (search the reference, especially its full type rename table, anchor `type-rename-table`). Long (3.7k lines): search it, do not read it whole. |
| `stream-chat-react` v14 → v15 guide          | https://raw.githubusercontent.com/GetStream/stream-chat-react/master/ai-docs/ai-migration-v14-v15.md       | The app also uses `stream-chat-react` components. Upgrade both packages together.                                                                                                                                                                        |
| `stream-chat-react-native` v9 → v10 guide    | https://raw.githubusercontent.com/GetStream/stream-chat-react-native/V10/ai-docs/ai-migration-v9-to-v10.md | The app also uses `stream-chat-react-native` / `stream-chat-expo`. Upgrade both together.                                                                                                                                                                |

Reference links in this guide have the form `https://github.com/GetStream/stream-chat-js/blob/release-v10/ai-docs/v10-breaking-changes.md#<anchor>`. Where a table gives only an anchor name, that is the anchor in this URL.

<a id="workflow"></a>

## Workflow

**Phase 0: preflight.** Record, before changing anything:

- the current `stream-chat` version from `package.json` and the lockfile, and any `stream-chat-react` / `stream-chat-react-native` / `stream-chat-expo` / `stream-chat-angular` versions;
- the package manager (lockfile name) and its version; Yarn 1 (classic) refuses to install v10 on Node below 22.18 ([§1.1](#s1-1-node-and-package-manager));
- the Node version used to install, build and run (`node -v`, `.nvmrc`, `engines`, CI images, Dockerfiles);
- TypeScript or JavaScript (and the `tsconfig` `skipLibCheck`, `types`, `lib` values);
- a clean git tree (`git status`), so the migration diff is reviewable;
- the baseline result of the app's own typecheck, lint and test scripts (from `package.json#scripts`). Pre-existing failures are not yours to fix; note them.

**Phase 1: install and platform.** Apply [§1](#s1-install-runtime-and-packaging): Node floor, package install, `ws` on Node, `@stream-io/state-store` dependency, server-side code routing.

**Phase 2: detect.** Run [Detection](#detection). List the section ids with hits; every other section is skipped.

**Phase 3: apply compile-breaking sections in guide order** ([§2](#s2-client-construction-and-configuration) to [§14](#s14-types-renamed-removed-or-changed-meaning)). Use the [Quick reference](#quick-reference) for one-line renames. For a `stream-chat` error this guide does not cover, look the symbol up in the reference (rename table first).

**Phase 4: walk [Breaks that compile](#breaks-that-compile).** Run each Detect pattern; fix or record each hit.

**Phase 5: verify.** [Verification](#verification): typecheck, lint, tests, leftover-identifier grep, runtime smoke checks.

**Phase 6: report** with the template below.

<a id="definition-of-done"></a>

### Definition of done

- `stream-chat` resolves to v10 in the lockfile, once (`npm ls stream-chat` / `yarn why stream-chat` / `pnpm why stream-chat`), and so does `@stream-io/state-store` if the app imports it.
- The app's typecheck, lint and tests are no worse than the Phase 0 baseline.
- Every section with Detection hits is applied or listed as an open decision; every [Breaks that compile](#breaks-that-compile) row was checked.
- The leftover-identifier grep in [Verification](#verification) returns no hits outside comments, changelogs and this migration's notes.
- No API secret, `createToken` or webhook verification remains in code that imports `stream-chat`.

<a id="report-template"></a>

### Report template

```md
## stream-chat v9 → v10 migration report

- Versions: stream-chat <old> → <new>; UI SDKs <old> → <new>; Node <version>; package manager <name/version>
- Changed files by section: §<id> <section name>: <files> (one line per section)
- Skipped sections (no hits): §<ids>
- Server-side code found: <files> → moved to @stream-io/node-sdk | left on v9 (reason)
- Breaks that compile: <row>: fixed in <file> | not applicable | needs decision
- Open decisions for the human: <item, options, recommendation>
- Verification: typecheck <pass/fail vs baseline>, lint <...>, tests <...>, leftover grep <0 hits | list>
- Runtime checks still to do: <items from the smoke checklist not run>
```

<a id="detection"></a>

## Detection

Run from the repository root. Each comment names the section the hits belong to. Patterns key on v9 names.

```bash
RG=(rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/build/**' -g '*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,vue,svelte}')

# §1.1 Node / package manager floor (also inspect .nvmrc, Dockerfiles, CI)
rg -n '"node"\s*:|node-version|FROM node:' --glob '!**/node_modules/**' .
# §1.2 Node WebSocket: code that connects a user from Node
"${RG[@]}" "from ['\"]ws['\"]|require\(['\"]ws['\"]\)|isomorphic-ws|allowServerSideConnect" .
# §1.3 StateStore and friends imported from stream-chat
"${RG[@]}" "\b(StateStore|MergedStateStore|isPatch|Unsubscribe|ValueOrPatch|Preprocessor|RemovePreprocessor)\b" . | rg 'stream-chat'
# §1.4 Server-side code (secret, token signing, webhooks, admin methods)
"${RG[@]}" "STREAM_(API_)?SECRET|apiSecret|\bsecret\b|createToken\(|JWTUserToken|JWTServerToken|verifyWebhook|verifyAndParseWebhook|verifySignature|CheckSignature|parseSqs|parseSns|_isUsingServerAuth|\.(upsertUsers?|deleteUsers?|deactivateUsers?|reactivateUsers?|restoreUsers|exportUsers?|updateAppSettings|createChannelType|updateChannelType|deleteChannelType|listChannelTypes|getChannelType|createCommand|updateCommand|deleteCommand|listCommands|createRole|deleteRole|listRoles|createPermission|updatePermission|deletePermission|listPermissions|getPermission|revokeUserTokens?|revokeUsersToken|exportChannels?|getExportChannelStatus|getTask|updateChannelsBatch|channelBatchUpdater|upsertPushProvider|deletePushProvider|listPushProviders|testPushSettings|getRateLimits|sendUserCustomEvent|getUnreadCountBatch|undeleteMessage|commitMessage|queryMessageHistory|createCampaign|createSegment|createPredefinedFilter|setRetentionPolicy)\(" .
# §2 Client construction and options
"${RG[@]}" "new StreamChat\(|StreamChat\.getInstance\(|StreamChatOptions|recoverStateOnReconnect|enableWSFallback|wsUrlParams|isLocalUnreadCountEnabled|enableInsights|warmUp|disableCache|persistUserOnConnectionFailure|\.options\.|defaultWSTimeout|consecutiveFailures|setMessageComposerSetupFunction|\.userID\b|\.clientID\b" .
# §3 Logging
"${RG[@]}" "\blogger\s*:|client\.logger|\bLogger\b.*stream-chat|noopLogger|LogLevel" .
# §4 Custom data (top-level custom fields; channel name / image)
"${RG[@]}" "data\??\.(name|image)\b|sendMessage\(\s*\{\s*text|partialUpdateUsers?\(|upsertUsers?\(|declare module ['\"]stream-chat['\"]|Custom(Message|User|Channel|Member|Attachment|Reaction|Poll|PollOption|Thread|Event|Command)Data|mime_type|file_size|waveform_data" .
# §5 Timestamps (string / Date handling of server dates)
"${RG[@]}" "new Date\([^)]*\.(created_at|updated_at|deleted_at|last_message_at|last_read|last_active|pinned_at|remind_at|expires_at|last_updated)|dayjs\([^)]*_at\b|moment\([^)]*_at\b|Date\.parse\(|\.toISOString\(\)|received_at" .
# §6 Sort and filters
"${RG[@]}" "\b(ChannelSort|UserSort|MemberSort|ReactionSort|SearchMessageSort|ThreadSort|PollSort|VoteSort|DraftSort|PinnedMessagesSort|BannedUsersSort|ReminderSort|SortParam|AscDesc|QueryFilters|ChannelFilters|UserFilters|MemberFilters|MessageFilters)\b|\{\s*(last_message_at|created_at|updated_at|pinned_at|last_updated|name)\s*:\s*-?1\s*[,}]" .
# §7 Events
"${RG[@]}" "connection\.changed|transport\.changed|EVENT_MAP|EventTypes\b|ConnectionChangeEvent|\(\s*\w+\s*:\s*Event\s*\)|EventHandler\b|\.on\(['\"]\*['\"]|channel\.(muted|unmuted)|sendEvent\(|ConnectionOpen|ConnectAPIResponse|AI_STATE_CHECKING_SOURCES" .
# §8 Errors
"${RG[@]}" "ErrorFromResponse|APIErrorResponse|StatusCode|client_request_id|errorFromResponse|handleResponse|StreamChat error" .
# §9 StreamChat methods (renamed / new signatures / raw)
"${RG[@]}" "\.(queryChannels|queryChannelsRequest|queryUsers|search|queryThreads|getThread|queryReactions|updateMessage|deleteMessage|uploadFile|uploadImage|sendFile|pinMessage|unpinMessage|revokeTokens|queryUserGroups|addDevice|getDevices|removeDevice|setLocalDevice|getUnreadCount|setPushPreferences|partialUpdateUsers?|upsertUsers?|updateUser|unBlockUser|blockUser|getSharedLocations|updateLocation|markAllRead|markChannelsRead|partialUpdateMessage|ephemeralUpdateMessage|partialUpdateThread|enrichURL|hydrateActiveChannels|setAnonymousUser|translateMessage|getMessage|sync|deleteChannels|queryDrafts|getAppSettings|setGuestUser|banUser|shadowBan|removeShadowBan|muteUser|unmuteUser|flagMessage|flagUser|unflagMessage|unflagUser|queryBannedUsers|queryMessageFlags|createPoll|updatePoll|partialUpdatePoll|closePoll|getPoll|deletePoll|createPollOption|updatePollOption|castPollVote|addPollAnswer|removePollVote|queryPolls|queryPollVotes|queryPollAnswers|createReminder|updateReminder|deleteReminder|queryReminders|get|post|put|patch|delete|doAxiosRequest|createAbortControllerForNextRequest)\(" . | rg -v 'client\.config\.|channelManager\.|messagePaginator\.'
# §10 Channel methods
"${RG[@]}" "\.(watch|query|create|sendMessage|sendReaction|deleteReaction|markRead|markAsReadRequest|markUnread|getConfig|sendFile|sendImage|deleteFile|deleteImage|lastMessage|search|getReplies|getReactions|getPinnedMessages|keystroke|stopTyping|createDraft|vote|removeVote|update|_update|updatePartial|addMembers|removeMembers|inviteMembers|addModerators|demoteModerators|assignRoles|updateMemberPartial|partialUpdateMember|archive|unarchive|pin|unpin|mute|unmute|muteStatus|hide|show|banUser|unbanUser|queryMembers|sendAction|sendSharedLocation|stopLiveLocationSharing|_disconnect|activate)\(|\.disconnected\b|\.listeners\[|getChannelById|getChannelByMembers|new Channel\(" .
# §11 Channel state and message list
"${RG[@]}" "state\.(messages|latestMessages|messageSets|messagePagination|pinnedMessages|threads|last_message_at|unreadCount\s*=|read\[[^]]+\]\s*=|members\[[^]]+\]\s*=|watchers\[[^]]+\]\s*=)|addMessageSorted|addMessagesSorted|removeMessage\(|findMessage\(|loadMessageIntoState|setIsUpToDate|isUpToDate|filterErrorMessages|clearMessages|initMessages" .
# §12 Channel lists, activeChannels, ChannelManager
"${RG[@]}" "activeChannels|client\.configs\b|createChannelManager|new ChannelManager\(|ChannelManagerOptions|eventHandlerOverrides|setChannels\(|loadNext\(|setQueryChannelsRequest|lockChannelOrder|promoteChannel|ChannelBatchUpdater|recoverState|connection\.recovered" .
# §13 Threads
"${RG[@]}" "new Thread\(|threadsById|\.deactivate\(|loadNextPage|loadPrevPage|queryReplies|state\.replies|ThreadRepliesPagination|ThreadManagerPagination|markAsRead\(|preventThreadCleanup" .
# §14 Types: renamed / removed / same name, new meaning (imports from stream-chat)
"${RG[@]}" -U "import[^;'\"]*\b(Role|User|Reaction|PollResponse|PollOptionResponse|MuteResponse|SharedLocationResponse|ThreadResponse|TypingStartEvent|UpdateChannelResponse|PendingMessageResponse|ChannelConfig|VotingVisibility|Command|Event|ConnectionOpen)\b[^;'\"]*from ['\"]stream-chat['\"]" .
# §15 Composer, uploads, polls, reminders, other managers
"${RG[@]}" "messageComposer|uploadAttachment\(|createSendWithPendingUploadsAttachmentsMiddleware|legacy_thread|applyCommandValidatorOverride|linkPreviews|doUploadRequest|updateFields\(|VotingVisibility\.|client\.reminders|client\.polls|LiveLocationManager|CooldownTimer|MessageDeliveryReporter|throttledMarkRead|SearchController|SearchSource|BasePaginator|setOfflineDBApi|AbstractOfflineDB|NotificationManager|encodeBase64|decodeBase64|Campaign|Segment|permissions" .
```

<a id="quick-reference"></a>

## Quick reference

Old → new, Ctrl-F friendly. "§" is the section in this guide; "Ref" is the anchor in the reference.

| v9                                                                                                 | v10                                                                                                                                              | §                                                               | Ref                               |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------- |
| `new StreamChat(key, secret, opts)` / `getInstance(key, secret, opts)`                             | `new StreamChat(key, config?)` / `StreamChat.getInstance(key, config?)`; no secret slot                                                          | [§2](#s2-client-construction-and-configuration)                 | streamchat-constructor            |
| flat `StreamChatOptions` (`timeout`, `enableWSFallback`, ...)                                      | `config.client.*` (`axiosRequestConfig`, `wsConnection`, `connectionRecovery`, ...)                                                              | [§2](#s2-client-construction-and-configuration)                 | streamchat-options                |
| `StreamChatOptions` type                                                                           | `InstanceConfigTree` (`DeepPartial<InstanceConfigTree>` for the constructor)                                                                     | [§2](#s2-client-construction-and-configuration)                 | streamchat-options                |
| `client.options.x`                                                                                 | `client.config.getConfig('client')?.x`                                                                                                           | [§2](#s2-client-construction-and-configuration)                 | option-mirror-properties          |
| `client.userID` / `client.clientID`                                                                | `client.userId` / `client.clientId` (old names deprecated)                                                                                       | [§2](#s2-client-construction-and-configuration)                 | client-getters                    |
| `setMessageComposerSetupFunction(fn)`                                                              | `client.config.setSetupFunction('messageComposer', fn)`                                                                                          | [§2](#s2-client-construction-and-configuration)                 | message-composer-setup-function   |
| `options.logger` / `client.logger`                                                                 | `chatLoggerSystem.configureLoggers(...)`                                                                                                         | [§3](#s3-logging)                                               | logging                           |
| `message.priority` (custom field)                                                                  | `message.custom.priority`                                                                                                                        | [§4](#s4-custom-data)                                           | custom-data                       |
| `channel.data.name` / `channel.data.image`                                                         | `channel.data?.custom?.name` / `channel.data?.custom?.image`                                                                                     | [§4](#s4-custom-data)                                           | custom-data                       |
| `attachment.mime_type` / `file_size` / `duration` / `waveform_data`                                | `attachment.custom.mime_type` / `.file_size` / `.duration` / `.waveform_data`                                                                    | [§4](#s4-custom-data)                                           | attachment-metadata-custom        |
| ISO string / `Date` timestamps                                                                     | `TimestampNS` (unix ns number); `nsToDate`, `dateToNs`, `nowNs`, `msToNs`, `nsToMs`                                                              | [§5](#s5-timestamps)                                            | timestamp-ns                      |
| `{ last_message_at: -1 }`                                                                          | `[{ field: 'last_message_at', direction: -1 }]` (`SortParamRequest[]`)                                                                           | [§6](#s6-sort-and-filters)                                      | sort-shape                        |
| `ChannelSort`, `UserSort`, ... (29 sort aliases)                                                   | `SortParamRequest[]`                                                                                                                             | [§6](#s6-sort-and-filters)                                      | sort-shape                        |
| filter `{ color: 'green' }` (custom field)                                                         | `{ 'custom.color': 'green' }`                                                                                                                    | [§6](#s6-sort-and-filters)                                      | filter-types                      |
| `EventTypes` / `EVENT_MAP`                                                                         | `EventType` (type only); no runtime list                                                                                                         | [§7](#s7-events)                                                | event-type-names                  |
| `(e: Event) => e.message?.text`                                                                    | `client.on('message.new', (e) => e.message.text)` or `EventPayload<'message.new'>`                                                               | [§7](#s7-events)                                                | event-union                       |
| `client.on('connection.changed', fn)`                                                              | `client.wsConnection.state.subscribeWithSelector(...)`                                                                                           | [§7](#s7-events)                                                | connection-changed-removed        |
| `transport.changed`                                                                                | `connection.fallback_activated`                                                                                                                  | [§7](#s7-events)                                                | connection-changed-removed        |
| `channel.on('capabilities.changed', fn)`                                                           | `channel.state.subscribeWithSelector(({ ownCapabilities }) => ({ ownCapabilities }), fn)`                                                        | [§7](#s7-events)                                                | capabilities-changed-removed      |
| `channel.muted` / `channel.unmuted` events                                                         | `notification.channel_mutes_updated`                                                                                                             | [§7](#s7-events)                                                | event-type-names                  |
| custom event `e.text`                                                                              | `e.custom.text`; declare names in `CustomEventTypes`                                                                                             | [§7](#s7-events)                                                | custom-events                     |
| `channel.sendEvent({ type, text })`                                                                | `channel.sendEvent({ event: { type, custom: { text } } })`                                                                                       | [§7](#s7-events)                                                | channel-send-event                |
| `ErrorFromResponse` / `APIErrorResponse`                                                           | `StreamAPIError` / `APIError`                                                                                                                    | [§8](#s8-errors)                                                | stream-api-error                  |
| `err.response.data.StatusCode`                                                                     | `err.response?.data.status_code`                                                                                                                 | [§8](#s8-errors)                                                | stream-api-error                  |
| `client.queryChannels(f, s, o)` → `Channel[]`                                                      | `client.queryChannelsAndHydrate({ filter_conditions, sort, ...o })` → `Channel[]`                                                                | [§9.2](#s9-2-querychannels)                                     | query-channels-raw                |
| `client.queryUsers(f, s, o)`                                                                       | `client.queryUsers({ payload: { filter_conditions, sort, ...o } })`                                                                              | [§9.1](#s9-1-request-object-signatures)                         | generated-client-signatures       |
| `client.search(f, q, o)`                                                                           | `client.search({ payload: { filter_conditions, query, ... } })`                                                                                  | [§9.1](#s9-1-request-object-signatures)                         | generated-client-signatures       |
| `client.queryThreads(o)` / `getThread(id)` → `Thread`                                              | `client.queryThreadsAndHydrate(o)` / `getThreadAndHydrate({ message_id })`                                                                       | [§9.3](#s9-3-raw-calls-and-andhydrate)                          | threads-reactions-hydrate         |
| `client.queryReactions(id, f, s, o)`                                                               | `client.queryReactionsAndHydrate({ id }, request)` (raw: `queryReactions`)                                                                       | [§9.3](#s9-3-raw-calls-and-andhydrate)                          | threads-reactions-hydrate         |
| `client.updateMessage(msg)` / `deleteMessage(id, hard)`                                            | `client.updateMessage({ id }, { message })` / `deleteMessage({ id }, { hard })` (raw); stateful: `channel.messageOperations`                     | [§9.3](#s9-3-raw-calls-and-andhydrate)                          | update-delete-message-raw         |
| `client.partialUpdateUser(s)`                                                                      | `client.updateUsersPartial({ users: [{ id, set, unset }] })`                                                                                     | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.upsertUser(s)` / `updateUser`                                                              | `client.updateUsers({ users: { [id]: user } })`                                                                                                  | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.addDevice(id, provider)` / `getDevices()` / `removeDevice(id)`                             | `createDevice({ id, push_provider })` / `listDevices()` / `deleteDevice({ id })`                                                                 | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.setLocalDevice(d)` / `device` option                                                       | `client.createDevice(...)` after connecting                                                                                                      | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.getUnreadCount()`                                                                          | `client.unreadCounts()`                                                                                                                          | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.setPushPreferences(p)`                                                                     | `client.updatePushNotificationPreferences({ preferences: p })` (no `call_level`)                                                                 | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.markAllRead()`                                                                             | `client.markChannelsRead()`                                                                                                                      | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.partialUpdateMessage(id, { set })`                                                         | `client.updateMessagePartial({ id }, { set, unset })`                                                                                            | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.partialUpdateThread(id, p)`                                                                | `client.updateThreadPartial({ message_id }, p)`                                                                                                  | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.unBlockUser(id)`                                                                           | `client.unblockUser(id)`                                                                                                                         | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.queryUserGroups(o)`                                                                        | `client.listUserGroups(o)`                                                                                                                       | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.getSharedLocations()` / `updateLocation(p)`                                                | `client.getUserLiveLocations()` / `updateLiveLocation(p)`                                                                                        | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.enrichURL(url)`                                                                            | `client.getOG({ url })`                                                                                                                          | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.hydrateActiveChannels(...)`                                                                | `client.hydrateChannels(...)`                                                                                                                    | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.setAnonymousUser()`                                                                        | `client.connectAnonymousUser()`                                                                                                                  | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.ephemeralUpdateMessage(...)`                                                               | `client.updateMessagePartial(...)`                                                                                                               | [§9.4](#s9-4-renamed-streamchat-methods)                        | renamed-client-methods            |
| `client.uploadFile(uri, name, type)` / `sendFile`                                                  | `client.uploadFile({ file }, requestOptions?)`; `file`: `File` / `Blob` / `{ uri, name, type }`                                                  | [§9.5](#s9-5-uploads)                                           | client-uploads                    |
| `client.deleteFile(url)` / `deleteImage(url)`                                                      | `client.deleteFile({ url })` / `deleteImage({ url })`                                                                                            | [§9.5](#s9-5-uploads)                                           | client-uploads                    |
| `client.pinMessage(m, 120)`                                                                        | `client.pinMessage(m, { pin_expires: new Date(Date.now() + 120_000) })`                                                                          | [§9.1](#s9-1-request-object-signatures)                         | pin-unpin-message                 |
| `client.banUser` / `shadowBan` / `muteUser` / `unmuteUser` / `flagMessage` / `flagUser`            | `client.moderation.ban` / `ban({ shadow: true })` / `mute` / `unmuteUser` / `flagMessage` / `flagUser`                                           | [§9.1](#s9-1-request-object-signatures)                         | client-moderation-methods         |
| poll methods (`partialUpdatePoll`, `closePoll`, `addPollAnswer`, `removePollVote`, positional ids) | `updatePollPartial({ poll_id }, ...)`, `castPollVote({ message_id, poll_id }, { vote })`, `deletePollVote({ message_id, poll_id, vote_id })`     | [§15](#s15-composer-uploads-polls-reminders-and-other-managers) | poll-client-methods               |
| `client.reminders.createReminder({ messageId, remind_at })`                                        | `client.reminders.createReminder({ message_id }, { remind_at: Date })`                                                                           | [§15](#s15-composer-uploads-polls-reminders-and-other-managers) | reminder-methods                  |
| `client.get/post/put/patch/delete(url)`                                                            | `client.api.get/post/...`                                                                                                                        | [§9.1](#s9-1-request-object-signatures)                         | raw-http-helpers                  |
| `client.createAbortControllerForNextRequest()`                                                     | `requestOptions.signal` on every method                                                                                                          | [§9.1](#s9-1-request-object-signatures)                         | raw-http-helpers                  |
| `client.recoverState()`                                                                            | `client.connectionRecovery.recover()`                                                                                                            | [§10.2](#s10-2-activate-for-reconnect-recovery)                 | connection-recovery               |
| `client.wsConnection` (null before connect) / `client.wsFallback`                                  | `client.wsConnection` (never null; `isHealthy`, `state`)                                                                                         | [§7](#s7-events)                                                | ws-connection                     |
| `client.activeChannels[cid]` / `Object.values(client.activeChannels)`                              | `client.channelManager.get(cid)` / `client.channelManager.values()`                                                                              | [§12](#s12-channel-lists-activechannels-and-channelmanager)     | active-channels                   |
| `client.configs[cid]` / `channel.getConfig()`                                                      | `channel.serverConfig`                                                                                                                           | [§10.6](#s10-6-getconfig-and-channelconfig)                     | channel-config                    |
| `client.getChannelById(type, id, data)`                                                            | `client.channel(type, id, data)`                                                                                                                 | [§12](#s12-channel-lists-activechannels-and-channelmanager)     | client-channel                    |
| `client.createChannelManager(...)` / `new ChannelManager(...)`                                     | `client.channelManager` + `new ChannelPaginator(...)` per list                                                                                   | [§12](#s12-channel-lists-activechannels-and-channelmanager)     | channel-manager                   |
| `manager.queryChannels(...)` / `loadNext()` / `setChannels(v)`                                     | `paginator.toTail({ reset: 'yes' })` / `paginator.toTail()` / `paginator.setItems({ valueOrFactory: v })`                                        | [§12](#s12-channel-lists-activechannels-and-channelmanager)     | channel-manager-list-methods      |
| `manager.state.channels` / `pagination.hasNext` / `error`                                          | `paginator.state` `items` / `hasMoreTail` / `lastQueryError`                                                                                     | [§12](#s12-channel-lists-activechannels-and-channelmanager)     | channel-manager                   |
| `eventHandlerOverrides`                                                                            | `client.channelManager.setEventHandlers(...)` / `addEventHandler(...)`                                                                           | [§12](#s12-channel-lists-activechannels-and-channelmanager)     | channel-manager-event-handlers    |
| `lockChannelOrder`                                                                                 | per-paginator `lockItemOrder`                                                                                                                    | [§12](#s12-channel-lists-activechannels-and-channelmanager)     | channel-manager-options           |
| `promoteChannel(...)`                                                                              | sort-derived position; `paginator.boost(cid, { ttlMs })`                                                                                         | [§12](#s12-channel-lists-activechannels-and-channelmanager)     | promote-channel                   |
| `channel.watch()` resolves the response                                                            | `channel.watch()` resolves the `Channel`; raw response via `channel.query()`                                                                     | [§10.1](#s10-1-watch-and-the-connection-id)                     | channel-watch-returns-channel     |
| `channel.query(options, 'latest')`                                                                 | `channel.query(options?, requestOptions?)` (adds no messages)                                                                                    | [§10.1](#s10-1-watch-and-the-connection-id)                     | channel-query                     |
| `channel.sendMessage(msg, opts)`                                                                   | `channel.sendMessage({ message: msg, ...opts })` (HTTP only); stateful: `channel.messageOperations.send(...)` / `channel.messageComposer.send()` | [§10.3](#s10-3-sending-messages-and-reactions)                  | channel-send-message              |
| `channel.sendReaction(id, r)` / `deleteReaction(id, type)`                                         | `channel.sendReaction({ id }, { reaction: r })` / `deleteReaction({ id, type })`; optimistic: `messageOperations.addReaction` / `deleteReaction` | [§10.3](#s10-3-sending-messages-and-reactions)                  | channel-send-reaction             |
| `channel.markRead()` (reporter path)                                                               | `channel.markReadViaReporter()`                                                                                                                  | [§10.4](#s10-4-markread)                                        | channel-mark-read                 |
| `channel.markAsReadRequest()`                                                                      | `channel.markRead()`                                                                                                                             | [§10.4](#s10-4-markread)                                        | channel-mark-read                 |
| `channel.sendFile` / `sendImage(file, name, type)`                                                 | `channel.uploadFile({ file })` / `uploadImage({ file })`                                                                                         | [§9.5](#s9-5-uploads)                                           | channel-uploads                   |
| `channel.deleteFile(url)` / `deleteImage(url)`                                                     | `channel.deleteFile({ url })` / `deleteImage({ url })`                                                                                           | [§9.5](#s9-5-uploads)                                           | channel-uploads                   |
| `channel.lastMessage()`                                                                            | `channel.messagePaginator.latestMessage ?? undefined` (getter)                                                                                   | [§11](#s11-channel-state-and-the-message-list)                  | channel-last-message              |
| `channel.search(q)`                                                                                | `client.search({ payload: { filter_conditions: { cid: channel.cid }, query: q } })`                                                              | [§10.5](#s10-5-other-channel-methods)                           | channel-search-removed            |
| `channel.getReplies(id, o)` / `getReactions(id, o)`                                                | `client.getReplies({ parent_id }, o)` / `client.getReactions({ id }, o)` (raw); threads: `client.threads.ensure(...)`                            | [§10.5](#s10-5-other-channel-methods)                           | channel-replies-reactions-removed |
| `channel.update(data, msg)`                                                                        | `channel.update({ data: { custom }, message })` (full update) or `channel.updatePartial({ set })`                                                | [§10.5](#s10-5-other-channel-methods)                           | channel-update                    |
| `channel.addMembers(ids, msg, opts)`                                                               | `channel.addMembers({ members: ids, message, ...opts })` (same for `removeMembers`, `inviteMembers`, `addFilterTags({ tags })`)                  | [§10.5](#s10-5-other-channel-methods)                           | channel-membership-helpers        |
| `channel.addModerators` / `demoteModerators` / `assignRoles`                                       | removed (server-side); at insert: `addMembers({ members: [{ user_id, channel_role }] })`                                                         | [§10.5](#s10-5-other-channel-methods)                           | channel-membership-helpers        |
| `channel.partialUpdateMember(id, p)`                                                               | `channel.updateMemberPartial(p)` (own membership only)                                                                                           | [§10.5](#s10-5-other-channel-methods)                           | channel-update-member-partial     |
| `channel.hide(null, true)`                                                                         | `channel.hide({ clear_history: true })`                                                                                                          | [§10.5](#s10-5-other-channel-methods)                           | channel-hide-show                 |
| `channel.shadowBan(id, o)` / `removeShadowBan(id)`                                                 | `channel.banUser(id, { ...o, shadow: true })` / `unbanUser(id, { shadow: true })`                                                                | [§10.5](#s10-5-other-channel-methods)                           | channel-ban                       |
| `channel.queryMembers(f, s, o)`                                                                    | `channel.queryMembers({ payload: { filter_conditions: f, sort, ...o } })`                                                                        | [§10.5](#s10-5-other-channel-methods)                           | channel-query-members             |
| `channel.getPinnedMessages(o, sort)`                                                               | `channel.getPinnedMessages({ ...o, sort: [...] })`                                                                                               | [§10.5](#s10-5-other-channel-methods)                           | channel-pinned-messages-by-id     |
| `channel.createDraft({ text })`                                                                    | `channel.createDraft({ message: { text } })`                                                                                                     | [§10.5](#s10-5-other-channel-methods)                           | channel-drafts                    |
| `channel.vote(msgId, pollId, vote)`                                                                | `channel.vote({ message_id, poll_id }, { vote })`                                                                                                | [§10.5](#s10-5-other-channel-methods)                           | channel-votes                     |
| `channel.archive()` → member                                                                       | `const { channel_member } = await channel.archive()`                                                                                             | [§10.5](#s10-5-other-channel-methods)                           | channel-archive-pin               |
| `channel.disconnected` / `channel._disconnect()`                                                   | `channel.pendingDisposal` / `channel.disconnect()`                                                                                               | [§10.5](#s10-5-other-channel-methods)                           | channel-pending-disposal          |
| `channel.listeners['x']`                                                                           | `channel.listeners.get('x')` (Map of Sets)                                                                                                       | [§7](#s7-events)                                                | channel-listeners                 |
| `channel.state.messages`                                                                           | `channel.messagePaginator.items` (shown window)                                                                                                  | [§11](#s11-channel-state-and-the-message-list)                  | message-paginator                 |
| `channel.state.latestMessages`                                                                     | `channel.messagePaginator.anchoredHeadItems`                                                                                                     | [§11](#s11-channel-state-and-the-message-list)                  | message-paginator                 |
| `channel.state.messagePagination.hasPrev` / `hasNext`                                              | `messagePaginator.state` `hasMoreTail` / `hasMoreHead`                                                                                           | [§11](#s11-channel-state-and-the-message-list)                  | message-paginator                 |
| `channel.state.last_message_at`                                                                    | `channel.messagePaginator.latestMessageAt`                                                                                                       | [§11](#s11-channel-state-and-the-message-list)                  | message-paginator                 |
| `channel.state.pinnedMessages`                                                                     | `channel.pinnedMessagesPaginator.items`                                                                                                          | [§11](#s11-channel-state-and-the-message-list)                  | pinned-messages-paginator         |
| `channel.state.threads[id]`                                                                        | `client.threads.get(id)?.messagePaginator.items`                                                                                                 | [§11](#s11-channel-state-and-the-message-list)                  | channel-state-threads             |
| `state.addMessageSorted(m)` / `removeMessage({ id })` / `findMessage(id)`                          | `messagePaginator.ingestItem(m)` / `removeItem({ id })` / `getItem(id)`                                                                          | [§11](#s11-channel-state-and-the-message-list)                  | message-paginator                 |
| `loadMessageIntoState(id)`                                                                         | `messagePaginator.jumpToMessage(id)`                                                                                                             | [§11](#s11-channel-state-and-the-message-list)                  | message-paginator                 |
| `state.setIsUpToDate(false)`                                                                       | delete; `messagePaginator.isActiveIntervalAtHead`, `setViewingLive(true)`                                                                        | [§11](#s11-channel-state-and-the-message-list)                  | is-up-to-date                     |
| `channel.state.unreadCount = n`                                                                    | read-only getter; use `markRead` / `markReadLocally`                                                                                             | [§11](#s11-channel-state-and-the-message-list)                  | channel-state-store               |
| `thread.state.replies` / `loadPrevPage()` / `loadNextPage()`                                       | `thread.messagePaginator` `items` / `toTail()` / `toHead()`                                                                                      | [§13](#s13-threads)                                             | thread-replies                    |
| `thread.deactivate()`                                                                              | `const release = thread.activate(); release();`                                                                                                  | [§13](#s13-threads)                                             | thread-activate                   |
| `client.threads.state` `threads` / `loadNextPage()`                                                | `client.threads.paginator` `items` / `toTail()`                                                                                                  | [§13](#s13-threads)                                             | thread-manager-list               |
| `threadsById[id] ?? new Thread(...)`                                                               | `client.threads.ensure({ channel, parentMessage })`                                                                                              | [§13](#s13-threads)                                             | thread-construction               |
| `thread.markAsRead()`                                                                              | `thread.markRead()`                                                                                                                              | [§13](#s13-threads)                                             | thread-mark-read                  |
| `import { StateStore } from 'stream-chat'`                                                         | `import { StateStore } from '@stream-io/state-store'`                                                                                            | [§1.3](#s1-3-statestore-moved-to-stream-iostate-store)          | state-store-package               |
| `VotingVisibility.public`                                                                          | `'public'` (type-only union)                                                                                                                     | [§15](#s15-composer-uploads-polls-reminders-and-other-managers) | voting-visibility                 |
| `encodeBase64` / `decodeBase64`                                                                    | `btoa` / `atob`                                                                                                                                  | [§15](#s15-composer-uploads-polls-reminders-and-other-managers) | encode-decode-base64              |
| `Message` / `UpdatedMessage` / `MessageBase`                                                       | `MessageRequest`                                                                                                                                 | [§14](#s14-types-renamed-removed-or-changed-meaning)            | message-request                   |
| `FormatMessageResponse` / `MessageResponseBase`                                                    | `LocalMessage` / `MessageResponse`                                                                                                               | [§14](#s14-types-renamed-removed-or-changed-meaning)            | message-response-types            |
| `ChannelData`                                                                                      | `ChannelInput`                                                                                                                                   | [§14](#s14-types-renamed-removed-or-changed-meaning)            | type-rename-table                 |
| `ChannelAPIResponse` / `QueryChannelAPIResponse` / `QueryChannelsAPIResponse`                      | `ChannelStateResponseFields` / `ChannelStateResponse` / `QueryChannelsResponse`                                                                  | [§14](#s14-types-renamed-removed-or-changed-meaning)            | type-rename-table                 |
| `ChannelQueryOptions`                                                                              | `ChannelGetOrCreateRequest`                                                                                                                      | [§14](#s14-types-renamed-removed-or-changed-meaning)            | type-rename-table                 |
| `Mute` / `MuteUserResponse`                                                                        | `UserMuteResponse` / `MuteResponse`                                                                                                              | [§14](#s14-types-renamed-removed-or-changed-meaning)            | type-rename-table                 |
| `RequestOptions`                                                                                   | `StreamRequestOptions`                                                                                                                           | [§14](#s14-types-renamed-removed-or-changed-meaning)            | type-rename-table                 |
| `MarkReadOptions` / `MarkUnreadOptions`                                                            | `MarkReadRequest` / `MarkUnreadRequest`                                                                                                          | [§14](#s14-types-renamed-removed-or-changed-meaning)            | type-rename-table                 |
| `TranslationLanguages`                                                                             | `TranslationLanguage`                                                                                                                            | [§14](#s14-types-renamed-removed-or-changed-meaning)            | type-rename-table                 |
| `CommandResponse`                                                                                  | `Command`                                                                                                                                        | [§14](#s14-types-renamed-removed-or-changed-meaning)            | composer-commands                 |
| `Device` / `PollVote` / `PollAnswer` / `PollOption`                                                | `DeviceResponse` / `PollVoteResponseData` / `PollVoteResponseData` / `PollOptionResponseData`                                                    | [§14](#s14-types-renamed-removed-or-changed-meaning)            | type-rename-table                 |
| `Role` (name union) / `User` / `Reaction` / `PollResponse` / `ThreadResponse`                      | `string` / `ClientUser` or `UserResponse` / `ReactionRequest` / `PollResponseData` / `ThreadStateResponse`                                       | [§14](#s14-types-renamed-removed-or-changed-meaning)            | same-name-meaning-changes         |
| `ChannelConfig` (server config type)                                                               | `ChannelConfigWithInfo`                                                                                                                          | [§10.6](#s10-6-getconfig-and-channelconfig)                     | channel-config                    |

<a id="breaks-that-compile"></a>

## Breaks that compile

These type-check (or run untyped in JavaScript) and misbehave. Check every row with Detection hits for its area; the Detect column is a pattern for the same `rg` command as [Detection](#detection), or a review instruction.

| Symptom                                                                                                    | Cause                                                                                                             | Detect                                                                                                          | Fix                                                                                                        | § / Ref                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Options ignored, warnings "unknown key" (one per character for a secret)                                   | v9 constructor call in JS: `new StreamChat(key, secret, opts)` or flat options                                    | `new StreamChat\(\|getInstance\(`                                                                               | move options under `config.client`; drop the secret                                                        | [§2](#s2-client-construction-and-configuration) · streamchat-constructor                               |
| Node 18 / 20 `connectUser` rejects "WebSocket is not defined"                                              | no bundled `ws`                                                                                                   | review Node entry points                                                                                        | Node 22+, or `wsConnection.webSocketImpl`                                                                  | [§1.2](#s1-2-websocket-on-node) · websocket-on-node                                                    |
| Console output the app never had                                                                           | default logger logs `info` to the console                                                                         | `chatLoggerSystem` absent                                                                                       | `chatLoggerSystem.configureLoggers({ default: { level: 'warn' } })` or a no-op sink                        | [§3](#s3-logging) · logging                                                                            |
| Custom fields read as `undefined`; channel names blank                                                     | custom data nested under `custom` (JS)                                                                            | `data\??\.(name\|image)\b`, `message\.[a-z_]+` reads of custom keys                                             | read / write `.custom.<key>`                                                                               | [§4](#s4-custom-data) · custom-data                                                                    |
| Dates "Invalid Date" or 1970 / year 50000; wrong comparisons; `!created_at` true                           | timestamps are ns numbers                                                                                         | `dayjs\(\|moment\(\|new Date\(\|Date\.now\(\)` near `_at` fields                                                | `nsToDate(ts)`; compare numbers; `dateToNs` / `nowNs`                                                      | [§5](#s5-timestamps) · timestamp-ns                                                                    |
| `new Date(ts)` compiles but is wrong                                                                       | global `DateConstructor` guard only fires when used as `Date`                                                     | `new Date\([^)]*_at`                                                                                            | `nsToDate(ts)`                                                                                             | [§5](#s5-timestamps) · date-constructor-guard                                                          |
| Sort ignored or rejected                                                                                   | object sort passed untyped                                                                                        | `\{\s*\w+\s*:\s*-?1\s*\}` in sort positions                                                                     | `[{ field, direction }]`                                                                                   | [§6](#s6-sort-and-filters) · sort-shape                                                                |
| Custom-field filter matches nothing                                                                        | custom key must be `custom.<key>`                                                                                 | `filter_conditions` / filters with custom keys                                                                  | `{ 'custom.<key>': value }`                                                                                | [§6](#s6-sort-and-filters) · filter-types                                                              |
| Offline banner never shows / never hides                                                                   | `connection.changed` never dispatched                                                                             | `connection\.changed\|transport\.changed`                                                                       | subscribe to `client.wsConnection.state`                                                                   | [§7](#s7-events) · connection-changed-removed                                                          |
| Handler body `e.message` compile errors disappear but `e` is the whole union                               | explicit `(e: Event) =>` annotation                                                                               | `\(\s*\w+\s*:\s*Event\s*\)`                                                                                     | drop the annotation or use `EventPayload<'...'>`                                                           | [§7](#s7-events) · event-union                                                                         |
| Error handling branches never match                                                                        | `ErrorFromResponse` gone; message text has no `StreamChat error code` prefix; network errors are raw axios errors | `StreamChat error\|ErrorFromResponse\|\.message\.includes\(`                                                    | `err instanceof StreamAPIError`, match `err.code` / `err.status`                                           | [§8](#s8-errors) · stream-api-error                                                                    |
| `client.queryChannels(...)` result has no `.length`; channels empty                                        | raw request now; returns a response object                                                                        | `\.queryChannels\(`                                                                                             | `queryChannelsAndHydrate`                                                                                  | [§9.2](#s9-2-querychannels) · query-channels-raw                                                       |
| A query / watch hangs or throws "No connection id is available"                                            | watching / presence requests wait for the socket                                                                  | `watch\|presence` in requests made before `connectUser` or on a server                                          | call `connectUser()` first, or pass `watch: false` / `presence: false`                                     | [§10.1](#s10-1-watch-and-the-connection-id) · watch-waits-for-connection-id                            |
| `channel.watch()` result used as a response (`res.messages`, `res.channel`)                                | `watch()` resolves the `Channel`                                                                                  | `await \w+\.watch\(` assigned and read                                                                          | read `channel.state` / `channel.messagePaginator`, or call `query()`                                       | [§10.1](#s10-1-watch-and-the-connection-id) · channel-watch-returns-channel                            |
| Repeated `watch()` does not refresh                                                                        | a watched, loaded channel sends nothing for the same options                                                      | `\.watch\(` used as a refresh                                                                                   | `channel.reload()`                                                                                         | [§10.1](#s10-1-watch-and-the-connection-id) · channel-watch-returns-channel                            |
| Messages missing after reconnect                                                                           | only `activate()`d channels reload                                                                                | channels opened without `activate()`                                                                            | `const release = channel.activate()` while on screen                                                       | [§10.2](#s10-2-activate-for-reconnect-recovery) · channel-activate-recovery                            |
| Double reload after reconnect                                                                              | app re-queries on `connection.recovered` too                                                                      | `connection\.recovered`                                                                                         | remove the manual reload for active channels                                                               | [§10.2](#s10-2-activate-for-reconnect-recovery) · connection-recovery                                  |
| Sent message never appears optimistically / no offline queue                                               | `channel.sendMessage` is HTTP only                                                                                | `\.sendMessage\(` in UI send paths                                                                              | `channel.messageComposer.send()` or `channel.messageOperations.send(...)`                                  | [§10.3](#s10-3-sending-messages-and-reactions) · channel-send-message                                  |
| Delivery candidates never cleared; read hook / local fallback skipped                                      | `channel.markRead()` is now the direct request                                                                    | `\.markRead\(`                                                                                                  | `markReadViaReporter()` for the v9 behaviour                                                               | [§10.4](#s10-4-markread) · channel-mark-read                                                           |
| `markRead` / `markUnread` throw instead of resolving `null`                                                | read events off (server, client config or missing `read-events` capability)                                       | `markRead\(\)\.then\|=== null`                                                                                  | `try/catch` or check `channel.readEventsEnabled`                                                           | [§10.4](#s10-4-markread) · channel-read-events-throw                                                   |
| Feature gates read `undefined`                                                                             | `channel.getConfig()` removed; `ChannelConfig` means the instance config                                          | `getConfig\(\)\|ChannelConfig\b`                                                                                | `channel.serverConfig?.<flag>` or `channel.config.<feature>.enabled`                                       | [§10.6](#s10-6-getconfig-and-channelconfig) · channel-config                                           |
| `channel.update({ name })` wipes other custom fields                                                       | full update; custom under `data.custom`                                                                           | `\.update\(` on channels                                                                                        | `updatePartial({ set: { name } })` or spread `channel.data?.custom`                                        | [§10.5](#s10-5-other-channel-methods) · channel-update                                                 |
| UI does not re-render after state writes                                                                   | store-backed state: in-place mutation does not publish                                                            | `\.(data\|read\|members\|watchers)\[?[^=]*\]?\s*=` on channel state                                             | assign new objects (`channel.data = { ...channel.data, x }`)                                               | [§11](#s11-channel-state-and-the-message-list) · channel-data, channel-state-store                     |
| Message list empty after `channel.query()`                                                                 | `query()` adds no messages                                                                                        | `\.query\(` used to load messages                                                                               | `watch()` / `messagePaginator.toTail()`                                                                    | [§11](#s11-channel-state-and-the-message-list) · channel-query                                         |
| Channel list order differs; no jump to top on new message                                                  | no promotion; position follows sort                                                                               | review list sort                                                                                                | declare sort (`pinned_at`, `last_message_at`); `paginator.boost`                                           | [§12](#s12-channel-lists-activechannels-and-channelmanager) · channel-list-ordering                    |
| Channels leave or join lists unexpectedly                                                                  | full client-side filter matching                                                                                  | lists with server-only filters                                                                                  | review filters; `addFilterResolvers` / ownership                                                           | [§12](#s12-channel-lists-activechannels-and-channelmanager) · channel-list-event-routing               |
| Held `Channel` throws "pending disposal" after logout / user switch                                        | `disconnectUser()` disposes every channel                                                                         | app-level channel caches                                                                                        | drop references; `client.channel(type, id)` again                                                          | [§12](#s12-channel-lists-activechannels-and-channelmanager) · disconnect-user-teardown                 |
| Thread never updates                                                                                       | threads get events only through `client.threads`                                                                  | `new Thread\(`                                                                                                  | `client.threads.ensure(...)`, keep `client.threads.registerSubscriptions()` mounted                        | [§13](#s13-threads) · thread-event-routing                                                             |
| `VotingVisibility.public` is `undefined` (JS)                                                              | enum became a type-only union                                                                                     | `VotingVisibility\.`                                                                                            | string literal `'public'`                                                                                  | [§15](#s15-composer-uploads-polls-reminders-and-other-managers) · voting-visibility                    |
| Link previews appear where the app had none                                                                | composer enables link previews by default                                                                         | `linkPreviews` config absent                                                                                    | `client.config.setConfig('messageComposer', { linkPreviews: { enabled: false } })` if the app had them off | [§15](#s15-composer-uploads-polls-reminders-and-other-managers) · link-previews-default                |
| A composer without a command chip loses `/giphy` from the text as soon as it is typed                      | composer installs the command middlewares by default                                                              | `createCommandInjectionMiddleware\|createActiveCommandGuardMiddleware\|createCommandStringExtractionMiddleware` | delete own installs; a UI without a chip removes all four                                                  | [§15](#s15-composer-uploads-polls-reminders-and-other-managers) · composer-command-middlewares-default |
| Attachment type guards fail; file size / mime missing                                                      | upload metadata under `attachment.custom`                                                                         | `mime_type\|file_size`                                                                                          | `attachment.custom.mime_type`                                                                              | [§4](#s4-custom-data) · attachment-metadata-custom                                                     |
| `AI_STATE_CHECKING_SOURCES` branch never runs                                                              | literal renamed                                                                                                   | `AI_STATE_CHECKING_SOURCES`                                                                                     | `AIStates.ExternalSources` / `'AI_STATE_EXTERNAL_SOURCES'`                                                 | [§7](#s7-events) · ai-state                                                                            |
| Proxy / CSP / request mocks miss requests                                                                  | REST under `/api/v2`, WS at `/api/v2/connect`, token in the first frame                                           | review proxy, CSP, msw / nock handlers                                                                          | update paths                                                                                               | [§9.1](#s9-1-request-object-signatures) · rest-routes, ws-handshake                                    |
| `connectUser` fails for a dev token / string token of a user id with non-ASCII characters or `>`, `?`, `~` | token payload decoded with plain `atob`                                                                           | `devToken\(\|DevToken\(` and non-ASCII user ids                                                                 | token provider instead of a string token                                                                   | [§2](#s2-client-construction-and-configuration) · dev-token-encoding                                   |
| `revokeTokens()` no longer revokes app-wide                                                                | revokes only the connected user's tokens                                                                          | `revokeTokens\(`                                                                                                | app-wide revocation in `@stream-io/node-sdk`                                                               | [§1.4](#s1-4-server-side-code) · revoke-tokens                                                         |
| `persistUserOnConnectionFailure` no longer stops the socket after a network failure                        | keeps retrying                                                                                                    | `persistUserOnConnectionFailure`                                                                                | call `closeConnection()` yourself if needed                                                                | [§2](#s2-client-construction-and-configuration) · persist-user-on-connection-failure                   |

The reference lists every behaviour change that still compiles, including rarer ones (offline DB implementers, paginator subclasses, search sources, notification config): anchor `behaviour-index`.

<a id="s1-install-runtime-and-packaging"></a>

## 1. Install, runtime and packaging

<a id="s1-1-node-and-package-manager"></a>

### 1.1 Node and package manager

v10 declares `engines.node >=22.18.0`. Yarn 1 (classic) refuses to install a dependency whose `engines` does not match, also in browser and React Native projects where Node only runs the tooling; npm and pnpm warn. Install with Node 22.18+ (or 24.x) wherever the app installs or builds (local, CI, Docker). Install the newest v10 of `stream-chat` with the app's package manager; for UI SDKs, upgrade them in the same step and let their `peerDependencies` (read from the installed package) decide the `stream-chat` range. Ref: node-engine.

v10 no longer depends on `ws`, `jsonwebtoken`, `form-data`, `base64-js`, `isomorphic-ws`, `@types/ws` or `@types/jsonwebtoken`. If the app imports any of them, add it to the app's own `package.json`. Bundler shims added for v9 (webpack `resolve.fallback`, Metro `extraNodeModules`, Vite aliases or Jest `moduleNameMapper` entries for `crypto`, `https`, `zlib`, `ws`, `jsonwebtoken`) can be removed. Ref: removed-dependencies, browser-field.

TypeScript: with `skipLibCheck: false`, the v10 declarations need `@types/node` and the `dom` lib. Keep `skipLibCheck: true` or add both. Ref: typescript-requirements.

<a id="s1-2-websocket-on-node"></a>

### 1.2 WebSocket on Node

Browsers and React Native are unaffected. On Node the client uses the global `WebSocket` (Node 22+). On older Node, or to use `ws` anyway, pass an implementation:

```ts
// v10
import WS from 'ws';
import { StreamChat } from 'stream-chat';

const client = new StreamChat(apiKey, {
  client: {
    allowServerSideConnect: true,
    wsConnection: { webSocketImpl: WS as unknown as typeof WebSocket },
  },
});
```

The cast is required (`ws` is not assignable to `typeof WebSocket`). Ref: websocket-on-node.

<a id="s1-3-statestore-moved-to-stream-iostate-store"></a>

### 1.3 `StateStore` moved to `@stream-io/state-store`

`StateStore`, `MergedStateStore`, `isPatch` and the `Unsubscribe`, `Handler`, `Patch`, `Preprocessor`, `RemovePreprocessor`, `ValueOrPatch` types are no longer exported from `stream-chat`. Add `@stream-io/state-store` to the app's `dependencies` with the range `stream-chat` itself declares (read it from `node_modules/stream-chat/package.json`), and make sure only one copy resolves (two copies make every `StateStore<...>` type incompatible: TS2345 "separate declarations of a private property").

```ts
// v9
import { StateStore, type Unsubscribe } from 'stream-chat';
```

```ts
// v10
import { StateStore, type Unsubscribe } from '@stream-io/state-store';
```

Ref: state-store-package, state-store-identity, state-store-semantics.

<a id="s1-4-server-side-code"></a>

### 1.4 Server-side code

`stream-chat` v10 is client-side only. Removed: the `secret` constructor argument, `client.secret`, `client.createToken`, server tokens, `_isUsingServerAuth`, the webhook / SQS / SNS helpers (`verifyWebhook`, `verifyAndParseWebhook`, `verifySignature`, `parseSqs`, `parseSns`, ...), `JWTUserToken`, `JWTServerToken`, and about 90 admin methods (app settings, push providers, user admin, channel types, commands, roles / permissions, exports / imports, campaigns, segments, batch updates, retention). `user_id` "on behalf of" overrides are gone from every method; the connected user acts.

Detect with the §1.4 pattern in [Detection](#detection), then for every hit:

1. Do **not** port the call onto `stream-chat` v10, and do not keep a secret in code that imports `stream-chat`.
2. Move it to `@stream-io/node-sdk` (`new StreamClient(apiKey, apiSecret)`; app, user, role, permission, push, import and task endpoints on the client; chat endpoints on `client.chat`; moderation on `client.moderation`). Use the method-by-method mapping in the reference: anchors server-only-methods-removed (admin methods, with a checked node-sdk snippet), server-side-auth-removed (tokens), webhook-helpers-removed (webhooks).
3. Verify each node-sdk method in `node_modules/@stream-io/node-sdk` after installing it. Unknown request keys are dropped there without an error, so check field names.
4. If the server code is out of scope for this task, leave that service on `stream-chat` v9 and list it in the report.

```ts
// v10 server (node-sdk), replacing new StreamChat(key, secret) + createToken
import { StreamClient } from '@stream-io/node-sdk';

const server = new StreamClient(
  process.env.STREAM_API_KEY!,
  process.env.STREAM_API_SECRET!,
);
const token = server.generateUserToken({ user_id: 'jane', validity_in_seconds: 60 * 60 });
```

Client-side relatives: `client.revokeTokens(before?)` now revokes only the connected user's tokens (Ref: revoke-tokens); `client.unbanUser` is the remaining v1 moderation call.

<a id="s2-client-construction-and-configuration"></a>

## 2. Client construction and configuration

`new StreamChat(key, config?)` and `StreamChat.getInstance(key, config?)` take one config tree (the same shape `client.config.set()` takes). Client options move under `config.client`. A v9 call in plain JavaScript runs but is silently misconfigured.

```ts
// v9
const client = StreamChat.getInstance(apiKey, {
  timeout: 6000,
  enableWSFallback: true,
  recoverStateOnReconnect: false,
  isLocalUnreadCountEnabled: true,
});
```

```ts
// v10
import { StreamChat } from 'stream-chat';

const client = StreamChat.getInstance(apiKey, {
  client: {
    axiosRequestConfig: { timeout: 6000 },
    wsConnection: { enableWSFallback: true },
    connectionRecovery: { enabled: false },
  },
  channel: { readEvents: { localUnreadCountEnabled: true } },
});
```

| v9 option                                                                                                    | v10 location                                                           |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `allowServerSideConnect`, `baseURL`, `browser`, `persistUserOnConnectionFailure`                             | `client.<same name>`                                                   |
| `axiosRequestConfig` and top-level axios fields (`timeout`, `httpsAgent`, `withCredentials`, `headers`, ...) | `client.axiosRequestConfig.<field>`                                    |
| `notifications` (a `NotificationManager`)                                                                    | `client.notificationManager`                                           |
| `recoverStateOnReconnect`                                                                                    | `client.connectionRecovery.enabled`                                    |
| `enableWSFallback`                                                                                           | `client.wsConnection.enableWSFallback`                                 |
| `wsUrlParams`                                                                                                | `client.wsConnection.urlParams`                                        |
| `isLocalUnreadCountEnabled`                                                                                  | `channel.readEvents.localUnreadCountEnabled` (top-level `channel` key) |
| `device`                                                                                                     | removed: call `client.createDevice(...)` after connecting              |
| `logger`                                                                                                     | removed: [§3](#s3-logging)                                             |
| `disableCache`, `enableInsights`, `warmUp`                                                                   | removed, no replacement                                                |

`axiosRequestConfig`, `baseURL` and `notificationManager` are read once at construction. Properties that mirrored options are gone: `client.options.x` → `client.config.getConfig('client')?.x`; `client.recoverStateOnReconnect` → `client.connectionRecovery.config.enabled`; `client.defaultWSTimeout` → `client.wsConnection.config.connectTimeoutMs`; `client.persistUserOnConnectionFailure = v` → `client.config.setConfig('client', { persistUserOnConnectionFailure: v })`. Read-only getters: `anonymous`, `browser`, `node`, `userId` (deprecated `userID`), `clientId` (deprecated `clientID`); do not assign them. `client.setMessageComposerSetupFunction(fn)` still works but is deprecated: use `client.config.setSetupFunction('messageComposer', fn)`. Axios: SDK auth headers always win over integrator headers, and there is no default Node keep-alive agent (pass `httpsAgent` if you relied on it).

`persistUserOnConnectionFailure: true` now keeps the socket retrying after a WebSocket / network failure (v9 closed it); call `client.closeConnection()` yourself if the app relied on the socket stopping.

Tokens: `client.devToken(id)` / `DevToken(id)` and the token check in `connectUser` fail for user ids with non-ASCII characters or `>`, `?`, `~`: give such users a token provider (`connectUser(user, () => fetchToken())`) instead of a string. Runtimes without global `atob` / `btoa` need a polyfill. `enableInsights` telemetry is gone without replacement.

Ref: streamchat-constructor, streamchat-options, option-mirror-properties, axios-instance, client-getters, message-composer-setup-function, persist-user-on-connection-failure, token-manager, dev-token-encoding, insights-removed.

<a id="s3-logging"></a>

## 3. Logging

`options.logger`, `client.logger` and the `Logger` type are removed. Logging goes through the process-wide `chatLoggerSystem` (root export). **The default changed**: v10 logs `info` and above to the console, v9 was silent.

```ts
// v9
const client = new StreamChat(apiKey, {
  logger: (level, message, extra) => myLog(level, message, extra),
});
```

```ts
// v10
import { chatLoggerSystem } from 'stream-chat';

chatLoggerSystem.configureLoggers({
  default: {
    level: 'warn',
    sink: (level, message, ...data) => myLog(level, message, data),
  },
});
// keep v9 silence: chatLoggerSystem.configureLoggers({ default: { sink: () => {} } });
```

Configure before creating the client. `LogLevel` is now `'trace' | 'debug' | 'info' | 'warn' | 'error'`: exhaustive switches need the two new levels. Per-scope config keys (`client`, `connection`, `channel`, ...) are listed in the reference. Ref: logging, log-chat-promise-execution.

<a id="s4-custom-data"></a>

## 4. Custom data

Every entity, request and event keeps custom fields in a `custom` object (required on responses, optional on requests, required on outgoing attachments). Plain JavaScript reading a top-level custom field gets `undefined` with no error. The `declare module 'stream-chat'` augmentation of the `Custom*Data` interfaces keeps working and now types `custom`.

```ts
// v9
await channel.sendMessage({ text: 'hi', priority: 'high' });
const priority = message.priority;
const title = channel.data?.name;
client.channel('messaging', 'general', { name: 'General' });
```

```ts
// v10
declare module 'stream-chat' {
  interface CustomMessageData {
    priority?: string;
  }
  interface CustomChannelData {
    name?: string;
    image?: string;
  }
}

await channel.sendMessage({ message: { text: 'hi', custom: { priority: 'high' } } });
const priority = message.custom.priority;
const title = channel.data?.custom?.name;
client.channel('messaging', 'general', { custom: { name: 'General' } });
```

- Channel `name` / `image`: the most common read to fix (headers, list previews, search results). `channel.data` is partial, so read `channel.data?.custom?.name`. In TypeScript, keep (or add) `name` / `image` on `CustomChannelData`; v9 did not declare them either. Filtering is the exception: `name` stays a top-level key of channel `filter_conditions`; other custom keys filter as `'custom.<key>'` ([§6](#s6-sort-and-filters)).
- Partial updates are the other exception: `set` / `unset` in `updateUsersPartial` and `channel.updatePartial` stay flat (built-in and custom keys side by side). Do not wrap them in `custom`.

```ts
// v10
const { users } = await client.updateUsersPartial({
  users: [{ id: client.userId ?? '', set: { name: 'Jane', color: 'blue' } }],
});
```

- Attachments: `mime_type`, `file_size`, `duration`, `waveform_data` moved to `attachment.custom.*`; location moved to `message.shared_location`.
- `CustomCommandData` augmentation has no effect any more; delete it.
- Required members in an augmentation become required in every `custom` object, including test fixtures.

Ref: custom-data, custom-data-augmentation, attachment-metadata-custom.

<a id="s5-timestamps"></a>

## 5. Timestamps

Every server-sent date (responses, events, SDK state) is a `TimestampNS`: a branded number of nanoseconds since the epoch. v9 had ISO strings (and `Date` on formatted messages). Request date fields are `Date`. Root-exported helpers: `nsToDate`, `convertTimestampToDate`, `nsToMs`, `msToNs`, `dateToNs`, `nowNs`, `nsToRfc3339`, `asTimestampNS`, `NS_PER_MS`.

```ts
// v9
const sentAt = new Date(message.created_at);
const isRecent = Date.parse(message.created_at) > Date.now() - 60_000;
```

```ts
// v10
import { msToNs, nowNs, nsToDate } from 'stream-chat';

const sentAt = nsToDate(message.created_at);
const isRecent = message.created_at > nowNs() - msToNs(60_000);
```

- Silent failures (no type error): `dayjs(ts)` / `moment(ts)`, `ts > Date.now()`, `if (!message.created_at)` (0 is a valid value), persisted ISO strings or `Date`s compared with fresh values. Convert at the UI edge with `nsToDate`; compare numbers.
- `new Date(ts)` still compiles; the global guard only errors where the result is used as a `Date` (`.getTime()`, assignment to `Date`). Replace it with `nsToDate(ts)` anyway.
- Feeding a server value back into a request: `nsToDate(ts)` (request fields take `Date`). Values read from your own storage: `asTimestampNS(n)`.
- `formatMessage` / `LocalMessage` no longer convert to `Date`, and use `undefined` instead of `null` (`deleted_at`, `pinned_at`, `quoted_message`, `error`): replace `=== null` checks with `== null`.

Ref: timestamp-ns, date-constructor-guard, request-dates, state-timestamps, format-message.

<a id="s6-sort-and-filters"></a>

## 6. Sort and filters

Every sort is `SortParamRequest[]` and sits inside the request object. All 29 sort aliases (`ChannelSort`, `UserSort`, `MemberSort`, `ReactionSort`, `SearchMessageSort`, `ThreadSort`, `PollSort`, ..., `SortParam`, `AscDesc`) are removed. Keep the key order of the v9 object.

```ts
// v9
const sort: ChannelSort = { pinned_at: -1, last_message_at: -1 };
```

```ts
// v10
import type { SortParamRequest } from 'stream-chat';

const sort: SortParamRequest[] = [
  { field: 'pinned_at', direction: -1 },
  { field: 'last_message_at', direction: -1 },
];
```

Filters are generated per endpoint (`ChannelFilters`, `UserFilters`, `MemberFilters`, `MessageFilters`, ... still exported). Custom fields are `'custom.<field>'` keys; one operator per key (split two operators on one key into `$and`). Some built-in keys left the typed filters (for example `UserFilters.online`); keep such a filter behind a narrow `// @ts-expect-error` and report it, do not delete it. Ref: sort-shape, filter-types, search-source-sort.

<a id="s7-events"></a>

## 7. Events

`Event` is a discriminated union: fields exist only on the members that declare them. `on()` / `off()` accept only known `EventType` names (plus `'all'`); `client.on(...)` returns `{ unsubscribe }`.

```ts
// v9
const handler = (e: Event) => console.log(e.message?.text);
client.on('message.new', handler);
client.off('message.new', handler);
```

```ts
// v10
import type { EventPayload } from 'stream-chat';

const { unsubscribe } = client.on('message.new', (e) => console.log(e.message.text));
unsubscribe();

const onNew = (e: EventPayload<'message.new'>) => console.log(e.message.id);
client.on('message.new', onNew);
client.off('message.new', onNew);
```

- Drop explicit `(e: Event) =>` annotations; they widen the event back to the union.
- `EventTypes` → `EventType` (type only). `EVENT_MAP` is gone: keep your own list if you iterated it.
- Removed names: `connection.changed`, `transport.changed`, `capabilities.changed` (subscribe to `channel.state` `ownCapabilities`, which changes only when the capabilities do), `channel.muted` / `channel.unmuted` (use `notification.channel_mutes_updated`), `user.unread_message_reminder`. `'*'` is not an event name; listen with `client.on(cb)` or `client.on('all', cb)`.
- `channel.listeners` is a `Map<EventType, Set<EventHandler>>` (`channel.listeners.get(type)?.size`, `channel.listeners.clear()`); a handler registered twice registers once. Same for `client.listeners`.
- `AIState` literal `AI_STATE_CHECKING_SOURCES` is now `AI_STATE_EXTERNAL_SOURCES` (use `AIStates`).

**`connection.changed` and `transport.changed` are never dispatched.** In TypeScript the listener no longer compiles; in JavaScript it silently never fires. Socket health is a store; device network status is `client.networkConnection.state`; the long-poll switch is the local `connection.fallback_activated` event.

```ts
// v9
client.on('connection.changed', (e) => setOnline(!!e.online));
```

```ts
// v10
const unsubscribeHealth = client.wsConnection.state.subscribeWithSelector(
  ({ isHealthy }) => ({ isHealthy }),
  ({ isHealthy }) => setOnline(isHealthy),
);
```

Device network status comes from `client.networkConnection` reporters: browsers get one automatically; React Native and other hosts should install one (`client.networkConnection.setStatusReporter(...)`, for example NetInfo-based) for fast reconnects. With `enableWSFallback`, the WebSocket waits the full `connectTimeoutMs` (15 s) before switching to long-poll; lower it to switch sooner.

The store fires once immediately and publishes every transition at once (v9 delayed drops by about 5 s; delay a banner yourself, `client.wsConnection.config.offlineNotificationDisplayDelayMs`). `client.wsConnection` is never null (check `client.wsConnection.isHealthy`, not `if (client.wsConnection)`); `client.wsFallback` is gone.

**Custom events** carry their payload in `event.custom`, and their names must be declared:

```ts
// v10
declare module 'stream-chat' {
  interface CustomEventTypes {
    'friendship.request': true;
  }
}

await channel.sendEvent({
  event: { type: 'friendship.request', custom: { from: 'jane' } },
});
client.on('friendship.request', (e) => console.log(e.custom));
```

Ref: event-union, event-type-names, connection-changed-removed, capabilities-changed-removed, custom-events, event-handler-generic, connection-open, channel-send-event, channel-listeners, ws-connection, websocket-impl-network-status, long-poll-fallback, ai-state.

<a id="s8-errors"></a>

## 8. Errors

A failed request whose body has a Stream error `code` rejects with `StreamAPIError` (`code?`, `status?`, `response?`); the message is the raw server message (no `StreamChat error code N:` prefix). Anything else (network error, a 502 HTML page, a cancelled request) is the raw axios error. `ErrorFromResponse`, `client.errorFromResponse` and `client.handleResponse` are removed; errors no longer carry `client_request_id`.

```ts
// v9
try {
  await channel.sendMessage({ text });
} catch (err) {
  if (err instanceof ErrorFromResponse && err.code === 17) showNotAllowed();
}
```

```ts
// v10
import { StreamAPIError } from 'stream-chat';

try {
  await channel.sendMessage({ message: { text } });
} catch (err) {
  if (err instanceof StreamAPIError && err.code === 17) showNotAllowed();
  else throw err;
}
```

Read `err.response?.data.status_code` instead of `StatusCode`. A failed message's `localMessage.error` is a plain object; a transport failure there has `status: 0`. `TOKEN_EXPIRED` from a token provider is retried up to 10 times (about 100 s) before rejecting. Ref: stream-api-error, automatic-retries.

<a id="s9-streamchat-methods"></a>

## 9. `StreamChat` methods

<a id="s9-1-request-object-signatures"></a>

### 9.1 Request-object signatures

Generated methods take `(pathParams?, request?, requestOptions?)`: path ids in a first object, then the request object sent as given, then `requestOptions?: StreamRequestOptions` (`{ signal, onUploadProgress, timeout }`, replaces v9 `RequestOptions`). Methods with no body keep an unused `_request` slot: pass `undefined` to reach `requestOptions`. Responses are `StreamResponse<T>` (body plus `metadata`); `blocklist` is gone from responses. `user_id` overrides are dropped everywhere.

```ts
// v9
const { users } = await client.queryUsers(
  { id: { $in: ids } },
  { last_active: -1 },
  { limit: 10 },
);
const { results } = await client.search({ cid: channel.cid }, 'hello', { limit: 20 });
```

```ts
// v10
const { users } = await client.queryUsers({
  payload: {
    filter_conditions: { id: { $in: ids } },
    sort: [{ field: 'last_active', direction: -1 }],
    limit: 10,
  },
});
const { results } = await client.search({
  payload: { filter_conditions: { cid: channel.cid }, query: 'hello', limit: 20 },
});
```

The same rule changed `queryBannedUsers`, `queryFutureChannelBans`, `queryMessageFlags` (`{ payload }`), user-group methods (`({ id }, request)`), `translateMessage({ id }, { language })`, `getMessage({ id })`, `sync({ channel_cids, last_sync_at: Date })`, `deleteChannels({ cids, hard_delete })`, `queryDrafts`, `getAppSettings(undefined, requestOptions)`, `setGuestUser(user: UserRequest)`, block lists, `markChannelsRead`, `markChannelsDelivered`. Table: Ref generated-client-signatures.

- `client.pinMessage(m, 120)` → `client.pinMessage(m, { pin_expires: new Date(Date.now() + 120 * 1000) })`; `pinMessage('id')` → `pinMessage({ id: 'id' })`; `unpinMessage(m, userId)` → `unpinMessage(m)`. Ref: pin-unpin-message.
- Moderation methods moved to `client.moderation`: `client.banUser(id, o)` → `client.moderation.ban({ target_user_id: id, ...o })`; `shadowBan` → `ban({ ..., shadow: true })`; `removeShadowBan(id)` → `client.unbanUser(id, { shadow: true })`; `muteUser(id)` → `client.moderation.mute({ target_ids: [id] })`; `unmuteUser(id)` → `client.moderation.unmuteUser(id)`; `flagMessage(id, o)` → `client.moderation.flagMessage({ message_id: id, ...o })`; `flagUser(id, o)` → `client.moderation.flagUser({ user_id: id, ...o })`; `unflagMessage` / `unflagUser` / `unblockMessage` removed. Ref: client-moderation-methods, moderation-methods.
- Raw HTTP: `client.get/post/put/patch/delete` and `client.doAxiosRequest` moved to `client.api.*`; `createAbortControllerForNextRequest()` is gone: pass `requestOptions.signal`. REST paths are now `/api/v2/...` and the socket connects to `/api/v2/connect` with the token in its first frame: update proxies, CSP allowlists and request mocks keyed on paths. Ref: raw-http-helpers, rest-routes, ws-handshake.
- `client.channel(type, id, data)`: `data` is `ChannelInput` (custom fields under `custom`, members as `{ user_id }`); `getChannelById` / `getChannelByMembers` removed (use `client.channel`). Ref: client-channel.
- `client.connectUser(user, token)`: `user` is `ClientUser` (custom fields under `custom`). `client.mutedUsers` is backed by `client.mutedUsersStore`. Ref: client-user-listeners-mutes.

<a id="s9-2-querychannels"></a>

### 9.2 `queryChannels`

`client.queryChannels(request?, requestOptions?)` is now the raw request: it returns the response object, creates no `Channel` instances, stores nothing, dispatches no `channels.queried`. The v9 behaviour is `queryChannelsAndHydrate`. A `const channels = await client.queryChannels(...)` in JavaScript now gets an object.

```ts
// v9
const channels = await client.queryChannels(
  { members: { $in: [userId] } },
  { last_message_at: -1 },
  { limit: 20 },
);
```

```ts
// v10
const channels = await client.queryChannelsAndHydrate({
  filter_conditions: { members: { $in: [userId] } },
  sort: [{ field: 'last_message_at', direction: -1 }],
  limit: 20,
});
```

`stateOptions` stays the second argument; the abort signal moves to the third (`requestOptions`). `stateOptions.skipInitialization` is removed: drop it, and `activate()` the channels on screen instead of passing their IDs ([§10.2](#s10-2-activate-for-reconnect-recovery)). For a live channel list prefer a `ChannelPaginator` ([§12](#s12-channel-lists-activechannels-and-channelmanager)). `queryChannelsRequest*` are removed. Watching requires a socket ([§10.1](#s10-1-watch-and-the-connection-id)). Ref: query-channels-raw, query-channels-hydration, query-channels-response-with-channels, skip-initialization-removed.

<a id="s9-3-raw-calls-and-andhydrate"></a>

### 9.3 Raw calls and `*AndHydrate`

`queryThreads(request?)`, `getThread({ message_id }, request?)` and `queryReactions({ id }, request?)` are raw generated calls with no defaults and no state. Use `client.queryThreadsAndHydrate(options?)`, `client.getThreadAndHydrate({ message_id })` and `client.queryReactionsAndHydrate({ id }, request?)` where the app needs `Thread` instances or offline reactions. `client.updateMessage({ id }, { message })` and `client.deleteMessage({ id }, { hard?, delete_for_me? })` send only the request (no offline queue, no local state): UI edits and deletes go through `channel.messageOperations.update` / `delete` or the composer ([§10.3](#s10-3-sending-messages-and-reactions)). Ref: threads-reactions-hydrate, update-delete-message-raw.

<a id="s9-4-renamed-streamchat-methods"></a>

### 9.4 Renamed `StreamChat` methods

| v9                                                           | v10                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `queryUserGroups(options?)`                                  | `listUserGroups({ limit?, id_gt?, created_at_gt?, team_id? }?)`                      |
| `addDevice(id, push_provider, userID?, push_provider_name?)` | `createDevice({ id, push_provider, push_provider_name? })`                           |
| `getDevices(userID?)`                                        | `listDevices()`                                                                      |
| `removeDevice(id, userID?)`                                  | `deleteDevice({ id })`                                                               |
| `setLocalDevice(device)`                                     | none: `createDevice(...)` after connecting                                           |
| `getUnreadCount(userID?)`                                    | `unreadCounts()` (connected user only)                                               |
| `setPushPreferences(preferences)`                            | `updatePushNotificationPreferences({ preferences })` (`call_level` no longer exists) |
| `partialUpdateUser(u)` / `partialUpdateUsers(us)`            | `updateUsersPartial({ users: [{ id, set?, unset? }] })`                              |
| `upsertUser(u)` / `upsertUsers(us)` / `updateUser(u)`        | `updateUsers({ users: { [id]: user } })`                                             |
| `unBlockUser(id)`                                            | `unblockUser(id, requestOptions?)`                                                   |
| `getSharedLocations()`                                       | `getUserLiveLocations()`                                                             |
| `updateLocation(payload)`                                    | `updateLiveLocation({ message_id, latitude?, longitude?, end_at? })`                 |
| `markAllRead(data?)`                                         | `markChannelsRead(request?)`                                                         |
| `partialUpdateMessage(id, { set, unset })`                   | `updateMessagePartial({ id }, { set?, unset? })`                                     |
| `ephemeralUpdateMessage(...)`                                | none: `updateMessagePartial`                                                         |
| `partialUpdateThread(messageId, { set, unset })`             | `updateThreadPartial({ message_id }, { set?, unset? })`                              |
| `enrichURL(url)`                                             | `getOG({ url })`                                                                     |
| `hydrateActiveChannels(channels, stateOptions?, options?)`   | `hydrateChannels(channels, stateOptions?, queryOptions?)`                            |
| `setAnonymousUser()`                                         | `connectAnonymousUser()`                                                             |

Poll and reminder methods: [§15](#s15-composer-uploads-polls-reminders-and-other-managers). Ref: renamed-client-methods.

<a id="s9-5-uploads"></a>

### 9.5 Uploads

Uploads take a request object with a `file`: a browser `File` / `Blob`, a React Native `{ uri, name, type }` reference, or a URI string. Node `Buffer`s and streams are no longer accepted (pass a `Blob`). There is no `contentType` parameter: set `type` on the file reference. Upload progress, timeout and abort go in `requestOptions`.

```ts
// v9
await channel.sendImage(file, file.name, file.type, undefined, { onUploadProgress });
await channel.deleteImage(url);
```

```ts
// v10
await channel.uploadImage({ file }, { onUploadProgress });
await channel.deleteImage({ url });
await client.uploadFile({ file: { uri, name: 'clip.mp4', type: 'video/mp4' } });
```

`client.sendFile` is removed. Ref: client-uploads, channel-uploads.

<a id="s10-channel"></a>

## 10. `Channel`

Always get channels from `client.channel(type, id, data)` (never `new Channel(...)`: an unstored instance receives no events). `channel.type` is read-only. Every channel method takes request objects plus a trailing `requestOptions`; `user_id` overrides are gone.

<a id="s10-1-watch-and-the-connection-id"></a>

### 10.1 `watch()` and the connection id

- Any request that carries `watch` or `presence` (`channel.watch()`, `channel.query({ watch: true })`, `queryChannels*` (default `watch: true`), `queryUsers` with `presence`, `queryThreads` / `getThread` / `sync` with `watch`) waits until the socket has a connection id. Without an open or opening socket it throws "No connection id is available". Call `client.connectUser()` first (awaiting it is not required); server-side or socket-less callers pass `watch: false` / `presence: false`; pass `requestOptions.signal` to bound the wait.
- `channel.watch(options?, requestOptions?)` resolves with the `Channel` (the instance to use: the channel itself, or the one that superseded a members-only channel), not with the server response. Read data from `channel.data`, `channel.state` and `channel.messagePaginator`; call `channel.query()` when the raw response is needed.
- A channel already watched and loaded sends nothing for the same options; refresh it with `channel.reload()`. Load other messages with `channel.messagePaginator` (`toTail()`, `toHead()`, `jumpToMessage(id)`), not with `watch({ messages })`.
- `channel.query(options?, requestOptions?)`: the v9 second argument (message set) is removed, and `query()` / `create()` never add messages to the list.

```ts
// v9
const response = await channel.watch();
setMessages(response.messages);
```

```ts
// v10
const watched = await channel.watch();
setMessages(watched.messagePaginator.items ?? []);
```

Ref: watch-waits-for-connection-id, channel-watch, channel-watch-returns-channel, channel-query, channel-initialized, connection-id-lifecycle.

<a id="s10-2-activate-for-reconnect-recovery"></a>

### 10.2 `activate()` for reconnect recovery

After a reconnect, `client.connectionRecovery` re-queries the registered channel lists and reloads only channels that are active (`channel.activate()`, ref-counted). A channel that is watched but not active is not refreshed and misses messages sent while offline. `client.recoverState()` and the `recoverStateOnReconnect` option are gone (`client.connectionRecovery.recover()` triggers a recovery by hand; `config.client.connectionRecovery.enabled` toggles it).

```ts
// v10: while the channel is on screen
const release = channel.activate();
// on unmount / when the user leaves the channel
release();
```

There is no `channel.deactivate()`: `activate()` returns its release function. Do not also reload active channels on `connection.recovered` (it fires after the SDK reloaded them). With `connectionRecovery.enabled: false`, `connection.recovered` is not dispatched on reconnects; a custom recovery should watch `client.wsConnection.state` instead. Ref: channel-activate-recovery, connection-recovery.

<a id="s10-3-sending-messages-and-reactions"></a>

### 10.3 Sending messages and reactions

`channel.sendMessage(request, requestOptions?)` is HTTP only: no optimistic message, no offline queue. The stateful flow (optimistic insert, failure state, retry, offline replay) is `channel.messageComposer.send()` or `channel.messageOperations`.

```ts
// v9
await channel.sendMessage({ text, attachments }, { skip_push: true });
await channel.sendReaction(messageId, { type: 'love' });
await channel.deleteReaction(messageId, 'love');
```

```ts
// v10: plain requests
await channel.sendMessage({ message: { text, attachments }, skip_push: true });
await channel.sendReaction({ id: messageId }, { reaction: { type: 'love' } });
await channel.deleteReaction({ id: messageId, type: 'love' });

// v10: optimistic + offline-aware
await channel.messageOperations.addReaction({ messageId, reaction: { type: 'love' } });
await channel.messageOperations.retry({ localMessage });
```

- `messageOperations.send({ localMessage, message?, options? })`, `update({ localMessage, options? })`, `delete({ localMessage, options: { hard?, delete_for_me? } })`, `retry({ localMessage })`, `addReaction({ messageId, reaction })`, `deleteReaction({ messageId, type })` resolve `void` and reject after marking the message `failed`.
- Per-app request overrides go to `client.config.setConfig('channel', { requestHandlers: { sendMessageRequest, retrySendMessageRequest, updateMessageRequest, deleteMessageRequest } })`.
- `pending`, `pending_message_metadata`, `force_moderation`, `is_pending_message` are not in `SendMessageRequest`.

Ref: channel-send-message, channel-send-reaction, offline-queue-policy.

<a id="s10-4-markread"></a>

### 10.4 `markRead`

The names swapped. v9 `channel.markRead()` went through `client.messageDeliveryReporter` (and dropped the channel's delivery candidate); in v10 that is `channel.markReadViaReporter()`. v10 `channel.markRead(request?, requestOptions?)` is the direct request (v9 `markAsReadRequest`, removed).

```ts
// v9
await channel.markRead();
await channel.markAsReadRequest({ message_id });
```

```ts
// v10
await channel.markReadViaReporter();
if (channel.readEventsEnabled) await channel.markRead({ message_id });
```

- `channel.markRead()` / `markUnread()` throw "Read events are disabled ..." when `channel.readEventsEnabled` is false (channel type `read_events` off, client `channel.readEvents.enabled` off, or the user lacks the `read-events` capability). v9 resolved `null`: replace `=== null` checks with `try/catch` or check `channel.readEventsEnabled` first.
- `markReadViaReporter()`, `thread.markRead()` and the automatic mark-read send nothing and resolve `null` while read events are off (no throw); with `channel.readEvents.localUnreadCountEnabled` they reset the local count (`markReadLocally()`).
- `markUnread(request?)`: `message_timestamp` is a `Date`. `MarkReadOptions` → `MarkReadRequest`.
- Local unread counting moved from the `isLocalUnreadCountEnabled` client option to `client.config.setConfig('channel', { readEvents: { localUnreadCountEnabled: true } })`.

Ref: channel-mark-read, channel-read-events-throw, channel-mark-read-locally, delivery-reporter-mark-read, throttled-mark-read, channel-last-read.

<a id="s10-5-other-channel-methods"></a>

### 10.5 Other channel methods

| v9                                                                        | v10                                                                                                                                                                                    | Ref                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `channel.update(data, msg, opts)`                                         | `channel.update({ data: { custom: { ...channel.data?.custom, name } }, message })` (full update: `data.custom` replaces all custom data) or `channel.updatePartial({ set: { name } })` | channel-update                    |
| `channel._update(payload)`                                                | `channel.update(payload)`                                                                                                                                                              | channel-update                    |
| `channel.addMembers(ids, message, { hide_history })`                      | `channel.addMembers({ members: ids, message, hide_history })`; same shape for `removeMembers`, `inviteMembers`; `addFilterTags({ tags })` / `removeFilterTags({ tags })`               | channel-membership-helpers        |
| `addModerators` / `demoteModerators` / `assignRoles`                      | removed: server-side ([§1.4](#s1-4-server-side-code)); at insert `addMembers({ members: [{ user_id, channel_role: 'channel_moderator' }] })`                                           | channel-membership-helpers        |
| `updateMemberPartial(u, { userId })` / `partialUpdateMember(id, u)`       | `updateMemberPartial({ set, unset })` (own membership only)                                                                                                                            | channel-update-member-partial     |
| `archive()` / `pin()` resolve the member                                  | resolve `{ channel_member }`; take `(_request?, requestOptions?)`                                                                                                                      | channel-archive-pin               |
| `mute({ user_id })` / `muteStatus()` dates `Date`                         | `mute({ expiration? })`; `muteStatus()` dates `TimestampNS`; reactive `channel.state` slice `muteStatus`                                                                               | channel-mute                      |
| `hide(userId, clearHistory)` / `show(userId)`                             | `hide({ clear_history })` / `show()`                                                                                                                                                   | channel-hide-show                 |
| `banUser(id, o)` / `shadowBan(id, o)` / `removeShadowBan(id)`             | `banUser(id, o)` (V2 moderation) / `banUser(id, { ...o, shadow: true })` / `unbanUser(id, { shadow: true })`                                                                           | channel-ban                       |
| `queryMembers(filter, sort, options)`                                     | `queryMembers({ payload: { filter_conditions, sort: [...], ...options } })`; date bounds take `Date`                                                                                   | channel-query-members             |
| `getPinnedMessages(options, sort)`                                        | `getPinnedMessages({ ...options, sort: [...] })`                                                                                                                                       | channel-pinned-messages-by-id     |
| `getMessagesById(ids)`                                                    | unchanged, plus `requestOptions`                                                                                                                                                       | channel-pinned-messages-by-id     |
| `search(query, options)`                                                  | `client.search({ payload: { filter_conditions: { cid: channel.cid }, query, ... } })`                                                                                                  | channel-search-removed            |
| `getReplies(parentId, options)` / `getReactions(id, options)`             | `client.getReplies({ parent_id }, options)` / `client.getReactions({ id }, options)` (raw); thread UIs: [§13](#s13-threads)                                                            | channel-replies-reactions-removed |
| `lastMessage()`                                                           | `channel.messagePaginator.latestMessage ?? undefined`                                                                                                                                  | channel-last-message              |
| `keystroke(parentId, { user_id })` / `stopTyping(...)`                    | `keystroke(parentId?)` / `stopTyping(parentId?)`; gated on `channel.config.typingEvents.enabled`                                                                                       | channel-typing-actions            |
| `sendAction(messageId, formData)`                                         | unchanged, plus `requestOptions`                                                                                                                                                       | channel-typing-actions            |
| `createDraft(message)`                                                    | `createDraft({ message })`                                                                                                                                                             | channel-drafts                    |
| `vote(messageId, pollId, vote)` / `removeVote(messageId, pollId, voteId)` | `vote({ message_id, poll_id }, { vote })` / `removeVote({ message_id, poll_id, vote_id })`                                                                                             | channel-votes                     |
| `sendSharedLocation(location, userId)`                                    | `sendSharedLocation(location)`                                                                                                                                                         | channel-shared-location           |
| `truncate({ user_id, ... })` / `delete()`                                 | `truncate({ hard_delete?, truncated_at?: Date, message? })` / `delete({ hard_delete? })` (both throw synchronously on an id-less channel)                                              | channel-delete-truncate           |
| `enableSlowMode(n)` / `disableSlowMode()`                                 | unchanged, plus `requestOptions`                                                                                                                                                       | channel-update                    |
| `channel.disconnected` / `channel._disconnect()`                          | `channel.pendingDisposal` (read-only) / `channel.disconnect()`                                                                                                                         | channel-pending-disposal          |
| `channel.data.x = y` (in place)                                           | `channel.data = { ...channel.data, x: y }` (in-place writes are not published)                                                                                                         | channel-data                      |

Methods on a members-only (id-less) channel throw synchronously or reject with "Channel isn't yet created": create it (`watch()` / `create()`) first. Ref: channel-id-guards, channel-class.

<a id="s10-6-getconfig-and-channelconfig"></a>

### 10.6 `getConfig()` and `ChannelConfig`

```ts
// v9
const uploadsEnabled = channel.getConfig()?.uploads;
const commands = channel.getConfig()?.commands;
```

```ts
// v10
const uploadsEnabled = channel.serverConfig?.uploads;
const commands = channel.config.availableCommands;
const typingOn = channel.config.typingEvents.enabled;
```

`channel.serverConfig` is the server channel-type config (`undefined` until the channel was queried); `client.configs` is gone. The `ChannelConfig` type now means the resolved per-channel instance config (`typingEvents`, `readEvents`, `replies`, `userMessageReminders`, `deliveryEvents`, `availableCommands`, `requestHandlers`); the v9 meaning is `ChannelConfigWithInfo`. Code typed with v9 `ChannelConfig` can still compile and read `undefined`. Ref: channel-config.

<a id="s11-channel-state-and-the-message-list"></a>

## 11. Channel state and the message list

`channel.state` is a `StateStore` (`getLatestValue`, `subscribe`, `subscribeWithSelector`). `members`, `read`, `watchers`, `typing`, `membership` are getter/setter proxies: assigning a new object publishes, in-place mutation does not. `unreadCount` is a read-only getter. Messages are no longer on `channel.state`: they live in `channel.messagePaginator`.

```ts
// v9
const messages = channel.state.messages;
const hasOlder = channel.state.messagePagination.hasPrev;
await channel.query({ messages: { limit: 25, id_lt: messages[0].id } });
```

```ts
// v10
const messages = channel.messagePaginator.items ?? [];
const { hasMoreTail } = channel.messagePaginator.state.getLatestValue();
if (hasMoreTail) await channel.messagePaginator.toTail();

const unsubscribe = channel.messagePaginator.state.subscribeWithSelector(
  ({ items }) => ({ items }),
  ({ items }) => render(items ?? []),
);
```

| v9 `channel.state`                              | v10                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `messages`                                      | `channel.messagePaginator.items` (the shown window; `undefined` = not loaded)                     |
| `latestMessages`                                | `messagePaginator.anchoredHeadItems`                                                              |
| `messagePagination.hasPrev` / `hasNext`         | `messagePaginator.state` `hasMoreTail` (older) / `hasMoreHead` (newer)                            |
| `last_message_at`                               | `messagePaginator.latestMessageAt`                                                                |
| `addMessageSorted(m)` / `addMessagesSorted(ms)` | `messagePaginator.ingestItem(m)`                                                                  |
| `removeMessage({ id })`                         | `messagePaginator.removeItem({ id })`                                                             |
| `findMessage(id)`                               | `messagePaginator.getItem(id)`                                                                    |
| `loadMessageIntoState(id)`                      | `messagePaginator.jumpToMessage(id)`; `jumpToTheLatestMessage()`; `jumpToTheFirstUnreadMessage()` |
| `clearMessages()` / `initMessages()`            | `messagePaginator.clearStateAndCache()`                                                           |
| `pinnedMessages`                                | `channel.pinnedMessagesPaginator.items`                                                           |
| `threads[parentId]`                             | `client.threads.get(parentId)?.messagePaginator.items`                                            |
| `setIsUpToDate(false)` / `isUpToDate`           | removed: `messagePaginator.isActiveIntervalAtHead`, `messagePaginator.setViewingLive(true)`       |
| `unreadCount = n`                               | read-only; `markRead` / `markReadLocally`                                                         |
| `read[uid] = row`                               | `channel.state.read = { ...channel.state.read, [uid]: row }`                                      |

A new message always lands in the newest window; `items` may be an older window after a jump. Read the newest messages from `anchoredHeadItems` or `latestMessage`. Ref: channel-state-store, message-paginator, pinned-messages-paginator, channel-state-threads, is-up-to-date, channel-last-message, channel-event-handling.

<a id="s12-channel-lists-activechannels-and-channelmanager"></a>

## 12. Channel lists, `activeChannels` and `ChannelManager`

`client.activeChannels` and `client.configs` are gone. The client owns one channel store, `client.channelManager` (`get(cid)`, `values()`, `ensure({ type, id, data })`, `releaseUnusedChannels()`).

```ts
// v9
const channel = client.activeChannels[cid];
const totalUnread = Object.values(client.activeChannels).reduce(
  (sum, c) => sum + c.countUnread(),
  0,
);
```

```ts
// v10
const channel = client.channelManager.get(cid);
const totalUnread = client.channelManager
  .values()
  .reduce((sum, c) => sum + c.countUnread(), 0);
```

`ChannelManager` was rewritten: one per client, holding any number of `ChannelPaginator` lists. `client.createChannelManager(...)`, `new ChannelManager({ client, options, eventHandlerOverrides })`, `manager.queryChannels`, `loadNext`, `setChannels` and `ChannelManagerOptions` (`lockChannelOrder`, `abortInFlightQuery`, ...) are gone.

```ts
// v9
const manager = client.createChannelManager({ options: { lockChannelOrder: true } });
manager.registerSubscriptions();
await manager.queryChannels(
  { members: { $in: [userId] } },
  { last_message_at: -1 },
  { limit: 20 },
);
const channels = manager.state.getLatestValue().channels;
```

```ts
// v10
import { ChannelPaginator } from 'stream-chat';

const paginator = new ChannelPaginator({
  client,
  id: 'main',
  filters: { members: { $in: [userId] } },
  sort: [{ field: 'last_message_at', direction: -1 }],
  paginatorOptions: { pageSize: 20, lockItemOrder: true },
});
client.channelManager.insertPaginator({ paginator });
const unsubscribe = client.channelManager.registerSubscriptions();
await paginator.toTail();
const channels = paginator.items ?? [];
// load more: await paginator.toTail(); refresh: await paginator.reload();
// unmount: unsubscribe(); client.channelManager.removePaginator(paginator);
```

| v9                                             | v10                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `manager.state` `channels`                     | `paginator.state` `items` (`undefined` = never queried)                                                          |
| `initialized`                                  | `paginator.items !== undefined`                                                                                  |
| `pagination.hasNext` / `isLoading`             | `paginator.state` `hasMoreTail` / `isLoading`                                                                    |
| `error`                                        | `paginator.state` `lastQueryError` (raw error, set once retries run out)                                         |
| `setChannels(v)`                               | `paginator.setItems({ valueOrFactory: v })`                                                                      |
| `setQueryChannelsRequest(fn)`                  | `paginatorOptions.doRequest`                                                                                     |
| `eventHandlerOverrides: { newMessageHandler }` | `client.channelManager.setEventHandlers({ eventType: 'message.new', handlers: [...] })` / `addEventHandler(...)` |
| `promoteChannel(...)`                          | position follows the sort; `paginator.boost(cid, { ttlMs })`                                                     |

- Lists order by sort only (no promote-to-top on `message.new`): declare pinned / recency order in `sort`.
- Every routed event runs the full filter client-side, so channels can leave lists; teach a list a filter key with `paginator.addFilterResolvers(...)`.
- `registerSubscriptions()` is ref-counted and returns its unsubscribe: pair every call.
- `client.disconnectUser()` resets every list (`items: undefined`) and disposes every stored channel: drop channel references the app holds, re-query lists after the next `connectUser()`.
- `ChannelBatchUpdater` / `client.channelBatchUpdater()` are gone (server-side: [§1.4](#s1-4-server-side-code)).

Ref: active-channels, channel-manager, channel-manager-list-methods, channel-manager-options, channel-manager-event-handlers, channel-manager-register-subscriptions, channel-list-ordering, channel-list-event-routing, promote-channel, channel-list-errors, channel-batch-updater, disconnect-user-teardown, client-channel.

<a id="s13-threads"></a>

## 13. Threads

- Open a thread with `client.threads.ensure({ channel, parentMessage })` (never `new Thread(...)`); fetched threads come from `client.getThreadAndHydrate({ message_id })` / `client.queryThreadsAndHydrate()`. Threads receive events only while `client.threads` holds them and `client.threads.registerSubscriptions()` is active.
- Replies moved to `thread.messagePaginator`: `state.replies` → `thread.messagePaginator.items ?? []`; `loadPrevPage()` → `toTail()`; `loadNextPage()` → `toHead()`; `pagination.prevCursor !== null` → `hasMoreTail`.
- `thread.activate()` returns its release function; `thread.deactivate()` is gone.
- The thread list moved to `client.threads.paginator` (`items`, `isLoading`, `hasMoreTail`, `lastQueryError`; `toTail()` loads more); `threadsById[id]` → `client.threads.get(id)`; `state.ready` → `paginator.items !== undefined`.
- `thread.markAsRead()` → `thread.markRead()` (resolves `null` when nothing was sent).
- `client.preventThreadCleanup` has no effect; delete the assignment.

```ts
// v9
const thread = client.threads.threadsById[parentId] ?? new Thread({ client, threadData });
thread.activate();
await thread.loadPrevPage();
thread.deactivate();
```

```ts
// v10
const thread = client.threads.ensure({ channel, parentMessage });
const release = thread.activate();
await thread.messagePaginator.toTail();
release();
```

Ref: thread-replies, thread-activate, thread-event-routing, thread-construction, thread-manager-list, thread-mark-read, thread-state-derivation, thread-manager-behaviour, prevent-thread-cleanup.

<a id="s14-types-renamed-removed-or-changed-meaning"></a>

## 14. Types: renamed, removed, or changed meaning

Types are generated from the OpenAPI spec; about 380 v9 type names were renamed or removed. For a type error on a `stream-chat` import, look the name up in the reference's full rename table (anchor `type-rename-table`), which gives the v10 name or the derived type to write. The common ones are in the [Quick reference](#quick-reference).

These names **still exist and compile** but mean something else (fix every import of them):

| Name                                  | v10 meaning                                                  | Use instead                                    |
| ------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| `Role`                                | generated role object                                        | `string` for role names                        |
| `User`                                | unrelated generated `{ id, data? }`                          | `ClientUser` (connect input) or `UserResponse` |
| `Reaction`                            | an activity reaction                                         | `ReactionRequest` (send) / `ReactionResponse`  |
| `PollResponse` / `PollOptionResponse` | `{ duration, poll }` / `{ duration, poll_option }` envelopes | `PollResponseData` / `PollOptionResponseData`  |
| `MuteResponse`                        | the mute endpoint response                                   | `UserMuteResponse`                             |
| `SharedLocationResponse`              | endpoint response                                            | `SharedLocationResponseData`                   |
| `ThreadResponse`                      | minimal generated thread                                     | `ThreadStateResponse`                          |
| `TypingStartEvent`                    | the `typing.start` payload                                   | `EventPayload<'typing.start'>`                 |
| `UpdateChannelResponse`               | channel update response                                      | (channel-type admin is server-side)            |
| `PendingMessageResponse`              | `{ message?, channel?, user? }`                              | read `message?`                                |
| `ChannelConfig`                       | per-channel instance config                                  | `ChannelConfigWithInfo`                        |
| `Event` / `ConnectionOpen`            | discriminated unions                                         | [§7](#s7-events)                               |
| `VotingVisibility`                    | type-only union                                              | string literals                                |
| `Command`                             | generated, `TimestampNS` dates                               | same name                                      |

Other type-level changes an app commonly hits: response fields that became optional (`res.user_group?.id`, `res.channel?`), `T | null` → `T | undefined` (`membership`, `created_by`, `pinned_by`), `MessageResponse` lost `user_id` / `status` / `moderation_details` (`moderation`), `UserResponse` lost `privacy_settings` / `push_notifications` / `invisible` (own user only), `blocklist` removed from responses, utility types `UR` / `Readable` / `KnownKeys` / `PartializeKeys` / `ArrayOneOrMore` removed, `PushPreferenceInput` / `PushPreferencesResponse` lost `call_level`. Ref: generated-types, same-name-meaning-changes, type-rename-table, user-response-types, message-response-types, message-request, channel-member-types, poll-types, reaction-types, option-types, utility-types.

<a id="s15-composer-uploads-polls-reminders-and-other-managers"></a>

## 15. Composer, polls, reminders and other managers

Apps that drive `channel.messageComposer` directly, or use the polls, reminders, search, live-location, delivery or offline managers, have per-API changes. Apply the rows with Detection hits; each Ref anchor has the full before/after.

| Area                    | Change                                                                                                                                                                                                                                   | Ref                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Composer setup          | `client.config.setSetupFunction('messageComposer', fn)`; config is read-only and deep-frozen (`composer.updateConfig(...)` / `client.config.setConfig('messageComposer', ...)`); server flags restrict it                                | message-composer-setup-function, composer-config-frozen, composer-update-config, composer-server-restrictions |
| Composer defaults       | link previews on by default; command middlewares installed (active-command guard, command-string extraction and both injections); pending-upload sending is `attachments.pendingUploadsEnabled` (middleware removed)                     | link-previews-default, composer-command-middlewares-default, composer-pending-uploads                         |
| Composer output         | `compose()` returns `undefined` instead of `null`, ns timestamps; drafts via `createDraft({ message })`; `legacy_thread` context and `applyCommandValidatorOverride` removed                                                             | composer-compose-output, composer-drafts, composer-legacy-thread, composer-command-validator-override         |
| Composer custom data    | `customDataManager` starts from a draft's / edited message's `custom`; edits keep custom fields the composer did not set                                                                                                                 | composer-custom-data-restore                                                                                  |
| Composer uploads        | upload metadata under `custom`; custom `doUploadRequest` needs `customCdn: true`; default upload throws without a file URL; `uploadAttachment` removed (`uploadFile(attachment)`)                                                        | composer-upload-metadata, composer-upload-gating, composer-default-upload, upload-attachment-removed          |
| Poll composer           | `updateFields({ data, injectedFieldErrors })`; field errors are `PollComposerValidationError` objects; no `user_id`                                                                                                                      | poll-composer-update-fields, poll-composer-errors, poll-composer-user-id                                      |
| Polls                   | `client` poll methods take path objects (`updatePollPartial({ poll_id }, ...)`, `castPollVote({ message_id, poll_id }, { vote })`, `deletePollVote(...)`; `closePoll` / `addPollAnswer` removed); `VotingVisibility.public` → `'public'` | poll-client-methods, poll-methods, voting-visibility                                                          |
| Reminders               | `createReminder({ message_id }, { remind_at: Date })`; `null` `remind_at` gone (omit it)                                                                                                                                                 | reminder-methods, reminder-types                                                                              |
| Live location           | `LiveLocationManager.dispose()` required; locations without `end_at` dropped                                                                                                                                                             | live-location-dispose, live-location-requests                                                                 |
| Cooldown                | `ownLatestMessageDate` → `ownLatestMessageTimestamp`                                                                                                                                                                                     | cooldown-timestamp                                                                                            |
| Search                  | sorts are `SortParamRequest[]`; channel search results are not watched                                                                                                                                                                   | search-source-sort, channel-search-source-unwatched                                                           |
| Paginator subclasses    | `query()` → `fetchQueryResponse()` + `extractQueryPage()` + `getNextQueryShape()`; pages return `tailward` / `headward`                                                                                                                  | paginator-subclass, paginator-state                                                                           |
| Offline DB implementers | `AbstractOfflineDB` contract and pending-task payloads changed                                                                                                                                                                           | offline-db-contract, pending-task-payloads                                                                    |
| Notifications           | `client.notifications` is the manager's config slice; pass a custom manager as `client.notificationManager`                                                                                                                              | notification-manager-config                                                                                   |
| Utilities               | `encodeBase64` / `decodeBase64` → `btoa` / `atob`; `Campaign`, `Segment`, `permissions` module removed                                                                                                                                   | encode-decode-base64, campaign-segment-removed, permissions-removed                                           |

<a id="verification"></a>

## Verification

1. **Typecheck, lint, tests.** Run the scripts the app defines (`package.json#scripts`: typically `tsc --noEmit` / `typecheck`, `lint`, `test`). Compare with the Phase 0 baseline.
2. **Single copy.** `npm ls stream-chat @stream-io/state-store` (or `yarn why` / `pnpm why`): one v10 `stream-chat`, one `@stream-io/state-store`.
3. **Leftover identifiers.** Both greps must return nothing outside comments, changelogs and migration notes. Each hit is an unmigrated v9 call, member, option or type.

```bash
RG=(rg -n --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/build/**' -g '*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,vue,svelte}')

# removed / renamed methods, members, options, events and runtime exports
"${RG[@]}" "\b(queryUserGroups|addDevice|getDevices|removeDevice|setLocalDevice|getUnreadCount|setPushPreferences|partialUpdateUsers?|upsertUsers?|unBlockUser|getSharedLocations|updateLocation|markAllRead|partialUpdateMessage|ephemeralUpdateMessage|partialUpdateThread|enrichURL|hydrateActiveChannels|setAnonymousUser|partialUpdatePoll|closePoll|addPollAnswer|removePollVote|queryChannelsRequest(WithResponse)?|sendFile|sendImage|createToken|verifyWebhook|verifyAndParseWebhook|verifySignature|CheckSignature|parseSqs|parseSns|JWTUserToken|JWTServerToken|_isUsingServerAuth|recoverState|recoverStateOnReconnect|createChannelManager|getChannelById|getChannelByMembers|activeChannels|wsFallback|errorFromResponse|handleResponse|createAbortControllerForNextRequest|markAsReadRequest|partialUpdateMember|addModerators|demoteModerators|assignRoles|shadowBan|removeShadowBan|setIsUpToDate|isUpToDate|addMessageSorted|addMessagesSorted|loadMessageIntoState|messageSets|messagePagination|latestMessages|pinnedMessages|threadsById|loadPrevPage|queryReplies|EVENT_MAP|ErrorFromResponse|isLocalUnreadCountEnabled|enableInsights|wsUrlParams|defaultWSTimeout|promoteChannel|ChannelBatchUpdater|channelBatchUpdater|encodeBase64|decodeBase64|eventHandlerOverrides|lockChannelOrder|setQueryChannelsRequest|preventThreadCleanup)\b|connection\.changed|transport\.changed|\.lastMessage\(\)|\.getConfig\(\)|[cC]hannel\.(deactivate|_disconnect|disconnected)\b|[tT]hread\.deactivate\(|state\.(messages|threads|last_message_at|replies)\b|client\.logger\b|client\.options\b|client\.configs\b|\.loadNextPage\(|VotingVisibility\.|AI_STATE_CHECKING_SOURCES" .

# removed / renamed types imported from stream-chat (rename table in the reference, anchor type-rename-table)
"${RG[@]}" -U "import[^;'\"]*\b(AIImageRule|AITextRule|AITextSeverityRule|AIVideoConfig|AIVideoRule|AddUserGroupMembersOptions|AppSettingsAPIResponse|AutomodDetails|BannedUsersResponse|BlockUserAPIResponse|BlockedUserDetails|CastVoteAPIResponse|ChannelAPIResponse|ChannelConfigAutomodBehavior|ChannelConfigAutomodThresholds|ChannelConfigAutomod|ChannelMemberAPIResponse|ChannelPushPreference|ChannelQueryOptions|CommandResponse|CreatePollData|CreatePollOptionAPIResponse|CreateUserGroupOptions|DeleteChannelAPIResponse|DeliveredMessageConfirmation|ErrorFromResponse|EventTypes|FlagDetails|FormatMessageResponse|FutureChannelBan|FutureChannelBansResponse|GetBlockedUsersAPIResponse|GetMessageAPIResponse|GetMultipleMessagesAPIResponse|GetPollAPIResponse|GetPollOptionAPIResponse|GetReactionsAPIResponse|GetRepliesAPIResponse|GetThreadAPIResponse|GiphyData|LLMSeverityRule|MessageFlagsResponse|MessagePaginationOptions|ModerationActionConfig|ModerationFlag|ModerationResult|MuteChannelAPIResponse|PartialMessageUpdate|PartialThreadUpdate|PartialUpdateChannelAPIResponse|PartialUpdateChannel|PartialUpdateMemberAPIResponse|PartialUpdateMember|PartialUserUpdate|PollAnswer|PollAnswersAPIResponse|PollVote|PollVotesAPIResponse|PrivacySettings|PushPreference|QueryChannelAPIResponse|QueryChannelsAPIResponse|QueryConfigsResponse|QueryReactionsAPIResponse|QueryRemindersOptions|QueryThreadsAPIResponse|QueryThreadsOptions|QueryUserGroupsOptions|QueryUserGroupsResponse|ReactionAPIResponse|ReadResponse|ReminderAPIResponse|ReminderResponseBase|ReminderResponse|RemoveUserGroupMembersOptions|RequestOptions|ReviewQueueResponse|RoleResponse|SearchAPIResponse|SearchRolesAPIResponse|SharedStaticLocationResponse|TranslationLanguages|TruncateChannelAPIResponse|TruncateOptions|UnmuteUserResponse|UpdateChannelAPIResponse|UpdateChannelOptions|UpdateLocationPayload|UpdateUserGroupOptions|UpdateUsersAPIResponse|UserGroupMemberResponse|APIErrorResponse|ActiveLiveLocationsAPIResponse|BaseDeviceFields|BlockList|ChannelData|CreatePollAPIResponse|CreateReminderOptions|DeviceFields|DraftMessagePayload|EventAPIResponse|FlagMessageResponse|FlagUserResponse|GetUnreadCountAPIResponse|LiveLocationPayload|LocalMessageBase|MarkChannelsReadOptions|MarkDeliveredOptions|MarkReadOptions|MarkUnreadOptions|MessageBase|MessageResponseBase|ModerationConfigResponse|ModerationConfig|ModerationDetailsResponse|ModerationMuteOptions|MuteUserOptions|MuteUserResponse|NewMemberPayload|PaginationOptions|PollData|PollOptionData|PollOption|PollVoteData|QueryFutureChannelBansOptions|ReviewQueueItem|SendFileAPIResponse|StaticLocationPayload|StreamChatOptions|SubmitActionOptions|UpdatePollAPIResponse|UpdatePollOptionAPIResponse|UpdateReminderOptions|UpdatedMessage|UsersAPIResponse|BannedUsersFilterOptions|BannedUsersFilters|BannedUsersPaginationOptions|ChannelConfigFields|ChannelMemberUpdates|DeleteUserGroupOptions|DraftFilters|GetUserGroupOptions|MessageDeletionStrategy|MessageFlagsFiltersOptions|MessageFlagsFilters|MessageFlagsPaginationOptions|MessageUpdatableFields|Pager|PartialUpdateChannelFields|PollEnrichData|QueryModerationConfigsFilters|QueryReactionsOptions|ReviewQueueFilters|ReviewQueuePaginationOptions|SearchOptions|SearchRolesOptions|SendReactionOptions|SyncOptions|VotesFiltersOptions|AscDesc|BannedUsersSortBase|BannedUsersSort|ChannelSortBase|ChannelSort|DraftSortBase|DraftSort|MemberSort|PinnedMessagesSortBase|PinnedMessagesSort|PollSortBase|PollSort|PredefinedFilterSortParam|PredefinedFilterSort|QueryModerationConfigsSort|QuerySort|ReactionSortBase|ReactionSort|ReminderSort|ReviewQueueSort|SearchMessageSortBase|SearchMessageSort|SortParam|ThreadSortBase|ThreadSort|UserSort|VoteSortBase|VoteSort|APNConfig|AppSettings|AsyncModerationOptions|BatchChannelDataUpdate|BatchUpdateOperation|CampaignData|CampaignFilters|CampaignQueryOptions|CampaignResponse|CampaignSort|CampaignStats|ChannelBatchDataUpdateOptions|CheckPushInput|CheckPushResponse|CheckResponse|CheckSNSResponse|CheckSQSResponse|CreateChannelOptions|CreateChannelResponse|CreateCommandOptions|CreateCommandResponse|CreateImportOptions|CreateImportResponse|CreateImportURLResponse|CreatePredefinedFilterOptions|CreateRoleAPIResponse|CustomCheckFlag|CustomCheckResponse|CustomPermissionOptions|DailyValue|DeactivateUsersOptions|DeleteCampaignOptions|DeleteCommandResponse|DeleteRetentionPolicyResponse|DeleteType|DeleteUserOptions|EndpointName|EventHook|ExportChannelOptions|ExportChannelRequest|ExportChannelResponse|ExportChannelStatusResponse|ExportUsersRequest|ExportUsersResponse|FirebaseConfig|FlagReport|FlagReportsFiltersOptions|FlagReportsFilters|FlagReportsPaginationOptions|FlagReportsResponse|FlagsFiltersOptions|FlagsFilters|FlagsPaginationOptions|FlagsResponse|GetCampaignOptions|GetChannelTypeResponse|GetCommandResponse|GetHookEventsResponse|GetImportResponse|GetRateLimitsResponse|GetRetentionPolicyResponse|GetRetentionPolicyRunsOptions|GetRetentionPolicyRunsResponse|GetUnreadCountBatchAPIResponse|GetUserModerationReportOptions|GetUserModerationReportResponse|HookEvent|HookType|HuaweiConfig|ImportTaskHistory|ImportTask|ListChannelResponse|ListChannelTypesAPIResponse|ListCommandsResponse|ListImportsPaginationOptions|ListImportsResponse|ListPredefinedFiltersOptions|ListPredefinedFiltersResponse|ListRolesAPIResponse|MessageHistoryEntry|MessageSet|MetricStats|ModerationRuleRequest|ModerationRule|PermissionAPIObject|PermissionAPIResponse|PermissionObject|PermissionsAPIResponse|PolicyRequest|Policy|PredefinedFilterOperation|PredefinedFilterResponse|PredefinedFilter|PromoteChannelParams|PushProviderAPN|PushProviderCommon|PushProviderConfig|PushProviderFirebase|PushProviderHuawei|PushProviderID|PushProviderListResponse|PushProviderUpsertResponse|PushProviderXiaomi|QueryMessageHistoryFilters|QueryMessageHistoryOptions|QueryMessageHistoryResponse|QueryMessageHistorySortBase|QueryMessageHistorySort|QueryModerationRulesFilters|QueryModerationRulesResponse|QueryModerationRulesSort|QuerySegmentTargetsFilter|QuerySegmentTargetsOptions|QuerySegmentsOptions|QueryTeamUsageStatsOptions|QueryTeamUsageStatsResponse|RateLimitsInfo|RateLimitsMap|ReactivateUserOptions|ReactivateUsersOptions|Resource|RetentionPolicyConfig|RetentionPolicy|RetentionRunResponse|RetentionRunStats|ReviewFlagReportOptions|ReviewFlagReportResponse|SegmentData|SegmentQueryOptions|SegmentResponse|SegmentTargetsResponse|SegmentType|SetRetentionPolicyResponse|TaskStatus|TeamUsageStats|TestPushDataInput|TestSNSDataInput|TestSQSDataInput|TranslateResponse|UpdateChannelTypeRequest|UpdateChannelTypeResponse|UpdateChannelsBatchFilters|UpdateChannelsBatchOptions|UpdateChannelsBatchResponse|UpdateCommandOptions|UpdateCommandResponse|UpdatePredefinedFilterOptions|UpdateSegmentData|UpsertModerationRuleResponse|UserCustomEvent|XiaomiConfig|AnonUserType|ArrayOneOrMore|ArrayTwoOrMore|CallLevelPushPreference|ChannelRole|ChatLevelPushPreference|CommandVariants|ConnectionChangeEvent|ContainsOperator|CreatedAtUpdatedAt|DeleteMessagesOptions|EVENT_MAP|GetMessageOptions|InviteStatus|KnownKeys|LiteralStringForUnion|ModV2ReviewStatus|ModerationActionType|ModerationHarmResponse|ModerationSeverity|PartialPollOptionUpdate|PartializeKeys|PollPaginationOptions|PrimitiveFilter|Product|PushNotificationSettings|PushPreferenceLevel|QueryFilter|QueryPollsParams|Readable|ReservedUpdatedMessageFields|TaskResponse|TeamsRole|TranslatedField|UR|UnknownType|Unpacked)\b[^;'\"]*from ['\"]stream-chat['\"]" .
```

`client.threads.deactivate()` (the thread manager) and search sources' `deactivate()` still exist; `client.queryChannels` still exists as the raw request, so review its hits by hand ([§9.2](#s9-2-querychannels)).

4. **Server-side leftovers.** The §1.4 Detection pattern returns no hit in code that imports `stream-chat`.
5. **Runtime smoke checklist** (run the app; report the ones you could not run):
   - connect a user; no "unknown key" config warnings; the expected log level in the console;
   - the channel list loads, orders as before (pinned / recency), loads more on scroll, updates on a new message;
   - open a channel: messages render, older messages load, sending shows the message at once and survives a failed request (retry);
   - custom fields (channel name / image, message custom data, attachment size / mime type) render;
   - dates render correctly (not 1970, not "Invalid Date");
   - reactions, edits, deletes, read state / unread counts update;
   - drop the network and reconnect: the open channel catches up; offline banner shows and hides;
   - open a thread: replies load and update live;
   - log out and in as another user: lists and channels belong to the new user;
   - uploads (image and file) succeed with progress.

<a id="index-of-breaking-changes"></a>

## Index of breaking changes

Every anchor of the reference (`https://github.com/GetStream/stream-chat-js/blob/release-v10/ai-docs/v10-breaking-changes.md#<anchor>`) and where this guide covers it. "Reference only" entries are niche (internal members, subclass contracts, SDK-implementer APIs); search the reference when Detection or a compile error points at them.

| Guide section                                                                                                    | Reference anchors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Quick reference](#quick-reference)                                                                              | at-a-glance, composer-commands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [Breaks that compile](#breaks-that-compile)                                                                      | behaviour-index                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [1. Install, runtime and packaging](#s1-install-runtime-and-packaging)                                           | installation-runtime-packaging                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [1.1 Node and package manager](#s1-1-node-and-package-manager)                                                   | node-engine, removed-dependencies, browser-field, typescript-requirements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [1.2 WebSocket on Node](#s1-2-websocket-on-node)                                                                 | websocket-on-node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [1.3 `StateStore` moved to `@stream-io/state-store`](#s1-3-statestore-moved-to-stream-iostate-store)             | state-store-package, state-store-identity, state-store-semantics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [1.4 Server-side code](#s1-4-server-side-code)                                                                   | server-side-auth-removed, revoke-tokens, server-only-methods-removed, webhook-helpers-removed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [2. Client construction and configuration](#s2-client-construction-and-configuration)                            | client-construction, streamchat-constructor, streamchat-options, option-mirror-properties, axios-instance, client-getters, message-composer-setup-function, persist-user-on-connection-failure, token-manager, dev-token-encoding, insights-removed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [3. Logging](#s3-logging)                                                                                        | logging, log-chat-promise-execution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [4. Custom data](#s4-custom-data)                                                                                | data-model, custom-data, custom-data-augmentation, attachment-metadata-custom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [5. Timestamps](#s5-timestamps)                                                                                  | timestamp-ns, date-constructor-guard, request-dates, state-timestamps, format-message                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [6. Sort and filters](#s6-sort-and-filters)                                                                      | filter-types, sort-shape, search-source-sort                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [7. Events](#s7-events)                                                                                          | connection, ws-connection, long-poll-fallback, websocket-impl-network-status, event-union, event-type-names, connection-changed-removed, custom-events, event-handler-generic, connection-open, ai-state, channel-send-event, channel-listeners                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [8. Errors](#s8-errors)                                                                                          | stream-api-error, automatic-retries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [9. `StreamChat` methods](#s9-streamchat-methods)                                                                | streamchat-methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [9.1 Request-object signatures](#s9-1-request-object-signatures)                                                 | generated-client-signatures, pin-unpin-message, raw-http-helpers, rest-routes, client-channel, client-user-listeners-mutes, client-moderation-methods, ws-handshake, moderation, moderation-methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [9.2 `queryChannels`](#s9-2-querychannels)                                                                       | query-channels-raw, query-channels-response-with-channels, query-channels-hydration, skip-initialization-removed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [9.3 Raw calls and `*AndHydrate`](#s9-3-raw-calls-and-andhydrate)                                                | threads-reactions-hydrate, update-delete-message-raw                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [9.4 Renamed `StreamChat` methods](#s9-4-renamed-streamchat-methods)                                             | renamed-client-methods                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [9.5 Uploads](#s9-5-uploads)                                                                                     | client-uploads, channel-uploads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [10. `Channel`](#s10-channel)                                                                                    | channel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [10.1 `watch()` and the connection id](#s10-1-watch-and-the-connection-id)                                       | watch-waits-for-connection-id, connection-id-lifecycle, channel-initialized, channel-watch, channel-watch-returns-channel, channel-query                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [10.2 `activate()` for reconnect recovery](#s10-2-activate-for-reconnect-recovery)                               | connection-recovery, channel-activate-recovery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [10.3 Sending messages and reactions](#s10-3-sending-messages-and-reactions)                                     | message-operations, channel-send-message, channel-send-reaction, offline-queue-policy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [10.4 `markRead`](#s10-4-markread)                                                                               | channel-mark-read, channel-read-events-throw, channel-mark-read-locally, channel-last-read, delivery-reporter-mark-read, throttled-mark-read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [10.5 Other channel methods](#s10-5-other-channel-methods)                                                       | channel-class, channel-data, channel-pending-disposal, channel-id-guards, channel-search-removed, channel-replies-reactions-removed, channel-last-message, channel-pinned-messages-by-id, channel-shared-location, channel-typing-actions, channel-drafts, channel-votes, channel-update, channel-delete-truncate, channel-membership-helpers, channel-update-member-partial, channel-archive-pin, channel-mute, channel-hide-show, channel-ban, channel-query-members                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [10.6 `getConfig()` and `ChannelConfig`](#s10-6-getconfig-and-channelconfig)                                     | channel-config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [11. Channel state and the message list](#s11-channel-state-and-the-message-list)                                | channel-event-handling, channel-state, channel-state-store, message-paginator, pinned-messages-paginator, channel-state-threads, is-up-to-date                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [12. Channel lists, `activeChannels` and `ChannelManager`](#s12-channel-lists-activechannels-and-channelmanager) | disconnect-user-teardown, channel-manager-section, active-channels, channel-manager, channel-manager-list-methods, channel-manager-options, channel-manager-event-handlers, channel-manager-register-subscriptions, channel-list-ordering, channel-list-event-routing, promote-channel, channel-list-errors, channel-batch-updater                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [13. Threads](#s13-threads)                                                                                      | prevent-thread-cleanup, threads, thread-replies, thread-activate, thread-event-routing, thread-construction, thread-state-derivation, thread-mark-read, thread-manager-list, thread-manager-behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [14. Types: renamed, removed, or changed meaning](#s14-types-renamed-removed-or-changed-meaning)                 | generated-types, user-response-types, message-response-types, message-request, channel-member-types, poll-types, reaction-types, option-types, same-name-meaning-changes, utility-types, type-rename-table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [15. Composer, polls, reminders and other managers](#s15-composer-uploads-polls-reminders-and-other-managers)    | polls, poll-client-methods, poll-methods, voting-visibility, reminders-delivery, reminder-methods, reminder-types, live-location-dispose, live-location-requests, cooldown-timestamp, search, channel-search-source-unwatched, pagination, paginator-state, paginator-subclass, notifications, notification-manager-config, offline-support, offline-db-contract, pending-task-payloads, message-composer, composer-pending-uploads, composer-legacy-thread, composer-server-restrictions, composer-config-frozen, composer-update-config, composer-command-validator-override, composer-compose-output, composer-drafts, composer-custom-data-restore, link-previews-default, composer-upload-metadata, composer-upload-gating, composer-default-upload, upload-attachment-removed, poll-composer-user-id, poll-composer-errors, poll-composer-update-fields, utilities, encode-decode-base64, campaign-segment-removed, permissions-removed                                                                                                   |
| Reference only                                                                                                   | client-state, stable-ws-connection, moderation-config-types, user-messages-deleted-hard, thread-hydrate-state, thread-staleness, thread-reload, thread-unregister, poll-state, poll-helpers, poll-manager, poll-reminder-cache, reminder-event, reminder-config-state, reminder-paginator, cooldown-subscriptions, announce-delivery-options, message-receipts-tracker, search-controller-internal-state, search-controller-config, message-search-source-hydration, paginator-navigation, paginator-config, paginator-items, user-group-paginator, extended-query-filter, pagination-deep-imports, moderation-removed-methods, moderation-flag, moderation-entity-types, offline-sync-manager, offline-channel-guard, offline-update-fold, composer-config-types, composer-last-change, composer-middleware-state, composer-retyped-members, composer-class-members, composer-attachment-types, is-shared-location-response, location-composer, mentions-search-source, local-message-to-new-message-payload, internal-surface, open-questions |
