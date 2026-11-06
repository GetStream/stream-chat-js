# Retained items — list members not delivered by pagination

Status: **implemented** (2026-07). Scope: `stream-chat-js` (`BasePaginator` + a thin
`ChannelPaginatorsOrchestrator` pass-through) and `stream-chat-react` (hooks + example).

> **Shipped design = SEPARATE STORE, not a merge.** The body below (Ordering / Invariants /
> Entity-storage sections) was written for an earlier "merge retained items into the paginated
> `state.items`" model that was **abandoned**. Retained items are NOT merged into the paginated
> list; they live in their own reactive store and the UI renders them wherever it likes. This
> avoids provenance ledgers, offset-corruption, and dedup entirely.

Shipped:

- **`stream-chat-js` — `BasePaginator` (flat mode):** single `_itemIndex` owns entities; the
  paginated `state.items` is unchanged (pure server list). Retained membership is a separate
  reactive `retainedState: StateStore<{ itemIds: string[] }>` (ids only, entities resolved via
  `getItem`). API: `retainItem(item, { onDuplicateRetrieved? })` / `releaseItem(id)` /
  `isRetained(id)`; `PaginatorOptions.onDuplicateRetrieved` (`keepRetained` default). Lifecycle:
  a retained item that stops matching the filter (or is removed) drops from the store. Pagination
  is untouched (retained items are never in `state.items`).
- **`ChannelPaginatorsOrchestrator`:** `retainChannel(channel, opts?)` / `releaseChannel(cid)` —
  data-semantic, delegate to the owning paginator(s) (ownership resolver picks the owner).
- **`stream-chat-react`:** `useChannelPaginatorState(paginator)` (reactive paginated view) and
  `useRetainedChannels(paginator)` (retained ids → entities, sorted by `effectiveComparator`).
- **Example:** `WorkspaceUrlSync` restore calls `orchestrator.retainChannel`; the channel nav
  renders a pinned retained section per paginator via `useRetainedChannels`.

Verified: full JS unit suite green (+7 retained-items tests); deep-linking a past-page-1 channel
shows it in the pinned section and opens it, with the paginated list/offset untouched.

Related SDK fix (message-paginator gap, not retained-items specific): `Channel.watch()` now seeds the
channel's `messagePaginator` with the first (latest) page it fetches, mirroring
`client.hydrateActiveChannels()` on the `queryChannels()` path. Previously only list-queried channels
had a seeded message paginator; a channel opened via `watch()` alone (deep-link restore, search
result, new DM) rendered an empty `MessageList` until a later channel-list query re-seeded it. See
`channel.ts` `watch()`.

Ownership at `retainChannel` time depends on `matchesFilter`, which reads channel state
(`state.members`, membership, mute status). A channel absent from every loaded page is an unwatched
stub whose state is empty, so retaining it right away would match only the empty-filter fallback
(`channels:opened`), never a data-dependent list like `channels:default`. The example therefore
**watches the channel before retaining** (`WorkspaceUrlSync.resolveBinding`) — the same single watch
`<Channel>` would issue, moved earlier — so ownership resolves into the real owning list. The retained
section then renders for the **active** paginator only (`RetainedChannels paginator={activePaginator}`).

## Problem

An item can enter a list by a route **other than pagination** — a `?channel=` deep-link restore, a
search result, a freshly created DM, or a WS-ingested channel. Such an item may live past the
loaded page, so a first-page (re)query replaces the list and drops it. We need a first-class,
data-layer way to say "this item belongs in the list regardless of whether pagination delivered it"
— without corrupting pagination and without UI concepts bleeding into the SDK.

## Two orthogonal axes (core idea)

Presence and order are **separate concerns** and must not be conflated (that was the "pin" mistake):

- **Membership** (new) — _is the item in the list?_ Presence for items not delivered by pagination.
- **Ordering** (`boost` + `sortComparator`, unchanged) — _where does it rank among items that are in
  the list?_ Boost never creates presence; it only reorders items already present.

"Deep-linked channel shown at the top" is therefore **membership + boost**, not a third concept.
`boost` is not "retain without TTL" — TTL is incidental; the real difference is the axis (rank vs
presence).

## Membership API (data-semantic, on `BasePaginator`)

No UI verbs in the client. The paginator exposes:

```ts
retainItem(item: T, opts?: { onDuplicateRetrieved?: 'keepRetained' | 'dropRetained' }): void;
releaseItem(id: string): void;
isRetained(id: string): boolean;
// config default:
//   PaginatorOptions.onDuplicateRetrieved?: 'keepRetained' | 'dropRetained'  (default 'keepRetained')
```

"The user opened a channel (URL / search / DM)" is an **app** intent that _maps to_ `retainItem`.
That mapping lives in the app (and, optionally, a thin data-semantic pass-through on the
orchestrator that routes to the owning paginator — e.g. `retainChannel`/`releaseChannel`, still not
`open`/`close`). The SDK stays UI-agnostic.

## Provenance: an item can hold two memberships at once

An item may be **paginated** (delivered by a server page) and/or **retained** (declared via
`retainItem`). The paginator tracks which ids arrived via a server page. This ledger is what lets
`releaseItem` know whether an item survives on its own.

