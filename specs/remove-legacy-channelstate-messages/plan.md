# Plan — Remove legacy `ChannelState` message storage

See [`spec.md`](spec.md) for goal, gaps, and blast radius; [`decisions.md`](decisions.md) for open
scope decisions (offline handling in particular gates the final tasks).

## Worktree

**Worktree path (JS SDK — primary):** `../stream-chat-js-worktrees/remove-legacy-channelstate-messages`
**Branch:** `feat/remove-legacy-channelstate-messages`
**Base branch:** `feat/message-paginator-master-merge`
**Preview branch:** `agent/feat/remove-legacy-channelstate-messages`

React-side tasks (Task 8) run in a **separate** React worktree:
`../stream-chat-react-worktrees/remove-legacy-channelstate-messages`, branch
`feat/remove-legacy-channelstate-messages`, base `feat/message-paginator-master-merge`. Its
`node_modules/stream-chat` should point at the JS worktree above.

All work MUST happen in these worktrees, not the main checkouts. Create/sync via the worktrees skill.

## Task overview

Tasks are self-contained and run in dedicated worktrees. **`src/channel.ts` and `src/client.ts` are
serialization chokepoints** — each is edited across several phases, so their tasks form dependency
chains (only one agent touches a file at a time). Reader migrations that live in their own files run
in parallel. The critical path is: paginator capabilities → migrate every legacy reader → stop
dual-writing → delete the store → types/exports → tests.

---

## Task 1: Paginator capability parity

**File(s) to create/modify:** `src/pagination/paginators/MessagePaginator.ts`, `src/pagination/paginators/BasePaginator.ts`

**Dependencies:** None

**Status:** done

**Owner:** unassigned

**Scope:**

- Add a head-anchored **latest-window accessor** (e.g. `latestItems` / `lastItem`) that returns the
  newest loaded messages regardless of the active interval (gap 2) — the foundation for `lastMessage`
  and unread counting off the paginator.
- Add **partial truncation** (`truncated_at` cutoff clear) alongside the existing full
  `clearStateAndCache()` (gap 3).
- Confirm/adjust `isHead`↔`isUpToDate` parity for `message.new` routing of out-of-range messages
  (gap 7); document the mapping.

**Acceptance Criteria:**

- [ ] `latestItems`/`lastItem` returns head-window messages after a jump-to-message (unit test).
- [ ] Partial-truncate drops only messages older than `truncated_at`, keeps newer (unit test).
- [ ] `yarn types` + `yarn lint` clean.

---

## Task 2: `channel.ts` — seed paginator on all query paths + migrate derived readers

**File(s) to create/modify:** `src/channel.ts`

**Dependencies:** Task 1

**Status:** done

**Owner:** unassigned

**Scope:**

- Seed/update `messagePaginator` from `channel.query()` (direct), `channel.search()`, and
  `loadMessageIntoState` so the paginator always reflects fetched pages (gap 4). (`watch()` and
  `hydrateActiveChannels` already seed.)
- Re-point onto the paginator: `lastMessage()` (L1389), `countUnread()`/`countUnreadMentions()`
  (L1706/L1728) using Task 1's latest-window accessor, `_extendEventWithOwnReactions` `findMessage`→
  `messagePaginator.getItem` (L2895), and the `deleteReaction` offline read (L729).
- **Leave the legacy dual-writes in place** (removed later in Task 9) so this stays a safe, parity-only
  change.

**Acceptance Criteria:**

- [ ] `lastMessage`, `countUnread`, `countUnreadMentions` return identical results reading the
      paginator vs. the (still-present) legacy store — parity unit tests.
- [ ] A `query()`/`search()`/`loadMessageIntoState` call leaves `messagePaginator` populated.
- [ ] `yarn types` + `yarn lint` clean; `yarn test-unit` green vs. baseline.

---

## Task 3: `CooldownTimer` reader migration

**File(s) to create/modify:** `src/CooldownTimer.ts`

**Dependencies:** Task 1

**Status:** done

**Owner:** unassigned

**Scope:**

- `refresh()` (L105) reads `channel.state.latestMessages` for the own latest-message date — switch to
  the paginator's latest-window accessor.

**Acceptance Criteria:**

