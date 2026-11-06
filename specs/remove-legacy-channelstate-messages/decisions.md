# Decisions — Remove legacy `ChannelState` message storage

Open decisions that gate scope/sequencing. Update `Status` and record the resolution inline.

## D1 — Offline-support scope (gates Task 11 / Task 15)

**Status:** OPEN

**Question:** Does this initiative migrate offline-support (Task 15), or defer it?

**Constraint:** Deleting the store (Task 11) removes `ChannelState.addMessageSorted`, which the offline
replay path calls (`offline_support_api.ts:1296`). So there is **no "delete now, migrate offline
later"** option that also does a clean removal. Either:

- (a) **Include Task 15** as a required predecessor of Task 11, or
- (b) **Descope offline** but then Task 11 must keep a compatibility write path for offline replay
  (contradicts the hard-removal goal and D2), or
- (c) **Two-initiative split:** land Phases 1-4 (readers migrated, dual-write still on) now; do the
  actual deletion (Tasks 9-14) + offline (Task 15) in a follow-up once offline is ready.

**Recommendation:** (a) if offline can be scheduled now; otherwise (c) — ship the reader migration and
keep dual-write until offline is ready, so the codebase is never in a broken half-migrated state.
Note: offline has no default impl in this package (injected by RN/mobile SDKs), so its migration also
needs coordination with those SDKs.

**Update:** offline is now planned in detail in
[`../migrate-offline-to-messagepaginator`](../migrate-offline-to-messagepaginator/plan.md). Key result:
the **parity tranche needs no breaking interface change** (offline reads/writes already flow through
channel hydration + `upsertChannels`), so option (a) is cheaper than feared — only the parity tranche
(sub-plan O1, O3, O5) must land before Task 11. The breaking piece (cursor-aware offline read for
older-page pagination) is isolated to the sub-plan's gated enhancement tranche, so it need not block
this removal. This makes **(a) with parity-only offline** the recommended path.

## D2 — Deprecation shim vs. hard removal (public API)

**Status:** OPEN

**Question:** Keep `get messages()` / `get latestMessages()` as `@deprecated` delegates that read the
paginator for one major, or remove outright?

**Recommendation:** **Hard removal.** This is already a breaking major on a WIP branch; a shim
re-introduces the second read path we are deleting and invites drift. (Reconsider only if external
Angular/RN consumers need a migration window.)

## D3 — `pending_messages`

**Status:** OPEN

**Question:** Keep `ChannelState.pending_messages` (server pending list) or migrate/remove it?

**Recommendation:** **Keep.** It is message-adjacent but not part of `messageSets`, has its own
lifecycle, and is out of scope for this removal.

## D4 — Threads in first cut

**Status:** OPEN

**Question:** Include thread migration (Tasks 6, 7) now, or defer with the main-list-only cut?

**Recommendation:** **Include.** `ChannelState.threads` has no external `src` readers and `Thread`
already owns a `messagePaginator`, so the thread migration is well-contained and blocks a clean
`ChannelState` deletion anyway.
