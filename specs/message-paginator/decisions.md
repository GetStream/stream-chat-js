# Decisions

## 2026-03-05 - Decouple request sort from in-memory ordering

- Decision: `MessagePaginator` will keep request `sort` configurable for backend calls, but internal interval/state ordering remains chronological (oldest -> newest).
- Why: Backend sort should not redefine paginator semantics used by Channel/Thread traversal and cursor/head-tail logic.

## 2026-03-05 - Thread requests newest-first while preserving chronological iteration

- Decision: `Thread` will request replies using `created_at: -1`, while paginator output remains oldest -> newest.
- Why: This satisfies thread loading expectations without changing consumer iteration assumptions.

## 2026-03-05 - Do not modify BasePaginator contract

- Decision: Decoupling will be implemented entirely in `MessagePaginator` via explicit request sort and item order handling.
- Why: `BasePaginator` is used by multiple subclasses and changing its contract would risk cross-paginator regressions.

## 2026-03-05 - Preserve `sort` option as backward-compatible alias

- Decision: Keep `MessagePaginatorOptions.sort` working as an alias for request sorting and add explicit `requestSort`.
- Why: Existing integrations may already pass `sort`; alias keeps semver compatibility while making intent explicit.

## 2026-03-05 - Canonicalize query pages inside MessagePaginator

- Decision: Normalize queried message pages to canonical chronological order before cursor derivation and interval ingestion.
- Why: `BasePaginator` interval/head-tail semantics in `MessagePaginator` assume chronological item ordering.

## 2026-03-05 - Additive BasePaginator item-order extension

- Decision: Add optional `itemOrderComparator` to `BasePaginator` options/config and use it for interval/item ordering, while defaulting to `sortComparator`.
- Why: This keeps backward compatibility (`itemOrder = requestOrder` by default) and lets specific paginators decouple backend request order from in-memory ordering.
