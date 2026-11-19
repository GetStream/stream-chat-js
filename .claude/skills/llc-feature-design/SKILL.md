---
name: llc-feature-design
description: Design a new stream-chat-js (LLC) feature on the services the SDK already has (the parent node that holds each piece, generated API, paginators and paginator managers, entity stores, WS event routing, connection recovery, offline queue, optimistic updates, client.config, composer middleware), before writing code. Walks through the design questions in order and produces a design note that names, for every unit, the existing service it extends. Use when adding a feature, entity, list, endpoint wrapper, manager, store or paginator to src/, when planning or reviewing such a design or PR, or when asked where some new logic should live.
---

# Design an LLC feature on the existing services

New features in this SDK are built from services that already exist. The common failure is a feature that brings its own manager, store, consistency layer, event routing and recovery, next to the ones the SDK already has. That code repeats existing logic, is hard to read, and leaves two services that do the same job.

This skill walks through the design questions in a fixed order. Each answer names the existing service the feature uses or extends. The output is a short design note (template at the end) written **before** any code.

When the input is a spec from another team, run `llc-spec-intake` (`.claude/skills/llc-spec-intake/SKILL.md`) first. Its items and "Already works" answer the steps; its Offline table answers steps 11–12; each Errors row goes to the note's "Errors" line; its decisions are settled in their step or carried, with their default, to "Open decisions", as are its questions.

What each service owns, its public contract and its file paths are in the `llc-services` skill: `.claude/skills/llc-services/SKILL.md`. Read it first. Repo-wide conventions are in `CLAUDE.md` and `AGENTS.md`; this skill does not repeat them.

All paths are relative to the repo root. Read `master` (code, `CLAUDE.md`, `AGENTS.md`, `docs/`) when this checkout is on another branch (`git show origin/master:<path>`). Scheduled-message names (`channel.scheduleMessage()`, `shouldReplaceScheduledMessage`, `getScheduledMessageFromEvent`) come from the worked example and are not on master.

## The rule

- **A new concept inside an existing service is fine.** Example: an opt-in `EntityStore` option that decides whether an incoming copy replaces the stored one. A feature's store passes it; stores that don't pass it behave as before.
- **A new service that does what an existing one does is not.** Example: a feature manager that holds its own per-channel paginator map, its own "latest copy" logic, its own version counters and its own recovery, next to `Channel`, `EntityStore`, `BasePaginator` and `ConnectionRecoveryManager`.

When an existing service almost fits, change the service (an option, a protected hook, an opt-in getter), not the feature around it. When the change is generic, it goes into the base class with a generic contract, and the feature opts in.

## Code shape

- **One responsibility per unit.** A class owns one kind of data or one lifecycle. A function does one step. If a unit's description needs "and", split it.
- **Declarative rules.** Express a decision as a named predicate or pure function (`shouldReplaceScheduledMessage`), and hand it to the service that applies it (a store option, a paginator filter, a pipeline handler). Don't spread the same `if` over every caller.
- **No parallel bookkeeping.** Version counters, "received since" maps, "hydrated" sets and hand-kept per-parent maps usually re-implement something a store, a paginator or the parent's lifecycle already gives you. If you need one, first check whether the service is missing a concept, and add it there.
- **Data lives with its owner.** A list that belongs to a channel is a field of `Channel`, created in its constructor and disposed in `Channel.disconnect()`. It is not an entry in a client-level map keyed by `cid`.
- **Actions live on the entity they act on.** `channel.scheduleMessage()`, not `client.scheduledMessages.scheduleMessage(channel, …)`.
- **Docs on generic code state the generic contract.** A base class or shared helper never names one subclass's use.

## The walkthrough

Answer the questions in this order. Later answers follow from earlier ones. For each, the note records: the answer, the existing service it uses (with path), and what is new inside that service, if anything.

### 1. Parent

The parent of a piece is the node in the ownership map (`llc-services`, "The map") that creates, configures, routes events to and releases it; the piece lives exactly as long as it does. Any node can be a parent (`Channel` holds its paginators, a `Poll` its optimistic votes). Each piece of the feature gets its own parent: the narrowest node whose key and lifetime match the data. Per channel → `Channel`; session-wide (a shared store, the lists the integrator registers) → `StreamChat`; per composition → `MessageComposer`. The piece uses its parent's existing routes for creation, config, events, refresh after a reconnect and release (`llc-services`, "Parent lifecycles"); steps 6, 9 and 12 pick from that row.

### 2. API

