# Spec — Migrate offline-support off legacy `ChannelState` message storage

Status: **planned**. Repo: `stream-chat` (JS SDK). **Sub-initiative of**
[`../remove-legacy-channelstate-messages`](../remove-legacy-channelstate-messages/spec.md) — this is
its Task 15, expanded. Resolves decision **D1** in that plan.

## Goal

Make offline-support work with `channel.messagePaginator` as the message source of truth, so the
legacy `ChannelState` message store (`messageSets`/`addMessageSorted`/`state.messages`/…) can be
deleted without breaking offline read/replay/persist. Offline-support has **no default implementation
in this package** (`AbstractOfflineDB` is injected by RN/mobile SDKs), so any change to the abstract
interface is a **coordinated, breaking change** for those SDKs.

## Key findings (from subsystem + paginator mapping)

1. **Offline message READS already reach the paginator without legacy state.** Cold start goes
   `offlineDb.getChannelsForQuery()` → `client.hydrateActiveChannels(rows, {offlineMode:true})` →
   `postQueryReconcile` seeds `messagePaginator` from the **raw `ChannelAPIResponse.messages`**
   (`client.ts:2324-2333`). So the first/latest page works response-driven. _(Verify the
   `hydrateActiveChannels` seed reads the response var, not `c.state.messages` — one mapping pass
   flagged it ambiguously; confirm before relying on it.)_
2. **Offline message WRITES already persist from the response, not `ChannelState`.**
   `client.queryChannels` → `offlineDb.upsertChannels({channels, isLatestMessagesSet:true})`
   (`client.ts:2199`); `Channel.query()` → `upsertChannels` (`channel.ts:1890`). **But** the
   `isLatestMessagesSet` flag on the single-channel path is derived from legacy `messageSet.isLatest`
   (`channel.ts:1890-1897`) — a coupling to sever.
3. **There is NO cursor-aware per-message read in `OfflineDBApi`** — only channel-bundled
   `getChannels`/`getChannelsForQuery`. So offline _older-page pagination_ is not supported today
   (legacy didn't support it either) and is an **enhancement**, not parity.
4. **`upsertMessages` is not called on paginated page loads** — only for WS `message.new` and inside
   `upsertChannels`. Persisting older offline-fetched pages would be new.

## Legacy couplings to sever (parity)

| #   | Site                                     | Today                                                                                 | Target                                                                                           |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| C1  | `offline_support_api.ts:1296`            | send-message replay → `channel.state.addMessageSorted(newMessage,true)`               | `channel.messagePaginator.ingestItem(formatMessage(newMessage))`                                 |
| C2  | `channel.ts:1890-1897`                   | `upsertChannels` `isLatestMessagesSet` from `messageSet.isLatest`                     | derive "is latest page" from the paginator (head / no headward cursor)                           |
| C3  | `channel_state.ts:988-998`               | `filterErrorMessages()` scans `latestMessages`, drives `offlineDb.hardDeleteMessage`  | paginator-driven blocked/error-message cleanup (this method is removed by the parent plan)       |
| C4  | `channel.ts:729`                         | offline `deleteReaction` → `state.messages.find`                                      | paginator `getItem` _(already covered by parent plan Task 2)_                                    |
| C5  | `client.ts:2288-2333`, `channel.ts:1836` | cold-start hydration populates legacy `messageSets` then seeds paginator from it      | seed paginator directly from the offline `ChannelAPIResponse` _(coordinate with parent Task 10)_ |
| C6  | `offline_support_api.ts:630,634,891,895` | offline read persistence uses `channel.state.read` (stays) + `countUnread()` (legacy) | `state.read` stays; `countUnread` becomes paginator-backed _(parent plan Task 2 dependency)_     |

## Scope

**Parity tranche (default, no interface break):** sever C1–C6 so offline works after the storage
deletion, using the reads/writes that already flow through channel hydration + `upsertChannels`.
Optionally persist paginated page loads via `upsertMessages` (`populateOfflineDbAfterQuery`).

**Enhancement tranche (gated — coordinated breaking change):** add a cursor-aware message read to
`AbstractOfflineDB` (e.g. `getChannelMessages({cid, parent_id?, id_lt/id_gt/limit})`) + a
`LocalMessage`↔`MessageResponse` conversion + `MessagePaginator.preloadFirstPageFromOfflineDb`, giving
true offline older-page pagination. Requires RN/mobile SDK implementations to add the method.

## Blast radius

- **Injection interface (`AbstractOfflineDB` / `OfflineDBApi`):** parity tranche adds no abstract
  method (safe for existing RN/mobile impls). Enhancement tranche adds one abstract method → **breaks
  every concrete impl until they implement it**; needs coordinated release with RN/mobile.
- **Shared files** with the parent plan: `channel.ts`, `client.ts`, `MessagePaginator.ts` — this
  sub-plan interleaves with the parent's same-file chains (see plan.md), it is **not** a concurrent
  worktree.
- **Tests:** `test/unit/offline-support/offline_support_api.test.ts` + `MockOfflineDB`.

## Acceptance

- After the parent plan deletes `ChannelState` message storage, offline replay, persistence,
  cold-start hydration, reaction-delete, and read-count persistence all work off `messagePaginator`
  (parity tranche), verified with a `MockOfflineDB` unit suite.
- No offline code references `channel.state.messages`/`latestMessages`/`addMessageSorted`/
  `findMessage`/`messageSet.isLatest`.
