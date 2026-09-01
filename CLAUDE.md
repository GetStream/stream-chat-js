# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Companion docs that apply to all agents: `AGENTS.md` (general agent rules) and `CONTRIBUTING.md`. This file captures what is specific or non-obvious to Claude Code on top of those.

## Toolchain

- Node version is pinned in `.nvmrc` (use `nvm use`). `engines.node` requires `>=22.18.0` — the release that unflagged type stripping, which the `.mts` build scripts need. Node 22.12 is a different milestone (`require(esm)`) and is **not** enough to run them.
- Package manager is **Yarn 4 (Berry)**, version pinned via `packageManager` in `package.json` and `yarnPath` in `.yarnrc.yml` (binary committed under `.yarn/releases/`). Any globally installed `yarn` launcher delegates to it. No Corepack setup needed.
- `.yarnrc.yml` enables hardening: `enableHardenedMode: true`, `enableScripts: false`, `npmMinimalAgeGate: 3d`. Lifecycle scripts are blocked by default — only packages allowlisted in `package.json#dependenciesMeta` (currently `esbuild`, `husky`) may run install scripts. If a new dep needs lifecycle scripts, add it to `dependenciesMeta` rather than relaxing the global setting.
- Clean installs (CI and local sanity checks): `yarn install --immutable`.

## Commands

| Task                                    | Command                                  |
| --------------------------------------- | ---------------------------------------- |
| Install                                 | `yarn install --immutable`               |
| Build (types + bundles)                 | `yarn build`                             |
| Watch dev build                         | `yarn start`                             |
| Typecheck only                          | `yarn types`                             |
| Typecheck the build scripts only        | `yarn types:scripts`                     |
| Lint (prettier + eslint, zero warnings) | `yarn lint`                              |
| Auto-fix lint/format                    | `yarn lint-fix`                          |
| Unit tests (Vitest)                     | `yarn test` (alias for `yarn test-unit`) |
| Coverage                                | `yarn test-coverage`                     |
| API response type check (hits live API) | `yarn test-types`                        |

Single test runs use Vitest's CLI directly: `yarn test-unit path/to/file.test.ts`, or filter by name with `yarn test-unit -t 'partial test name'`. Unit tests live in `test/unit/**/*.test.[jt]s` (see `vite.config.ts`). `yarn test-types` is integration-level and requires real Stream credentials — don't run it as part of routine local verification.

`STREAM_LOCAL_TEST_RUN=1` (or `STREAM_LOCAL_TEST_HOST=…`) makes the client point at a local backend; useful when running tests against a local Stream server. See `src/client.ts` constructor.

## Build pipeline

`yarn build` runs two things concurrently:

1. `tsc` — emits **declarations only** (`emitDeclarationOnly: true`) to `dist/types`. `rootDir` is `src/`.
2. `scripts/bundle.mts` (esbuild) — produces bundles for **three entry points**:
   - `index` (the root): `dist/cjs/index.node.js` (Node CJS, externalizes deps + Node builtins), `dist/cjs/index.browser.js` (browser CJS), `dist/esm/index.mjs` (browser ESM)
   - `i18n` (`stream-chat/i18n`): the same three variants, `i18n.node.js` / `i18n.browser.js` / `i18n.mjs`
   - `i18n-codegen` (`stream-chat/i18n/codegen`), built from `codegen/i18n/`: **ESM only, Node only** — one artifact, `dist/esm/i18n-codegen.mjs`. No browser variant because it reads the filesystem; no CJS variant because nothing needs one (it is invoked by a build script, never bundled, never loaded by a test runner). The CJS flavours of the other two entries exist for React Native's Jest, which loads the _runtime_ in CJS; the generator never enters that path.

   After building, `assertBundleBoundaries` reads esbuild's `metafile` and fails the build if an entry reached something it must not (see the i18n section). Adding a new entry point without declaring its boundary in `ENTRY_BOUNDARIES` is itself an error.

