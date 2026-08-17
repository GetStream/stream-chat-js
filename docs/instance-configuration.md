# Instance configuration

Suppose you want the message list to load 50 messages per page instead of the default 100.

The page size lives on `channel.messagePaginator.config.pageSize`. That paginator is created inside the
`Channel` constructor, and channels are created inside `client.channel()`, `client.queryChannels()` and
offline hydration — so by the time you hold a `Channel`, its paginator is already built. You can mutate
it on every channel you happen to have a reference to, but you cannot make it the default for the
channels the SDK creates on your behalf.

`client.config` is how you do that. It configures instances the SDK creates for you: channels, threads,
message composers, and the client's own managers.

> **`client.config` is not `client.channelConfigsByType`.** The latter is an internal cache of the
> **server-provided channel-type configuration**, keyed by channel type. It is not part of the supported
> surface — read server config through `channel.getConfig()`. `client.config` is yours: what you register
> for the instances the SDK creates.

## Two ways in

Which one you use depends on whether the thing you are changing is a **value** or a **behaviour**.

```ts
// values — page sizes, throttles, feature flags, durations, limits
client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });

// behaviour — custom request logic, middleware, comparators
client.config.setSetupFunction('channel', ({ channel }) => {
  /* … */
});
```

The first is the front door and should cover most of what you need. The second is the escape hatch.
Both use the same four key names — `'client'`, `'channel'`, `'thread'`, `'messageComposer'` — and
underneath they are one mechanism.

---

## 1. Declarative configuration

One call, typically next to `StreamChat.getInstance()`:

```ts
import { StreamChat } from 'stream-chat';

const client = StreamChat.getInstance(apiKey);

client.config.set({
  // Applies to every message paginator — the channel list and thread replies alike.
  messagePaginator: { stateThrottleMs: 250, retryCount: 2 },
  channel: {
    messagePaginator: { pageSize: 50 },
    pinnedMessagesPaginator: { pageSize: 25 },
  },
  thread: {
    messagePaginator: { pageSize: 25 },
  },
  messageComposer: {
    drafts: { enabled: true },
    linkPreviews: { enabled: true, debounceURLEnrichmentMs: 800 },
    attachments: { maxNumberOfFilesPerMessage: 5 },
  },
  client: {
    notifications: { durations: { error: 10_000 } },
    reminders: { scheduledOffsetsMs: [5 * 60_000, 60 * 60_000] },
  },
});

await client.connectUser(user, token);
```

Inside a key, the tree mirrors that instance's own configuration plus the sub-objects it owns — but not
other keyed instances.

### Why some things get their own key

Whether something is configured through its parent or gets a top-level key of its own follows one rule:
**how many kinds of parent can it hang off, and does the configuration mean the same thing under each?**

|                                        |                                                                                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One parent type**                    | Nest it. `channel.pinnedMessagesPaginator`, `channel.cooldownTimer`, the composer's own sub-managers — there is only one place to reach them from.                                                                     |
| **Several parents, same meaning**      | Own key. A `MessageComposer` hangs off a channel, a thread, _and_ a message being edited. `drafts.enabled` means the same in all three, so nesting it under `channel` would silently miss two thirds of the composers. |
| **Several parents, different meaning** | Nest it anyway. `MessageOperations` is built by both a channel and a thread, but sending to a channel and sending as a thread reply are genuinely different operations — a shared key would conflate them.             |
| **Several parents, mixed**             | Both. A `MessagePaginator` backs the channel message list _and_ thread replies. `stateThrottleMs` / `retryCount` / `throwErrors` have no reason to differ; `pageSize` does.                                            |

That last row is why `messagePaginator` exists as a top-level key **and** as a path under `channel` and
`thread`. Set the shared things once; override per parent where they genuinely differ:

```ts
client.config.set({
  messagePaginator: { stateThrottleMs: 250, retryCount: 2 }, // both lists
  channel: { messagePaginator: { pageSize: 100 } }, // channel only
  thread: { messagePaginator: { pageSize: 25 } }, // replies only
});
```

The per-parent slice wins field by field, so a slice naming only `pageSize` leaves the shared
`stateThrottleMs` in place. `channel.pinnedMessagesPaginator` is deliberately **not** covered by the
shared key: it has a single parent, and it is a different class with its own ordering and endpoint.

`set` deep-merges, so a later call only touches what it names:

```ts
const flags = await fetchFeatureFlags();

client.config.setConfig('messageComposer', {
  location: { enabled: flags.sharedLocation },
});
// `drafts.enabled` and `linkPreviews` from the call above are untouched
```

### It is a config object, not JSON

Many leaves are functions — `attachments.fileUploadFilter`, `linkPreviews.findURLFn`,
`location.getDeviceId`, `notifications.sortComparator`, `messagePaginator.hasPaginationQueryShapeChanged`.
Do not plan on serializing the tree. The scalar subset happens to be serializable, but nothing here
depends on that.

