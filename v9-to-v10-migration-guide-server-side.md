# v9 → v10 Migration Guide — Server-Side Integrations

> **Scope:** this guide is for backend / server-side integrations that constructed `stream-chat` v9 with an API `secret`. **v10 of `stream-chat` has no server-side surface** — the constructor no longer accepts a secret, all admin endpoints are gone, and the JWT-signing / webhook / SNS / SQS helpers were dropped from `signing.ts` along with the runtime deps (`jsonwebtoken`, `ws`, `isomorphic-ws`, `base64-js`, `form-data`) that backed them. Move to [`@stream-io/node-sdk`](https://github.com/GetStream/stream-node) instead.
>
> If you were using `stream-chat` on the client (React / RN / browser, no secret), you are on the wrong guide — see [`v9-to-v10-migration-guide-client-construction.md`](./v9-to-v10-migration-guide-client-construction.md) and the other four sibling guides.

## TL;DR

- v10 removes every server-side API. Migrate backend code to **`@stream-io/node-sdk`**.
- Install: `yarn add @stream-io/node-sdk` (Node.js ≥ 18, Bun ≥ 1). Full API reference: <https://getstream.io/video/docs/api/>.
- Instantiation keeps the v9 shape you already know: `new StreamClient(apiKey, secret, options?)`. The `secret` is now on the _node_ client, not on `stream-chat`.
- Namespaces on the client: `client` (common), `client.chat`, `client.video`, `client.moderation`, `client.feeds`. Per-resource instances via `client.chat.channel(type, id)` and `client.video.call(type, id)`.
- Token helpers moved 1:1 with new names — `createToken` → `generateUserToken`, `createCallToken` → `generateCallToken`, plus a new `generatePermanentUserToken`. The old names still exist as deprecated aliases.
- Webhook helpers keep their v9 names on the node client — `verifyWebhook`, `verifyAndParseWebhook`, `parseSqs`, `parseSns` — and the secret is pulled from the `StreamClient` you constructed (no per-call secret argument). The same helpers were also stripped out of `stream-chat/signing`: if you were still calling `import { verifyAndParseWebhook } from 'stream-chat'` under v10-rc, that import disappears in the upcoming release — route it through `@stream-io/node-sdk`.
- If your backend also listens to WebSocket events, keep `stream-chat@10` alongside `@stream-io/node-sdk` — see [Two-client hybrid pattern](#two-client-hybrid-pattern). `stream-chat` no longer bundles a WebSocket polyfill: on Node 22+ this Just Works via the platform's global `WebSocket`; on Node 18/20 you inject one via the new [`WebSocketImpl`](#running-the-ws-client-under-node) option.

## Are you actually server-side?

Any one of these means yes — this guide applies to you:

- You construct `stream-chat` with a non-empty second positional argument: `new StreamChat(key, 'secret', ...)` — including via env vars like `process.env.STREAM_SECRET` / `STREAM_API_SECRET`.
- You read `client.secret` or call `client._isUsingServerAuth()`.
- You pass `allowServerSideConnect: true` in `StreamChatOptions`.
- You call any admin method: `createToken`, `devToken`, `revokeUserToken(s)`, `updateAppSettings`, `getAppSettings`, `deleteUser`, `partialUpdateUser(s)`, `restoreUsers`, `deactivateUser(s)`, `reactivateUser(s)`, `exportUser(s)`, `createChannelType`, `updateChannelType`, `deleteChannelType`, `listChannelTypes`, `getChannelType`, `createCommand` / `updateCommand` / `deleteCommand` / `listCommands` / `getCommand`, `createRole` / `deleteRole` / `listRoles`, `createPermission` / `updatePermission` / `deletePermission` / `getPermission` / `listPermissions`, `createBlockList` / `updateBlockList` / `deleteBlockList` / `getBlockList` / `listBlockLists` / `importBlockList`, `upsertPushProvider` / `deletePushProvider` / `listPushProviders`, `checkPush` / `checkSNS` / `checkSQS`, `createImport` / `createImportURL` / `getImport` / `listImports`, retention-policy admin (`setRetentionPolicy` / `deleteRetentionPolicy` / `getRetentionPolicy` / `getRetentionPolicyRuns`), moderation config admin, campaign / segment methods.
- You call `verifyWebhook`, `verifyAndParseWebhook`, `parseSqs`, `parseSns`, `verifySignature`, or `CheckSignature` — the JWT helpers `JWTUserToken` / `JWTServerToken` / `DevToken` — these were all removed from `stream-chat/signing`.
- You import from removed barrel paths: `stream-chat/dist/.../campaign`, `.../segment`, `.../channel_batch_updater`, `.../events`, `.../base64`.
- You pass `user_id` overrides to per-user methods (`banUser`, `blockUser`, `muteUser`, `flagMessage`, `flagUser`) — those overrides are gone from `stream-chat@10` because they only made sense server-side.
- Your code runs under Node (Express, Fastify, Lambda, Cloud Run, cron) with a secret and no user-token provider.

If none of these apply, close this guide and pick one of the sibling guides.

## Install & instantiate

```sh
yarn add @stream-io/node-sdk
# or: npm install @stream-io/node-sdk
```

```ts
import { StreamClient } from '@stream-io/node-sdk';

const client = new StreamClient(process.env.STREAM_KEY!, process.env.STREAM_SECRET!, {
  timeout: 5000, // ms; default 3000
  // basePath: 'https://chat.stream-io-api.com',  // override for tests / self-hosted
  // agent: new Agent({ keepAliveTimeout: 30_000 }), // undici Agent (or compatible dispatcher)
});
```

`StreamClientOptions`:

| Field      | Type                            | Notes                                                                                       |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `timeout`  | `number` (ms)                   | Per-request timeout. Default `3000`.                                                        |
| `basePath` | `string`                        | Override for every product. Defaults to `https://{chat,video,feeds}.stream-io-api.com`.     |
| `agent`    | `unknown` (undici `Dispatcher`) | HTTP agent. Typed as `unknown` because `RequestInit['dispatcher']` differs across Node LTS. |

Full generated API reference: <https://getstream.io/video/docs/api/>. Every method that appears on `client`, `client.chat`, `client.video`, `client.moderation`, `client.feeds` is code-generated from the OpenAPI spec — request/response types live in `@stream-io/node-sdk/gen/models`.

## Namespaces at a glance

| Namespace                        | Purpose                                                                                                       | Where it lives                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `client`                         | Users, devices, push providers, blocklists, imports, polls, files, roles/permissions, external storage        | `StreamClient` extends `CommonApi`               |
| `client.chat`                    | Channel-type admin, channels, messages, reactions, threads, drafts, reminders, campaigns, segments, retention | `StreamChatClient` extends `ChatApi`             |
| `client.chat.channel(type, id?)` | Per-channel operations (send, update, truncate, hide/show, member updates, uploads)                           | `StreamChannel` extends `ChannelApi`             |
| `client.moderation`              | Ban, mute, flag, moderation rules, appeals, review queues                                                     | `StreamModerationClient` extends `ModerationApi` |
| `client.video`                   | Calls, recordings, SIP, transcriptions, closed captions                                                       | `StreamVideoClient` extends `VideoApi`           |
| `client.video.call(type, id)`    | Per-call operations                                                                                           | `StreamCall` extends `CallApi`                   |
| `client.feeds`                   | Activity feeds, follows, comments, bookmarks                                                                  | `StreamFeedsClient` extends `FeedsApi`           |

## Method mapping

Only chat / user / moderation surfaces are enumerated here — the guide focuses on migrations from `stream-chat@9`. Video and feeds are in the API reference above.

### Token generation

| v9 (`stream-chat`)                                                                                                                                                     | v10 (`@stream-io/node-sdk`)                                                                                                                   | Notes                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `client.createToken(userId, exp?, iat?)`                                                                                                                               | `client.generateUserToken({ user_id, exp?, iat?, validity_in_seconds? })`                                                                     | Old name kept as deprecated `createToken(userId, exp?, iat?)`.                   |
| `client.createToken(userId)` (no expiry)                                                                                                                               | `client.generatePermanentUserToken({ user_id })`                                                                                              | Explicitly permanent — no `exp` claim.                                           |
| `client.devToken(userId)`                                                                                                                                              | _Not exposed._ Use `generateUserToken` in tests, or sign your own with a hardcoded secret.                                                    | Dev tokens were a v9-only shortcut.                                              |
| `client.createCallToken(userId, cids)`                                                                                                                                 | `client.generateCallToken({ user_id, call_cids, role?, exp?, iat?, validity_in_seconds? })`                                                   | Old name kept as deprecated `createCallToken(userIdOrObject, cids, exp?, iat?)`. |
| `client.revokeUserToken(id, before?)` / `revokeUsersToken(...)`                                                                                                        | Not on node-sdk yet — mint with a fresh `iat` / rotate the app secret.                                                                        |                                                                                  |
| `JWTUserToken(secret, userId, extra?, opts?)` / `JWTServerToken(secret, opts?)` / `DevToken(userId)` (formerly importable from `stream-chat` or `stream-chat/signing`) | _Removed from `stream-chat`._ Use `client.generateUserToken` etc. — the node SDK signs internally with the secret you passed at construction. |                                                                                  |

### Webhook / SNS / SQS

| v9                                                                                   | v10 node-sdk                                                                                                                                       | Notes                                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `client.verifyWebhook(body, signature)`                                              | `client.verifyWebhook(body, signature)`                                                                                                            | Same shape. Secret is taken from the constructed client.                              |
| `client.verifyAndParseWebhook(body, signature)`                                      | `client.verifyAndParseWebhook(body, signature)`                                                                                                    | Gzip-aware; returns the parsed typed event. Throws `InvalidWebhookError` on mismatch. |
| `client.parseSqs(body)`                                                              | `client.parseSqs(body)`                                                                                                                            | Same.                                                                                 |
| `client.parseSns(body)`                                                              | `client.parseSns(body)`                                                                                                                            | Same.                                                                                 |
| `verifySignature(body, sig, secret)` / `CheckSignature` (from `stream-chat/signing`) | _Removed._ Use the client-level helpers above, or call `crypto.createHmac('sha256', secret).update(body).digest('hex')` yourself for the raw path. | The `crypto` fallback matches v10's algorithm — HMAC-SHA256, timing-safe compare.     |

`InvalidWebhookError` is re-exported from `@stream-io/node-sdk` if you want to `instanceof` it in your handler.

### User admin

| v9                                             | v10 node-sdk                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `client.upsertUser(user)`                      | `client.upsertUsers([user])`                                                               |
| `client.upsertUsers([u1, u2])`                 | `client.upsertUsers([u1, u2])` (helper) or `client.updateUsers({ users: { [id]: user } })` |
| `client.updateUser(user)`                      | `client.upsertUsers([user])`                                                               |
| `client.updateUsers([u1, u2])` (v9 bulk shape) | `client.upsertUsers([u1, u2])`                                                             |
| `client.partialUpdateUser(update)`             | `client.updateUsersPartial({ users: [update] })`                                           |
| `client.partialUpdateUsers(updates)`           | `client.updateUsersPartial({ users: updates })`                                            |
| `client.queryUsers(filter, sort?, options?)`   | `client.queryUsers({ filter_conditions, sort?, ...options })`                              |
| `client.deleteUser(id, options?)`              | `client.deleteUsers({ user_ids: [id], ...options })`                                       |
| `client.deleteUsers({ user_ids, ... })`        | `client.deleteUsers({ user_ids, ... })`                                                    |
| `client.restoreUsers(ids)`                     | `client.restoreUsers({ user_ids: ids })`                                                   |
| `client.reactivateUser(id, options?)`          | `client.reactivateUser({ user_id: id, ...options })`                                       |
| `client.reactivateUsers(ids, options?)`        | `client.reactivateUsers({ user_ids: ids, ...options })`                                    |
| `client.deactivateUser(id, options?)`          | `client.deactivateUser({ user_id: id, ...options })`                                       |
| `client.deactivateUsers(ids, options?)`        | `client.deactivateUsers({ user_ids: ids, ...options })`                                    |
| `client.exportUser(id)`                        | `client.exportUser({ user_id: id })`                                                       |
| `client.exportUsers(ids)`                      | `client.exportUsers({ user_ids: ids })`                                                    |
| `client.queryBannedUsers(filter, sort?)`       | `client.queryBannedUsers({ payload: { filter_conditions, sort? } })`                       |
| `client.getBlockedUsers()`                     | `client.getBlockedUsers()`                                                                 |
| `client.blockUser({ blocked_user_id })`        | `client.blockUsers({ blocked_user_id, user_id })`                                          |
| `client.unblockUser({ blocked_user_id })`      | `client.unblockUsers({ blocked_user_id, user_id })`                                        |

### Channel-type / command / role / permission / blocklist admin

| v9                                                                                                            | v10 node-sdk                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `client.createChannelType(data)`                                                                              | `client.chat.createChannelType(data)`                                                                                      |
| `client.getChannelType(name)`                                                                                 | `client.chat.getChannelType({ name })`                                                                                     |
| `client.updateChannelType(name, data)`                                                                        | `client.chat.updateChannelType({ name, ...data })`                                                                         |
| `client.deleteChannelType(name)`                                                                              | `client.chat.deleteChannelType({ name })`                                                                                  |
| `client.listChannelTypes()`                                                                                   | `client.chat.listChannelTypes()`                                                                                           |
| `client.createCommand(cmd)`                                                                                   | `client.chat.createCommand(cmd)`                                                                                           |
| `client.getCommand(name)` / `updateCommand` / `deleteCommand`                                                 | `client.chat.getCommand({ name })` / `updateCommand` / `deleteCommand`                                                     |
| `client.listCommands()`                                                                                       | `client.chat.listCommands()`                                                                                               |
| `client.createRole(name)`                                                                                     | `client.createRole({ name })`                                                                                              |
| `client.deleteRole(name)`                                                                                     | `client.deleteRole({ name })`                                                                                              |
| `client.listRoles()`                                                                                          | `client.listRoles()`                                                                                                       |
| `client.getPermission(id)` / `createPermission` / `updatePermission` / `deletePermission` / `listPermissions` | `client.getPermission({ id })` / _not exposed for mutations — use dashboard or REST directly_ / `client.listPermissions()` |
| `client.createBlockList(data)`                                                                                | `client.createBlockList(data)`                                                                                             |
| `client.getBlockList(name)`                                                                                   | `client.getBlockList({ name })`                                                                                            |
| `client.updateBlockList(name, data)`                                                                          | `client.updateBlockList({ name, ...data })`                                                                                |
| `client.deleteBlockList(name)`                                                                                | `client.deleteBlockList({ name })`                                                                                         |
| `client.listBlockLists()`                                                                                     | `client.listBlockLists()`                                                                                                  |

### App / push / imports / rate limits / usage stats

| v9                                          | v10 node-sdk                                             |
| ------------------------------------------- | -------------------------------------------------------- |
| `client.updateAppSettings(settings)`        | `client.updateApp(settings)`                             |
| `client.getAppSettings()`                   | `client.getApp()`                                        |
| `client.upsertPushProvider(provider)`       | `client.upsertPushProvider({ push_provider: provider })` |
| `client.deletePushProvider({ type, name })` | `client.deletePushProvider({ type, name })`              |
| `client.listPushProviders()`                | `client.listPushProviders()`                             |
| `client.testPushSettings(...)`              | `client.checkPush(...)`                                  |
| `client.testSQSSettings(...)`               | `client.checkSQS(...)`                                   |
| `client.testSNSSettings(...)`               | `client.checkSNS(...)`                                   |
| `client.getRateLimits(options?)`            | `client.getRateLimits(options?)`                         |
| `client._createImportURL(filename)`         | `client.createImportURL({ filename })`                   |
| `client._createImport(url, mode)`           | `client.createImport({ path, mode })`                    |
| `client._getImport(id)`                     | `client.getImport({ id })`                               |
| `client._listImports(options?)`             | `client.listImports(options?)`                           |
| `client.queryTeamUsageStats(request?)`      | `client.chat.queryTeamUsageStats(request?)`              |
| `client.getTask(id)`                        | `client.getTask({ id })`                                 |

### Retention policies

| v9                                       | v10 node-sdk                                  |
| ---------------------------------------- | --------------------------------------------- |
| `client.setRetentionPolicy(request)`     | `client.chat.setRetentionPolicy(request)`     |
| `client.deleteRetentionPolicy(kind)`     | `client.chat.deleteRetentionPolicy({ kind })` |
| `client.getRetentionPolicy(kind)`        | `client.chat.getRetentionPolicy({ kind })`    |
| `client.getRetentionPolicyRuns(request)` | `client.chat.getRetentionPolicyRuns(request)` |

### Channels — client-level operations

| v9                                                 | v10 node-sdk                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `client.queryChannels(filter, sort?, options?)`    | `client.chat.queryChannels({ filter_conditions, sort?, ...options })` |
| `client.deleteChannels(cids, options?)`            | `client.chat.deleteChannels({ cids, ...options })`                    |
| `client.exportChannel(request)` / `exportChannels` | `client.chat.exportChannels(request)`                                 |
| `client.updateChannelsBatch(updates)`              | `client.chat.channelBatchUpdate({ updates })`                         |
| `client.hideChannel(type, id, ...)`                | `client.chat.channel(type, id).hide(request?)`                        |
| `client.markAllRead(user_id)`                      | `client.chat.markChannelsRead({ user_id })`                           |

### Per-channel operations (`client.chat.channel(type, id)`)

| v9                                                                                                         | v10 node-sdk                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `channel.create(created_by_id, members)`                                                                   | `channel.getOrCreate({ data: { created_by_id, members } })`                                                 |
| `channel.watch()`                                                                                          | `channel.getOrCreate({ state: true })` — no watchers server-side.                                           |
| `channel.query(options)`                                                                                   | `channel.get(options)` (works after `getOrCreate` populates `id`)                                           |
| `channel.update(data, updateMessage?, options?)`                                                           | `channel.update({ data, message: updateMessage, ...options })`                                              |
| `channel.updatePartial({ set, unset })`                                                                    | `channel.updateChannelPartial({ set, unset })`                                                              |
| `channel.delete(options?)`                                                                                 | `channel.delete({ hard_delete?: boolean })`                                                                 |
| `channel.truncate(options?)`                                                                               | `channel.truncate(options?)`                                                                                |
| `channel.hide(userId?, options?)`                                                                          | `channel.hide({ user_id, clear_history? })`                                                                 |
| `channel.show(userId?)`                                                                                    | `channel.show({ user_id })`                                                                                 |
| `channel.markRead({ user_id })`                                                                            | `channel.markRead({ user_id })`                                                                             |
| `channel.markUnread({ user_id, message_id })`                                                              | `channel.markUnread({ user_id, message_id })`                                                               |
| `channel.sendMessage(message, options?)`                                                                   | `channel.sendMessage({ message, ...options })`                                                              |
| `channel.getManyMessages(ids)`                                                                             | `channel.getManyMessages({ ids })`                                                                          |
| `channel.sendEvent(event)`                                                                                 | `channel.sendEvent({ event })`                                                                              |
| `channel.sendFile(url, name, contentType, user)`                                                           | `channel.uploadChannelFile({ file, user })`                                                                 |
| `channel.deleteFile(url)`                                                                                  | `channel.deleteChannelFile({ url })`                                                                        |
| `channel.sendImage(url, name, contentType, user)`                                                          | `channel.uploadChannelImage({ file, user })`                                                                |
| `channel.deleteImage(url)`                                                                                 | `channel.deleteChannelImage({ url })`                                                                       |
| `channel.updateMemberPartial(userId, { set, unset })`                                                      | `channel.updateMemberPartial({ user_id, set, unset })`                                                      |
| `channel.queryMembers(filter, sort?, options?)`                                                            | `channel.queryMembers({ payload: { filter_conditions, sort?, ...options } })`                               |
| `channel.addMembers` / `removeMembers` / `inviteMembers` / `acceptInvite` / `rejectInvite` / `assignRoles` | `channel.updateChannelPartial(...)` or the `channel.update({ ... })` add/remove members payload — see docs. |

### Messages, reactions, threads, drafts, reminders

| v9                                                                     | v10 node-sdk                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `client.getMessage(id)`                                                | `client.chat.getMessage({ id })`                                                                               |
| `client.updateMessage(message, userId?, options?)`                     | `client.chat.updateMessage({ id, message, ...options })`                                                       |
| `client.partialUpdateMessage(id, update, userId?, options?)`           | `client.chat.updateMessagePartial({ id, ...update })`                                                          |
| `client.deleteMessage(id, hard?)`                                      | `client.chat.deleteMessage({ id, hard? })`                                                                     |
| `client.undeleteMessage(id, undeleted_by_id)`                          | `client.chat.undeleteMessage({ id, undeleted_by: { id: undeleted_by_id } })`                                   |
| `client.pinMessage(msg, timeout?)` / `unpinMessage(msg)`               | `client.chat.updateMessagePartial({ id, set: { pinned: true, pin_expires: ... } })` / `set: { pinned: false }` |
| `client.translateMessage(id, language)`                                | `client.chat.translateMessage({ id, language })`                                                               |
| `client.commitMessage(id)`                                             | `client.chat.commitMessage({ id })`                                                                            |
| `client.search(filter, query, options?)`                               | `client.chat.search({ payload: { filter_conditions, ...options } })`                                           |
| `client.queryMessageHistory(request)`                                  | `client.chat.queryMessageHistory(request)`                                                                     |
| `client.getReplies(parentId, options?)`                                | `client.chat.getReplies({ parent_id: parentId, ...options })`                                                  |
| `client.queryThreads(request?)`                                        | `client.chat.queryThreads(request?)`                                                                           |
| `client.getThread(id, options?)`                                       | `client.chat.getThread({ message_id: id, ...options })`                                                        |
| `client.updateThread(id, update)`                                      | `client.chat.updateThreadPartial({ message_id: id, ...update })`                                               |
| `client.markThreadRead(request)` / `markThreadUnread`                  | `client.chat.markRead(...)` / `markUnread(...)` with `thread_id`                                               |
| `client.runMessageAction(id, request)`                                 | `client.chat.runMessageAction({ id, ...request })`                                                             |
| `client.ephemeralUpdateMessage(id, update)`                            | `client.chat.ephemeralMessageUpdate({ id, ...update })`                                                        |
| `client.sendReaction(messageId, reaction, userId?)`                    | `client.chat.sendReaction({ message_id: messageId, reaction })`                                                |
| `client.deleteReaction(messageId, type, userId?)`                      | `client.chat.deleteReaction({ message_id: messageId, type })`                                                  |
| `client.getReactions(messageId, options?)`                             | `client.chat.getReactions({ message_id: messageId, ...options })`                                              |
| `client.queryReactions(messageId, filter, sort?, options?)`            | `client.chat.queryReactions({ message_id: messageId, filter_conditions, sort?, ...options })`                  |
| `client.getDraft({ parent_id?, user_id? })`                            | `client.chat.getDraft({ parent_id?, user_id? })` (or `channel.getDraft({...})` for a channel-scoped draft)     |
| `client.deleteDraft({ parent_id?, user_id? })`                         | `client.chat.deleteDraft({ parent_id?, user_id? })`                                                            |
| `client.queryDrafts(request?)`                                         | `client.chat.queryDrafts(request?)`                                                                            |
| `client.createReminder(request)` / `updateReminder` / `deleteReminder` | `client.chat.createReminder(request)` / `updateReminder` / `deleteReminder`                                    |
| `client.queryReminders(request?)`                                      | `client.chat.queryReminders(request?)`                                                                         |

### Moderation

| v9                                                                    | v10 node-sdk                                                                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `client.banUser(targetUserId, { user_id, ... })`                      | `client.moderation.ban({ target_user_id, user_id, ...options })`                                                            |
| `client.unbanUser(targetUserId, { user_id })`                         | `client.moderation.unban({ target_user_id, user_id })`                                                                      |
| `client.shadowBan(targetUserId, { user_id, ... })`                    | `client.moderation.ban({ target_user_id, shadow: true, ...options })`                                                       |
| `client.removeShadowBan(targetUserId)`                                | `client.moderation.unban({ target_user_id })`                                                                               |
| `client.queryBannedUsers(filter, sort?)`                              | `client.queryBannedUsers({ payload: { filter_conditions, sort? } })` — still on the common client.                          |
| `client.muteUser(targetUserId, { user_id, timeout? })`                | `client.moderation.mute({ target_ids: [targetUserId], user_id, timeout? })`                                                 |
| `client.unmuteUser(targetUserId, { user_id })`                        | `client.moderation.unmute({ target_ids: [targetUserId], user_id })`                                                         |
| `client.flagUser(targetUserId, { user_id })`                          | `client.moderation.flag({ entity_type: 'stream:user', entity_id: targetUserId, user_id })`                                  |
| `client.flagMessage(messageId, { user_id })`                          | `client.moderation.flag({ entity_type: 'stream:chat:v1:message', entity_id: messageId, user_id })`                          |
| `client.unflagUser` / `unflagMessage`                                 | Handled via `client.moderation.submitAction({ action_type: 'unflag', ... })` — see moderation docs.                         |
| `client.queryMessageFlags(filter, options?)`                          | `client.chat.queryMessageFlags({ payload: { filter_conditions, ...options } })`                                             |
| `client._queryFlags(filter, options?)`                                | `client.moderation.queryModerationFlags(request)`                                                                           |
| Moderation config admin (`upsertModerationConfig`, `getConfig`, etc.) | `client.moderation.upsertConfig`, `getConfig`, `deleteConfig`, `queryModerationConfigs`                                     |
| Moderation rules                                                      | `client.moderation.upsertModerationRule` / `deleteModerationRule` / `getModerationRule` / `queryModerationRules`            |
| Appeals / review queue                                                | `client.moderation.appeal` / `queryAppeals` / `getAppeal` / `getReviewQueueItem` / `queryReviewQueue` / `bulkActionAppeals` |
| `client.check(request)`                                               | `client.moderation.check(request)`                                                                                          |

### Campaigns & segments

Same names, moved to `client.chat`:

| v9 (`client.<x>`)                                                                                                                                                                                      | v10 (`client.chat.<x>`)                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `createCampaign`, `getCampaign`, `updateCampaign`, `deleteCampaign`, `startCampaign`, `stopCampaign`, `queryCampaigns`                                                                                 | Same names.                                                       |
| `createSegment`, `getSegment`, `updateSegment`, `deleteSegment`, `querySegments`, `addSegmentTargets`, `removeSegmentTargets` (→ `deleteSegmentTargets`), `querySegmentTargets`, `segmentTargetExists` | Same names; note `removeSegmentTargets` → `deleteSegmentTargets`. |

### Devices, polls, files

| v9                                                                                                                         | v10 node-sdk                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `client.addDevice(id, provider, userId?)`                                                                                  | `client.createDevice({ id, push_provider, user_id })`                                              |
| `client.getDevices(userId)`                                                                                                | `client.listDevices({ user_id })`                                                                  |
| `client.removeDevice(id, userId?)`                                                                                         | `client.deleteDevice({ id, user_id })`                                                             |
| `client.createPoll(request)` / `getPoll` / `updatePoll` / `updatePollPartial` / `deletePoll` / `queryPolls`                | `client.createPoll` / `getPoll` / `updatePoll` / `updatePollPartial` / `deletePoll` / `queryPolls` |
| `client.createPollOption` / `deletePollOption` / `updatePollOption` / `castPollVote` / `deletePollVote` / `queryPollVotes` | Same names — some on `client`, `castPollVote` / `deletePollVote` on `client.chat`.                 |
| `client.sendFile(url, file, name, user)`                                                                                   | `client.uploadFile({ file, user: JSON.stringify(user) })` — see [Uploads notes](#uploads-notes).   |
| `client.sendImage(url, file, name, user)`                                                                                  | `client.uploadImage({ file, user: JSON.stringify(user), upload_sizes? })`                          |
| `client.deleteFile(url)` / `deleteImage(url)`                                                                              | `client.deleteFile({ url })` / `client.deleteImage({ url })`                                       |

### Live location

| v9                                  | v10 node-sdk                                       |
| ----------------------------------- | -------------------------------------------------- |
| `client.updateLocation(request)`    | `client.updateLiveLocation(request)`               |
| `client.getSharedLocations(userId)` | `client.getUserLiveLocations({ user_id: userId })` |

### Uploads notes

`client.uploadFile` / `client.uploadImage` on the node SDK expect a `File` (from `buffer`) and stringified metadata — the SDK does the multipart-form encoding for you. The generated types declare the `file` field as `string`, so cast at the call site:

```ts
import { File } from 'buffer';

await client.uploadFile({
  file: new File([buffer], 'name.pdf', { type: 'application/pdf' }),
  user: { id: 'server' }, // JSON.stringify handled internally
});
```

### Removed with no direct replacement

- `client.secret` / `client._isUsingServerAuth()` — construct the client with a secret and check for its presence yourself if you must.
- `client.validateServerSideAuth()` — the node SDK is always server-side.
- Per-call `user_id` overrides on `banUser` / `blockUser` / `flagMessage` / `flagUser` — pass `user_id` in the request payload (all node-sdk mutations that act on behalf of a user take an explicit `user_id`).
- `JWTUserToken` / `JWTServerToken` / `DevToken` / `verifySignature` / `CheckSignature` / `InvalidWebhookError` / `InvalidWebhookErrorMessages` re-exported from `stream-chat` — all gone. `signing.ts` on `stream-chat` now exposes only `UserFromToken` (a client-side JWT decoder). Consume equivalents from `@stream-io/node-sdk`.
- `stream-chat` runtime deps that used to underwrite the server surface — `jsonwebtoken`, `ws`, `isomorphic-ws`, `base64-js`, `form-data` — have been dropped from `package.json#dependencies`. If a build tool still complains that `stream-chat` imports these, upgrade to the release that lands the removal.
- Hand-rolled event bus & `EVENT_MAP` — the node SDK is REST-only.

## Sort payloads

`@stream-io/node-sdk` uses the **same `SortParamRequest[]` shape** v10 `stream-chat` uses:

```ts
// v9
{ sort: { created_at: -1, name: 1 } }

// v10 (both packages)
{ sort: [{ field: 'created_at', direction: -1 }, { field: 'name', direction: 1 }] }
```

See [`v9-to-v10-migration-guide-sort.md`](./v9-to-v10-migration-guide-sort.md) for the deep dive — every point there applies to the node SDK.

## Filter payloads

Filters keep the v9 shape (`{ field: value }` or `{ field: { $op: value } }`) but the operator whitelist is enforced per endpoint at the type level. Rewrite any filter that used deprecated operators — the compiler will tell you which.

## Two-client hybrid pattern

Some integrations need **both** WebSocket event delivery _and_ admin API calls. Examples:

- A bot that replies to `message.new` events.
- A moderation worker that watches `message.flagged` and acts on flags.
- An analytics forwarder that receives realtime events and writes to a warehouse (webhooks are the usual choice, but WS works too).

`stream-chat@10` still delivers events over WebSocket (with `allowServerSideConnect: true`), and `@stream-io/node-sdk` gives you the admin API. Run both, share the app credentials, and mint a bot user token via node-sdk for the WS client.

```ts
import 'dotenv/config';
import { StreamClient } from '@stream-io/node-sdk';
import { StreamChat } from 'stream-chat';

const apiKey = process.env.STREAM_KEY!;
const secret = process.env.STREAM_SECRET!;
const botUserId = 'support-bot';

// 1. Admin client — creates the bot user and mints its WS token.
const admin = new StreamClient(apiKey, secret);

await admin.upsertUsers([{ id: botUserId, role: 'admin', name: 'Support bot' }]);
const botToken = admin.generateUserToken({ user_id: botUserId });

// 2. WS client — signed in as the bot, listens for events.
const ws = new StreamChat(apiKey, { allowServerSideConnect: true });
await ws.connectUser({ id: botUserId }, botToken);

ws.on('message.new', async (evt) => {
  if (!evt.channel_type || !evt.channel_id) return;
  if (evt.user?.id === botUserId) return; // ignore our own echoes

  // 3. Use the ADMIN client for the reply so we don't leak connectUser state.
  await admin.chat.channel(evt.channel_type, evt.channel_id).sendMessage({
    message: {
      text: 'Thanks — a human will be with you shortly.',
      user_id: botUserId,
    },
  });
});
```

Things to know when running both clients:

- **Two independent connections.** The WS client owns its own reconnect / health-check loop; the admin client is stateless HTTP.
- **Two logical views.** The `stream-chat` state store is populated by WS events, not by your admin calls. If you `sendMessage` via admin, expect the WS client to see it back as a `message.new` (that's why the example filters `evt.user?.id === botUserId`).
- **Token rotation.** `generateUserToken` defaults to a 1-hour expiry. For long-lived bots, either regenerate the token before it expires and call `ws.connectUser` again on the same `StreamChat` instance, or mint a permanent token via `generatePermanentUserToken`.
- **`allowServerSideConnect: true` is still supported in v10 `stream-chat`** — this hybrid is the intended use case for it.

## Running the WS client under Node

`stream-chat@10` no longer bundles `isomorphic-ws` or `ws` — the internal `StableWSConnection` picks up the runtime's global `WebSocket` (see `src/connection.ts`). What that means per runtime:

| Runtime             | Do you need to do anything?                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Browser / RN**    | No — global `WebSocket` is native.                                                                         |
| **Node.js 22+**     | No — Node ships a native global `WebSocket` since 22.0.                                                    |
| **Node.js 18 / 20** | Yes — inject a WebSocket implementation via `WebSocketImpl` (see below).                                   |
| **Bun / Deno**      | No — global `WebSocket` is native.                                                                         |
| **Test suites**     | Yes — pass a mock/drivable class via `WebSocketImpl`; see the `connection.test.js` fixtures for the shape. |

### `WebSocketImpl` option

```ts
export type StreamChatOptions = {
  // ...
  /**
   * Overrides the `WebSocket` constructor used by `StableWSConnection`. Intended purely for
   * testing so a mock/drivable WebSocket can be swapped in; production code should leave this
   * unset and rely on the platform's global `WebSocket`.
   */
  WebSocketImpl?: typeof WebSocket;
};
```

Signature is `typeof WebSocket` — the constructor, not an instance. `StableWSConnection` calls `new WS(wsURL)` internally, so anything that satisfies the browser `WebSocket` interface works:

- `.readyState`, `.send(data)`, `.close(code?, reason?)`
- events: `.onopen`, `.onmessage`, `.onclose`, `.onerror`

### Making it work on Node 18 / 20

The Node LTS versions below 22 don't ship a global `WebSocket`. Add the `ws` package and hand its constructor to `stream-chat`:

```ts
import { StreamChat } from 'stream-chat';
import WebSocket from 'ws';

const ws = new StreamChat(apiKey, {
  allowServerSideConnect: true,
  // WebSocketImpl accepts anything that mirrors the browser WebSocket constructor.
  // The `ws` package's default export matches that shape at runtime.
  WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
});
```

The cast is because `ws` types its constructor with a slightly different `MessageEvent` payload than the DOM lib. It's not a runtime concern — `StableWSConnection` only touches `.data`, `.code`, `.reason`, `.error`, all of which line up.

> **Officially, `WebSocketImpl` is documented as "purely for testing."** In practice it is also the escape hatch for Node <22 until the LTS ships a native `WebSocket`. If you rely on it in production, pin the `ws` version (it's stable, but its lifecycle isn't tied to `stream-chat`'s releases) and keep an eye on the SDK changelog in case the option gains stricter typing.

### Simplifying the hybrid example on Node 22+

On Node 22+, the [Two-client hybrid pattern](#two-client-hybrid-pattern) snippet works verbatim — no `WebSocketImpl` needed. Drop the `WebSocketImpl` line when you can rely on the runtime. This is the recommended target: no extra dep, no cast, and no drift when Node itself ships fixes to its WebSocket implementation.

## Verification checklist

Before shipping the migrated backend:

- [ ] `yarn build` / `tsc --noEmit` passes with the new imports.
- [ ] `client.generateUserToken({ user_id: 'demo' })` returns a JWT that `stream-chat`'s `connectUser` accepts against the same API key.
- [ ] `client.verifyAndParseWebhook(rawBody, signature)` round-trips a captured production event.
- [ ] An admin call (`client.chat.queryChannels(...)`, `client.upsertUsers(...)`) succeeds against the dashboard.
- [ ] All uses of `verifyWebhook` / `parseSqs` / `parseSns` / `createToken` / `JWTUserToken` / `DevToken` are imported from `@stream-io/node-sdk`, not `stream-chat`.
- [ ] No remaining imports from `stream-chat/dist/.../campaign`, `.../segment`, `.../channel_batch_updater`, `.../events`, `.../base64`.
- [ ] If you kept a `stream-chat@10` client for WS: it is constructed **without** a secret, and `allowServerSideConnect: true` is set.
- [ ] If you deploy on Node 18/20: `WebSocketImpl` is wired to the `ws` package and `ws` is pinned in `dependencies`. On Node 22+, no `WebSocketImpl` is needed.
- [ ] Bot / worker users are upserted with `role: 'admin'` (or a role that grants the endpoints they need) before their WS token is minted.