`package.json#exports` routes consumers to the right bundle by condition: `node` → node-cjs, `browser`/`react-native` → browser-cjs (require) or esm (import), default → esm. The `react-native` + `require` branch must stay pointed at CJS — React Native's Jest runs CJS with `customConditions: ["react-native"]` and does not transform `node_modules`, so an `.mjs` there is a syntax error across every RN suite that touches the module. `typesVersions` mirrors the subpaths for consumers still on `moduleResolution: "node"`. There is **no `package.json#browser` field** — it used to zero Node-only deps (`crypto`, `https`, `jsonwebtoken`, `ws`, `zlib`) for browser/RN builds, but the SDK no longer imports any of them (`src/index.ts` is platform-agnostic: global `WebSocket`, global `FormData`, global `atob`). `scripts/bundle.mts` keeps a `browserIgnoreModules` hook, currently an empty array, for the day that changes. Prefer a platform global or a browser-safe dep over reintroducing a Node-only one.

esbuild `define` injects two compile-time constants: `process.env.PKG_VERSION` (read from `package.json`) and `process.env.CLIENT_BUNDLE` (one of `node-cjs`, `browser-cjs`, `browser-esm`). Both are consumed by `StreamChat.getUserAgent()` to produce a bundle-aware UA string. **`tsc`-only code paths do not get this substitution** — these env vars only resolve in the esbuild bundles, so don't gate runtime logic on them in code that callers might import directly via `src/`.

`postinstall` installs husky hooks; `prepare` runs `yarn run build` (so consumers installing from a git ref get a built package).

**The build scripts are `.mts`, run by `node` with no loader** — Node strips the types itself, which is unflagged from **22.18.0** (and 24.3.0 on the 24 line; 23.6.0 on the 23 line). `engines.node` is set to that floor deliberately, because `prepare` runs `yarn build`: a **git-ref** install has to be able to execute these scripts. Registry installs never run the build — they get the prebuilt `dist/`.

Three separate things cover `scripts/`, and each was scoped to miss it at some point:

- **Types:** `tsconfig.scripts.json`, run by `yarn types:scripts` and folded into `yarn types`. Without it `.mts` annotations are stripped but never checked, which is worse than the JSDoc `@type` comments they replaced.
- **Format:** the `yarn prettier` glob had to gain `mts` — it listed `js,mjs,ts` only, so every `.mts` in the repo silently escaped the format gate.
- **Lint:** `eslint.config.mjs`'s rule blocks list `scripts/**/*.mts` alongside `src/**` and `codegen/**`. Turning this on found `generate-filter-types.mts` importing `yaml` while nothing declared it — it resolved only because `lint-staged` happens to depend on it. `.lintstagedrc.json` has its **own** globs, which also omitted `mts`; both are widened, and note the eslint entry runs with `--max-warnings 0`, so a file matching no config block fails the hook with "no matching configuration was supplied" rather than passing silently.

## Architecture

This is a single-package SDK with **no monorepo**. The public surface is everything re-exported from `src/index.ts` — treat additions there as public API and follow semver carefully (downstream React/Angular/RN SDKs depend on it).

### Module map of `src/`

