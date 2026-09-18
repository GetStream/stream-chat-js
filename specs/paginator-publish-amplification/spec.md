# Spec — Paginator publish amplification

Everything in this document was found while implementing the **message state update queue**
(`MutationEcho`, `src/mutationEcho/`), but **none of it belongs to that feature**. The queue pairs an
HTTP response with its WebSocket echo so a write this client requested applies once instead of twice.
Everything here is about a different problem that happens to live next door:

> **One logical change to one message produces more than one `state.items` publish, and the count
> grows with the number of collections that hold the message.**

The two are independent. The queue's ceiling is _your own sends on an HTTP-first connection_. This
problem's ceiling is _all inbound traffic, from any sender_.

**Nothing described here is implemented.** Every measurement below was taken against `release-v10`
(or against a throwaway prototype that was reverted); the numbers are evidence for the defect and for
the proposed direction, not a record of shipped work. The corresponding tasks are in
[`plan.md`](plan.md).

---

## 0. Background: why a redundant write costs a render

Three facts combine, and none is obvious on its own.

1. **`BasePaginator` publishes a fresh `items` array on every window change.** `StateStore.next`
   compares with `Object.is`, so a freshly allocated array is _always_ a change. One redundant ingest
   is one full list re-render downstream.

2. **`channel.messagePaginator`, `channel.pinnedMessagesPaginator` and `thread.messagePaginator` all
   back onto the same `client.messageStore`** (`MessageIntervalPaginator` supplies the store-backed
   index). `StoreBackedItemIndex.setOne` → `EntityStore.upsert`, which bails **only on reference
   equality** (`previous === entity`, `EntityStore.ts:103`) and otherwise `markDirty`s _every other
   subscriber of that id_. So one paginator's write forces the others to re-project.

3. **`ingestItem` writes the index BEFORE it checks the filter** (`BasePaginator.ts:2461`, comment:
   _"regardless of filters — this keeps the index authoritative"_). Removal happens earlier still. So a
   paginator participates in the shared store even for items it will never display.

Consequence of (3), measured: after a plain `message.new` for a **non-pinned** message,
`pinnedMessagesPaginator.getItem(id)` returns the message. **The pinned paginator is a store
subscriber for every message in the channel**, with zero publishes of its own to show for it.

### Why (3) is load-bearing and cannot simply be reversed

When an item stops matching the filter — an unpin — the new snapshot still has to reach the shared
store so other holders observe `pinned: false`. Filtering before the write would drop that content
update. The write is only waste in the narrower case: **the index does not already hold the id AND
the item does not match the filter.** See §5.2.

---

## 1. `formatMessage` hoisting

### The defect

On `release-v10`, two WS arms call `formatMessage(event.message)` **twice**, once per paginator:

| `release-v10` line | arm                 |
| ------------------ | ------------------- |
| 2657 / 2659        | `message.new`       |
| 2773 / 2774        | `channel.truncated` |

Two calls produce two **distinct objects**. The second `setOne` therefore misses `EntityStore.upsert`'s
`previous === entity` bail, `markDirty`s the _first_ paginator, and its `reconcileChangedIds`
re-projects — **a second publish of the message list**.

`message.deleted` (2612) and `message.updated` (2744) already hoisted a single `formattedMessage`.
`message.new` and `channel.truncated` were the two outliers.

### Evidence

Isolated A/B, one message ingested into both paginators:

```
HOISTED   (one object)  -> mainPublishes=1  pinnedPublishes=0
UNHOISTED (two objects) -> mainPublishes=2  pinnedPublishes=0
```

**The extra publish is on the MAIN list, not the pinned one.** The pinned paginator publishes 0 in
both cases — it does respect its filter for what it _displays_. What it does not filter is the store
write, which happens first. The bug was never "the pinned list rendered something it shouldn't"; it
was "the pinned list's store write bounced back and re-rendered the main list".

Measured on a physical Android device before the fix: 3 → 2 list publishes per send, and the
shared-store fan-out scheduler count went 3 → 0.

### Shape of the fix

Hoist one `const formattedMessage` per arm and pass the same reference to both paginators — which is
what the two arms that were already correct do. Measured as a diff against `release-v10`: 6 lines
added, 4 removed, across 2 sites in 1 file.

### Scope note

