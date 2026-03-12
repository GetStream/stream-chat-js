# Worktree

- Path: `/Users/martincupela/Projects/stream/chat/stream-chat-js`
- Branch: `feat/message-paginator`
- Base branch: `master`

Task plan assumes self-contained tasks; same-file tasks are explicitly chained to avoid overlap.

## Task 1: Define Decoupled Ordering Contract

**File(s) to create/modify:** `specs/message-paginator/spec.md`, `specs/message-paginator/decisions.md`

**Dependencies:** None

**Status:** done

**Owner:** codex

**Scope:**

- Document that request sort and in-memory paginator order are separate concerns.
- Capture rationale and boundary with `ChannelState.messageSets`.

**Acceptance Criteria:**

- [x] Spec states desired behavior and constraints.
- [x] Decision log records why decoupling is required.

## Task 2: Implement MessagePaginator Decoupling

**File(s) to create/modify:** `src/pagination/paginators/MessagePaginator.ts`, `src/thread.ts`

**Dependencies:** Task 1

**Status:** done

**Owner:** codex

**Scope:**

- Introduce generic item-order comparator support in `BasePaginator`.
- Introduce explicit request sort and item-order semantics in `MessagePaginator` options.
- Keep backend request sort configurable.
- Keep internal paginator comparator/order chronological and independent from request sort.
- Ensure cursor derivation works even if backend returns pages in reverse order.
- Keep `Thread` request sort newest-first and default page size behavior.

**Acceptance Criteria:**

- [x] BasePaginator has additive item-order comparator support, defaulting to existing behavior.
- [x] Thread paginator requests `created_at: -1` while `state.items` ordering remains chronological.
- [x] Channel paginator behavior remains unchanged.
- [x] Cursors/head-tail flags remain correct in tests.

## Task 3: Add Regression Tests

**File(s) to create/modify:** `test/unit/pagination/paginators/MessagePaginator.test.ts`, `test/unit/threads.test.ts`

**Dependencies:** Task 2

**Status:** done

**Owner:** codex

**Scope:**

- Add tests proving request sort does not redefine item iteration order.
- Verify thread defaults (`sort`, page size) and query behavior.
- Run regression tests for other paginators extending `BasePaginator` to confirm compatibility.

**Acceptance Criteria:**

- [x] Unit tests fail before implementation and pass after.
- [x] New assertions cover both request call params and returned item ordering.
- [x] Existing tests for other paginator subclasses pass without modifications in their implementations.

## Task 4: Reflect Results in Ralph State

**File(s) to create/modify:** `specs/message-paginator/state.json`, `specs/message-paginator/decisions.md`, `specs/message-paginator/plan.md`

**Dependencies:** Task 3

**Status:** done

**Owner:** codex

**Scope:**

- Update task statuses and summary of outcomes.
- Record any follow-up risks.

**Acceptance Criteria:**

- [x] state.json mirrors real task status.
- [x] decisions.md has append-only entries for key choices.

## Execution Order

1. Phase 1 (serial): Task 1
2. Phase 2 (serial, same-file dependency): Task 2
3. Phase 3 (serial, same-file dependency): Task 3
4. Phase 4 (serial): Task 4

## File Ownership Summary

| Task   | Creates/Modifies                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| Task 1 | `specs/message-paginator/spec.md`, `specs/message-paginator/decisions.md`                                       |
| Task 2 | `src/pagination/paginators/MessagePaginator.ts`, `src/thread.ts`                                                |
| Task 3 | `test/unit/pagination/paginators/MessagePaginator.test.ts`, `test/unit/threads.test.ts`                         |
| Task 4 | `specs/message-paginator/state.json`, `specs/message-paginator/decisions.md`, `specs/message-paginator/plan.md` |
