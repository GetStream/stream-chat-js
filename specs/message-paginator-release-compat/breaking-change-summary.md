# Breaking-Change Summary (`master`...`feat/message-paginator`)

## Highest-Risk Changes

1. **`BasePaginator` API contract changed behind same public export name**

- Old API shape (`next/prev`, `hasNext/hasPrev`, `cursor.next/prev`, direction `next|prev`) was replaced by (`toHead/toTail`, `hasMoreHead/hasMoreTail`, `cursor.headward/tailward`, direction `headward|tailward`).
- This can break downstream subclasses and direct usages.

2. **Moved paginator source files can break unsupported deep-import paths (out of scope)**

- Files moved from `src/pagination/*` to `src/pagination/paginators/*`.
- Root exports remain available via `src/index.ts -> export * from './pagination'`.
- Risk exists only for consumers importing internal paths such as `stream-chat/src/pagination/BasePaginator`.
- This is out of scope for this compatibility pass because the supported interface is root exports.

3. **`MessageReceiptsTracker` constructor options changed (mostly internal/pseudo-break)**

- Old usage expected `{ locateMessage }`; new usage requires `{ channel, locateMessage? }`.
- Existing direct instantiation can break, but expected impact is low because this class is primarily used internally by `Channel`.

## Medium-Risk Changes

4. **Setup-related type exports moved out of `client.ts`**

- `MessageComposerSetupState` and related setup types were exported previously from `client.ts` and now live in `configuration/types.ts`.
- This is resolved if root `index.ts` re-exports `./configuration`.

5. **`StreamChat._messageComposerSetupState` removed (internal-only)**

- This is internal API and not part of supported semver surface.

## Suggested Release Classification

- If compatibility shims/re-exports are **not** added: treat as **major**.
- If shims/re-exports are added and `BasePaginator` compatibility is preserved/aliased: could remain **minor**.
