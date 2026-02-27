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
