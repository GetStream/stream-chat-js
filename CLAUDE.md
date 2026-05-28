# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Companion docs that apply to all agents: `AGENTS.md` (general agent rules) and `CONTRIBUTING.md`. This file captures what is specific or non-obvious to Claude Code on top of those.

## Toolchain

- Node version is pinned in `.nvmrc` (use `nvm use`). `engines.node` requires `>=18`.
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
2. `scripts/bundle.mjs` (esbuild) — produces three bundles:
   - `dist/cjs/index.node.js` (Node CJS, externalizes deps + Node builtins)
   - `dist/cjs/index.browser.js` (browser CJS, externalizes deps except those zeroed in `package.json#browser`)
   - `dist/esm/index.mjs` (browser ESM)

`package.json#exports` routes consumers to the right bundle by condition: `node` → node-cjs, `browser`/`react-native` → browser-cjs (require) or esm (import), default → esm. The `browser` field zeroes Node-only deps (`crypto`, `https`, `jsonwebtoken`, `ws`, `zlib`) so they tree-shake out of browser/RN builds. If you add a dep that's Node-only, add it to `browser` so it doesn't leak into browser/RN bundles.

esbuild `define` injects two compile-time constants: `process.env.PKG_VERSION` (read from `package.json`) and `process.env.CLIENT_BUNDLE` (one of `node-cjs`, `browser-cjs`, `browser-esm`). Both are consumed by `StreamChat.getUserAgent()` to produce a bundle-aware UA string. **`tsc`-only code paths do not get this substitution** — these env vars only resolve in the esbuild bundles, so don't gate runtime logic on them in code that callers might import directly via `src/`.

`postinstall` installs husky hooks; `prepare` runs `yarn run build` (so consumers installing from a git ref get a built package).

## Architecture

This is a single-package SDK with **no monorepo**. The public surface is everything re-exported from `src/index.ts` — treat additions there as public API and follow semver carefully (downstream React/Angular/RN SDKs depend on it).

### Module map of `src/`

- **`client.ts` — `StreamChat` facade.** ~5k-line class. Prefer `StreamChat.getInstance(key, secret?, options?)` — the constructor exists for advanced uses but `getInstance` is what `connectUser` warnings and most docs assume. Owns: the axios instance, WS connection lifecycle, `TokenManager`, and a registry of subsystem managers (`threads`, `polls`, `notifications`, `reminders`, `moderation`, `uploadManager`, `messageDeliveryReporter`, plus an optional `offlineDb` injected via `setOfflineDBApi`). New REST endpoints are added here as methods that call `axiosInstance` and return a type from `types.ts`.
- **`channel.ts` (~2.5k lines) + `channel_state.ts` (~1.1k) + `channel_manager.ts` + `channel_batch_updater.ts`** — per-channel object, its in-memory state, and the manager that orchestrates collections of channels (query/sort/filter, pagination, archived/pinned handling).
- **`connection.ts` (`StableWSConnection`) + `connection_fallback.ts` (`WSConnectionFallback`)** — realtime transport. Primary WS implementation does its own 25s ping / 35s health-check loop and reconnects on close/error/offline events; the fallback long-polls over HTTP. The client picks between them based on first-connect outcome; both emit `connection.changed` / `transport.changed` events into the client's local event bus.
- **`store.ts` — `StateStore`.** Reactive primitive (see "State and subscription patterns" below).
- **`signing.ts` — webhook + token helpers.** Server-side primitives `verifyAndParseWebhook`, `parseSqs`, `parseSns`, `verifySignature` (recent CHA-3071 added compressed-payload support). These are re-exported through `client.ts`. **The HMAC is always computed over the uncompressed JSON bytes** — gzip detection uses the `1f 8b` magic bytes, not headers, so the same handler works whether your platform middleware auto-decompressed or not. `CheckSignature` is deprecated in favor of `verifySignature` purely to fix parameter order; new code should use `verifySignature(body, signature, secret)`.
- **`middleware.ts`** — `MiddlewareExecutor` (see "Middleware pipelines" below). Used by composer pipelines, not by client request lifecycle.
- **`token_manager.ts`** — handles static tokens and async token providers. Tracks a `loadTokenPromise` so concurrent calls await the same fetch. Server-side clients (constructed with a `secret`) sign their own JWTs locally via `JWTServerToken` / `JWTUserToken`.
- **`events.ts` — `EVENT_MAP`.** Single source of truth for known event types (used by `EventTypes` in `types.ts`). Adding a new event type requires an entry here. Note the "local events" section: `channels.queried`, `connection.changed`, `transport.changed`, `capabilities.changed`, `live_location_sharing.*` are dispatched client-side only and never come over the wire.
- **`insights.ts` — `InsightMetrics` + `postInsights`.** WS-health telemetry sent to `https://chat-insights.getstream.io`. This is internal; do not call from end-user code paths. The fields captured by `buildWsBaseInsight` include token and connection metadata — treat changes here as security-sensitive.
- **`uploadManager.ts` / `LiveLocationManager.ts` / `CooldownTimer.ts`** — feature controllers, each owns its own `StateStore` slice.
- **Domain subsystems** (each a folder with its own `index.ts` barrel):
  - `messageComposer/` — biggest subsystem (≈3.5k lines). Composer + sub-composers (text, attachment, link previews, poll, location, custom-data) wired together by `MessageComposer` and driven by the middleware executor. Composition can target a `Channel`, `Thread`, or an existing local message (edit flow). Server-side composer config from `getConfig()` is merged on top of `DEFAULT_COMPOSER_CONFIG` with a customizer that prevents enabling features the server has disabled.
  - `messageDelivery/` — `MessageDeliveryReporter` (instance on the client) and `MessageReceiptsTracker` (per-channel sorted-by-timestamp tracker for delivered/read receipts; uses binary search over twin sorted arrays).
  - `notifications/` — toast-style `NotificationManager` (severities `error`/`warning`/`info`/`success`, configurable durations and sort comparator). Default instance is created by the client; pass `options.notifications` to provide your own.
  - `offline-support/` — `AbstractOfflineDB` is **abstract**. Mobile/RN SDKs inject a concrete implementation via `client.setOfflineDBApi(...)`. The `OfflineDBSyncManager` reconciles pending tasks on reconnect. Don't take it as a built-in feature of this package — it's an injection point with no default impl here.
  - `pagination/` — `BasePaginator` (cursor-or-offset, debounced, exposes `state: StateStore<PaginatorState>`), plus `FilterBuilder` and `ReminderPaginator`.
  - `reminders/` — `Reminder`, `ReminderManager`, `ReminderTimer` (scheduled-offset reminders with debounced refresh).
  - `search/` — `BaseSearchSource` + concrete `MessageSearchSource`, `ChannelSearchSource`, `UserSearchSource` orchestrated by `SearchController`.
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
- `rc` → prerelease channel.

## Things to double-check before claiming done

- `yarn lint` clean (zero warnings).
- `yarn types` passes.
- `yarn test` green.
- If you touched `src/index.ts` or any re-exported type, you've considered the public-API/semver impact.
- If you added a dependency: it doesn't need to run lifecycle scripts (or is added to `dependenciesMeta`), and Node-only deps are listed in `package.json#browser`.
- If you added a new event type, it's registered in `src/events.ts#EVENT_MAP` (otherwise `EventTypes` won't include it).
- If you extended composer behavior, you inserted middleware rather than forking `MessageComposerMiddlewareExecutor`.
- If you added long-lived subscriptions on a manager, `registerSubscriptions` is idempotent and `unregisterSubscriptions` calls `super`.
