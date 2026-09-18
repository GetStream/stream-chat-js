# Plan — Paginator publish amplification

See [`spec.md`](spec.md) for the mechanism, every measurement, and the evidence behind each claim here.
Read it first: several tasks below have a trap that only makes sense with that context.

**Nothing in this plan has been implemented.** All tasks are open.

## Relationship to the message state update queue

**None of this is the update queue.** The queue (`MutationEcho`, `src/mutationEcho/`) pairs an HTTP
response with its WebSocket echo so a write _this client requested_ applies once instead of twice.
Everything here concerns a separate defect — one logical change producing more than one `state.items`
publish — that was uncovered while investigating the queue.

The two differ in reach, which is the main reason to track them apart:

|              | acts on                                                |
| ------------ | ------------------------------------------------------ |
| update queue | writes this client requested, HTTP-first ordering only |
| this work    | every event reaching ≥2 collections, **any sender**    |

Task P6 also shrinks the queue's surface area substantially. Called out there.

## Worktree

Fresh worktree and branch off **`release-v10`**. This work is independent of the update queue and
should not share a branch with it.

Per the repo's standing preference, create the worktree and branch but **make no commits** — commits,
pushes and PRs stay with the developer.

## Verification bar (applies to every task)

- `yarn lint` clean (zero warnings), `yarn types` clean, `yarn test` green.
- **Every guard must be verified to fail when the change it guards is reverted.** An unverified guard
  is worthless; several defects in this document existed _next to_ passing tests.
- **State which environment any publish count came from.** Vitest auto-disables state throttling
  (`stateThrottling.ts:25`), so unit counts and device counts measure different things. Conflating
  them caused real confusion during the investigation.
- Read [`spec.md` §6](spec.md) before writing any measurement — it lists three traps that each
  produced a confidently wrong number.

---

## Task P1: hoist `formatMessage` in `message.new` and `channel.truncated`

**File(s) to modify:** `src/channel.ts`

**Status:** open

**Dependencies:** none

**Scope:**

On `release-v10`, two WS arms call `formatMessage(event.message)` **twice**, once per paginator
(lines 2657/2659 for `message.new`, 2773/2774 for `channel.truncated`). Two calls produce two distinct
objects, so the second `EntityStore.upsert` misses its `previous === entity` bail, `markDirty`s the
first paginator, and the **main message list publishes a second time**.

Hoist one `const formattedMessage` per arm and pass the same reference to both paginators —
`message.deleted` and `message.updated` already do exactly this and are the reference shape.

**Do not be misled by the symptom:** the extra publish is on the **main** list, not the pinned one.
The pinned paginator publishes zero in both cases; it filters its _window_ but not its _store write_.

**Acceptance criteria:**

- [ ] a guard in `test/unit/channel.test.js` asserting the message list publishes exactly once per
      `message.new`
- [ ] that guard verified to FAIL (2 publishes) when the hoist is undone
- [ ] same treatment applied to `channel.truncated`

---

## Task P2: `ingestItem` publishes at most once

**File(s) to modify:** `src/pagination/paginators/BasePaginator.ts`

**Status:** open

**Dependencies:** none

**Scope:**

`ingestItem` for a **replace** is internally remove-then-insert, and each half publishes — so one
logical replace emits twice. Suspend the paginator's own window publishes across one ingest and
publish once on exit.

**Three constraints, all load-bearing — see [`spec.md` §2](spec.md):**

1. **Do not use `batch({ coalesce: true })`.** It exits through `flushWindowPublish`, a _synchronous_
   emit, which is the behaviour `batch`'s own documentation warns against for WS handlers. Exit
   through `scheduleWindowPublish` when throttled; fall back to a synchronous flush only when there is
   no throttle to ride.
2. **Must be re-entrant.** Nested inside an outer coalescing `batch` (reconciliation, reload
   re-ingest) it must defer to the outer scope, which owns the single publish.
3. **`lockItemOrder` lists must be excluded.** Their publish is not a re-projection — it republishes
   the last-published array with the item spliced back at its original index. Forcing a re-projection
   drops anything the active interval no longer holds. An existing `BasePaginator` test is the
   tripwire; expect it to fail if this is missed.

**Acceptance criteria:**

- [ ] a guard in `BasePaginator.test.ts` asserting at most one publish per ingest, for **both** an
      insert and a replace
