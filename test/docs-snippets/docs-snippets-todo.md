# Docs snippet tests: todo

Pages under `getstream.io/content/docs/` that contain JavaScript snippets. Give each page to an agent with `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/docs-snippets-agent-prompt.md`. **Run pages one at a time**: tests may change app settings (they must restore them).

- **JS / Node / unlabelled**: number of `js` fences labelled `JavaScript` / `Node.js` / with no label.
- **Client test**: the page is in the JavaScript sidebar, so write `test/docs-snippets/client/...`.
- **Server test**: the page is in the Node sidebar, so write `test/docs-snippets/server/...` and Node.js snippets.
- Pages only in the Node sidebar: their `JavaScript` tabs are only seen by server developers (see the agent prompt).

**Blockers** (details below; empty = fully runnable, maybe with setup notes):

- ⛔ **Blocked**: the app doesn't have the feature. The snippet goes in `it.skip('BLOCKED: ...')` (still typechecked).
- 🔗 **Requires webhook to test**: the result is only observable through a webhook/SQS endpoint. The test verifies the stream-chat-js calls only, not delivery.
- 🔑 **Typecheck only until `FIREBASE_CONFIG` is set**: push tests use `describePush` and skip without credentials. Push is never verified end-to-end (nobody checks a notification arrives); the credentials only exist because the API validates them.
- ◐ **Partial**: only some snippets of the page are affected.
- **Excluded**: not validated, leave as is.

Status: `[ ]` todo, `[x]` done, `[~]` done with open questions.

App facts (2026-10-05): push v3 (no providers), permissions v2, multi-tenancy off (can be toggled), campaigns on, no webhook/SQS/SNS. Enabled since (not probed yet): private messaging (restricted visibility) and message history (`queryMessageHistory`). Probed and **working**: pending messages, delivery receipts, translation, review queue, guest users, dynamic partitioning config, multi-tenancy toggle.

## chat/\_default/02-init_and_users

| Status | Page                                                                     | JS  | Node | Unlabelled | Client test | Server test | Blockers |
| ------ | ------------------------------------------------------------------------ | --- | ---- | ---------- | ----------- | ----------- | -------- |
| [x]    | `chat/_default/02-init_and_users/01-client_tokens_and_authentication.md` | 1   | 0    | 0          | yes         | -           |          |
| [x]    | `chat/_default/02-init_and_users/02-init_and_users.md`                   | 5   | 0    | 0          | yes         | -           |          |
| [x]    | `chat/_default/02-init_and_users/04-user_groups.md`                      | 8   | 0    | 0          | yes         | yes         |          |
| [x]    | `chat/_default/02-init_and_users/05-authless_users.md`                   | 2   | 0    | 0          | yes         | -           |          |

## chat/\_default/03-channels

