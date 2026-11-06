# Plan — Migrate offline-support off legacy `ChannelState` message storage

See [`spec.md`](spec.md) for findings, the C1–C6 coupling table, and tranche scope;
[`decisions.md`](decisions.md) for the enhancement-tranche gate.

## Worktree

**Shares the parent plan's worktree/branch** —
`../stream-chat-js-worktrees/remove-legacy-channelstate-messages`, branch
`feat/remove-legacy-channelstate-messages`, base `feat/message-paginator-master-merge`. This
sub-plan is **not** a separate concurrent worktree: tasks O2/O5 (`channel.ts`), O4 (`client.ts`), and
O1 (`MessagePaginator.ts`) edit files the parent plan's chains also edit, so they must serialize with
those chains on the same branch. Offline-only-file tasks (O3, O7, O8 on `offline_support_api.ts` /
offline types / `MockOfflineDB`) may run in parallel worktrees if desired.

## Task overview

Parity tranche = O1–O6, O8 (+O9). Enhancement tranche = O7 (gated by decision D-OFF-1). The whole
sub-plan is a **required predecessor of the parent plan's Task 11 (delete storage)** — specifically
O1, O3, O5 must land before the parent removes `addMessageSorted`, and O6 depends on the parent's
Task 2 (`countUnread` on the paginator). Cross-plan dependencies are called out per task.

---

## Task O1: `MessagePaginator` offline enablement + page persistence

**File(s) to create/modify:** `src/pagination/paginators/MessagePaginator.ts`

**Dependencies:** parent Task 1 (paginator capabilities — same file, serialize after it)

**Status:** pending

**Owner:** unassigned

**Scope:**

- Override `isOfflineSupportEnabled` → `!!this.channel.getClient().offlineDb` (mirror
  `ChannelPaginator.ts:249`). Note this also changes `runQueryRetryable` to prefer stale data / suppress
  errors when items exist — desired offline; confirm it doesn't mask errors online.
- Override `populateOfflineDbAfterQuery` to persist the fetched page via
  `offlineDb.upsertMessages({ messages })` (needs `LocalMessage`→`MessageResponse` conversion), keyed
  implicitly by each message's `cid`/`parent_id` (closes the "no `upsertMessages` on page load" gap).
- Do **not** add `preloadFirstPageFromOfflineDb` here (that is enhancement O7); first-page offline read
  stays via channel hydration.

**Acceptance Criteria:**

- [ ] `isOfflineSupportEnabled` true iff a DB is injected; unit test with `MockOfflineDB`.
- [ ] A message-page load calls `upsertMessages` with the page's messages.
- [ ] `yarn types` + `yarn lint` clean.

---

## Task O2: `channel.ts` — derive persistence `isLatestMessagesSet` from the paginator (C2)

**File(s) to create/modify:** `src/channel.ts`

**Dependencies:** parent Task 2 (channel.ts chain root — serialize within it)

**Status:** pending

**Owner:** unassigned

**Scope:**

- In `Channel.query()` (`channel.ts:1890-1897`), replace `messageSet.isLatest` (legacy) with a
  paginator-derived "is latest page" signal (paginator at head / no `headward` cursor) when calling
  `offlineDb.upsertChannels({ channels:[state], isLatestMessagesSet })`.

**Acceptance Criteria:**

- [ ] `upsertChannels` receives the correct `isLatestMessagesSet` for latest vs. older/jumped pages,
      independent of `messageSets` — unit test.
- [ ] `yarn types` + `yarn lint` clean.

---

## Task O3: Offline replay — send-message confirms via the paginator (C1)

**File(s) to create/modify:** `src/offline-support/offline_support_api.ts`

**Dependencies:** parent Task 1 (paginator ingest available); lands **before** parent Task 9/11

**Status:** pending

**Owner:** unassigned

**Scope:**

- In `executeTask` send-message branch (`offline_support_api.ts:1296`), replace
  `channel.state.addMessageSorted(newMessage, true)` with
  `channel.messagePaginator.ingestItem(formatMessage(newMessage))` (thread branch already uses the
  paginator via `upsertReplyLocally`).

**Acceptance Criteria:**

- [ ] Replaying a queued send-message surfaces the confirmed message in `messagePaginator`, not legacy
      state — unit test with `MockOfflineDB`.
- [ ] `yarn types` + `yarn lint` clean.

---

## Task O4: Cold-start hydration seeds the paginator from the response (C5)

**File(s) to create/modify:** `src/client.ts` (coordinate with parent Task 10)

**Dependencies:** parent Task 10 (client.ts chain — serialize; both edit `hydrateActiveChannels`)

**Status:** pending

**Owner:** unassigned

**Scope:**

- Verify/ensure `hydrateActiveChannels` (offlineMode path) seeds `messagePaginator.postQueryReconcile`
  from the raw offline `ChannelAPIResponse.messages`, with **no** dependency on the legacy
  `_initializeState`/`clearMessages` message population removed by parent Task 10.

**Acceptance Criteria:**

- [ ] Cold-start offline hydration populates `messagePaginator` for each restored channel with legacy
      message population removed — unit test with `MockOfflineDB`.
- [ ] `yarn types` + `yarn lint` clean.

---

## Task O5: Blocked/error-message DB cleanup off the paginator (C3)

**File(s) to create/modify:** `src/channel.ts` (or a new small helper), consuming `messagePaginator`

**Dependencies:** parent Task 2; lands **before** parent Task 11 (which deletes `filterErrorMessages`)

**Status:** pending