- [ ] that guard verified to FAIL (2 vs ≤1) with the coalescing removed
- [ ] channel list: 2 → 1 publishes when re-ingesting a channel already in the list
- [ ] existing `lockItemOrder` tests still green

---

## Task P3: make `_extendEventWithOwnReactions` non-mutating

**File(s) to modify:** `src/channel.ts` (`:3194`)

**Status:** open — **precondition for P4**

**Dependencies:** none

**Scope:**

It currently does `event.message.own_reactions = message.own_reactions` — the **only** in-place
mutation of a message object anywhere in `src`. Derive a new message rather than assigning into the
shared event.

**Why it must land before P4:** P4 memoises on input identity, so with an in-place mutation whoever
formats first wins the cache. Today the channel mutates _then_ formats and runs before `Thread`
(`client.ts:934` before `:937`), so it is correct **by ordering luck** — an invisible dependency P4
would make load-bearing.

**Acceptance criteria:**

- [ ] no in-place mutation of `event.message` remains anywhere in `src` (grep clean)
- [ ] `own_reactions` enrichment still observed by **both** `Channel` and `Thread` for
      `message.updated` / `message.deleted` / `message.undeleted`
- [ ] existing own-reactions preservation tests green

---

## Task P4: memoise `formatMessage` on input identity

**File(s) to modify:** `src/utils.ts`

**Status:** open

**Dependencies:** **P3**

**Scope:**

A module-level `WeakMap<object, LocalMessage>`; return the cached copy when the same input object is
formatted again. Collections handed the same `event.message` converge on one `LocalMessage`, so
`EntityStore.upsert`'s **existing** reference bail fires. No comparison anywhere, and no change to
`EntityStore`.

**Do not implement this as a value comparison.** That route was prototyped and measured — see
[`spec.md` §3](spec.md) — and rejected: a shallow compare never matches (`formatMessage` re-allocates
`reaction_groups` every call), so it must recurse, and a recursive compare on every upsert is not
acceptable on the hot path.

**Decide before implementing:** `formatMessage` is public API, so integrators would share objects too.
Either document "a formatted message must be treated as immutable", or expose the memo only on an
internal entry point.

**Acceptance criteria:**

- [ ] two `formatMessage(sameObject)` calls return the identical reference
- [ ] `show_in_channel` `message.new` with an open thread: channel publishes 1, not 2
- [ ] N linked collections → 2N−1 publishes (down from N²), asserted for N = 2..4
- [ ] immutability rule documented wherever `formatMessage` is declared

---

## Task P5: `transaction` around the dispatch fan-out

**File(s) to modify:** `src/entityStore/EntityStore.ts`, `src/client.ts` (`dispatchEvent`)

**Status:** open

**Dependencies:** P4 (for the full N; independently useful)

**Scope:**

Wrap the event fan-out in `EntityStore.transaction` (`:154`, already re-entrant) so the remaining
cross-notifications coalesce into one flush. Takes 2N−1 → **N**.

**Must ship with a `flushSubscribers` reordering, or optimistic writes regress.** Inside a transaction
`markDirty` only accumulates, so `flushSubscribers` (`:170`) finds nothing pending on the siblings,
and their publish then rides the 500ms throttle. The writer itself is unaffected, so the symptom is
the **pinned list / open thread lagging on your own sends** — easy to miss in review.

Record ids whose `flushSubscribers` was requested during a transaction and run those flushes **after**
the final `flush()` on exit.

**Acceptance criteria:**

- [ ] N linked collections → exactly **N** publishes for N = 1..6
- [ ] an optimistic write still renders in sibling collections without waiting on the throttle —
      an explicit test, since this is the regression the reordering exists to prevent
- [ ] nested transactions still flush only on the outermost exit

---

## Task P6: conditional `setOne` in `ingestItem`

**File(s) to modify:** `src/pagination/paginators/BasePaginator.ts` (`:2461`)

**Status:** open

**Dependencies:** none — orthogonal to P3–P5, since it reduces **N** rather than the cost per N

**Scope:**

```ts
if (this._itemIndex.has(id) || this.matchesFilter(ingestedItem)) {
  this._itemIndex.setOne(ingestedItem);
}
```

`_itemIndex.has(id)` already exists (`StoreBackedItemIndex.ts:79`).

