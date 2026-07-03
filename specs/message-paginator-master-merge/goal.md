# stream-chat-js — Master ⇄ PR #1674 Merge Goal

## Objective

Produce a single `stream-chat-js` branch that contains **both**:

- everything `origin/master` has gained since the PR branch diverged (merge base `ef2169f`, 2026-02-27; **92 master commits**), and
- the full feature set of **PR #1674** — "add message/channel paginator stack with thread minimal-init and state stores" (head `31eedab`, **32 commits**).

This branch is the **dependency** for the parallel `stream-chat-react` merge (PR #2909 consumes its new APIs). It must be stabilized and locally linkable **before** the React integration is validated.

## Success criteria

- Branch `feat/message-paginator-master-merge` contains master + PR #1674 with all conflicts resolved deliberately.
- `yarn types` passes.
- `yarn test` passes (paginator, orchestrator, event-pipeline, thread, message-operations, delivery, composer suites in particular).
- The public API surface consumed by stream-chat-react PR #2909 is intact: `messagePaginator`, `MessagePaginator`/`MessageReplyPaginator`, `ChannelPaginator`, `ChannelPaginatorsOrchestrator`, `EventHandlerPipeline`, reactive `ChannelState` stores (watchers/typing/read/members/own_capabilities/muted), `Thread` minimal-init constructor, `MessageOperations`/`MessageOperationStatePolicy`, `InstanceConfigurationService`, `configState.requestHandlers`, `messageDeliveryReporter`.
- Package is buildable and linkable into the React worktree (`yarn build` produces `dist/`).

## Constraints

- All work happens in the worktree `../stream-chat-js-worktrees/message-paginator-master-merge`, never the main checkout.
- Do not push to remote (per worktrees skill).
- Preserve master's behavioral fixes; do not silently drop them when resolving in favor of the PR.

## Non-goals

- New paginator features beyond what PR #1674 already introduces.
- Refactors outside the divergence surface.
