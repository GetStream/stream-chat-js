# Thread Constructor Minimal Initialization Spec

## Problem Statement

Today, `Thread` in `stream-chat-js` can only be created from full `threadData` (`ThreadResponse`).

This spec exists to support `stream-chat-react/src/components/ChatView/layoutController/spec.md`.

That is a blocker for the target UI composition in `stream-chat-react`:

- render `<Channel />` and `<Thread />` as siblings
- hand a `Thread` instance to `<Thread />` immediately (from known parent message + channel)
- fetch/hydrate full thread data after `<Thread />` mounts

Without constructor support for this, `<Thread />` in thread-instance mode expects an already hydrated instance, which defeats the sibling/lazy-hydration flow.

## Desired UX/Data Flow

1. User opens a thread from a parent message already available in channel state.
2. App creates a minimal `Thread` instance using known references (`client`, `channel`, `parentMessage`).
3. `<Thread />` renders immediately using minimal state (at least parent message context).
4. `<Thread />` (or the thread instance) triggers fetch (`reload`) to hydrate replies/read/participants/pagination.
5. UI updates seamlessly once data arrives.

Why this matters:

- faster perceived response (no blocking on `getThread` before render)
- enables clean sibling layout architecture
- keeps SDK-level thread lifecycle encapsulated in `Thread`

## Current Cross-Codebase Constraints

### `stream-chat-js` assumptions that must remain valid

- `ThreadManager` expects stable `thread.id`, `thread.channel.cid`, `hasStaleState`, `hydrateState`.
- `MessageComposer` uses `compositionContext instanceof Thread` and requires `thread.channel`.
- `MessageDeliveryReporter` reads thread `id`, `channel`, `state.replies`, and `state.read`.

### `stream-chat-react` target architecture constraints (per ChatView layoutController)

- `ThreadProvider` should provide thread context only; it should not render/wrap a `Channel` component.
- `Thread.tsx` in the new ChatView flow should not depend on `ChannelActionContext` thread functions (`loadMoreThread`, `closeThread`, etc.).
- `Thread.tsx` should operate from `Thread` instance state/methods in thread-instance mode (`state`, `reload`, `loadPrevPage`, `loadNextPage`, `activate`, `deactivate`).
- Legacy Channel-centric thread behavior is out of scope for this change.

## Goals

- Add a safe minimal constructor path for `Thread`.
- Support sibling `<Channel />` + `<Thread />` rendering with post-mount hydration.
- Make `Thread.tsx` rely only on `Thread` instance API in the ChatView layoutController flow.
- Keep thread identity and behavior predictable across SDK and React consumers that use `Thread` instances.

## Non-Goals

- No API contract changes for backend thread endpoints.
- No support for `Thread.tsx` behavior that depends on `ChannelActionContext` thread actions.
- No removals/renames of public `Thread` methods.

## Proposed API

Constructor should use a single params object where `threadData` is optional:

- `{ client, channel, parentMessage, draft?, threadData? }`

Initialization behavior:

- if `threadData` is provided, initialize from `threadData`
- if `threadData` is not provided, initialize from `channel + parentMessage`

Rationale:

- `channel` and `parentMessage` are exactly what the sibling-render flow already has.
- optional `draft` enables initializing thread message composition state in instance-only flow.
- optional `threadData` allows callers that already have server payload to initialize directly.

## Required Changes in `src/thread.ts`

### 1) Constructor typing and branching

Change:

- Keep a single constructor signature and make `threadData` optional.
- When `threadData` is present, initialize from it.
- When `threadData` is absent, require minimal input: `client + channel + parentMessage` (with optional `draft`).

Why:

- keeps API explicit and type-safe
- prevents ambiguous partially-hydrated constructor inputs

### 2) Add minimal initialization path

Change:

- Build a valid `ThreadState` from minimal input (without server thread payload).

Why:

- `Thread.tsx` and other consumers can safely subscribe to `thread.state` immediately.

### 3) Validate identity-critical fields

Change:

- In minimal mode, require `parentMessage.id`; throw early if missing.
- Set `this.id = parentMessage.id`.

Why:

- `id` is used everywhere (React keys, thread selection, mark-read targets, manager maps).
- silent `undefined` ids would create hard-to-debug downstream failures.

### 4) Keep `channel` as provided in minimal mode

Change:

- Do not synthesize channel from thread payload in minimal mode; use provided instance.

Why:

- sibling rendering already operates in a concrete channel context.
- `ThreadProvider` no longer wrapping `Channel` means `Thread` instance must be the source of channel linkage for thread operations.