**The removal path must stay intact** — an unpinned message **is** held, so its content still has to
reach the store, which is the whole reason the write currently precedes the filter check
([`spec.md` §0](spec.md)). What goes away is the pinned paginator writing and subscribing for every
ordinary message in the channel.

**Knock-on for the update queue:** the `channelPinnedMessages` echo target exists _only_ because this
ingest is unconditional. Making it conditional removes roughly half the gated sites in `channel.ts`,
collapses `EchoScope`'s channel declaration to a single target, and deletes the "arm the pinned target
unconditionally" case in `reconcileHeldMessage`. **Worth doing before finalising the update queue.**

**Resolve before implementing:**

- does `pinned_at` changing without `pinned` changing matter for the pinned sort?
- what should happen for a pinned message the pinned window has never loaded?

**Acceptance criteria:**

- [ ] a non-pinned `message.new` leaves `pinnedMessagesPaginator.getItem(id)` **undefined**
- [ ] pin transition still auto-adds; unpin still auto-removes
- [ ] a message sent with `pinned: true` still reaches the pinned list

---

## Task P7: stop re-allocating `reaction_groups` in `formatMessage`

**File(s) to modify:** `src/utils.ts` (`:639`, `maybeGetReactionGroupsFallback`)

**Status:** open — optional

**Dependencies:** none

**Scope:**

Return the input reference when there is nothing to fall back to, instead of a fresh `{}`. This is the
single field that makes two independently formatted copies unequal (verified: 23 keys, exactly one
differs). Makes `formatMessage` output stable generally.

**Acceptance criteria:**

- [ ] two independent `formatMessage(msg)` results are shallow-equal on all keys
- [ ] messages with no reaction data still get the documented fallback shape

---

## Task P8: tighten `reconcileChangedIds`' throttled branch

**File(s) to modify:** `src/pagination/paginators/BasePaginator.ts`

**Status:** open — optional, lowest priority

**Dependencies:** none

**Scope:**

The unthrottled fast path skips publishing when `updated === currentItems[i]`; the throttled branch
(which the message list uses) gates on interval membership only and schedules unconditionally. Bring
them in line. Latent — not the cause of anything measured here — but it composes with P4/P5.

---

## Sequencing

1. **P1 + P2** first. They are self-contained, have the clearest measured win, and depend on nothing.
2. **P3 → P4** (precondition, then memo). This is the generic fix and the one that protects
   collections added in future.
3. **P5** completes N² → N. Ships with the `flushSubscribers` reordering or not at all.
4. **P6** independently, and **before the update queue is finalised** — it deletes a large part of
   that feature's surface.
5. **P7, P8** opportunistic.

## Companion repo: `stream-chat-react-native`

Context only — not tasks, and not in this repo. Both already landed on `feat/mutation-echo-verify`
there while investigating:

- **Removed dead `optimisticallyUpdatedNewMessages`** from `Channel.tsx` — a `Set` created and deleted
  from but **never added to and never read**. Removing it made `handleEvent` a pure no-op, which meant
  `channel.on(handleEvent)` was subscribing an empty callback to every channel WS event; the
  subscription, the `listener`, the cleanup and the `EventHandler` import went with it. −54 lines.

- **Fixed 92 portal-induced TypeScript errors** with a `paths` mapping in `package/tsconfig.json`. The
  Yarn `portal:` leaves two physical copies of `@stream-io/state-store`, Node resolves a symlinked
  package by realpath, and `StateStore` has `protected` members so TS compares it **nominally**.
  92 → 0. No-op when not portalled, and `paths` is resolution-only so emitted `.d.ts` is unaffected.
  Recipe added to the `scrn-portal-local-stream-chat-js` skill.

## Deferred (needs an owner, not in scope here)

**`@stream-io/state-store` should be a `peerDependency`.** It is a plain `dependency` of both
`stream-chat` and `stream-chat-react-native-core`, so nothing forces their ranges to agree. Today both
are `^1.1.6` and package managers hoist one copy, so integrators are fine. The first time the ranges
diverge — a staged rollout where state-store goes 2.0 and one SDK upgrades before the other — two
copies get installed and **every integrator calling the public `useStateStore` with a store from
`stream-chat` gets the same nominal-typing wall**, in their own app, with no fix available to them.
Cross-repo publishing decision.