- [ ] Cooldown refresh derives the same own-latest-message date from the paginator (unit test).
- [ ] `yarn types` + `yarn lint` clean.

---

## Task 4: `messageDelivery` reader migration (both branches)

**File(s) to create/modify:** `src/messageDelivery/MessageDeliveryReporter.ts`, `src/messageDelivery/MessageReceiptsTracker.ts`

**Dependencies:** Task 1, Task 6

**Scope:**

- `MessageDeliveryReporter` channel branch (L137, `latestMessages`) → paginator latest-window; thread
  branch (L143, `Thread.state...replies`) → `thread.messagePaginator` (needs Task 6).
- `MessageReceiptsTracker.findMessageByTimestamp` (L186) → paginator-based lookup.

**Status:** done

**Owner:** unassigned

**Acceptance Criteria:**

- [ ] Delivery-candidate selection and receipt mapping unchanged vs. legacy (unit tests).
- [ ] `yarn types` + `yarn lint` clean.

---

## Task 5: `client.ts` — `_updateUserReferences` reader migration

**File(s) to create/modify:** `src/client.ts`

**Dependencies:** Task 1

**Status:** done

**Owner:** unassigned

**Scope:**

- `_updateUserReferences` (L1487) currently calls `state.updateUserMessages` across all active
  channels. Provide a paginator-based equivalent that patches cached messages' user data (via
  `messagePaginator` item index). Leave the legacy call until Task 10 (chokepoint chain on `client.ts`).

**Acceptance Criteria:**

- [ ] Updating a user propagates to cached paginator messages across active channels (unit test).
- [ ] `yarn types` + `yarn lint` clean.

---

## Task 6: `thread.ts` — make the paginator the reply source of truth

**File(s) to create/modify:** `src/thread.ts`

**Dependencies:** Task 1

**Status:** out-of-scope (threads excluded from this initiative)

**Owner:** unassigned

**Scope:**

- Migrate `Thread.state.replies` consumers to `thread.messagePaginator.items`; retire
  `upsertReplyLocally`/`deleteReplyLocally`/`failedRepliesMap` double-bookkeeping (thread.ts L494-705,
  L776 NOTE), keeping WS reply sync on the paginator.
- Expose whatever accessor `MessageDeliveryReporter` (Task 4) needs for the thread branch.

**Acceptance Criteria:**

- [ ] Thread reply list, optimistic send, and failed-reply retry work off the paginator (unit tests).
- [ ] `yarn types` + `yarn lint` clean; thread tests green vs. baseline.

---

## Task 7: `channel.ts` — decouple `getReplies` from `ChannelState.threads`

**File(s) to create/modify:** `src/channel.ts`

**Dependencies:** Task 2, Task 6

**Status:** out-of-scope (threads excluded from this initiative)

**Owner:** unassigned

**Scope:**

- `Channel.getReplies` (L1600) writes `state.addMessagesSorted` (populating `ChannelState.threads` +
  sets). Route replies to `thread.messagePaginator` (Task 6) instead; stop writing `ChannelState`.
- Same-file chain after Task 2.

**Acceptance Criteria:**

- [ ] `getReplies` populates the thread paginator, not `ChannelState.threads` (unit test).
- [ ] `yarn types` + `yarn lint` clean.

---

## Task 8: React SDK — migrate readers to `messagePaginator`

**File(s) to create/modify (React repo):** `src/context/MessageBounceContext.tsx`, `src/components/ChannelListItem/{utils.tsx,ChannelListItem.tsx,ChannelListItemUI.tsx}`, `src/components/MessageList/hooks/useMarkRead.ts`

**Dependencies:** None (reads `channel.messagePaginator`, already populated for listed channels)

**Status:** done

**Owner:** unassigned

**Scope:**

- Replace `channel.state.removeMessage` (MessageBounceContext) with the paginator remove.
- Replace last-message/preview/title reads (`ChannelListItem` family) and `useMarkRead`'s
  `latestMessages.slice(-1)` with `channel.messagePaginator` accessors.
- Update `stream-chat-react/CLAUDE.md` "DO NOT" guidance that references `addMessageSorted`/
  `state.messages` (also flag the JS `CLAUDE.md`; JS docs handled in Task 14).

**Acceptance Criteria:**