This fires on **100% of `message.new`**, including other users' messages, and is independent of
HTTP/WS ordering. It is the single largest measured win of the whole session and has nothing to do
with the update queue.

---

## 2. `ingestItem` publishes more than once per replace

### The defect

`ingestItem` for a **replace** is internally _remove-then-insert_ — the item's sort key may have
changed, so it is removed from its interval slot and re-inserted at the newly sorted position
(`BasePaginator.ts:2452` calls `removeItemAtCoordinates`, which publishes; the insert publishes again).
**One logical replace emitted twice.**

An **insert** (new id) publishes once. A **replace** published twice. Replaces are: the HTTP server
copy landing over the optimistic message, every edit, every `message.deleted`, every reaction on a
loaded message.

### Why it was invisible on the message list

`stateThrottleMs: 500` is configured on **`MessagePaginator` only**
(`MessagePaginator.ts:145`). Both halves call `scheduleWindowPublish`, which coalesces, so the pair
collapsed. **`PinnedMessagePaginator`, `ChannelPaginator`, `ReminderPaginator` and
`UserGroupPaginator` have no throttle**, so they emitted twice per replace on every platform.

This is also the source of a 2-vs-3 discrepancy that caused real confusion during the session: the
device measured 2 publishes per send (throttle coalesced) while the unit harness measured 3 (Vitest
auto-disables throttling, `stateThrottling.ts:25`). Both numbers were correct; they measured
different things.

### Evidence

```
channel list, re-ingesting a channel already in the list and matching the filter:
  without the fix -> 2 publishes
  with the fix    -> 1 publish
```

`ChannelManager.updateLists` calls `paginator.ingestItem(channel)` on every `message.new`, so this was
once per inbound message per matching list. Note the wording: the `Channel` **object** is never
replaced — it is a live object held by reference. What is removed and re-inserted is its **slot** in
the list, because `last_message_at` changed and it may need to move.

### Shape of the fix

Suspend the paginator's own window publishes across one `ingestItem` and publish once on exit.

**It must NOT be `batch({ coalesce: true })`.** `batch` exits through `flushWindowPublish`, a
_synchronous_ emit — which is precisely the "each event forces a sync emit instead of riding the
throttle" behaviour `batch`'s own documentation warns against for WS handlers. The new helper exits
through `scheduleWindowPublish` when throttled, falling back to a synchronous flush only when there is
no throttle to ride. It has to be re-entrant: nested inside an outer coalescing `batch` it must defer
to that scope.

**`lockItemOrder` lists must be excluded, and that is load-bearing, not a shortcut.** Their publish is
not a re-projection at all — `ingestItem` republishes the LAST PUBLISHED array with the item spliced
back at its original index, which is the entire point of locking the order. Exiting through
`flushWindowPublish` re-derives from the active interval and **drops anything the interval no longer
holds**. A prototype that missed this was caught by an existing `BasePaginator` test (2 items instead
of 3) — expect that test to be the tripwire.

### Expected result

|                                       | before    | after                |
| ------------------------------------- | --------- | -------------------- |
| message list, per send (unit harness) | 3         | **2** — the floor    |
| channel list, per inbound message     | 2         | **1**                |
| `lockItemOrder` lists                 | unchanged | unchanged (excluded) |

---

## 3. The N² fan-out

### The defect

When **N** collections hold the same message and each formats + ingests independently — which is what
today's call sites do — each write dirties the other N−1, and each of those re-projects.

**Measured**, one logical update delivered to N collections sharing `client.messageStore`:

| N   | today | shared object | `transaction` | both | value-equality | **memo + transaction** |
| --- | ----- | ------------- | ------------- | ---- | -------------- | ---------------------- |
| 1   | 1     | 1             | 1             | 1    | 1              | 1                      |
| 2   | 4     | 3             | 3             | 2    | 3              | **2**                  |
| 3   | 9     | 5             | 5             | 3    | 5              | **3**                  |
| 4   | 16    | 7             | 7             | 4    | 7              | **4**                  |
| 5   | 25    | 9             | 9             | 5    | 9              | **5**                  |
| 6   | 36    | 11            | 11            | 6    | 11             | **6**                  |

**Today is exactly N². The floor is N.** Adding a fourth linked collection costs **+7** publishes, not
+1. This is the scaling risk: it is not about threads specifically, it is about every collection added
in future.

### It already bites today, on `show_in_channel`