## `onDuplicateRetrieved` — dedup resolution (the only real policy)

When the _same_ item is both retained and paginated, that's a duplicate. Display is **always**
deduped (shown once) and offset/cursor **always** ignore the retained set — automatic, not policy.
The single choice is what happens to the **retained record**:

- **`keepRetained`** (default) — retention stands. If a later re-query's first page no longer
  includes the item, retention still keeps it. The library does not silently undo an explicit
  declaration.
- **`dropRetained`** — retention was a _bridge_ until pagination caught up; once a page covers the
  item, drop it from the retained set so it behaves like any ordinary paginated member thereafter.

Both produce the **identical list right now**. They diverge only on a _future_ re-query that no
longer returns the item — so the policy is purely "how durable is this retention." (The earlier name
`onPaginationOverlap` was misleading — it named the trigger, not the decision; this is a
deduplication resolution, hence `onDuplicateRetrieved`.)

## Ordering of retained items

- Retained items are ordered by the **paginator's own sort** — `effectiveComparator` = `boost`
  first, then `sortComparator` (built from the paginator's `sort` param). With nothing boosted,
  `effectiveComparator` collapses to `sortComparator`, so retained items sort exactly like paginated
  ones.
- Each retained item is **inserted into the displayed list at its comparator position** (the same
  boost-aware binary-search insert `ingestItem` uses) over the server-ordered items, deduped — the
  paginated items are **not** globally re-sorted, so we never diverge from server order.
- **Boost is the explicit override** to lift a specific retained item to the top (the deep-link
  "active channel at top" case), independent of its sort key.

### Honest caveat (inherent, not a bug)

A retained item that isn't paginated yet has an **unknown true position** — only the loaded window
is known. So by sort key it can only be placed _among the loaded items_; if it truly belongs below
the loaded window it lands at the bottom of that window (best effort). Boost overrides this when a
deterministic top position is wanted. (This is why the `MessagePaginator` logical-head/tail model
does **not** transfer to channels: channel order is UI-state-dependent, so a sort-derived slot is
both wrong and useless — boost-to-top is the channel-appropriate answer.)

## Invariants

- **Display** = union(paginated, retained), deduped, ordered by `effectiveComparator` (retained
  items merged into the server-ordered list at their comparator position).
- **Pagination** — offset/cursor derive from the **paginated set only**. Already true in
  `BasePaginator`: `postQueryReconcile` advances `offset` by the _raw server page_ length, not the
  displayed array length — so retained items never shift where the next page starts.
- **Automatic removal happens only on filter/lifecycle** — a retained item is shown iff it still
  matches the paginator's filter (archived/muted out, deleted → drops). It is **never** auto-removed
  merely because pagination reached it — that is exactly what `dropRetained` opts into, explicitly.
- **Scope:** flat-list mode (`ChannelPaginator`). Interval-storage paginators (`MessagePaginator`)
  model out-of-range items via logical intervals and are out of scope for retention.

## Entity storage — reuse `_itemIndex` (flat mode must populate it)

Entities live in **one** place: the paginator's `_itemIndex` (id → entity). `retainedItems` is then
just an **ordered array of ids** (kept in `effectiveComparator` order), not a second copy of the
entities. `releaseItem`/`isRetained` operate on ids; display resolves ids → entities via
`_itemIndex`.

Today this store is **not** available to `ChannelPaginator`: `_itemIndex` is allocated in every
paginator (BasePaginator ctor) but only written in **interval mode** (`ingestPage` and the
interval branch of `ingestItem`). So this feature requires:

- **Flat mode populates `_itemIndex`** — write entities on query reconcile and `ingestItem`, remove
  on removal — so `getItem(id)` works for channels.
- **Decouple entity-store from interval-storage.** `_usesItemIntervalStorage = !!itemIndex` conflates
  "an index exists" with "use interval storage," but they're separable: the fallback index is
  created regardless, so flat mode can use it as a plain id map **without** enabling intervals.
  Channels stay flat; retention gets an entity store.

## Implementation sketch (for when we build it)

- `BasePaginator`:
  - Maintain `_itemIndex` in flat mode (see above) as the single entity store.
  - `retainedItemIds: string[]` (or a Set kept sorted for display) — ids only, ordered by
    `effectiveComparator`; entities resolved via `_itemIndex`.
  - a server-provenance id set, `retainItem` / `releaseItem` / `isRetained`, and a display-assembly
    step that merges retained ids into the server-ordered list by `effectiveComparator`, deduped.
    Re-applied on every reconcile so retention survives a first-page replace. `onDuplicateRetrieved` config +
    per-call override drives whether a paginated duplicate clears the retained record.
- `ChannelPaginatorsOrchestrator`: optional thin `retainChannel(channel)` / `releaseChannel(cid)`
  that resolve the owning paginator(s) and delegate — data-semantic, no UI verbs.
- Consumer (stream-chat-react example `Sync.tsx`): map URL/thread restore intent → `retainChannel`;
  boost the restored channel if "top" placement is desired.
- Tests: retention survives first-page reconcile; offset unaffected by retained count; `keepRetained`
  vs `dropRetained` divergence only across a re-query; filter-mismatch drops a retained item;
  retained ordering follows `sortComparator` (and boost override); no-op in interval-storage mode.