- **`client.ts` — `StreamChat` facade.** ~5k-line class. Prefer `StreamChat.getInstance(key, secret?, options?)` — the constructor exists for advanced uses but `getInstance` is what `connectUser` warnings and most docs assume. Owns: the axios instance, WS connection lifecycle, `TokenManager`, and a registry of subsystem managers (`threads`, `polls`, `notifications`, `reminders`, `moderation`, `uploadManager`, `messageDeliveryReporter`, plus an optional `offlineDb` injected via `setOfflineDBApi`). New REST endpoints are added here as methods that call `axiosInstance` and return a type from `types.ts`.
- **`channel.ts` (~2.5k lines) + `channel_state.ts` (~1.1k) + `channel_batch_updater.ts`** — per-channel object and its in-memory state. **Messages are NOT stored on `channel.state`.** The message list, thread replies, and pinned messages each live in a paginator — `channel.messagePaginator`, `thread.messagePaginator`, and `channel.pinnedMessagesPaginator` — which are the single source of truth (interval storage + a canonical `ItemIndex`). Read them via `channel.messagePaginator.state.items` / `.getItem(id)` / `.headmostItem` (newest loaded item), and mutate via the paginator (`ingestItem` / `removeItem`), never a legacy `channel.state.addMessageSorted()` / `state.messages` (removed). `channel.state.last_message_at` was **removed**; the channel's latest-message timestamp lives on `channel.messagePaginator.lastMessageAt` (its `aggregateState` store — seeded from `ChannelResponse.last_message_at`, then advanced monotonically as messages are ingested). See `docs/breaking-changes-v14-v15.md`.
- **`ChannelManager.ts`** — channel _lists_. Holds one or more `ChannelPaginator`s (`state.paginators`), keeps them in sync with WS events through an `EventHandlerPipeline` per event type, and arbitrates ownership when a channel matches several lists (`ownershipResolver` / `createPriorityOwnershipResolver`). Replaced the old `channel_manager.ts` (single hand-sorted `state.channels` list with named handler overrides) in v10 — see `v9-to-v10-migration-guide-methods.md`. Filtering and ordering are the paginator's job: `matchesFilter()` runs the filter compiler over `Channel` field resolvers and ordering comes from a comparator compiled from `sort`. The manager is instantiated by the `StreamChat` constructor and lives as long as the client (`client.channelManager`) — it is not configurable through the client options; register lists with `insertPaginator({ paginator, index? })`, detach them with `removePaginator(paginatorOrId)` and set cross-list ownership with `setOwnershipResolver(resolverOrPriorityIds?)`. `setPaginators(paginators)` is the primitive the other two build on — use it (or `clearPaginators()`) for batches, since it publishes one state update instead of one per paginator, and skips the update entirely when the set is unchanged. Registration and loaded data have different owners: `disconnectUser` calls `resetPaginatorStates()`, which discards each list's channels (they belong to the user going away) while leaving the lists themselves registered, since which lists exist is the integrator's configuration. Event handling stays customizable: `ChannelManagerOptions.eventHandlers` replaces the default map wholesale at construction (start from `getDefaultHandlers()` to enrich it instead), and `addEventHandler` / `setEventHandlers` / `removeEventHandlers` adjust the pipelines afterwards — which is the only route for `client.channelManager`, since the client constructs it without options. The exported `ignoreEventsForUnknownChannels` handler, inserted at `index: 0`, is how a list opts out of pulling in channels it has not loaded.
- **`connection.ts` (`StableWSConnection`)** — realtime transport, and the only one: the long-poll fallback (`connection_fallback.ts`, `enableWSFallback`, `transport.changed`) was removed in v10. It connects to `/api/v2/connect`, which authenticates off the **first frame the client sends** (`client._buildWSAuthMessage()`) rather than the query string, and answers with a `connection.ok` hello event instead of v1's `health.check`. It runs its own 25s ping / 35s health-check loop and reconnects on close/error/offline events, emitting `connection.changed` into the client's local event bus. `connection.ok` is not in the OpenAPI spec yet, so its type is hand-written in `types.ts` and decoded through a shim in `connection.ts` — both are marked for deletion once the backend publishes the event.
- **`store.ts` — `StateStore`.** Reactive primitive (see "State and subscription patterns" below).
- **`signing.ts` — one function, `UserFromToken`.** Decodes a JWT payload with the global `atob` and returns `user_id`. Everything else this module used to hold was server-side (JWT minting via `jsonwebtoken`, webhook/SQS/SNS verification via `crypto` + `zlib`) and was removed along with those deps — see `v9-to-v10-migration-guide-server-side.md`. Do not reintroduce secret-holding or HMAC code here; that surface lives in `@stream-io/node-sdk`.
- **`middleware.ts`** — `MiddlewareExecutor` (see "Middleware pipelines" below). Used by composer pipelines, not by client request lifecycle.
- **`token_manager.ts`** — handles static tokens and async token providers. Tracks a `loadTokenPromise` so concurrent calls await the same fetch. The constructor takes no arguments: there is no `secret` and no local JWT signing — every token comes from the caller (a string or a `TokenProvider`). Anonymous users may have no token at all; anyone else without one now fails at `getToken()` rather than at `setTokenOrProvider()`.
- **Event types.** There is no `events.ts` / `EVENT_MAP` any more (removed in v10). Wire events come from the generated `WSEvent` union (`src/gen/models`) so adding one means regenerating rather than hand-editing. There is no runtime decoder layer any more: `--opt response_dates_as_number` types every server-sent date as the unix-nanosecond number the wire already carries, so `src/gen/model-decoders/` (including `event-decoder-mapping.ts`) is no longer emitted at all, and `src/connection.ts` decodes frames with a plain cast. `src/types.ts` overlays two non-generated members onto the public `Event` union: `LocalEvent` — `channels.queried`, `connection.changed`, `connection.recovered`, `capabilities.changed`, `message.read_locally`, `offline_reactions.queried`, `live_location_sharing.*`, all dispatched client-side only and never received over the wire — and `ConnectedEvent` (`connection.ok`), which _is_ a wire event but is not published in the OpenAPI spec yet.
- **`insights.ts` — `InsightMetrics` + `postInsights`.** WS-health telemetry sent to `https://chat-insights.getstream.io`. This is internal; do not call from end-user code paths. The fields captured by `buildWsBaseInsight` include token and connection metadata — treat changes here as security-sensitive.
- **`uploadManager.ts` / `LiveLocationManager.ts` / `CooldownTimer.ts`** — feature controllers, each owns its own `StateStore` slice.
- **Domain subsystems** (each a folder with its own `index.ts` barrel):
  - `messageComposer/` — biggest subsystem (≈3.5k lines). Composer + sub-composers (text, attachment, link previews, poll, location, custom-data) wired together by `MessageComposer` and driven by the middleware executor. Composition can target a `Channel`, `Thread`, or an existing local message (edit flow). Server-side composer config from `getConfig()` is merged on top of `DEFAULT_COMPOSER_CONFIG` via `mergeServerRestrictions` (`src/configuration/serverAuthority.ts`), which prevents enabling features the server has disabled and is re-applied on every route that resolves configuration, not only at construction.
  - `messageDelivery/` — `MessageDeliveryReporter` (instance on the client) and `MessageReceiptsTracker` (per-channel sorted-by-timestamp tracker for delivered/read receipts; uses binary search over twin sorted arrays).
  - `notifications/` — toast-style `NotificationManager` (severities `error`/`warning`/`info`/`success`, configurable durations and sort comparator). Default instance is created by the client; pass `options.notifications` to provide your own.
  - `offline-support/` — `AbstractOfflineDB` is **abstract**. Mobile/RN SDKs inject a concrete implementation via `client.setOfflineDBApi(...)`. The `OfflineDBSyncManager` reconciles pending tasks on reconnect. Don't take it as a built-in feature of this package — it's an injection point with no default impl here.
  - `pagination/` — `BasePaginator` (cursor-or-offset, debounced, exposes `state: StateStore<PaginatorState>`), plus `FilterBuilder` and `ReminderPaginator`.
  - `reminders/` — `Reminder`, `ReminderManager`, `ReminderTimer` (scheduled-offset reminders with debounced refresh).
  - `search/` — `BaseSearchSource` + concrete `MessageSearchSource`, `ChannelSearchSource`, `UserSearchSource` orchestrated by `SearchController`.
  - `i18n/` — the translation layer shared by the React and React Native SDKs. **Not exported from `src/index.ts`** — see the i18n section below.
  - the build-time translation-catalog generator is **not here** — it lives at `codegen/i18n/`, outside `src/` entirely, so the runtime layer physically cannot reach `node:fs`. See the i18n section.
