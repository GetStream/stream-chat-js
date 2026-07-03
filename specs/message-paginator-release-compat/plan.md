# Message Paginator Release Compatibility Plan

## Worktree

**Worktree path:** `/Users/martincupela/Projects/stream/chat/stream-chat-js`
**Branch:** `feat/message-paginator`
**Base branch:** `master`

## Task overview

Scope is limited to the public interface exported via `src/index.ts`.
Deep-import path compatibility is explicitly out of scope.

## Task 1: Confirm Public Interface Scope

**File(s) to create/modify:** `specs/message-paginator-release-compat/decisions.md`, `specs/message-paginator-release-compat/spec.md`

**Dependencies:** None

**Status:** done

**Owner:** codex

**Scope:**

- Lock compatibility target to root exports from `src/index.ts`.
- Mark deep-import path stability as non-goal.

**Acceptance Criteria:**

- [x] Scope decision is documented.
- [x] Breaking-change summary reflects this scope.

## Task 2: Restore Root Export Coverage for Configuration Types

**File(s) to create/modify:** `src/index.ts`, `test/typescript/unit-test.ts`

**Dependencies:** Task 1

**Status:** done

**Owner:** codex

**Scope:**

- Ensure configuration setup types are root-exported (`export * from './configuration'`).
- Add a type-level regression check for configuration setup types.

**Acceptance Criteria:**

- [x] Root index exports configuration module.
- [x] Type-level regression check compiles.

## Task 3: Add Legacy BasePaginator API Aliases

**File(s) to create/modify:** `src/pagination/paginators/BasePaginator.ts`

**Dependencies:** Task 1

**Status:** done

**Owner:** codex

**Scope:**

- Add compatibility aliases:
  - `next`/`prev`
  - `nextDebounced`/`prevDebounced`
  - `hasNext`/`hasPrev`
- Support legacy `next/prev` cursor fields in query result fallback.

**Acceptance Criteria:**

- [x] Existing legacy paginator call sites compile and run via aliases.
- [x] New API remains primary and unchanged.
- [x] Aliases are documented as transitional compatibility layer.

## Task 4: Add Regression Tests for Alias Compatibility

**File(s) to create/modify:** `test/unit/pagination/paginators/BasePaginator.test.ts`

**Dependencies:** Task 3

**Status:** done

**Owner:** codex

**Scope:**

- Add tests for legacy method/getter aliases.
- Add test for `next/prev` cursor field fallback.

**Acceptance Criteria:**

- [x] Alias tests pass.
- [x] Existing paginator tests stay green.

## Task 5: Final Release Notes and Compatibility Summary

**File(s) to create/modify:** `specs/message-paginator-release-compat/spec.md`, `specs/message-paginator-release-compat/decisions.md`, `specs/message-paginator-release-compat/breaking-change-summary.md`

**Dependencies:** Task 2, Task 4

**Status:** done

**Owner:** codex

**Scope:**

- Finalize real vs pseudo breaking changes for public root API.
- Document deprecations and migration notes.

**Acceptance Criteria:**

- [x] Summary is aligned with public root export scope.
- [x] Remaining intentional breaks are explicitly listed.

## Task 6: Cross-Repo `release-v13` Compatibility Validation

**File(s) to create/modify:** `specs/message-paginator-release-compat/compatibility-report.release-v13.md`

**Dependencies:** Task 2, Task 4

**Status:** done

**Owner:** codex

**Scope:**

- Use `stream-chat-react` worktree at `/Users/martincupela/Projects/stream/chat/stream-chat-react-worktrees/chatview-layout-controller` (`release-v13` branch).
- Run tests against local `stream-chat-js` branch build (`feat/message-paginator`) by wiring React worktree dependency to local SDK.
- Focus on legacy compatibility surfaces:
  - `channel.state.messagePagination` and `messageSets` behavior used by `release-v13`.
  - mark-read and `doMarkReadRequest` flows.
  - paginator compatibility behavior where relevant.
- Record exact commands, results, and failures.

**Acceptance Criteria:**

- [x] Targeted `release-v13` tests for Channel/MessageList/Thread run against local JS SDK.
- [x] Any failures are categorized as real break, expected behavior shift, or test issue.
- [x] Compatibility report is committed to specs folder.

## Execution order

- **Phase 1 (serial):** Task 1
- **Phase 2 (parallel):** Task 2, Task 3
- **Phase 3 (serial):** Task 4
- **Phase 4 (serial):** Task 5
- **Phase 5 (serial):** Task 6

## File ownership summary

| Task   | Creates/Modifies                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1 | `specs/message-paginator-release-compat/decisions.md`, `specs/message-paginator-release-compat/spec.md`                                                                      |
| Task 2 | `src/index.ts`, `test/typescript/unit-test.ts`                                                                                                                               |
| Task 3 | `src/pagination/paginators/BasePaginator.ts`                                                                                                                                 |
| Task 4 | `test/unit/pagination/paginators/BasePaginator.test.ts`                                                                                                                      |
| Task 5 | `specs/message-paginator-release-compat/spec.md`, `specs/message-paginator-release-compat/decisions.md`, `specs/message-paginator-release-compat/breaking-change-summary.md` |
| Task 6 | `specs/message-paginator-release-compat/compatibility-report.release-v13.md`                                                                                                 |
