# stream-chat v10 follow-ups

Record-only list of dead code, bugs, simplifications and doc mismatches found while auditing the `stream-chat` v10 release against v9. Nothing here is fixed; each item is a pointer for the team to act on later.

- **v10:** `release-v10` @ `53505e72`. **v9:** `master` @ `24b7623b`. Line numbers are v10 unless marked v9.
- **Downstream refs:** stream-chat-react `master` @ `557ffcb3c`, stream-chat-react-native `V10` @ `c994ffd00`.
- **Sources:** the per-slice reconciled follow-ups (verified against source), plus test, snippet, doc-claim, downstream and dead-code signals. Every bug below with confidence `high` was re-read against v10 source for this file; see [Dropped after re-check](#dropped) for what did not hold.

**Legend**

- Category: `bug` (wrong behaviour or types with a concrete scenario), `dead-code` (unused code or exports), `leftover` (migration residue: deprecated aliases, stale shims, stubs), `simplification` (works, but could be smaller or clearer), `doc-mismatch` (JSDoc, comments, README, docs or downstream guides disagree with code), `test-gap` (skipped, todo, broken or missing tests).
- Confidence: `high` (code path read, scenario holds), `medium` (mechanism confirmed, impact or server behaviour unverified), `low` (plausible, rare or unverified).
- Pre-release: `yes` when the fix is itself breaking (cheap only before 10.0.0) or the bug is a v10 regression that hits apps on upgrade; `no` when it can land in any v10 minor or patch.

## Contents

1. [Fix before 10.0.0 ships](#fix-before)
2. [Bugs](#bugs)
3. [Dead code and leftovers](#dead-code)
4. [Simplifications](#simplifications)
5. [Doc and comment mismatches](#docs)
6. [Test gaps](#test-gaps)
7. [Dropped after re-check](#dropped)

---

<a id="fix-before"></a>

## 1. Fix before 10.0.0 ships

Ordered by severity. The breaking dead-code removals and leftover decisions are kept in [section 3](#dead-code) and listed at the end of this section. Items a review downgraded to `pre-release: no` (non-breaking fix, or not a v10 regression that hits apps) were moved to [Bugs](#bugs) and [Simplifications](#simplifications).

<a id="typing-stale"></a>

### Typing indicators go stale after the composer resets [SOLVED f97ddd8b]

`bug` · confidence: high · pre-release: yes · composer / channel state

- **Where:** `src/messageComposer/textComposer.ts:115-140` (`initState` sets `typing: {}`), `:297-299` (`restoreSnapshot`), `:514-519` (`commitState`), `:524-541` (`handleChange`); `src/channel_state.ts:296-320` (`typing` getter/setter, `removeTypingEvent`), `:347-360` (`clean`)
- **What:** `channel.state.typing` reads the text composer's copy first. Every composer re-init (send, `clear()`, `restore()`, edit init) wipes that copy, and `restoreSnapshot` reverts it to the captured (stale) map, which can resurrect stopped typers, while the store slice keeps its own entries. Command activation is not affected (it commits `...getLatestValue()`, `textComposer.ts:413`). A second path: `handleChange` passes `...this.state.getLatestValue()` (typing included) into the async text middleware and `commitState` writes it back, so a `typing.start` / `typing.stop` that arrives while the middleware runs is overwritten in the composer copy.
- **Evidence / scenario:** B and C are typing; A sends a message, so `textComposer.initState()` sets `typing: {}` and the getter returns `{}`. C's `typing.stop` reaches `removeTypingEvent`, whose `if (!this.typing[userID]) return` exits early, so the store slice still holds C; `clean()` iterates the composer copy and never prunes it. Probe: after `clear()` the getter is `[]` and the slice `[B, C]`; after C's `typing.stop` and `clean()` the slice is still `[B, C]`. Impact differs per SDK: React Native reads the store slice (`TypingIndicatorContainer.tsx:23`, `useTypingUsers.ts:20`), so RN keeps showing "C is typing" until another typing event rewrites the slice; React reads the composer copy (`TypingIndicator.tsx:30`), so React drops B and C until their next `typing.start`. v9 had no composer typing (added in 62f05078), so this is new.
- **Suggested change:** Keep `typing` out of text-composer resets (carry the current map through `initState`, `restoreSnapshot` and `commitState` after async middleware), or make `channel.state` the single owner and have the composer read from it.

<a id="shared-markread-throttle"></a>

### One mark-read throttle shared by every channel and thread [SOLVED 312e2e5c]

`bug` · confidence: medium · pre-release: yes · message delivery / threads

- **Where:** `src/messageDelivery/MessageDeliveryReporter.ts:452-463` (`buildThrottledMarkRead`), `src/thread.ts:924-926`
- **What:** `throttledMarkRead` is one lodash-style throttle (leading + trailing) for all collections; the trailing call keeps only the latest arguments. v9 had a throttle per thread.
- **Evidence / scenario:** A thread is open beside its channel (React). A reply arrives and the thread calls `throttledMarkRead(thread)`; within 1 s the UI calls `throttledMarkRead(channel)` (React `useMarkRead`). Whichever came first fires on the leading edge; the trailing slot is overwritten by the channel, so `markRead(thread)` is never sent. The thread's own unread count does not increment again, so the auto-read does not retry and the server keeps the thread unread until the next reply. Mechanism confirmed in code; frequency depends on UI timing.
- **Suggested change:** Key the throttle per collection (`Map<cid | cid:threadId, Throttled>`) or restore a per-thread throttle.

<a id="event-all-typing"></a>

### `on('all')` and undeclared custom events are typed `never` [SOLVED c103da00]

`bug` · confidence: high · pre-release: yes · types / events

- **Where:** `src/types.ts:196-209` (`Event`, `EventType`, `EventHandler`), `src/client.ts:987-996`, `src/channel.ts:2234-2243`
- **What:** `EventHandler<T> = (event: Extract<Event, { type: T }>) => void`. For `'all'` (a valid `EventType`, and the key runtime dispatch uses at `client.ts:1391`) and for any custom name not augmented into `CustomEventTypes`, `Extract` yields `never`.
- **Evidence / scenario:** `client.on('all', (e) => e.type)` and `client.on('my_custom', (e) => e.type)` fail with TS2339 "Property 'type' does not exist on type 'never'", while both listeners fire at runtime. v9 accepted any string with a usable `Event`. Removed v9 names such as `client.on('connection.changed', fn)` still type-check (string overload) but never fire, with no warning.
- **Suggested change:** `EventHandler<T> = (event: T extends 'all' ? Event : [Extract<Event, { type: T }>] extends [never] ? { type: T } & Omit<CustomEvent, 'type'> : Extract<Event, { type: T }>) => void`. Optionally log a dev warning when subscribing to a removed v9 event name.

<a id="event-star"></a>

### `client.on('*')` type-checks but never fires [SOLVED 79477d20]

`bug` · confidence: high · pre-release: yes · types / events

- **Where:** `src/gen/models/index.ts:11854, :11939` (`{ type: '*' } & CustomEvent` in the WS event unions), `src/client.ts:1391-1392` (`_callClientListeners`)
- **What:** The spec's custom-event placeholder `'*'` leaks into `Event['type']` and `EventType`. Dispatch only looks up `'all'` and `event.type`, and no event carries type `'*'`.
- **Evidence / scenario:** `client.on('*', cb)` compiles and `cb` is never called.
- **Suggested change:** Exclude the `'*'` member from the exported `Event` union (custom events already come from `CustomEventTypeUnion`), or map `'*'` to a catch-all for custom events. Removing it from the union is breaking, so decide before 10.0.0.

<a id="retry-error"></a>

### Exhausted retries hide the API error; 429 now holds callers for about 100 s [SOLVED e295664a]

`bug` · confidence: high · pre-release: yes · client / HTTP

- **Where:** `src/api-client.ts:226-294`, `src/utils/retryable.ts:64-135`, `src/utils.ts:128-133` (`retryInterval`), `src/errors.ts:84-88`; v9 `src/client.ts:1384-1402`
- **What:** When retries run out (persistent 429 or expired token), `runWithRetry` throws `RetryError('Reached maximum amount of retry attempts')`. The `StreamAPIError` wrapping in the `catch` only handles axios errors, so `code`, `status` and `response` are lost. v9 did not retry 429 at all (it rejected at once with the API error; only a non-static `TOKEN_EXPIRED` was retried), while v10 retries a 429 10 times (11 requests, delays of 0.25 to 20.5 s, about 100 s in total).
- **Evidence / scenario:** Probe: a request that keeps getting 429 makes 11 requests and then rejects with `RetryError`; `code` / `status` are `undefined` and `isEphemeral` is `true`, so offline-aware operations queue it. A rate-limited UI action (send, react, mark read) appears to hang for about 100 s before failing.
- **Suggested change:** Keep the last error in `runWithRetry` and rethrow it (or attach it as `cause`), so the final rejection is a `StreamAPIError`. Decide at the same time whether 429 is retried at all, or with a much smaller budget. The observable error class and latency are public behaviour, so settle both before 10.0.0.

<a id="static-token-retries"></a>

### Static expired token is retried 10 times [SOLVED eef88681]

`bug` · confidence: high · pre-release: yes · client / HTTP

- **Where:** `src/api-client.ts:268-276` (`isRetryable`)
- **What:** `TOKEN_EXPIRED` is retryable regardless of token type. For a static token `loadToken()` returns the same token, so the request is doomed. v9 skipped static tokens (v9 `src/client.ts:1388-1399`, `!this.tokenManager.isStatic()`).
- **Evidence / scenario:** App connects with a static token that expires; every HTTP call is retried 10 times (11 requests) with delays of 0.25 to 20.5 s, about 100 s in total, before rejecting with `RetryError` (probe: 11 requests, then `RetryError`), instead of failing at once as in v9.
- **Suggested change:** Retry `TOKEN_EXPIRED` only when `!this.client.tokenManager.isStatic()`.

<a id="show-in-channel-edits"></a>

### Edits to `show_in_channel` replies are not applied to the channel list [SOLVED dd1b8c7a]

`bug` · confidence: medium · pre-release: yes · channel

- **Where:** `src/channel.ts:2680` vs `:2584` (`message.new`) and `:2543` (`message.deleted`)
- **What:** `message.updated` / `message.undeleted` skip every message with `parent_id`; `message.new` / `message.deleted` skip only thread-only replies (`parent_id && !show_in_channel`). v9 applied updates to every message (`addMessageSorted`).
- **Evidence / scenario:** A reply sent with `show_in_channel: true` is in the channel list; the author edits it. If no `Thread` for the parent is held by `client.threads` (so `ThreadManager` does not route the event, `src/thread_manager.ts:348-353`), the channel list keeps the old text. No test covers `show_in_channel` edits.
- **Suggested change:** Use the same predicate as `message.new`.

<a id="user-messages-deleted-window"></a>

### `user.messages.deleted` only processes the active window [SOLVED 45290f4e]

`bug` · confidence: medium · pre-release: yes · channel / pagination

- **Where:** `src/pagination/paginators/MessageIntervalPaginator.ts:1414` (`applyMessageDeletionForUser` iterates `this.items`)
- **What:** Only the active interval is scanned. v9 processed every message set, threads and pinned messages.
- **Evidence / scenario:** The user jumped to an older message (active interval is not the head); `user.messages.deleted` arrives for a banned user; that user's newest messages in the head interval stay visible when the user jumps back to latest.
- **Suggested change:** Iterate all loaded intervals (or the item index) instead of `items`.

<a id="recovery-disabled-no-event"></a>

### `connectionRecovery.enabled: false` also suppresses `connection.recovered` [SOLVED 311c28a2]

`bug` · confidence: high · pre-release: yes · connection recovery

- **Where:** `src/connection/ConnectionRecoveryManager.ts:273-279` (`recoverActiveChannels` returns first when disabled), `:353` (the only dispatch site), `:362-370` (`recover()`), `:196-215` (offline sync-edge path); `src/thread_manager.ts:468`; v9 `src/client.ts:1782-1817`
- **What:** Behaviour change to confirm is intended. v9 dispatched `connection.recovered` after every reconnect, also with `recoverStateOnReconnect: false` (the `else` branch), and that flag existed so integrators could run their own recovery keyed on the event. In v10 the event is dispatched only from inside `recoverActiveChannels`, which returns on its first line when `connectionRecovery.enabled` is `false`, so the event never fires and the manual `client.connectionRecovery.recover()` is a no-op too. With an initialized offline DB the event is also delayed until the offline sync finishes.
- **Evidence / scenario:** An app sets `recoverStateOnReconnect: false` in v9 and re-queries its channels on `connection.recovered`. After migrating to `connectionRecovery.enabled: false` it never recovers after a drop, and `ThreadManager`, which reloads threads on `connection.recovered`, stops reloading as well. Documented in the breaking-changes doc (`#connection-recovery`) with a `wsConnection.state` workaround.
- **Suggested change:** Decide before 10.0.0: either dispatch `connection.recovered` on the reconnect edge when recovery is disabled (v9 parity) or keep the current behaviour and state it in the `connectionRecovery` JSDoc. Changing it after the release is a behaviour change again.

<a id="reminder-paginator-flash"></a>

### Reminder list blanks on every "load more" [SOLVED 73a87752]

`bug` · confidence: high · pre-release: yes · pagination / reminders

- **Where:** `src/pagination/paginators/ReminderPaginator.ts:84-96` (`getNextQueryShape` puts the cursor in the shape), `src/pagination/paginators/BasePaginator.ts:3034-3046` (`isFirstPageQuery`), `:3013-3021`, `:3196-3213`
- **What:** The default `hasPaginationQueryShapeChanged` sees a new cursor as a new query shape, so each next page is treated as a first page and publishes `items: undefined` while loading.
- **Evidence / scenario:** Probe emissions on load-more: `[m1, m2] -> undefined -> [m1, m2, m3]`, so a reminders list flashes empty each page. `UserGroupPaginator` avoids this by keeping the cursor out of the shape.
- **Suggested change:** Move the cursor out of `ReminderPaginator`'s query shape (as `UserGroupPaginator` does) or override the shape comparison to ignore `next` / `prev`.

<a id="last-query-error-flash"></a>

### `lastQueryError` flashes on every failed retry attempt [SOLVED 9cc208fd]

`bug` · confidence: high · pre-release: yes · pagination / channel list

- **Where:** `src/pagination/paginators/BasePaginator.ts:3098-3116` (`runQueryRetryable`), `src/pagination/paginators/ChannelPaginator.ts:344` (default `retryCount`); v9 `src/channel_manager.ts:386-411`
- **What:** The error is published on every failed attempt, before retries are exhausted. v9 `BasePaginator` had no retries at all (v9 `pagination/BasePaginator.ts:159-160`); the v9 behaviour this regresses is `ChannelManager`, which set `state.error` only once `retryCount >= DEFAULT_QUERY_CHANNELS_RETRY_COUNT`. `ChannelPaginator` replaces it and retries 3 times by default.
- **Evidence / scenario:** Probe: `ChannelPaginator` with the first attempt failing emits `lastQueryError` `[null, "503", null]`. React's `ChannelList.tsx:77-83` calls `client.notifications.addError` on every `lastQueryError` change, so a transient channel-query failure that recovers on retry still shows an error toast, and one query can show up to 4 (each a distinct `Error`).
- **Suggested change:** Publish only when no retries remain (non-breaking).

<a id="message-search-sort"></a>

### `messageSearchSort` cannot change the primary order [SOLVED e32c8d5e]

`bug` · confidence: high · pre-release: yes · search

- **Where:** `src/search/MessageSearchSource.ts:242-249`; pinned by `test/unit/search/MessageSearchSource.test.ts:272-276`
- **What:** The custom sort is appended after a fixed `created_at: -1`.
- **Evidence / scenario:** `messageSearchSort: [{ field: 'created_at', direction: 1 }]` sends `[created_at -1, created_at 1]`, a contradictory duplicate key. v9 let `{ created_at: 1 }` flip the order.
- **Suggested change:** Merge the way v9's `{ created_at: -1, ...messageSearchSort }` did: `created_at` stays the primary key and takes the caller's direction when the caller passes a `created_at` entry, and the caller's other entries follow as secondary keys. Replacing the sort outright would drop the `created_at` primary order for anyone passing only a secondary key. Update the test (non-breaking: it only removes the duplicate key).

  ```ts
  const custom = this.messageSearchSort ?? [];
  const createdAt = custom.find(({ field }) => field === 'created_at');
  const sort = [
    { field: 'created_at', direction: createdAt?.direction ?? -1 },
    ...custom.filter(({ field }) => field !== 'created_at'),
  ];
  ```

<a id="query-date-filters-ns"></a>

### Request date filters typed as `TimestampNS` [SOLVED 202e6903]

`bug` · confidence: medium · pre-release: yes · types / generated models

- **Where:** `src/gen/models/index.ts:6815-6818` (`QueryBannedUsersPayload`), `:7180-7183` (`QueryFutureChannelBansPayload`), `:7223-7226` (`QueryMembersPayload`); `src/gen/chat/ChatApi.ts:1693` (`listUserGroups` `created_at_gt: string`)
- **What:** Every other request date field is `Date`, and `src/utils/time.ts` says request dates are `Date`. These filters take nanosecond numbers or a string. Whether the API accepts nanoseconds there is unverified.
- **Evidence / scenario:** Code passing a `Date` to `queryMembers({ created_at_after })` fails to compile; passing a ns number may be rejected by the server. v9 typed these `string` (RFC 3339, v9 `src/types.ts:1552-1560`), so a v9 string still compiles.
- **Suggested change:** Align the spec on `Date` for request filters, or document the exceptions. Narrowing the type later is breaking; a widening fix (`TimestampNS | Date | string`) is not, so the pre-release part is choosing the final type.

<a id="pin-message"></a>

### Positional `pinMessage` / `unpinMessage` wrappers [SOLVED be73434c]

`simplification` · confidence: low · pre-release: yes · client

- **Where:** `src/client.ts:129` (`NotATimestampNS`), `:1908-1960` (`_normalizeExpiration`, `_validateAndGetMessageId`), `:1967` (`pinMessage`), `:2001` (`unpinMessage`)
- **What:** The helpers exist only for the positional `pinMessage(msg, expiration, pinnedAt)`; every other request method takes objects. Other mixed conventions: `client.getThreadAndHydrate(messageId, opts)` vs `getThread({ message_id })`, `channel.deleteImage(url)` vs `client.deleteImage({ url })`, positional `channel.addMembers`, `client.polls.queryPolls(filter, sort)` vs `client.queryPolls({ filter, sort })`, positional `client.moderation.flagMessage(id, reason, options)`.
- **Suggested change:** Consider `pinMessage({ id }, { pin_expires?, pinned_at? })` and aligning the other outliers while signatures are breaking anyway.

<a id="placeholder-request"></a>

### Placeholder `_request?: Record<string, never>` parameters

`simplification` · confidence: high · pre-release: yes · channel / generated API

- **Where:** `src/channel.ts:1029, 1045, 1064, 1080` (`archive`, `unarchive`, `pin`, `unpin`); `src/gen/chat/ChatApi.ts:167, 822, 902, 982, 998, 1176, 1316, 1346, 1467, 1483` (e.g. `listDevices`)
- **What:** Callers must pass `undefined` first to reach `requestOptions`.
- **Suggested change:** Drop the placeholder for body-less endpoints (generator and the four hand-written channel methods), so `requestOptions` is the first argument.

<a id="channel-query-messageset"></a>

### `channel.query()` keeps v9 message-set semantics in its signature

`simplification` · confidence: high · pre-release: yes · channel

- **Where:** `src/channel.ts:1909-1913, 1931-1934`; JSDoc `:1901-1904`
- **What:** `messageSetToAddToIfDoesNotExist: MessageSetType` survives, but only `'latest'` has an effect (seeds the paginator); `'current'` and `'new'` are identical no-ops. The JSDoc still describes v9 message sets.
- **Suggested change:** Replace with `{ seedLatest?: boolean }` (or narrow to `'latest' | undefined`) and fix the JSDoc.

<a id="poll-update-fields"></a>

### `PollComposer.updateFields` "change with the next major" FIXME [SOLVED 4f8f95cf]

`simplification` · confidence: high · pre-release: yes · composer

- **Where:** `src/messageComposer/pollComposer.ts:129`
- **What:** `// FIXME: change method params to a single object with the next major release` on `updateFields(data, injectedFieldErrors)`; v10 is that release and `injectedFieldErrors` already changed type.
- **Suggested change:** Switch to `updateFields({ data, injectedFieldErrors })` now.

### Also pre-release: breaking removals and leftover decisions in section 3

These are full items in [Dead code and leftovers](#dead-code); listed here so the pre-release set is complete: [preventThreadCleanup](#dc-prevent-thread-cleanup), [skipHydration](#dc-skip-hydration), [Moderation.unmuteUser](#dc-unmute-user), [setMarkAsReadThrottleOptions](#dc-throttle-options), [PaginatorPlugin](#dc-paginator-plugin), [EntityStore.isHeld](#dc-is-held), [MessageReceiptsTracker event methods](#dc-receipts-tracker), [unused v10 root exports](#dc-root-exports), [ChatLoggerScope](#dc-logger-scopes), [CustomCommandData](#keep-custom-command-data), [deprecated client aliases](#lo-client-aliases), [Thread.markAsRead](#lo-thread-mark-as-read), [Thread `*Locally` methods](#lo-thread-locally), [composer deprecations](#lo-composer-deprecations), [onlineStatusChanged shims](#lo-online-status), [types that restate generated types](#lo-restated-types), [@internal exports used downstream](#lo-internal-exports).

---

<a id="bugs"></a>

## 2. Bugs

### Client and auth

<a id="devtoken-non-ascii"></a>

#### Non-ASCII user ids fail with a dev token

`bug` · confidence: high · pre-release: no · client / auth

- **Where:** `src/signing.ts:13` (`UserFromToken`) vs `:26-33` (`DevToken`), check in `src/token_manager.ts:92-99`
- **What:** `DevToken` now base64-encodes the UTF-8 bytes, but `UserFromToken` decodes with bare `atob` (Latin-1), so the decoded `user_id` never matches a non-ASCII id.
- **Evidence / scenario:** `client.connectUser({ id: 'jöhn' }, client.devToken('jöhn'))` rejects with "userToken does not have a user_id or is not matching with user.id". v9 used `btoa` on the raw string, so Latin-1 ids like `jöhn` connected; ids outside Latin-1 (`日本`) fail in both (v9 truncated them to garbage). The token itself is now correct for the server; only the client-side check is wrong. `test/unit/signing.test.js:33-36` is named "round-trips ... non-Latin-1 ids" but only asserts no throw. Regression for Latin-1 ids, but dev tokens only and the fix is non-breaking, so it can land in any 10.0.x.
- **Suggested change:** Decode as UTF-8: `new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))`, and assert the round trip in the test. See also [base64url](#base64url).

<a id="v9-constructor"></a>

#### v9-style constructor calls are silently misconfigured

`bug` · confidence: high · pre-release: no · client construction

- **Where:** `src/client.ts:313-325`, `src/configuration/InstanceConfigurationRegistry.ts:183-193`
- **What:** The constructor takes `(key, config?)`, and `config.set` iterates whatever it receives. JavaScript callers (or `any`-typed TS) using v9 shapes get no error.
- **Evidence / scenario:** Probe: `new StreamChat(key, 'secret', opts)` iterates the string (one "unknown key" warning per character) and drops `opts`; `new StreamChat(key, { timeout, enableWSFallback })` drops both (axios timeout stays 3000, fallback off). A guard is non-breaking and can ship any time.
- **Suggested change:** Throw (or warn once with a migration hint) when `config` is a string, when a third argument is passed, or when top-level keys are not `InstanceConfigTree` keys.

<a id="base64url"></a>

#### `UserFromToken` does not handle base64url

`bug` · confidence: medium · pre-release: no · client / auth

- **Where:** `src/signing.ts:9-17`
- **What:** JWT segments are base64url (`-`, `_`, no padding); `atob` throws `InvalidCharacterError` on `-` / `_`.
- **Evidence / scenario:** A real (server-signed) token whose payload encodes to those characters makes `connectUser` throw. v9 produced garbage and failed too, so not a regression.
- **Suggested change:** Map `-` to `+`, `_` to `/`, and pad before `atob`; combine with the [UTF-8 fix](#devtoken-non-ascii).

<a id="revoke-tokens"></a>

#### `revokeTokens()` without a connected user sends no id

`bug` · confidence: high · pre-release: no · client

- **Where:** `src/client.ts:787-803`
- **What:** Uses `this.userId!` behind an eslint-disable. In v10 the method revokes for the connected user (`updateUsersPartial`), not app-wide as in v9.
- **Evidence / scenario:** Calling it before `connectUser` sends `{ users: [{ set: { revoke_tokens_issued_before } }] }` with no `id`.
- **Suggested change:** Throw early when `!this.userId`; drop the non-null assertion.

<a id="empty-token"></a>

#### Empty token is no longer rejected up front

`bug` · confidence: high · pre-release: no · client / auth

- **Where:** `src/token_manager.ts:78-101`
- **What:** v9 threw "User token can not be empty" for a non-anonymous user without a token (v9 `src/token_manager.ts:81-84`). v10 accepts it.
- **Evidence / scenario:** `connectUser(user, undefined)` fails later inside the WS auth frame with "User token is not set. Either client.connectUser wasn't called...", which points at the wrong cause.
- **Suggested change:** Restore `if (!user.anon && !tokenOrProvider) throw new Error('User token can not be empty')`.

<a id="threads-parent-message"></a>

#### `queryThreadsAndHydrate` assumes `parent_message`

`bug` · confidence: low · pre-release: no · client / threads

- **Where:** `src/client.ts:2088-2091`; `src/poll_manager.ts:107-108`
- **What:** `response.threads.map((t) => t.parent_message!)`; the generated `ThreadStateResponse.parent_message` is optional (`src/gen/models/index.ts:10305`) and `hydratePollCache` reads `message.poll` unguarded. v9 typed the field required. Also violates the repo's no-non-null rule.
- **Evidence / scenario:** A thread returned without `parent_message` throws `TypeError` from the whole query. The server likely always returns it.
- **Suggested change:** `filter(Boolean)` before hydrating.

### Channel

<a id="watchers-members-in-place"></a>

#### Watchers and members are mutated in place on the store-backed state

`bug` · confidence: high · pre-release: no · channel state

- **Where:** `src/channel.ts:2530, 2536` (`user.watching.start/stop`, `user.updated`), `:2846, :2855` (`user.banned/unbanned`), `:2950` (`_initializeState` watchers); getters `src/channel_state.ts:322-328`
- **What:** `channelState.watchers[id] = user`, `delete channelState.watchers[id]` and `channelState.members[id] = {...}` write into the store's current object; no new reference is published.
- **Evidence / scenario:** `useStateStore(channel.state, (s) => ({ watchers: s.watchers }))` does not re-render when another user starts watching or is banned; the shallow selector compare sees the same object.
- **Suggested change:** Assign new objects (`channelState.watchers = { ...channelState.watchers, [id]: user }`, same for `members`) or use `partialNext`.

<a id="read-events-gate"></a>

#### Two notions of "read events off" disagree

`bug` · confidence: medium · pre-release: no · channel / message delivery

- **Where:** `src/channel.ts:1303-1313` (`markRead`/`markUnread`), `src/utils.ts:112-121` (`channelHasReadEvents`), `src/messageDelivery/MessageDeliveryReporter.ts:421-430`
- **What:** The `read-events` own-capability gate was dropped from `markRead` / `markUnread`, but `channelTracksReadLocally` and `_countMessageAsUnread` still use the capability, while the reporter's local fallback keys off `config.readEvents.enabled`.
- **Evidence / scenario:** Channel type has `read_events: true`, the user's `own_capabilities` lack `read-events`, `localUnreadCountEnabled: true`. The reporter sends `markRead` (v9 resolved `null` with no request) and does not reset the local count. Server response for a user without the capability is unverified.
- **Suggested change:** Pick one source of truth: restore the capability check in `markRead` and the reporter, or document that the request is sent.

<a id="count-unread-mute"></a>

#### `_countMessageAsUnread` throws on an id-less channel

`bug` · confidence: low · pre-release: no · channel

- **Where:** `src/channel.ts:1783`, `:1090-1093`
- **What:** Calls `this.muteStatus()`, which now runs `_checkHasId()`; v9 read `client._muteStatus(cid)` directly to avoid such a guard (v9 `src/channel.ts:1501-1503`).
- **Evidence / scenario:** `countUnread(ts)` / `countUnreadMentions()` throws "Channel isn't yet created" only on a provisional (members-only, unqueried) channel that holds another user's message. No known path puts one there: messages arrive through queries and WS events, which carry the real cid, and offline DB rows are keyed by the real cid too. It is a latent guard mismatch rather than a reachable bug.
- **Suggested change:** `this.getClient()._muteStatus(this.cid).muted` or read `this.state.getLatestValue().muteStatus`.

<a id="query-members-no-id"></a>

#### `queryMembers` rejects on an id-less (members-only) channel

`bug` · confidence: high · pre-release: no · channel

- **Where:** `src/channel.ts:656` (`_checkHasId()`), `:665-671` (unreachable `members` branch); pinned by `test/unit/channel.test.js:4922`; v9 `src/channel.ts:390-427`
- **What:** `queryMembers` calls `_checkHasId()` before building the payload, so on a channel created from members only (`client.channel('messaging', { members })`) it rejects with "Channel isn't yet created, call getOrCreateDistinctChannel() before this operation", and the `else if (Array.isArray(this.data?.members))` branch that fills `payload.members` can never run. v9 had no guard and sent `members` for an id-less channel.
- **Evidence / scenario:** Probe: `channelManager.ensure({ type, data: { members } })` then `queryMembers()` rejects. A UI that lists or searches the members of a distinct DM before it is created (e.g. a `ChannelMemberSearchSource` on that channel) fails where v9 worked. The composer's mention search does not hit it: on such a channel the local member map is empty, so it searches locally (`mentions.ts:640-641`). Documented in the breaking-changes doc (`#channel-query-members`, `#channel-id-guards`) with the `watch()` / `create()` workaround.
- **Suggested change:** Either skip the guard when `data.members` is set (restores v9; widening, non-breaking) and update the test, or keep the guard and delete the dead branch. Placed here, not in section 1: it is a v10 regression, but the fix is non-breaking in either direction, the SDK's own composer paths avoid it, and the rejection is documented with a workaround.

<a id="member-updated"></a>

#### `member.updated` re-routes every channel and may watch unknown ones

`bug` · confidence: low · pre-release: no · channel manager

- **Where:** `src/ChannelManager.ts:231-236` via `updateLists` `:152-175`
- **What:** No current-user guard (v9 ignored other members' updates, v9 `src/channel_manager.ts:737-744). For a cached channel every member's role or name change re-ingests it into every paginator; for an uncached cid it calls `ensure().ensureWatched()`.
- **Evidence / scenario:** Downgraded from medium: the watch request needs the server to deliver `member.updated` for a channel this connection does not watch, which is unverified. The re-routing cost for cached channels holds.
- **Suggested change:** Guard on own membership unless a paginator filters or sorts on member fields; never fetch for unknown channels on this event.

### Threads, polls, reminders

<a id="thread-manager-reregister"></a>

#### Manager unregister disposes thread paginators that are later reused

`bug` · confidence: low · pre-release: no · threads

- **Where:** `src/thread_manager.ts:311, 472-475`; `src/thread.ts:838-848`; `src/pagination/paginators/BasePaginator.ts:3476-3481`
- **What:** `client.threads.unregisterSubscriptions()` unregisters every stored thread, which disposes its reply paginator (item index cleared, `state.items` kept), but the threads stay in the store; a later `registerSubscriptions()` (remount, React StrictMode) re-subscribes the same instances.
- **Evidence / scenario:** After a remount, inactive threads still show replies while their item index and message-store links are empty, so edits and reactions no longer reach those replies until the thread reloads. Duplicate ingestion into the emptied index is unverified. Untested.
- **Suggested change:** Dispose only on release from the store, or clear `state.items` with the index so the next activation reseeds; add an unregister then register test.

<a id="poll-update-type"></a>

#### `poll.update` requires `id` and `name`

`bug` · confidence: high · pre-release: no · polls

- **Where:** `src/poll.ts:337`
- **What:** `data: Exclude<UpdatePollRequest, 'id'>`; `Exclude` on an object type is a no-op, so `id` (overwritten by the method) is still required. Carried from v9.
- **Evidence / scenario:** `poll.update({ name: 'x' })` fails to compile (`UpdatePollRequest.id: string`, `src/gen/models/index.ts:10850`).
- **Suggested change:** `Omit<UpdatePollRequest, 'id'>` (widening, not breaking).

<a id="thread-participants-rebuilt"></a>

#### `ThreadState.participants` rows are rebuilt with fake timestamps

`bug` · confidence: high · pre-release: no · threads

- **Where:** `src/thread.ts:819-836` (`subscribeParentMessageFromStore`), `:940-958` (`normalizeThreadParticipants`); v9 `src/thread.ts:48,170`
- **What:** Data loss. On `registerSubscriptions()` (the store subscription fires immediately) and on every parent-message update, `state.participants` is replaced with rows built from `parentMessage.thread_participants` (`UserResponse[]`): `created_at` and `last_read_at` are set to `nowNs()`, and the `custom`, `left_thread_at` and `last_thread_message_at` that came from `threadData.thread_participants` are dropped. v9 kept the thread response's participants unchanged.
- **Evidence / scenario:** Probe: before `registerSubscriptions()` a participant had `created_at` 5e17, `last_read_at` 6e17 and `custom: { x: 1 }`; after it both timestamps were the current time and `custom` was gone. A UI showing "joined" / "last read" per participant shows the subscribe time. `test/unit/threads.test.ts:340-362` asserts only `user_id`.
- **Suggested change:** Merge by `user_id`: keep the existing row's fields and only refresh `user`; synthesize rows (with `undefined` timestamps rather than now) only for users not yet in `participants`.

### Offline support

<a id="is-ephemeral"></a>

#### `isEphemeral` treats local programming errors as transient

`bug` · confidence: high · pre-release: no · offline support

- **Where:** `src/errors.ts:84-88`; `src/offline-support/offline_support_api.ts:1451, 1579`
- **What:** Any error without `response` counts as ephemeral, including `TypeError`, `resolveUrl` validation errors and "Channel isn't yet created" from generated channel methods.
- **Evidence / scenario:** Such a task is queued by `queueTask` and never deleted by `executePendingTasks`; it fails on every sync.
- **Suggested change:** Treat as ephemeral only axios network errors (`isAxiosError(e) && !e.response`) and `OfflineError`; everything else is non-ephemeral.

### Search, pagination, notifications

<a id="update-config-patches"></a>

#### `updateConfig()` patches are lost on re-derivation, including every reconnect

`bug` · confidence: high · pre-release: no · client config / reminders / notifications / search

- **Where:** `src/client.ts:415-446` (`wireClientConfiguration`, `initializeManagerConfig`), `:649-650` (`_setUser` re-arm), `:872-873` (`disconnectUser` release); `src/configuration/utils/applyInstanceConfiguration.ts` (`apply()` on subscribe); `src/configuration/ConfigController.ts:192-196` (`initialize` clears `patchLayer`), `:215-243` (unretained `patch`); `src/reminders/ReminderManager.ts:101-120`; `src/notifications/NotificationManager.ts:48-55, 73-75`; `src/search/SearchController.ts:113-121`; v9 `src/reminders/ReminderManager.ts:85-96`
- **What:** `StreamChat.initializeManagerConfig()` re-derives every client-owned manager (`reminders`, `threads`, `messageDeliveryReporter`, `notifications`, `wsConnection`, `connectionRecovery`, `networkConnection`) through `initializeConfig`, which calls `ConfigController.initialize` and drops every `updateConfig` patch (`initialize` clears even retained patches). It runs on any change under the `client` key (including a sibling such as `client.threads`), on `client.config.reset()`, and on every `connectUser()` after `disconnectUser()`, because `disconnectUser` releases the subscription and `_setUser` re-arms it, which applies the configuration immediately. `SearchController` and a pre-built `NotificationManager` lose patches the same way. For reminders this is a v10 regression: v9 `updateConfig` wrote into a plain `configState` that persisted for the client's lifetime.
- **Evidence / scenario:** Probe: `client.reminders.updateConfig({ stopTimerRefreshBoundaryMs: 5 })` reads 5, then 1209600000 again after `client.config.set({ client: { threads: {...} } })`; after a simulated disconnect and `_setUser`, reminders are back to 1209600000 and `notifications.config.durations.error` goes from 9999 to 3000. Also `const nm = new NotificationManager(); nm.updateConfig({ durations: { error: 10000 } }); new StreamChat(key, { client: { notificationManager: nm } })` leaves `nm.config.durations.error` at 3000. Not placed in section 1 because `docs/instance-configuration.md:527-536` documents drop-on-next-cycle as intended for everything but `MessageComposer` (retention deferred as FU-35); that doc does not say that a cycle includes sibling-key changes and every reconnect. Now documented in the breaking-changes doc (`#reminder-config-state`, `#notification-manager-config`).
- **Suggested change:** Enable `retainPatches` for the client-owned managers and `SearchController`, and make the client's re-derivation call `rederive` instead of `initialize` (keep `initialize` for `config.reset()`); or skip re-deriving managers whose slice did not change. At minimum, document that the reconnect re-applies configuration.

<a id="config-not-frozen"></a>

#### `Readonly` config objects are mutable

`bug` · confidence: medium · pre-release: no · search / notifications

- **Where:** `src/search/SearchController.ts:108-110`; `src/notifications/NotificationManager.ts:43-45`
- **What:** `config` is typed `Readonly`, but the published object is a shallow spread of frozen defaults.
- **Evidence / scenario:** `controller.config.keepSingleActiveSource = false` mutates silently without notifying `configState`; `notificationManager.config.durations.error = x` throws when `durations` is the frozen default but mutates silently when the constructor supplied it.
- **Suggested change:** Freeze the published value in `ConfigController.write` (at least in dev builds).

<a id="channel-query-sort"></a>

#### `MessageSearchSource.channelQuerySort` is ignored

`bug` · confidence: high · pre-release: no · search

- **Where:** `src/search/MessageSearchSource.ts:65, 85, 126` vs `:276-284`
- **What:** The option is accepted, stored and documented, but the hydration query always sends `sort: [{ field: 'last_message_at', direction: -1 }]`. v9 merged it.
- **Evidence / scenario:** Probe: `new MessageSearchSource(client, { channelQuerySort: [{ field: 'created_at', direction: 1 }] })` sends only `last_message_at`. The hydration order has no visible effect, so the impact is that the option is dead.
- **Suggested change:** Send `sort: this.channelQuerySort ?? [{ field: 'last_message_at', direction: -1 }]` (non-breaking, any time). Removing the option instead would be breaking, so if that is the choice, make it before 10.0.0.

### Composer and utils

<a id="polls-enabled"></a>

#### `polls.enabled` is resolved but never enforced

`bug` · confidence: high · pre-release: no · composer

- **Where:** `src/messageComposer/configuration/types.ts:152-158`; `src/messageComposer/messageComposer.ts:646, 1270-1275`
- **What:** The JSDoc says client and server flags are ANDed "so either side can switch it off", but nothing reads `config.polls.enabled`.
- **Evidence / scenario:** With `polls: false` on the channel type, `composer.createPoll()` still calls `client.polls.createPoll`.
- **Suggested change:** Return early in `createPoll` (and optionally `PollComposer.compose`) when disabled, or document it as a UI-only flag.

<a id="nothing-to-send-silent"></a>

#### Over-length composition is discarded without feedback

`bug` · confidence: medium · pre-release: no · composer

- **Where:** `src/messageComposer/messageComposer.ts:107-118` (`MessageComposerSubmitResult` docs); `src/messageComposer/middleware/messageComposer/compositionValidation.ts:71-75`; `src/messageComposer/textComposer.ts:427-430`
- **What:** The docs say a `nothing-to-send` reason "has already been reported through `client.notifications`", but `text.length > maxLengthOnSend` is discarded silently. v10 defaults `maxLengthOnSend` to the server `max_message_length`, and `setText` does not truncate.
- **Evidence / scenario:** Pasting text longer than the server limit and pressing send returns `nothing-to-send` with no notification.
- **Suggested change:** Emit a validation notification (e.g. `validation:message:text:too-long`) or reword the doc.

<a id="mute-target"></a>

#### Mention filtering crashes on a mute without `target`

`bug` · confidence: medium · pre-release: no · composer

- **Where:** `src/messageComposer/middleware/textComposer/mentions.ts:791, 798`
- **What:** `mute.target!.id` with eslint-disable; `target` is optional on the generated `UserMuteResponse`.
- **Evidence / scenario:** A mute entry without `target` throws `TypeError` while filtering suggestions.
- **Suggested change:** `mute.target?.id === suggestion.id` / `!==`.

<a id="format-message-memo"></a>

#### `formatMessage` returns a stale result for a mutated source

`bug` · confidence: medium · pre-release: no · utils (public export)

- **Where:** `src/utils.ts:220-257`; `src/formatMessageMemo.ts:14-24`
- **What:** Memoized on source-object identity (`WeakMap`). Formatting, mutating and formatting again returns the first result. Intended for immutable event payloads, but `formatMessage` is public and used directly by stream-chat-react.
- **Suggested change:** Document the immutability contract on the export, or key the memo on an `updated_at` / version check.

### Types and packaging

<a id="attachment-custom-required"></a>

#### `Attachment.custom` is required on requests

`bug` · confidence: high · pre-release: no · generated models

- **Where:** `src/gen/models/index.ts:598-599`
- **What:** The shared request/response `Attachment` interface requires `custom`, so every outgoing attachment needs `custom: {}`; the composer's `LinkPreview` / `OGAttachment` fail compatibility for the same reason.
- **Evidence / scenario:** Docs snippets and downstream compat checks: "Property 'custom' is missing in type 'LinkPreview'" (7x), attachment literals (15x).
- **Suggested change:** Make `custom` optional on the request side in the spec, or generate a separate request attachment type (widening, not breaking).

<a id="websocketimpl-type"></a>

#### `webSocketImpl: typeof WebSocket` rejects the `ws` package

`bug` · confidence: high · pre-release: no · configuration / packaging

- **Where:** `src/connection/wsConnection/types.ts:81`
- **What:** `ws` is the documented way to run on Node < 22, but its class lacks DOM `WebSocket` members such as `dispatchEvent`.
- **Evidence / scenario:** `{ client: { wsConnection: { webSocketImpl: WS } } }` with `import WS from 'ws'` fails with TS2322 (TS 6.0.3, `@types/ws` 8). Runtime works on Node 20.
- **Suggested change:** Type it as a minimal constructor (`new (url: string) => Pick<WebSocket, 'onopen' | 'onclose' | 'onerror' | 'onmessage' | 'send' | 'close' | 'readyState'>`) or document the cast.

<a id="state-store-drop-key"></a>

#### `@stream-io/state-store` selector that drops a key never notifies

`bug` · confidence: high · pre-release: no · external dependency

- **Where:** `node_modules/@stream-io/state-store/src/state-store.ts:76` (`doSelectionsEqual`, `@stream-io/state-store` 1.1.6); v9 `src/store.ts:86-90`
- **What:** Equality iterates only the new selection's keys, so a selection that loses a key while the remaining keys are unchanged compares equal. Behaviour swap, not a pure regression: v9's in-repo `StateStore` iterated only the previous keys, so it missed a selection that gains a key; v10 misses one that drops a key.
- **Evidence / scenario:** `store.subscribeWithSelector((s) => (s.loaded ? { a: s.a } : { a: s.a, b: s.b }), h)` then `partialNext({ loaded: true })`: `h` is not called. Probe (handler calls including the initial one): drop-key v9 2 / v10 1, add-key v9 1 / v10 2.
- **Suggested change:** Compare key counts or iterate the union of keys; fix in js-toolkit and raise the `^1.1.6` floor. A dependency patch plus a floor bump is non-breaking, so any 10.0.x.

<a id="dts-ambient-types"></a>

#### Shipped `.d.ts` needs `NodeJS` and DOM ambient types

`bug` · confidence: high · pre-release: no · packaging / types

- **Where:** `src/connection/wsConnection/StableWSConnection.ts:60, 66` (`NodeJS.Timeout` fields), `:14-20, 286, 611, 725` (`CloseEvent`, `ErrorEvent` in public signatures); `dist/types/messageComposer/attachmentManager.d.ts`, `dist/types/messageComposer/fileUtils.d.ts` (`FileList`)
- **What:** v10 dropped every `@types/*` runtime dependency (v9 got `@types/node` via `@types/ws`), but the declarations still name `NodeJS` and DOM-only types.
- **Evidence / scenario:** Browser or RN project with `skipLibCheck: false` and no `@types/node`: TS2503 `Cannot find namespace 'NodeJS'` in `StableWSConnection.d.ts` (2x). Node-only project (`lib: ["es2022"]`, `types: ["node"]`): TS2304 on `CloseEvent` / `ErrorEvent`, plus TS2304 `FileList` twice (`FileList` failed the same way in v9). Verified with TS 5.5.4 to 6.0.3. Only `skipLibCheck: false` projects see it.
- **Suggested change:** Type timers as `ReturnType<typeof setTimeout>`; replace DOM types in public signatures with narrow structural types (`{ code?: number; reason?: string }`, a `FileList`-free union) or make those handlers private / `@internal`. Non-breaking, so 10.0.x is fine.

### Downstream SDKs (found while auditing; fix in those repos)

<a id="react-listeners-map"></a>

#### React: chat context memo key reads `client.listeners` as an object

`bug` · confidence: high · pre-release: no · stream-chat-react

- **Where:** stream-chat-react `src/components/Chat/hooks/useCreateChatContext.ts:19`
- **What:** `Object.keys(client.listeners).length`, but `client.listeners` is now a `Map`, so the term is always 0 and the memo key no longer reacts to listener changes. RN removed the equivalent.
- **Suggested change:** `client.listeners.size`, or drop the term.

<a id="react-delete-path-params"></a>

#### React: delete fallback passes request fields as path params

`bug` · confidence: high · pre-release: no · stream-chat-react

- **Where:** stream-chat-react `src/components/Message/hooks/useDeleteHandler.ts:42`
- **What:** `client.deleteMessage({ id: message.id, ...options })` spreads `hard` / `delete_for_me` into `pathParams`.
- **Evidence / scenario:** With any delete option set, `resolveUrl` throws `"hard" is not a path parameter ...`. Only reached when `entity.messageOperations` is absent.
- **Suggested change:** `client.deleteMessage({ id: message.id }, options)`.

<a id="react-channel-api-response"></a>

#### React: test helpers import the removed `ChannelAPIResponse`

`bug` · confidence: medium · pre-release: no · stream-chat-react

- **Where:** stream-chat-react `src/components/ChannelHeader/__tests__/ChannelHeader.test.tsx:32`, `src/mock-builders/generator/channel.ts:3`, `src/mock-builders/api/getOrCreateChannel.ts:1`, `src/mock-builders/api/queryChannels.ts:1`
- **What:** The type no longer exists in v10, which suggests React's test files are not type-checked against the rc.
- **Suggested change:** Migrate to `ChannelStateResponseFields` and type-check tests in CI.

---

<a id="dead-code"></a>

## 3. Dead code and leftovers

Spot-checked 25 `deadcode.md` rows against source and the downstream trees (React `master`, RN `V10`, including tests and examples). The token method reports in-file use and type-only use in public signatures as "unreferenced"; those false positives are listed in [Dropped after re-check](#dropped).

### 3.1 Removal candidates before 10.0.0

Unused in `src` and not used downstream. Most are v10-only. The ones marked "v9 API" (`skipHydration`, `Moderation.unmuteUser`, the `MessageReceiptsTracker` event methods, and the [restated types](#lo-restated-types)) were v9 public surface: removing them is a breaking change vs v9, so decide before 10.0.0 and list any removal in v10-breaking-changes.md.

<a id="dc-prevent-thread-cleanup"></a>

#### `client.preventThreadCleanup` does nothing

`dead-code` · confidence: high · pre-release: yes · client

- **Where:** `src/client.ts:214-218`
- **What:** Public field read nowhere in `src` (v9 read it in `ChannelState`). RN V10 no longer sets it.
- **Suggested change:** Remove.

<a id="dc-skip-hydration"></a>

#### `ChannelStateOptions.skipHydration` is ignored

`dead-code` · confidence: high · pre-release: yes · client / types

- **Where:** `src/types.ts:115`; documented at `src/client.ts:1566-1567`
- **What:** Never read (dead in v9 too), but `queryChannelsAndHydrate`'s JSDoc says it "returns the raw query response". v9 API (v9 `src/types.ts:1212`): removing is a breaking change vs v9; decide before 10.0.0.
- **Suggested change:** Remove the field and the JSDoc line (or implement it).

<a id="dc-unmute-user"></a>

#### `Moderation.unmuteUser` changed meaning under the v9 name

`dead-code` · confidence: medium · pre-release: yes · moderation

- **Where:** `src/moderation.ts:91-93`
- **What:** One-line alias of the inherited `unmute({ target_ids: [targetId] })`. v9's second parameter was `options` (with `user_id`); v10's is `requestOptions`, so v9 callers compile and silently lose their options. `muteUser` is gone, so the pair is asymmetric. No src, test or downstream use (React calls `moderation.unmute`). v9 API (v9 `src/moderation.ts:135`): removing is a breaking change vs v9; decide before 10.0.0.
- **Suggested change:** Remove.

<a id="dc-throttle-options"></a>

#### `MessageDeliveryReporter.setMarkAsReadThrottleOptions`

`dead-code` · confidence: high · pre-release: yes · message delivery

- **Where:** `src/messageDelivery/MessageDeliveryReporter.ts:136-148`; JSDoc on `markAsReadThrottleTimeoutMs` (`:30`) and `buildThrottledMarkRead` point to it
- **What:** Wrapper around `updateConfig({ markAsReadThrottleTimeoutMs })`; its comment says "Kept as released surface", but it did not exist in v9 (rc-only). Not downstream.
- **Suggested change:** Remove and fix the two JSDoc references.

<a id="dc-paginator-plugin"></a>

#### `PaginatorPlugin` and `PaginatorItemsChangeProcessor`

`dead-code` · confidence: high · pre-release: yes · pagination

- **Where:** `src/pagination/paginators/BasePaginator.ts:285-328`
- **What:** Exported, v10-only, only consumer is a commented-out `plugins?` option with "todo: think whether plugins are necessary". `isLiveHeadInterval` / `isLiveTailInterval` are runtime exports used only in this file.
- **Suggested change:** Remove the two types; drop `export` from the two helpers. Keep `LogicalInterval`, `IntervalMergePolicy`, `MakeIntervalParams` (they name protected members).

<a id="dc-is-held"></a>

#### `EntityStore.isHeld`

`dead-code` · confidence: low · pre-release: yes · entity store

- **Where:** `src/entityStore/EntityStore.ts:179`
- **What:** Only tests call it; `EntityStore` is a new v10 root export, so this is new public surface.
- **Suggested change:** Remove or mark `@internal`. Keeping it is harmless.

<a id="dc-receipts-tracker"></a>

#### `MessageReceiptsTracker` event-ingestion methods

`dead-code` · confidence: medium · pre-release: yes · message delivery

- **Where:** `src/messageDelivery/MessageReceiptsTracker.ts:331` (`onMessageDelivered`), `:367` (`onMessageRead`), `:417` (`onNotificationMarkUnread`)
- **What:** No src callers: the tracker reconciles from `channel.state.read` (`:217-241`). Calling them from app code makes the tracker diverge until the next reconcile overwrites it. `onNotificationMarkUnread` has no downstream use; `onMessageDelivered` / `onMessageRead` are used by RN tests (`MessageStatus.test.tsx:132`, `receiptUserHooks.test.tsx:91`); React mentions them only in `specs/*.md`. v9 API: v9 `messageDelivery/MessageReceiptsTracker.ts:179, 213, 260` defined all three and v9 `channel.ts:2041, 2073, 2276` called them, so removing any of them (or marking it `@internal`) is a breaking change vs v9; decide before 10.0.0.
- **Suggested change:** Remove `onNotificationMarkUnread`; mark the other two `@internal` (or move RN tests to driving `channel.state.read`). Keep `ingestInitial` and the query methods.

<a id="dc-root-exports"></a>

#### New v10 root exports with no consumer

`dead-code` · confidence: low · pre-release: yes · public surface

- **Where:** `src/index.ts:34, 37, 39-40, 121`
- **What:** `mergeServerRestrictions`, `ServerRestrictions`, `ServerUpperBounds`, `ConfiguredInstance`, `NS_PER_MS` are new in v10, not used downstream (React defines its own `NS_PER_MS` in a test), and not needed to name a public signature. Removing them after 10.0.0 is breaking; adding later is not.
- **Suggested change:** Decide whether they are intended public API; otherwise drop them from the barrel.

<a id="dc-logger-scopes"></a>

#### `ChatLoggerScope` declares scopes nothing logs under

`dead-code` · confidence: high · pre-release: yes · logging

- **Where:** `src/logger.ts:12, 14`
- **What:** `'state-store'` (moved to the external package) and `'thread'` have no `getLogger(...)` call in `src`; 13 scopes are actually used. `docs/logging.md` lists both.
- **Suggested change:** Remove both members (and from the doc), or start logging under them.

### 3.2 Internal dead code (not exported; remove any time)

<a id="dc-internal"></a>

#### Unused internal helpers and dead branches

`dead-code` · confidence: high · pre-release: no · various

- **Where / What:**
  - `src/pagination/utility.search.ts:25, 62`: `locateOnPlateauAlternating`, `locateOnPlateauScanOneSide` referenced nowhere in `src` or `test`.
  - `src/pagination/utility.normalization.ts:89`: `normalizeStringAccentInsensitive` never called.
  - `src/channel.ts:2460, 2515`: `void userReadState;` after `_upsertReadState(...)`; the value is unused.
  - `src/ChannelManager.ts:165`: `if (!channel) return;` after `await ...ensureWatched()`, typed `Promise<Channel>` (`src/channel.ts:1595`).
  - `src/messageDelivery/MessageDeliveryReporter.ts:248-262`: thread branch of `getNextDeliveryReportCandidate` computes `latestMessages`, `lastReadAt`, `lastDeliveredAt` (behind a `@ts-expect-error`) and `key`, then returns `undefined` (same in v9).
  - `src/utils.ts:572`: `FIXME: we are returning an object that does not match LocalMessage` in `toDeletedMessage`'s hard-delete branch.
- **Suggested change:** Delete the helpers and dead statements; replace the delivery branch with an early `return` plus a short TODO; type the hard-deleted shape (`satisfies Partial<LocalMessage>`) and drop the FIXME.

### 3.3 Keep (used downstream)

<a id="keep-custom-command-data"></a>

#### `CustomCommandData` is augmented downstream but has no effect

`dead-code` · confidence: high · pre-release: yes · types

- **Where:** `src/custom_types.ts:6`
- **What:** Exported for augmentation but referenced nowhere in v10 `src` (v9 fed `CommandVariants`). React (`src/@types/stream-chat-custom-data.d.ts:23`) and RN (`package/src/types/stream-chat-common-custom-data.d.ts:24`, two examples) still augment it, so removal breaks their declaration files, yet the augmentation does nothing.
- **Suggested change:** Type `Command['name']` with it again, or remove it together with the downstream declarations.

<a id="keep-downstream"></a>

#### Members still used by downstream code, tests or examples

`dead-code` · confidence: high · pre-release: no · various

- **Where / What:** no src reader, but used downstream, so keep (or migrate the consumer first):
  - `AttachmentManager.fileToLocalUploadAttachment` (deprecated): RN `examples/ExpoChatGPTSample/screens/ChatContent.tsx:121`.
  - `AttachmentManager.uploadAttachment` (deprecated): runtime use in both UI SDKs. React `src/components/MediaRecorder/hooks/useMediaRecorder.ts:58`, `src/components/MessageComposer/AttachmentPreviewList/AttachmentPreviewList.tsx:99-141` (`handleRetry`), `VoiceRecordingPreviewSlot.tsx:39`; RN `package/src/components/MessageInput/components/AttachmentPreview/AttachmentUploadPreviewList.tsx:353-503`, `package/src/components/MessageInput/hooks/useAudioRecorder.tsx:111`.
  - `BasePaginator.next`, `hasNext`, `hasPrev` (deprecated shims): React `src/components/ChannelList/ChannelList.tsx:95` (`loadNextOnScrollToBottom={paginator.next}`), `src/components/InfiniteScrollPaginator/InfiniteScrollWithComponents.tsx:66-67` (see [shims](#lo-paginator-shims)).
  - `TextComposer.upsertMentionedUser` (deprecated): React `MessageInput.test.tsx:1750-1778`.
  - `MessageComposer.allowsPendingUploads`: React `examples/vite/src/Debug/ComposerStateInspector.tsx:140`. Now only an alias of `attachmentManager.config.pendingUploadsEnabled` (`src/messageComposer/messageComposer.ts:474-480`), still read by `hasSendableData`.
  - `MessageReceiptsTracker.onMessageDelivered` / `onMessageRead`: RN tests (see [above](#dc-receipts-tracker)).
  - `OfflineDBSyncManager.connectionChangedListener`: RN tests (see [rename](#connection-changed-listener)).
  - Opt-in middleware factories `createCommandInjectionMiddleware`, `createDraftCommandInjectionMiddleware`, `createActiveCommandGuardMiddleware`, `createCommandStringExtractionMiddleware`, and `replaceWordWithEntity`: used downstream.
  - `BUILT_IN_INSTANCE_KEYS`, `CONSTRUCTION_ONLY_CONFIG_PATHS`: see [@internal exports](#lo-internal-exports).
- **Suggested change:** Keep; for the deprecated ones, move the downstream use first, then remove in a later major.

<a id="keep-v9-unused"></a>

#### v9 exports now unused in src and downstream

`dead-code` · confidence: medium · pre-release: no · public surface

- **Where / What:** v9 public API, not broken in v10, but with no src and no downstream use (React has its own copies of the file helpers): `isOwnUser` (`src/utils.ts:82`), `readFileAsArrayBuffer` (`src/messageComposer/fileUtils.ts:55`), `RequireAtLeastOne` (`src/types.ts:51-53`, its only v9 user `TranslatedField` is gone), `extractPollEnrichedData` (`src/poll.ts:496`), `MiddlewareExecutor.installedMiddleware` (`src/middleware.ts:68`).
- **Suggested change:** Keep for v10 (removal is a v9 break with no v10 reason); consider `@deprecated` and removal in v11. If the team prefers a clean break, drop them in this major instead.

### 3.4 Migration leftovers

<a id="lo-client-aliases"></a>

#### Deprecated client aliases kept into the new major

`leftover` · confidence: medium · pre-release: yes · client

- **Where:** `src/client.ts:635` (`setUser`), `:897` (`disconnect`), `:1132` (`_updateUserReferences`), `:545-552` (`setMessageComposerSetupFunction`); error text `:581`
- **What:** Aliases of `connectUser`, `disconnectUser`, `_updateMemberWatcherReferences`, and `config.setSetupFunction('messageComposer', fn)`. None is used downstream (React migrated; RN only mentions the composer one in a comment). The `connectUser` error still says "Use client.disconnect()". Keep `userID`, `clientID`, `setUserAgent` (used downstream).
- **Suggested change:** Drop the four aliases before 10.0.0 or document them as kept for the v10 line; change the message to `disconnectUser()`.

<a id="lo-thread-mark-as-read"></a>

#### `Thread.markAsRead`

`leftover` · confidence: high · pre-release: yes · threads

- **Where:** `src/thread.ts:928-932`
- **What:** The v9 name, now a `@deprecated` alias of `markRead`. No src or downstream callers.
- **Suggested change:** Remove before 10.0.0 (and note the rename), or keep for the whole v10 line deliberately.

<a id="lo-thread-locally"></a>

#### Thread `*Locally` methods marked "remove with the next breaking change"

`leftover` · confidence: high · pre-release: yes · threads

- **Where:** `src/thread.ts:850-914` (`deleteReplyLocally`, `upsertReplyLocally`, `updateParentMessageLocally`, `updateParentMessageOrReplyLocally`); `:674-682, 858-865`
- **What:** Each carries "todo: can be removed with the next breaking change and use MessagePaginator only"; v10 is that change. Only the thread's own handlers (and offline `send-message` replay, `queueableOperations.ts`) call them; React and RN stopped. `upsertReplyLocally` ignores its `timestampChanged` parameter, yet `handleNewReply` still computes `isOwnMessage` to pass it.
- **Suggested change:** Make them private (or inline into the handlers); drop `timestampChanged` and the `isOwnMessage` computation.

<a id="lo-paginator-shims"></a>

#### Paginator and notification compat shims

`leftover` · confidence: high · pre-release: no · pagination / notifications

- **Where:** `src/pagination/paginators/BasePaginator.ts:237-249, 700-709, 3492-3529` (`next`, `prev`, `nextDebounced`, `prevDebounced`, `hasNext`, `hasPrev`, `PaginationQueryReturnValue.next/prev`); `src/notifications/types.ts:122-133`
- **What:** Deprecated shims shipped in the new major. React `master` still calls them at runtime on `ChannelPaginator`: `loadNextOnScrollToBottom={paginator.next}` (`src/components/ChannelList/ChannelList.tsx:95`) and `paginator.hasPrev` / `paginator.hasNext` (`src/components/InfiniteScrollPaginator/InfiniteScrollWithComponents.tsx:66-67`, through `PaginatorLike`). `NotificationState` is deprecated, yet `NotificationManagerState` is declared as an alias of it, so the deprecated name is the canonical definition.
- **Suggested change:** Keep them for the whole v10 line ([keep](#keep-downstream)); removing them first requires migrating React's ChannelList / InfiniteScrollWithComponents to `toTail` / `hasMoreTail` / `hasMoreHead`, so remove in v11. Invert the alias so `NotificationState` points at `NotificationManagerState` (non-breaking, any time).

<a id="lo-composer-deprecations"></a>

#### Composer deprecations and "next major" TODOs

`leftover` · confidence: high · pre-release: yes · composer

- **Where:** `src/messageComposer/attachmentManager.ts:144-156` (`fileUploadFilter` getter/setter), `:566` (`fileToLocalUploadAttachment`), `:689` (`uploadAttachment`), `:811` (`// todo: remove with the next major release`), `:187-189` (`hasCustomDoUploadRequest`); `src/messageComposer/textComposer.ts:331-356` (`upsertMentionedUser`, `getMentionedUser`, `removeMentionedUser`); `src/messageComposer/middleware/textComposer/types.ts:123` (`TextComposerState.mentionedUsers`); `src/messageComposer/types.ts:112` (`LocalImageAttachmentUploadMetadata.previewUri`)
- **What:** v9-era deprecations kept in the v10 major. `hasCustomDoUploadRequest` has no reader since `customCdn` replaced the custom-upload waiver and invites the v9 reading "custom fn = custom storage" (React mentions it only in an example comment). `previewUri` is widely used downstream; `fileToLocalUploadAttachment`, `uploadAttachment` (runtime use in React and RN) and `upsertMentionedUser` are used downstream (see [keep](#keep-downstream)). The deprecated `fileUploadFilter` getter is still read by the upload path (`:811`), so removing it removes the `config.fileUploadFilter` filter feature, not dead code.
- **Suggested change:** Decide per member: keep `uploadAttachment`; remove the unused `getMentionedUser`, `removeMentionedUser` and `hasCustomDoUploadRequest` (or deprecate it toward `usesStreamStorage`) now; remove `fileUploadFilter` only together with the `:811` filter path (filtering moves to middleware); re-target the TODOs on the used ones to v11 explicitly.

<a id="lo-online-status"></a>

#### `onlineStatusChanged` shims

`leftover` · confidence: low · pre-release: yes · connection

- **Where:** `src/connection/wsConnection/StableWSConnection.ts:502-530`, `src/connection/wsConnection/WSConnection.ts:339-345`
- **What:** `@deprecated` shims for the v9 window-listener path; network status flows through `client.networkConnection`. The JSDoc (`WSConnection.ts:339-341`, `StableWSConnection.ts:511`) says React Native still calls it, but RN V10 has no call left (it moved to a `statusReporter`).
- **Suggested change:** Remove both shims, or at least fix the JSDoc.

<a id="lo-next-major-notes"></a>

#### Other "next major" notes and stale TODOs

`leftover` · confidence: high · pre-release: no · various

- **Where / What:** `src/offline-support/offline_support_api.ts:489-490` ("This will change in the next major release" in `init`); `src/LiveLocationManager.ts:84` (`UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT`, a v9 export now only the seed of `DEFAULT_LIVE_LOCATION_MANAGER_CONFIG.minUpdateThrottleMs`). See also [ChannelStateOptions.withResponse](#doc-next-major-comments) and [queryChannels JSDoc](#doc-next-major-comments).
- **Suggested change:** Resolve the `init` note now or re-target it to v11; mark the constant `@deprecated` in favour of the config.

<a id="lo-stub-files"></a>

#### Comment-only stub modules

`leftover` · confidence: high · pre-release: no · repo hygiene

- **Where:** `src/campaign.ts:1`, `src/segment.ts:1`, `src/channel_batch_updater.ts:1`
- **What:** Each is a single comment ("... moved to the server-side SDK"); none is exported from `index.ts` or imported anywhere. They only emit empty `dist/types/*.d.ts` modules. `CLAUDE.md:75` still lists `channel_batch_updater.ts`.
- **Suggested change:** Delete the three files and the CLAUDE.md mention.

<a id="lo-internal-exports"></a>

#### `@internal` exports that are public in practice

`leftover` · confidence: high · pre-release: yes · public surface

- **Where:** `src/configuration/keys.ts` (`BUILT_IN_INSTANCE_KEYS`), `CONSTRUCTION_ONLY_CONFIG_PATHS`; `src/logger.ts:19-23` (`ScopedLogger`)
- **What:** `BUILT_IN_INSTANCE_KEYS` and `CONSTRUCTION_ONLY_CONFIG_PATHS` are `@internal` but root-exported and imported by React's vite example (`examples/vite/src/AppSettings/tabs/Configuration/configurationTree.ts`). `ScopedLogger` is `@internal` but root-exported (no downstream use).
- **Suggested change:** Either drop `@internal` (they are de facto public) or stop root-exporting them and move the React example off them.

<a id="lo-restated-types"></a>

#### Types that only restate a generated type

`leftover` · confidence: high · pre-release: yes · types

- **Where / What:**
  - `src/reminders/Reminder.ts:20`: `ReminderResponseBaseOrResponse = ReminderResponseData` (used in `Reminder.ts` / `ReminderManager.ts` only).
  - `src/types.ts:128-130` (`Automod`, `AutomodBehavior`), `:413` (`ThreadFilters`): unused in src and downstream.
  - `src/types.ts:46-49`: `RequireOnlyOne` duplicates the identical generated `RequireOnlyOne` (`src/gen/models/index.ts:120-123`) and shadows the star re-export.
  - `src/types.ts:59-68`: `APIResponse`, see [unbanUser](#unban-user).
- **v9 API:** `Automod`, `AutomodBehavior`, `ThreadFilters`, `ReminderResponseBaseOrResponse`, `RequireOnlyOne` and `APIResponse` are all v9 exports: removing them is a breaking change vs v9; decide before 10.0.0 (except `RequireOnlyOne`, whose identical generated twin stays exported under the same name).
- **Suggested change:** Use the generated names and drop the aliases (the `RequireOnlyOne` copy can go any time since the generated one stays exported).

---

<a id="simplifications"></a>

## 4. Simplifications

Non-breaking; land any time. Breaking simplifications are in [section 1](#fix-before).

<a id="engines-node"></a>

#### `engines.node >=22.18.0` blocks installs that would run

`simplification` · confidence: medium · pre-release: no · packaging

- **Where:** `package.json:107-108`
- **What:** The floor is the dev tooling's (type-stripped `.mts` build scripts, commit 40cf0629), but `engines` is consumer-facing. The runtime only needs a global `WebSocket`; the node-cjs bundle connects on Node 22.14.0. No consumer path needs 22.18: there is no `bin` and no `i18n` subpath in `exports`; only `prepare` (git-ref installs) runs the `.mts` scripts.
- **Evidence / scenario:** Yarn 1 refuses the install on Node 20 / 22.0-22.17; npm and pnpm warn. On Node 20, `connectUser` rejects with `WebSocket is not defined` unless `webSocketImpl` is injected (see [webSocketImpl typing](#websocketimpl-type)).
- **Suggested change:** Set `engines.node` to the runtime floor (`>=22`) and keep 22.18 in `.nvmrc` / `devEngines`. Loosening is non-breaking at any time. A `>=20` floor with a documented `webSocketImpl` is a weak option, since Node 20 is EOL (2026-04-30).

<a id="unban-user"></a>

#### `unbanUser` is the last hand-written v1 moderation call

`simplification` · confidence: high · pre-release: no · client / moderation

- **Where:** `src/client.ts:1839-1844`, `src/types.ts:59-68` (`APIResponse`)
- **What:** `unbanUser` still calls v1 `DELETE /moderation/ban` returning the legacy `APIResponse` envelope, while ban, mute and unmute moved to V2 `client.moderation.*`, which already has `unban`. `APIResponse`'s own comment says to delete it with these methods. RN V10 calls `client.unbanUser(id)` (`useMessageActionHandlers.ts:216`).
- **Suggested change:** Route through `this.moderation.unban({ target_user_id, ...options })` while keeping the `unbanUser(targetUserID, options?)` signature (non-breaking, any time). Deleting `APIResponse` is a v9 break, decided with the [restated types](#lo-restated-types).

<a id="offline-cache-key"></a>

#### Offline cache-key option is typed narrower than what is passed

`simplification` · confidence: medium · pre-release: no · offline support / types

- **Where:** `src/offline-support/types.ts:42-59` vs `:186-191`; writer `src/pagination/paginators/ChannelPaginator.ts:610-625`, reader `:655-664`; JSDoc `:596-603`
- **What:** Type-only. `DBUpsertCidsForQueryType.options` is declared `ChannelOptions` but receives the full `QueryChannelsRequest`. At runtime writer and reader both pass the full request as `options`, so they agree; the separate `filters` / `sort` exist deliberately for RN's `convertFilterSortToQuery`, which derives the row key from them.
- **Suggested change:** Type `options?: QueryChannelsRequest` on upsert (widening, non-breaking). Dropping `filters` / `sort` would break implementers and needs RN to derive the key from `options` first (plus a schema bump), so only do that before 10.0.0 or in v11.

<a id="connection-changed-listener"></a>

#### `OfflineDBSyncManager.connectionChangedListener` name is stale

`simplification` · confidence: low · pre-release: no · offline support

- **Where:** `src/offline-support/offline_sync_manager.ts:21-25`
- **What:** The field now holds a `wsConnection.state` subscription, not a `connection.changed` listener. RN's tests read and replace it (`package/src/components/Chat/__tests__/Chat.test.tsx:31-35`).
- **Suggested change:** Fix the field's JSDoc to say what it holds. A rename is cosmetic and breaks RN's tests, so it is not worth a pre-release change; rename in v11 if at all.

<a id="simp-hide-show"></a>

#### `Channel.hide()` / `show()` overrides only re-await `super`

`simplification` · confidence: high · pre-release: no · channel

- **Where:** `src/channel.ts:2113-2127`
- **What:** They only turn a sync throw into a rejection. `show`'s JSDoc says "Ensures the channel is initialized first", which it does not.
- **Suggested change:** Remove the overrides, or keep them deliberately and fix the doc.

<a id="simp-state-throttling"></a>

#### Message-list publish throttle depends on test-runner env vars

`simplification` · confidence: medium · pre-release: no · pagination

- **Where:** `src/pagination/paginators/stateThrottling.ts:11-25`
- **What:** Throttling (500 ms for message lists) is off whenever `VITEST`, `JEST_WORKER_ID` or `NODE_ENV === 'test'` is set, including in integrators' own test suites, so their tests see synchronous publishes that production never does.
- **Suggested change:** Default from configuration (`stateThrottleMs`) instead of environment sniffing, or document it.

<a id="simp-channel-non-null"></a>

#### Non-null assertions in channel query paths

`simplification` · confidence: medium · pre-release: no · channel

- **Where:** `src/channel.ts:1862, 1982` (`response.channel!`, `state.channel!`), also `:2836` (`channel.data!`)
- **What:** eslint-disabled `!` against the repo rule.
- **Suggested change:** Guard and throw a descriptive error when the response has no `channel`.

<a id="simp-orphan-jsdoc"></a>

#### Orphaned JSDoc block above `ownDeclarativeConfig`

`simplification` · confidence: high · pre-release: no · channel

- **Where:** `src/channel.ts:177-190`
- **What:** The "Frozen for the same reason ... `DEFAULT_CHANNEL_CONFIG`" block sits above another member's doc instead of `DEFAULT_CHANNEL_CONFIG` (`:215`).
- **Suggested change:** Move it.

<a id="simp-threads"></a>

#### Threads: duplicate resolve pass, assertions and a redundant map

`simplification` · confidence: medium · pre-release: no · threads / reminders / delivery

- **Where / What:**
  - `src/pagination/paginators/ThreadPaginator.ts:113-125`: `toStoredInstance` repeats `ThreadManager.resolveQueried` (`src/thread_manager.ts:197-204`), which `queryThreadsAndHydrate` already applies (`src/client.ts:2093-2095`); only matters for a standalone paginator with a private store.
  - `src/reminders/ReminderManager.ts:209-221`: `reminder!` assertions plus "TODO: OAPI discrepancy?" right after `isReminderWsEventPayload` already checked `!!event.reminder` (`:190-193`).
  - `src/thread.ts:129, 495-498, 872-878`: `failedRepliesMap` ("todo: do we really need the failedRepliesMap?"); `reload()` already reads failed replies from the paginator, only `hydrateState` uses the map.
  - `src/messageDelivery/MessageReceiptsTracker.ts:732`: `furthestRefByOthers` reads the deprecated `client.userID` (the test mock only provides `userID`).
- **Suggested change:** Delegate both resolve paths to one helper; make the guard a type predicate (`event is ReminderEvent & { reminder: ReminderResponseData }`); read pending replies from `messagePaginator.items` and drop the map; use `client.userId` and update the mock.

<a id="simp-composer"></a>

#### Composer cleanups

`simplification` · confidence: high · pre-release: no · composer

- **Where / What:**
  - `src/messageComposer/middleware/textComposer/mentions.ts:570-575`: `sort` initialised to the default then re-assigned the same default.
  - `src/messageComposer/textComposer.ts:166, 188, 201`, `src/messageComposer/linkPreviewsManager.ts:163`, `src/messageComposer/attachmentManager.ts:165`: the same 5-line "No early return on same value" comment pasted five times.
  - `src/messageComposer/messageComposer.ts:697-717`: `applyServerRestrictions` (`@internal`) is a one-line wrapper of the private `publishConfig`, kept for `Channel.query` (`src/channel.ts:2000`); its JSDoc admits the name is historical.
- **Suggested change:** `const sort = this.memberSort?.length ? this.memberSort.slice(0, 1) : [{ field: 'user_id', direction: 1 }]`; keep the comment once and reference it; expose one internal re-resolve method and drop the alias.

<a id="simp-search-branch"></a>

#### Redundant `userId` branch in `MessageSearchSource`

`simplification` · confidence: high · pre-release: no · search

- **Where:** `src/search/MessageSearchSource.ts:209-214`
- **What:** `...(this.client.userId ? { members: ... } : {})` right after `if (!this.client.userId ...) return`.
- **Suggested change:** Use `{ members: { $in: [this.client.userId] } }` unconditionally.

<a id="simp-bundle-script"></a>

#### Build script leftovers

`simplification` · confidence: high · pre-release: no · build

- **Where:** `scripts/bundle.mts:25-31, 134-140`
- **What:** `browserIgnoreModules: string[] = []; // Object.keys(packageJson.browser)` and its "ignored in browser field" comment survive the removed `browser` field, so `browserExternal` always equals `modules`. The `CLIENT_BUNDLE` comment lists `index.js` / `index.browser.cjs` / `index.node.cjs`; outputs are `index.mjs` / `index.browser.js` / `index.node.js`.
- **Suggested change:** Drop the filter and use `modules`; fix the comment.

<a id="simp-query-members"></a>

#### `Channel.queryMembers` spec-gap TODOs

`simplification` · confidence: low · pre-release: no · channel / spec

- **Where:** `src/channel.ts:660-672`
- **What:** "these should be probably optional in the OAPI spec" and a `user_id` cast in the hand-written wrapper.
- **Suggested change:** Fix the spec and drop the cast.

---

<a id="docs"></a>

## 5. Doc and comment mismatches

Only places that survive the guide cleanup: JSDoc and code comments, README, CHANGELOG, `docs/*.md`, `CLAUDE.md`, and the downstream React / RN migration guides. Mismatches that only concern the deleted root guides are dropped (see [Dropped](#dropped)).

### JSDoc and code comments

<a id="doc-next-major-comments"></a>

#### "Next major" comments in the major

`doc-mismatch` · confidence: high · pre-release: no · client / types

- **Where:** `src/client.ts:1501-1509` (`queryChannels`: "a compatibility bridge" for `queryChannelsRequest()`, consolidation "in the next major release"; that method is gone); `src/types.ts:116-123` (`ChannelStateOptions.withResponse`: "should be folded into a single full response API in the next major release")
- **Suggested change:** Rewrite both comments for v10, or do the folding now.

<a id="doc-channel-jsdoc"></a>

#### Wrong `@returns` and behaviour descriptions on channel methods

`doc-mismatch` · confidence: high · pre-release: no · channel

- **Where / What:**
  - `src/channel.ts:1301, 1504`: `markRead` / `markUnread` say "or `null` if the request was skipped"; both now throw.
  - `src/channel.ts:1281-1289`: `markReadViaReporter` says the reporter "batches" the request; it neither batches nor throttles (only `throttledMarkRead` throttles).
  - `src/channel.ts:2221-2223`: `on()` example logs `channel.state.messages` (removed).
  - `src/channel.ts:1096-1100`: `_syncMuteStatus` says `muteStatus()` requires initialization; it now requires only an id.
  - `src/client.ts:1156-1160`: `_deleteUserMessageReference` says hard delete "strips down" content; `applyMessageDeletionForUser` removes the messages (`MessageIntervalPaginator.ts:1419-1425`).
- **Suggested change:** Fix each; describe `markReadViaReporter` as "runs the reporter's mark-read path (custom handler, local fallback, delivery-candidate cleanup)" and use `channel.messagePaginator.items` in the example.

<a id="doc-channel-manager-todos"></a>

#### ChannelManager stale TODOs and typo

`doc-mismatch` · confidence: high · pre-release: no · channel manager

- **Where:** `src/ChannelManager.ts:118` (todo names non-existent `allowNewMessagesFromUnfilteredChannels`; v9 had `allowNotLoadedChannelPromotionForEvent`, v10 ships `ignoreEventsForUnknownChannels`), `:313` ("ingestig"), `:86` and `:1119` (unresolved todos)
- **Suggested change:** Resolve or remove the todos; fix the typo.

<a id="doc-offline-jsdoc"></a>

#### Offline support JSDoc drift

`doc-mismatch` · confidence: high · pre-release: no · offline support / moderation

- **Where / What:**
  - `src/offline-support/offline_support_api.ts:285`: `getChannelsForQuery` `@returns` says `Omit<ChannelStateResponseFields, 'duration'>[] | null`; it returns `DBGetChannelsForQueryResult | null` (`{ channels, predefinedFilter? }`).
  - `src/offline-support/types.ts:189`: `DBGetChannelsForQueryType.options` is commented "Optional filters for channels."; it is the full `QueryChannelsRequest` used as the cache key.
  - `src/offline-support/types.ts:31, 155, 167`, `src/moderation.ts:54`: bulk-rename artifacts ("MessageRequest to which the reaction is applied", "MessageRequest ID to be flagged", ...) where "message" is meant. (`src/moderation.ts:54` [SOLVED be73434c]; the `offline-support/types.ts` ones remain)
- **Suggested change:** Fix the `@returns` and describe `predefinedFilter`; reword the options comment; revert the artifacts to "message" and grep `MessageRequest ID\|MessageRequest to\|MessageRequest associated` across `src`.

<a id="doc-paginator-jsdoc"></a>

#### Paginator JSDoc

`doc-mismatch` · confidence: high · pre-release: no · pagination

- **Where / What:**
  - `src/pagination/paginators/BasePaginator.ts:719-722`: `isInitialized` says "has not performed any query so far" but returns `true` once a query shape was recorded.
  - `src/pagination/paginators/BasePaginator.ts:3260-3266`: the `next`/`prev` fallback "keeps non-migrated external subclasses working", but such subclasses reject in `getNextQueryShape()` (`:996-1000`) and, without `initialCursor`, their cursors are ignored (`:728-730`).
  - `src/thread_manager.ts:85, 318, 480`, `src/pagination/paginators/ThreadPaginator.ts:77`: comments compare against "`master`" as the baseline, which goes stale once v10 is `master`.
- **Suggested change:** Fix the `isInitialized` doc; reword the fallback comment to "accepts legacy `next`/`prev` keys for subclasses that implement `getNextQueryShape` and set `initialCursor`" (or drop the fallback); say "v9" instead of `master`.

<a id="doc-composer-comments"></a>

#### Composer and utils comments

`doc-mismatch` · confidence: high · pre-release: no · composer / utils

- **Where / What:**
  - `src/messageComposer/messageComposer.ts:138`: `MessageComposerOptions` still lists "legacy thread" as a composition context.
  - `src/messageComposer/messageComposer.ts:711`: typo "what it does is\* re-assert".
  - `src/utils/mergeWith/mergeWith.ts:10`: "merged into the ." (missing word); `src/utils/mergeWith/mergeWithCore.ts:59, 153`: comments read as pasted chat ("Keeps your existing semantics", "(your current rule)").
- **Suggested change:** Fix wording.

<a id="doc-timestamp-guard"></a>

#### Timestamp guard: "compile error" and `exclude` claims

`doc-mismatch` · confidence: high · pre-release: no · types / dates

- **Where:** `src/gen/models/timestamp-guard.ts:4, 6`; `src/index.ts:85-87`
- **What:** (a) "Makes `new Date(ns)` ... a compile error": `const d = new Date(ts)` compiles; it fails only when the result is used as a `Date` (probe, TS 5.5.4 and 6.0.3). (b) "`exclude` it to defer": for package consumers the guard is pulled in through `dist/types/index.d.ts` (`export type {} from './gen/models/timestamp-guard'`), and `exclude` does not drop files reached by import. The guard adds a `DateConstructor` overload to every consumer's global scope, which deserves a note in user-facing docs.
- **Suggested change:** Reword to "the result is not a `Date`; using it as one fails to compile", and say the guard always loads with the root entry.

### README, CHANGELOG, docs, CLAUDE.md

<a id="doc-readme"></a>

#### README examples use removed v9 APIs

`doc-mismatch` · confidence: high · pre-release: no · README

- **Where:** `README.md:46-48`, `:51-54`, `:91-101`
- **What:** `new StreamChat('API_KEY', { // ...options like baseURL or axiosRequestConfig })` (these now go under `client: {...}`); `client.upsertUser(...)` and `client.partialUpdateUser(...)` (removed; server-side); `channel.sendMessage({ text, custom_property })` and `message.custom_property` (v10 takes `{ message: {...} }` and custom fields live under `custom`).
- **Suggested change:** Rewrite Getting Started and the augmentation example for v10 (`connectUser`, `updateUsersPartial`, `custom.*`).

<a id="doc-dangling-links"></a>

#### Surviving docs link to the deleted guides

`doc-mismatch` · confidence: high · pre-release: no · docs

- **Where:** `docs/fileUpload.md:146`, `docs/logging.md:31`, `docs/instance-configuration.md:1064`, `docs/webhooks.md:41`, `CLAUDE.md:195`; historical mentions in `CHANGELOG.md:21, 401`
- **What:** All point at `v9-to-v10-migration-guide-*.md` or `docs/breaking-changes-v14-v15.md`, which are being deleted.
- **Suggested change:** Repoint to the published migration docs (or inline the needed sentence); leave the CHANGELOG entries as history or add a note.

<a id="doc-logging-scopes"></a>

#### `docs/logging.md` scope list

`doc-mismatch` · confidence: high · pre-release: no · docs

- **Where:** `docs/logging.md:23-26`
- **What:** Lists `state-store` and `thread`, under which nothing logs (see [ChatLoggerScope](#dc-logger-scopes)).
- **Suggested change:** Remove them from the list (with the type change).

<a id="doc-network-connection"></a>

#### `docs/network-connection.md` "Before" column mixes rc-only names

`doc-mismatch` · confidence: high · pre-release: no · docs

- **Where:** `docs/network-connection.md:262-265`
- **What:** `NetworkStatusListenerRegistrar` / `statusListenerRegistrar` and `new StreamChat(key, { WebSocketImpl, wsUrlParams })` appear as "Before", but neither `WebSocketImpl` nor the registrar existed in v9 (rc-only). v9 readers have nothing to migrate from there.
- **Suggested change:** Mark those rows as rc-only, or drop them.

### Downstream migration guides

<a id="doc-react-guide"></a>

#### React `ai-docs/ai-migration-v14-v15.md`

`doc-mismatch` · confidence: high · pre-release: no · stream-chat-react

- **Where:** stream-chat-react `ai-docs/ai-migration-v14-v15.md:31`, `:917-935`
- **What:** (a) Recommends "`channel.state.messages` for the raw channel state"; `ChannelState.messages` is removed. (b) Says `<Channel>` calls `channel.reload()` on `connection.recovered` and that "nothing in the client calls `reload()` for you"; React's `<Channel>` only activates (`src/components/Channel/Channel.tsx:53-58`), and `client.connectionRecovery` reloads every active channel and thread (`src/connection/ConnectionRecoveryManager.ts:36-40`). The suggested manual `client.on('connection.recovered', ...)` would reload twice.
- **Suggested change:** Point raw state at `channel.messagePaginator`; describe recovery as owned by `client.connectionRecovery` for active channels.

<a id="doc-rn-guide"></a>

#### RN `ai-docs/ai-migration-v9-to-v10.md`

`doc-mismatch` · confidence: high · pre-release: no · stream-chat-react-native

- **Where:** stream-chat-react-native `ai-docs/ai-migration-v9-to-v10.md:161, 463, 1628` (`client.activeChannels`), `:189, 1474-1477, 1685` (`deactivate()`)
- **What:** Recipes sum unread counts over `client.activeChannels` (removed; use `client.channelManager.values()`), and describe `channel.deactivate()` / `thread.deactivate()`; neither exists in v10 (`activate()` returns the release function, which RN's code already uses).
- **Suggested change:** Update the recipes and the K.4 / L.4 sections.

---

<a id="test-gaps"></a>

## 6. Test gaps

`test-gap` items; all confidence high unless noted; none is pre-release.

| Where                                                                            | Gap                                                                                                                                                                                         | Suggested change                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `test/unit/utils.test.js:6`                                                      | `describe.skip('generateUUIDv4')` (skipped in v9 too); its TODO says it fails on newer Node, so the no-`crypto` fallback is never tested.                                                   | Stub `crypto` instead of skipping.                             |
| `test/unit/pagination/paginators/BasePaginator.test.ts:1200`                     | `it.todo('... whe updateState === false')`: the `updateState: false` path is untested ("whe" typo).                                                                                         | Write the test.                                                |
| `test/unit/pagination/paginators/BasePaginator.test.ts:192`                      | Title "throws is the paginator does implement own getNextQueryShape" means "throws if ... does not implement".                                                                              | Fix the title.                                                 |
| `test/unit/pagination/paginators/MessagePaginator.test.ts:1630`                  | `describe.todo('postQueryReconcile and deriveCursor for', () => {})`: neither path is tested.                                                                                               | Write the tests.                                               |
| `test/unit/channel.test.js:2618`                                                 | Empty body: `it('does not override the delivery information in the read status', () => {})` (also empty in v9).                                                                             | Implement or delete.                                           |
| `test/unit/channel.test.js:3369-3373`                                            | Comment says "`client.search()` was removed - it forwarded to `client.search()`"; the removed method was `channel.search()`, and it did scope by `cid`.                                     | Fix the comment.                                               |
| `test/unit/messageDelivery/MessageDeliveryReporter.test.ts:475-480`              | "still requests when no local unread count was configured" mocks `markRead`, hiding that the real `channel.markRead()` throws for `read_events: false` and `markReadViaReporter()` rejects. | Assert the real rejection.                                     |
| `test/unit/offline-support/offline_support_api.test.ts:2900`                     | Title "should call \_createDraft for create-reaction task" tests `create-draft` (carried from v9).                                                                                          | Fix the title.                                                 |
| `test/unit/MessageComposer/linkPreviewsManager.test.ts:23, 33`                   | `vi.mock('../../src/utils')` and `vi.mock('../../src/utils/mergeWith')` resolve to `test/src/...` (nonexistent), so the mocks never apply.                                                  | Use `../../../src/...`.                                        |
| `test/unit/MessageComposer/attachmentManager.test.ts:18`                         | `import { beforeEach } from 'node:test'` instead of Vitest; such hooks never run.                                                                                                           | Import from `vitest`.                                          |
| `test/unit/MessageComposer/messageComposer.test.ts:1846, 1879`                   | "as not delivered" and "as not failed" have identical bodies (only the ms offset differs) and neither sets that status. Confidence medium.                                                  | Make each set the status it names.                             |
| `src/messageComposer/attachmentManager.ts:667`                                   | New throw "The upload succeeded but the response carried no file URL" has no test.                                                                                                          | Add one.                                                       |
| `src/search/MessageSearchSource.ts:259, 288`                                     | Both abort guards are untested since v9's "skips the channel hydration request when the query was aborted" was deleted.                                                                     | Restore the test.                                              |
| `test/unit/search/MessageSearchSource.test.ts:272-276, 324-328`                  | Pins the contradictory sort from [messageSearchSort](#message-search-sort). [SOLVED e32c8d5e]                                                                                               | Update with the fix.                                           |
| `test/unit/signing.test.js:33-36`                                                | "round-trips ... non-Latin-1 ids" only asserts no throw.                                                                                                                                    | Assert `UserFromToken(DevToken(id)) === id` for non-ASCII ids. |
| `src/channel.ts:2680`                                                            | No test covers `show_in_channel` reply edits ([item](#show-in-channel-edits)). [SOLVED dd1b8c7a]                                                                                            | Add one.                                                       |
| `src/thread_manager.ts:472-475`                                                  | No test covers unregister then register of the manager with loaded threads ([item](#thread-manager-reregister)).                                                                            | Add one.                                                       |
| `test/unit/messageDelivery/MessageReceiptsTracker.test.ts` (`createChannelMock`) | Mock provides only the deprecated `userID`, blocking the `userId` switch.                                                                                                                   | Provide `userId`.                                              |

---

<a id="dropped"></a>

## 7. Dropped after re-check

- **RN imports `PollResponse` with the old meaning** (s5-types-events 14, RN half): RN V10's `upsertPoll.ts` already imports `PollResponseData`; the remaining `PollResponse` use (`usePollState.ts:40`) types `poll.close()`'s return, which is the `{ duration, poll }` envelope in v10, so it is correct. React's `ChannelAPIResponse` half is kept ([item](#react-channel-api-response)).
- **`channel.lastReloadError` announced but missing** (doc-claims-b 24): only in the 8ec9a9d3 commit message, not in CHANGELOG or any surviving doc; nothing to fix.
- **`member.updated` watch storm** (s2-channel 6): kept but downgraded to low, since the scenario depends on the server delivering `member.updated` for unwatched channels ([item](#member-updated)).
- **`client.deleteReminder` lost `user_id`** (tests followups): server-side capability, removed by design with the rest of the server-side surface.
- **Unexplained snippet rewrite for silent messages** (snippets 11): low confidence, no behaviour difference identified.
- **Endpoint paths moved to `/api/v2/...`** (snippets 12) and **two config entry points in the docs snippets** (snippets 7): not code issues; they concern getstream.io docs and proxy setups.
- **v9 flaky skipped test** (tests followups): already replaced by a working test in v10.
- **Release notes should treat the `ChannelManager` rewrite as public** (tests followups): concerns release notes only.
- **StateStore "semantics preserved" commit body** (s6 doc row): commit text, not a surviving doc; the behaviour gap is kept as a [bug](#state-store-drop-key).
- **Dead-code false positives from the token scan:** `ChannelState.doSelectionsEqual` (inherited static from `StateStore`); `extractPollData`, `mapPollStateToResponse`, `MODERATION_ENTITY_TYPES`, `LANGUAGE_NAMES`, `accentsMap`, `removeDiacritics`, `isBlobButNotFile`, `getExtensionFromMimeType` (used in their own files); `StreamProgressEvent`, `QueryChannelsResponseWithChannels`, `InsertPosition`, `MiddlewareStatus`, `MiddlewareHandlers`, `TextComposerPreValidationMiddleware`, `PollComposerMiddlewareExecutorOptions`, `PreCommandMiddleware`, `CommandStringExtractionMiddleware` (name public signatures); `ignoreEventsForUnknownChannels` (public opt-in handler); downstream hits for `readFileAsArrayBuffer`, `getExtensionFromMimeType`, `isBlobButNotFile`, `NS_PER_MS`, `setUser` (React's own same-named helpers), `unmuteUser` (i18n keys and a test variable), `hasCustomDoUploadRequest` and `fileUploadFilter` (comments only).
- **Guide-only doc mismatches** (dropped per scope, since the root guides and `docs/breaking-changes-v14-v15.md` are being deleted): s1-client 15-22 and 25; s2-channel 24-25; s3a 16-19; s3b 12; s4-composer-utils 7 guide rows; s5-types-events 13; s6-packaging Node floor, `WebSocketImpl`, i18n dependency table and the dates-guide half of the `new Date(ns)` row (the src JSDoc half is [kept](#doc-timestamp-guard)); doc-claims-a 1-29; doc-claims-b 1-23. Their underlying code issues, where any, are kept above (e.g. `revokeTokens` semantics in [revoke-tokens](#revoke-tokens), `polls.enabled` in [polls-enabled](#polls-enabled)).
