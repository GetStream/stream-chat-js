# Docs snippet tests: todo

Pages under `getstream.io/content/docs/` that contain JavaScript snippets. Give each page to an agent with `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/docs-snippets-agent-prompt.md`. **Run pages one at a time**: tests may change app settings (they must restore them).

- Only client-side snippets are in scope: fences labelled `JavaScript` of pages in the JavaScript sidebar. Unlabelled `js` fences get a label (`JavaScript` or `Node.js`). `Node.js` fences and pages only in the Node sidebar are out of scope.
- **JS / unlabelled**: number of `js` fences labelled `JavaScript` / with no label (before the docs were changed).
- **Client test**: `yes` when the page gets a test under `test/docs-snippets/client/...`; `-` when nothing on it can be tested client-side.

**Blockers** (details below; empty = fully runnable, maybe with setup notes):

- ⛔ **Blocked**: the app doesn't have the feature. The snippet goes in `it.skip('BLOCKED: ...')` (still typechecked).
- 🔗 **Requires webhook to test**: the result is only observable through a webhook/SQS endpoint. The test verifies the stream-chat-js calls only, not delivery.
- ◐ **Partial**: only some snippets of the page are affected.
- **Excluded**: not validated, leave as is.

Status: `[ ]` todo, `[x]` done, `[~]` done with open questions.

App facts (2026-10-05): push v3 (no providers), permissions v2, multi-tenancy off (can be toggled), campaigns on, no webhook/SQS/SNS. Enabled since (not probed yet): private messaging (restricted visibility) and message history (`queryMessageHistory`). Probed and **working**: pending messages, delivery receipts, translation, review queue, guest users, dynamic partitioning config, multi-tenancy toggle.

## chat/\_default/02-init_and_users

| Status | Page                                                                     | JS  | Unlabelled | Client test | Blockers |
| ------ | ------------------------------------------------------------------------ | --- | ---------- | ----------- | -------- |
| [x]    | `chat/_default/02-init_and_users/01-client_tokens_and_authentication.md` | 1   | 0          | yes         |          |
| [x]    | `chat/_default/02-init_and_users/02-init_and_users.md`                   | 5   | 0          | yes         |          |
| [x]    | `chat/_default/02-init_and_users/04-user_groups.md`                      | 8   | 0          | yes         |          |
| [x]    | `chat/_default/02-init_and_users/05-authless_users.md`                   | 2   | 0          | yes         |          |

## chat/\_default/03-channels

| Status | Page                                                                    | JS  | Unlabelled | Client test | Blockers |
| ------ | ----------------------------------------------------------------------- | --- | ---------- | ----------- | -------- |
| [x]    | `chat/_default/03-channels/01-creating_channels.md`                     | 3   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/02-query_channels.md`                        | 11  | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/03-channel_update.md`                        | 2   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/04-query_members.md`                         | 2   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/05-channel_pagination.md`                    | 2   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/06-channel_members.md`                       | 11  | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/08-archiving.md`       | 1   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/09-pinning.md`         | 1   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/10-muting.md`          | 3   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/11-hiding.md`          | 1   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/12-disabling.md`       | 1   | 1          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/13-deleting.md`        | 2   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/14-freezing.md`        | 2   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/15-truncating.md`      | 2   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/16-channel_invites.md` | 6   | 0          | yes         |          |
| [x]    | `chat/_default/03-channels/07-channel_management/17-batch-updates.md`   | 3   | 0          | -           |          |

## chat/\_default/04-messages

| Status | Page                                                | JS  | Unlabelled | Client test | Blockers                     |
| ------ | --------------------------------------------------- | --- | ---------- | ----------- | ---------------------------- |
| [ ]    | `chat/_default/04-messages/01-send_message.md`      | 9   | 0          | yes         |                              |
| [ ]    | `chat/_default/04-messages/02-file_uploads.md`      | 4   | 0          | yes         |                              |
| [ ]    | `chat/_default/04-messages/03-threads.md`           | 11  | 2          | yes         |                              |
| [ ]    | `chat/_default/04-messages/04-send_reaction.md`     | 5   | 0          | yes         |                              |
| [ ]    | `chat/_default/04-messages/05-pinned_messages.md`   | 3   | 0          | yes         |                              |
| [ ]    | `chat/_default/04-messages/06-search.md`            | 2   | 0          | yes         |                              |
| [ ]    | `chat/_default/04-messages/07-silent_messages.md`   | 2   | 0          | yes         |                              |
| [ ]    | `chat/_default/04-messages/09-message_reminders.md` | 7   | 0          | yes         | ◐ 🔗 `reminder_due` delivery |
| [ ]    | `chat/_default/04-messages/10-message_receipts.md`  | 1   | 0          | yes         |                              |

## chat/\_default/05-features

| Status | Page                                                                   | JS  | Unlabelled | Client test | Blockers                    |
| ------ | ---------------------------------------------------------------------- | --- | ---------- | ----------- | --------------------------- |
| [ ]    | `chat/_default/05-features/02-events.md`                               | 7   | 0          | yes         | ◐ 🔗 webhook copy of events |
| [ ]    | `chat/_default/05-features/03-unread.md`                               | 11  | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/04-typing_indicators.md`                    | 2   | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/05-presence_format.md`                      | 3   | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/07-polls_api.md`                            | 17  | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/08-location_sharing.md`                     | 7   | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/09-translation.md`                          | 4   | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/11-slow_mode_and_throttling.md` | 2   | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/12-drafts.md`                   | 6   | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/13-private_messaging.md`        | 1   | 0          | yes         |                             |
| [ ]    | `chat/_default/05-features/10-advanced/15-pending_messages.md`         | 1   | 0          | yes         | ◐ 🔗 pending callback hook  |