- [ ] No `state.messages`/`latestMessages`/`addMessageSorted`/`removeMessage` in `stream-chat-react/src`.
- [ ] React `yarn types` + `yarn lint-fix` clean; example builds; headless vite check renders channel
      previews and mark-read correctly.

---

## Task 9: `channel.ts` — stop dual-writing legacy in event handlers + `_initializeState`

**File(s) to create/modify:** `src/channel.ts`

**Dependencies:** Task 7, Task 3, Task 4, Task 5, Task 6, Task 8 (all readers migrated), Task 15 if offline in scope

**Status:** done

**Owner:** unassigned

**Scope:**

- Remove legacy twins from WS handlers (`message.new/updated/deleted`, reactions, `user.messages.deleted`,
  `channel.truncated` → use Task 1 partial-truncate, `channel.hidden`) and from `_initializeState`,
  keeping only the `messagePaginator` calls. Re-home non-message side effects (`last_message_at`
  update, `pinnedMessages` handling stays via its own methods).

**Acceptance Criteria:**

- [ ] All message WS events reflected via the paginator only; pinned/read/members/typing unaffected.
- [ ] `yarn test-unit` green vs. baseline (channel event tests updated in Task 13).

---

## Task 10: `client.ts` — stop dual-writing in `hydrateActiveChannels`

**File(s) to create/modify:** `src/client.ts`

**Dependencies:** Task 5, Task 9

**Status:** done

**Owner:** unassigned

**Scope:**

- Drop `_initializeState`/`clearMessages`/`messageSetPagination` message seeding in
  `hydrateActiveChannels` (L2292-2319), keeping only `postQueryReconcile` (paginator). Keep poll/reminder
  hydration sourced from the raw API response rather than `channelState.messages`.

**Acceptance Criteria:**

- [ ] `queryChannels` seeds only the paginator; polls/reminders still hydrate.
- [ ] `yarn types` + `yarn lint` clean; `yarn test-unit` green vs. baseline.

---

## Task 11: Delete the storage from `ChannelState` + `utils.messageSetPagination`

**File(s) to create/modify:** `src/channel_state.ts`, `src/channel.ts`, `src/client.ts`, `src/thread.ts`,
`src/utils.ts`, `src/pagination/paginators/MessagePaginator.ts`, `src/offline-support/offline_support_api.ts`

**Dependencies:** Task 9, Task 10 (and Task 15 if offline in scope)

**Status:** in progress — reaction sub-steps 1-2 done; **step 3a DONE** (main message-list
storage removed); **step 3b DONE** (`channel.state.threads` removed, thread-only methods deleted,
thread reply `own_reactions` + user-deletion re-homed onto the `Thread` object; both suites green).
`addMessagesSorted`/`addMessageSorted` remain as a slim channel-meta path (`last_message_at` +
user-reference map) for full deletion after Task 13.

**Owner:** claude

**Scope:**

- Remove `messageSets`, `messages`/`latestMessages` accessors, all pure message-set methods + private
  geometry helpers, and the `threads` record (see `spec.md` scope list). Split `clearMessages` so the
  `pinnedMessages` reset survives (e.g. `clearPinned`). Remove `messageSetPagination` from `utils.ts`.
- Resolve `pending_messages` per `decisions.md` #3.

**`channel.state.threads` REMOVED (confirmed with owner):** the `Thread` object already owns reply
state (`Thread.state.replies` + `Thread.messagePaginator`, with its own message/reaction subscriptions),
so `channel.state.threads` is a redundant legacy shadow. Removing it lets the shared methods be DELETED
outright rather than kept for threads. Formerly-out-of-scope Tasks 6/7 fold in here.

**Key coupling — `own_reactions`:** today `ChannelState.addReaction`/`removeReaction` stop a cross-user
reaction WS event from wiping the current user's `own_reactions` by reading the local cache
(`state.messages` / `state.threads`). With both caches gone this preservation is re-homed onto the
paginators (owner-approved).

**Execution sequence (verified sub-steps):**

1. **[DONE]** Add `MessagePaginator.reflectReaction({ message, reaction, removed, enforceUnique })` — read the
   cached item via `getItem`, preserve the current user's `own_reactions`, apply the incoming reaction, ingest.
   Reused by both the channel- and thread-level reaction handlers. Added 4 unit tests (cross-user preserve,
   own-reaction add, delete-removal, other-user-not-added). Purely additive — JS 3538 pass/0 fail, types+lint clean.
