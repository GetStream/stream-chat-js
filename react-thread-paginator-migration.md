# stream-chat-react: moving to the new thread manager and `ThreadPaginator`

A guideline for `release-v15`. The LLC side is `feat/thread-paginator`, and the full API delta is in
`v9-to-v10-migration-guide-other.md`. SCRN is already migrated and can serve as a reference (`Channel.tsx`,
`Thread.tsx`, `ThreadList.tsx`, `ThreadListUnreadBanner.tsx`). Everything below was checked against React's
`release-v15` as it is now.

## The new model, in short

- `client.threads` keeps **one store of live threads**: every listed thread plus every opened one, one instance per
  id. `client.threads.get(id)` resolves any of them.
- The thread list is **`client.threads.paginator`** (a `ThreadPaginator`), with a normal paginator state: `items`,
  `isLoading`, `hasMoreTail`, `lastQueryError`. Server order, no client-side sort.
- **An opened thread stays live without being in the list.** It's registered by `client.threads.ensure(...)`, or by
  its first `thread.activate()`, and stays subscribed for the session. Nothing has to "adopt" it into the list any
  more.
- **`client.threads.ensure({ channel, parentMessage })`** is how to get a thread to open. It returns the stored
  instance, or builds one and registers it straight away. A thread it builds starts `isStateStale`, so it loads its
  data once when first opened.
- **`client.getThreadAndHydrate()` still returns a new instance** built from the response (with up to 3 replies). It
  doesn't look in the store, so callers have to prefer an existing instance (see `viewReplyInThread` below).
- `client.threads.activate()` / `deactivate()` still exist. Activating reloads the list when it needs it: first load,
  unseen threads, or stale order.
- **Threads don't listen to the client any more.** `client.threads.registerSubscriptions()` routes each event by id to
  the stored thread it belongs to, as `PollManager` does for polls. A `Thread` that isn't in the store gets no events,
  and `thread.registerSubscriptions()` on its own covers only its state subscriptions.
- **A thread goes stale when its channel's `watchStatus` goes to `NotWatching`** (e.g. `channel.stopWatching()`), not
  on `user.watching.stop`. A dropped connection is handled by connection recovery. Thread queries sent with
  `watch: true` (`getThreadAndHydrate`, `queryThreadsAndHydrate`) now set the channel to `Watching`.

## API mapping

| `release-v15` today                                                    | Now                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `client.threads.state.threads`                                         | `client.threads.paginator.state.items ?? []`                                          |
| `state.ready`                                                          | `paginator.state.items !== undefined`                                                 |
| `state.pagination.isLoading` (first load)                              | `paginator.isLoading && !items?.length`                                               |
| `state.pagination.isLoadingNext`                                       | `paginator.isLoading && items.length > 0`                                             |
| `state.pagination.isLoading` during a reload of a loaded list          | no public flag: the list stays as it is (track the `reload()` promise if you need it) |
| `state.pagination.nextCursor`                                          | `paginator.state.hasMoreTail`                                                         |
| `client.threads.loadNextPage()`                                        | `client.threads.paginator.toTail()`                                                   |
| `client.threads.queryThreads()`                                        | `client.queryThreadsAndHydrate()` for one-off queries                                 |
| `client.threads.threadsById[id]`                                       | `client.threads.get(id)`; `paginator.getItem(id)` for "is it in the list"             |
| `threadsById[id] ?? new Thread(...)`                                   | `client.threads.ensure({ channel, parentMessage })`                                   |
| `unseenThreadIds`, `isThreadOrderStale`, `unreadThreadCount`, `active` | unchanged, still on `client.threads.state`                                            |

## Where React needs changes

**`ThreadList.tsx`: `useThreadList` and `ThreadList`**

- Drop the manual reset on mount (`pagination`, `ready`, `threads`, `unseenThreadIds`). It existed so the first request
  used the default page size. `reload()` now sizes itself as `min(loaded + unseen, pageSize)`, so it's no longer
  needed.
- Keep the activate / deactivate on visibility and unmount. Activation reloads when the list needs it. If React wants
  a fresh list on every mount, as it does today, keep `client.threads.reload({ force: true })`, but without the
  reset.
- Read from `client.threads.paginator.state` (`items`, `isLoading`) instead of `client.threads.state`.
- `atBottomStateChange` should call `client.threads.paginator.toTail()`. It does nothing until the first load
  succeeds, and nothing once there are no more pages.
- Show the loading placeholder only on the first load (`isLoading && !threads.length`). A reload of a loaded list keeps
  the threads until the new ones land, and a failed reload keeps them.

**`ThreadListLoadingIndicator.tsx`**

- `pagination.isLoadingNext` becomes `paginator.isLoading && items.length > 0`, read from `paginator.state`.

**`ThreadListUnseenThreadsBanner.tsx`**

- Its `isLoading` comes from `pagination.isLoading`, which doesn't exist any more. A reload of a loaded list sets no
  public flag, so keep a local pending state around `await client.threads.reload()` for the "Loading..." look and the
  `disabled`.
- `unseenThreadIds` stays on `client.threads.state`. It's cleared only when the reload succeeds, so a failed reload
  keeps the banner.