List the create / update / list / delete operations in `src/gen` (`chat/ChatApi.ts`, `chat/ChannelApi.ts`, `models/index.ts`), and any flag on an existing request that returns the data with another response (a channel-query flag). Use the generated methods; hand-written code only wraps them on the parent that holds the actions (step 1), as `llc-services`, `Channel`, "Actions" describes, including an endpoint keyed by the item's own id. A missing endpoint or field means `src/gen` lags the server: running `yarn generate-client` is part of the feature's work. A generated type that doesn't match the server's behaviour is fixed in the server's API spec or the generator and reported to the team that owns it, not patched in the SDK with a cast or an overlay type.

### 3. Listing

Every list the UI shows is a paginator. Several lists of the same entity are several paginators, each defined by its filter (a channel's list, a "failed only" list, an all-channels list).

- Which filters exist? Which come from the parent (e.g. `cid`)? Which does the integrator choose?
- Does the server filter by everything the UI needs? If not, the paginator holds the server's set and a read-only view narrows it: a `PaginatorView` (a predicate-filtered view of one paginator's loaded items; not on master, so add it as a generic class in `src/pagination/PaginatorView.ts`). Don't create a second paginator, or copy items into another object.

### 4. Configuration

List the parameters the feature needs, check whether `client.config` already has them, and place new ones by `docs/instance-configuration.md`, "Why some things get their own key"; add each one, with its default and description, as `llc-services`, "Configuration", "Adding a key" says.

- Per-parent nesting, server restrictions and request overrides follow `llc-services`: "Configuration" ("Where a key goes", "Server authority") and "Generated API and request handlers" (which parents have `requestHandlers`; another parent needs a new key).
- When the server signals the feature by a field's presence, derive the boolean once, in the parent's server-restrictions getter.
- An object that depends on its parent's setting reads it through a getter the parent exposes (`channel.xEnabled`), not by parsing the parent's config tree.

### 5. A paginator class for the entity

Subclass `BasePaginator` and implement its hooks (`llc-services`, "BasePaginator"); don't rebuild what it does. `buildMatchFilters` uses the same filter as the query, and `sortComparator` the same order.

- Over a shared store (step 8), pass the paginator as the index `owner` and implement `onEntitiesChanged` / `onEntityRemoved`. The base `reconcileChangedIds()` only swaps in place, so when a change can move an item (a sort field) or take it out (a filter field), re-place each changed item by the list's filter and order.
- When the store decides which copy wins (step 8), resolve each item against the store in `ingestItem` and `filterQueryResults` before matching and placing.

### 6. Each paginator on its parent

A paginator is a `public readonly` field of its parent (step 1), created in the parent's constructor, configured from the parent's config slice, and released with the parent: `channel.pinnedMessagesPaginator`, `client.threads.paginator`. When every instance of a parent kind needs its own list (every channel has its own), each instance holds one.

- Fill it from every response that already carries its data, instead of a separate request; if the data needs a request flag, every such request sends it. On `Channel` these are the channel's own query and the channel-list query; where each one applies data with and without a snapshot is in `llc-services`, `Channel`, "Filling paginators…".
- When the response says nothing (the field is absent), decide per call site: a query for one parent instance may make its already loaded list reload itself; a query that returns many leaves the lists as they are rather than sending one request per instance.
- Snapshot the ids the list held when the request went out, so a response does not drop items that events added meanwhile: an id missing from the response is removed only if it was held at request time. That removal rule needs a complete set (the response has no next page); a partial response replaces the list's first page instead, keeping what events added since the request. For message lists, `MessageIntervalPaginator.getHeadIntervalItemIdsAtRequest()` takes the snapshot and `MessageIntervalPaginator.placeExternalNewestPage()` (→ `reconcileNewestMessages()`) applies it. Another paginator snapshots its own held ids and applies the response with `removeItem` / `ingestItem` in one `batch`.
- Queries that don't need the data don't ask for it: the re-query on a `channel.updated` that changes `frozen` (`Channel._handleChannelEvent`), the message paginator's "older messages?" check (`MessageIntervalPaginator.hasMessagesOlderThan()`), and the message paginator's own page queries, which go through `Channel.requestChannelState()` rather than `Channel.runChannelQuery()`.

### 7. A paginator manager for the lists the integrator chooses

