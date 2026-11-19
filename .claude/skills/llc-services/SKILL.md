---
name: llc-services
description: Map of the stream-chat-js (LLC) service infrastructure — which class owns which data and lifecycle, its public contract, where a new feature plugs in, and what must not be rebuilt next to it. Covers the ownership map (which node holds which service) and each parent's lifecycle routes, StreamChat and its stores and managers, Channel and Thread, BasePaginator and its subclasses, ChannelManager and EventHandlerPipeline, EntityStore, client.config, WS event routing, ConnectionRecoveryManager, offline support, optimistic message operations, the message composer and its middleware, the generated API and request handlers. Use when deciding where logic belongs in src/, before adding a class, manager, store, map, event listener or reload path, and when reviewing a change for code that duplicates an existing service.
---

# LLC services: who owns what

A lookup of the services the LLC already has. For each: the files, what it owns, its public contract, where new code plugs in, and what not to rebuild. To design a feature on these services, and to decide whether to extend a service or add one, use the `llc-feature-design` skill (`.claude/skills/llc-feature-design/SKILL.md`).

`CLAUDE.md` already documents several of these in depth (module map, `ChannelManager`, the connection classes, the generated API contract, `StateStore`, `WithSubscriptions`, middleware, concurrency helpers). This skill links to those sections instead of repeating them.

Paths are under `src/`. This describes `master`. On another branch, read master with `git show origin/master:<path>` (`src/<path>`, and the repo files this skill points to: `CLAUDE.md`, `AGENTS.md`, `docs/instance-configuration.md`), and check the branch for anything it adds.

## The map

Who holds what, as the code builds it on master. Each node is a property on its parent; the line says what it is for. A new feature finds its place here first. Most features are a new node under an existing one (a paginator under `Channel`), or a new option or field on an existing node (a rule on a store). They are rarely a new branch under `StreamChat`.

- **`StreamChat`** (`client`): the connected user's session and everything below.
  - `config`: integrator configuration for the objects the SDK builds (`InstanceConfigurationRegistry`).
  - `channelServerConfigs` (internal): the server's config per `cid`, including its `config_overrides`. Read it as `channel.serverConfig`; gate on `channel.config`.
  - `state` (`ClientState`): the users the client knows and which channels reference them.
  - Connection:
    - `wsConnection`: the socket and its health (`state`).
    - `networkConnection`: the device's network status.
    - `connectionIdManager`: the connection id that watch and presence requests wait for.
    - `connectionRecovery` (`ConnectionRecoveryManager`): the refresh pass after a reconnect.
  - `messageStore`: one canonical copy of each loaded message, shared by every message paginator.
  - `channelManager` (`ChannelManager`): the channel registry and the channel lists.
    - `channelStore`: one `Channel` per `cid`.
      - **`Channel`**: one conversation.
        - `state` (`ChannelState`): members, read state, watchers, typing.
        - `config` (`ChannelConfig`): feature gates and `requestHandlers`, ANDed with the server config.
        - `messagePaginator`: the message list (items in `client.messageStore`).
        - `pinnedMessagesPaginator`: the pinned messages (items in `client.messageStore`).
        - `messageOperations`: optimistic send, retry, update, delete and reactions.
        - `messageComposer`: the composer, with its sub-composers and middleware executors.
        - `messageReceiptsTracker`: delivered and read receipts.
        - `cooldownTimer`: slow mode.
    - `paginators`: the `ChannelPaginator`s the integrator registers (items in `channelStore`).
  - `threads` (`ThreadManager`): the thread registry and the thread list.
    - its private thread store: one `Thread` per parent message id.
      - **`Thread`**: the replies to one message. It belongs to a `Channel` (`thread.channel`) and goes when that channel is disposed.
        - `messagePaginator`: the replies (items in `client.messageStore`).
        - `messageComposer`, `messageOperations`, `config`: as on `Channel`, for replies.
    - `paginator` (`ThreadPaginator`): the thread list.
  - `polls` (`PollManager`): a cache of `Poll`s by id; each `Poll` has its state and its optimistic votes.
  - `reminders` (`ReminderManager`): `Reminder`s by message id, their timers, and `paginator` (`ReminderPaginator`).
  - `notifications` (`NotificationManager`): notices for the UI (errors, warnings).
  - `moderation` (`Moderation`): the moderation requests.
  - `messageDeliveryReporter`: sends delivered and read marks.
  - `uploadManager`: file uploads in progress.
  - `messageComposerCache`: composers for messages being edited.
  - `offlineDb` (injected, optional): the integrator's `AbstractOfflineDB`, with its `syncManager`.

