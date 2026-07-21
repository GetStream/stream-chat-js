# Breaking Changes: v14 → v15 (stream-chat JS)

Consumer-facing **breaking changes** on the v15 line of the JS SDK — the `message-paginator`
initiative (`feat/message-paginator-master-merge` and the follow-on
`refactor/remove-legacy-channelstate-storage`), beyond the master ⇄ PR merge itself. This is the
source for the v14 → v15 migration guide / release notes. Append newest at the top. Keep each entry
self-contained: what changed, before → after, how to migrate, why.

> Scope note: this file tracks **public API / observable behavior** changes. Internal refactors with
> identical output belong in `decisions.md`, not here.

---

## `ChannelState` message / thread / pinned storage removed — paginators are the source of truth

**Area:** `ChannelState`, `Channel`, `utils` · **Status:** implemented

The channel's messages, thread replies, and pinned messages are no longer stored on `channel.state`.
Each list now lives in a paginator that is the single source of truth (interval storage + a canonical
`ItemIndex`):

- **Main message list** → `channel.messagePaginator`
- **Thread replies** → `thread.messagePaginator` (via `client.threads` / the `Thread` object)
- **Pinned messages** → `channel.pinnedMessagesPaginator`

### Removed from `ChannelState`

Properties / getters: `messages`, `latestMessages`, `messageSets`, `messagePagination`, `threads`,
`pinnedMessages`. (Also `isUpToDate` and the `last_message_at` setter — see the dedicated entries
below.)

Methods: `addMessageSorted`, `addMessagesSorted`, `removeMessage`, `findMessage`,
`findMessageByTimestamp`, `filterErrorMessages`, `loadMessageIntoState`, `clearMessages`,
`initMessages`, `pruneOldest`, `addReaction`, `removeReaction`, `updateUserMessages`,
`deleteUserMessages`, `addPinnedMessages`, `addPinnedMessage`, `removePinnedMessage`,
`removeQuotedMessageReferences` (plus the internal `_updateMessage` / `_updateQuotedMessageReferences`
/ `_add*`/`_remove*` reaction helpers).

### Removed from `utils` (re-exported through the package root)

`addToMessageList`, `messageSetPagination`, `binarySearchByDateEqualOrNearestGreater`,
`deleteUserMessages`, and the `MessageSet` / message-set pagination types.

### Migrate

| Before (v14)                                                  | After (v15)                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `channel.state.messages`                                      | `channel.messagePaginator.state.items` (reactive) / `channel.messagePaginator.items` |
| `channel.state.latestMessages`                                | `channel.messagePaginator.latestItems` / `.latestMessage`                            |
| `channel.state.messagePagination`                             | `channel.messagePaginator.state` (`hasMoreHead` / `hasMoreTail` / `cursor`)          |
| `channel.state.threads[parentId]`                             | `thread.messagePaginator.state.items` (resolve the `Thread` via `client.threads`)    |
| `channel.state.pinnedMessages`                                | `channel.pinnedMessagesPaginator.state.items`                                        |
| `channel.state.addMessageSorted(m)` / `addMessagesSorted(ms)` | `channel.messagePaginator.ingestItem(m)`                                             |
| `channel.state.removeMessage({ id })`                         | `channel.messagePaginator.removeItem({ id })`                                        |
| `channel.state.findMessage(id)`                               | `channel.messagePaginator.getItem(id)`                                               |

Reactive reads use `useStateStore(channel.messagePaginator.state, …)` (or the paginator's `state`
store directly). Pin/unpin, reactions, user updates, and deletions are applied to the paginators by
the SDK's own event handlers — application code should not call the removed mutators.

### Why

Messages were previously stored twice — a flat `ChannelState` list plus message-set/pagination
bookkeeping — which had to be kept in sync with the paginators and could drift. Consolidating on the
paginators removes the dual-write, gives one API/behavior across the main list, threads, and pinned
messages (dedup-by-id, interval merge, `getItem`/`removeItem`, head-window semantics), and lets
`last_message_at` be derived rather than separately maintained.

## `ChannelState.last_message_at` is now read-only (derived)

**Area:** `ChannelState` · **Status:** implemented

`channel.state.last_message_at` is now a **read-only getter** derived from the message paginator's
tracked latest message (`channel.messagePaginator.latestMessage?.created_at ?? null`). The writable
setter and its backing field were removed.

- **Before:** `channel.state.last_message_at = someDate` (writable). Internally maintained by the
  now-removed `Channel._trackLatestMessage`.
- **After:** read-only. It reflects whatever the message paginator holds as its latest message.
- **Migrate:** don't assign it. To make a channel's `last_message_at` reflect a message, ingest /
  track that message on `channel.messagePaginator` (the message source of truth). Assigning to it is
  a no-op (silently ignored / throws in strict mode) and a TypeScript error.
- **Why:** the message paginator is the single source of truth for messages; `last_message_at` is a
  projection of it. A separate writable field could drift from the actual latest message.

## `ChannelState.isUpToDate` / `setIsUpToDate` removed

**Area:** `ChannelState` · **Status:** implemented

The `isUpToDate` flag and its `setIsUpToDate(boolean)` setter were removed. They gated whether an
incoming `message.new` was appended to the visible message list when the user had scrolled to older
history.

- **Before:** UI SDKs set `channel.state.setIsUpToDate(false)` when jumping to an older window so live
  messages were not forced onto the visible list, and read `channel.state.isUpToDate` to decide
  whether to show a "jump to latest" affordance.
- **After:** neither exists. Message routing is handled structurally by the message paginator: a live
  message newer than the loaded head lands in the head (or logical-head) interval, which is not the
  active window when the viewer has jumped away, so the visible window is preserved with no flag.
- **Migrate:**
  - "Am I viewing the newest window?" → `channel.messagePaginator.isActiveIntervalAtHead` (getter).
  - "Are there newer messages not yet loaded?" → `channel.messagePaginator.hasMoreHead` (reactive
    via `channel.messagePaginator.state`).
  - "Jump to the latest" → `channel.messagePaginator.jumpToTheLatestMessage()`.
- **Behavioral note:** `last_message_at` now advances on every incoming message regardless of the
  viewer's scroll position (the old `isUpToDate` suppression is gone) — it is a channel-level fact,
  independent of what the UI is currently viewing.
- **Why:** the flag duplicated state the paginator already models, and was only ever set `false` on
  disconnect on this branch — its message-list responsibility had already moved to the paginator.

---