When the integrator decides which lists exist (a cross-channel list, a list per status), a manager on the node that spans them (usually `StreamChat`) holds the lists the integrator registers. Copy `ChannelManager`'s public shape (`llc-services`, "ChannelManager"): a registry with `setPaginators()` as the primitive, an `EventHandlerPipeline` per event type, `resetPaginatorStates()` on logout (the lists stay registered), `recover()` for reconnects (step 12; not `reload()`, see `llc-services`, "ChannelManager"), and `extends WithSubscriptions`. It creates no lists of its own, never touches a paginator another node holds, and is named for what it holds (`client.<entity>Paginators`).

### 8. A shared entity store on `StreamChat`

When the same entity can sit in several lists, one `EntityStore` holds one canonical copy per id. It lives on `StreamChat` (`client.messageStore`), or on the manager that owns the entity itself (`client.channelManager.channelStore`).

- Consistency rules (which copy wins, which copy removes the entity) belong to the store, so every writer obeys them: events, queries, action responses. On master `EntityStore` has no such hook (its `upsert` always replaces). Adding one is the expected change: an opt-in option on `EntityStore`, with a generic contract, that stores which don't pass it ignore. Write the rule itself as named pure functions next to the feature and pass them in.
- Ask what a stale copy can bring back. A query that started before a removal can return the removed item. If the store forgets the removal (its entry is released when no list holds it), it can't refuse that copy. Then the store must remember removals (a tombstone kept after the entry is gone) until logout, and every removal must reach the store, including one for an item no list holds (an event for a channel that isn't loaded).
- **A feature that adds fields to an existing entity** (a field on the message) needs no new store, but every path that writes that entity can drop the new fields: events whose payload lacks them, action responses, queries, local updates. List every writer of the entity's store (search for `upsert`, `ingestItem`, `setItems` and the event handlers that replace the entity) in the design note. Then decide, as one rule on the store, what an incoming copy without the fields means: keep the held value, or clear it. Don't repeat that merge at each call site, the way `Channel._extendEventWithOwnReactions()` carries `own_reactions` over.

### 9. WS events