### 5) Share read-state placeholder logic

Change:

- Extract current placeholder read behavior and reuse for both constructor modes.

Why:

- unread/read logic currently depends on read-state shape being initialized.
- avoids drift between modes.

### 6) Hydration completeness

Change:

- Update `hydrateState(...)` to also copy/hydrate pagination state, not only replies/read/etc.

Why:

- minimal thread starts without useful cursors.
- pagination must become operational after hydration.

### 7) Pagination bootstrap behavior

Change:

- Ensure minimal thread does not get stuck with both cursors `null`.
- Either:
  - guarantee `reload()` is run before paginating, and hydration sets pagination correctly, or
  - allow first pagination query to bootstrap when stale/minimal.

Why:

- in thread-instance mode, `Thread.tsx` uses `thread.loadPrevPage/loadNextPage`.
- if cursors never initialize, load-more becomes inert.

### 8) Composer initialization parity

Change:

- Initialize `messageComposer` in minimal mode with optional `draft`.

Why:

- support draft-first UIs in the instance-only flow.

## Minimal `ThreadState` Defaults (with rationale)

- `active: false` (not yet focused)
- `isLoading: false` (no request in flight initially)
- `isStateStale: true` (explicit signal that server hydration is needed)
- `channel: provided channel` (required by React and composer)
- `parentMessage: formatMessage(parentMessage)` (enables immediate header/parent render)
- `createdAt: parent message created time or now` (non-null contract)
- `deletedAt: null`
- `participants: []` (unknown until hydration)
- `read: placeholder per current user strategy` (stable unread logic)
- `replies: []` (unknown until hydration)
- `replyCount: 0` (unknown default)
- `pagination: { isLoadingNext: false, isLoadingPrev: false, nextCursor: null, prevCursor: null }`
- `updatedAt: null`
- `title: ''`
- `custom: {}`

## Required `stream-chat-react` Integration Behavior

For `Thread.tsx` thread-instance mode (from `ThreadProvider`) in ChatView layoutController flow:

1. On mount, if `threadInstance.hasStaleState` is true, call `threadInstance.reload()`.
2. Keep immediate render using `parentMessage` from minimal state while loading.
3. Avoid duplicate fetches by relying on `Thread.reload()` in-flight guards.
4. Use `threadInstance.loadPrevPage/loadNextPage` for pagination; do not call `ChannelActionContext.loadMoreThread`.
5. Use thread-instance close/navigation callbacks provided by ChatView/layout controller wiring; do not require `ChannelActionContext.closeThread`.
6. `ThreadProvider` must not render `<Channel />`; it should provide only thread context.

Why:

- this is the core mechanism that makes sibling rendering practical without prefetching.
- it removes the old Channel-coupled dependency chain that blocks the new layout controller architecture.

## Testing Plan

### `stream-chat-js` tests

Add to `test/unit/threads.test.ts`:

- constructs thread in minimal mode with valid default shape
- throws when minimal `parentMessage.id` is missing
- `id` derives from parent message id in minimal mode
- `reload()` hydrates stale minimal thread
- `hydrateState()` updates pagination too (not only replies/read/parent)
- pagination methods become usable after hydration

### `stream-chat-react` verification tests

Add/extend thread-instance tests:

- `<Thread />` renders with minimal thread instance (before hydration completes)
- mount triggers hydration path in thread-instance mode
- hydrated data appears in message list
- pagination uses thread-instance methods, not `ChannelActionContext` callbacks
- `ThreadProvider` can provide thread context without rendering `Channel`
- `activate/deactivate` lifecycle remains stable

## Risks and Mitigations

- Risk: minimal threads never hydrate in UI.
  Mitigation: explicit mount-time stale check + reload in `Thread.tsx`.

- Risk: pagination remains unusable after hydration.
  Mitigation: include pagination in `hydrateState` and add dedicated tests.

- Risk: hidden couplings to old Channel-context assumptions.
  Mitigation: remove ChannelActionContext dependencies from `Thread.tsx` path and enforce thread-instance tests.

## Acceptance Criteria

- Minimal constructor mode compiles with strict types.
- `Thread.tsx` can be mounted as a sibling of `Channel.tsx` with a minimal thread instance.
- The mounted `Thread.tsx` self-hydrates thread data and updates UI without manual prefetch.
- ChatView layoutController path works with `Thread.tsx` not relying on `ChannelActionContext` thread actions.
- `ThreadProvider` no longer needs to render `Channel` to make thread-instance rendering functional.
- All existing tests pass and new minimal-flow tests pass.