## chat/\_default/12-best_practices

| Status | Page                                               | JS  | Unlabelled | Client test | Blockers |
| ------ | -------------------------------------------------- | --- | ---------- | ----------- | -------- |
| [ ]    | `chat/_default/12-best_practices/02-moderation.md` | 16  | 1          | yes         |          |

## chat/javascript

| Status | Page                                                             | JS  | Unlabelled | Client test | Blockers |
| ------ | ---------------------------------------------------------------- | --- | ---------- | ----------- | -------- |
| [ ]    | `chat/javascript/01-quick_start/01-plain_js_introduction.md`     | 4   | 0          | yes         |          |
| —      | ~~`chat/javascript/11-debugging_and_cli/10-upgrading_to_v9.md`~~ | 0   | 8          | yes         | Excluded |

## Blockers detail

### `chat/_default/05-features/10-advanced/15-pending_messages.md` (◐ 🔗 Requires webhook to test)

- **Affected**: `updateAppSettings({ event_hooks: [...] })` pending-message callback (L173-196): the callback delivery isn't verified. Pending send / get / commit work (probe OK on a test channel type with `mark_messages_pending: true`).
- **Evidence**: Needs a reachable HTTP endpoint. Caution: `event_hooks` replaces all existing hooks (L174), so save and restore it.
- **To unblock**: Not needed: verify the SDK calls only.

### `chat/_default/04-messages/09-message_reminders.md` (◐ 🔗 Requires webhook to test)

- **Affected**: `notification.reminder_due` / webhook section (L1361, L1438-1447): needs waiting until the due time plus webhook/push delivery. Reminder CRUD runs (push v3 is on).
- **Evidence**: Delivery is only observable via webhook or push.
- **To unblock**: Not needed: verify the SDK calls only.

### `chat/_default/05-features/02-events.md` (◐ 🔗 Requires webhook to test)

- **Affected**: The webhook copy of server-sent events (L858). The events themselves are verified over WebSocket.
- **Evidence**: Optional webhook delivery.
- **To unblock**: Not needed.

### `chat/javascript/11-debugging_and_cli/10-upgrading_to_v9.md` (Excluded)

- Not validated; leave the page as is (React/TSX type examples, no runnable JS).

## Unblock checklist

- Webhook-dependent parts (🔗) are intentionally not verified by this project.

## Setup notes (not blockers)

- **02-init_and_users/01-client_tokens_and_authentication**: `devToken` needs `disable_auth_checks: true`: toggle it for the test and restore it.
- **02-init_and_users/04-user_groups, 12-best_practices/02-moderation**: `team_id` / `team` / `enforce_unique_usernames: "team"` need multi-tenancy. The probe showed `updateAppSettings({ multi_tenant_enabled: true })` works and can be restored to `false`.
- **02-init_and_users/05-authless_users**: `setGuestUser` works. The guest id is rewritten to `guest-<uuid>-<requested id>`: register `client.userID` (not the requested id) for cleanup.
- **03-channels/02-query_channels**: Predefined filter `user_messaging_channels` must be created first (`createPredefinedFilter` works via the API).
- **04-messages/02-file_uploads**: Browser `File` snippets: build `File` objects in the test. The custom CDN snippet (L682) references undefined `messageComposer` / `customCDN`.
- **04-messages/01-send_message**: URL enrichment depends on Stream scraping imgur (non-deterministic): assert loosely. Group mentions need a user group and permissions.
- **04-messages/05-pinned_messages**: `pinMessage(message, 120)` expires after 120s: don't assert after that.
- **04-messages/06-search**: Search indexing is eventually consistent: poll with `retry`.
- **04-messages/10-message_receipts**: Delivery receipts work on this app (probe: `last_delivered_at` set after `markChannelsDelivered`), despite the "contact support" note.
- **05-features/09-translation**: `translateMessage` works (probe). `auto_translation_enabled` app setting: toggle and restore.
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
- **03-channels/07-channel_management/14-freezing**: Missing `}` in `{ set: { frozen: true }` (L12); `const update` declared twice.
- **03-channels/07-channel_management/15-truncating**: Missing comma after `'text'` (L22); `user` undefined.
- **03-channels/07-channel_management/16-channel_invites**: `rejected` declared twice and missing `await` (L545, L693).
- **04-messages/01-send_message**: `josh` undefined (attachments).
- **04-messages/04-send_reaction**: `const reaction` / `const response` redeclared.
- **04-messages/07-silent_messages**: `systemUser`, `tripData` undefined.
- **04-messages/09-message_reminders**: Positional `createReminder("message-id","user-id",date)` / `updateReminder(...)`: the SDK takes an object (`createReminder({ messageId, ... })`); `offsetMs` undefined.
- **05-features/02-events**: `myClientEventListener` / `myChannelEventListener` only defined in comments (L556).
- **05-features/07-polls_api**: Syntax errors around L305, L516-517, L800.
- **05-features/10-advanced/13-private_messaging**: `client.Channel` typo (L19).
- **12-best_practices/02-moderation**: `const flag` declared twice (L887); `console.log(next)` undefined (L1059); `ctx.createUsers` / `ctx.serverClient()` test-harness code (L1205).

## Notes

- `chat/_default/03-channels/07-channel_management/17-batch-updates.md`: all `JavaScript` fences were server-only (batch updates and `getTask` fail with a user token: "this endpoint can only be called server side") and were removed, so the page has no client test.
