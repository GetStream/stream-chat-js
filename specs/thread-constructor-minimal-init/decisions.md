## Decision: Thread instance as the single runtime source for Thread.tsx

**Date:** 2026-02-27  
**Context:**  
The ChatView layoutController flow requires rendering `Thread.tsx` as a sibling of `Channel.tsx` and removing Thread runtime coupling to `ChannelActionContext`-based thread behavior.

**Decision:**  
`Thread.tsx` in the target flow will rely only on `Thread` instance API/state (`state`, `reload`, `loadPrevPage`, `loadNextPage`, lifecycle methods). `ThreadProvider` will provide thread context only and will not render `Channel`.

**Reasoning:**  
This makes sibling rendering possible without prefetching full thread payload and aligns thread lifecycle ownership with `stream-chat-js` `Thread` class.

**Alternatives considered:**

- Keep `ChannelActionContext` integration and preload full thread before mount — rejected because it blocks the target layout and increases coupling.
- Keep `ThreadProvider` rendering `Channel` while partially migrating internals — rejected because it preserves the same context coupling that the layoutController direction removes.

**Tradeoffs / Consequences:**  
`Thread` instance API/state must be complete enough for first render and post-mount hydration. React thread flow tests need to shift from channel-context assumptions to thread-instance assumptions.

## Decision: Single constructor signature with optional threadData

**Date:** 2026-02-27  
**Context:**  
The implementation should support minimal initialization while keeping constructor ergonomics simple.

**Decision:**  
Use one constructor params object with optional `threadData`; when present initialize from `threadData`, otherwise initialize from `client + channel + parentMessage` (with optional `draft`).

**Reasoning:**  
This satisfies both minimal and payload-backed creation without constructor overload complexity and matches requested API direction.

**Alternatives considered:**

- Constructor overloads/discriminated unions — rejected because not required and adds typing complexity.
- Separate factory methods (`fromThreadData`, `fromParent`) — rejected to avoid API expansion at this stage.

**Tradeoffs / Consequences:**  
Runtime validation must be explicit for missing minimal inputs (especially `parentMessage.id`) to avoid ambiguous failures.

## Decision: Minimal constructor branch requires explicit parent identity and initializes deterministic defaults

**Date:** 2026-02-27  
**Context:**  
Task 1 implementation needed to support creating `Thread` without API `threadData` while preserving runtime guarantees expected by existing thread methods.

**Decision:**  
When `threadData` is absent, constructor requires `channel` and `parentMessage.id`; it initializes full `ThreadState` with deterministic defaults (`replies: []`, empty participants/custom/title, placeholder read state for current user when available, and pagination cursors set to `null`).

**Reasoning:**  
This keeps `Thread` usable immediately after construction with no undefined required fields and provides a stable baseline for later hydration/reload to populate server-backed state.

**Alternatives considered:**

- Allow missing `parentMessage.id` and derive later — rejected because thread identity and thread-scoped operations depend on a stable id at construction time.
- Leave read/pagination fields partially undefined in minimal mode — rejected because it introduces conditional handling across runtime selectors and pagination codepaths.

**Tradeoffs / Consequences:**  
Minimal instances start non-paginable until hydrated by server data; Task 2 is responsible for carrying hydrated pagination into existing instances.

## Decision: Hydration must overwrite pagination from the fetched thread instance

**Date:** 2026-02-27  
**Context:**  
Minimal constructor threads initialize with null pagination cursors, so pagination methods remain inert until server-backed thread state is applied.

**Decision:**  
`Thread.hydrateState(...)` now copies `pagination` from the hydrated source thread alongside replies/read/metadata.

**Reasoning:**  
`loadPrevPage/loadNextPage` depend on `prevCursor/nextCursor`; without hydration of pagination, minimal threads stay permanently non-paginable after `reload()`.

**Alternatives considered:**

- Recompute pagination from current local replies during hydration — rejected because local replies may include optimistic/pending items and may not reflect server window boundaries.
- Keep pagination untouched and rely on later events — rejected because pagination remains blocked with null cursors.

**Tradeoffs / Consequences:**  
Hydration treats fetched thread pagination as source-of-truth and replaces local pagination state at once.

## Decision: ThreadProvider should be thread-context-only and not mount Channel

**Date:** 2026-02-27  
**Context:**  
Task 3 requires enabling sibling rendering of `Channel` and `Thread` in layoutController flow, which is blocked when `ThreadProvider` internally mounts `<Channel>`.

**Decision:**  
`ThreadProvider` now renders only `<ThreadContext.Provider>` and no longer wraps children with `<Channel>`.

**Reasoning:**  
This removes hidden channel-context coupling from thread provider composition and makes thread context provisioning independent from channel rendering topology.

**Alternatives considered:**

- Keep `<Channel>` wrapper and adapt Thread internals only — rejected because it preserves structural coupling and prevents true sibling layout control.

**Tradeoffs / Consequences:**  
`Thread.tsx` must no longer rely on channel action/state contexts in thread-instance mode; this is addressed in Task 4.

## Decision: Thread.tsx runs in thread-instance-only mode without channel contexts

**Date:** 2026-02-27  
**Context:**  
After removing `<Channel>` from `ThreadProvider`, `Thread.tsx` must render outside channel providers in the layoutController sibling setup.

**Decision:**  
`Thread.tsx` now depends only on `Thread` instance data (`useThreadContext` + `useStateStore(thread.state, ...)`) and uses thread instance methods for close, hydration (`reload` when stale), and pagination.

**Reasoning:**  
This removes hard runtime coupling to `ChannelStateContext`/`ChannelActionContext`, which are not guaranteed to exist in the target composition.

**Alternatives considered:**

- Keep optional reads from `ChannelStateContext` as fallback — rejected because that still makes Thread behavior coupled to channel context presence.

**Tradeoffs / Consequences:**  
Legacy channel-thread-only usage of `Thread.tsx` without a thread instance is no longer handled by this flow and must be adapted through thread-instance provisioning.
