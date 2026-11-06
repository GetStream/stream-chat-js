# Plan — User Reference Index

See [`goal.md`](goal.md) for objective and success criteria; [`decisions.md`](decisions.md) for the
open design decisions (**D1** index location and **D2** author-vs-quoted must be resolved before
Task 2).

## Worktree

**Worktree path (JS SDK):** `../stream-chat-js-worktrees/user-reference-index`
**Branch:** `feat/user-reference-index`
**Base branch:** `feat/message-paginator-master-merge`

All work MUST happen in this worktree, not the main checkout. Create/sync via the worktrees skill.
This feature has no React-side tasks (the change is internal to the JS SDK's event propagation).

## Task overview

Tasks are self-contained. The **critical path** is: resolve design (D1/D2) → build the index +
maintenance at the single choke point → expose lookup → rewrite the two client handlers → tests. The
index-maintenance task owns `ItemIndex` (a serialization chokepoint), so anything touching it chains
behind Task 2.

---

## Task 1: Resolve design decisions (D1, D2, D3)

**File(s) to create/modify:** `specs/user-reference-index/decisions.md`

**Dependencies:** None

**Status:** pending

**Owner:** unassigned

**Scope:**

- Pick index location (D1: per-`ItemIndex` vs client-aggregate), relationship coverage (D2: author +
  quoted author), and granularity (D3: channel-set vs message-set). Record the choice + rationale.
- Write the concrete type the rest of the tasks target, e.g. `UserReferenceIndex` with
  `add(message)`, `remove(message)`, `channelsFor(userId)` / `messageIdsFor(userId)`.

**Acceptance Criteria:**

- [ ] D1, D2, D3 marked resolved with a one-line rationale each.
- [ ] The chosen index interface is written down (signatures) for Tasks 2–4 to implement against.

## Task 2: Index + maintenance at the ingest/remove choke point

**File(s) to create/modify:** `src/pagination/ItemIndex.ts` (+ a new `UserReferenceIndex` if D1=per-index), unit test alongside

**Dependencies:** Task 1

**Status:** pending

**Owner:** unassigned

**Scope:**

- Maintain the index from the single choke point that all ingestion funnels through
  (`ItemIndex.setOne` / `remove`). On `setOne`, diff the previous cached item's referenced user id(s)
  against the new item's and move references (D4). On `remove`, drop them.
- Cover both `message.user?.id` and `message.quoted_message?.user?.id` (per D2).
- Ensure `truncate` (bulk `remove`) and `clearStateAndCache` (index `clear`) drop references.

**Acceptance Criteria:**

- [ ] Index reflects author + quoted-author references after `setOne`/`remove`/`clear`.
- [ ] Author-replacement on `setOne` moves the reference (old id no longer maps, new id does).
- [ ] Unit tests for add/replace/remove/clear/truncate maintenance.

## Task 3: Expose targeted lookup from Channel/paginators

**File(s) to create/modify:** `src/pagination/paginators/BasePaginator.ts` or `MessageIntervalPaginator.ts` (lookup accessor), `src/channel.ts` (aggregate if needed)

**Dependencies:** Task 2

**Status:** pending

**Owner:** unassigned

**Scope:**

- Expose a way for the client to ask "which channels / messages reference `userId`?" per the chosen
  shape (D1/D3). If D1=client-aggregate, wire paginator ref changes up to `client.state`; if
  D1=per-index, expose `referencesUser(userId)` / `messageIdsForUser(userId)` on the paginator.

**Acceptance Criteria:**

- [ ] Client can resolve affected channels (and message ids if D3=message-set) in better than
      O(loaded items) per channel.
- [ ] No new imperative maintenance call added to `channel.ts` event handlers.

## Task 4: Rewrite client user-event handlers to use the index

**File(s) to create/modify:** `src/client.ts` (`_updateUserMessageReferences`, `_deleteUserMessageReference`)

**Dependencies:** Task 3

**Status:** pending

**Owner:** unassigned

**Scope:**

- Replace the `Object.values(this.activeChannels)` scan with an index lookup that yields only the
  channels (and messages, if D3=message-set) referencing the user, then apply `reflectUserUpdate` /
  `applyMessageDeletionForUser` to those only. Keep the quoted-author deletion behavior identical.

**Acceptance Criteria:**

- [ ] `user.updated` updates exactly the previously-affected messages (author) — no others visited.
- [ ] `user.deleted` (soft + hard) affects author and quoted-author messages identically to today.
- [ ] Existing `client.test.js` user-event suites pass unchanged (behavior parity).

## Task 5: Tests + complexity verification

**File(s) to create/modify:** `test/unit/client.test.js`, `test/unit/pagination/*` as needed

**Dependencies:** Task 4

**Status:** pending

**Owner:** unassigned

**Scope:**

- Add tests: multi-channel setup where only some channels reference the user; assert only those are
  touched (spy on `reflectUserUpdate` / `applyMessageDeletionForUser`, or on index lookup).
- Add a note / micro-benchmark demonstrating the visited-set is proportional to references, not to
  total active channels × loaded items.

**Acceptance Criteria:**

- [ ] Test proves unrelated channels' paginators are not walked on a user event.
- [ ] `yarn types`, `yarn lint`, `yarn test` all green.

---

## Execution order

- **Phase 0 (design):** Task 1.
- **Phase 1 (core):** Task 2 (after Task 1).
- **Phase 2 (wire-up):** Task 3 (after Task 2), then Task 4 (after Task 3) — serialized because they
  chain `ItemIndex` → paginator → client.
- **Phase 3 (verify):** Task 5 (after Task 4).

Little parallelism here — it's a short dependency chain through the ingest choke point. The main
value of the plan is sequencing and the design gate.

## File ownership summary

| Task | Creates/Modifies                                                          |
| ---- | ------------------------------------------------------------------------- |
| 1    | `specs/user-reference-index/decisions.md`                                 |
| 2    | `src/pagination/ItemIndex.ts` (+ optional `UserReferenceIndex.ts`) + test |
| 3    | `src/pagination/paginators/*.ts`, `src/channel.ts` (aggregate, if D1=B)   |
| 4    | `src/client.ts`                                                           |
| 5    | `test/unit/client.test.js`, `test/unit/pagination/*`                      |