2. **[DONE]** Rewire the **channel** reaction handlers (`reaction.new/deleted/updated`): the paginator path is
   now `channel.messagePaginator.reflectReaction` (was `ingestItem(enriched event.message)` — behavior-equivalent).
   `channelState.addReaction/removeReaction` are kept for now purely for their `pinnedMessages` side-effect
   (dropped in step 3). **Thread reply reactions are NOT rewired here:** the thread UI reads
   `Thread.state.replies` (not `Thread.messagePaginator`), and today reply `own_reactions` are preserved because
   the channel's `addReaction` enriches the shared `event.message` before the Thread's handler runs. That
   preservation must move onto `Thread.state.replies` — done in step 4/5 together with removing
   `channel.state.threads` (when the channel stops enriching reply events). A paginator-level
   `reflectReaction` on the Thread would not fix the `state.replies`-based UI.
   The remaining removal is split into **3a** (main message list, threads retained) and **3b**
   (threads) so each lands with a green suite.

3. **[DONE] Step 3a — remove the main message-list storage; retain `channel.state.threads`.**
   - Removed `messageSets` / `messages` / `latestMessages` accessors + all pure message-set methods and
     geometry helpers; `addMessagesSorted`/`addMessageSorted` shrunk to shadow-skip + format +
     `updateUserReference` + stale-thread-cleanup + `last_message_at` + thread population.
     `removeMessage`/`findMessage`/`_updateQuotedMessageReferences` are thread-only; `_updateMessage`,
     `deleteUserMessages`, `updateUserMessages` are thread+pinned; `clearMessages` clears pinned only.
   - Removed `utils.messageSetPagination` (+ helpers/type/unused imports).
   - Rewired writers/callers: `message.new/updated/deleted`, `channel.truncated`, `channel.hidden`,
     `_initializeState` (no set param/return), `query`/`queryChannels` seeding via `seedFirstPageSync`,
     `client._deleteUserMessageReference`. Channel + client reaction/deletion handlers act on
     `channel.messagePaginator` (`reflectReaction` / `applyMessageDeletionForUser`).
   - Full test surgery in both repos: deleted message-set machinery specs, re-scoped surviving
     deleteUser/updateUser + #1736 self-quote coverage to threads + pinned, migrated event/query tests
     to the paginator. JS 2605 pass, React 2517 pass; `yarn types` + `yarn lint` clean in both.
   - Commits: JS `caba066b` (src) + `c238323f` (tests); React `a61e634d4` (readers) + `79e26c037` (test).
4. **[DONE] Step 3b — remove `channel.state.threads` + delete the thread-only methods.**
   - Removed the `threads` property and every thread code path. Deleted `removeMessage`, `findMessage`,
     `_updateQuotedMessageReferences`/`removeQuotedMessageReferences`, and the reaction-state helpers
     `_addReactionToState`/`_removeReactionFromState`. `_updateMessage`, `updateUserMessages`,
     `deleteUserMessages`, `addReaction`/`removeReaction` are now **pinned-only**.
   - `addMessagesSorted`/`addMessageSorted` kept as a slim channel-meta path (records the user
     reference + advances `last_message_at`, no thread population); `timestampChanged`/`initializing`
     retained only for positional-call compatibility. Full deletion deferred to after Task 13.
   - Re-homed onto the `Thread` object (owner-approved): reply reaction `own_reactions` via
     `Thread.messagePaginator.reflectReaction`; reply `message.updated` own_reactions preserved from the
     existing reply; and a new `user.messages.deleted`/`user.deleted` subscription that calls
     `Thread.messagePaginator.applyMessageDeletionForUser`. The channel no longer enriches reply events
     (`_extendEventWithOwnReactions` + reaction handlers are main-only via the paginator).
   - `getReplies` no longer writes `channel.state.threads` (Thread owns replies). `offline_support_api`
     reply upsert already targets the Thread; its `addMessageSorted` call is now channel-meta only.
   - Test surgery: deleted the thread/`_addReactionToState`/`_removeReactionFromState`/`findMessage`
     `ChannelState` specs and thread-scoped event tests; added Thread coverage for reply own_reactions
     preservation and banned-user reply deletion. JS 2583 pass, React 2517 pass; `yarn types` + `yarn lint`
     clean in both. (Uncommitted — pending review.)