Two facts the map shows:

- **Data sits in one place and is listed in many.** A message is stored once in `client.messageStore` and listed by any paginator that matches it. A new entity follows the same split: a store for the data, paginators for the lists.
- **Two roles a manager can have.** A registry of live objects (`channelManager.channelStore`, `threads`, `polls`, `reminders`), and the lists the integrator registers (`channelManager.paginators`). `channelManager` has both; `threads` and `reminders` also own one list of their own (`paginator`). Before adding a new manager, check whether one of these already holds the entity.

### Parent lifecycles

A piece lives as long as its parent and uses the parent's routes:

| Parent | Created in | Config from | Events reach it through | Refreshed after a reconnect by | Released in |
| --- | --- | --- | --- | --- | --- |
| `StreamChat` | the `StreamChat` constructor | the `client` key, `StreamChat`'s `initializeManagerConfig` | `StreamChat.dispatchEvent` (store writes needed for every event), or the piece's own `client.on()` in `registerSubscriptions()` | `ConnectionRecoveryManager` (a call in its pass, or `connection.recovered`) | `StreamChat.disconnectUser()` |
| a manager (`channelManager`, `threads`, …) | the manager's constructor | its slice under the `client` key (`threads`, `reminders`, …); `channelManager` and `polls` have none | the manager's `client.on()` handling (`ChannelManager`'s pipelines; `ThreadManager` calls the thread's `handle*` methods) | `channelManager.recover()`, called in `ConnectionRecoveryManager`'s pass; `threads` reloads its list on `connection.recovered` | its reset in `StreamChat.disconnectUser()`: `channelManager` and `threads` have one; `polls` and `reminders` are not reset. A new manager adds its reset there (`StreamChat`, "Logout") |
| `Channel` | the `Channel` constructor | the `channel` key, `Channel.initializeConfig()` | `Channel._handleChannelEvent` | `Channel.reload()`, for active channels | `Channel.disconnect()` |
| `Thread` | the `Thread` constructor | the `thread` key | `ThreadManager`'s routing to the thread | `Thread.reload()` for active threads; inactive ones are marked stale | with its channel (`ThreadManager`'s disposal listener) |
| `MessageComposer` | the composer's constructor | the `messageComposer` key | the composer's `registerSubscriptions()` | — | with the composer's own parent |

## Reuse table

