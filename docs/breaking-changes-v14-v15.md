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
| `channel.state.latestMessages`                                | `channel.messagePaginator.headItems` / `.lastMessage`                                |
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

## `ChannelState.last_message_at` removed — use `channel.messagePaginator.lastMessageAt`

**Area:** `ChannelState` · **Status:** implemented

`channel.state.last_message_at` was **removed entirely** (it was briefly a read-only getter earlier
in v15; that getter is gone too). The channel's latest-message timestamp is now owned by the message
paginator as a whole-collection aggregate.

- **Before:** `channel.state.last_message_at` (writable, then a derived getter). Internally
  maintained by the now-removed `Channel._trackLatestMessage`.
- **After:** `channel.messagePaginator.lastMessageAt` — a `Date | null` **derived** getter over the
  paginator's `aggregateState` store (`MessagePaginatorAggregateState = { lastMessage,
seededLastMessageAt }`). It returns `max(lastMessage?.created_at, seededLastMessageAt)`:
  `lastMessage` is the newest loaded/received message (advanced on ingest), `seededLastMessageAt` is
  the server floor **seeded from `ChannelResponse.last_message_at`** (for channels whose newest
  message isn't loaded). Deriving the sort key from the two independent facts means it can never drift
  from the display message. Subscribe to `channel.messagePaginator.aggregateState` for reactivity.
- **Migrate:** replace `channel.state.last_message_at` reads with
  `channel.messagePaginator.lastMessageAt`. It is not writable; the value is derived from ingested
  messages and the server seed.
- **Why:** the message paginator is the single source of truth for messages; `last_message_at` is an
  aggregate over them (the dual of pagination). Deriving it through a `ChannelState` getter that
  reached into the paginator's message index risked stale/mixed-basis sorting (a seeded-but-stale
  paginator preferred over a fresher server value); a single seeded-then-advanced value on the
  paginator removes that hazard.
- **Tracking relocated:** `MessageIntervalPaginator`'s `state.latestMessageId` and the `latestMessage`
  getter (id resolved from the pagination `state`) were replaced. The tracked latest now lives on
  `MessagePaginator.aggregateState.lastMessage`, advanced on every ingest.
  `MessagePaginator.lastMessage` remains as a convenience getter but now reads `aggregateState`.
  This matters for reactivity: pagination `state` only emits when the **active** interval is impacted,
  so a WS message landing in the (non-active) head interval would not notify a `state`-derived
  latest; `aggregateState` is written directly on each advance and emits regardless — subscribe to it
  (e.g. for a channel/thread list item's latest-message display). `aggregateState.lastMessage` is a
  LIVE reference: refreshed in place on edit/soft-delete/reaction of the current latest and recomputed
  on hard-remove, and it honors `skip_last_msg_update_for_system_msgs` (system messages neither
  reorder a channel nor become its displayed latest). A consumer that previously showed the unfiltered
  newest message (`headmostItem`) as the channel-list preview will now skip system messages under that
  config — a deliberate behavior change so the preview and the channel's sort position agree.

## Newest-loaded window is exposed as computed getters `headItems` / `headmostItem`

**Area:** `BasePaginator` · **Status:** implemented

The newest-loaded window is exposed as **computed getters** on the paginator — `paginator.headItems`
(the window; `[]` before the first load) and `paginator.headmostItem` (its single newest item),
derived from the intervals on read.

- **Migrate:** the v14 `channel.state.latestMessages` reactive array becomes
  `channel.messagePaginator.headItems`. Because these are getters, **not** `PaginatorState` fields,
  they are not subscribable via `useStateStore(paginator.state, (s) => s.headItems)` — read them
  directly, or subscribe to `channel.messagePaginator.aggregateState` for the reactive last-message
  signal.
- **Why:** the value is derivable from the intervals on demand, so it does not need to be materialized
  (and re-emitted) into pagination state.

## `Channel.lastMessage()` removed — use `channel.messagePaginator.headmostItem`

**Area:** `Channel` · **Status:** implemented

`channel.lastMessage()` was removed. It returned the newest loaded message (the head edge of the
message paginator's latest window); read `channel.messagePaginator.headmostItem` directly instead.

- **Migrate:** `channel.lastMessage()` → `channel.messagePaginator.headmostItem`.
- **Note:** `headmostItem` is the newest _loaded_ message, **unfiltered** (includes system messages) —
  distinct from `channel.messagePaginator.lastMessage`, the filtered chronological latest (honors
  `skip_last_msg_update_for_system_msgs`) that backs `lastMessageAt`. Use `headmostItem` for "the newest
  message on screen"; use `lastMessage` / `lastMessageAt` for channel-list ordering.
- **Why:** it was a thin wrapper over `headmostItem`, and sharing the name `lastMessage` with the
  differently-filtered paginator getter was misleading.

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
