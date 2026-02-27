# Plan: Thread Constructor Minimal Init

## Worktree

- **Path:** `/Users/martincupela/Projects/stream/chat/stream-chat-js-worktrees/thread-constructor-minimal-init`
- **Branch:** `feat/init-empty-thread`
- **Base branch:** `master`

## Task Overview

Tasks are self-contained and parallelizable where possible; tasks touching the same file have explicit dependencies and must run sequentially.

## Task 1: Add Optional `threadData` Constructor Branch in `Thread`

**File(s) to create/modify:** `src/thread.ts`

**Dependencies:** None

**Status:** in-progress

**Owner:** codex

**Scope:**

- Keep a single constructor params object and make `threadData` optional.
- Add minimal-init branch (`client + channel + parentMessage`, optional `draft`).
- Validate required minimal identity fields (especially `parentMessage.id`).
- Initialize complete minimal `ThreadState` defaults.

**Acceptance Criteria:**

- [ ] `Thread` can be constructed without `threadData`.
- [ ] Constructor still accepts `threadData` when provided.
- [ ] Minimal init produces a valid `ThreadState` shape with no undefined required fields.

## Task 2: Complete Hydration + Pagination Bootstrap for Minimal Threads

**File(s) to create/modify:** `src/thread.ts`

**Dependencies:** Task 1

**Status:** pending

**Owner:** unassigned

**Scope:**

- Ensure `hydrateState(...)` copies pagination state needed for thread-instance pagination.
- Ensure minimal-init threads can become paginable after hydration/reload.
- Keep read-state and message composer behavior consistent with thread-instance flow.

**Acceptance Criteria:**

- [ ] `hydrateState(...)` updates pagination fields required by `loadPrevPage/loadNextPage`.
- [ ] Minimal thread does not get stuck with unusable pagination after reload.

## Task 3: Decouple `ThreadProvider` from `Channel` Rendering

**File(s) to create/modify:** `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Threads/ThreadContext.tsx`

**Dependencies:** None

**Status:** pending

**Owner:** unassigned

**Scope:**

- Remove `Channel` wrapper from `ThreadProvider`.
- Keep provider focused on thread context only.
- Preserve type safety for thread context consumers.

**Acceptance Criteria:**

- [ ] `ThreadProvider` no longer renders `<Channel />`.
- [ ] Thread context remains available to downstream components.

## Task 4: Make `Thread.tsx` Thread-Instance-Driven (No `ChannelActionContext` Thread Actions)

**File(s) to create/modify:** `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Thread/Thread.tsx`

**Dependencies:** Task 3

**Status:** pending

**Owner:** unassigned

**Scope:**

- In thread-instance mode, use `Thread` instance API (`reload`, `loadPrevPage`, `loadNextPage`, state selectors).
- Trigger self-hydration on mount when thread state is stale.
- Remove reliance on `ChannelActionContext` thread actions for this flow.

**Acceptance Criteria:**

- [ ] `Thread.tsx` renders with a minimal thread instance and self-hydrates.
- [ ] Pagination in thread-instance mode uses `threadInstance` methods.
- [ ] Thread-instance flow does not require `ChannelActionContext.loadMoreThread/closeThread`.

## Task 5: Add `stream-chat-js` Unit Coverage for Minimal Constructor + Hydration

**File(s) to create/modify:** `test/unit/threads.test.ts`

**Dependencies:** Task 2

**Status:** pending

**Owner:** unassigned

**Scope:**

- Add tests for minimal constructor path and validation behavior.
- Add tests for hydration/pagination behavior after minimal initialization.
- Confirm thread identity/read defaults for minimal mode.

**Acceptance Criteria:**

- [ ] Tests cover minimal construction, missing id validation, and reload hydration path.
- [ ] Tests verify pagination becomes usable after hydration.

## Task 6: Add `stream-chat-react` Coverage for Thread-Instance-Only Flow

**File(s) to create/modify:** `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Thread/__tests__/Thread.test.js`, `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Threads/__tests__/ThreadContext.test.tsx`

**Dependencies:** Task 4

**Status:** pending

**Owner:** unassigned

**Scope:**

- Add tests for minimal thread instance render before hydration completes.
- Verify mount-time reload in thread-instance mode.
- Verify `ThreadProvider` works without `Channel` wrapper.

**Acceptance Criteria:**

- [ ] Tests fail if thread-instance flow regresses to `ChannelActionContext` dependency.
- [ ] Tests validate self-hydration and thread-instance pagination hooks.

## Task 7: Integration Verification and Final Checks

**File(s) to create/modify:** `src/thread.ts`, `test/unit/threads.test.ts`, `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Thread/Thread.tsx`, `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Threads/ThreadContext.tsx`, `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Thread/__tests__/Thread.test.js`, `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Threads/__tests__/ThreadContext.test.tsx`

**Dependencies:** Task 5, Task 6

**Status:** pending

**Owner:** unassigned

**Scope:**

- Run type checks and targeted tests across both repos.
- Fix any integration breakages caused by decoupling.
- Confirm spec acceptance criteria are met end-to-end.

**Acceptance Criteria:**

- [ ] Required type checks and tests pass for touched areas.
- [ ] No remaining `Thread.tsx` dependency on `ChannelActionContext` thread actions in target flow.

## Execution Order

- **Phase 1 (parallel):** Task 1, Task 3
- **Phase 2 (sequential branches):**
- `src/thread.ts` branch: Task 2 (after Task 1)
- `stream-chat-react` branch: Task 4 (after Task 3)
- **Phase 3 (parallel):** Task 5 (after Task 2), Task 6 (after Task 4)
- **Phase 4:** Task 7 (after Task 5 and Task 6)

## File Ownership Summary

| Task   | Creates/Modifies                                                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1 | `src/thread.ts`                                                                                                                                                                                                                   |
| Task 2 | `src/thread.ts`                                                                                                                                                                                                                   |
| Task 3 | `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Threads/ThreadContext.tsx`                                                                                                                             |
| Task 4 | `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Thread/Thread.tsx`                                                                                                                                     |
| Task 5 | `test/unit/threads.test.ts`                                                                                                                                                                                                       |
| Task 6 | `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Thread/__tests__/Thread.test.js`, `/Users/martincupela/Projects/stream/chat/stream-chat-react/src/components/Threads/__tests__/ThreadContext.test.tsx` |
| Task 7 | Integration verification across touched files                                                                                                                                                                                     |