| Status | Page                                                                    | JS  | Node | Unlabelled | Client test | Server test | Blockers          |
| ------ | ----------------------------------------------------------------------- | --- | ---- | ---------- | ----------- | ----------- | ----------------- |
| [x]    | `chat/_default/03-channels/01-creating_channels.md`                     | 3   | 2    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/02-query_channels.md`                        | 11  | 1    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/03-channel_update.md`                        | 2   | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/04-query_members.md`                         | 2   | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/05-channel_pagination.md`                    | 2   | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/06-channel_members.md`                       | 11  | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/08-archiving.md`       | 1   | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/09-pinning.md`         | 1   | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/10-muting.md`          | 3   | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/11-hiding.md`          | 1   | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/12-disabling.md`       | 1   | 0    | 1          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/13-deleting.md`        | 2   | 1    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/14-freezing.md`        | 2   | 1    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/15-truncating.md`      | 2   | 0    | 0          | yes         | yes         |                   |
| [x]    | `chat/_default/03-channels/07-channel_management/16-channel_invites.md` | 6   | 0    | 0          | yes         | yes         |                   |
| [~]    | `chat/_default/03-channels/07-channel_management/17-batch-updates.md`   | 3   | 0    | 0          | -           | yes         | ◐ 🔗 batch events |
| [ ]    | `chat/_default/03-channels/08-get_channel.md`                           | 1   | 0    | 0          | -           | yes         |                   |

## chat/\_default/04-messages

| Status | Page                                                   | JS  | Node | Unlabelled | Client test | Server test | Blockers                     |
| ------ | ------------------------------------------------------ | --- | ---- | ---------- | ----------- | ----------- | ---------------------------- |
| [ ]    | `chat/_default/04-messages/01-send_message.md`         | 9   | 1    | 0          | yes         | yes         |                              |
| [ ]    | `chat/_default/04-messages/02-file_uploads.md`         | 4   | 3    | 0          | yes         | yes         |                              |
| [ ]    | `chat/_default/04-messages/03-threads.md`              | 11  | 0    | 2          | yes         | yes         |                              |
| [ ]    | `chat/_default/04-messages/04-send_reaction.md`        | 5   | 1    | 0          | yes         | yes         |                              |
| [ ]    | `chat/_default/04-messages/05-pinned_messages.md`      | 3   | 0    | 0          | yes         | yes         |                              |
| [ ]    | `chat/_default/04-messages/06-search.md`               | 2   | 0    | 0          | yes         | yes         |                              |
| [ ]    | `chat/_default/04-messages/07-silent_messages.md`      | 2   | 0    | 0          | yes         | yes         |                              |
| [ ]    | `chat/_default/04-messages/08-unread_reminders.md`     | 1   | 0    | 0          | -           | yes         | 🔗 reminder event            |
| [ ]    | `chat/_default/04-messages/09-message_reminders.md`    | 7   | 1    | 0          | yes         | yes         | ◐ 🔗 `reminder_due` delivery |
| [ ]    | `chat/_default/04-messages/10-message_receipts.md`     | 1   | 4    | 0          | yes         | yes         |                              |
| [ ]    | `chat/_default/04-messages/11-ai-message-streaming.md` | 2   | 0    | 0          | -           | yes         |                              |

## chat/\_default/05-features

| Status | Page                                                                     | JS  | Node | Unlabelled | Client test | Server test | Blockers                    |
| ------ | ------------------------------------------------------------------------ | --- | ---- | ---------- | ----------- | ----------- | --------------------------- |
| [ ]    | `chat/_default/05-features/02-events.md`                                 | 7   | 0    | 0          | yes         | yes         | ◐ 🔗 webhook copy of events |
| [ ]    | `chat/_default/05-features/03-unread.md`                                 | 11  | 0    | 0          | yes         | yes         |                             |
| [ ]    | `chat/_default/05-features/04-typing_indicators.md`                      | 2   | 0    | 0          | yes         | -           |                             |
| [ ]    | `chat/_default/05-features/05-presence_format.md`                        | 3   | 1    | 0          | yes         | -           |                             |
| [ ]    | `chat/_default/05-features/06-campaign_api.md`                           | 16  | 0    | 0          | -           | yes         | ◐ 🔗 campaign events        |
| [ ]    | `chat/_default/05-features/07-polls_api.md`                              | 17  | 0    | 0          | yes         | yes         |                             |
| [ ]    | `chat/_default/05-features/08-location_sharing.md`                       | 7   | 0    | 0          | yes         | yes         |                             |
| [ ]    | `chat/_default/05-features/09-translation.md`                            | 4   | 0    | 0          | yes         | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/11-slow_mode_and_throttling.md`   | 2   | 0    | 0          | yes         | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/12-drafts.md`                     | 6   | 0    | 0          | yes         | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/13-private_messaging.md`          | 1   | 0    | 0          | yes         | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/14-user_average_response_time.md` | 1   | 0    | 0          | -           | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/15-pending_messages.md`           | 1   | 5    | 0          | yes         | yes         | ◐ 🔗 pending callback hook  |
| [ ]    | `chat/_default/05-features/10-advanced/16-dynamic_partitioning.md`       | 4   | 0    | 0          | -           | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/17-audit_logs.md`                 | 5   | 0    | 0          | -           | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/18-data_retention_policy.md`      | 4   | 4    | 0          | -           | yes         |                             |