| You need | Reuse | Don't build |
| --- | --- | --- |
| State that belongs to one channel or thread | a `public readonly` field of `Channel` / `Thread` (see "Parent lifecycles") | a client-level `Map<cid, …>` |
| A channel's reaction to a WS event | a case in `Channel._handleChannelEvent` | a `client.on()` listener that filters by `cid` |
| Reactive state, subscriptions with teardown, keyed async serialization | `StateStore`, `extends WithSubscriptions`, `withoutConcurrency()` / `withCancellation()` (`CLAUDE.md`) | emitters or local store classes, unsubscribe arrays, hand-rolled promise chains |
| A list loaded page by page | `extends BasePaginator` (`pagination/paginators/BasePaginator.ts`) | arrays with manual cursors, sorting and dedupe |
| One copy of an entity shared by several lists | `EntityStore` + `StoreBackedItemIndex` as the paginators' item index (`entityStore/`) | a `Map<id, T>` next to the lists, "latest copy" helpers, version counters |
| Local matching of items against a filter | `BasePaginator.buildMatchFilters()` + filter resolvers (`pagination/filterCompiler.ts`) | hand-written `if` chains per field |
| A comparator from a server `sort` | `makeComparator()` (`pagination/sortCompiler.ts`) | ad-hoc comparators duplicating the sort spec |
| Filters built from context | `FilterBuilder` (`pagination/FilterBuilder.ts`) | string-concatenated filter objects |
| Several registered lists that follow WS events | `ChannelManager`'s shape: a paginator registry + `EventHandlerPipeline` per event type | a manager that creates its own fixed lists |
| Per-object configuration | `ConfigController` held as a field, forwarded as `configState` / `config` / `updateConfig` / `initializeConfig` (`configuration/ConfigController.ts`) | option bags merged by hand |
| Integrator config for SDK-built objects | `client.config` (`InstanceConfigurationRegistry`) + `applyInstanceConfiguration()` | new constructor options on `StreamChat` |
| Server flags that only narrow client config | `mergeServerRestrictions()` (`configuration/utils/serverAuthority.ts`) | per-feature `serverEnabled && clientEnabled` logic |
| Refresh after a reconnect | `ConnectionRecoveryManager` (`client.connectionRecovery`), or the `connection.recovered` event it dispatches | a socket-health subscription of your own |
| Queue a request while offline | an entry in `QUEUEABLE_OPERATIONS` + `queueOrRun()` (`offline-support/queueableOperations.ts`) | a feature-local retry queue |
| Optimistic send / edit / delete / react | `channel.messageOperations` / `thread.messageOperations` (`messageOperations/`) | a second optimistic path for messages |
| Change how a message is composed | a middleware in the matching executor (`messageComposer/middleware/`) | a forked executor or composer subclass |
| Call an endpoint | the generated method on `StreamChat` (`ChatApi`) or `Channel` (`ChannelApi`) | `axiosInstance` calls or edits in `src/gen` |
| Tell a final error from a transient one | `APIErrorCodes` + `isErrorRetryable()` / `isEphemeral()` (`errors.ts`); a feature's own code or reason as a named predicate next to them or in the feature's folder. A code missing from `APIErrorCodes` counts as final; `isEphemeral()` also counts an error with no response (offline, network) as transient, except a request the caller cancelled | status-code checks and retry loops in each caller |
| Tell the user something failed | a failed message through `messageOperations` (`status: 'failed'` with `error`), `client.notifications.addError()` for composer, attachment-upload and jump-to-message failures, a paginator's `state.lastQueryError`. `MessageOperationStatePolicy` decides the failed state: a failed send or retry is marked `failed`, even when it is queued (an "already exists" error counts as success); a failed edit keeps the user's text and is marked `failed` unless the offline queue holds it (then it stays pending); a failed delete is reverted unless the offline queue holds it. Without an offline DB nothing is queued, so a network error ends the same way as a rejection. A paginator's failed query sets `state.lastQueryError` (not when offline support is on and items are loaded) and rejects only with `throwErrors`. An error from any other call (a plain `Channel` or `StreamChat` method) is thrown to the caller; the user sees it only if the integrator's code shows it | a feature-local error store or toast list |

## `StreamChat` (`client.ts`)

`StreamChat extends ChatApi`. Use `StreamChat.getInstance()` for the shared instance (later calls ignore their arguments); the public constructor creates another client with its own socket. It constructs and holds the client-wide services; feature code reaches them through the client, never through module-level singletons.

Construction order matters: `messageStore` is created before any `Channel` or `Thread`, whose paginators link into it, and `channelManager` before the managers that claim channels in its store. A new client-level store goes before the channels and lists that read it.

**Client-level config:** `StreamChat` reads the `client` key of `client.config` and passes each manager its slice (`initializeManagerConfig`: `connectionRecovery`, `threads`, `reminders`, …). A new client-owned manager adds its slice to `ClientDeclarativeConfig` (`configuration/types.ts`) and `CLIENT_FIELDS` (`configuration/shape.ts`), and one line there.

**Event routing — `StreamChat.dispatchEvent(event)`** is the single entry for WS frames and local events:

1. `StreamChat._handleClientEvent()` updates client-level state (users, mutes, deleted channels, …);
2. if the event has a `cid` and the channel is loaded (`channelManager.get(cid)`) and not `pendingDisposal`, `Channel._handleChannelEvent()`;
3. `client.on()` listeners — this is how every manager hears events (`ChannelManager`, `ThreadManager`, `PollManager`, `ReminderManager`, `MessageComposer`);
4. `channel.on()` listeners, post-listener callbacks, then `offlineDb.handleEvent()`.

A local event dispatched with `client.dispatchEvent({ type, … })` takes the same path. Local event types are the `LocalEvent` overlay in `types.ts` (see `CLAUDE.md`, "Event types").

**Logout — `StreamChat.disconnectUser()`:** resets the channel lists' items but keeps them registered (`channelManager.resetPaginatorStates()`), clears the channel store (which disconnects every channel), resets `threads`, the client state, `uploadManager` and the composer cache. Data owned by a feature is reset on this path: a new store is cleared here, and a new manager adds its reset here.