It also means "declarative" does not mean "scalars only". Request handlers are ordinary configuration
and belong here rather than in a setup function:

```ts
client.config.set({
  channel: {
    requestHandlers: {
      sendMessageRequest: async ({ localMessage, message, options }) => {
        await auditLog.record('message.send', { id: localMessage.id });
        const { message: sent } = await sendViaProxy(message, options);
        return { message: sent };
      },
      markReadRequest: async ({ channel, options }) => {
        await channel.markRead(options);
        return null;
      },
    },
  },
  thread: {
    requestHandlers: {
      markReadRequest: async ({ thread }) => {
        await auditLog.record('thread.read', { id: thread.id });
        await thread.markRead();
        return null;
      },
    },
  },
});
```

`markReadRequest` returns `Promise<EventAPIResponse | null>`, and `channel.markRead()` /
`thread.markRead()` resolve to a different response shape — so return `null` after delegating rather
than forwarding their result directly.

### Two setters, one open key space

`setConfig(key, subtree)` accepts **any** key, so a class of your own participates without changing
this package. `set(tree)` is a typed contract and rejects top-level keys it does not know — which is
what makes a typo in the whole-tree form a compile error rather than a silent no-op. To use a custom key
with `set`, augment `InstanceConfigTree` (see [Custom keys](#6-custom-keys)).

---

## 2. Setup functions — the escape hatch

Reach for this when what you want to change is behaviour, not a value: middleware, comparators, a
replaced request implementation. Mutate what you need and return a function that undoes it.

```ts
// 'messageComposer' — insert composition middleware
client.config.setSetupFunction('messageComposer', ({ composer }) => {
  const id = 'my-app/message-composer-middleware/mentions-guard';

  composer.compositionMiddlewareExecutor.insert({
    middleware: [
      {
        id,
        handlers: {
          compose: ({ state, next, discard }) =>
            countMentions(state.message) > 10 ? discard() : next(state),
        },
      },
    ],
    position: { before: 'stream-io/message-composer-middleware/composition-validation' },
    unique: true,
  });

  return () => composer.compositionMiddlewareExecutor.remove([id]);
});
```

```ts
// 'channel' — replace where the message list fetches from
client.config.setSetupFunction('channel', ({ channel }) => {
  const original = channel.messagePaginator.config.doRequest;

  channel.messagePaginator.updateConfig({
    doRequest: async (queryShape) => {
      const { messages } = await fetchFromCache(channel.cid, queryShape);
      // `cursor` is optional; supply one only for cursor-paginated sources, as
      // `{ headward, tailward }`.
      return { items: messages.map(formatMessage) };
    },
  });

  return () => {
    channel.messagePaginator.updateConfig({ doRequest: original });
  };
});
```

```ts
// 'client' — the client's own managers
client.config.setSetupFunction('client', ({ client: c }) => {
  // `client.on` returns `{ unsubscribe }`, so hand back the method itself as the teardown.
  const { unsubscribe } = c.on('connection.changed', handleConnectionChange);
  return unsubscribe;
});
```

```ts
// 'thread' — reaches the reply paginator, composer and message operations
client.config.setSetupFunction('thread', ({ thread }) => {
  thread.messagePaginator.updateConfig({ lockItemOrder: true });
});
```

Pass `null` to clear a setup function; its teardown runs against every live instance.

### The rules

1. **Registering applies immediately** — to instances that already exist and to every one created
   afterwards. There is no "register before you connect" requirement.
2. **Replacing tears down first.** The previous function's teardown runs before the new one is applied.
3. **Disposing an instance tears down.** `unregisterSubscriptions()` for composers and threads,
   `_disconnect()` for channels, `disconnectUser()` for the client.
4. **Errors are contained.** A throwing setup or teardown is caught and logged; it cannot break
   `client.channel()` or a `Thread` construction.
5. **Your function may run more than once for the same instance.** That is the contract: return a
   teardown that restores what you changed.
6. **Order does not matter.** Registering for a key nobody has subscribed to yet, and subscribing to a
   key with nothing registered yet, both work.

One exception to rule 1 worth knowing: a `Thread` only receives a **setup function** once
`registerSubscriptions()` has been called (which is how `MessageComposer` already behaves — it is what
gives the teardown its symmetry). Declarative configuration is unaffected; the constructor applies it
directly.

### Precedence

**Declarative configuration is applied first, the setup function second**, on every change to either.
So a setup function always wins for the same field — which makes "a global default plus one conditional
exception" the natural shape:

```ts
client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });

client.config.setSetupFunction('channel', ({ channel }) => {
  if (channel.type !== 'announcement') return;
  const previous = channel.messagePaginator.config.pageSize;
  channel.messagePaginator.updateConfig({ pageSize: 200 });
  return () => {
    channel.messagePaginator.updateConfig({ pageSize: previous });
  };
});
```

Every channel gets 50; `announcement` channels get 200.

---

## 3. How a value is resolved

Everything above describes _what_ you can register. This section is the order it is applied in, and when
that order re-runs.

### The stages, in order

For any one instance, its resolved configuration is built from these layers, later ones winning:

| #   | Stage                         | Scope                                      | Where it comes from                                  |
| --- | ----------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| 1   | **Package defaults**          | every instance                             | `DEFAULT_*_CONFIG` constants                         |
| 2   | **Declarative tree** (tier 1) | per **entity type**                        | `client.config.set({ … })`                           |
| 3   | **Construction argument**     | one instance                               | whoever called `new …({ config })`                   |
| 4   | **Setup function** (tier 2)   | per **entity type**, but sees the instance | `client.config.setSetupFunction(key, fn)`            |
| 5   | **Imperative changes**        | one instance                               | `instance.updateConfig(…)` called from your own code |
| 6   | **Server authority**          | per **channel type**                       | the channel's server config; narrows only, goes last |

Stages 2 and 4 are the two tiers. Stage 4 running after stage 2 is what makes a setup function beat the
declarative tree for the same field, which is the whole basis of "a global default plus one conditional
exception".

**Server authority is last on purpose.** Every route into the configuration — declarative, setup function,
or a direct `updateConfig()` — has the server's restrictions re-asserted over the result, so nothing above
can widen past them. That ordering is what makes
[the server has the last word](#5-the-server-has-the-last-word) literally true rather than roughly true.

**The stages are re-resolved, not accumulated.** Each layer is kept separately and the whole order is
replayed whenever any of them changes — so applying the server's restrictions is idempotent, and stage 6
narrowing a field never destroys the request underneath it. That is what lets both of these hold at once,
which a single stored value cannot do:

- you turn a feature off, the server permits it, and it stays off — your request is still on record;
- the server turns a feature off and later permits it again, and the value returns to whatever you asked
  for, rather than being stuck at the server's old answer.

Practically, it also means stage 5 is not a one-way door: an imperative change survives a later declarative
one on the same field, because stage 5 is replayed after stage 2 every time.

> **This applies to `MessageComposer` only.** It is the one class that stores the stages separately, because
> it is the one with a server restriction to re-apply. Everywhere else — `Channel`, `Thread`, the paginators,
> the client-level managers — a re-derivation rebuilds from the registered inputs alone and an imperative
> change is dropped. See [what triggers a cycle](#the-recalculation-cycle) for exactly when, and prefer a
> setup function when a per-instance value has to persist.

**There is no per-instance stage in the declarative tier, by design.** Nothing in `config.set()` targets a
single object — you register per entity type and branch inside a setup function, which receives the
instance:

```ts
client.config.setSetupFunction('messageComposer', ({ composer }) => {
  if (!composer.threadId) return; // channel composers keep the default
  composer.updateConfig({ text: { publishTypingEvents: false } });
});
```

That is stage 5 doing per-instance work. It is not a fourth tier: the _registration_ is still per type, and
it re-runs for every instance, so the branch decides.

**Stage 3 is worth one caveat.** Whether a construction argument beats the declarative tree depends on who
supplies it, and the two cases genuinely differ:

- `MessageComposer` puts its constructor `config` **after** the declarative tree — that argument comes from
  an integrator building a composer deliberately, so it is the more specific intent.
- `BasePaginator` puts its constructor options **before** the declarative tree — for `channel.messagePaginator`
  and friends those options are the _SDK's own_ construction values (`channel.ts` supplies them), so your
  declarative configuration should override them.

Both orders are right for their case, but they are not the same order. If you construct a paginator
yourself, expect the declarative tree to win.

### The recalculation cycle

Configuration is never patched in place when something changes upstream. The instance **re-derives** from
its inputs, the setup function is re-applied on top, and the server's restrictions are re-asserted over
the result. That whole cycle is what runs, every time:

```
teardown of the previous setup function
        ↓
re-derive from defaults + declarative + construction   (stages 1–3)
        ↓
re-apply the setup function                            (stage 4)
        ↓
replay the stored imperative patches                   (stage 5 — MessageComposer only)
        ↓
re-assert the server's restrictions over the result    (stage 6)
```

Stage 5 is in the diagram for completeness, but only `MessageComposer` has anything to replay there — every
other entity reaches the cycle with no stored patches, as the table further down spells out.

Re-deriving rather than patching is what keeps the tiers honest: a field _removed_ from the declarative
tree has to disappear, which a merge could never express.

**What triggers a cycle** — any of these, for each affected instance:

| Trigger                                        | Example                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| its own key's declarative config changes       | `config.set({ channel: … })`                                         |
| its own key's setup function is set or cleared | `config.setSetupFunction('channel', fn)`                             |
| a **shared key** it also derives from changes  | `config.set({ messagePaginator: … })` reaches channels _and_ threads |
| the channel's server config arrives            | `channel.watch()` delivering `shared_locations`                      |
| `config.reset()`                               | every registered key, every instance                                 |

The shared-key row is why `Channel` and `Thread` declare `alsoWatch: ['messagePaginator',
'messageOperations']`: a change under a shared key must run the _full_ cycle, not a bare re-derivation,
because a bare re-derivation applies the declarative tree and stops — it never re-runs the setup function, so
stage 4's overrides would be lost. (Not stage 5: neither route preserves that one for a `Channel` or a
`Thread`, as the table below says.)

**Whether stage 5 survives a cycle depends on the entity**, and the difference is worth knowing before you
reach for `updateConfig()`:

|                   | an imperative `updateConfig()`                                                    | cleared by `config.reset()` |
| ----------------- | --------------------------------------------------------------------------------- | --------------------------- |
| `MessageComposer` | **kept** — the patches are a stored layer, replayed on every cycle                | yes                         |
| everything else   | **dropped** on the next cycle — it is not one of the inputs a re-derivation reads | yes                         |

Only the composer stores the layers separately, because it is the only class with a server restriction that
has to be re-applied without destroying the request underneath it. Extending that to the rest is deferred
(**FU-35**); until then, treat `updateConfig()` on anything else as valid until the next cycle.

A setup function (stage 4) is the way to make a per-instance value persist either way: it is _re-run_ as part
of the cycle, so its effect is reapplied rather than remembered.

```ts
// lost on the next re-derivation or reset — a paginator does not store stage 5
channel.messagePaginator.updateConfig({ pageSize: 200 });

// survives, because the function is re-run as part of every cycle
client.config.setSetupFunction('channel', ({ channel }) =>
  channel.messagePaginator.updateConfig({ pageSize: 200 }),
);
```

**Every stage lands in the same place.** The result is written to the instance's `configState`, so anything
subscribed sees each cycle — see [Reading configuration back](#reading-configuration-back).

---

## 4. What you can configure

### Asking the SDK, instead of reading this list

Everything in this section is also available at runtime, which matters whenever you cannot consult the
types at the moment you need them — a settings screen listing what an operator may change, a JavaScript
caller with no autocomplete, a generated reference page.

```ts
import { INSTANCE_CONFIG_TREE_SHAPE, flattenConfigShape } from 'stream-chat';

for (const { path, node } of flattenConfigShape()) {
  if (node.kind === 'group') continue;
  console.log(path, node.type, node.description);
  // thread.messagePaginator.pageSize number Items requested per page. …
}
```

Each node carries a `kind` (`'group'` or `'value'`), and a value node adds a `type`, a one-line
`description`, and `enumValues` where the choice is closed. `type: 'function'` marks a path the
declarative tier cannot carry at all — JSON has no functions — so those are reachable only through a
setup function.

The shape stays complete on its own: every level of it is declared as `Record<keyof SomeConfigType, …>`,
so a field added to any configuration type fails the build until it is described. What it deliberately
does **not** carry is default values, because an effective default depends on where the object is
constructed — `pageSize` is 10 for a bare paginator and 100 for the channel message list — and a table of
them would be a second source of truth that disagrees with the instances. Read current values from the
instance (`channel.messagePaginator.config`) and registered values from `client.config.getTree()`.

Built-in keys only: a key you registered through module augmentation has no entry, so merge in
`client.config.getTree()` if you need those too.

### Declarative paths, and their defaults

This is the whole tree with the values the SDK ships. If a path is not here, it is not declaratively
configurable — use a setup function.

```ts
{
  // No defaults of their own — these are layers applied *under* the per-parent slices below, so an
  // unset field simply leaves the parent's default in place.
  messagePaginator: {},
  // Applies to the channel's `MessageOperations` *and* every thread's, because messages are sent from
  // both. Defaults live here rather than on the parents.
  messageOperations: {
    failedSendCacheMaxSize: 100,      // failed sends kept for retry; oldest evicted past this
    failedSendCacheTtlMs: 300_000,    // 5 minutes
  },
  channel: {
    requestHandlers: {},              // none — the SDK's own request paths are used
    messagePaginator: {
      debounceMs: 300,                // ⟳ rebuild
      hasPaginationQueryShapeChanged: (prev, next) => !isEqual(prev, next),
      initialCursor: undefined,       // ⚑ construction-only
      initialOffset: undefined,       // ⚑ construction-only
      lockItemOrder: false,
      pageSize: 100,                  // channel message list default
      retryCount: 0,                  // i.e. one attempt
      stateThrottleMs: 500,           // ⟳ rebuild — raised from the base's `undefined`
      throwErrors: false,
      unreadReferencePolicy: 'snapshot',   // ⚑ construction-only
    },
    pinnedMessagesPaginator: {
      // as above, except:
      stateThrottleMs: undefined,     // no throttle, unlike the main list
    },
    messageOperations: {},            // per-parent override of the shared key below
  },
  thread: {
    requestHandlers: {},
    messagePaginator: {
      // as the channel's, except:
      pageSize: 50,                   // thread reply default
    },
    messageOperations: {},            // per-parent override of the shared key
  },
  messageComposer: {
    attachments: {
      acceptedFiles: [],              // empty means "all"
      fileUploadFilter: () => true,
      maxNumberOfFilesPerMessage: 10,
      trackUploadProgress: true,
    },
    commands: { sendValidator: defaultCommandSendabilityValidator },
    drafts: { enabled: false },
    linkPreviews: {
      debounceURLEnrichmentMs: 1500,
      enabled: false,
      findURLFn: /* linkifyjs-based */,
    },
    location: {
      enabled: /* the channel's server-side `shared_locations` flag — not a constant */,
      getDeviceId: () => generateUUIDv4(),
      minShareDurationMs: 60_000,     // shorter live-location durations are rejected as invalid
    },
    text: { enabled: true, publishTypingEvents: true },
  },
  client: {
    notifications: {
      durations: { error: 3000, info: 3000, success: 3000, warning: 3000 },
    },
    reminders: {
      scheduledOffsetsMs: [120_000, 1_800_000, 3_600_000, 7_200_000, 28_800_000, 86_400_000],
      stopTimerRefreshBoundaryMs: 1_209_600_000,   // 2 weeks
    },
    messageDelivery: {
      markAsDeliveredBufferTimeoutMs: 1000,     // delivery reports batched over this window
      markAsReadThrottleTimeoutMs: 1000,        // ⟳ rebuild — minimum gap between auto mark-reads
      maxDeliveredMessageCountInPayload: 100,   // rest carried to the next request
      retryCountLimitForTimeoutIncrease: 3,     // timeouts before the window widens
    },
    threads: {
      connectionRecoveryThrottleMs: 1000,       // ⚑ applies from the next `registerSubscriptions()`
    },
  },
}
```

Three things worth noticing.

**Two keys are shared across parents, not nested.** `messagePaginator` backs the channel message list
_and_ thread replies; `messageOperations` backs sends from both. Each has a top-level key carrying what is
common, plus `channel.*` / `thread.*` slices that override it field by field.

**`messageComposer.location.enabled` has no constant default.** It is the channel's server-side
`shared_locations` flag, so it varies per channel type. See [Server authority](#5-the-server-has-the-last-word).

**`stateThrottleMs` differs between the two channel paginators** — 500ms on the message list (so a
burst of WebSocket events coalesces into roughly two renders per second) and unset on pinned messages.

**Two markers above:**

- **⟳ rebuild** — read once when the paginator builds its throttles and debounced query, so the SDK
  routes these through a rebuild method for you. A change takes effect whenever you set it.
- **⚑ construction-only** — read once and never consulted again. See
  [Order matters for a few fields](#order-matters-for-a-few-fields).

### Reading configuration back

Resolved configuration is read the same way everywhere:

| member         | what it is                                     |
| -------------- | ---------------------------------------------- |
| `configState`  | a `StateStore` — subscribe to react to changes |
| `config`       | its current value, typed `Readonly`            |
| `updateConfig` | merge a change in, notifying subscribers       |

```ts
const unsubscribe = channel.messagePaginator.configState.subscribe(({ pageSize }) => {
  // fires immediately with the current value, then on every change
});
```

Every configurable object has all three — `MessageComposer`, every paginator, `MessageOperations`,
`client.notifications`, `client.reminders`, `client.threads`, `client.messageDeliveryReporter`,
`SearchController`, `LiveLocationManager` — with two exceptions:

| entity              | `configState` | `config` | `updateConfig` |
| ------------------- | ------------- | -------- | -------------- |
| everything else     | yes           | yes      | yes            |
| `Channel`, `Thread` | yes           | —        | —              |

`Channel` and `Thread` are deliberately left with the store alone, because **`channel.getConfig()` already
means something else** — it returns the channel _type_'s server-side configuration (`shared_locations`,
`max_message_length`, the command list). A `channel.config` beside it would read as the same thing in getter
form while returning `{ requestHandlers }`, and nothing would catch the confusion: both names resolve, both
return a plausible object. Their instance configuration is one field wide and its only writer wants the store
anyway, so the getter would exist purely to make this table square. Read it as
`channel.configState.getLatestValue()`.

Earlier versions kept several of these in plain objects that changed silently, so a subscriber that had
already read a value never learned it had moved. That is no longer the case anywhere.

**`Readonly` catches the top level only.** It rejects `paginator.config.pageSize = 5` — which would mutate
state while notifying nobody — and points you at `updateConfig`. It does **not** reject a nested write like
`composer.config.text.publishTypingEvents = false`, because `Readonly<T>` is shallow. Runtime freezing covers
that gap, and how far it reaches differs by class:

- **`MessageComposer`** deep-freezes each resolution, so _every_ nested write throws a `TypeError` at the
  offending line. Relying on the frozen package defaults alone was not enough — the resolved value only
  copies subtrees some layer touched, and `location` and `text` are copied on every single resolution
  because the server's restrictions and upper bounds name them, which left the two most-configured subtrees
  writable.
- **Everywhere else** only the package defaults are frozen, so an untouched subtree throws and a copied one
  does not. Mutating a copied subtree still changes state without notifying anyone.

`updateConfig` is the only supported route in both cases.

### Finding out what is configured

`client.config` holds what you **registered**; the objects above hold what they **resolved to**. To
enumerate the former without knowing the keys up front:

```ts
client.config.getTree();
// { messagePaginator: { pageSize: 50 }, client: { notifications: { durations: { error: 10_000 } } } }
```

Custom keys are included. Keys with nothing registered are omitted, so `{}` means nothing is configured
rather than "several empty subtrees". `INSTANCE_CONFIG_TREE_KEYS` is exported if you need the key list
itself.

### Not declaratively configurable

|                                                              | Why                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `paginator.itemIndex`, `createItemIndex`                     | An index instance and a factory, not values. Swapping an index would drop already-loaded items.                           |
| `paginator.doRequest`, `itemOrderComparator`, `deriveCursor` | Installed per paginator subclass. Replace them from a setup function, where the existing value is visible and restorable. |
| `channel.cooldownTimer`                                      | No configuration of its own — derives from the channel's `cooldown` setting and your capabilities.                        |
| `channel.messageReceiptsTracker`                             | Constructor wiring only.                                                                                                  |
| composer middleware executors                                | Ordering and composition, not values. Setup function only.                                                                |

### Objects that need no key at all

`ChannelPaginator`, `SearchController` and the search sources are constructed **by you**, so they already
take options — configure them there.

`ChannelManager` is the exception worth explaining, because the reason changed. The client now builds it
(`client.channelManager`) and passes no options, so construction is not a route you have. It still gets no
key, for a different reason: everything configurable about it is a paginator instance, a handler map or a
resolver function — none of which the declarative tier can carry — and all three have setters:

```ts
client.channelManager.insertPaginator({ paginator });
client.channelManager.setOwnershipResolver(['inbox']);
client.channelManager.setEventHandlers(handlers);
```

From a setup function on the `'client'` key, those run at the right moment automatically:

```ts
client.config.setSetupFunction('client', ({ client }) =>
  client.channelManager.setOwnershipResolver(['inbox']),
);
```

Were it ever to grow a plain-data setting, it would appear at `client.channelManager` — nested under the
key of its only parent, like `client.threads` and `client.messageDelivery`, not as a key of its own.

### Reaching further, from a setup function

Anything the SDK builds internally hangs off one of the four keys, so a setup function can reach it even
when it has no declarative path. You only need this table for tier 2:

| Through             | You can reach                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'channel'`         | `messagePaginator`, `pinnedMessagesPaginator`, `cooldownTimer`, `messageReceiptsTracker`, `messageOperations`, `configState`                           |
| `'thread'`          | `messagePaginator`, `messageComposer`, `messageOperations`, `configState`                                                                              |
| `'messageComposer'` | `attachmentManager`, `textComposer`, `pollComposer`, `linkPreviewsManager`, `locationComposer`, `customDataManager`, and the four middleware executors |
| `'client'`          | `reminders`, `notifications`, `threads`, `polls`, `channelManager`, `messageDeliveryReporter`, `uploadManager`                                         |

---

## 5. The server has the last word

> **Client configuration can only narrow what the server grants. It can never widen it.**

The SDK enforces this in three different ways, and knowing which applies explains what you will observe.

**A merge, re-asserted on every write.** One flag does this: `shared_locations` becomes
`messageComposer.location.enabled`. A feature the server disables cannot be re-enabled from the client — not
declaratively, not from a setup function, and not by calling `composer.updateConfig()` yourself, because the
restriction is re-applied _after_ whatever you asked for (stage 6 of
[how a value is resolved](#3-how-a-value-is-resolved)). A feature you disable is likewise not re-enabled by
the server.

```ts
client.config.set({ messageComposer: { location: { enabled: true } } });
// compiles, applies, and has no effect when the app has `shared_locations` disabled.
```

**This is the one silent no-op in the API.** It cannot be turned into a compile error, because the
restriction is per-app runtime data rather than something the types can know.

The merge itself is `mergeServerRestrictions(requested, restrictions)`, exported from the package. Reading
the restrictions stays the entity's job — only a composer knows that `location.enabled` is gated on
`shared_locations`, and only an existing composer has a channel to ask — but the _rule_ has one
implementation, so a configurable object with its own server-gated field applies it the same way:

```ts
this.configState.partialNext(
  mergeServerRestrictions(requestedConfig, {
    location: { enabled: this.channel.getConfig()?.shared_locations },
  }),
);
```

Call it on **every** route that resolves configuration, not just at construction. A restriction applied
once at construction holds until the first update and then silently stops holding, which is exactly the
defect this rule was extracted from.

**Guards at the point of use.** `typing_events`, `read_events`, `delivery_events`, `url_enrichment` and
the channel's command list are checked where they are used, independently of your configuration — so
those are already safe:

```ts
client.config.set({ messageComposer: { text: { publishTypingEvents: true } } });
// `channel.keystroke()` still emits nothing when the channel type has `typing_events: false`.
```

**A numeric ceiling, applied the same way.** `max_message_length` caps
`messageComposer.text.maxLengthOnSend` and `maxLengthOnEdit`. It _narrows_ rather than replaces, which is a
different rule from the merge above and the reason it is passed separately: a limit you set below the
server's maximum is yours to keep, one above it is lowered, and setting none at all means the server's
maximum is what applies.

```ts
client.config.set({ messageComposer: { text: { maxLengthOnSend: 200 } } });
// stays 200 on a channel type allowing 5000 — asking for less is always allowed.
```

Worth knowing because the default is "no limit": before this, a composer let a message be written that the
send endpoint then rejected. Now the composer refuses it, which is the same limit enforced somewhere you can
show it.

**An async permission check for uploads.** App settings (`image_upload_config` / `file_upload_config`)
gate allowed and blocked file extensions, mime types and size limits, checked per file when it is
uploaded — not through configuration at all.

### Capabilities are a separate axis

`own_capabilities` is per-user, per-channel **authorization**, not configuration. Even when the server
config and your configuration both enable something, the user may lack the capability, and no client
configuration can grant one. Read it from `channel.state.ownCapabilitiesStore` (reactive) rather than
`channel.data.own_capabilities`.

### Requested vs effective

Because the mechanisms differ, reading `config` means different things per feature:

```ts
composer.config.location.enabled; // effective — the server value was merged in
composer.config.linkPreviews.enabled; // requested — the server check lives in the getter
composer.linkPreviewsManager.enabled; // effective (server && requested)
```

The model to hold: **the config store holds what is in force; what you asked for is kept separately and
re-resolved, so reading it back after the server narrows a field does not tell you what you requested.**
For the guarded features, a getter or an explicit check is what tells you the effective answer. When a declarative value is known to be narrowed by the server, the SDK logs it at
debug level so the no-op is at least discoverable.

---

## 6. Custom keys

The key space is open, so a class of your own — or a downstream SDK's — can use the same mechanism.
Augment both interfaces, then wire the class with the exported helper:

```ts
import { applyInstanceConfiguration, type StreamChat } from 'stream-chat';

class MyWidget {
  config = { pollIntervalMs: 5_000, theme: 'light' as 'light' | 'dark' };
  private unsubscribe: () => void;

  constructor(private client: StreamChat) {
    this.unsubscribe = applyInstanceConfiguration({
      args: { widget: this },
      config: client.config,
      key: 'myWidget',
      applyConfig: (next) => Object.assign(this.config, next),
      reinitializeConfig: () => this.initializeConfig(),
    });
  }

  /** Re-derives from current inputs — what `client.config.reset()` calls. */
  initializeConfig() {
    this.config = { pollIntervalMs: 5_000, theme: 'light' };
    Object.assign(this.config, this.client.config.getConfig('myWidget') ?? {});
  }

  destroy() {
    this.unsubscribe();
  }
}

declare module 'stream-chat' {
  interface InstanceSetupFunctionArgs {
    myWidget: { widget: MyWidget };
  }
  interface InstanceConfigTree {
    myWidget: { pollIntervalMs?: number; theme?: 'light' | 'dark' };
  }
}
```

Then configure it exactly like a built-in key:

```ts
client.config.set({ myWidget: { pollIntervalMs: 1_000 } });
client.config.setSetupFunction('myWidget', ({ widget }) => widget.onUpdate(handler));
```

`applyInstanceConfiguration` gives you the same guarantees the built-ins have — immediate application,
teardown before re-apply, error containment — so do not hand-roll the subscription.

**The cost of an open key space:** a typo is a valid custom key. `setSetupFunction('cahnnel', fn)` cannot
be rejected without breaking extensibility, so it silently does nothing. The SDK logs at debug level when
a function is registered for a key that is neither built-in nor has a subscriber. Using `set(tree)`
instead of `setConfig` gives you a compile error for the same mistake.

---

## 7. Resetting

```ts
client.config.reset('channel'); // one key
client.config.reset(); // everything
```

Reset clears the declarative configuration, clears the setup function (running its teardown), and then
has every live instance **re-derive** its configuration.

That last step is not "restore a saved copy". Configuration is _computed_: the composer merges defaults,
then your declarative values, then the channel's server flags; `PinnedMessagePaginator` installs a
request function and two comparators as closures over itself. Re-deriving reproduces all of it, which is
why a reset recovers a known state **even if a setup function's teardown was incomplete** — and why a
reset picks up the server's _current_ configuration rather than whatever it was when the channel was
constructed.

What reset does **not** do is undo setup-function changes made outside the configuration surface —
inserted middleware, added subscriptions, event handlers you registered. The contract is that
**configuration returns to its derived baseline**, not that the object returns to factory state.

It does, however, discard **imperative** configuration changes, because those are not among the inputs
it derives from. That includes `composer.updateConfig(...)` and every sub-composer setter routed through
it — `textComposer.defaultValue`, `attachmentManager.maxNumberOfFilesPerMessage`,
`linkPreviewsManager.enabled`, and so on. If you need such a value to survive a reset, set it
declaratively or re-apply it from a setup function (which runs again after every re-derivation).

There is also no "restore the defaults" constant to reset to, and that is deliberate: an instance's
baseline is its package defaults _plus_ subclass overrides _plus_ constructor options _plus_ the server
merge. Resetting a `PinnedMessagePaginator` to the base paginator defaults would leave it ordering by the
wrong field with no request function at all.

---

## Order matters for a few fields

A handful of options are read once, during construction: a paginator's `unreadReferencePolicy`,
`initialCursor` and `initialOffset`. They are configurable — the SDK passes your declarative
configuration into the constructors — but only for instances built **after** you register it.

```ts
client.config.set({
  channel: { messagePaginator: { unreadReferencePolicy: 'read-state-only' } },
});
const a = client.channel('messaging', 'a'); // ✅ built afterwards — applies
```

```ts
const b = client.channel('messaging', 'b');
client.config.set({
  channel: { messagePaginator: { unreadReferencePolicy: 'read-state-only' } },
});
// ⚠️ `b` already exists; this field cannot apply to it. Logged as a warning.
```

The practical rule is simple: **register your configuration next to `StreamChat.getInstance()`**, before
you open any channels.

This warning is the only one this API emits — the other diagnostics are debug level. It is louder because
it fires only when configuration genuinely did not take effect.

---

## Migrating from the old API

| Before                                       | After                                                   |
| -------------------------------------------- | ------------------------------------------------------- |
| `client.setMessageComposerSetupFunction(fn)` | `client.config.setSetupFunction('messageComposer', fn)` |

That one still works and is marked `@deprecated` — it shipped in v9.9.0, so there is released code to
keep working.

The row worth advertising: **a setup function that only assigns configuration values usually collapses
into one `client.config.set({ … })` call.** Most existing ones exist only because there was no
declarative option.

### Removed outright, not deprecated

Three members that only ever existed on the v10 release-candidate line are **removed**, because a
deprecation exists to keep _released_ code compiling and no stable release ever exposed them:

| Removed                                   | Use instead                               |
| ----------------------------------------- | ----------------------------------------- |
| `client.setInstanceConfigurationFunction` | `client.config.setSetupFunction(key, fn)` |
| `client.instanceConfigurationService`     | `client.config`                           |
| `client.configsStore`                     | `channel.getConfig()`                     |

`client.configs` is also gone — it _did_ ship, but keyed by cid, and it is now keyed by channel type. An
alias would let `client.configs[cid]` return `undefined` instead of failing, so the name was removed to
keep the break loud. Read server channel configuration through `channel.getConfig()`.

`setInstanceConfigurationFunction` is worth a note of its own. It took
`{ StreamChat, Channel, Thread, MessageComposer }`; three of those four keys were stored and never
invoked, so passing them was a silent no-op, and the one that did work (`MessageComposer`) duplicates the
setter above. Replace calls with `client.config.setSetupFunction(key, fn)` using the lowercase keys —
or better, with a declarative `client.config.set({ … })`.

## Configuring the client itself at construction

The `client` key is the one that cannot be configured after the fact — its configuration service is
created inside the `StreamChat` constructor, alongside the managers it configures. Pass a tree through
the constructor when you need `reminders` or `notifications` configured before they are built:

```ts
const client = StreamChat.getInstance(apiKey, {
  config: {
    client: { reminders: { scheduledOffsetsMs: [5 * 60_000] } },
  },
});
```
