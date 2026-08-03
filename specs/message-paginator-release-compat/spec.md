# Message Paginator Release Compatibility Spec

## Problem Statement

Branch `feat/message-paginator` introduces large pagination/runtime refactors. Before merging to `master`, we need a focused semver review to identify changes that can break existing consumers of `stream-chat`.

## Goal

Document concrete breaking-change risks and define mitigation tasks so merge/release can be done safely.

Additionally, validate compatibility against `stream-chat-react@release-v13` using the local `stream-chat-js@feat/message-paginator` build.

## Non-Goals

- Re-implementing the feature set in this spec task.
- Exhaustive behavioral QA of all new pagination flows.

## Breaking-Change Risk Summary

### High Risk

1. `BasePaginator` public contract changed while keeping the same export name

- Evidence:
  - Old API in `src/pagination/BasePaginator.ts` (deleted): `next/prev`, `hasNext/hasPrev`, `PaginationDirection = 'next' | 'prev'`, `cursor.next/cursor.prev`.
  - New API in `src/pagination/paginators/BasePaginator.ts`: `toHead/toTail`, `hasMoreHead/hasMoreTail`, `PaginationDirection = 'headward' | 'tailward'`, `cursor.headward/cursor.tailward`.
- Impact:
  - Consumers subclassing or directly using exported `BasePaginator` from `stream-chat` can fail at compile time and behavior level.

2. Deep import paths removed from shipped `src/` tree

- Evidence:
  - Deleted files: `src/pagination/BasePaginator.ts`, `src/pagination/ReminderPaginator.ts`.
  - Package ships `/src` (`package.json -> files`), so many consumers rely on internal deep imports despite `exports` map only exposing `.`.
- Impact:
  - Runtime/module-resolution failure for imports like `stream-chat/src/pagination/BasePaginator` and `stream-chat/src/pagination/ReminderPaginator`.

3. `MessageReceiptsTracker` constructor contract changed

- Evidence:
  - Old: `new MessageReceiptsTracker({ locateMessage })`.
  - New: `new MessageReceiptsTracker({ channel, locateMessage? })` in `src/messageDelivery/MessageReceiptsTracker.ts`.
- Impact:
  - External instantiation with previous options shape breaks (type and runtime).

### Medium Risk

4. Previously exported setup types no longer exported from root package surface

- Evidence:
  - `src/client.ts` no longer exports `MessageComposerSetupState`/related setup types.
  - New types live under `src/configuration/types.ts` but root `src/index.ts` does not export `./configuration`.
- Impact:
  - TS consumers importing these types from `'stream-chat'` or `'stream-chat/src/client'` can break.

5. Undocumented but reachable `StreamChat._messageComposerSetupState` removed

- Evidence:
  - Property removed from `src/client.ts`; replaced by `instanceConfigurationService`.
- Impact:
  - Integrations depending on this internal field break.

## Lower-Risk (Mostly Additive)

- New exports: `ChannelPaginatorsOrchestrator`, `EventHandlerPipeline`.
- New optimistic wrappers on `Channel`/`Thread` (`send/retry/update/delete...WithLocalUpdate`).
- `Thread.markAsRead` remains available as deprecated alias to `markRead`.

## Success Criteria

- Breaking points are either mitigated with compatibility shims/re-exports or explicitly released as major version changes.
- Test coverage is added for all compatibility shims.
- Release notes explicitly call out any intentional breaks.
- Cross-repo compatibility validation is executed against `stream-chat-react@release-v13` with local `stream-chat-js` artifacts.