## chat/\_default/06-app_and_channel_settings

| Status | Page                                                                       | JS  | Node | Unlabelled | Client test | Server test | Blockers |
| ------ | -------------------------------------------------------------------------- | --- | ---- | ---------- | ----------- | ----------- | -------- |
| [ ]    | `chat/_default/06-app_and_channel_settings/01-channel_types.md`            | 9   | 0    | 0          | -           | yes         |          |
| [ ]    | `chat/_default/06-app_and_channel_settings/02-app_settings.md`             | 3   | 0    | 0          | -           | yes         |          |
| [ ]    | `chat/_default/06-app_and_channel_settings/03-chat_permission_policies.md` | 11  | 0    | 0          | -           | yes         |          |
| [ ]    | `chat/_default/06-app_and_channel_settings/06-channel-level_settings.md`   | 3   | 0    | 0          | -           | yes         |          |

## chat/\_default/07-push

| Status | Page                                             | JS  | Node | Unlabelled | Client test | Server test | Blockers                                    |
| ------ | ------------------------------------------------ | --- | ---- | ---------- | ----------- | ----------- | ------------------------------------------- |
| [ ]    | `chat/_default/07-push/07-legacy_push_system.md` | 4   | 0    | 0          | -           | yes         | 🔑 typecheck only (push creds + push v1/v2) |

## chat/\_default/08-webhooks

| Status | Page                                                                               | JS  | Node | Unlabelled | Client test | Server test | Blockers             |
| ------ | ---------------------------------------------------------------------------------- | --- | ---- | ---------- | ----------- | ----------- | -------------------- |
| [ ]    | `chat/_default/08-webhooks/01-webhooks_overview/02-before_message_send_webhook.md` | 4   | 0    | 0          | -           | yes         | 🔗 webhook           |
| [ ]    | `chat/_default/08-webhooks/01-webhooks_overview/03-custom_commands_webhook.md`     | 8   | 0    | 0          | -           | yes         | ◐ 🔗 command handler |

## chat/\_default/10-migrating

| Status | Page                                                  | JS  | Node | Unlabelled | Client test | Server test | Blockers |
| ------ | ----------------------------------------------------- | --- | ---- | ---------- | ----------- | ----------- | -------- |
| [ ]    | `chat/_default/10-migrating/03-exporting_channels.md` | 5   | 0    | 0          | -           | yes         |          |

## chat/\_default/12-best_practices

| Status | Page                                                               | JS  | Node | Unlabelled | Client test | Server test | Blockers            |
| ------ | ------------------------------------------------------------------ | --- | ---- | ---------- | ----------- | ----------- | ------------------- |
| [ ]    | `chat/_default/12-best_practices/02-moderation.md`                 | 16  | 8    | 1          | yes         | yes         |                     |
| [ ]    | `chat/_default/12-best_practices/05-marketplace_best_practices.md` | 0   | 0    | 5          | -           | yes         | ◐ 🔗 reminder event |

## chat/javascript

| Status | Page                                                             | JS  | Node | Unlabelled | Client test | Server test | Blockers |
| ------ | ---------------------------------------------------------------- | --- | ---- | ---------- | ----------- | ----------- | -------- |
| [ ]    | `chat/javascript/01-quick_start/01-plain_js_introduction.md`     | 4   | 0    | 0          | yes         | -           |          |
| —      | ~~`chat/javascript/11-debugging_and_cli/10-upgrading_to_v9.md`~~ | 0   | 0    | 8          | yes         | -           | Excluded |

## chat/node