## `Channel` (`channel.ts`) and `Thread` (`thread.ts`)

Two of the nodes that hold services for one instance each (one channel, one thread). Any node in the map can hold a feature's piece. These two have the most machinery for it: per-instance paginators, config, event handling and reload.

`Channel extends ChannelApi`. One instance per `cid`, created only through `client.channel()` / `channelManager.ensure()`.

**Lifecycle:**
- Sub-objects are created in the constructor. The channel's own slice, its paginators and `messageOperations` are configured by `Channel.initializeConfig()`, the single re-derivation path; the composer has its own `messageComposer` key.
- `Channel.disconnect()` releases them: unsubscribes config, unregisters the receipts tracker and cooldown timer, disposes both paginators, then sets `pendingDisposal`.
- `Channel.activate()` (ref-counted) marks the channel as being read; active channels are what connection recovery reloads.

**Filling paginators from the channel's own query:** `Channel.query()` / `watch()` / `create()` run the private `Channel.runChannelQuery()`: `Channel.requestChannelState()`, the message page placement, then `Channel.applyChannelStateFromResponse()` (polls, reminders, composer, watch state), which calls `Channel._initializeState(state)` for the channel's own state and paginators. `_initializeState` applies what needs no snapshot, e.g. the pinned list's first page — `pinnedMessagesPaginator.placeExternalQueryPage(state.pinned_messages, …)`. Anything that must compare against what was held before the request (a snapshot) is taken and applied in `runChannelQuery()`, e.g. `messagePaginator.prepareExternalQuery()`. For a channel-list page, `StreamChat.queryChannelsAndHydrate()` takes the per-`cid` snapshot before its `queryChannels` request; `hydrateChannels()` then applies it and calls `_initializeState` for every channel. Data that arrives with the channel response is applied here, not fetched again.

**Events:** `Channel._handleChannelEvent(event)` is a plain `switch` over event types. Each case updates `channel.state` and calls the paginators' own operations (`ingestItem`, `removeItem`, `truncate`, `clearStateAndCache`, `reflectQuotedMessageUpdate`). A feature whose data belongs to the channel adds a case here. There is no pipeline on the channel.

**Config:** `ChannelConfig` (in `channel.ts`), held by a `ConfigController` read as `channel.config` / `channel.configState`, holds `requestHandlers`, feature gates (`typingEvents`, `readEvents`, `replies`, `userMessageReminders`, `deliveryEvents`) and the server-owned `availableCommands`. Each gate's `enabled` is ANDed with the channel type's server flag through `mergeServerRestrictions` in the controller's `applyAuthority`, re-derived when `client.channelServerConfigsStore` changes for the cid. `Channel` has no `updateConfig`. `channel.serverConfig` changes only when a channel query or `queryChannels` returns the channel's config, or when the offline DB's stored channels are hydrated (`client._addChannelConfig`). `notification.message_new` also calls `client._addChannelConfig`, but its channel carries no config, so nothing changes. `channel.updated` doesn't refresh it, except when it changes `frozen`: the channel is then re-queried, and that query does. A change to the channel type's config sends no realtime event. A change to one channel's `config_overrides` (server-side only) sends `channel.updated`, whose `channel.config` carries the merged config, but the handler writes it only to `channel.data`, so `channel.serverConfig` stays. Either way an open channel's gates keep its last query's copy until the next query. Integrators read the fields in `ChannelConfigWithInfo` (`src/gen/models/index.ts`). A few features are switched outside the channel config, in the app settings or on the channel itself (`auto_translation_enabled` on `AppResponseFields` and `ChannelResponse`).

**Actions:** actions on a channel are `Channel` methods. Generated `ChannelApi` methods fill in `{ id, type }`; overrides use `override async x(...args: Parameters<ChannelApi['x']>)` (see `CLAUDE.md`, "The generated API layer"). An endpoint the spec keys by an item's own id lives on `ChatApi`; its action on the channel is a plain `Channel` method that calls `this.getClient().x(...)`.

## Pagination (`pagination/`)

### `BasePaginator<T, Q>` (`pagination/paginators/BasePaginator.ts`)

Owns a list's loaded items as **intervals** (the terms are defined in the class doc comment; `AGENTS.md` forbids "window"), its cursor, loading and error state, and its config.