**Owner:** unassigned

**Scope:**

- Re-home the responsibility of `channel_state.filterErrorMessages()` (`channel_state.ts:988-998`):
  find blocked/error messages via the paginator and call `offlineDb.hardDeleteMessage({ id })`, then
  drop them from the paginator. Ensure the trigger points that called `filterErrorMessages` now call
  the paginator-based cleanup.

**Acceptance Criteria:**

- [ ] Blocked/error messages are hard-deleted from the DB and removed from the paginator; no reliance
      on `latestMessages` — unit test.
- [ ] `yarn types` + `yarn lint` clean.

---

## Task O6: Read-state persistence uses paginator-backed `countUnread` (C6)

**File(s) to create/modify:** none of its own — verification task over `offline_support_api.ts` reads

**Dependencies:** parent Task 2 (`countUnread`/`countUnreadMentions` migrated to the paginator)

**Status:** pending

**Owner:** unassigned

**Scope:**

- Confirm `handleNewMessage` (`:630/:634`) and `handleChannelTruncatedEvent` (`:891/:895`) still
  compute correct `unread_messages` once `countUnread` reads the paginator; `channel.state.read`
  stays. Add regression coverage. (No code change expected beyond the parent Task 2 migration; this
  task exists to gate/verify the dependency.)

**Acceptance Criteria:**

- [ ] Offline read-count persistence unaffected by the storage removal — regression test.

---

## Task O7 (GATED): Cursor-aware offline message read → true offline pagination

**File(s) to create/modify:** `src/offline-support/types.ts` (+ `offline_support_api.ts` abstract
method), `src/pagination/paginators/MessagePaginator.ts`

**Dependencies:** O1; **decision D-OFF-1** (coordinated breaking interface change)

**Status:** pending (blocked on decision)

**Owner:** unassigned

**Scope:**

- Add abstract `getChannelMessages({ cid, parent_id?, id_lt?, id_gt?, id_around?, limit }):
MessageResponse[] | null` to `OfflineDBApi`.
- Add `MessagePaginator.preloadFirstPageFromOfflineDb` (mirror `ChannelPaginator`), reading via the new
  method keyed by `buildFilters()` (`cid`(+`parent_id`)) and the query cursor; hydrate through
  `postQueryReconcile`.
- Coordinate the interface change with RN/mobile SDKs (see O9).

**Acceptance Criteria:**

- [ ] Older-page loads resolve from the DB while offline, via `MockOfflineDB` implementing the new
      method — unit test.
- [ ] Interface change documented as breaking for offline implementers.

---

## Task O8: Offline tests

**File(s) to create/modify:** `test/unit/offline-support/offline_support_api.test.ts`, `MockOfflineDB` (in `test/unit/offline-support/`)

**Dependencies:** O1–O6 (and O7 if in scope)

**Status:** pending

**Owner:** unassigned

**Scope:**

- Update `MockOfflineDB` for any new behavior; rewrite offline tests that assert against
  `state.messages`/`addMessageSorted` to assert against `messagePaginator`; add the replay /
  hydration / persistence / cleanup coverage from O1–O6.

**Acceptance Criteria:**

- [ ] `yarn test-unit test/unit/offline-support` green; no legacy-storage references.

---

## Task O9: Coordination & docs for the interface change (only if O7 in scope)

**File(s) to create/modify:** `CLAUDE.md`, `developers/*`, release notes/migration guide

**Dependencies:** O7

**Status:** pending

**Owner:** unassigned

**Scope:**

- Document the new `AbstractOfflineDB.getChannelMessages` requirement and the `BREAKING CHANGE` for
  offline implementers; open coordination tickets with RN/mobile SDK teams.

**Acceptance Criteria:**

- [ ] Migration note published; downstream tickets linked.

---

## Execution Order

```
(interleaves with parent plan — same branch)

After parent Task 1:
└── O1: MessagePaginator offline enablement + page persist

After parent Task 2:
├── O2: channel.ts isLatestMessagesSet from paginator
├── O5: blocked/error DB cleanup off paginator
└── O6: read-count persistence verification (gated on parent Task 2)

After parent Task 1 (offline-only file, parallel):
└── O3: replay via paginator ingest   ── MUST precede parent Task 9/11

After parent Task 10:
└── O4: cold-start hydration seed from response

Gated (decision D-OFF-1), after O1:
└── O7: cursor-aware offline read → O9 coordination/docs

After O1–O6 (+O7):
└── O8: offline tests

GATE: O1, O3, O5 complete  ⇒  parent plan Task 11 (delete storage) may proceed.
```

## File Ownership Summary

| Task | Creates/Modifies                                                                | Shared-file note                              |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| O1   | `src/pagination/paginators/MessagePaginator.ts`                                 | after parent Task 1                           |
| O2   | `src/channel.ts`                                                                | within parent channel.ts chain (after Task 2) |
| O3   | `src/offline-support/offline_support_api.ts`                                    | offline-only                                  |
| O4   | `src/client.ts`                                                                 | within parent client.ts chain (with Task 10)  |
| O5   | `src/channel.ts` (+ optional helper)                                            | within parent channel.ts chain                |
| O6   | (verification only)                                                             | depends on parent Task 2                      |
| O7   | `src/offline-support/types.ts`, `offline_support_api.ts`, `MessagePaginator.ts` | gated; offline-only + paginator               |
| O8   | `test/unit/offline-support/*`                                                   | offline-only                                  |
| O9   | `CLAUDE.md`, `developers/*`                                                     | docs                                          |
