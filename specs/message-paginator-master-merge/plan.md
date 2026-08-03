# stream-chat-js — Master ⇄ PR #1674 Merge Plan

## Worktree

**Worktree path:** `/Users/martincupela/Projects/stream/chat/stream-chat-js-worktrees/message-paginator-master-merge`
**Branch:** `feat/message-paginator-master-merge`
**Base branch:** `origin/master` (`77fb9c87`, v9.49.0)
**PR source:** `#1674` head `31eedab` — fetched locally as `pr-1674`
**Merge base:** `ef2169f` (2026-02-27) · master +92 commits · PR +32 commits

> All work in this worktree, never the main checkout. Do not push to remote.

## Strategy (see Open Decision D1)

Default is **merge PR #1674 into a branch cut from `origin/master`** (`git merge --no-ff pr-1674`), resolving the conflict set **once**. The earlier rebase attempt (`specs/message-paginator-master-merge` in the react `message-paginator-merge-plan` worktree) stalled because a 30+ commit replay re-surfaces the same broad conflicts repeatedly. A single merge commit is the pragmatic choice at this divergence size.

## Conflict surface (measured via trial merge — 7 files)

**Runtime (`src/`, 4):**

| File                                                   | Nature                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/channel.ts`                                       | Both sides changed heavily. PR: paginator wiring, minimal-init thread, message operations, custom mark-read. Master: 92 commits of fixes. **Highest-risk file.**                                                                                    |
| `src/client.ts`                                        | PR adds `InstanceConfigurationService`, store wiring, `messageDeliveryReporter`. Master added client-level features (e.g. AppIdentifier user-agent #1789). Note prior attempt hit a **missing `StateStore` import** regression here — watch for it. |
| `src/messageComposer/middleware/textComposer/types.ts` | Small type-shape conflict.                                                                                                                                                                                                                          |
| `src/pagination/index.ts`                              | PR restructured `pagination/` (moved `BasePaginator`/`ReminderPaginator` into `pagination/paginators/`); master edited the old barrel.                                                                                                              |

**Tests (3):** `test/unit/MessageComposer/messageComposer.test.ts`, `test/unit/MessageComposer/textComposer.test.ts`, `test/unit/channel.test.js`.

Everything else in the 78-file PR auto-merges (paginator stack, orchestrator, message-operations, reminders are net-new files with no master counterpart).

## Task overview

Serialized by file ownership; conflicting files are resolved in dependency order (types → runtime → tests). Tasks 2–4 touch distinct files and could parallelize, but are chained to keep one merge state coherent.

## Task 1: Perform the merge and capture raw conflicts

**File(s) to create/modify:** git index only; `specs/.../state.json`, `specs/.../decisions.md`

**Dependencies:** None

**Status:** pending

**Owner:** unassigned

**Scope:**

- From the worktree: `git merge --no-ff --no-commit pr-1674` (per D1; if D1 → rebase, `git rebase origin/master` on a branch cut from `pr-1674` instead).
- Do **not** commit yet. Record the conflicted file list and any `add/add` surprises in `decisions.md`.

**Acceptance Criteria:**

- [ ] Merge started; 7 conflicts present as measured.
- [ ] Conflict inventory recorded in `decisions.md`.

## Task 2: Resolve `pagination/index.ts` + textComposer types

**File(s) to create/modify:** `src/pagination/index.ts`, `src/messageComposer/middleware/textComposer/types.ts`

**Dependencies:** Task 1

**Status:** pending

**Owner:** unassigned

**Scope:**

- `pagination/index.ts`: keep the PR's re-export structure (`paginators/*`) as the source of truth; re-apply any master-added exports on top. Verify no dangling exports to the removed `pagination/BasePaginator.ts`/`ReminderPaginator.ts`.
- `textComposer/types.ts`: union both type additions.

**Acceptance Criteria:**

- [ ] Both files compile in isolation (`yarn types` after Task 4).
- [ ] No exports reference deleted modules.

## Task 3: Resolve `channel.ts` + `client.ts`

**File(s) to create/modify:** `src/channel.ts`, `src/client.ts`

**Dependencies:** Task 2

**Status:** pending

**Owner:** unassigned

**Scope:**

- `channel.ts`: base = PR version (it owns the paginator/thread/message-operations rewrite); then **re-apply each master fix** from the 92-commit range that landed in `channel.ts` (enumerate with `git log ef2169f..origin/master --oneline -- src/channel.ts`). See D2.
- `client.ts`: union PR's service/store/reporter wiring with master's client additions. Explicitly verify the `StateStore` import exists (prior regression).

**Acceptance Criteria:**

- [ ] `yarn types` passes.
- [ ] Every master `channel.ts` fix in range is present or consciously superseded (logged in `decisions.md`).

## Task 4: Reconcile the 3 conflicted test files + full verification

**File(s) to create/modify:** `test/unit/MessageComposer/messageComposer.test.ts`, `test/unit/MessageComposer/textComposer.test.ts`, `test/unit/channel.test.js`

**Dependencies:** Task 3

**Status:** pending

**Owner:** unassigned

**Scope:**

- Merge test additions from both sides; where master changed an assertion the PR also changed, prefer the assertion matching the merged runtime behavior.
- Commit the merge.
- Run `yarn types` then `yarn test`. Fix fallout (paginator, orchestrator, event-pipeline, thread, message-operations, delivery, composer suites are the ones the PR expands).

**Acceptance Criteria:**

- [ ] `yarn types` passes.
- [ ] `yarn test` passes (or every residual failure is triaged in `decisions.md`).
- [ ] Merge committed on `feat/message-paginator-master-merge`.

## Task 5: Build and expose for React linking

**File(s) to create/modify:** none (build artifacts); `specs/.../decisions.md`

**Dependencies:** Task 4

**Status:** pending

**Owner:** unassigned

**Scope:**

- `yarn build` → produce `dist/`.
- Document the link method chosen in D3 (yarn link / portal / file: dependency) so the React worktree can consume this exact build.

**Acceptance Criteria:**

- [ ] `dist/` built.
- [ ] Link command reproducible and recorded.

## Execution order

```
Phase 1: Task 1  (start merge)
Phase 2: Task 2  (types + pagination barrel)
Phase 3: Task 3  (channel.ts, client.ts)
Phase 4: Task 4  (tests + verify + commit)
Phase 5: Task 5  (build + link)  ──▶ unblocks React plan Task 8
```

## File ownership summary

| Task | Creates/Modifies                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | git index; `state.json`, `decisions.md`                                                                                            |
| 2    | `src/pagination/index.ts`, `src/messageComposer/middleware/textComposer/types.ts`                                                  |
| 3    | `src/channel.ts`, `src/client.ts`                                                                                                  |
| 4    | `test/unit/MessageComposer/messageComposer.test.ts`, `test/unit/MessageComposer/textComposer.test.ts`, `test/unit/channel.test.js` |
| 5    | build artifacts only                                                                                                               |

## Decisions — ALL RESOLVED 2026-07-03 (see decisions.md)

- **D1** = merge, resolve once (`git merge --no-ff pr-1674`).
- **D2** = `channel.ts` PR-base + re-apply master fixes; `client.ts` union both (verify `StateStore` import).
- **D3** = react worktree symlinks this folder; therefore `yarn build` (Task 5) is mandatory before react Task 8.
