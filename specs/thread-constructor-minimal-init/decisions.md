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