**State and writes:** `state: StateStore<PaginatorState<T>>`; `items` is the active interval and stays `undefined` until something loads. A query runs `fetchQueryResponse` → `extractQueryPage` → `placeQueryPage` (which runs `filterQueryResults` first) → `applyQueryResponseRest`; `executeQuery({ keepPreviousItems })` keeps the list during a reload. `reload()` is a reset first-page query (it blanks the list); a subclass that must keep items overrides it or uses `keepPreviousItems`. Without a query: `ingestItem` (placed by filter and order), `removeItem`, `setItems`, `ingestPage`, `batch(fn, { coalesce: true })` (one flush and one publish for many writes); `dispose()` unlinks from a shared store.

**Hooks a subclass implements:**

| Hook | Contract |
| --- | --- |
| `fetchQueryResponse(params)` | abstract: send the request for `params.queryShape` (call the generated method) |
| `extractQueryPage(response)` | abstract: `{ items, headward?, tailward? }`; `null` means that end is reached; `undefined` means no next page, or "not reported" for a paginator with `deriveCursor` |
| `getNextQueryShape({ direction })` | the request for the next page (throws unless overridden) |
| `filterQueryResults(items)` | per-item filter on query results before placing |
| `sortComparator` (default: no order change), `itemOrderComparator` | in-memory order for live inserts and page placement; set it from the query's `sort` with `makeComparator()` |
| `buildMatchFilters()` (default `null`: every item matches), `setFilterResolvers()` / `addFilterResolvers()` | the local filter `matchesFilter()` applies to ingested items, the same filter as the query; resolvers say how a filter field reads an item |
| `applyQueryResponseRest(response)` | applies the non-page parts of a response |
| `getBehaviourOverrides()` | comparator / `deriveCursor` / `doRequest` closed over `this`, memoized |
| `preloadFirstPageFromOfflineDb`, `populateOfflineDbAfterQuery` | offline DB read/write around queries |
| `onEntitiesChanged` (required), `onEntityRemoved`, `onIdChanged`, `flushState` | the `EntityStoreSubscriber` callbacks, for a subclass whose item index shares a store ("Item index"); `BasePaginator` does not implement them |

**Item index:** without options a paginator gets a private `StoreBackedItemIndex` (`entityStore/StoreBackedItemIndex.ts`). Share a store with `createItemIndex: (owner) => new StoreBackedItemIndex({ store, owner, … })` (or the `itemIndex` option). Pass the paginator as `owner` when it must follow other holders' writes; the index then forwards the store's `EntityStoreSubscriber` callbacks to it, and the subclass implements them, as `MessageIntervalPaginator` and `ChannelPaginator` do. `ThreadPaginator` shares its store without an owner. The index's `get(id)` returns only this list's members. The base `reconcileChangedIds()` swaps changed items in place; it does not re-check filter or order.

**Config:** `PaginatorOptions`; its value-only subset `DeclarativePaginatorConfig` is settable through `client.config`, and `initializeConfig(slice)` re-derives it.

### Existing paginators (`pagination/paginators/`)

| Class | Lists | Shared store | Owner |
| --- | --- | --- | --- |
| `ChannelPaginator` | a channel list (`queryChannels`) | `client.channelManager.channelStore` | the app; registered with `client.channelManager` |
| `MessageIntervalPaginator` | base for message lists | `client.messageStore` | — |
| `MessagePaginator` | a channel's messages, a thread's replies | `client.messageStore` | `Channel`, `Thread` |
| `PinnedMessagePaginator` | a channel's pinned messages | `client.messageStore` | `Channel` |
| `ThreadPaginator` | the thread list (server order) | `ThreadManager`'s private thread store | `ThreadManager` |
| `ReminderPaginator` | reminders; `filters` / `sort` setters reset it | private | `ReminderManager` |
| `UserGroupPaginator` | user groups | private | exported only |

Useful patterns in them: `ChannelPaginator` separates server filters (`buildQueryFilters`) from local matching (`buildMatchFilters`) and refreshes in place on reconnect (`recoverLoadedItems`); `PinnedMessagePaginator` shows `getBehaviourOverrides()`; `ThreadPaginator.reload()` re-queries the first page and swaps it in without blanking the list; `ReminderPaginator` resets when its filter changes.

### Supporting modules

