# Message Paginator Release Compatibility Decisions

## Decision: Treat BasePaginator API drift as the primary release risk

**Date:** 2026-03-05
**Context:**
`BasePaginator` remains publicly exported but its method names, direction values, cursor shape, and state fields changed.

**Decision:**
Prioritize compatibility strategy for `BasePaginator` before merging branch to `master`.

**Reasoning:**
This is the most likely downstream compile/runtime break for advanced integrators that extend paginator classes.

**Alternatives considered:**

- Ignore and treat as internal-only: rejected because `BasePaginator` is exported.
- Delay until post-merge: rejected because release classification would be unclear.

## Decision: Compatibility scope is root exports from `src/index.ts` only

**Date:** 2026-03-05
**Context:**
The release compatibility target is the public package API exposed through root exports.

**Decision:**
Do not add deep-import compatibility shims for moved paginator files.
Compatibility work is limited to symbols exported via `src/index.ts`.

**Reasoning:**
Deep imports are not the supported interface contract for this release.
Focusing on root exports keeps the compatibility scope explicit and maintainable.

**Alternatives considered:**

- Add shims for old deep-import file paths: rejected as out-of-scope for public API compatibility.

## Decision: Restore removed setup type exports on root surface

**Date:** 2026-03-05
**Context:**
`MessageComposerSetupState` moved into configuration internals and is no longer exported from root API.

**Decision:**
Plan includes restoring root exports (directly or via re-export) to avoid unintended TypeScript breakage.

**Reasoning:**
Type-only breaks still impact consumers and should be avoided in non-major release.

## Decision: Add transitional BasePaginator compatibility aliases

**Date:** 2026-03-05
**Context:**
`BasePaginator` introduced head/tail naming (`toTail`, `toHead`, `hasMoreTail`, `hasMoreHead`, `tailward/headward` cursors), while older consumers may still call legacy APIs.

**Decision:**
Add deprecated alias APIs on `BasePaginator`:

- methods: `next`, `prev`, `nextDebounced`, `prevDebounced`
- getters: `hasNext`, `hasPrev`
- query response compatibility: accept `next/prev` cursor fields as fallback to `tailward/headward`.

**Reasoning:**
This preserves backward compatibility for non-migrated paginator consumers while keeping new naming as canonical.
