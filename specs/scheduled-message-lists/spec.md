# Scheduled message lists: the channel owns its list, a manager owns the cross-channel lists

Status: **implemented**. Scope: `stream-chat-js` only, on top of `feat/cha-5934-scheduled-messages-v10`.
`stream-chat-react` (PR 3383) has to follow the API changes listed under [Breaking changes](#breaking-changes).

## Why

`ScheduledMessageManager` (`client.scheduledMessages`) held every scheduled-message list the SDK
knew about:

- one global `paginator` over all of the user's channels;
- a `channelPaginators` map with one paginator per channel, created on first access and never removed;
- the entity store they shared;
- its own consistency layer (`resolveLatest`, receive versions, `hydratedCids`, a `version` read by
  `Channel` and `StreamChat` around every channel query);
- every action (schedule, update, delete, send now).

That made it the owner of data that belongs to other objects:

- **A channel's list belonged to the manager, not the channel.** `Channel` had to read the
  manager's `version` before each query and hand the response's `scheduled_messages` back to it.
  A channel's scheduled messages come with the channel query (`include_scheduled_messages`), so the
  channel is where they belong, as its pinned messages do.
- **The per-channel map only grew.** A paginator created for a channel lived until logout, holding
  its store entries, even after the channel itself was disposed.
- **The manager decided which lists exist.** An integrator could not add a "failed only" list, and
  the global list existed whether the UI showed it or not.
- **The consistency layer only worked through the manager.** The version bookkeeping held only
  because every write went through it.

## Design

Three owners, one shared store.

```
StreamChat
├── scheduledMessageStore          EntityStore<ScheduledMessageResponse>, shared by every list
├── scheduledMessagePaginators     ScheduledMessagePaginatorsManager: lists the integrator registers
└── channelManager
    └── Channel
        └── scheduledMessagesPaginator   this channel's list, created with the channel
```

### 1. One shared store (`client.scheduledMessageStore`)

`client.scheduledMessageStore` is a plain `EntityStore<ScheduledMessageResponse>`. Every list writes
through a `StoreBackedItemIndex` over it, so a message shown in several lists is one object, and an
edit that reaches one list reaches the others. Entries are released when no list holds them.

The scheduled message state machine, as the backend (`lib/chat/state/scheduledmessages/store.go`,
`lib/chat/scheduledmessage/scheduledmessage.go`) implements it:

| From → to                            | Server operation                                                                  | Event     |
| ------------------------------------ | --------------------------------------------------------------------------------- | --------- |
| (new) → scheduled                    | create                                                                            | `created` |
| scheduled → scheduled                | update, send now (only while no send was tried)                                   | `updated` |
| scheduled → sending                  | the worker claims it                                                              | none      |
| sending → sending                    | released for a retry: the row is `scheduled` with attempts, reported as `sending` | none      |
| sending → sent                       | the row is deleted; the id can never be scheduled again                           | `sent`    |
| sending → failed, scheduled → failed | send failure; `expired`, `channel_deleted`                                        | `failed`  |
| scheduled → canceled                 | cancel (only while no send was tried)                                             | `deleted` |
| canceled → scheduled                 | create again with the same id, by the same user in the same channel               | `created` |
| failed → removed                     | delete: the row is removed and the id is free again                               | `deleted` |

So only `sent` never comes back. `canceled` can, and so can the id of a deleted failed message.

Writes are last-write-wins, as for messages and channels in the rest of v10: whichever writer lands
last (an event, a channel query, a list query or an action response) sets the stored copy. A channel
query that started before a message was sent or canceled can show it again until the next event or
reload corrects it. Rejecting such stale copies (`updated_at` ordering, and keeping a record of sent
and canceled messages after they leave every list) is a separate change, PR #2035, so that this
feature does not add an extension point to `EntityStore`.

This replaces the manager's `resolveLatest`, receive versions, `version`, `hydratedCids` and the
version checks in `Channel.requestChannelState` and `StreamChat.queryChannelsAndHydrate`. What stays
is the snapshot a list takes before a channel query (section 2), which keeps messages that arrived
by event while the request was in flight.

### 2. The channel owns its list (`channel.scheduledMessagesPaginator`)

- **Created with the channel,** like the pinned list, over `client.scheduledMessageStore`, as
  `public readonly scheduledMessagesPaginator`. Events that arrive before a page loaded are kept in it
  and make `items` defined, so a UI reads `hasLoadedPage` to tell whether it loaded. A channel
  created from its members gets its cid from its first query, and sets its list's filter to it then
  (`storeUnderServerCid`), before the response fills it; when that query supersedes the instance, the
  response fills the instance that took over. Disposed with the channel; a response that lands after disposal (logout) is ignored.
- **Filled by the channel query.** `query()`, `watch()`, `create()` and `reload()` send
  `include_scheduled_messages: true` unless the integrator turned scheduled messages off for the
  channel (`channel.scheduledMessages.enabled: false`). The server leaves the field out when the
  app has no scheduled messages, so the flag costs nothing there. The queries that only probe the
  channel do not send it: the message paginator's page queries, its `limit: 1` "older messages?"
  probe and the re-query on a `channel.updated` that changes `frozen`.
  - **Field present:** it is the complete set for the channel (scheduled, sending and failed, at
    most 100). The list applies it with its own operations: an unloaded list places it as its first,
    complete page, so it never queries; a loaded one removes what the response leaves out and
    ingests the rest.
    Messages that arrived by event while the request was in flight are kept: the list records
    which ids it held when the request went out, and an id missing from the response is dropped
    only if the list already held it then.
  - **Field absent** (more than 100, the server could not read them, or the feature is off): a list
    that already loaded reloads itself with `queryScheduledMessages({ filter: { cid } })`; one that
    never loaded stays unloaded until something loads it.
- **`queryChannels`** sends the flag too (unless `channel.scheduledMessages.enabled` is `false` in the
  client configuration) and fills each returned channel's list the same way. There the server leaves
  the field out of **every** channel when the page's channels hold more than 100 between them, so a
  missing field leaves the lists as they are instead of sending one query per channel; the events
  keep them current while connected, and an active channel's own reload after a reconnect reloads
  its list.
- **Configuration:** the list has its own key in the configuration tree,
  `channel.scheduledMessagesPaginator`, nested under the channel like `pinnedMessagesPaginator`.
- **Events:** `scheduled_message.*` carry the `cid`, so `dispatchEvent` routes them to the channel,
  which ingests them into its list.
  `deleted` is ingested as `canceled`, `sent` as `sent`; both then leave the list (they no longer
  match its status filter).
- **Actions** move to the channel: `scheduleMessage(request)`, `updateScheduledMessage(id, request)`,
  `deleteScheduledMessage(id)`, `sendScheduledMessageNow(id)`. They keep the existing request
  handlers (`channel.requestHandlers`, falling back to the client's `channel` configuration), the
  attachment sanitizing, and the "not found → remove it" handling. The result goes into the channel's
  list and to the manager's lists. The event that follows reaches every connection of the user,
  including this one, and writes an equal copy again.
- **Threads:** the channel's list holds thread replies too (`message.parent_id`); a thread's
  `ScheduledMessagesView` filters it by `parentId`.

### 3. The manager owns the lists the integrator registers (`client.scheduledMessagePaginators`)

`ScheduledMessagePaginatorsManager` replaces `ScheduledMessageManager` and is shaped like
`ChannelManager`:

- **`state: { paginators, isDisabled }`.** `paginators` are the lists the integrator registered;
  the manager creates none. `isDisabled` is `true` while a registered list's last query failed with
  error 114 (`scheduled_messages_disabled`), as before.
- **`setPaginators(paginators)`** is the primitive and publishes one update (skipped when the set is
  unchanged); **`insertPaginator({ paginator, index? })`**, **`removePaginator(paginatorOrId)`**,
  **`clearPaginators()`** and **`getPaginatorById(id)`** build on it.
- **Events:** after `registerSubscriptions()` it listens with `client.on`, so it hears events for
  every channel, loaded or not; the server sends `scheduled_message.*` to all of the user's own
  connections regardless of watches (`NotifyOwnUsers`). Each event is ingested into every registered
  list, and each list decides membership and position itself. The event-handler pipelines
  (`addEventHandler`, `setEventHandlers`, `removeEventHandlers`, `getDefaultHandlers()`) stay.
- **It updates only its own lists.** A channel's list is the channel's.
- **Recovery:** `ConnectionRecoveryManager` calls `recover()` on reconnect, which reloads the
  registered lists that had loaded. The `connection.recovered` handler is gone. Channel lists recover
  with their channel: an active channel's reload and a channel-list reload both send the flag.
- **Logout:** `disconnectUser` calls `resetPaginatorStates()`, which empties each list and keeps it
  registered (which lists exist is the integrator's configuration), and clears the store.

### 4. `ScheduledMessagePaginator`

- `new ScheduledMessagePaginator({ client, filter?, id?, paginatorOptions?, store? })`. `filter` is the
  query filter (`cid`, `status`), sent as given. Without a `status` the server lists `scheduled`,
  `sending` and `failed`, the only ones the query accepts, and local matching applies the same
  default: matching on `status` is what takes sent and canceled messages out of a list. `store` defaults to `client.scheduledMessageStore`, as a `ChannelPaginator`'s
  defaults to `client.channelManager.channelStore`.
- The same filter is sent with the query and matched locally (`buildMatchFilters()` returns it as
  `ScheduledMessagesFilter`): the query takes only `cid` and `status`, with no context to build from
  or server-resolved filter, so unlike `ChannelPaginator` it needs neither a `FilterBuilder` nor two
  filters. The `filter` setter replaces it and resets the list, as `ReminderPaginator.filters` does;
  a UI toggling statuses sets it and calls `reload()`.
- `hydrate(scheduledMessages, itemIdsAtRequest?)` applies a complete set through the paginator's
  own operations (`removeItem`, `ingestItem`, `setItems` for the first page) rather than resetting its
  intervals; `getItemIds()`, taken before the request, is the snapshot it compares against. It runs
  in one coalescing `batch()`, as `ChannelPaginator`'s recovery and `ThreadManager`'s release do, so
  a response publishes the list once rather than once per message.
- `setCompleteList`, `markEmptyComplete` and the old `ingestItem` override are gone; see the next
  section.

### 5. `BasePaginator`: complete lists that are empty

The paginator worked around three gaps in `BasePaginator`, which now handles them:

- **`setItems` with an empty page that is both the first and the last** now records that there is
  nothing more either way (`hasMoreHead` / `hasMoreTail` `false`), for every paginator. It used to
  leave the flags as they were, because an empty page creates no interval. Two other callers pass
  such a page: `ThreadPaginator.reload()` on an empty thread list, which now reports nothing more to
  load, and a thread whose `latest_replies` is empty while it holds every reply, whose next reply
  now starts the newest interval through master's `isNewNewestMessage` rather than waiting in the
  logical head. `ChannelPaginator` seeds from its cache without `isLastPage` and is unaffected.
- **An item ingested into a list that loaded empty and has nothing more either way** can start that
  list's single interval, marked as both head and tail, so later items join it. By default it still
  goes into the logical head interval, where a second item finds no interval to join and is not
  shown. That stays the default on purpose: `ChannelManager` re-queries a channel list that every
  channel left (`channel.visible`), and changing the default changed that behaviour in its tests.
  A paginator opts in with the protected getter `startsIntervalInEmptyCompleteList`;
  `ScheduledMessagePaginator` does, because its loaded list is the whole dataset. Master's d31d7891
  fixed the same gap for messages in `MessagePaginator` alone. Whether the list is empty is read
  from its intervals, not the published `items`, which lag inside a batch or behind the throttle: a
  batch that removed every item and ingested new ones would otherwise park them in the logical
  intervals, out of view. Starting the interval does not publish by itself either; the ingestion
  publishes, so a batch still emits once.
- **Items ingested while a first query is in flight, when that query comes back empty and
  complete.** They wait in the logical intervals, and `ingestPage` makes no interval from an empty
  page, so the list showed none of them. For a paginator that opts in through the same
  `startsIntervalInEmptyCompleteList`, `placePage` now places them as that page, a single interval
  marked as both head and tail. By default they still wait in the logical head.

## Breaking changes

All of these are to APIs that exist only on the scheduled-messages feature branch and have not been
released.

| Before                                                                                                      | After                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `client.scheduledMessages` (`ScheduledMessageManager`)                                                      | `client.scheduledMessagePaginators` (`ScheduledMessagePaginatorsManager`)                                                        |
| `client.scheduledMessages.store`                                                                            | `client.scheduledMessageStore`                                                                                                   |
| `client.scheduledMessages.paginator` (built in)                                                             | register your own: `client.scheduledMessagePaginators.insertPaginator({ paginator: new ScheduledMessagePaginator({ client }) })` |
| `client.scheduledMessages.getChannelPaginator(cid)`                                                         | `channel.scheduledMessagesPaginator`                                                                                             |
| `client.scheduledMessages.scheduleMessage(channel, request)`                                                | `channel.scheduleMessage(request)`                                                                                               |
| `client.scheduledMessages.updateScheduledMessage(id, request)`                                              | `channel.updateScheduledMessage(id, request)`                                                                                    |
| `client.scheduledMessages.deleteScheduledMessage(id)`                                                       | `channel.deleteScheduledMessage(id)`                                                                                             |
| `client.scheduledMessages.sendScheduledMessageNow(id)`                                                      | `channel.sendScheduledMessageNow(id)`                                                                                            |
| `client.scheduledMessages.getFromState(id)`                                                                 | `client.scheduledMessageStore.get(id)`; it holds only listed messages that are not sent or canceled                              |
| `client.scheduledMessages.upsertToState` / `removeFromState` / `hydrateChannelState` / `version` / `reload` | removed                                                                                                                          |
| `new ScheduledMessagePaginator({ cid, resolveLatest })`                                                     | `new ScheduledMessagePaginator({ filter: { cid } })`                                                                             |
| `paginator.setCompleteList(items)`                                                                          | `paginator.hydrate(items)`                                                                                                       |
| client config `client.scheduledMessages.paginator`                                                          | `channel.scheduledMessagesPaginator` for the channels' lists; pass `paginatorOptions` to the lists you register                  |
| default handler for `connection.recovered`                                                                  | removed; `ConnectionRecoveryManager` calls `client.scheduledMessagePaginators.recover()`                                         |

## Not in scope

- Rejecting stale copies of scheduled messages (`updated_at` ordering and records of sent and
  canceled messages): PR #2035.
- The React SDK. PR 3383 already calls removed methods (`getForChannel`, `getCountForChannel`, …)
  from an earlier iteration of this branch, and has to move to the API above.
- Docs snippets: `test/docs-snippets/pages/chat/04-messages/12-scheduled_messages.test.ts` only calls
  the generated client methods, which did not change, and it still typechecks (`yarn types-docs`).

## Testing

- `BasePaginator`: an empty complete page, and items ingested into it and into a list emptied by
  removals, with and without the opt-in.
- Channel: filled from `query()`/`watch()` and `queryChannels`, kept when the field is absent,
  reloaded when absent and loaded, an event that lands mid-query is kept (also during the list's
  first query), an event before any page loaded is held without marking the list loaded, a canceled
  or deleted failed message scheduled again under the same id is listed again, a channel created from
  its members follows its new cid, probe queries do not ask, a response after disposal is ignored,
  events and actions update the list, disposal releases it.
- `ThreadPaginator`: an empty reload reports nothing more to load.
- Manager: registry semantics as `ChannelManager`'s, events for channels that are not loaded, only
  registered lists are touched, recovery reloads loaded lists, logout empties but keeps them.