**Acceptance Criteria:**

- [ ] `ChannelState` retains only non-message stores (read, members, watchers, typing, pinned, pending); file compiles.
- [ ] No `messageSets`/`messages`/`latestMessages`/`threads`/`addMessageSorted`/etc. remain in `stream-chat/src`.
- [ ] Cross-user reactions preserve the current user's `own_reactions` (channel + thread), verified by tests.
- [ ] Both suites green vs. baseline; types + lint clean.

---

## Task 12: Types & public exports

**File(s) to create/modify:** `src/types.ts`, `src/index.ts`, `src/channel_state.ts` (type anchor)

**Dependencies:** Task 11

**Status:** DONE (uncommitted — pending review). Both suites green, `yarn types` + `yarn lint` clean.

**Owner:** claude

**Scope (as executed — deviates from the original assumptions below):**

- Resolved the `ReturnType<ChannelState['formatMessage']>` anchor: retyped `pinnedMessages` and the
  remaining `_updateMessage`/`_addToMessageList`/`removeMessageFromArray` signatures to `LocalMessage`
  (equivalent — the `formatMessage` util returns `LocalMessage`). `ChannelState.formatMessage` stays.
- Removed the dead `MessageSet` object-shape type from `types.ts` (public via `export * from './types'`
  → **breaking**) and the internal-only `DEFAULT_MESSAGE_SET_PAGINATION` from `constants.ts`
  (not re-exported → non-breaking).
- **Kept** `MessageSetType` — still the type of `channel.query`'s `messageSetToAddToIfDoesNotExist`
  param, which drives paginator seeding (`'latest'` seeds the first page; `'current'`/`'new'` do not).
- **Kept** `isLatestMessageSet` / `isLatestMessagesSet` — live flags on the `channels.queried` event
  and the offline `upsertChannels` payload ("is this the latest page"), not the removed storage.
- **Kept** `binarySearchByDateEqualOrNearestGreater` (public util, now internally unused): removing it
  is a gratuitous breaking change unrelated to the storage removal — flagged for the owner to decide.
- `BREAKING CHANGE:` footer to be applied on the commit for this task (documents the ChannelState
  message-storage + `MessageSet` removal); triggers the major release for the whole 3a/3b/12 series.

**Acceptance Criteria:**

- [x] `yarn types` clean across `src`; dead `MessageSet`/`DEFAULT_MESSAGE_SET_PAGINATION` removed;
      `BREAKING CHANGE` to be documented on commit.

---

## Task 13: Tests — rewrite/remove legacy suites + add parity suites

**File(s) to create/modify:** `test/unit/channel_state.test.js`, `test/unit/channel.test.js`, `test/unit/client.test.js`, `test/unit/CooldownTimer.test.ts`, `test/unit/offline-support/offline_support_api.test.ts`, `test/unit/poll_manager.test.ts`, `test/typescript/response-generators/message.js`

**Dependencies:** Task 11, Task 12

**Status:** pending

**Owner:** unassigned

**Scope:**

- Rewrite/remove `channel_state.test.js` (message-set suites gone; keep non-message coverage). Update
  `channel.test.js`/`client.test.js`/others to assert against the paginator. Fold the parity tests
  authored in Tasks 1-7 into permanent coverage.

**Acceptance Criteria:**

- [ ] `yarn test-unit` green; no test references `messageSets`/`addMessageSorted`/`state.messages`.

---

## Task 14: Docs

**File(s) to create/modify:** `CLAUDE.md` (JS), `stream-chat-react/CLAUDE.md`, `developers/*` as needed

**Dependencies:** Task 12

**Status:** pending

**Owner:** unassigned

**Scope:**

- Remove/replace stale "use `channel.state.addMessageSorted()`/`removeMessage()`/`state.messages`"
  guidance; document `messagePaginator` as the source of truth.

**Acceptance Criteria:**

- [ ] No stale legacy-storage guidance in either `CLAUDE.md`.

---

## Task 15 (GATED): Offline-support migration → see sub-plan

**Expanded into its own spec:**
[`../migrate-offline-to-messagepaginator`](../migrate-offline-to-messagepaginator/plan.md).

