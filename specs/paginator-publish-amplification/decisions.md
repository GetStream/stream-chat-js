# Decisions — Paginator publish amplification

Every decision here **gates work in [`plan.md`](plan.md)**. All are OPEN. Recommendations are stated
so an implementer has a default, but D-PPA-1, D-PPA-4 and D-PPA-5 are the maintainer's call, not an
agent's.

## D-PPA-1 — Does the `formatMessage` memo go on the public function?

**Status:** OPEN — gates **P4**

**Question:** `formatMessage` is exported from `src/index.ts`. Memoising it on input identity means
integrators calling it twice with the same object get the **same** `LocalMessage` back. Do we memoise
the public function and document the resulting immutability rule, or expose the memo on an internal
entry point that only SDK call sites use?

**Trade-off:** Memoising the public function is the whole point — the win comes from _every_ consumer
of one event converging on one object, and an internal-only entry point reintroduces exactly the
call-site discipline this task exists to remove (see `spec.md` §3: `message.new` sat un-hoisted on
`release-v10` next to two arms that got it right). Against that, it silently changes the contract for
integrators: a formatted message becomes shared, so mutating one now affects every holder. Nothing in
`src` mutates a formatted message today (verified by grep), so the SDK itself is safe either way.

**Recommendation:** memoise the **public** function and document "a formatted message must be treated
as immutable" on its declaration. The alternative preserves a hazard in order to avoid documenting
one.

## D-PPA-2 — Does `pinned_at` changing without `pinned` matter?

**Status:** OPEN — gates **P6**

**Question:** P6 makes the pinned paginator's index write conditional on the item being held or
matching `{ cid, pinned: true }`. `PinnedMessagePaginator` sorts by `pinned_at` ascending. If a
message is re-pinned (or the server rewrites `pinned_at`) while `pinned` stays `true`, does the pinned
list need to reorder — and does the conditional write still deliver that?

**Trade-off:** If the message is already held, the condition passes (`_itemIndex.has(id)` is true) and
nothing changes, so the sort still updates. The question is only whether any path produces a
`pinned_at` change for a message the pinned index does **not** hold. Needs a concrete answer before
P6, because getting it wrong means a pinned message silently sorting in the wrong place.

**Recommendation:** verify against the backend's pin/unpin semantics; if `pinned_at` only ever changes
alongside a `pinned` transition, this is a non-issue and should be recorded as such.

## D-PPA-3 — A pinned message the pinned window never loaded

**Status:** OPEN — gates **P6**

**Question:** Today an edit to any pinned message calls `pinnedMessagesPaginator.ingestItem`, which
auto-adds it. The pinned list is paginated, so a pinned message far outside the loaded window can be
injected by an unrelated edit. Under P6 it would only be added on an actual pin transition. Which is
correct?

**Trade-off:** Current behaviour is arguably the accident — an edit to an old pinned message injecting
it into a window the user never scrolled to is not obviously desirable, and `ingestItem` places it by
sort bounds so it may land in a logical interval and not appear anyway. But it _is_ current behaviour,
and changing it is observable.

**Recommendation:** treat "added only on a pin transition" as correct and assert it in a test, but
confirm no UI depends on the current behaviour first.

## D-PPA-4 — Reimplement P1/P2, or take the existing implementation?

**Status:** OPEN — gates **P1**, **P2**

**Question:** P1 (the `formatMessage` hoist) and P2 (`ingestItem` publishes at most once) already
exist as working, measured code with guards on the `feat/mutation-echo` branch, where they were found.
Does the implementer redo them from this plan, or lift them?

**Trade-off:** Redoing them is a genuine clean-head second opinion on two changes to the core state
layer, and P2 in particular has a trap that a fresh implementer may well hit differently (the
`lockItemOrder` exclusion — see `spec.md` §2). Lifting them saves the work but inherits whatever the
original missed.

**Recommendation:** maintainer's call. If redoing, do **not** read the existing branch first — the
value is the independent second look.

## D-PPA-5 — Sequencing against the message state update queue

**Status:** OPEN — gates **P6**

**Question:** P6 removes roughly half the gated sites in `channel.ts` that the update queue
(`MutationEcho`) introduces, collapses its `EchoScope` channel declaration to a single target, and
deletes the "arm the pinned target unconditionally" case in `reconcileHeldMessage`. Does P6 land
before the queue is finalised, or after?

**Trade-off:** P6 first means the queue is designed against the smaller surface and never grows the
code P6 would delete. The queue first means that code is written, reviewed and then removed. This
only matters while the queue's own fate is undecided.

**Recommendation:** P6 first. It is independent of the queue, and it is strictly cheaper to not write
code than to write and delete it.
