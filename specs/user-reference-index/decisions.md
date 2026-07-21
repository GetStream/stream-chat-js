# User Reference Index — Decisions

Open scope/design decisions. Resolve **D1** and **D2** before implementation (they set the shape the
tasks build against).

## D1 — Where does the index live? (blocks Task 2+)

- **Option A — per-`ItemIndex`:** each paginator's `ItemIndex` maintains a `userId → Set<messageId>`
  map as items are `setOne`/`remove`d. The client asks each active channel's paginators "do you
  reference this user?" — still iterates channels, but each lookup is O(1) instead of O(items).
  Cheapest to keep consistent (single choke point: `ItemIndex.setOne`/`remove`), but still O(active
  channels) to find affected ones.
- **Option B — client-level aggregate:** a `userId → Map<cid, Set<messageId>>` on `client.state`,
  updated as paginators ingest/remove. `user.updated` looks up the exact channels + messages. Fully
  targeted (no channel iteration), but requires paginators to report ref changes up to the client
  (a subscription or callback), which reintroduces some coupling.
- **Recommendation:** start with **A** (contained, single choke point) and measure; escalate to **B**
  only if the O(active channels) lookup is still a hotspot. Decide up front so tasks target one shape.

## D2 — Author only, or author + quoted author? (blocks Task 3/4)

The update path (`reflectUserUpdate`) only touches `message.user`. The delete path
(`applyMessageDeletionForUser`) touches `message.user` **and** `message.quoted_message.user`. Options:

- Index **both** relationships under the same user key (a message referenced twice — as author and as
  quoted author of another message — is fine; lookups dedupe by message id).
- Index **author only**, and keep a separate targeted pass for quoted authors (or accept a scan just
  for the quoted case).
- **Recommendation:** index both; it is the only way to make the delete path fully targeted, and the
  maintenance choke point already sees the whole message (so `quoted_message.user?.id` is available).

## D3 — Index granularity: channel-set vs message-set

- `userId → Set<cid>`: enough to call the existing `reflectUserUpdate(user)` / `applyMessageDeletionForUser({userId})`
  on only the right channels (those methods still self-filter internally, but over a much smaller set).
  Minimal change to the paginator methods.
- `userId → message ids`: lets the paginator update exactly the referenced messages (no per-channel
  re-scan at all), but requires new paginator entry points that take explicit ids.
- **Recommendation:** channel-set first (smallest delta, reuses existing methods); revisit message-set
  if profiling shows the in-channel self-filter is still significant.

## D4 — Consistency on author replacement

`user.id` does not change on `user.updated` (name/image only), so the index key is stable for updates.
But `ItemIndex.setOne` can replace a cached message with a **different author** (e.g. an edit event
carrying a corrected `user`, or an optimistic→confirmed swap). The maintenance logic must, on
`setOne`, diff the previous cached item's `user.id` / `quoted_message.user.id` against the new one and
move the reference. `remove`, `truncate`, and `clearStateAndCache` must drop references. This is the
main correctness surface — Task 2's tests must cover it.

## D5 — Interaction with `userChannelReferences`

Leave `client.state.userChannelReferences` (members/watchers/read) as-is. The new index is message-
scoped and separate. Do **not** try to merge them — they have different maintenance points and
lifetimes. Confirm no code path expects message authors to appear in `userChannelReferences` after
this change (the message-paginator-master-merge work already stopped registering them there).