**Dependencies:** Task 1 — **decision-gated** (see `decisions.md` D1). If the storage is deleted
(Task 11), the sub-plan's **parity tranche (O1, O3, O5) is a required predecessor of Task 11**, because
Task 11 removes the `addMessageSorted` the offline replay path calls. If descoped, Task 11 must instead
retain a compatibility path (conflicts with hard removal).

**Status:** planned (see sub-plan; enhancement tranche blocked on decision D-OFF-1)

**Owner:** unassigned

**Summary (full detail in the sub-plan):** offline message _reads_ and _writes_ already flow through
channel hydration + `upsertChannels` (response-driven), so **parity needs no interface change** — only
severing narrow legacy couplings (send-message replay, `isLatestMessagesSet` flag, `filterErrorMessages`
DB cleanup, reaction-delete read, cold-start seed). A cursor-aware offline read for older-page
pagination is a **gated, breaking** enhancement requiring RN/mobile coordination.

**Acceptance Criteria:**

- [ ] Sub-plan parity tranche (O1–O6, O8) complete; offline tests green with a `MockOfflineDB`.

---

## Task 16 (OPTIMIZATION, non-blocking): author index for O(1) per-user updates

**File(s) to create/modify:** `src/pagination/ItemIndex.ts` (or `src/pagination/paginators/MessagePaginator.ts`)

**Dependencies:** Task 5. **Not** gating Task 11 — a performance follow-up that can land any time after Task 5.

**Status:** pending

**Owner:** unassigned

**Scope:**

- `MessagePaginator.reflectUserUpdate(user)` (Task 5) — and later per-user operations such as
  `applyMessageDeletionForUser` and the `deleteUserMessages` migration — currently scan
  `_itemIndex.values()` (every cached message) to find a single user's messages: O(all cached).
