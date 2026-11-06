# stream-chat-js — Merge Decisions Log

## Decision: Fresh integration worktree off origin/master

**Date:** 2026-07-02
**Context:** A prior attempt (April 2026) rebased `feat/message-paginator` onto an older master inside the react `message-paginator-merge-plan` worktree and stalled. Master has since advanced to v9.49.0 (92 commits past the PR merge base).
**Decision:** Cut a new branch `feat/message-paginator-master-merge` from `origin/master` in a dedicated worktree and integrate PR #1674 into it.
**Reasoning:** Isolates this integration from the stale attempt; uses current master as the authoritative base to satisfy "maintain master functionality."

## Decision: D1 — Merge, resolve once

**Date:** 2026-07-03 · **Chosen:** `git merge --no-ff pr-1674` into a branch cut from `origin/master`. Rebase rejected (per-commit conflict replay stalled the April attempt).

## Decision: D3 — Symlink the local stream-chat-js folder

**Date:** 2026-07-03 · **Chosen:** the react worktree consumes this JS worktree via a direct filesystem **symlink** into its `node_modules/stream-chat`, not yarn link / portal / tarball. **Consequence:** this worktree must be **built (`yarn build` → `dist/`)** before the react side can resolve it, since `stream-chat` is consumed via its `package.json` exports/`dist`. Task 5 remains required. Rebuild after any src change the react side depends on.

## Decision: D2 — channel.ts/client.ts base preference

**Date:** 2026-07-03 · **Chosen (per react D-R5 policy):** substantially-rewritten files use **PR base + re-apply master fixes**. `src/channel.ts` (PR owns the paginator/thread/message-operations rewrite) → PR base; enumerate and re-apply each master fix from `git log ef2169f..origin/master --oneline -- src/channel.ts`. `src/client.ts` → union both sides (neither is a full rewrite); explicitly verify the `StateStore` import (prior regression). Incidental files → master base + re-apply PR swap.

All decisions resolved — plan unblocked.

## Execution log — merge of PR #1674 into release-v10 (2026-07-03)

Integration branch `feat/message-paginator-master-merge` re-based onto `origin/release-v10`; `git merge --no-ff pr-1674`. **7 textual conflicts, all resolved:**

- `src/pagination/index.ts` — kept `./paginators` barrel (PR moved ReminderPaginator there) + kept master's new `./UserGroupPaginator` export; dropped the moved `./ReminderPaginator` export.
- `src/messageComposer/middleware/textComposer/types.ts` — union import (`MessageComposerEffect` from master + `Event` from PR); both used.
- `src/client.ts` — union imports (PR's configuration/StateStore + master's offline/cache); kept only `QueryChannelsResponseWithChannels` type (used); dropped `MessageComposer{SetupFunction,TearDownFunction}` (moved to `./configuration`). Re-added dropped `import type { MessageComposer }`.
- `src/channel.ts` — (1) push_preferences: kept master's `ChannelPushPreference` type (#1786) + PR's `configState`. (2) sendFile JSDoc + PR's 4 message-operation methods both kept. (3+4) **member_count inc/dec on member.added/removed: took master (empty) side — the PR reintroduces the exact double-count bug master fix #1761 removed.**
- test files: merged both sides; kept master's #1761 "does not change member_count" test; kept both channel.updated member_count tests; unioned imports; kept `mentions: []` in textComposer state expectations (master added `mentions`, merged runtime has it).

**Hidden semantic conflicts fixed (types now pass):**

- `MessageComposerEffectHandlers.ts` — added `typing: {}` (merged `TextComposerState` requires it).
- `src/pagination/UserGroupPaginator.ts` — **ported from old `BasePaginator<T>` to new `paginators/BasePaginator<T, Q>`** (master's #1743 feature vs PR's paginator rewrite): new import path, `<UserGroupResponse, QueryUserGroupsOptions>`, `getNextQueryShape` override, `headward`/`tailward` cursor model, `initialState` override `hasMoreHead:false`. Test file updated to new cursor API.

**5 remaining test failures — need decisions / further work (types green, 3462/3469 pass):**

1–2. **channel #1732 (2 tests) — DECISION NEEDED.** Irreconcilable without a call: the PR's reactive `own_capabilities` store (channel_state.ts) makes fresh channels report `own_capabilities: []`, tripping the `read-events` guard in `_countMessageAsUnread`. Master's #1732 expects fresh (unloaded) channels to still count unread (own_capabilities `undefined` = unknown). But the PR's own tests (`undefined ID no options`, `keeps ... assignments in sync`) require fresh channels to be `[]`. Same input, opposite required outputs → one side's tests must change. **Option A** (keep PR: own_capabilities always `[]`) → update master's #1732 unread assertion. **Option B** (preserve master: `undefined` until loaded) → update the PR's 2 own_capabilities tests + verify no React #2909 dependency on always-`[]`. Recommend B (semantically, unloaded ≠ "no capabilities"), pending React-impact check. 3. **ChannelPaginatorsOrchestrator "removes the channel from all paginators"** — `removeItem` now called with `{ id, item: Channel }`; test expects `{ id, ... }` without the channel instance. Needs diagnosis (merged channel shape vs PR test expectation). 4. **messageComposer "should initialize with custom config"** — merged attachments config has one extra key vs expected. Needs diagnosis (master vs PR default config). 5. **UserGroupPaginator "paginates ... synthesized cursors"** — ported paginator does not accumulate items across pages (new base uses interval/itemIndex storage). Port likely needs `itemIndex` config or the test updated to the new accumulation model.

### Resolution of the 5 failures — ALL FIXED (2026-07-03). Types + lint pass; 3467/3469 tests pass (0 failures).

1–2. **channel #1732 — resolved via Option B (user decision: preserve master).** `channel_state.ts syncOwnCapabilitiesFromChannelData` now keeps the reactive getter/setter but returns `undefined` (not `[]`) until capabilities are actually provided/loaded. This preserves master's #1732 unread behavior AND the PR's "keeps assignments in sync" (setter still defined). Only the PR's `undefined ID no options` test value expectation updated (`[]` → `undefined`); `Object.keys` unchanged (getter still enumerable). **React follow-up:** verify #2909 does not depend on `own_capabilities` being an always-`[]` array on unloaded channels. 3. **orchestrator — resolved.** Master #1788 evicts the channel from `activeChannels` on `notification.removed_from_channel`, so the orchestrator legitimately removes by `id` with `item: undefined`. Updated the PR-era test to expect `{ id, item: undefined }` (channel.deleted / channel.hidden still pass with `item: ch`). 4. **messageComposer custom config — resolved.** Merged `DEFAULT_COMPOSER_CONFIG` gained master's `attachments.trackUploadProgress` (#1708) and a top-level `commands` section. Added both to the PR-era test's expected object (preserve master config). 5. **UserGroupPaginator accumulation — resolved (real port bug).** The new base resets its accumulated list when the query shape changes (`'auto'` policy). My initial port embedded the cursor in `getNextQueryShape`, so each page's shape differed → reset → items replaced. Fixed by keeping the query shape stable (`{ limit, team_id }`) and applying the forward cursor inside `query` from `this.cursor.tailward` (as the original did). Test updated to the new `tailward`/`headward` cursor API.

**Status: JS merge complete.** `git merge --no-ff pr-1674` committed on `feat/message-paginator-master-merge` (checkpoint b58912f4, amended/extended with the fixes above). Next: `yarn build` (Task 5) for the React symlink.