`ItemIndex.ts` (`ItemIndexApi`), `cursorDerivation/` (cursor and `hasMore` flags derived from loaded intervals, plugged in through `deriveCursor`).

## Paginator managers

### `ChannelManager` (`ChannelManager.ts`)

The only manager of several registered lists, and the shape a new one copies: there is no base class. Its registry, pipelines, ownership resolver and logout semantics are in `CLAUDE.md` ("Module map", `ChannelManager.ts`). Beyond that: `registerSubscriptions()` adds one `client.on()` listener that runs the pipeline for the event's type; `ingestChannel(channel)` ingests into every list that matches and owns the channel and removes it from the rest; `recover()` re-queries each initialized list in place, keeping its items (`ChannelPaginator.recoverLoadedItems()`); `reload()` runs every registered list's `reload()`, which in `BasePaginator` is a reset first-page query that blanks the list; it also owns the channel store (`channelStore`, `get`, `ensure`, `releaseUnusedChannels`). It creates no lists; the integrator registers them.

### `EventHandlerPipeline<CTX>` (`EventHandlerPipeline.ts`)

A generic, ordered handler chain per event type. Handlers are `({ event, ctx }) => void | { action: 'stop' }` (or a promise), labelled by `id`, added with `insert({ handle, id?, index?, replace?, revertOnUnsubscribe? })`, which returns the unsubscribe. `run()` is serial per pipeline; a throwing handler is logged and the chain goes on. Only `ChannelManager` uses it on master.

### Other managers

- `ThreadManager` (`thread_manager.ts`, `client.threads`): a registry of live `Thread`s in a private `EntityStore`, the thread list (`paginator: ThreadPaginator`), `get(id)`, `ensure({ channel, parentMessage })`. Routes thread events by id through `client.on()`. Reloads its list on `connection.recovered`. See `CLAUDE.md` (`thread_manager.ts`).
- `ReminderManager` (`reminders/ReminderManager.ts`, `client.reminders`): reminders by message id, a `ReminderPaginator`, timers, `hydrateState(messages)` called from channel hydration.
- `PollManager` (`poll_manager.ts`, `client.polls`): a poll cache by id, `hydratePollCache(messages)`, poll events through `client.on()`.

All extend `WithSubscriptions` and subscribe through `client.on()` in `registerSubscriptions()`. The client does not call `registerSubscriptions()` on `channelManager`, `threads`, `polls` or `reminders`; the UI SDK or app does.

## Entity stores (`entityStore/`)

### `EntityStore<T>` (`entityStore/EntityStore.ts`)

One canonical `T` per id, shared by holders linked per id. Links are the reference count: an entry is dropped, and passed to `onRelease`, when its last holder unlinks, unless `releaseOnLastUnlink: false`; then it leaves only through `remove` / `clear`. `upsert(entity, writer?)` always replaces the copy and notifies that id's holders except the writer; `addClaim({ heldBy, name })` holds without notifications; `transaction(fn)` coalesces notifications into one `onEntitiesChanged({ changedIds })` per holder; `flushSubscribers(id)` emits throttled state at once (after an optimistic write). Paginators hold entries through `StoreBackedItemIndex` (`BasePaginator`, "Item index").

### Stores on master

| Store | Owner | Holders |
| --- | --- | --- |
| `client.messageStore` (`EntityStore<LocalMessage>`) | `StreamChat` | every message paginator of every channel and thread; written by `messageOperations`, reaction helpers, offline replay |
| `client.channelManager.channelStore` (`@internal`) | `ChannelManager` | `ChannelPaginator`s (links); the composer cache, threads and search sources (claims) |
| `ThreadManager`'s thread store (private) | `ThreadManager` | `ThreadPaginator` and opened threads |
| private per-paginator stores | `ReminderPaginator`, `UserGroupPaginator` | the paginator itself |

A store whose entities appear in several lists lives on `StreamChat` (or on the manager that owns the entity, like the channel store).

## Configuration (`configuration/`)

The full model is `docs/instance-configuration.md`. In short:

- **`client.config` (`InstanceConfigurationRegistry`)**: paths are nested objects (`client.config.set({ channel: { messagePaginator: { pageSize: 50 } } })`); there is no path-string API and no `updateConfig` on the registry. Top-level keys: `channel`, `client`, `liveLocationManager`, `messageComposer`, `messageOperations`, `messagePaginator`, `searchController`, `thread`.
- **`ConfigController<TConfig>`** (`configuration/ConfigController.ts`): per-instance resolution in a fixed layer order (`docs/instance-configuration.md`, "How a value is resolved"), ending in `applyAuthority` (server restrictions). Instances forward `configState`, `config`, `updateConfig`, `initializeConfig`.
- **`applyInstanceConfiguration()`** (`configuration/utils/applyInstanceConfiguration.ts`): subscribes an instance with its own top-level key to `client.config`. Nested slices are applied by the parent (`Channel.initializeConfig`, `StreamChat`'s `initializeManagerConfig`).
- **Where a key goes:** `docs/instance-configuration.md`, "Why some things get their own key", and the `InstanceConfigTree` doc in `configuration/types.ts`. A per-parent object is nested under its parent (`channel.pinnedMessagesPaginator`).
- **Adding a key:** the slice type in `configuration/types.ts`; its description in `configuration/shape.ts` (typed so a missing description fails the build); `configuration/keys.ts` for a new top-level key (`INSTANCE_CONFIG_TREE_KEY_PRESENCE`) or a construction-only path (`CONSTRUCTION_ONLY_CONFIG_PATHS`); wiring in the parent's `initializeConfig`.
- **Server authority:** `mergeServerRestrictions(requested, restrictions, upperBounds?)` (`configuration/utils/serverAuthority.ts`): booleans ANDed, upper bounds take the minimum. Used in `applyAuthority` by `Channel` and `MessageComposer`.

## Connection recovery (`connection/ConnectionRecoveryManager.ts`)

`client.connectionRecovery`. Runs once per reconnect: when the socket is healthy again after a drop, or, with an initialized offline DB, when the DB's sync finishes (after queued tasks replay).

The pass (`handleReconnect`) starts two parts in parallel: `client.channelManager.recover()` (each loaded `ChannelPaginator` re-queries its loaded pages in place, through the private `recoverChannelLists()`), and `recoverActiveChannels()`, which marks inactive threads stale and then runs `Channel.reload()` for every active channel and `Thread.reload()` for every active thread. When the second part ends it dispatches `connection.recovered`, unless the socket dropped meanwhile; it does not wait for the channel lists. Config `{ enabled }`: with `false` it only dispatches the event (when the socket is healthy). `ConnectionRecoveryManager.recover()` runs a pass on demand.

The targets are hard-coded: there is no registration API. Data refreshes on reconnect in one of three ways:
- it belongs to an active channel or thread, and their reload's query carries it;
- `ConnectionRecoveryManager` calls the owner's own `recover()` (as `ChannelManager.recover()`) from a private `recover…Lists()` beside `recoverChannelLists()`, invoked from both `ConnectionRecoveryManager.handleReconnect()` and `ConnectionRecoveryManager.recover()`;
- the owner listens to `connection.recovered`, as `ThreadManager` does.

`ReminderManager`'s list and `PollManager` have no recovery path of their own. Polls and reminders are re-hydrated only as a side effect of other reloads: messages of reloaded active channels (`Channel.applyChannelStateFromResponse()`), channels re-queried by recovered channel lists (`StreamChat.hydrateChannels()`), and thread parent messages when `ThreadManager` reloads (polls only). The socket status itself is `client.wsConnection.state` (see `CLAUDE.md`, "`wsConnection/`").

## Offline support (`offline-support/`)

- **`AbstractOfflineDB`** (`offline_support_api.ts`): an abstract storage contract injected with `client.setOfflineDBApi()`; this package has no implementation. It mirrors events into storage (`handleEvent`), keeps pending tasks (`queueTask`, `executePendingTasks`), and exposes `executeQuerySafely()`.
- **`OfflineDBSyncManager`** (`offline_sync_manager.ts`): on reconnect replays pending tasks, then calls `client.sync()` for the channels in the DB and writes the returned events to the DB through `handleEvent`, not to in-memory state. With no last-sync time yet, it only records one. It resets the DB when the last sync is more than 30 days old, or when the sync fails (the request or writing its events), except on a timeout (`ECONNABORTED` or code 23). When the server returns more than `syncMaxEventCount` events, it writes none of them and still advances the last-sync time. Listeners subscribe with `onSyncStatusChange(listener)`; `ConnectionRecoveryManager` uses it to start its pass after the sync (Connection recovery).
- **Queueable operations** (`queueableOperations.ts`, `types.ts`): the message, reaction and draft operations. A new one is one `QueueableOperationSignatures` entry (the method that sends the request, without queueing) and one `QUEUEABLE_OPERATIONS` entry; a public method calls `queueOrRun({ channel, client, task })`; `isQueuedForReplay()` reads the queue.
- Paginators read from and write to the DB through `preloadFirstPageFromOfflineDb` / `populateOfflineDbAfterQuery` (`ChannelPaginator` implements them).

## Optimistic updates (`messageOperations/`, `poll_optimistic_votes.ts`)

- **`MessageOperations`** (`channel.messageOperations`, `thread.messageOperations`, built by `createMessageOperations()`): `send`, `retry`, `update`, `delete`, `addReaction`, `deleteReaction`. `send` / `retry` / `update` / `delete` run: optimistic write → request (the integrator's request handler if set, else the queueable default) → the policy's success or failure step. Reactions apply locally (`applyReactionLocally`), call the queueable default with no handler, and roll back unless queued. Config: `messageOperations` (shared key, overridable per channel / thread).
- **`MessageOperationStatePolicy`**: the local-state rules for each operation kind (send, retry, update, delete), as three steps: `optimistic`, `success`, `failure`. The object it wrote is kept as a guard: a revert applies only if nothing newer was written since.
- **`FailedSendCache`**: payloads of failed sends for `retry`.
- **Reactions:** `applyReactionLocally()` (optimistic) and `reflectReactionEvent()` (WS) write `client.messageStore`.
- **Polls:** `OptimisticPollVotes`, held by each `Poll`.

The pattern: write the optimistic value to the canonical store, send (queueable when offline makes sense), reconcile with the server copy, on failure revert or mark failed (Reuse table, "Tell the user something failed"). WS events stay the source of truth.

## Message composer (`messageComposer/`)

`MessageComposer` (`channel.messageComposer`, `thread.messageComposer`, edit composers in `client.messageComposerCache`) with sub-composers `textComposer`, `attachmentManager`, `linkPreviewsManager`, `pollComposer`, `locationComposer`, `customDataManager`. Config key `messageComposer`, with server authority applied (`uploads`, `url_enrichment`, `shared_locations`, `polls`, `max_message_length`). `compose()` runs the composition executor; `send()` submits through `messageOperations`.

Executors (`MiddlewareExecutor`, see `CLAUDE.md`, "Middleware pipelines") live under `messageComposer/middleware/<sub-composer>/`: composition and draft composition (`compose`) on the composer, text (`onChange`, `onSuggestionItemSelect`), poll (composition; `handleFieldChange` / `handleFieldBlur`), attachment pre- and post-upload (`prepare`, `postProcess`).

An SDK feature adds its middleware to the executor's default list in its constructor (`this.use([...])`); an integrator inserts one from a `messageComposer` setup function with `MiddlewareExecutor.insert({ middleware, position: { after | before } })` and returns a teardown that removes it.

## Generated API and request handlers

- **Generated** (`gen/`): `ChatApi` (client endpoints), `ChannelApi` (channel endpoints with `{ id, type }` filled in), models and the `WSEvent` union. `StreamChat extends ChatApi`, `Channel extends ChannelApi`. Never edit `gen/` (`AGENTS.md`); the call contract and override rules are in `CLAUDE.md`, "The generated API layer".
- **Request handlers:** integrator overrides of a request. The message-operation handlers are `(params, defaultRequest) => response`; `markReadRequest` replaces the request outright (`({ channel | thread, options }) => response`). On master they exist in `ChannelConfig.requestHandlers` (`sendMessageRequest`, `retrySendMessageRequest`, `updateMessageRequest`, `deleteMessageRequest`, `markReadRequest`) and `ThreadConfig.requestHandlers` (`markReadRequest`); there are none on the client. Thread replies use the channel's handlers. A new overridable channel request adds a handler to `ChannelConfig.requestHandlers` and resolves it from `channel.configState`.

## Shared primitives

`StateStore` semantics, `WithSubscriptions` (`registerSubscriptions` idempotent, `unregisterSubscriptions` returning `super`'s result; ref-counting is opt-in through `incrementRefCount()`), and `withoutConcurrency` / `withCancellation` are in `CLAUDE.md`, "State and subscription patterns" and "Concurrency primitives".