- Maintain an **author secondary index** `userId → Set<messageId>`, updated on ingest/remove, so
  these become O(that user's cached messages). Options: (a) a message-aware secondary index owned by
  `MessagePaginator`, or (b) generalize `ItemIndex` to accept optional secondary key extractors
  (e.g. `getSecondaryKeys`). Prefer whichever keeps `ItemIndex` generic and the messages concern in
  `MessagePaginator`.
- Re-point `reflectUserUpdate` (and any other per-user scans) at the author index.

**Acceptance Criteria:**

- [ ] `reflectUserUpdate` no longer iterates all cached messages; unit test asserts only the target
      user's messages are visited (e.g. via a spy/counter) and behavior is unchanged.
- [ ] `yarn types` + `yarn lint` clean; full suite green.

---

## Task 18 (FOLLOW-ON): `channel.state.pinnedMessages` → `channel.pinnedMessagesPaginator`

**File(s):** `src/pagination/paginators/PinnedMessagePaginator.ts` (new), `src/channel.ts`, `src/channel_state.ts`,
`src/client.ts`, stream-chat-react pinned views. **Dependencies:** Task 11. **Status:** planned. **Owner:** unassigned

**Why a dedicated paginator, not a bare `MessagePaginator` + filters:** pinned messages use a _different
endpoint_ (`channel.getPinnedMessages` → `/pinned_messages`) with `PinnedMessagePaginationOptions` (id-based
cursors) and `PinnedMessagesSort`, and sort by `pinned_at` — whereas `MessagePaginator.buildFilters()`, its
`created_at` sort, and its `query()` (→ `channel.query({messages})`) are baked for the main list. You can't pass
those in to a vanilla instance; they're methods to override.

**Recommended design:** `class PinnedMessagePaginator extends MessagePaginator`, overriding:

- `buildFilters()` → `{ cid, pinned: true }` and `shouldIncludeMessageInInterval()` → `!shadowed && !!pinned`.
- item comparator → `pinned_at` (desc), `query()`/`doRequest` → `channel.getPinnedMessages(options, sort)`,
  `getNextQueryShape` + cursor derivation → id-based.
- Reuses the interval store + `ingestItem` + `reflect*` (`reflectReaction`/`reflectQuotedMessageUpdate`/
  `reflectUserUpdate`/`applyMessageDeletionForUser`).
- **Navigation IS kept:** `PinnedMessagePaginationOptions` supports `id_around`, so `jumpToMessage` (and
  `jumpToTheLatestMessage`, i.e. most-recently-pinned) are meaningful for pinned and remain exposed.

**MUST NOT expose or touch read/unread state.** Read/unread + delivery receipts belong to the channel and thread
message timelines — never to a _subset_ like pinned. Concretely, `PinnedMessagePaginator`:

- overrides `postQueryReconcile` so the first-page reconcile does **not** call `seedUnreadSnapshot` (the base
  seeds the unread snapshot from `channel.state.read` on the first page — wrong for pinned);
- does **not** surface `unreadStateSnapshot`, `seedUnreadSnapshot`/`setUnreadSnapshot`, `jumpToTheFirstUnreadMessage`,
  or the `unreadReferencePolicy` option (unread-coupled — as opposed to the plain `id_around` `jumpToMessage`, which stays);
- is **not** wired into `MessageReceiptsTracker` (the tracker resolves read/delivered cursors via the _channel's_
  `messagePaginator.findItemByTimestamp`; the pinned paginator must never be a receipts source or target).

**This read/unread carve-out is the strongest argument for the alternative factoring:** rather than subclassing
`MessagePaginator` and _suppressing_ its unread surface, extract the unread/read-snapshot concern out of
`MessagePaginator` into a separate composable piece (mixin or companion), leaving a clean message-interval base
(interval store + `ingestItem` + `reflect*` + `jumpToMessage`/`jumpToTheLatestMessage` navigation). Then the
channel/thread **main** paginators compose the unread concern, and `PinnedMessagePaginator` extends the clean base
and simply never gets it — no suppression needed, no accidental `channel.state.read` coupling.

- _Recommended:_ the extraction (clean, prevents unread leaking into pinned by construction).
- _Lower-effort fallback:_ `extends MessagePaginator` + explicitly override/no-op the unread surface listed above
  (works, but the unread API technically still exists on the pinned instance and must be kept inert).

**Pin/unpin comes for free:** `matchesFilter({ pinned: true })` makes `ingestItem` auto-add on pin and
auto-remove on unpin — so the channel `message.new/updated/deleted` handlers just also feed
`pinnedMessagesPaginator.ingestItem(...)` (and `channel.truncated` prunes via `truncate`); reactions go through
its `reflectReaction`. No bespoke pin/unpin logic.

**Follow-through:** seed from `ChannelAPIResponse.pinned_messages` on open; migrate the React pinned views
(`PinnedMessagesView`, `usePinnedMessagesSearch`, `usePinnedMessagesCount`, `slotBinding`) to the paginator;
delete `channel.state.pinnedMessages` + `addPinnedMessage(s)`/`removePinnedMessage`. This then lets Task 11's
"shrink to pinned-only" methods (`_updateMessage`/`updateUserMessages`/`deleteUserMessages`) be **deleted
outright**. Breaking public-API change → Task 12 (exports/semver) + Task 14 (docs).

---

## Task 19 (ENHANCEMENT): reactive `headItems` on `PaginatorState` (generic base level)

**File(s) to create/modify:** `src/pagination/paginators/BasePaginator.ts` (+ its unit test)

**Dependencies:** none (independent base-paginator capability; unblocks reactive "latest message"/
"latest messages" UI reads sourced from the paginator instead of `channel.state`)

**Status:** pending

**Owner:** unassigned

**Motivation:** `latestItems`/`latestItem` are non-reactive getters computed on demand from
`itemIntervals`, so a UI subscribing via `useStateStore(paginator.state, selector)` cannot react to
changes in the newest-loaded window (new/edited/removed latest message, truncation, etc.). Expose the
head window as a reactive field so consumers can select it. Generic on `BasePaginator` so every
paginator (message, thread reply, pinned, channel-list, reminders) benefits.

**Scope:**

- Add `headItems?: T[] | undefined` to `PaginatorState<T>` and default it to `undefined` in
  `initialState` (mirrors `items`: `undefined` until the first load).
- Materialize it centrally. There is no single items-emission choke point (many `state.partialNext`
  sites) and the `onBeforeItemsEmitted` plugin hook is declared but never invoked, so use a
  `StateStore` **preprocessor** registered in the `BasePaginator` constructor: on each emission compute
  the current head window (reuse the `latestItems` logic — head-most loaded interval in interval mode,
  full list in flat mode) and assign it to `nextValue.headItems`.
  - **Reference stability:** guard with a shallow (length + per-index `getItemId`) comparison against
    the previous `headItems`; when unchanged, keep the previous array reference so selectors don't
    re-fire on unrelated state changes (`isLoading`, `lastQueryError`, cursor). This matters because
    the preprocessor runs on every `next()`, not only on `items` changes.
  - Recompute from intervals (not gated on the active `items` reference) so the head window updates
    even when the active window is a jumped-to older interval — the whole point for "latest message".
- Re-home `latestItems`/`latestItem` onto the field: `get latestItems()` returns
  `state.headItems ?? []`; `latestItem` returns its head edge. Keeps a single source of truth and makes
  both consistent with the reactive value. (Verify parity against the existing getter behavior first.)

**Acceptance Criteria:**

- [ ] `state.headItems` is `T[] | undefined`, `undefined` before first load, and updates reactively when
      the newest-loaded window changes (ingest/remove/truncate/new-page), verified by a unit test that
      subscribes and asserts emission.
- [ ] Selecting `headItems` does **not** re-fire on `isLoading`-only or other non-head state changes
      (reference-stable when the window is unchanged).
- [ ] `latestItems`/`latestItem` remain behavior-equivalent; `yarn types` + `yarn lint` + `yarn test-unit`
      green.

---

## Execution Order

```
Phase 1 (Parallel):
├── Task 1: Paginator capabilities
└── Task 8: React readers

Phase 2 (After Task 1):
├── Task 2: channel.ts seeding + readers
├── Task 3: CooldownTimer
├── Task 5: client.ts _updateUserReferences
├── Task 6: thread.ts reply source
└── Task 15: Offline  (only if in scope — decisions.md #1)

Phase 3 (After Task 2 + Task 6):
├── Task 4: messageDelivery (needs Task 1 + Task 6)
└── Task 7: channel.ts getReplies decouple (needs Task 2 + Task 6)

Phase 4 (After all readers: Tasks 3,4,5,7,8 [+15 if in scope]):
├── Task 9: channel.ts stop dual-write
└── Task 10: client.ts stop dual-write (needs Task 5 + Task 9)

Phase 5 (After Tasks 9,10 [+15]):
└── Task 11: Delete ChannelState storage + utils

Phase 6 (After Task 11):
└── Task 12: Types & exports

Phase 7 (After Task 12):
├── Task 13: Tests
└── Task 14: Docs
```

## File Ownership Summary

| Task | Creates/Modifies                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1    | `src/pagination/paginators/MessagePaginator.ts`, `src/pagination/paginators/BasePaginator.ts`     |
| 2    | `src/channel.ts` (chain 1/3)                                                                      |
| 3    | `src/CooldownTimer.ts`                                                                            |
| 4    | `src/messageDelivery/MessageDeliveryReporter.ts`, `src/messageDelivery/MessageReceiptsTracker.ts` |
| 5    | `src/client.ts` (chain 1/2)                                                                       |
| 6    | `src/thread.ts`                                                                                   |
| 7    | `src/channel.ts` (chain 2/3)                                                                      |
| 8    | React repo: `MessageBounceContext.tsx`, `ChannelListItem/*`, `useMarkRead.ts`, `CLAUDE.md`        |
| 9    | `src/channel.ts` (chain 3/3)                                                                      |
| 10   | `src/client.ts` (chain 2/2)                                                                       |
| 11   | `src/channel_state.ts`, `src/utils.ts`                                                            |
| 12   | `src/types.ts`, `src/index.ts`, `src/channel_state.ts` (types)                                    |
| 13   | `test/unit/*`, `test/typescript/response-generators/message.js`                                   |
| 14   | `CLAUDE.md`, `stream-chat-react/CLAUDE.md`, `developers/*`                                        |
| 15   | `src/offline-support/offline_support_api.ts`, `src/pagination/paginators/BasePaginator.ts`        |

> Note: `src/channel.ts` (Tasks 2→7→9) and `src/client.ts` (Tasks 5→10) are serialized chains — one
> agent at a time per the make-plans same-file rule. `BasePaginator.ts` is touched by Task 1 and (if
> in scope) Task 15 → order 15 after 1.