| Status | Page                                                | JS  | Node | Unlabelled | Client test | Server test | Blockers |
| ------ | --------------------------------------------------- | --- | ---- | ---------- | ----------- | ----------- | -------- |
| [ ]    | `chat/node/01-quick_start/01-backend_quickstart.md` | 0   | 5    | 0          | -           | yes         |          |

## Blockers detail

### `chat/_default/07-push/07-legacy_push_system.md` (🔑 Typecheck only)

- **Affected**: All provider/config snippets: `upsertPushProvider({ type: 'firebase', ... })`, `updateAppSettings({ firebase_config })`. L35 and L93 are JSON template bodies labelled `js`.
- **Evidence**: Upsert validates the credentials (a fake config fails with `credentials are invalid`). The page is for push v1/v2; the app is on v3.
- **To unblock**: Set `FIREBASE_CONFIG` in `test/docs-snippets/.env`. The test switches the app to push v2 for the file and restores v3 (switching is allowed; it runs only when the creds are present). Push delivery is never verified end-to-end.

### `chat/_default/08-webhooks/01-webhooks_overview/02-before_message_send_webhook.md` (🔗 Requires webhook to test)

- **Affected**: Setting `before_message_send_hook_url` (L11) and the timeout (L66): the test sets them, reads them back and restores them. Whether Stream calls the hook isn't verified.
- **Evidence**: Needs a reachable HTTP endpoint.
- **To unblock**: Not needed for the stream-chat-js tests. `verifyAndParseWebhook` (L286) can be tested with a body signed locally with the API secret.

### `chat/_default/08-webhooks/01-webhooks_overview/03-custom_commands_webhook.md` (◐ 🔗 Requires webhook to test)

- **Affected**: `sendMessage({ text: '/ticket ...' })` (L15): the handler response isn't observable without `custom_action_handler_url` pointing at a real endpoint. Command CRUD and the channel type snippets run normally.
- **Evidence**: Needs a reachable HTTP endpoint.
- **To unblock**: Not needed: verify the SDK calls only.

### `chat/_default/05-features/10-advanced/15-pending_messages.md` (◐ 🔗 Requires webhook to test)

- **Affected**: `updateAppSettings({ event_hooks: [...] })` pending-message callback (L173-196): the callback delivery isn't verified. Pending send / get / commit work (probe OK on a test channel type with `mark_messages_pending: true`).
- **Evidence**: Needs a reachable HTTP endpoint. Caution: `event_hooks` replaces all existing hooks (L174), so save and restore it.
- **To unblock**: Not needed: verify the SDK calls only.

### `chat/_default/04-messages/08-unread_reminders.md` (🔗 Requires webhook to test)

- **Affected**: The settings calls run (`updateChannelType(... reminders: true)`, `updateAppSettings({ reminders_interval })`, then restore). The reminder itself is only delivered as a webhook/SQS event (L3), after at least 60s.
- **Evidence**: Needs a webhook/SQS endpoint.
- **To unblock**: Not needed: verify the SDK calls only.

### `chat/_default/04-messages/09-message_reminders.md` (◐ 🔗 Requires webhook to test)

- **Affected**: `notification.reminder_due` / webhook section (L1361, L1438-1447): needs waiting until the due time plus webhook/push delivery. Reminder CRUD runs (push v3 is on).
- **Evidence**: Delivery is only observable via webhook or push.
- **To unblock**: Not needed: verify the SDK calls only.

### `chat/_default/05-features/06-campaign_api.md` (◐ 🔗 Requires webhook to test)

- **Affected**: Campaign webhook events (L1001-1020, JSON only). Everything else runs: use `user_ids` / narrow segments instead of `all_users`, and stop scheduled campaigns instead of waiting 48h.
- **Evidence**: Events only arrive via webhook.
- **To unblock**: Not needed.

### `chat/_default/12-best_practices/05-marketplace_best_practices.md` (◐ 🔗 Requires webhook to test)

