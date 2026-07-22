# Spec — Remove legacy `ChannelState` message storage

Status: **planned**. Repo: `stream-chat` (JS SDK), with coordinated `stream-chat-react` changes.

## Goal

Make `channel.messagePaginator` / `thread.messagePaginator` the **single source of truth** for loaded
messages, and delete the legacy in-memory message store on `ChannelState` (`src/channel_state.ts`):
the `messageSets` array, its `messages` / `latestMessages` accessors, the per-parent `threads` reply
record, and the whole family of set mutators/finders. Today both stores are maintained **in lockstep**
(dual-write) for the main list — every legacy writer already has a paginator twin — so the work is
mostly _removing the legacy half_ once the remaining read paths and a few paginator capability gaps
are migrated.

## Motivation

Two parallel message stores means double bookkeeping, drift risk, and confusion about the source of
truth (the bug that motivated this: a `watch()`-opened channel had populated `channel.state.messages`
but an empty `messagePaginator`, so the UI — which reads the paginator — showed no messages). One
store removes the class of bug entirely.

## Scope

> **OUT OF SCOPE (narrowed 2026-07): threads.** `thread.ts` / `Thread.state.replies` and the
> per-parent `ChannelState.threads` reply record are **excluded** from this initiative. The target is
> the **main channel message list** (`channel.state.messages` / `messageSets` / `latestMessages`)
> only. Consequently the shared `ChannelState` methods that serve both the message list _and_ threads
> (`addMessagesSorted`, `findMessage`, `updateUserMessages`, `deleteUserMessages`) are **refactored to
> keep their thread/pinned handling**, not deleted outright.

**Removed** (main message-list concerns in `src/channel_state.ts` unless noted):
`messageSets` (L125); `get/set messages` (L164/168); `get/set latestMessages` (L177/181);
`get messagePagination` (L330); `pruneOldest`, the message-list portions of `addMessageSorted`/
`addMessagesSorted`, `addReaction`/`removeReaction` (+ `_addReactionToState`/`_removeReactionFromState`/
`_add|_removeOwnReaction*`), `_updateQuotedMessageReferences`/`removeQuotedMessageReferences`,
`_updateMessage`, `_addToMessageList`, `removeMessage`/`removeMessageFromArray`, the message-list
portions of `updateUserMessages`/`deleteUserMessages`, `filterErrorMessages`, `initMessages`,
`loadMessageIntoState`, the message-list portion of `findMessage`/`findMessageByTimestamp`,
`switchToMessageSet` + private set-geometry helpers (L62-92); `src/utils.ts` `messageSetPagination`
(L1069+); `type MessageSet`, `type MessageSetType`, `isLatestMessageSet` (`src/types.ts`).

**Stays** (non-message-list data on `ChannelState`): watchers, typing (+ the typing-only `clean()`),
read state, members/`member_count`, own capabilities, muted users, **`pinnedMessages`**, the
**`threads` reply record (L108)** and its mutations (threads out of scope), `membership`,
`unreadCount`, `last_message_at`, `isUpToDate`. Undecided: `pending_messages` (see `decisions.md`).

## Blocking gaps (paginator is not yet an authoritative superset)

1. Derived reads still on legacy: `channel.lastMessage()` (L1389), `countUnread`/`countUnreadMentions`
   (L1706/L1728), `_extendEventWithOwnReactions` `findMessage` (L2895), `deleteReaction` offline read
   (L729), `CooldownTimer.refresh` (L105), `MessageReceiptsTracker` (L186), `MessageDeliveryReporter`
   channel branch (L137), `client._updateUserReferences` (L1487).
2. **Latest-window accessor:** the paginator's _active_ interval is not always the head/latest window
   (after a jump/search), so a paginator-based `lastMessage`/unread read needs a head-anchored accessor.
3. **Partial truncation:** `channel.truncated` with `truncated_at` prunes per-set by timestamp; the
   paginator only supports full `clearStateAndCache()`.
4. **Seeding coverage:** `channel.query()` (direct), `channel.search()`, `loadMessageIntoState` don't
   seed the paginator (only `watch()` and `hydrateActiveChannels` do).
5. **Threads:** `ChannelState.threads` (no external `src` reader) + `Thread.state.replies` (still the
   maintained UI source, `thread.ts` L776 NOTE) + `Channel.getReplies` writing `state.addMessagesSorted`
   (L1600).
6. **Offline DB** (`offline-support/offline_support_api.ts` L1296): replay path writes
   `channel.state.addMessageSorted`; `BasePaginator.isOfflineSupportEnabled` is hardcoded `false`.
   Because the storage deletion removes `addMessageSorted`, offline **must** be migrated before the
   final delete (it is not optional if we delete that method) — see `decisions.md`.
7. **`isUpToDate` parity:** legacy gates `message.new` insertion on `isUpToDate` (L2428); confirm the
   paginator's `isHead` routing matches.

## Blast radius

- **Public API (semver-major):** `src/index.ts` re-exports `channel_state` + `types`. `ChannelState`
  message members, `MessageSet`, `MessageSetType`, `isLatestMessageSet` disappear/change. Encode via
  Conventional Commit `feat!:` / `BREAKING CHANGE:` footer — never bump the version manually.
- **React SDK (must migrate before the JS delete):** 7 sites — `MessageBounceContext.tsx:53`,
  `ChannelListItem/{utils.tsx:47,ChannelListItem.tsx:96/158,ChannelListItemUI.tsx:44}`,
  `MessageList/hooks/useMarkRead.ts:8` — plus stale `CLAUDE.md` guidance in both repos.
- **Tests (JS):** ~450 refs across 7 files (`channel_state.test.js` 355, `channel.test.js` 56,
  `client.test.js` 25, `CooldownTimer.test.ts` 9, offline 3, `poll_manager.test.ts` 1, response-gen 1).

## Acceptance (whole initiative)

- No reference to `messageSets` / `state.messages` / `state.latestMessages` / `addMessageSorted` etc.
  remains in `stream-chat/src` or `stream-chat-react/src`.
- `yarn types` + `yarn lint` clean; `yarn test-unit` green vs. branch baseline.
- Deep-linked channel, jumped/searched message, and threads all render (headless vite check).