**`useThreadHighlighting.ts`**

- The `threads` subscription moves to `threadManager.paginator.state` → `items ?? []`. The `unseenThreadIds` half stays
  as it is.
- The two now live in different stores, but the hook already remembers ids as they're reported, so the order the
  updates land in doesn't matter.

**`Thread.tsx`**

- Remove `isThreadManaged` (the `threads.some(...)` selector) and the effect that prepends the open thread into
  `client.threads.state.threads`. The list belongs to the paginator now, and an opened thread stays live without it.
- Keep the "reload while `isStateStale`" effect, and make it **the only load trigger**. Also remove the "load an
  unmanaged thread with no replies" effect:
  - a thread built by `ensure()` starts stale, so the stale effect loads it;
  - with both effects in place, they'd both call `thread.reload()` in the same render, a double fetch. SCRN had exactly
    this (F3), and fixed it by skipping the load while a reload is in flight.
  - listed threads and `getThreadAndHydrate()` threads arrive with replies already, so neither effect fires for them.
- Update the doc comment: `<Thread>` no longer registers the thread with the manager. `ensure()` or `activate()` does.

**`createThreadEntityBinding` (`plugins/SlotLayout/ChatViewNavigationContext.tsx`)**

- Replace `threadsById[id] ?? new Thread({ ... })` with `client.threads.ensure({ channel, parentMessage })`.
- This matters beyond dedupe. `useActiveThread` only activates the active slot's thread, so a thread opened beside
  another one (ctrl/⌘-click) is never activated. `ensure()` registers it on creation, so it stays live anyway.

**`viewReplyInThread` (`Message/hooks/useMessageAlsoSentInChannelNavigation.ts`)**

- `threadsById[parentId]` becomes `client.threads.get(parentId)`.
- After `await client.getThreadAndHydrate(...)`, prefer an instance that was registered in the meantime:
  `client.threads.get(parentId) ?? fetched`. Otherwise a list query landing during the request leaves two instances.
  Activating the second one is refused with a warning, and it stays unsubscribed.

**`useThreadManagerState` (public hook)**

- It has no internal callers, but it's exported: integrator selectors that read `threads`, `pagination` or `ready`
  break. Worth a note in React's migration guide, and possibly a matching hook for `paginator.state`.

**No change needed**

- `useChat`: `client.threads.registerSubscriptions()` / `unregisterSubscriptions()`. This is now also what delivers
  thread events, so it has to stay mounted for as long as threads are shown.
- Nothing in React calls `thread.registerSubscriptions()` directly or handles `user.watching.*` for threads, so the
  routing and `watchStatus` changes need no code changes.
- `useActiveThread` / `useCloseThread`: `thread.activate()` / `deactivate()`. `deactivate()` only flips `active`; the
  thread stays registered.
- `ChatViewThreadsSelectorButton`: `unreadThreadCount` is still on `client.threads.state`.
- Thread reads: React doesn't call `markRead` on thread open, and the LLC auto-reads the active thread. Don't add an
  explicit one, because that sends two reads (SCRN's F8).

## Behaviour to keep in mind

- A reply to a listed thread sets `isThreadOrderStale`. A reply to an unlisted one, including a thread that's open but
  not listed, adds to `unseenThreadIds`. Same as `master`.
- Reopening a thread that's still registered makes no request, unless it went stale (for example after a reconnect).
- A thread whose channel is deleted, or which the user is removed from, is released automatically. So is everything on
  `disconnectUser()`. The UI needs no handler.
- `paginator.items === undefined` means "not loaded yet". `isInitialized` is not the same thing: a failed first query
  also sets it.

## Don't

- Don't write threads into the manager's state or the list yourself.
- Don't construct `Thread` to open one; use `ensure()` (and prefer `get()` after any `await`). A thread outside the
  store gets no events.
- Don't look threads up in `paginator.items`, which covers the list only; use `client.threads.get(id)`.
- Don't reset the manager's state on mount. `resetState()` is teardown, and runs on `disconnectUser()`.

## Tests to update

These four seed or read the old shape:

- `Threads/ThreadList/__tests__/ThreadList.test.tsx`
- `Threads/ThreadList/__tests__/useThreadHighlighting.test.ts`
- `Thread/__tests__/Thread.test.tsx`
- `Message/hooks/__tests__/useMessageAlsoSentInChannelNavigation.test.tsx`

How to update them:

- Seed the list through the paginator (`paginator.state.partialNext({ items })`, or a mocked `queryThreads` response),
  not `client.threads.state.threads`.
- An opened thread should be found with `client.threads.get(id)`, while `paginator.getItem(id)` stays `undefined`.
- A test that dispatches client events at a thread needs `client.threads.registerSubscriptions()` and the thread in
  the store (`ensure()`, `activate()` or a list query). No current React test relies on the old per-thread listeners.

Cases worth adding:

- a failed reload keeps the list and the banner;
- the loading placeholder shows on the first load only;
- `ensure()` returns the listed instance;
- a thread built by `ensure()` loads exactly once when opened;
- reopening doesn't fetch;
- `viewReplyInThread` reuses an instance registered while `getThreadAndHydrate` was in flight.