- Each piece hears an event through its parent's route (step 1); on `Channel`, a case in `_handleChannelEvent` ingests into the channel's paginators, as it does for pinned messages.
- A piece whose parent may not be loaded when the event arrives (a channel the SDK hasn't loaded) needs a holder that is always there: a manager's pipelines (`client.on`), which run only while the UI SDK or app has registered its subscriptions, or `StreamChat.dispatchEvent`.
- A write the store needs whatever is loaded or subscribed (step 8: a removal for an item no list holds) goes in `StreamChat.dispatchEvent`, which sees every event. Keep it to that one store write.
- Each list decides membership and position itself (`matchesFilter`, `sortComparator`). The store decides which copy is current.
- Turning an event into an item is one named function (`getScheduledMessageFromEvent`), shared by the parent and the manager.

### 10. Optimistic updates

Does the UI need to show the result before the server answers?

- For actions on real messages and their reactions, reuse `messageOperations` (`llc-services`, "Optimistic updates"); it writes to the message list, so it is not the path for a separate entity that only resembles a message.
- If the feature's action response carries the new item, apply the response through the same path as events (`paginator.ingestItem` → store rule). The event that echoes the action carries an equal copy, so whichever copy the store's rule keeps, nothing visible changes.

### 11. Offline support

Does an action need to be queued while offline?

A queued action is one entry in `QUEUEABLE_OPERATIONS` and one in `QueueableOperationSignatures`, run through `queueOrRun()` (`llc-services`, "Offline support"); no feature queue or replay. A list shown from the offline DB before its first query implements the paginator's offline hooks (as `ChannelPaginator` does) and handles its events in `AbstractOfflineDB.handleEvent`.

### 12. Recovery after a reconnect

Refresh each list through its parent's existing route (`llc-services`, "Connection recovery": an active channel's or thread's reload, a `recover…Lists()` call in the pass, or `connection.recovered`). Pick one of these; don't add another, and don't give the feature a socket-health subscription of its own, which would run before the offline DB's replay and sync finish, and ignore `ConnectionRecoveryManager`'s `enabled` config.

- Use `recover…Lists()`, called from both `handleReconnect()` and `recover()`, for lists that don't depend on the channel reloads. Use `connection.recovered` for those that do: it fires after them.
- A reload keeps the current items until the response lands (`keepPreviousItems`, or a `reload()` override like `ThreadPaginator.reload()`), so the UI doesn't blank.
- A view whose source paginator belongs to another parent (a thread's view of its channel's list) is refreshed only when that parent is. Name the gap in the design note, or close it from the parent that owns the list.

### 13. Message composer

If the feature changes how a message is composed or submitted, add a middleware to the executor's default list at the position where its check belongs (how, in `llc-services`, "Message composer"). One job per middleware: a check that blocks a submit calls `discard()` and reports through `client.notifications`; otherwise it calls `forward()`. Composer state gets a field only for what the UI renders; derive the rest with a getter.

## Worked example: scheduled messages

The scheduled messages feature (stream-chat-js [PR 1990](https://github.com/GetStream/stream-chat-js/pull/1990)) was first built as its own service, then rebuilt on the existing ones in commit `79b2d11d` ([PR 2013](https://github.com/GetStream/stream-chat-js/pull/2013), spec in `specs/scheduled-message-lists/spec.md`). The walkthrough leads to the second design. This code lives on PR 1990's branch, `feat/cha-5934-scheduled-messages-v10`, not on master; read it with `git show 79b2d11d:<path>`.

| Step | Answer |
| --- | --- |
| 1. Parents | `Channel`: `scheduledMessagesPaginator`, the actions. `StreamChat`: `scheduledMessageStore` (beside `messageStore`) and `scheduledMessagePaginators` (`ScheduledMessagePaginatorsManager`). `Thread`: `scheduledMessages`, a view of its channel's list (the thread's replies are part of the channel's set). |
| 2. API | `channel.sendMessage` with `scheduled_at` (create; `Channel.scheduleMessage()` wraps it), `updateScheduledMessage`, `deleteScheduledMessage`, `sendScheduledMessageNow`, `queryScheduledMessages` (list), and `include_scheduled_messages` on channel queries and `queryChannels`. |
| 3. Listing | `ScheduledMessagePaginator`, defined by its filter (`cid`, `status`). The server can't filter by thread, so the channel's list holds replies too, and `channel.scheduledMessages` / `thread.scheduledMessages` are `ScheduledMessagesView`s (a `PaginatorView`) of it. |
| 4. Config | Under the `channel` key of `client.config`: `scheduledMessagesPaginator` (a paginator group); `scheduledMessages.enabled`, read as `channel.config.scheduledMessages.enabled` and ANDed with the server's scheduled-message limits; four request overrides in `requestHandlers`. |
| 9. Events | `Channel._handleChannelEvent` ingests `scheduled_message.*` into the channel's list; the manager's pipelines ingest into registered lists; `dispatchEvent` records a tombstone for `sent` / `deleted` even when no list holds the message. |
| 10. Optimistic | None. Action responses are ingested like events; the echoing event has the same `updated_at`; the rule lets an equal copy replace the stored one, so nothing visible changes. |
| 11. Offline | Not queued: an open SDK decision, recorded in the PR. |

Steps 5–8, 12 and 13 are in the next table; for step 13, the scheduled-message composition middleware (`SCHEDULED_MESSAGE_COMPOSITION_MIDDLEWARE_ID`) blocks what can't be scheduled.

### What the first version rebuilt, and what replaced it

| First version (`79b2d11d^`) | Existing service it duplicated | `79b2d11d` |
| --- | --- | --- |
| `client.scheduledMessages` owned a global list, a `channelPaginators` map keyed by `cid` that only grew, and every action. | The parent's ownership and lifecycle (`Channel` fields, `Channel.disconnect()`), `ChannelManager`'s registry. | `channel.scheduledMessagesPaginator` and actions on `Channel`; a manager that holds only registered lists. |
| `resolveLatest`, `receivedVersions`, `hydratedCids` and a `version` kept by the manager; `Channel` and `StreamChat` read its `version` around every query. | `EntityStore` as the single canonical copy. | Two store options (`shouldReplace`, `isTombstone`) plus `EntityStore.resolveCanonicalEntity()`; every writer obeys them. |
| `hydrateChannelState(cid, …)` on the manager, called from `Channel.requestChannelState` and `StreamChat.queryChannelsAndHydrate`. | The parent filling its own paginator from its own response (pinned messages). | `Channel` hydrates its own list; `ScheduledMessagePaginator.hydrate()` applies a complete set through `removeItem` / `ingestItem` in one `batch`, or makes it the first page of a list that isn't complete yet. |
| `setCompleteList`, `markEmptyComplete`, an `applyQueryResponseRest` override and an `ingestItem` special case. | `BasePaginator`'s own page and interval handling. | `BasePaginator` handles empty complete lists behind `startsIntervalInEmptyCompleteList`; the subclass opts in. Its remaining `ingestItem` override resolves the store's canonical copy before placing (step 5), and takes an item that stopped matching out of the item index, which the base `ingestItem` keeps. That second part is an open base-class gap. |
| A `connection.recovered` handler and a socket-health subscription to forget hydrations. | `ConnectionRecoveryManager`. | `ConnectionRecoveryManager.handleReconnect()` calls the manager's `recover()`; the on-demand `ConnectionRecoveryManager.recover()` does not yet, which is a gap against step 12; channel lists recover with their channel; `ScheduledMessagePaginator.reload()` keeps items until the response lands. |
| One client config key, `client.scheduledMessages.paginator`, for all lists. | The per-parent config slice. | `channel.scheduledMessagesPaginator`; registered lists take `paginatorOptions`. |
| `getRequestHandlers(cid)` on the manager reading a channel's config. | The channel's own `requestHandlers`. | The channel reads its own `configState`. |
| `editedScheduledMessage` plus `failedScheduledMessage`, and `rescheduleFailedMessage` / `cancelRescheduleFailedMessage`. | — (two fields for one concept) | One field; "failed" is derived from its status. |
| The React side (stream-chat-react [PR 3383](https://github.com/GetStream/stream-chat-react/pull/3383)) filtered by channel/thread scope inside its hooks. | — (scope logic outside the SDK) | `ScheduledMessagesView` in the LLC; the React side ([PR 3426](https://github.com/GetStream/stream-chat-react/pull/3426)) only reads it. |

## Check a design or a diff

Before the PR, check every assumption taken from the intake (store rules, event handling, error codes, what an absent field means) against the server repo's code and QA tests, when the user has one (`llc-spec-intake`, "The server repo"). Send any contradiction back to the server team with the evidence.

Stop and rework when any of these is true:

- A new class holds a `Map<cid, …>` or `Map<id, …>` of entities or paginators that a parent or a store could own.
- A new class has methods named like `upsertToState`, `removeFromState`, `getFromState`, `resolveLatest`, `version`, or holds a second copy of entities a store already holds.
- `Channel` or `StreamChat` calls into a feature manager around its own queries to keep that manager consistent.
- A paginator subclass overrides `ingestItem`, `setItems` or the page placement to work around a base-class case, instead of fixing the base class behind an opt-in.
- A feature subscribes to `connection.recovered` or socket health to reload data that `ConnectionRecoveryManager` or the parent's reload already refreshes.
- An action on an entity is a client- or manager-level method taking the entity as an argument.
- A config key for a per-parent list is top-level instead of nested under its parent.
- A composer feature adds parallel state fields or forks an executor instead of one middleware and a derived getter.
- The UI SDK would have to filter or merge SDK lists itself.

## Design note template

Every source from outside this repo that the note cites (the spec, a PR, a ticket, another app's page, UI SDK or server code) is a Markdown link to its URL.

```markdown
# <Feature>: design

1. Parents: <each piece → the node that holds it> — <why that node's key and lifetime fit>
2. API: <generated methods and flags used>
3. Lists: <paginator(s), each with its filter>; views: <PaginatorView uses, if any>
4. Config: <keys, where they sit in the tree, defaults>
5. Paginator: <class>, extends BasePaginator; hooks implemented; base-class changes (opt-in) if any
6. Paginators: <field on which parent>, filled by <responses>, released in <method>
7. Manager: <none | class shaped like ChannelManager>
8. Store: <none | EntityStore on StreamChat>, rules: <named predicates>
9. Events: <event types> → <the route of each piece's parent>
10. Optimistic updates: <none | via …>
11. Offline: <none | queueable operation …>
12. Recovery: <the route of each piece's parent>
13. Composer: <none | middleware id, state field>

Errors: <each row of the intake's Errors table → the existing path that handles it (`llc-services`, Reuse table, "Tell a final error from a transient one" and "Tell the user something failed"), and the named predicate for a feature's own code or reason>
Existing code paths affected: <every writer and reader of the entities the feature touches, and what each does with the new data>
Neighbouring features: <each SDK or server feature that already processes this kind of content (`message.i18n`, search sources, message previews, the offline DB's rows): covers the new data, or a gap with its default>
New concepts inside existing services: <list, with the service>
New services: <list; for each, why no existing service owns this>
Behaviour against other chat apps: <each intake question or decision that names another app → follow the reference app, follow the spec, or an open decision. An adjustment to what the server sends is asked of the server first; one the SDK still makes lives in one named LLC predicate or selector, never in each UI component>
Open decisions: <list>
```