- **Affected**: Reminders (L26-33): settings calls run, but the reminder arrives via webhook/SQS. Pending messages (L70) work on this app (probe OK).
- **Evidence**: Needs a webhook/SQS endpoint.
- **To unblock**: Not needed: verify the SDK calls only.

### `chat/_default/03-channels/07-channel_management/17-batch-updates.md` (◐ 🔗 Requires webhook to test)

- **Affected**: `channel_batch_update.*` events (L529-534, prose only). Batch updates themselves run, but retarget the filter to the test's own cids: the docs filter `types: { $in: ['messaging','team'] }` would freeze every channel in the app.
- **Evidence**: Events only arrive via webhook.
- **To unblock**: Not needed.

### `chat/_default/05-features/02-events.md` (◐ 🔗 Requires webhook to test)

- **Affected**: The webhook copy of server-sent events (L858). The events themselves are verified over WebSocket.
- **Evidence**: Optional webhook delivery.
- **To unblock**: Not needed.

### `chat/javascript/11-debugging_and_cli/10-upgrading_to_v9.md` (Excluded)

- Not validated; leave the page as is (React/TSX type examples, no runnable JS).

## Unblock checklist

- [ ] Add `FIREBASE_CONFIG` to `test/docs-snippets/.env`, which turns `07-legacy_push_system` from typecheck-only into a running test.
- Webhook-dependent parts (🔗) are intentionally not verified by this project.

## Setup notes (not blockers)

- **02-init_and_users/01-client_tokens_and_authentication**: `devToken` needs `disable_auth_checks: true`: toggle it for the test and restore it.
- **02-init_and_users/04-user_groups, 05-features/06-campaign_api, 12-best_practices/02-moderation**: `team_id` / `team` / `enforce_unique_usernames: "team"` need multi-tenancy. The probe showed `updateAppSettings({ multi_tenant_enabled: true })` works and can be restored to `false`.
- **02-init_and_users/05-authless_users**: `setGuestUser` works. The guest id is rewritten to `guest-<uuid>-<requested id>`: register `client.userID` (not the requested id) for cleanup.
- **03-channels/02-query_channels**: Predefined filter `user_messaging_channels` must be created first (`createPredefinedFilter` works via the API).
- **04-messages/02-file_uploads**: Node snippets need local fixture files (generate them in the test). Browser `File` snippets: build `File` objects in Node. The custom CDN snippet (L682) references undefined `messageComposer` / `customCDN`.
- **04-messages/01-send_message**: URL enrichment depends on Stream scraping imgur (non-deterministic): assert loosely. Group mentions need a user group and permissions.
- **04-messages/05-pinned_messages**: `pinMessage(message, 120)` expires after 120s: don't assert after that.
- **04-messages/06-search**: Search indexing is eventually consistent: poll with `retry`.
- **04-messages/10-message_receipts**: Delivery receipts work on this app (probe: `last_delivered_at` set after `markChannelsDelivered`), despite the "contact support" note.
- **05-features/09-translation**: `translateMessage` works (probe). `auto_translation_enabled` app setting: toggle and restore.
- **05-features/10-advanced/16-dynamic_partitioning**: `partition_size` / `partition_ttl` are accepted on a test channel type, but partitioning itself only shows with many watchers: verify the config only.
- **05-features/10-advanced/18-data_retention_policy**: set/delete retention policies is app-wide: restore. The Node.js tabs use `client.chat.*` (`@stream-io/node-sdk`, not stream-chat).
- **05-features/10-advanced/11-slow_mode_and_throttling**: Slow mode cooldown is 30s in the snippet: use a short cooldown in assertions.
- **05-features/08-location_sharing**: Enabling `shared_locations` on `messaging`: toggle and restore, or use a test channel type. The LiveLocationManager snippet needs stubbed device functions.
- **12-best_practices/02-moderation**: Review queue works (probe OK). Many snippets change `messaging` grants or the upload config: restore them.
- **All pages that create/update channel types**: Wait 30s (`waitForChannelTypePropagation()`) after `createChannelType` / `updateChannelType` before using the type.

