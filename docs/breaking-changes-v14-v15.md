# Breaking Changes: v14 → v15 (stream-chat JS)

Consumer-facing **breaking changes** introduced in the v15 line of the JS SDK on
`feat/message-paginator-master-merge` (beyond the master ⇄ PR merge itself). This is the source for
the v14 → v15 migration guide / release notes. Append newest at the top. Keep each entry
self-contained: what changed, before → after, how to migrate, why.

> Scope note: this file tracks **public API / observable behavior** changes. Internal refactors with
> identical output belong in `decisions.md`, not here.

---

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