`Channel._handleChannelEvent` formats `event.message` (`channel.ts:2700`) and
`Thread.upsertReplyLocally` formats it **again** (`thread.ts:1078`) — two distinct objects for one
event. Measured through the real `client.dispatchEvent` path:

```
show_in_channel message.new -> channelPublishes=2  threadPublishes=1   (floor: 1 + 1 = 2)
```

The hoist worked because both writes lived in **one function**. Here `Channel` and `Thread` handle the
same event independently, so there is no local variable to share — which is exactly why a per-call-site
fix is not a durable strategy. `message.new` sat un-hoisted on `release-v10` next to two arms that got
it right; "remember to share the object" does not survive contact with time.

### Sender-independence (important)

Measured through the real dispatch path, with and without the proposed memo:

```
                 today    with memo
sender = me       2    →     1
sender = other    2    →     1
```

Identical. **There is no own-message gating** — this fixes the fan-out mechanism, which does not care
who sent the message or whether a request is open. Contrast with `MutationEcho`, which can only ever
act on writes this client requested.

### Rejected approach: value-equality in `EntityStore.upsert`

Make `upsert` bail when the incoming entity is _value_-equal to the held one, rather than
reference-equal. Prototyped and measured: it reproduces the memo's curve (2N−1, → N with a
transaction) and the full suite stayed green (3716/3716), so nothing depends on the store holding the
newest object identity.

**Rejected on cost.** A purely shallow compare never matches, because `formatMessage` re-allocates
`reaction_groups` on every call (`maybeGetReactionGroupsFallback`, `utils.ts:639`) — verified by
diffing two independent `formatMessage(msg)` results: 23 keys, exactly one differs, and it is
`reaction_groups` (`quoted_message` behaves the same way when present). A compare must therefore
recurse. Measured 0.48µs per upsert worst case on a _small_ message; a message with many attachments
and a quoted message is materially worse, and it sits on the hot path for every write. Deep comparison
on the JS thread is not acceptable here.

It also introduces a contract change worth recording even though we are not taking it:
`store.upsert(x)` would no longer guarantee `store.get(id) === x`.

### Proposed approach: memoise `formatMessage` on input identity

```ts
const formattedCache = new WeakMap<object, LocalMessage>();
```

Every collection is handed the **same** `event.message` object, so they all receive the **same**
`LocalMessage`. `EntityStore.upsert`'s **existing** reference-equality bail then fires on its own —
the store needs no new logic, and there is **no comparison anywhere**.

**It costs less CPU than today.** Measured:

```
50k formatMessage, same object (memo hit):    0.021µs each
50k formatMessage, distinct objects (miss):   0.538µs each
```

A cache hit is ~26× cheaper than formatting. Today N collections perform N formats; with the memo they
perform one. The value-equality route _added_ 0.48µs per upsert; this route _removes_ ~0.5µs per
redundant format.

Full suite with the prototype in place: **3716/3716 green**.

### Precondition: the one in-place mutation

`Channel._extendEventWithOwnReactions` (`channel.ts:3194`) does
`event.message.own_reactions = message.own_reactions` — the **only** in-place mutation of a message
object anywhere in `src` (verified by grep). With a memo keyed on that object, whoever formats first
wins the cache. Today the channel mutates _then_ formats, and `channel._handleChannelEvent`
(`client.ts:934`) runs before `_callClientListeners` (`:937`) where `Thread` subscribes — so it is
correct **by ordering luck**. Make the enrichment non-mutating first (~5 lines, derive a new message
rather than assigning) and the memo becomes unconditionally safe.

### Invariant it introduces

A formatted message becomes **shared**, so it must be treated as immutable. Nothing in `src` mutates
one today, so this is a rule being made explicit rather than a behaviour change. `formatMessage` is
public API, so integrators would share objects too — either document that, or expose the memo on an
internal entry point only.

### The second half: `transaction` around the dispatch fan-out

`EntityStore.transaction(fn)` already exists (`EntityStore.ts:154`), is re-entrant, and coalesces
every notification into a single flush on exit. Wrapping the event fan-out in it collapses the
remaining N−1 cross-notifications (`pendingChanged` is a `Map<subscriber, Set<id>>`, so it dedupes per
subscriber) and takes 2N−1 → N.

#### `flushSubscribers` interaction — real, and the fix is ordering