- Top-level subsystem files: `poll`, `poll_manager`, `thread`, `thread_manager`, `moderation`, `campaign`, `segment`, `permissions`.
- **`types.ts` (~5k lines) + `custom_types.ts` + `types.utility.ts`** — public type surface. **Custom data is extended via module augmentation on the `Custom*Data` interfaces in `custom_types.ts`** (generics were removed in v9; see README). When adding a field that callers may want to extend, expose it through a `Custom*Data` interface rather than reintroducing a generic.

### State and subscription patterns

Most subsystems share two small abstractions; using them keeps integrations behaving consistently.

**`StateStore<T>` (`src/store.ts`)** is the reactive primitive. Key semantics that surprise newcomers:

- `subscribe(handler)` fires the handler synchronously once with the current value before returning the unsubscribe. Treat first-call as initial state, not as a change event.
- `next(valueOrPatch)` is no-op when the new reference equals the old (`===`). To force a change, return a new object from your patch function.
- `subscribeWithSelector(selector, handler)` is shallow-comparing on the selected object's own keys — selectors should return small flat objects (or tuples), not deeply nested ones.
- `addPreprocessor(fn)` runs **before** subscribers are notified and can mutate the next value (used for clamps/derivations). Order is registration order.
- `MergedStateStore` combines two stores with non-overlapping keys; mutators on the merged store warn and no-op — you must call `original.next` / `merged.next` instead.

**`WithSubscriptions` (`src/utils/WithSubscriptions.ts`)** is the ref-counted base class for managers. Every long-lived manager — `ChannelManager`, `ThreadManager`, `PollManager`, `ReminderManager`, `MessageComposer`, `LiveLocationManager`, `CooldownTimer`, `Thread` — extends it. Pattern:

- Call `registerSubscriptions()` to start listening to client/WS events; each subscribe-call's unsubscribe is stashed via `addUnsubscribeFunction`.
- `registerSubscriptions()` must be idempotent — guard with `if (this.hasSubscriptions) return;`.
- `unregisterSubscriptions()` is ref-counted via `incrementRefCount()`; the last `unregister` runs all cleanups. When overriding it, return `super.unregisterSubscriptions()` so the symbol propagates and the ref-count decrements correctly.
- Components that hold a reference to a manager should call `registerSubscriptions` on mount and `unregisterSubscriptions` on unmount; multiple consumers sharing one manager are the reason it's ref-counted.

### Middleware pipelines

`MiddlewareExecutor<TValue, THandlers>` (`src/middleware.ts`) is a small async middleware framework used by `MessageComposer` for: composition, draft composition, text composition, and poll composition. Each middleware has an `id` and a handler map keyed by event name; handlers receive `{ state, next, complete, discard, forward }`:

- `next(state)` — continue with mutated state.
- `complete(state)` — short-circuit, marking the chain `complete`.
- `discard()` — short-circuit, marking the chain `discard` (caller treats output as canceled).
- `forward()` — continue without mutating state.

Execution defaults to `mode: 'cancelable'` — a re-entry on the same `eventName` cancels the in-flight chain via `withCancellation`. Use `mode: 'concurrent'` only when reentrancy is genuinely safe. Middleware can be reordered via `use` / `insert({ position: { after | before } })` / `replace` / `setOrder` / `remove`. When extending composer behavior, prefer inserting middleware over forking the executor.

### Concurrency primitives

`src/utils/concurrency.ts` exposes two tag-keyed runners that solve recurring problems in this codebase:

- **`withoutConcurrency(tag, cb)`** — serializes async functions with the same tag; different tags run in parallel. Use when actions must not interleave (e.g., DB writes for a single channel).
- **`withCancellation(tag, cb)`** — same serialization, but scheduling a new action **aborts** in-flight ones. `cb` receives an `AbortSignal` and is responsible for honoring it. Returns `'canceled'` if the function never started. Used by `MiddlewareExecutor` and offline replay.

Both share a process-wide `pendingPromises` map; reuse the helpers rather than rolling your own promise chains. `settled(tag)` and `hasPending(tag)` are available when you need to coordinate around in-flight work.

### Client lifecycle

The canonical flow is:

1. `client = StreamChat.getInstance(key, secret?, options?)` — second call with the same key returns the cached instance (this matters: a new `new StreamChat(...)` would open a second WS connection).
2. `await client.connectUser(user, tokenOrProvider)` — sets the user, primes the `TokenManager`, opens WS. Calling it a second time with the **same** user logs a warning and returns the existing promise; calling it with a **different** user throws unless `disconnectUser()` ran first.
3. `client.openConnection()` / `client.closeConnection()` — manage the WS without clearing the user (useful for mobile foreground/background transitions).
4. `client.disconnectUser(timeout?)` — full teardown.

Aliases to be aware of: `setUser` → `connectUser`, `disconnect` → `disconnectUser`. Both are deprecated but still present; new code should use the long names. Server-side use (no `window`, or `secret` provided) prints a warning unless `options.allowServerSideConnect: true` is set.

## i18n

`src/i18n/` holds the translation runtime shared by `stream-chat-react` and
`stream-chat-react-native` — one `Streami18n`, one set of formatters, one date layer. Before this, both
SDKs carried ~1,300 lines of near-duplicate runtime plus a duplicated codegen. See
`specs/i18n-to-core/` for the initiative and `v9-to-v10-migration-guide-i18n.md` for the consumer delta.

**Three entry points, and the boundaries between them are enforced by the build.** `src/index.ts` must
**never** `export * from './i18n'` — that is the one reflex to resist. `scripts/bundle.mts` asserts from
esbuild's metafile that the root bundle cannot reach `src/i18n/`, `i18next` or `dayjs`, and that
`src/i18n/` cannot reach the Node-only `codegen/`. Both leaks fail invisibly (everything works, the
bundle is just bigger), which is why they are machine-checked. `dist/esm/index.mjs` is expected to stay
byte-identical when only i18n changes.

