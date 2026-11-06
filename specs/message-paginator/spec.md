# Message Paginator: Request Sort vs Internal Order

## Goal

Decouple backend request sort parameters from in-memory message ordering in `MessagePaginator` using a generic `BasePaginator` ordering extension, so consumers can request newest-first pages while still iterating messages oldest-to-newest.

## Success Criteria

- `MessagePaginator` can call backend APIs (`channel.query` / `channel.getReplies`) with configurable `sort` values.
- `BasePaginator` supports a generic item-order comparator that controls interval/item ordering.
- For paginators that do not provide item-order comparator, behavior remains unchanged (item order follows existing request/comparator semantics).
- `MessagePaginator` exposes explicit request sorting configuration separate from item ordering semantics.
- `MessagePaginator.state.items` remain in stable chronological order (oldest -> newest) regardless of request sort.
- Cursor/head-tail semantics remain correct for message pagination after the decoupling.
- `Thread` can request replies with `created_at: -1` without changing paginator output order.
- Unit tests cover the decoupled behavior.

## Constraints

- Keep backward compatibility for existing channel-level pagination behavior.
- Preserve existing public exports and avoid breaking API removals.
- Do not rely on `ChannelState.messageSets` for paginator ordering behavior.
- `BasePaginator` extension must be additive and backward compatible.

## Non-Goals

- Rewriting legacy `Thread.state.replies` pagination flow.
- Refactoring unrelated paginator types.
- UI-level rendering changes.