`EntityStore.flushSubscribers(id)` (`EntityStore.ts:170`) → `subscriber.flushState()` →
`BasePaginator.flushPendingPublishes()`. It flushes **the throttle**, not the dirty queue. Its purpose
is making an optimistic local write render immediately instead of waiting up to 500ms. Callers:
`channel.ts:421`, `thread.ts:311` (the ingest closures) and `applyReactionLocally.ts:89`.

**It does break under a naive transaction.** Inside one, `markDirty` only accumulates, so when
`flushSubscribers` runs the siblings have not been told anything and have nothing pending to flush;
then at transaction exit `onEntitiesChanged` fires and schedules a _throttled_ publish — up to 500ms
late. The writer itself is unaffected (`upsert` skips notifying the writer, which emits inline), so
the list the user is looking at still renders instantly; the lag would hit **sibling** collections
(pinned list, open thread) on optimistic writes.

**Fix:** have `EntityStore` record ids whose `flushSubscribers` was requested during a transaction and
run those flushes **after** the final `flush()` on exit. Semantics preserved exactly, ordering
corrected.

---

## 4. Reduce N: conditional `setOne`

Orthogonal to §3 — it reduces **N itself** rather than the cost at a given N.

```ts
if (this._itemIndex.has(id) || this.matchesFilter(ingestedItem)) {
  this._itemIndex.setOne(ingestedItem);
}
```

The removal path is untouched: a message being unpinned **is** held, so its content still reaches the
store (see §0). What goes away is the pinned paginator writing and subscribing for every ordinary
message in the channel.

`_itemIndex.has(id)` already exists (`StoreBackedItemIndex.ts:79`), so this needs no new API. ~5 lines.

**Knock-on for the update queue:** the `channelPinnedMessages` echo target exists _only_ because that
ingest is unconditional. Making it conditional would remove roughly half the gated sites in
`channel.ts`, collapse `EchoScope`'s channel declaration to a single target matching `Thread`'s, and
delete the "arm the pinned target unconditionally" special case in `reconcileHeldMessage` — which
exists purely because of the write-before-filter behaviour.

**Open questions before implementing:** whether `pinned_at` changing without `pinned` changing matters
for the pinned sort, and what should happen for a pinned message the pinned window has never loaded.

---

## 5. Noted, not investigated

### 5.1 `reconcileChangedIds` throttled/unthrottled asymmetry

The unthrottled fast path skips publishing when `updated === currentItems[i]`; the throttled branch
(which the message list uses) gates on interval membership only and schedules unconditionally. Latent,
not the cause of anything measured here, but worth tightening — and it would compose with §3.

### 5.2 `formatMessage` allocation stability

`maybeGetReactionGroupsFallback` (`utils.ts:639`) returns a fresh `{}` on every call even when nothing
changed. If it returned the input reference when there is nothing to fall back to, a _shallow_ compare
would become viable and `formatMessage` output would be more stable generally. Small, independent.

---

## 6. Appendix: measurement methodology and traps

Every number above was measured, not reasoned. Three traps produced confidently wrong numbers during
this work and are recorded so the next person does not repeat them:

1. **`ingestItem` publishes nothing without an active window.** A paginator assertion passes vacuously
   unless seeded with `ingestPage({ setActive: true })`. Always pair a publish-count assertion with a
   control (e.g. the same scenario with the feature disabled).

2. **A bare `client.channel(type, id)` has no `data` and therefore FAILS `matchesFilter`**, so
   `ingestItem` takes the _"no longer matches"_ branch (remove + `shrinkOffsetAfterRemoval`) rather
   than the re-sort path. Set `ch.data = { cid, id, type }` and **assert `matchesFilter` inside the
   test** before trusting any number.

3. **Vitest auto-disables state throttling** (`stateThrottling.ts:25`), so unit publish counts and
   device publish counts measure different things. State which environment any number came from.

Stack-tracing the subscriber is the technique that resolved every ambiguity here:

```js
const unsubscribe = paginator.state.subscribe(() => {
  const frames = (new Error().stack || '')
    .split('\n')
    .slice(1)
    .map((l) => (l.match(/at ([\w.<>]+)/) || [])[1])
    .filter(Boolean);
  // ...
});
```

It is the only reliable way to attribute a publish, because the throttle makes the scheduling caller
disappear from the stack by the time the emit happens.