**The generator lives at `codegen/i18n/`, outside `src/`.** It is Node-only build tooling that reads the
filesystem — the one thing the SDK's own source must never do — so it is not library source, even though
it _is_ published (two other repos import `stream-chat/i18n/codegen` from their build scripts). Being
outside the library tsconfig is what makes the boundary type-enforced: an import from `src/i18n/` fails
at `tsc` before the metafile assertion ever runs, though the error is an oblique TS6059 "not under
rootDir" rather than something self-explanatory.

Three things are scoped to `src/` by default and had to be widened for it — check all three if you ever
add another directory beside it, because each fails silently:

- `tsconfig.codegen.json` emits its declarations to `dist/types/i18n-codegen/`, where `exports` and
  `typesVersions` point. `rootDir` must stay `./codegen/i18n` or that path shifts.
- `yarn types` runs **both** projects; `yarn build` runs both `tsc` invocations.
- `eslint.config.mjs` rule blocks list `codegen/**/*.{js,ts}` alongside `src/**/*.{js,ts}`. Without it
  the generator inherits no rules at all.

- **`stream-chat/i18n`** — `Streami18n`, three formatters, `getDateString`, catalog-generic type helpers,
  `TranslationBuilder`, generated `LANGUAGE_NAMES`.
- **`stream-chat/i18n/codegen`** — the catalog generator. `typescript` is **injected** via config, never
  imported, so core does not depend on the compiler.

Things that will bite:

- **Core ships no catalog.** Each UI SDK generates its own `keys.ts` from its `t()` call sites, so the
  type helpers are generic over it (`StreamTFunctionFor<Catalog, Bundled>`). `Bundled` **must** default
  to `never`; defaulting to `string` silently disables all key checking.
- **`runtimeDefaults` is a constructor option**, not an import — the catalog belongs to the UI layer. It
  is layered under _every_ language, which is what stops a partial dictionary from knocking out formatter
  keys. That is guarantee G1 in `test/unit/i18n/Streami18nGuarantees.test.ts`, which is the acceptance
  contract for this module: three behavioural guarantees, each written against a real bug.
- **The layering itself lives in `TranslationStore`**, not in `Streami18n` — it needs neither i18next nor
  dayjs, so it is tested directly (`test/unit/i18n/TranslationStore.test.ts`) rather than only through an
  initialized instance. The store holds flat dictionaries; `Streami18n` adapts them to i18next's nested
  `resources` shape, so nothing in the store has to know about namespaces.
- **No module-scope side effects.** Every `Dayjs.extend` goes through `ensureDayjsPlugins()`. This is
  what makes `sideEffects: false` accurate — do not reintroduce a top-level `extend` or locale import.
- **`durationFormatter` must use the date library's `.duration()`**, not parse the value as a timestamp.
  Parsing reads `600000` as ten minutes past the epoch and renders "57 years ago". This is why
  `DateTimeParser` is the _module_, not a parse function.
- **i18next post-processing is global.** A `TranslationTopic` is invoked for every key and must pass
  through calls it does not recognize, or it silently rewrites unrelated copy.
- **Vitest forces `TZ=UTC`** (`vite.config.ts`). Date assertions are timezone-sensitive; without it a
  local run disagrees with CI by the host's offset.
- Notification identity lives in `src/notifications/types.ts` (`CORE_NOTIFICATION_TYPE`). Emit through
  the map, never a raw literal — a test enforces both that and the reverse (every declared identifier
  must actually be emitted, so a dead one cannot linger).

## Conventions to preserve

- ESLint uses the flat config (`eslint.config.mjs`); `yarn eslint` runs with `--max-warnings 0`. The pre-commit hook (`.husky/pre-commit` → `lint-staged`) enforces this on staged files. Don't disable rules broadly — scope and justify any `eslint-disable`.
- `@typescript-eslint/consistent-type-imports` is enabled — use `import type` for type-only imports.
- `@typescript-eslint/no-non-null-assertion` is **error** — never use `foo!`.
- `sort-imports` is on with `ignoreDeclarationSort: true` and `ignoreCase: true` — declaration order is free, but **named-member order within an import is enforced**. Prettier handles the rest of formatting.
- `import/no-extraneous-dependencies` is **error** for `peerDependencies: false` and `optionalDependencies: false`. Don't add peer/optional deps as runtime imports.
- Use the in-repo `mergeWith` (`src/utils/mergeWith/`) for deep merges (config merging in composer/notifications etc.). Don't pull in lodash.
- Conventional Commits are enforced via commitlint on `commit-msg`. Releases are automated via semantic-release (`.releaserc.json`) from commit messages — **never bump the version manually**. The release config additionally promotes `chore(deps)` and `refactor` to **patch** releases (not no-op).
- The Vitest config sets `restoreMocks: true` to restore Jest/Vitest-3-style spy behavior under Vitest 4 (each `vi.spyOn` resets between tests). Don't rely on accumulated spy state across tests.
- `dangerouslyIgnoreUnhandledErrors: true` is set in `vite.config.ts` — assertions on rejected promises must be explicit; don't rely on unhandled-rejection failure.

