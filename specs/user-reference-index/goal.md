# User Reference Index — Goal

## Background

`Channel._trackLatestMessage` was removed (see `specs/message-paginator-master-merge`). It used to
register each message author into `client.state.userChannelReferences` (a `userId → { cid: true }`
map). With that registration gone, `user.updated` / `user.deleted` propagation to message content can
no longer rely on the map, so the client now **scans every active channel**:

```ts
// client._updateUserMessageReferences / _deleteUserMessageReference
for (const channel of Object.values(this.activeChannels)) {
  channel.pinnedMessagesPaginator.reflectUserUpdate(user);
  channel.messagePaginator.reflectUserUpdate(user); // iterates the whole item index, filters by author id
}
```

`reflectUserUpdate` / `applyMessageDeletionForUser` are author-id-filtered no-ops on channels that
don't reference the user, so this is **correct** but does **O(active channels × loaded items)** work on
every `user.updated` / `user.deleted` — most of it wasted (a name change on one user walks every
message of every open channel).

## Objective

Introduce a **user → message-reference index** so that `user.updated` / `user.deleted` propagation
touches only the channels (ideally only the messages) that actually reference the user, restoring the
targeted behavior the old `userChannelReferences` author registration gave us — but maintained
automatically by the message stores rather than by an imperative per-message call in `channel.ts`.

The index must cover **both** relationships the current handlers act on:

- `message.user` (author) — used by `reflectUserUpdate` and `applyMessageDeletionForUser`.
- `message.quoted_message.user` (quoted author) — used by `applyMessageDeletionForUser` and the
  quoted-message deletion path.

## Success criteria

- `user.updated` / `user.deleted` propagation visits only channels/messages that reference the user;
  no full scan of unrelated active channels.
- Behavior parity with the current scan-based implementation: the same messages end up updated /
  deleted (author and quoted-author), across `messagePaginator` and `pinnedMessagesPaginator`.
- The index is maintained automatically as messages are ingested / updated / removed / truncated /
  cleared — no reintroduction of a per-message call in `channel.ts` (keep the channel↔paginator
  layering clean).
- `yarn types`, `yarn lint` (0 warnings), `yarn test` all pass; new unit tests cover index
  maintenance and targeted propagation; a benchmark or complexity note demonstrates the reduction.

## Constraints

- Build on branch `feat/message-paginator-master-merge` (this depends on the `_trackLatestMessage`
  removal and the active-channel-scan handlers).
- Do not change the observable semantics of `user.updated` / `user.deleted` handling.
- Keep `client.state.userChannelReferences` for members / watchers / read references — this spec is
  about **message** references only.
- Work in a dedicated worktree; do not push to remote.

## Non-goals

- Changing which stores participate (thread reply paginators are still handled by `Thread`'s own
  subscriptions, not by the client-level message-reference propagation — unchanged here).
- Member / watcher / read reference handling.
- Any change to `last_message_at` / latest-message tracking (separate, already shipped).