## Known docs bugs

Found while scanning the pages; agents should confirm and fix them (minimal change, listed in the final report).

- **02-init_and_users/02-init_and_users**: `tokenProvider` undefined (L82); XHR fallback (L343) uses curly quotes and `enableWSFallBack` (SDK: `enableWSFallback`).
- **02-init_and_users/04-user_groups**: Users alice/bob/charlie/dave must exist.
- **03-channels/02-query_channels**: `thirtyDaysAgo`, `userId`, `channelCID` undefined (L857, L1490); fragment snippets redeclare `const filter`.
- **03-channels/06-channel_members**: `cutoff.setDate(date.getDate() - 7)`: `date` undefined (L504).
- **03-channels/07-channel_management/10-muting**: Uses `moment` (not a dependency); `expiration` is typed `number`.
- **03-channels/07-channel_management/13-deleting**: `hardResponse.result` (L212): the response has `task_id`.
- **03-channels/07-channel_management/14-freezing**: Missing `}` in `{ set: { frozen: true }` (L12); `const update` declared twice.
- **03-channels/07-channel_management/15-truncating**: Missing comma after `'text'` (L22); `user` undefined.
- **03-channels/07-channel_management/16-channel_invites**: `rejected` declared twice and missing `await` (L545, L693).
- **03-channels/07-channel_management/17-batch-updates**: Filter key `channel_cids` vs documented `cids` (L66); `getTask({ id })` but the SDK takes `getTask(id)` (L547).
- **04-messages/01-send_message**: `josh` undefined (attachments).
- **04-messages/04-send_reaction**: `const reaction` / `const response` redeclared.
- **04-messages/07-silent_messages**: `systemUser`, `tripData` undefined.
- **04-messages/09-message_reminders**: Positional `createReminder("message-id","user-id",date)` / `updateReminder(...)`: the SDK takes an object (`createReminder({ messageId, ... })`); `offsetMs` undefined.
- **05-features/02-events**: `myClientEventListener` / `myChannelEventListener` only defined in comments (L556).
- **05-features/07-polls_api**: Syntax errors around L305, L516-517, L800.
- **05-features/10-advanced/13-private_messaging**: `client.Channel` typo (L19).
- **05-features/10-advanced/18-data_retention_policy**: Node.js tabs use `client.chat.*` (different SDK).
- **06-app_and_channel_settings/02-app_settings**: `file_upload_config` / `image_upload_config` missing a closing `}` (L190, L287).
- **06-app_and_channel_settings/03-chat_permission_policies**: `client.updateApp` doesn't exist (L775, use `updateAppSettings`); `deleteRole("agent_006")` for a never-created role.
- **06-app_and_channel_settings/06-channel-level_settings**: Assumes blocklist `medical_blocklist` exists.
- **10-migrating/03-exporting_channels**: `const response` / `const taskID` declared twice (L13-50); `taskId` vs `taskID`; `user1`/`user2` undefined.
- **12-best_practices/02-moderation**: `const flag` declared twice (L887); `console.log(next)` undefined (L1059); `ctx.createUsers` / `ctx.serverClient()` test-harness code (L1205).
- **chat/node/01-quick_start/01-backend_quickstart**: ESM `import` and `require` of `StreamChat` in one block (L69); `const message` reassigned (L544); `josh` undefined.

## Notes

- `chat/_default/12-best_practices/05-marketplace_best_practices.md` has only unlabelled `js` fences.
- `chat/_default/10-migrating/02-import.md` is in the Node sidebar and has no JS fences, only import-file format examples. Nothing to test.
- Client-only pages (`02-init_and_users/01`, `02`, `05`, `05-features/04-typing_indicators`, `05-presence_format`, `javascript/01-quick_start`) need no server test or Node.js snippet.