## Tests

Tests live in `test/unit/**/*.test.[jt]s` (mixed JS/TS — both are accepted). Helper conventions:

- `test/unit/test-utils/` contains `getClient`, generators (`generateChannel`, `generateMessage`, `generateMember`, `generateUser`, `generateThreadResponse`, `generateMessageDraft`, …), and `mockChannelQueryResponse`. **`getClientWithUser` monkey-patches `connectUser` to set the user without opening a WS connection** — mirror this pattern in new tests rather than mocking axios end-to-end.
- `MockOfflineDB` lives in `test/unit/offline-support/` for tests that need an `AbstractOfflineDB` implementation.
- `yarn test-types` is a separate Node script (`test/typescript/index.js`) that calls real Stream endpoints and writes a `data.ts` file whose types are then checked by `tsc`. It needs `API_KEY` / `API_SECRET` (and multitenancy variants) in env — the CI workflow `type.yml` injects them from GitHub secrets. Skip locally unless you have credentials.

## Release & CI

GitHub workflows in `.github/workflows/`:

| Workflow             | Trigger             | What it runs                                                   |
| -------------------- | ------------------- | -------------------------------------------------------------- |
| `lint.yml`           | PR                  | `yarn lint`                                                    |
| `unit.yml`           | PR                  | `yarn test-coverage`                                           |
| `type.yml`           | PR                  | `yarn test-types` (needs live-API secrets)                     |
| `size.yml`           | PR (excludes tests) | `preactjs/compressed-size-action` — reports bundle-size diff   |
| `pr-check.yml`       | PR title change     | `commitlint` on the PR title                                   |
| `scheduled_test.yml` | Cron                | Periodic regression                                            |
| `release.yml`        | `workflow_dispatch` | `yarn semantic-release` (with `HUSKY=0`, OIDC, npm provenance) |

Bundle-size CI **runs on every non-test PR** — be mindful that adding heavy dependencies will be visible in the PR check. CI installs use `yarn install --immutable` via `.github/actions/setup-node` (which caches `.yarn/cache` keyed on `yarn.lock`).

Release branches (`.releaserc.json`):

- `master` → `latest` dist-tag (current major: v9).
- `release-v8` → `v8` dist-tag, locked to `8.x` range.
- `release-v10` → `rc` dist-tag, `prerelease: "rc"`. **This is the branch v10 prereleases are cut
  from** — not a branch literally named `rc`. `release.yml` is `workflow_dispatch` and releases from
  whatever branch you dispatch it on, gated by
  `startsWith(github.ref_name, 'release')`, so a v10 change has to land on `release-v10` before it can
  reach npm. The `rc` name survives only as a legacy allowance in that gate.

Unlike the React and React Native repos, the PR workflows here (`lint`, `unit`, `type`, `size`) carry
**no branch filter**, so a PR into `release-v10` is fully gated with no workflow change needed.

## Things to double-check before claiming done

- `yarn lint` clean (zero warnings).
- `yarn types` passes.
- `yarn test` green.
- If you touched `src/index.ts` or any re-exported type, you've considered the public-API/semver impact.
- If you added a dependency: it doesn't need to run lifecycle scripts (or is added to `dependenciesMeta`), and it is not Node-only — the SDK is client-side only and carries no `package.json#browser` shim list anymore, so a Node-only import would break browser/RN bundles outright.
- If you added a new event type, it comes from regenerating `src/gen` — or, if it is not in the OpenAPI spec yet, from the hand-written overlay on the `Event` union in `src/types.ts` plus a decoder shim (see `ConnectedEvent` / `connection.ok` for the pattern, including its removal note).
- If you extended composer behavior, you inserted middleware rather than forking `MessageComposerMiddlewareExecutor`.
- If you added long-lived subscriptions on a manager, `registerSubscriptions` is idempotent and `unregisterSubscriptions` calls `super`.
