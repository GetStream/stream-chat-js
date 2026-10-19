# stream-chat v9 -> v10 breaking changes

**Scope:** every breaking change in the public API of the `stream-chat` npm package between v9 (`master` @ `24b7623b`, v9.54.x) and v10 (`release-v10` @ `53505e72`). "Public" means reachable from the package root (`src/index.ts`) or through a public instance member (for example `client.wsConnection`, `channel.cooldownTimer`); members tagged `@internal` or `_`-prefixed are collected in [Internal surface touched](#internal-surface).

**How this list was produced:** a mechanical diff of the exported surface (names, members, signatures) between the two SHAs; a deep type-compatibility check of v9 types against v10 types in both directions; a compile check of the documentation snippets against v10; a diff of the unit tests; the downstream migrations of stream-chat-react and stream-chat-react-native to v10; the existing migration guides and the commit history. Every entry was then reconciled against the source of both versions, and a few behaviours were confirmed with probes (tsc runs, Node runtime checks). File and line references point to `src/` at the stated SHA.

**Who it is for:** authors of migration guides and docs, SDK maintainers, and AI agents migrating code. It is the single source of truth; each entry states the v9 shape, the v10 shape and the migration.

**Legend:**

- **Kind:** `removed` (gone, possibly with a replacement), `renamed` (same role, new name or location), `signature` (parameters or return type changed), `type-shape` (a type's members changed), `behavior` (same API, different runtime effect), `packaging` (install, runtime, dependencies, shipped types).
- **Impact:** `high` (most integrations hit it), `medium` (common features or a silent behaviour change), `low` (niche APIs, custom subclasses, tests).
- **PR:** the stream-chat-js pull request(s) that introduced the change, when known.
- **Source:** `src/` paths with line numbers; "(v10)" refers to `53505e72`, "(v9)" to `24b7623b`.
- "(tracked in v10-followups.md)" marks current v10 behaviour that looks like a bug and has a follow-up; the entry describes what v10 does today.

**Exclusions:** changes that were introduced and reverted (or renamed again) within the v10 release candidates are not listed. Only the net difference between the two SHAs counts; an API that existed only in an rc is not a v9 API.

<a id="at-a-glance"></a>

## At a glance

The highest-impact changes. Most integrations need all of these.

| #   | Change                                                                                                              | Entry                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `new StreamChat(key, config)`: no `secret` slot; options move under `config.client`                                 | [streamchat-constructor](#streamchat-constructor), [streamchat-options](#streamchat-options)                                                                            |
| 2   | Custom data lives under `custom` on every entity, request and event                                                 | [custom-data](#custom-data)                                                                                                                                             |
| 3   | Server timestamps are `TimestampNS` (branded ns numbers), not strings or `Date`                                     | [timestamp-ns](#timestamp-ns)                                                                                                                                           |
| 4   | Sort is `SortParamRequest[]` (`[{ field, direction }]`); all sort aliases removed                                   | [sort-shape](#sort-shape)                                                                                                                                               |
| 5   | Types are generated from the OpenAPI spec; 384 type names renamed or removed                                        | [generated-types](#generated-types), [type-rename-table](#type-rename-table)                                                                                            |
| 6   | `Role`, `User`, `Reaction`, `PollResponse`, `ThreadResponse`, ... keep their name but change meaning                | [same-name-meaning-changes](#same-name-meaning-changes)                                                                                                                 |
| 7   | `Event` is a discriminated union; `EventTypes` -> `EventType`; `EVENT_MAP` removed                                  | [event-union](#event-union), [event-type-names](#event-type-names)                                                                                                      |
| 8   | `connection.changed` / `transport.changed` are never dispatched; use `client.wsConnection.state`                    | [connection-changed-removed](#connection-changed-removed)                                                                                                               |
| 9   | `client.queryChannels` is a raw request; the v9 behaviour is `queryChannelsAndHydrate`                              | [query-channels-raw](#query-channels-raw), [query-channels-hydration](#query-channels-hydration)                                                                        |
| 10  | `StreamChat` methods take path objects plus request objects; many renamed                                           | [generated-client-signatures](#generated-client-signatures), [renamed-client-methods](#renamed-client-methods)                                                          |
| 11  | Watching and presence requests wait for a WS connection id (or fail without a socket)                               | [watch-waits-for-connection-id](#watch-waits-for-connection-id)                                                                                                         |
| 12  | `ErrorFromResponse` -> `StreamAPIError`; non-Stream failures are raw axios errors                                   | [stream-api-error](#stream-api-error)                                                                                                                                   |
| 13  | Logging moves to `chatLoggerSystem`; the default now logs to the console                                            | [logging](#logging)                                                                                                                                                     |
| 14  | `StateStore` is no longer exported; import it from `@stream-io/state-store`                                         | [state-store-package](#state-store-package)                                                                                                                             |
| 15  | `client.activeChannels` -> `client.channelManager` store (`get`, `values`, `ensure`)                                | [active-channels](#active-channels)                                                                                                                                     |
| 16  | `ChannelManager` rewritten: one per client, N `ChannelPaginator` lists                                              | [channel-manager](#channel-manager), [channel-manager-list-methods](#channel-manager-list-methods)                                                                      |
| 17  | Channel lists order by sort only; no promote-to-top on new messages                                                 | [channel-list-ordering](#channel-list-ordering)                                                                                                                         |
| 18  | `ChannelState` is a store; the message list moved to `channel.messagePaginator`                                     | [channel-state-store](#channel-state-store), [message-paginator](#message-paginator)                                                                                    |
| 19  | `channel.sendMessage` / `sendReaction` are plain requests; optimistic + offline flow is `channel.messageOperations` | [channel-send-message](#channel-send-message), [channel-send-reaction](#channel-send-reaction)                                                                          |
| 20  | `channel.markRead()` is the direct request; the v9 path is `markReadViaReporter()`                                  | [channel-mark-read](#channel-mark-read)                                                                                                                                 |
| 21  | `channel.getConfig()` -> `channel.serverConfig`; `ChannelConfig` now means the instance config                      | [channel-config](#channel-config)                                                                                                                                       |
| 22  | Reconnect recovery reloads only channels you `activate()`                                                           | [channel-activate-recovery](#channel-activate-recovery)                                                                                                                 |
| 23  | Thread replies moved to `thread.messagePaginator`; thread list to `client.threads.paginator`                        | [thread-replies](#thread-replies), [thread-manager-list](#thread-manager-list)                                                                                          |
| 24  | Link previews are enabled by default in the composer                                                                | [link-previews-default](#link-previews-default)                                                                                                                         |
| 25  | Attachment `mime_type` / `file_size` / `duration` / `waveform_data` moved under `custom`                            | [attachment-metadata-custom](#attachment-metadata-custom), [composer-upload-metadata](#composer-upload-metadata)                                                        |
| 26  | Server-side features (secret, JWT signing, webhooks, admin methods) removed; use `@stream-io/node-sdk`              | [server-side-auth-removed](#server-side-auth-removed), [server-only-methods-removed](#server-only-methods-removed), [webhook-helpers-removed](#webhook-helpers-removed) |
| 27  | `engines.node >=22.18.0` (Yarn 1 refuses to install); no bundled `ws`                                               | [node-engine](#node-engine), [websocket-on-node](#websocket-on-node)                                                                                                    |
| 28  | Uploads take `{ file }` objects (`File`, `Blob`, RN `{ uri, name, type }`); `sendFile` / `sendImage` gone           | [client-uploads](#client-uploads), [channel-uploads](#channel-uploads)                                                                                                  |

## Contents

1. [Installation, runtime and packaging](#installation-runtime-packaging)
2. [Client construction and configuration](#client-construction)
3. [`StreamChat` methods and properties](#streamchat-methods)
4. [Connection, events transport, errors, logging, tokens](#connection)
5. [Cross-cutting data model](#data-model)
6. [`Channel`](#channel)
7. [`ChannelState` and message paginators](#channel-state)
8. [`ChannelManager`, channel list and `activeChannels`](#channel-manager-section)
9. [Message operations, offline sending and reactions](#message-operations)
10. [Threads](#threads)
11. [Polls](#polls)
12. [Reminders, live location, message delivery and receipts, cooldown](#reminders-delivery)
13. [Search](#search)
14. [Pagination primitives](#pagination)
15. [Moderation](#moderation)
16. [Notifications](#notifications)
17. [Offline support](#offline-support)
18. [MessageComposer](#message-composer)
19. [Utilities](#utilities)
20. [Full type rename table](#type-rename-table)
21. [Behaviour changes that still compile](#behaviour-index)
22. [Internal surface touched](#internal-surface)
23. [Open questions / unverified](#open-questions)

<a id="installation-runtime-packaging"></a>

## 1. Installation, runtime and packaging

<a id="node-engine"></a>

### `package.json` `engines.node`

**Kind:** packaging · **Impact:** medium · **PR:** #1830

- **v9:** `"node": ">=18"`.
- **v10:** `"node": ">=22.18.0"`. Yarn 1 (classic) refuses to install a dependency whose `engines` does not match (bypass with `--ignore-engines`); npm and pnpm print an EBADENGINE warning unless `engine-strict` is set; Yarn Berry does not check dependency engines. This hits React Native / Expo projects still on Yarn 1 with Node 20 even though Node is not their runtime. Git-ref installs run `prepare` -> `build`, whose `./scripts/bundle.mts` needs default type stripping (Node 22.18+). The node-cjs bundle itself loads and connects on Node 22.14.0 (verified); Node 18/20 fail at `connectUser` without a WebSocket implementation ([WebSocket on Node](#websocket-on-node)).
- **Migrate:** run Node 22.18+ (or 24.x) for installs and builds.
- **Source:** `package.json:107-108`, `scripts/bundle.mts:1` (v10); `package.json:114-115` (v9)

<a id="websocket-on-node"></a>

### WebSocket on Node: no bundled implementation

**Kind:** behavior · **Impact:** low · **PR:** #1819, #1859

- **v9:** `connection.ts` imported `isomorphic-ws` (the `ws` package on Node), so `connectUser` worked on any supported Node.
- **v10:** `StableWSConnection` uses `config.webSocketImpl ?? WebSocket` (global). Node 22+ has a global `WebSocket`; on Node 20 (verified 20.20.2) `connectUser` rejects with `WebSocket is not defined`. Browsers and React Native are unaffected. v9 had no `webSocketImpl` option (it was added and renamed during the v10 rcs).
- **Migrate:** use Node 22+, or inject an implementation: `new StreamChat(key, { client: { wsConnection: { webSocketImpl: WS as unknown as typeof WebSocket } } })` with `import WS from 'ws'`. The cast is required: the `ws` class is not assignable to `typeof WebSocket` (TS2322 with `@types/ws` 8). See also [WebSocket implementation and network status](#websocket-impl-network-status).
- **Source:** `src/connection/wsConnection/StableWSConnection.ts:363`, `src/connection/wsConnection/types.ts:81`, `src/configuration/types.ts:190` (v10); `src/connection.ts:1,324` (v9)

<a id="removed-dependencies"></a>

### Removed runtime dependencies

**Kind:** packaging · **Impact:** low · **PR:** #1819

- **v9 `dependencies`:** `@types/jsonwebtoken`, `@types/ws`, `axios`, `base64-js`, `form-data`, `isomorphic-ws`, `jsonwebtoken`, `linkifyjs`, `ws`.
- **v10 `dependencies`:** `@stream-io/logger ^2.0.0`, `@stream-io/state-store ^1.1.6`, `axios`, `linkifyjs`. No `peerDependencies` or `optionalDependencies` in either version (`@stream-io/state-store` has optional peers `react`, `use-sync-external-store`, only for its `/react-bindings` subpath).
- **Migrate:** if your code imports `ws`, `jsonwebtoken`, `form-data`, `base64-js`, `isomorphic-ws`, or relied on `@types/ws` / `@types/jsonwebtoken` (and through them `@types/node`) arriving transitively, add them to your own `package.json`. Server code (JWT, webhooks, `secret`) moves to `@stream-io/node-sdk` ([server-side removals](#server-side-auth-removed)); Node `Buffer` / stream uploads are gone ([client uploads](#client-uploads)); `encodeBase64` / `decodeBase64` are gone ([base64](#encode-decode-base64)).
- **Source:** `package.json:47-52` (v10); `package.json:52-62` (v9)

<a id="browser-field"></a>

### `package.json` `browser` field removed

**Kind:** packaging · **Impact:** low · **PR:** #1819

- **v9:** `"browser": { "crypto": false, "https": false, "jsonwebtoken": false, "ws": false, "zlib": false }`.
- **v10:** field removed. v10 source imports none of these modules; bundle externals are only `axios`, `@stream-io/logger`, `@stream-io/state-store`, `linkifyjs`.
- **Migrate:** none required. Bundler shims added for v9 (webpack `resolve.fallback`, Metro `extraNodeModules`, Vite aliases, Jest `moduleNameMapper` for `crypto` / `https` / `zlib` / `ws` / `jsonwebtoken`) can be deleted.
- **Source:** `package.json` (v10, no `browser` key), `scripts/bundle.mts:28`; `package.json:31-37` (v9)

<a id="typescript-requirements"></a>

### Consumer TypeScript requirements

**Kind:** packaging · **Impact:** low

- **v9:** d.ts compiled clean on TS 5.5.4 to 6.0.3 with `skipLibCheck: false` under node16 / node10; with `types: []` it also compiled because `@types/ws` (a runtime dependency) pulled in `@types/node`. Under `moduleResolution: bundler` v9 had 2 errors in `insights.d.ts` (TS1340 on `ws`).
- **v10:** 0 errors on TS 5.5.4, 5.6.3, 5.7.2, 5.8.3, 5.9.3, 6.0.3 under bundler / node16 / node10 with `types: ["node"]` and `lib: ["es2020","dom"]`. Two new requirements, visible only with `skipLibCheck: false`: without `@types/node` (e.g. `types: []` in a browser / RN project) TS2503 `Cannot find namespace 'NodeJS'` from `StableWSConnection.d.ts` (`healthCheckTimeoutRef?: NodeJS.Timeout`); without the DOM lib (Node-only `lib: ["es2022"]`) TS2304 for `CloseEvent` / `ErrorEvent`. `@stream-io/state-store`'s `index.d.ts` uses `export * from "./state-store.ts"`, accepted by TS 5.5+.
- **Migrate:** keep `skipLibCheck: true`, or add `@types/node` and the `dom` lib. TS older than 5.5 is untested.
- **Source:** `dist/types/connection/wsConnection/StableWSConnection.d.ts:30,36,148,181` (v10)

<a id="state-store-package"></a>

### `StateStore` and friends moved to `@stream-io/state-store`

**Kind:** removed · **Impact:** high · **PR:** #1861

- **v9:** `import { StateStore, MergedStateStore, isPatch, type Unsubscribe, type Handler, type Patch, type Preprocessor, type RemovePreprocessor, type ValueOrPatch } from 'stream-chat'` (`src/store.ts`).
- **v10:** not exported from `stream-chat`; `src/store.ts` deleted. The same API lives in the `@stream-io/state-store` dependency (`^1.1.6`), used internally but not re-exported.
- **Migrate:** `import { StateStore, type Unsubscribe } from '@stream-io/state-store';` and add `"@stream-io/state-store": "^1.1.6"` to your own `dependencies` (required under pnpm / Yarn PnP strict resolution). Same class shape and method names. See [class identity](#state-store-identity) and [edge semantics](#state-store-semantics).
- **Source:** `src/index.ts` (v10, no `./store`), `src/CooldownTimer.ts:1`; `src/index.ts:25`, `src/store.ts:1-15` (v9)

<a id="state-store-identity"></a>

### `StateStore` class identity (every public `StateStore<...>` member)

**Kind:** type-shape · **Impact:** medium · **PR:** #1861

- **v9:** every `state` / `configState` field was typed with the local `StateStore` class.
- **v10:** typed with `@stream-io/state-store`'s `StateStore`, whose `protected` members (`value`, `handlers`, `preprocessors`) make TypeScript compare it nominally. A store from a second resolved copy of `@stream-io/state-store` (or from a v9 `stream-chat`) is not assignable (TS2345 "Types have separate declarations of a private property 'handlers'"). This is the root cause of compat failures through `state.handlers`, `*.merge(...).merged.value`, and "Type 'Record<string, unknown>' is not assignable" on `BaseSearchSource`, `BaseSearchSourceSync`, `FilterBuilder`, `NotificationManager`, `ReminderManager`, `SearchControllerState`, `SearchSource`, `SearchSourceSync`, `Suggestions`, `UploadManager`.
- **Migrate:** ensure exactly one `@stream-io/state-store` resolves (`npm ls @stream-io/state-store` / `yarn why @stream-io/state-store`); align your range with `^1.1.6`, dedupe with `overrides` / `resolutions`. Hooks such as `useStateStore(client.threads.state, selector)` must come from bindings compiled against that same copy (the UI SDKs or `@stream-io/state-store/react-bindings`).
- **Source:** `node_modules/@stream-io/state-store/dist/esm/state-store.d.ts` (v10); `src/store.ts:15-19` (v9)

<a id="state-store-semantics"></a>

### `StateStore.next` / `subscribeWithSelector` edge semantics

**Kind:** behavior · **Impact:** low · **PR:** #1861

- **v9:** `next()` skipped notification on `newValue === this.value`; `subscribeWithSelector` compared selections by iterating the previous selection's keys with `===`.
- **v10:** `next()` uses `Object.is`; selections are compared by iterating the new selection's keys with `Object.is` (new static `StateStore.doSelectionsEqual`). Verified differences:

  | case                                       | v9                       | v10             |
  | ------------------------------------------ | ------------------------ | --------------- |
  | selector drops a key, remaining keys equal | notifies                 | does not notify |
  | selector gains a key                       | does not notify          | notifies        |
  | selected value is `NaN` and unchanged      | notifies on every update | does not notify |

- **Migrate:** none for flat, fixed-shape selectors. If a selector returns objects whose key set varies, return a fixed key set (use `undefined` values).
- **Source:** `node_modules/@stream-io/state-store/src/state-store.ts:45,76` (v10); `src/store.ts:47,86` (v9)

### Global `DateConstructor` guard ships with the types

**Kind:** packaging · **Impact:** medium · **PR:** #1884

Owned by [Global `DateConstructor` overload](#date-constructor-guard) in section 5. Packaging facts: `src/index.ts:87` (`export type {} from './gen/models/timestamp-guard'`) keeps the guard in `dist/types/index.d.ts`, so it applies program-wide in every TS project that loads `stream-chat` types, with or without `skipLibCheck`, under bundler / node16 / node10 resolution (verified TS 5.5.4 and 6.0.3). It is type-only: nothing in the JS bundles, and it cannot be opted out of per file.

### Root barrel removals owned elsewhere

| v9 root export path                            | v10                                                       | entry                                                                                |
| ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `./store`                                      | removed                                                   | [state-store-package](#state-store-package)                                          |
| `./signing`                                    | still `export *`, only `UserFromToken`, `DevToken` remain | [webhook-helpers-removed](#webhook-helpers-removed)                                  |
| `./base64`, `./insights`                       | removed                                                   | [encode-decode-base64](#encode-decode-base64), [insights-removed](#insights-removed) |
| `./events` (`EVENT_MAP`)                       | removed                                                   | [event-type-names](#event-type-names)                                                |
| `./campaign`, `./segment`                      | removed                                                   | [campaign-segment-removed](#campaign-segment-removed)                                |
| `./permissions`                                | removed                                                   | [permissions-removed](#permissions-removed)                                          |
| `./channel_manager`, `./channel_batch_updater` | replaced by `./ChannelManager` / removed                  | [channel-manager](#channel-manager), [channel-batch-updater](#channel-batch-updater) |
| `promoteChannel` (from `./utils`)              | removed                                                   | [promote-channel](#promote-channel)                                                  |
| `ThreadRepliesPagination` (from `./thread`)    | removed                                                   | [thread-replies](#thread-replies)                                                    |

### Checked, not breaking

- `exports`: same `"."` conditions and targets as v9 (`types`, `browser`, `react-native`, `node` -> `dist/cjs/index.node.js`, `default` -> esm). Only addition: `"./package.json"`. `main`, `types`, `files` unchanged.
- Bundles: same three outputs, same `process.env.CLIENT_BUNDLE` values (`node-cjs`, `browser-cjs`, `browser-esm`) and identical `getUserAgent()` logic; the header is now sent as `x-stream-client` (case-insensitive, no effect). Browser ESM minified grew from 303 KB to 431 KB (deps external).
- `sideEffects: false` is new in v10 (v9 had no `sideEffects` key) and safe; the only global effect is the type-only date guard.
- New additive root exports: `LANGUAGE_NAMES`, `LanguageNameCatalog`, `languageNameDefaults`, the configuration types, `EntityStore`, `EventHandlerPipeline`, time helpers. `stream-chat/i18n` never shipped in a v9 release (rc-only).

<a id="client-construction"></a>

## 2. Client construction and configuration

<a id="streamchat-constructor"></a>

### `new StreamChat` / `StreamChat.getInstance`

**Kind:** signature · **Impact:** high · **PR:** #1911

- **v9:** `new StreamChat(key, options?)`, `new StreamChat(key, secret?, options?)`, same two overloads on `StreamChat.getInstance`; `options: StreamChatOptions` (which also extended `AxiosRequestConfig`).
- **v10:** `new StreamChat(key, config?: DeepPartial<InstanceConfigTree>)` and `StreamChat.getInstance(key, config?)`. `StreamChat` now `extends ChatApi` (generated REST methods, see [generated signatures](#generated-client-signatures)). `config` is the same tree that `client.config.set()` takes; client options live under `config.client`. `StreamChatOptions` -> `InstanceConfigTree`.
- **Migrate:** drop the secret slot and any `undefined` / `''` placeholder; move options under `client` ([option table](#streamchat-options)). In plain JS a v9 call still runs but is silently wrong: `new StreamChat(key, 'secret', opts)` treats the string as the tree (one "unknown key" warning per character) and ignores `opts`; `new StreamChat(key, { timeout, enableWSFallback })` ignores both keys with a warning (axios timeout stays 3000, `enableWSFallback` stays false).
- **Source:** `src/client.ts:139,313-400,502-511`, `src/configuration/InstanceConfigurationRegistry.ts:183-215,377-388` (v10); `src/client.ts:436-597,615-640` (v9)

```ts
// v9
const client = StreamChat.getInstance(key, { timeout: 6000, enableWSFallback: true });
// v10
const client = StreamChat.getInstance(key, {
  client: {
    axiosRequestConfig: { timeout: 6000 },
    wsConnection: { enableWSFallback: true },
  },
});
```

<a id="streamchat-options"></a>

### `StreamChatOptions` keys -> `config.client`

**Kind:** renamed · **Impact:** high · **PR:** #1911

- **v9:** flat `StreamChatOptions` keys plus top-level axios fields.
- **v10:** `ClientDeclarativeConfig` under `config.client`:

  | v9 option                                                                                               | v10 location                                         | notes                                                                                                                                            |
  | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `allowServerSideConnect`                                                                                | `client.allowServerSideConnect`                      | read on every connect; warning goes through the `client` logger scope                                                                            |
  | `axiosRequestConfig`                                                                                    | `client.axiosRequestConfig`                          | construction-only; see [axios instance](#axios-instance)                                                                                         |
  | top-level axios fields (`timeout`, `httpsAgent`, `withCredentials`, `headers`, `adapter`, `proxy`, ...) | `client.axiosRequestConfig.<field>`                  | v9 spread the whole options object into `axios.create` (a top-level `paramsSerializer` was already overwritten); `paramsSerializer` is now fixed |
  | `baseURL`                                                                                               | `client.baseURL`                                     | construction-only; `client.setBaseURL()` at runtime                                                                                              |
  | `browser`                                                                                               | `client.browser`                                     | read live by the `client.browser` / `client.node` getters                                                                                        |
  | `notifications` (a `NotificationManager` instance)                                                      | `client.notificationManager`                         | construction-only; `client.notifications` is now the manager's config slice ([notifications](#notification-manager-config))                      |
  | `persistUserOnConnectionFailure`                                                                        | `client.persistUserOnConnectionFailure`              | behaviour change: [persist-user](#persist-user-on-connection-failure)                                                                            |
  | `recoverStateOnReconnect`                                                                               | `client.connectionRecovery.enabled` (default `true`) | [connection recovery](#connection-recovery); `false` also stops `connection.recovered`, which v9 still dispatched                                |
  | `enableWSFallback`                                                                                      | `client.wsConnection.enableWSFallback`               | [long-poll fallback](#long-poll-fallback)                                                                                                        |
  | `wsUrlParams`                                                                                           | `client.wsConnection.urlParams`                      | default `undefined` (was empty `URLSearchParams`), URL unchanged                                                                                 |
  | `wsConnection` (prebuilt `StableWSConnection`)                                                          | `client.wsConnection.connection`                     | test-only                                                                                                                                        |
  | `isLocalUnreadCountEnabled`                                                                             | `channel.readEvents.localUnreadCountEnabled`         | channel config ([markReadLocally](#channel-mark-read-locally))                                                                                   |
  | `device`                                                                                                | removed                                              | call `client.createDevice(...)` after connecting                                                                                                 |
  | `logger`                                                                                                | removed                                              | `chatLoggerSystem.configureLoggers(...)` ([logging](#logging))                                                                                   |
  | `disableCache`                                                                                          | removed, no replacement                              | caches always filled; `_cacheEnabled()` gone ([caches](#poll-reminder-cache))                                                                    |
  | `enableInsights`                                                                                        | removed, no replacement                              | [insights](#insights-removed)                                                                                                                    |
  | `warmUp`                                                                                                | removed, no replacement                              | `GET /hi` no longer sent                                                                                                                         |

- **Migrate:** `new StreamChat(key, { client: { allowServerSideConnect: true, axiosRequestConfig: { timeout: 5000 }, wsConnection: { enableWSFallback: true }, connectionRecovery: { enabled: false } } })`, or `client.config.setConfig('client', {...})` later. Construction-only paths (`axiosRequestConfig`, `baseURL`, `notificationManager`) set after construction only warn.
- **Source:** `src/configuration/types.ts:144-210,245-277`, `src/configuration/keys.ts` (`CONSTRUCTION_ONLY_CONFIG_PATHS`), `src/client.ts:325-351,585-591,612` (v10); `src/types.ts:1599-1665`, `src/client.ts:466-497` (v9)

<a id="option-mirror-properties"></a>

### Option-mirror properties on `StreamChat` removed

**Kind:** removed · **Impact:** medium

- **v9:** `client.options`, `client.persistUserOnConnectionFailure`, `client.recoverStateOnReconnect`, `client.defaultWSTimeout` (15000), `client.defaultWSTimeoutWithFallback` (6000), `client.consecutiveFailures`.
- **v10:** removed.

  | v9                                          | v10                                                                                                                                                         |
  | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `client.options.<x>`                        | `client.config.getConfig('client')?.<x>`; axios values via `client.axiosInstance.defaults`                                                                  |
  | `client.persistUserOnConnectionFailure = v` | `client.config.setConfig('client', { persistUserOnConnectionFailure: v })`                                                                                  |
  | `client.recoverStateOnReconnect`            | `client.connectionRecovery.config.enabled` / `config.client.connectionRecovery.enabled`                                                                     |
  | `client.defaultWSTimeout`                   | `client.wsConnection.config.connectTimeoutMs` (default 15000), via `config.client.wsConnection.connectTimeoutMs` or `client.wsConnection.updateConfig(...)` |
  | `client.defaultWSTimeoutWithFallback`       | none: the WS always uses `connectTimeoutMs`; lower it to fall back sooner                                                                                   |
  | `client.consecutiveFailures`                | none (counter used only by the v9 token-expiry backoff)                                                                                                     |

- **Migrate:** per table.
- **Source:** `src/connection/wsConnection/config.ts:10-19`, `src/client.ts:436-447` (v10); `src/client.ts:354-428,463-529` (v9)

<a id="axios-instance"></a>

### Axios instance and request headers

**Kind:** behavior · **Impact:** medium · **PR:** #1911, #1909

- **v9:** the whole options object went to `axios.create`; `axiosRequestConfig` was spread per request after the SDK's own config, so its `headers` could override `Authorization` / `stream-auth-type` / `X-Stream-Client` and its rest (e.g. `timeout`) overrode per-call config such as the upload `timeout: 0`. In Node a keep-alive `https.Agent({ keepAlive: true, keepAliveMsecs: 3000 })` was created by default. `paramsSerializer` could be overridden only through `axiosRequestConfig` (a top-level one was overwritten right after `axios.create`).
- **v10:** `axios.create({ timeout: 3000, withCredentials: false, ...client.axiosRequestConfig, paramsSerializer: axiosParamsSerializer })` once. Per request only `axiosRequestConfig.headers` / `params` are re-read; integrator headers are spread first, so SDK `Authorization`, `stream-auth-type`, `x-stream-client`, `x-client-request-id` always win; per-request params override integrator params. No default Node agent. `paramsSerializer` is fixed.
- **Migrate:** pass `httpsAgent` explicitly in Node if you relied on keep-alive; stop overriding auth headers; per-call timeouts via `requestOptions.timeout`.
- **Source:** `src/client.ts:344-349`, `src/api-client.ts:146-171` (v10); `src/client.ts:483-498,3895-3949` (v9)

<a id="client-getters"></a>

### Read-only getters and id aliases on `StreamChat`

**Kind:** signature · **Impact:** low

- **v9:** writable fields `client.anonymous`, `client.browser`, `client.node`, `client.userID`, `client.clientID`.
- **v10:** getters: `anonymous` (from `tokenManager.isAnonymous`), `browser` (from `config.client.browser`, else `typeof window`), `node`, `userId` and deprecated `userID` (from `user?.id`); `clientId` field plus deprecated `clientID` getter/setter. Assigning a getter without a setter throws in strict-mode code.
- **Migrate:** use `userId` / `clientId`; set `browser` through config; stop assigning `anonymous` / `node` / `userID` (connect through `connectUser` / `connectAnonymousUser`).
- **Source:** `src/client.ts:211,251-277` (v10); `src/client.ts:353-391,711-713` (v9)

<a id="message-composer-setup-function"></a>

### `setMessageComposerSetupFunction` deprecated; `MessageComposerSetupState` removed

**Kind:** renamed · **Impact:** low · **PR:** #1831

- **v9:** `client.setMessageComposerSetupFunction(fn | null)` stored into `client._messageComposerSetupState: StateStore<MessageComposerSetupState>`; composers subscribed to that store in `registerSubscriptions`. `MessageComposerSetupState` was root-exported.
- **v10:** the method still works but is `@deprecated` and forwards to `client.config.setSetupFunction('messageComposer', fn)`. `_messageComposerSetupState` and `MessageComposerSetupState` are removed; writing to the old store no longer reaches composers. Composers subscribe through `client.config` (key `messageComposer`); the previous setup's teardown runs before the next one. Equivalent type: `InstanceSetupState<'messageComposer'>`, read via `client.config.getSetupFunction('messageComposer')`.
- **Migrate:** `client.config.setSetupFunction('messageComposer', ({ composer }) => teardown)`; replace `MessageComposerSetupState` with `InstanceSetupState<'messageComposer'>`.
- **Source:** `src/client.ts:545-552`, `src/configuration/types.ts:85-87`, `src/messageComposer/messageComposer.ts:898-910` (v10); `src/client.ts:319-335,410-416,663-670`, `src/messageComposer/messageComposer.ts:676-692` (v9)

<a id="server-side-auth-removed"></a>

### API secret and server-side auth removed

**Kind:** removed · **Impact:** medium · **PR:** #1819

- **v9:** `client.secret`, the `secret` constructor argument, `client.createToken(userID, exp?, iat?)`, `client._isUsingServerAuth()`, `client.validateServerSideAuth()`, `new TokenManager(secret)` signing server tokens (`JWTServerToken`) when no user token was set.
- **v10:** all removed. No server JWTs are produced; every request needs a user token (or anonymous).
- **Migrate:** move server code to `@stream-io/node-sdk` (token creation there). Delete branches gated on `_isUsingServerAuth()`. See also [server-only methods](#server-only-methods-removed) and [webhook helpers](#webhook-helpers-removed).
- **Source:** `src/token_manager.ts:21-26` (v10); `src/client.ts:451-454,1227-1245,3892,4297`, `src/token_manager.ts:24-34,58-61,140-142` (v9)

<a id="streamchat-methods"></a>

## 3. `StreamChat` methods and properties

Common rules for every generated or rewritten `StreamChat` method: path parameters are a first object argument (a stray key in it throws `"<key>" is not a path parameter of <path>`), then a request object sent as given, then `requestOptions?: StreamRequestOptions` (`{ signal?, onUploadProgress?, timeout? }`, replaces v9 `RequestOptions`). No-body endpoints take no request object: `requestOptions` follows the path params, or is the only argument (`getApp(requestOptions?)`, `getPoll({ poll_id }, requestOptions?)`). All `user_id` / `userId` "on behalf of" overrides are dropped. Responses are `StreamResponse<T>` = generated body plus `metadata` (rate limit, headers, status, client request id). Sort, filter and date shapes: [sort](#sort-shape), [filters](#filter-types), [request dates](#request-dates).

<a id="renamed-client-methods"></a>

### Renamed `StreamChat` methods

**Kind:** renamed · **Impact:** high · **PR:** #1832, #1836

- **v9 -> v10:**

  | v9                                                                                 | v10                                                                                                  |
  | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
  | `queryUserGroups(options?)`                                                        | `listUserGroups({ limit?, id_gt?, created_at_gt?, team_id? }?)`                                      |
  | `addDevice(id, push_provider, userID?, push_provider_name?)`                       | `createDevice({ id, push_provider, push_provider_name?, hardware_id?, voip_token? })`                |
  | `getDevices(userID?)`                                                              | `listDevices()`                                                                                      |
  | `removeDevice(id, userID?)`                                                        | `deleteDevice({ id })`                                                                               |
  | `setLocalDevice(device)`                                                           | none; call `createDevice(...)` after connecting (device no longer sent on WS connect)                |
  | `getUnreadCount(userID?)`                                                          | `unreadCounts()` (connected user only)                                                               |
  | `setPushPreferences(preferences)`                                                  | `updatePushNotificationPreferences({ preferences })`                                                 |
  | `partialUpdateUser(u)` / `partialUpdateUsers(us)`                                  | `updateUsersPartial({ users: [{ id, set?, unset? }] })`                                              |
  | `upsertUser(u)` / `upsertUsers(us)` / `updateUser(u)` (alias)                      | `updateUsers({ users: { [id]: user } })` (record keyed by id)                                        |
  | `unBlockUser(id, userID?)`                                                         | `unblockUser(id, requestOptions?)` (wrapper over generated `unblockUsers`)                           |
  | `getSharedLocations()`                                                             | `getUserLiveLocations()`                                                                             |
  | `updateLocation(payload)`                                                          | `updateLiveLocation({ message_id, latitude?, longitude?, end_at? })`                                 |
  | `markAllRead(data?)` (alias)                                                       | `markChannelsRead(request?)`                                                                         |
  | `partialUpdateMessage(id, { set, unset }, userId?, options?)`                      | `updateMessagePartial({ id }, { set?, unset?, skip_enrich_url?, skip_push? })`                       |
  | `ephemeralUpdateMessage(id, partial, user?, options?)`                             | none (ephemeral endpoint gone); use `updateMessagePartial`                                           |
  | `partialUpdateThread(messageId, { set, unset })`                                   | `updateThreadPartial({ message_id }, { set?, unset? })` (no reserved-field guard, no empty-id throw) |
  | `enrichURL(url)`                                                                   | `getOG({ url })` (response `GetOGResponse`)                                                          |
  | `hydrateActiveChannels(channels, stateOptions?, options?)`                         | `hydrateChannels(channels, stateOptions?, queryOptions?)`                                            |
  | `setAnonymousUser()` (alias)                                                       | `connectAnonymousUser()`                                                                             |
  | poll methods (`partialUpdatePoll`, `closePoll`, `addPollAnswer`, `removePollVote`) | see [poll client methods](#poll-client-methods)                                                      |

- **Migrate:** per table. User data passed to `updateUsers` / `createGuest` is `UserRequest` (custom fields under `custom`, see [custom data](#custom-data)).
- **Source:** `src/gen/chat/ChatApi.ts`, `src/client.ts:904,1672,1867` (v10); `src/client.ts:1189,1965,2286,2460-2560,2773-2800,3041,3253,3537,3575,3810,4605,5276` (v9)

<a id="generated-client-signatures"></a>

### Same-name methods with generated (`ChatApi`) signatures

**Kind:** signature · **Impact:** high · **PR:** #1760, #1832, #1836, #1870, #1896

- **v9:** hand-written positional methods returning `APIResponse & ...`; many took `user_id` / `userId` overrides.
- **v10:** inherited from generated `ChatApi` (`StreamChat extends ChatApi`) or thin wrappers over it:

  | method                                                                                                                                                                                                              | v9                                                                           | v10                                                                                                                                                      |
  | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `queryUsers`                                                                                                                                                                                                        | `(filter, sort?, options?, requestOptions?)`                                 | `({ payload: { filter_conditions, sort, presence?, limit?, ... } }?)`                                                                                    |
  | `search`                                                                                                                                                                                                            | `(filterConditions, query \| messageFilters, options?, requestOptions?)`     | `({ payload: { filter_conditions, query? \| message_filter_conditions?, sort?, limit?, offset?, next? } }?)`                                             |
  | `queryBannedUsers`                                                                                                                                                                                                  | `(filter?, sort?, options?)`                                                 | `({ payload }?)`                                                                                                                                         |
  | `queryFutureChannelBans`                                                                                                                                                                                            | `(options?)`                                                                 | `({ payload }?)`                                                                                                                                         |
  | `queryMessageFlags`                                                                                                                                                                                                 | `(filter?, options?)`                                                        | `({ payload }?)`                                                                                                                                         |
  | `createUserGroup`                                                                                                                                                                                                   | `(options)`                                                                  | `(request)`                                                                                                                                              |
  | `getUserGroup` / `deleteUserGroup`                                                                                                                                                                                  | `(id, options?)`                                                             | `({ id }, { team_id? }?)`                                                                                                                                |
  | `updateUserGroup`                                                                                                                                                                                                   | `(id, options)`                                                              | `({ id }, request?)`                                                                                                                                     |
  | `addUserGroupMembers` / `removeUserGroupMembers`                                                                                                                                                                    | `(id, options)`                                                              | `({ id }, request)`                                                                                                                                      |
  | `searchUserGroups` / `searchRoles`                                                                                                                                                                                  | `(options, requestOptions?)`                                                 | `(request, requestOptions?)` (same keys)                                                                                                                 |
  | `updateUsers`                                                                                                                                                                                                       | `(users: UserResponse[])`                                                    | `({ users: Record<id, UserRequest> })`                                                                                                                   |
  | `blockUser`                                                                                                                                                                                                         | `(blockedUserID, user_id?)`                                                  | `(blockedUserId, requestOptions?)` (wrapper over `blockUsers`)                                                                                           |
  | `getBlockedUsers`                                                                                                                                                                                                   | `(user_id?)`                                                                 | `(requestOptions?)`                                                                                                                                      |
  | `markChannelsRead`                                                                                                                                                                                                  | `(data?: { read_by_channel?, user?, user_id? })`, resolved `void`            | `({ read_by_channel? }?)`, resolves the response                                                                                                         |
  | `markChannelsDelivered`                                                                                                                                                                                             | `(data: MarkDeliveredOptions)`                                               | `(request?: MarkDeliveredRequest, requestOptions?)` (still a no-op when `latest_delivered_messages` is empty; generated `markDelivered` is the raw call) |
  | `translateMessage`                                                                                                                                                                                                  | `(messageId, language)`                                                      | `({ id }, { language })`; `language` is a closed union of 57 codes (`TranslateMessageRequest['language']`), so a `string` variable fails (TS2322)        |
  | `getMessage`                                                                                                                                                                                                        | `(messageID, { show_deleted_message? }?)`                                    | `({ id }, requestOptions?)` (option gone)                                                                                                                |
  | `sync`                                                                                                                                                                                                              | `(channel_cids, last_sync_at: string, { watch?, with_inaccessible_cids? }?)` | `({ channel_cids, last_sync_at: Date, watch?, with_inaccessible_cids? })`                                                                                |
  | `createBlockList`                                                                                                                                                                                                   | `(blockList)`                                                                | `(request)`                                                                                                                                              |
  | `listBlockLists`                                                                                                                                                                                                    | `({ team? }?)`                                                               | `({ team?, cursor?, limit? }?)`                                                                                                                          |
  | `updateBlockList` / `deleteBlockList`                                                                                                                                                                               | `(name, data)`                                                               | `({ name }, request?)`                                                                                                                                   |
  | `deleteChannels`                                                                                                                                                                                                    | `(cids, { hard_delete? }?)`                                                  | `({ cids, hard_delete? })`                                                                                                                               |
  | `queryDrafts`                                                                                                                                                                                                       | `({ filter?, sort?, user_id?, ...pager }?)`                                  | `({ filter?, sort?, limit?, next?, prev? }?)`                                                                                                            |
  | `getAppSettings`                                                                                                                                                                                                    | `()` -> `AppSettingsAPIResponse`                                             | `(requestOptions?)` -> `StreamResponse<GetApplicationResponse>` (wraps generated `getApp`); `appSettingsPromise` typed the same                          |
  | `setGuestUser`                                                                                                                                                                                                      | `(user: UserResponse)`                                                       | `(user: UserRequest, requestOptions?)` (calls `createGuest({ user })`)                                                                                   |
  | poll methods (`createPoll`, `updatePoll`, `getPoll`, `deletePoll`, `createPollOption`, `updatePollOption`, `getPollOption`, `deletePollOption`, `castPollVote`, `queryPolls`, `queryPollVotes`, `queryPollAnswers`) | positional                                                                   | see [poll client methods](#poll-client-methods)                                                                                                          |
  | reminder methods (`createReminder`, `updateReminder`, `deleteReminder`, `queryReminders`)                                                                                                                           | object with `messageId`                                                      | see [reminder methods](#reminder-methods)                                                                                                                |

  Still present on `StreamChat` (generated, new signatures above): the user-group methods, `translateMessage`, `deleteChannels`, reminder create/update/delete, block-list create/update/delete/list (`getBlockList` removed, `importBlockList` added), `getAppSettings`.

- **Migrate:** per table, e.g. `client.deleteMessage({ id }, { hard: true })`, `client.getAppSettings(undefined, { signal })`; narrow or cast user-supplied language strings to `TranslateMessageRequest['language']` for `translateMessage`.
- **Source:** `src/gen/chat/ChatApi.ts`, `src/api-client.ts:60-87,120-144`, `src/client.ts:814-819,956-968,1463-1469,1800-1807,1846-1878,2253-2262,2304-2310` (v10); `src/client.ts:1041,1198,1922,1976-2140,2418,2995-3030,3268,3335,3703,4117-4230,4630,4830-5245,5367` (v9)

<a id="query-channels-raw"></a>

### `client.queryChannels` is raw; hydration is `queryChannelsAndHydrate`

**Kind:** signature · **Impact:** high · **PR:** #1760

- **v9:** `queryChannels(filter, sort?, options?, stateOptions?)` -> `Channel[]` (hydrated, `channels.queried` dispatched, offline DB upserted; `withResponse` overload); raw variants `queryChannelsRequest` (-> channel array) and `queryChannelsRequestWithResponse` (-> full response). Abort via `stateOptions.signal`.
- **v10:** `queryChannels(request?, requestOptions?)` is the raw generated call returning `StreamResponse<QueryChannelsResponse>` (defaults `state: true, watch: true, presence: false` still applied). The v9 behaviour is `queryChannelsAndHydrate(request?, stateOptions?, requestOptions?)` (overload `{ withResponse: true }` -> `QueryChannelsResponseWithChannels`). `queryChannelsRequest*` removed. Filter and sort move into the request (`filter_conditions`, `sort: [{ field, direction }]`). Same name, different return type: `const channels = await client.queryChannels(...)` now gets an object. Channel-state consequences: [hydration](#query-channels-hydration).
- **Migrate:** `await client.queryChannelsAndHydrate({ filter_conditions: { members: { $in: [id] } }, sort: [{ field: 'last_message_at', direction: -1 }], limit: 20 })`; the signal moves from `stateOptions` to the third argument. For channel lists prefer a `ChannelPaginator` ([ChannelManager](#channel-manager)). Watching needs a connection ([connection id wait](#watch-waits-for-connection-id)).
- **Source:** `src/client.ts:1516-1631` (v10); `src/client.ts:2167-2297` (v9)

<a id="threads-reactions-hydrate"></a>

### Threads and reactions: raw calls plus `*AndHydrate`

**Kind:** signature · **Impact:** medium

- **v9:** `queryThreads(options?)` -> `{ threads: Thread[], next }` (defaults `limit 10, participant_limit 10, reply_limit 3, watch true`, poll cache hydrated); `getThread(messageId, options?)` -> `Thread` (defaults `participant_limit 100, reply_limit 3, watch true`); `queryReactions(messageID, filter, sort?, options?)` read the offline DB first and dispatched `offline_reactions.queried`.
- **v10:** `queryThreads(request?)`, `getThread({ message_id }, request?)`, `queryReactions({ id }, request?)` are raw generated calls with no defaults and no state. Hydrating versions: `queryThreadsAndHydrate(options?, requestOptions?)`, `getThreadAndHydrate({ message_id }, options?, requestOptions?)` (path params like `getThread`; thread instances resolved through `client.threads`), `queryReactionsAndHydrate({ id }, request?)`.
- **Migrate:** switch calls that need `Thread` instances or offline reactions to the `*AndHydrate` variants (`getThread(id)` -> `getThreadAndHydrate({ message_id: id })`); when calling the raw ones pass `watch: true` yourself if needed.
- **Source:** `src/client.ts:1643-1670,2059-2142` (v10); `src/client.ts:2307-2349,3725-3808` (v9)

<a id="update-delete-message-raw"></a>

### `client.updateMessage` / `client.deleteMessage` are raw requests

**Kind:** signature · **Impact:** medium · **PR:** #1882, #1836

- **v9:** `updateMessage(message, userId?, options?)` queued an offline `update-message` task and normalized the payload (mentioned users to ids, reserved fields stripped, `user_id`) via `_updateMessage`; `deleteMessage(id, boolean | { hardDelete, deleteForMe })` applied the offline DB delete and queued `delete-message` via `_deleteMessage`.
- **v10:** `updateMessage({ id }, { message, skip_enrich_url?, skip_push? }, requestOptions?)` sends `message` as given (attachment sanitization only); `deleteMessage({ id }, { hard?, delete_for_me? }, requestOptions?)` sends only the request (still marks `deleted_for_me` / `type: 'deleted'` on the response when `delete_for_me`). No offline queue, no local state. `_updateMessage` / `_deleteMessage` removed.
- **Migrate:** UI-facing edits and deletes go through `channel.messageOperations.update/delete` or the composer ([message operations](#channel-send-message)); raw calls use the new shapes and option names `hard` / `delete_for_me`.
- **Source:** `src/client.ts:2016-2042` (v10); `src/client.ts:3459-3684` (v9)

<a id="client-uploads"></a>

### Client uploads: `uploadFile` / `uploadImage` / `deleteFile` / `deleteImage`; `sendFile` removed

**Kind:** signature · **Impact:** medium · **PR:** #1832

- **v9:** `uploadFile(uri, name?, contentType?, user?, axiosRequestConfig?)`, `uploadImage(...)` (inputs `string | ReadableStream | Buffer | File`, `form-data` in Node); `sendFile(url, uri, ...)`; `deleteFile(url)`, `deleteImage(url)`; routes `/uploads/file|image`; response `SendFileAPIResponse`.
- **v10:** `uploadFile({ file?, user? }, requestOptions?)`, `uploadImage({ file?, user?, upload_sizes? }, requestOptions?)` with `file: FileUploadInput` (`File | Blob | { uri, name?, type? } | string`), encoded with the global `FormData` (no Node `Buffer` or streams). Multipart requests get `timeout: 0` and unbounded body size; `requestOptions.timeout` / `onUploadProgress` / `signal` apply. `deleteFile({ url })`, `deleteImage({ url })`. Routes `/api/v2/uploads/file|image`. `sendFile` removed. Responses `FileUploadResponse` / `ImageUploadResponse`. There is no `contentType` parameter.
- **Migrate:** `client.uploadImage({ file: { uri, name: 'a.heic', type: 'image/heic' } }, { onUploadProgress })`; set `type` on the file reference instead of `contentType`. Node: pass a `Blob` / `File`. Channel uploads: [channel uploads](#channel-uploads).
- **Source:** `src/client.ts:2271-2296`, `src/upload-utils.ts:1-53`, `src/api-client.ts:36-40,70-84` (v10); `src/client.ts:1434-1455,5294-5358` (v9)

<a id="pin-unpin-message"></a>

### `pinMessage` / `unpinMessage` arguments

**Kind:** signature · **Impact:** low

- **v9:** `pinMessage(msg, timeoutOrExpirationDate?, pinnedBy?, pinnedAt?)`, `unpinMessage(msg, userId?)`.
- **v10:** `pinMessage({ id }, { pin_expires?, pinned_at? }?, requestOptions?)` (`PinMessageOptions`), `unpinMessage({ id }, requestOptions?)`. Both take the message (or `{ id }`), not a bare id string. `pin_expires` is a `Date`, an RFC3339 string or `null` (no expiry, the default); `pinned_at` is a `Date` or an RFC3339 string (defaults to now). There is no relative offset in seconds any more and no `pinnedBy`; a server `TimestampNS` is rejected at compile time. The internal `_normalizeExpiration` / `_validateAndGetMessageId` helpers are removed.
- **Migrate:** `pinMessage(m, 120)` -> `pinMessage(m, { pin_expires: new Date(Date.now() + 120 * 1000) })`; `pinMessage(m, date)` -> `pinMessage(m, { pin_expires: date })`; `pinMessage(m, null, 'user', date)` -> `pinMessage(m, { pinned_at: date })`; `pinMessage('id')` -> `pinMessage({ id: 'id' })`; drop `unpinMessage`'s user argument and pass `{ id }` for a bare id.
- **Source:** `src/client.ts:1876-1920`, `src/types.ts` (`PinMessageOptions`) (v10); `src/client.ts:3405-3445` (v9)

<a id="revoke-tokens"></a>

### `revokeTokens` revokes only the connected user's tokens

**Kind:** behavior · **Impact:** medium

- **v9:** `revokeTokens(before: Date | string | null)` -> `updateAppSettings({ revoke_tokens_issued_before })`: app-wide revocation (server-side).
- **v10:** `revokeTokens(before?: Date | null, requestOptions?)` -> `updateUsersPartial({ users: [{ id: client.userId, set: { revoke_tokens_issued_before } }] })`: only the current user; `before` defaults to now; string form dropped; returns `StreamResponse<UpdateUsersResponse>`. Without a connected user the request carries no `id`.
- **Migrate:** app-wide revocation moves to `@stream-io/node-sdk`; for the own user pass a `Date`.
- **Source:** `src/client.ts:787-803` (v10); `src/client.ts:1002-1009` (v9)

<a id="raw-http-helpers"></a>

### Raw HTTP helpers moved to `client.api`; `createAbortControllerForNextRequest` removed

**Kind:** renamed · **Impact:** low · **PR:** #1828

- **v9:** `client.get/put/post/patch/delete(url, ...)`, `client.doAxiosRequest(type, url, data?, options?)`, `post` / `get` taking an axios `config`; `client.createAbortControllerForNextRequest()`.
- **v10:** on `client.api` (`ApiClient`, not root-exported): `get(url, params?)`, `put(url, data?)`, `post(url, data?)`, `patch`, `delete(url, params?)`, `doAxiosRequest(type, url, data?, options?)`, plus `sendRequest(method, path, pathParams?, queryParams?, body?, contentType?, requestOptions?)`. No per-call config on the verbs. `createAbortControllerForNextRequest` removed: every method takes `requestOptions.signal`. There is no `errorFromResponse` anywhere in v10 ([internal helpers](#internal-surface)).
- **Migrate:** `client.api.post(client.baseURL + '/api/v2/...', body)` or the typed method; `const ac = new AbortController(); client.queryUsers({ payload }, { signal: ac.signal })`.
- **Source:** `src/client.ts:278-280`, `src/api-client.ts:60-116,343-355` (v10); `src/client.ts:1339-1432,4808-4810` (v9)

<a id="rest-routes"></a>

### REST routes and default query params

**Kind:** behavior · **Impact:** medium · **PR:** #1760

- **v9:** endpoints at `baseURL + '/channels'`, `'/users'`, `'/messages/{id}'`, `'/uploads/file'`, ...; every request carried `user_id`, `api_key` and `connection_id`.
- **v10:** generated endpoints are `baseURL + '/api/v2/...'` (e.g. `/api/v2/chat/channels`, `/api/v2/users`, `/api/v2/chat/messages/{id}`, `/api/v2/uploads/file`). `user_id` and `api_key` are still on every request; `connection_id` only on requests that watch or subscribe to presence and on `stopWatchingChannel`. Hand-written `unbanUser` still calls v1 `DELETE /moderation/ban`.
- **Migrate:** update reverse proxies, CSP allowlists, request mocks (msw / nock) and server-side request filters keyed on paths or on `connection_id`.
- **Source:** `src/gen/chat/ChatApi.ts`, `src/api-client.ts:146-171,206-217`, `src/client.ts:1840` (v10); `src/client.ts:3929-3936` (v9)

<a id="client-channel"></a>

### `client.channel()`

**Kind:** signature · **Impact:** medium · **PR:** #1901

- **v9:** `channel(type, id?, custom?: ChannelData)` / `channel(type, custom)`, deduped via `activeChannels` (`getChannelById` / `getChannelByMembers`, both `@private` arrow properties).
- **v10:** `channel(type, id?, custom?: ChannelInput)` / `channel(type, custom?)` is a shorthand for `client.channelManager.ensure({ type, id, data })`. `getChannelById` / `getChannelByMembers` removed. `ChannelInput` puts custom fields under `custom` and members as `{ user_id }` objects. Identity, provisional channels and `supersededBy`: [channel store](#active-channels).
- **Migrate:** `client.channel('messaging', id, { custom: { name } })`; replace `getChannelById(type, id, data)` with `client.channel(type, id, data)`; spies on channel creation target `channelManager.ensure`.
- **Source:** `src/client.ts:1773-1789` (v10); `src/client.ts:2610-2770` (v9)

<a id="client-user-listeners-mutes"></a>

### User, listener and mute fields

**Kind:** type-shape · **Impact:** medium

- **v9:** `user?` / `_user?: UserResponse | OwnUserResponse`; `connectUser(user: UserResponse | OwnUserResponse, token)`; `listeners: Record<string, handler[]>`; `mutedUsers: Mute[]` plain field.
- **v10:** `user?` / `_user?: ClientUser` (`PartializeAllBut<OwnUserResponse, 'id'> & { anon? }`, `_user` tagged `@private`); `connectUser(user: ClientUser, token)` (and deprecated `setUser`); `listeners: Map<EventType, Set<EventHandler>>` (a duplicate handler registers once; `client.listeners['message.new']` is `undefined`); `mutedUsers: UserMuteResponse[]` is a getter/setter over the new `mutedUsersStore: StateStore<{ mutedUsers }>` (assignment notifies, in-place mutation does not); `on(type, handler)` narrows the handler's event type ([EventHandler](#event-handler-generic)).
- **Migrate:** user custom fields under `custom`, timestamps as `TimestampNS`; `client.listeners.get(type)?.size`; subscribe to `client.mutedUsersStore` instead of listening for `notification.mutes_updated`.
- **Source:** `src/client.ts:122,149,213,221,237,327,449-455,561,987-1019` (v10); `src/client.ts:343,366,381,391,677-680,1256-1290` (v9)

<a id="prevent-thread-cleanup"></a>

### `client.preventThreadCleanup` has no effect

**Kind:** behavior · **Impact:** low

- **v9:** `client.preventThreadCleanup = true` stopped `ChannelState` from cleaning up threads while a channel initialized (set by stream-chat-react-native).
- **v10:** the field is still declared but read nowhere; thread state lives in `client.threads` ([threads](#threads)).
- **Migrate:** remove the assignment.
- **Source:** `src/client.ts:214-218` (v10); `src/client.ts:374-378`, `src/channel_state.ts:253` (v9)

<a id="disconnect-user-teardown"></a>

### `disconnectUser` tears down more state

**Kind:** behavior · **Impact:** low

- **v9:** cleared the user, `activeChannels`, `ClientState`, threads, uploads, the composer cache; token manager reset after close.
- **v10:** additionally resets every channel list (paginators stay registered), clears the channel store, clears `mutedChannels`, runs the `'client'` setup function's teardown (re-armed on next connect), and rejects requests waiting for a connection id with "Connection was closed because disconnectUser() was called"; the token manager resets only if no new user connected meanwhile.
- **Migrate:** re-query lists after reconnecting as another user (they are empty, not stale). Clearing the channel store disposes every `Channel` instance, including ones the app still holds in its own state (an "active channel", a cached list): any later call on them throws "Channel <cid> is pending disposal and cannot be used" ([pendingDisposal](#channel-pending-disposal)). Drop held channel references on logout or user switch, or re-acquire them after the next `connectUser()` with `client.channelManager.ensure({ type, id })`. v9 also threw from `getClient()` on channels disconnected this way; a dev-mode hot reload that re-runs `connectUser` after the old cleanup's `disconnectUser()` hits it too.
- **Source:** `src/client.ts:828-889` (v10); `src/client.ts:1110-1148` (v9)

<a id="client-state"></a>

### `ClientState`

**Kind:** type-shape · **Impact:** low

- **v9:** `users: Record<string, UserResponse>`, `updateUser(user?: UserResponse)`; writes skipped when `_cacheEnabled()` was false.
- **v10:** `users: Record<string, UserResponse | OwnUserResponse>`, `updateUser(user?: UserResponse | OwnUserResponse)`; always written. `UserResponse` is the generated type ([user types](#user-response-types)).
- **Migrate:** narrow `client.state.users[id]` if you relied on the plain `UserResponse` type.
- **Source:** `src/client_state.ts:9-11,28-32` (v10 and v9)

<a id="query-channels-response-with-channels"></a>

### `QueryChannelsResponseWithChannels` and `UploadManager.upload` types

**Kind:** type-shape · **Impact:** low

- **v9:** `QueryChannelsResponseWithChannels = Omit<QueryChannelsAPIResponse, 'channels'> & { channels: Channel[] }` (had `blocklist?`, `predefined_filter?: ParsedPredefinedFilterResponse<Record<string, unknown>>`); `UploadManager.upload(...)` (`@internal`) resolved `MinimumUploadRequestResult | { blocklist?, file, thumb_url? }`.
- **v10:** based on generated `QueryChannelsResponse` (no `blocklist`, non-generic `predefined_filter` with `sort?: SortParamRequest[]`); `UploadManager.upload` resolves `MinimumUploadRequestResult` (follows `AttachmentManager.doUploadRequest`, see [default upload request](#composer-default-upload)).
- **Migrate:** read `predefined_filter.sort` as `[{ field?, direction }]`; drop `blocklist` reads.
- **Source:** `src/client.ts:109-114`, `src/uploadManager.ts:190-262` (v10); `src/client.ts:309-314` (v9)

<a id="client-moderation-methods"></a>

### Moderation methods moved from `StreamChat` to `client.moderation`

**Kind:** removed · **Impact:** medium · **PR:** #1833, #1836

- **v9:** v1 moderation methods on `StreamChat`.
- **v10:** removed from `StreamChat`; `client.moderation` (`class Moderation extends ModerationApi`, see [Moderation](#moderation)) carries the V2 replacements.

  | v9                                                                                             | v10                                                                                                                                                                                                                                 |
  | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `client.banUser(targetUserID, options?)`                                                       | `client.moderation.ban({ target_user_id, ...options })` (V2 `BanRequest`: `timeout`, `reason`, `shadow`, `ip_ban`, `delete_messages`, `delete_reactions`, `ban_from_future_channels`, `channel_cid`; no `banned_by_id` / `user_id`) |
  | `client.shadowBan(id, options?)`                                                               | `client.moderation.ban({ target_user_id: id, shadow: true, ...options })`                                                                                                                                                           |
  | `client.removeShadowBan(id, options?)`                                                         | `client.unbanUser(id, { shadow: true, ...options })` (still v1 `DELETE /moderation/ban`)                                                                                                                                            |
  | `client.muteUser(targetID, userID?, options?)`                                                 | `client.moderation.mute({ target_ids: [id], timeout? })`; response `MuteResponse` (`mutes`, no single `mute`)                                                                                                                       |
  | `client.unmuteUser(targetID, currentUserID?)`                                                  | `client.moderation.unmuteUser(id)` or `client.moderation.unmute({ target_ids: [id] })`                                                                                                                                              |
  | `client.flagMessage(targetMessageID, { reason, custom, user_id }?)`                            | `client.moderation.flagMessage({ message_id, reason?, custom, ... })`; V2 `/api/v2/moderation/flag`, response `FlagItemResponse`                                                                                                    |
  | `client.flagUser(targetID, { reason, user_id }?)`                                              | `client.moderation.flagUser({ user_id, reason?, ...options })`                                                                                                                                                                      |
  | `client.unflagMessage`, `client.unflagUser`, `client.unblockMessage`, `client._unblockMessage` | removed, no replacement in this package (review via `client.moderation.submitAction` or the dashboard)                                                                                                                              |

- **Migrate:** per table; `user_id` overrides are gone (the connected user acts).
- **Source:** `src/moderation.ts:10-93`, `src/gen/moderation/ModerationApi.ts`, `src/client.ts:1839-1844`, `src/types.ts:97,139-147` (v10); `src/client.ts:2950-3168,3240-3252` (v9)

<a id="server-only-methods-removed"></a>

### Server-only / admin `StreamChat` methods removed

**Kind:** removed · **Impact:** low (client apps), high for server code on `stream-chat` · **PR:** #1819, #1836

- **v9:** the methods below on `StreamChat`.
- **v10:** removed from this package; use `@stream-io/node-sdk`.

  | area                                | removed v9 methods                                                                                                                                                                                                                                                                                 |
  | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | app / push                          | `updateAppSettings`, `testPushSettings`, `testSQSSettings`, `testSNSSettings`, `upsertPushProvider`, `deletePushProvider`, `listPushProviders`, `getRateLimits`, `getHookEvents`                                                                                                                   |
  | tokens                              | `revokeUserToken`, `revokeUsersToken` (see [revokeTokens](#revoke-tokens))                                                                                                                                                                                                                         |
  | user admin                          | `deleteUser`, `deleteUsers`, `restoreUsers`, `reactivateUser`, `reactivateUsers`, `deactivateUser`, `deactivateUsers`, `exportUser`, `getUnreadCountBatch`, `sendUserCustomEvent`                                                                                                                  |
  | flags admin                         | `_queryFlags`, `_queryFlagReports`, `_reviewFlagReport`, `updateFlags`                                                                                                                                                                                                                             |
  | commands                            | `createCommand`, `getCommand`, `updateCommand`, `deleteCommand`, `listCommands`                                                                                                                                                                                                                    |
  | channel types                       | `createChannelType`, `getChannelType`, `updateChannelType`, `deleteChannelType`, `listChannelTypes`                                                                                                                                                                                                |
  | roles / permissions                 | `createRole`, `listRoles`, `deleteRole`, `getPermission`, `createPermission`, `updatePermission`, `deletePermission`, `listPermissions` (only `searchRoles` remains)                                                                                                                               |
  | block lists                         | `getBlockList` (list/create/update/delete remain; `importBlockList` added)                                                                                                                                                                                                                         |
  | exports / imports / tasks           | `exportChannel`, `exportChannels`, `exportUsers`, `getExportChannelStatus`, `_createImportURL`, `_createImport`, `_getImport`, `_listImports`, `getTask`                                                                                                                                           |
  | messages                            | `undeleteMessage`, `commitMessage`, `queryMessageHistory`, `translate` (free-text; `translateMessage` remains)                                                                                                                                                                                     |
  | campaigns                           | `campaign()`, `createCampaign`, `getCampaign`, `startCampaign`, `queryCampaigns`, `updateCampaign`, `deleteCampaign`, `stopCampaign` (classes: [Campaign and Segment](#campaign-segment-removed))                                                                                                  |
  | segments                            | `segment()`, `createSegment`, `createUserSegment`, `createChannelSegment`, `getSegment`, `updateSegment`, `addSegmentTargets`, `querySegmentTargets`, `removeSegmentTargets`, `querySegments`, `deleteSegment`, `segmentTargetExists`                                                              |
  | batch / filters / retention / usage | `channelBatchUpdater()`, `updateChannelsBatch`, `createPredefinedFilter`, `getPredefinedFilter`, `updatePredefinedFilter`, `deletePredefinedFilter`, `listPredefinedFilters`, `setRetentionPolicy`, `deleteRetentionPolicy`, `getRetentionPolicy`, `getRetentionPolicyRuns`, `queryTeamUsageStats` |

- **Migrate:** `@stream-io/node-sdk` (exact method names there are not verified here). Querying with an existing `predefined_filter` still works through `queryChannels` / `queryChannelsAndHydrate`.
- **Source:** `src/gen/chat/ChatApi.ts`, `src/client.ts` (v10, absent); `src/client.ts:971,1011,1061,2530,2572,2846,3169,3272,4045,4157,4204,4244,4272-4297,4316,4485,4616,4648,4711,4759,4818,5127,5150,5262,5400,5487` (v9)

<a id="webhook-helpers-removed"></a>

### Webhook, SQS/SNS and JWT helpers removed

**Kind:** removed · **Impact:** low (client), high for webhook handlers on `stream-chat` · **PR:** #1819

- **v9:** root exports `verifySignature`, `CheckSignature` (deprecated), `verifyAndParseWebhook`, `parseSqs`, `parseSns`, `gunzipPayload`, `decodeSqsPayload`, `decodeSnsPayload`, `parseEvent`, `InvalidWebhookError`, `InvalidWebhookErrorMessages`, `JWTUserToken`, `JWTServerToken`; client methods `verifyWebhook`, `verifyAndParseWebhook`, `parseSqs`, `parseSns`.
- **v10:** removed. `signing.ts` exports only `UserFromToken` and `DevToken` (plus `client.devToken`).
- **Migrate:** `@stream-io/node-sdk` webhook helpers and token generation.
- **Source:** `src/signing.ts:1-35` (v10); `src/signing.ts:18-290`, `src/client.ts:3990-4030` (v9)

<a id="connection"></a>

## 4. Connection, events transport, errors, logging, tokens

The removal of the `connection.changed` / `transport.changed` events is owned by [connection.changed removed](#connection-changed-removed); this section covers the replacements.

<a id="ws-connection"></a>

### `client.wsConnection` is never null; `client.wsFallback` removed

**Kind:** type-shape · **Impact:** medium · **PR:** #1859

- **v9:** `client.wsConnection: StableWSConnection | null` (null until connect, field `isHealthy`); `client.wsFallback?: WSConnectionFallback`; health changes surfaced as `connection.changed` events.
- **v10:** `client.wsConnection: WSConnection`, built in the constructor and never null; getters `isHealthy`, `isConnecting`; reactive `state: StateStore<{ isHealthy, lastHealthyAt, lastUnhealthyAt }>`; `config` / `updateConfig` (timing, `enableWSFallback`, `webSocketImpl`, `urlParams`, `connection`); the socket is at `wsConnection.connection` and the long-poll at `wsConnection.fallback` (both `@internal`). `client.wsFallback` removed. Device network status is the separate `client.networkConnection.state` (`isOnline`). `client.wsConnection` is no longer the socket: the v9 `StableWSConnection` members (`ws`, `wsID`, `connectionOpen`, `isDisconnected`, `isResolved`, `consecutiveFailures`, `totalFailures`, `lastEvent`, `requestID`, `pingInterval`, `connectionCheckTimeout`, `_reconnect()`, `_destroyCurrentWSConnection()`, `_setHealth()`, `_waitForHealthy()`, `scheduleNextPing()`, `scheduleConnectionCheck()`, `onopen` / `onmessage` / `onclose` / `onerror`, ...) read as `undefined` (or throw a `TypeError` when called) on it; they are on `client.wsConnection.connection` (`@internal`, `null` before the first connect, a new instance per connect).
- **Migrate:** `if (client.wsConnection)` is always true; use `client.wsConnection.isHealthy` or subscribe: `client.wsConnection.state.subscribeWithSelector(({ isHealthy }) => ({ isHealthy }), ...)`. A UI offline banner should wait `client.wsConnection.config.offlineNotificationDisplayDelayMs` (5000) itself; v9 delayed the event.
- **Source:** `src/client.ts:240,368-369`, `src/connection/wsConnection/WSConnection.ts:45-70,160-200,238-275,315-323`, `src/connection/wsConnection/types.ts:3-17` (v10); `src/client.ts:393-394,466` (v9)

<a id="stable-ws-connection"></a>

### `StableWSConnection` class

**Kind:** signature · **Impact:** low · **PR:** #1859, #1833

- **v9:** `new StableWSConnection({ client })`; `connectionID`, `_log(msg, extra?, level?)`, `setClient(client)`; writable `pingInterval` (25000) and `connectionCheckTimeout` (35000); `onopen(wsID)`; window online/offline listeners registered by the socket; file `src/connection.ts`.
- **v10:** `new StableWSConnection({ wsConnection })` (constructor changed), `setWSConnection(wsConnection)`, `client` is a getter; `connectionID`, `_log`, `setClient` removed; `pingInterval` / `connectionCheckTimeout` are read-only getters over `config.pingIntervalMs` (default and max 25000, min 1000) and `pingIntervalMs + healthCheckGracePeriodMs` (default 10000, min 1000); `onopen(wsId, authMessage)`; `onlineStatusChanged` deprecated (network status arrives through `_applyNetworkStatus` from `client.networkConnection`). The `wsID` field name is unchanged. File `src/connection/wsConnection/StableWSConnection.ts`.
- **Migrate:** configure timing through `config.client.wsConnection`; logging via `chatLoggerSystem.getLogger('connection')`; a prebuilt socket goes in `config.client.wsConnection.connection`.
- **Source:** `src/connection/wsConnection/StableWSConnection.ts:59-135`, `src/connection/wsConnection/config.ts:10-19,58-80` (v10); `src/connection.ts:47-110` (v9)

<a id="ws-handshake"></a>

### WS handshake: `/api/v2/connect`, auth in the first frame

**Kind:** behavior · **Impact:** medium · **PR:** #1833

- **v9:** socket URL `wsBaseURL/connect?json=<{ user_id, user_details, device, client_request_id }>&api_key&authorization=<token>&stream-auth-type`; first event `health.check` carrying `me`; payload built by `client._buildWSPayload(client_request_id?)`.
- **v10:** URL `wsBaseURL/api/v2/connect?api_key&stream-auth-type&X-Stream-Client` (plus `urlParams`); the first frame after open is the auth message `{ token, user_details, products: ['chat'] }` (anonymous uses a placeholder token); no `device`, `client_request_id` or `user_id`; hello event `connection.ok` (with `connection_id`, `me`); periodic `health.check` unchanged. `_buildWSPayload` replaced by `_buildWSAuthMessage()` / `_buildWSAuthPayload(token?)`.
- **Migrate:** proxies and firewalls must allow `/api/v2/connect` and must not require the token in the URL; seed own-user data from `connection.ok` or the `connectUser` result ([ConnectionOpen](#connection-open)).
- **Source:** `src/connection/wsConnection/StableWSConnection.ts:238-247,353-370,543-560`, `src/client.ts:2223-2243` (v10); `src/connection.ts:205-220`, `src/client.ts:3976-3982` (v9)

<a id="watch-waits-for-connection-id"></a>

### Watching requests wait for a connection id

**Kind:** behavior · **Impact:** high · **PR:** #1859, #1889

- **v9:** `queryChannels`, `queryUsers`, `search`, `queryReactions` awaited `client.wsPromise`; without a connection id `queryChannels` defaulted `watch` to `false` (an explicit `watch: true` was still sent) and `queryUsers` already defaulted `presence: false`; `queryThreads` / `getThread` / `sync` had no gate.
- **v10:** requests no longer await `wsPromise`. Any request whose params, `payload` or body carries `watch` or `presence` waits for `client.connectionIdManager` to have an id (across reconnects and `closeConnection()` -> `openConnection()`), honouring `requestOptions.signal`. It throws at once "No connection id is available: ..." when no socket is open or opening, and rejects with "Connection was closed because disconnectUser() was called" on `disconnectUser()`. Applies to `queryChannels` / `queryChannelsAndHydrate` (default `watch: true`), `groupedQueryChannels`, `queryUsers` with `presence`, `queryThreads` / `getThread` / `sync` with `watch`, and channel `query` / `watch` ([channel watch](#channel-watch)). `stopWatchingChannel` always waits. The wait is not bounded by the axios timeout.
- **Migrate:** call `connectUser()` first (awaiting it is not required); pass `watch: false` / `presence: false` for read-only loads from a client without a socket (server-side or before connecting); pass a `signal` to bound the wait.
- **Source:** `src/api-client.ts:206-217,310-327`, `src/connection/ConnectionIdManager.ts:113-135`, `src/client.ts:835-845,1484-1499,1516-1549` (v10); `src/client.ts:1930-1937,2163-2169,2342,2443` (v9)

<a id="connection-id-lifecycle"></a>

### Connection id lifecycle

**Kind:** behavior · **Impact:** low

- **v9:** `StableWSConnection.connectionID` (and `wsFallback.connectionID`) was set on connect and never cleared, so `client._getConnectionID()` could return a stale id after a drop or `closeConnection()`.
- **v10:** the id lives in `client.connectionIdManager.connectionId`; cleared when the socket turns unhealthy, on `closeConnection()` and `disconnectUser()`. `_getConnectionID()` / `_hasConnectionID()` still exist and read it. `StableWSConnection.connectionID` removed.
- **Migrate:** read `client.connectionIdManager.connectionId` (or `_getConnectionID()`); expect `undefined` between a drop and the next handshake.
- **Source:** `src/connection/ConnectionIdManager.ts:30-100`, `src/connection/wsConnection/StableWSConnection.ts:681-694`, `src/client.ts:541-543` (v10); `src/connection.ts:51`, `src/client.ts:658-660` (v9)

<a id="connection-recovery"></a>

### `recoverState` -> `ConnectionRecoveryManager`

**Kind:** behavior · **Impact:** medium · **PR:** #1841

- **v9:** on reconnect `client.recoverState()` re-queried all `activeChannels` cids in one `queryChannels({ cid: { $in } }, { last_message_at: -1 }, { limit: 30 })`, then dispatched `connection.recovered`; gated by `recoverStateOnReconnect`, which skipped only the query: `connection.recovered` was dispatched after every reconnect either way; public method.
- **v10:** `client.connectionRecovery` re-runs each registered channel list's first page (`channelManager.recover()`) and, independently, `channel.reload()` only for activated channels and `thread.reload()` for displayed threads; no bulk `$in` query; channels nobody activated are not refreshed; `connection.recovered` is withheld if the socket drops mid-recovery; runs on every reconnect path including `closeConnection()` -> `openConnection()`. Toggle `config.client.connectionRecovery.enabled`; manual trigger `client.connectionRecovery.recover()`. `recoverState` removed. Channel side: [activate for recovery](#channel-activate-recovery). With `connectionRecovery.enabled: false` nothing is recovered on reconnect and `connection.recovered` is not dispatched, since it means a recovery finished (v9 dispatched it after every reconnect even with `recoverStateOnReconnect: false`), so threads are not reloaded either (`ThreadManager` reloads on `connection.recovered`). `client.connectionRecovery.recover()` still runs a full recovery and dispatches `connection.recovered` when it finishes. With an initialized offline DB, active channels are reloaded and `connection.recovered` is dispatched only after the offline sync finishes (pending-task replay), not as soon as the socket is healthy again.
- **Migrate:** remove UI-side reconnect re-queries that existed because `recoverStateOnReconnect` was off; call `channel.activate()` for channels on screen. If you disabled recovery to run your own, listen to `client.wsConnection.state` (an `isHealthy` false -> true edge with `lastUnhealthyAt` set) instead of `connection.recovered`; to run the SDK's recovery from there, `await client.connectionRecovery.recover()`.
- **Source:** `src/connection/ConnectionRecoveryManager.ts:160-215,221-371` (sync-edge path `:210-224`, gates `:164,219`, dispatch `:356`, `recover()` `:367-375`), `src/thread_manager.ts:468`, `src/client.ts:173,383-384` (v10); `src/client.ts:1782-1826` (dispatch in both branches `:1811,1815`) (v9)

<a id="long-poll-fallback"></a>

### Long-poll fallback

**Kind:** behavior · **Impact:** low · **PR:** #1889

- **v9:** with `enableWSFallback`, the WS connect used a 6 s timeout; on WS failure it dispatched `transport.changed` and stored the fallback on `client.wsFallback`; skipped when `navigator.onLine` was false; the fallback registered its own window listeners; long-poll at `/longpoll` authenticated via query params.
- **v10:** the WS uses `connectTimeoutMs` (15 s); local event `connection.fallback_activated` (`mode: 'longpoll'`); fallback at `client.wsConnection.fallback`; skipped when a real network reporter says offline (ignores the WS-mirroring default reporter); network changes reach it through `client.networkConnection`; `/api/v2/longpoll` with an `Authorization` header; the client never returns to WebSocket.
- **Migrate:** enable via `config.client.wsConnection.enableWSFallback`; lower `connectTimeoutMs` to keep the faster switch.
- **Source:** `src/connection/wsConnection/WSConnection.ts:237-310`, `src/connection/wsConnection/WSConnectionFallback.ts`, `src/api-client.ts:23` (v10); `src/client.ts:1840-1895`, `src/connection_fallback.ts:33-60` (v9)

<a id="persist-user-on-connection-failure"></a>

### `persistUserOnConnectionFailure` keeps retrying after WS failures

**Kind:** behavior · **Impact:** low

- **v9:** with the flag, any initial `connectUser` failure called `closeConnection()`, stopping reconnection.
- **v10:** `closeConnection()` only for non-WS failures (bad token, token provider throw); after a WS / network failure the socket keeps retrying and reconnects when the network returns. Without the flag `disconnectUser()` runs as before.
- **Migrate:** if you relied on the socket stopping, call `closeConnection()` yourself.
- **Source:** `src/client.ts:603-623` (v10); `src/client.ts:727-735` (v9)

<a id="websocket-impl-network-status"></a>

### WebSocket implementation and network status source

**Kind:** behavior · **Impact:** medium · **PR:** #1859, #1833

- **v9:** `isomorphic-ws` (the `ws` package in Node); online/offline from window listeners registered by the socket.
- **v10:** global `WebSocket` or `config.client.wsConnection.webSocketImpl`; device network status from `client.networkConnection` (browser reporter installed automatically; elsewhere a stand-in that mirrors the socket until `config.client.networkConnection.statusReporter` or `client.networkConnection.setStatusReporter(...)` supplies one, e.g. NetInfo on RN). Dependency removal: [WebSocket on Node](#websocket-on-node).
- **Migrate:** Node without a global `WebSocket` (below 22) must pass `webSocketImpl`; RN apps should install a NetInfo-based `statusReporter` to get fast reconnects when the network returns.
- **Source:** `src/connection/wsConnection/StableWSConnection.ts:363`, `src/connection/networkConnection/reporters.ts:1-85`, `src/connection/networkConnection/NetworkConnectionObserver.ts:92-281` (v10); `src/connection.ts:1,99,324` (v9)

<a id="stream-api-error"></a>

### `ErrorFromResponse` -> `StreamAPIError`; `APIErrorResponse` -> `APIError`

**Kind:** behavior · **Impact:** high · **PR:** #1909, #1760

- **v9:** any non-2xx response became `ErrorFromResponse<T>` (exported runtime class: `code: number | null`, `status: number`, `response: AxiosResponse<T>`, `name = 'ErrorFromResponse'`) with message `StreamChat error code <n>: <message>` (or `StreamChat error HTTP code: <status>`). Body type `APIErrorResponse { duration; message; more_info; StatusCode; code?; details?: ErrorResponseDetails }`.
- **v10:** only a response whose body has a numeric Stream `code` becomes `StreamAPIError<T = APIError>(message, { code, status, response })` (`code?: number`, `status?: number`, `response?: AxiosResponse<T>`); the message is the raw server message (no prefix); `name` is a getter such as `StreamAPIError(status: 400, code: 4)`. Anything else (network error, 502 HTML page, cancellation) is rethrown as the raw axios error. `ErrorFromResponse`, `client.errorFromResponse`, `client.handleResponse` removed. Errors no longer carry `client_request_id` (v9 attached it to every rejected request, Stream and network errors alike); read `err.response?.config.headers['x-client-request-id']` (or `err.config?.headers['x-client-request-id']` for a raw axios error), or `metadata.client_request_id` on a successful response. Body type is the generated `APIError { code; duration; message; more_info; status_code; details: number[]; cooldown_remaining_ms?; unrecoverable?; exception_fields? }`. `LocalMessage.error?: StreamAPIError`.
- **Migrate:** `err instanceof StreamAPIError`; match on `err.code` / `err.status`, not on the message text; read `err.response?.data.status_code` instead of `StatusCode`; handle non-`StreamAPIError` failures separately.
- **Source:** `src/api-client.ts:220-224,284-294,363-369`, `src/types.ts:269-333`, `src/gen/models/index.ts:281-315` (v10); `src/client.ts:1382-1383,1456-1474`, `src/types.ts:3595-3620` (v9)

<a id="automatic-retries"></a>

### Automatic retries on `TOKEN_EXPIRED`

**Kind:** behavior · **Impact:** medium · **PR:** #1828

- **v9:** only `TOKEN_EXPIRED` with a token provider was retried (reload token, back off after the first failure); 429 was thrown at once; static tokens were not retried.
- **v10:** every request runs through `runWithRetry`, which retries `TOKEN_EXPIRED` from a token provider up to 10 times (11 requests) with `retryInterval` backoff (delays of 0.25 to 20.5 s, about 100 s in total), reloading the token before each retry; v9 retried without a limit. A 429 is not retried, as in v9. When the retries run out the rejection is the `StreamAPIError` of the last attempt (`code: 40`, `status: 401`), which `isEphemeral` treats as definitive, so offline-aware operations fail it instead of queueing it. A static token is not retried (it would reload to the same expired value), as in v9.
- **Migrate:** none for 429s. Treat a `StreamAPIError` with `code: 40` as "the token provider keeps returning expired tokens"; set `requestOptions.signal` / `timeout` to bound the retries.
- **Source:** `src/api-client.ts:226-275`, `src/utils/retryable.ts:64-136`, `src/utils.ts:128-133` (v10); `src/client.ts:1384-1404` (v9)

<a id="logging"></a>

### Logging: `options.logger` / `client.logger` -> `chatLoggerSystem`

**Kind:** behavior · **Impact:** medium · **PR:** #1760, #1831

- **v9:** `options.logger` (`Logger = (level, message, extraData?) => void`, `LogLevel = 'info' | 'error' | 'warn'`), `client.logger`, default `noopLogger` (silent); some warnings via `console.warn`.
- **v10:** process-wide `chatLoggerSystem` (`@stream-io/logger`): `configureLoggers({ default | <scope>: { level, sink } })`, `getLogger(scope)`; `Sink = (level, message, ...data) => void`; `LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'` (plus `LogLevelEnum`); `ChatLoggerScope` has 15 scopes: `api-client`, `channel`, `channel-manager`, `client`, `connection`, `instance-configuration`, `message-composer`, `offline-db`, `state-store`, `text-composer`, `thread`, `thread-manager`, `token-manager`, `upload-manager`, `utils`. `client.logger` and `Logger` removed. The default is a console sink at `info`, so apps that never set a logger now see console output (`info` / `warn` / `error`; RN maps warn/error to `console.info`); v9 was silent. Listener exceptions are logged on the scoped logger.
- **Migrate:** `chatLoggerSystem.configureLoggers({ default: { level: 'warn', sink: mySink } })` before creating the client; to keep v9 silence configure a no-op sink (`sink: () => {}`); `level: 'error'` keeps errors only. Handle `trace` / `debug` in exhaustive switches over `LogLevel`. Composer and utils log messages: [logChatPromiseExecution](#log-chat-promise-execution).
- **Source:** `src/logger.ts:1-28`, `node_modules/@stream-io/logger/dist/esm/index.js:42-45`, `src/utils.ts:37-40` (v10); `src/client.ts:584`, `src/types.ts:3019-3025` (v9)

<a id="token-manager"></a>

### `TokenManager`

**Kind:** signature · **Impact:** low

- **v9:** `new TokenManager(secret?)`, `secret`, `user?: UserResponse`, `setTokenOrProvider(token, user: UserResponse)`, `validateToken(token, user: UserResponse)` threw "User token can not be empty" for an empty non-anonymous token; `getToken()` returned `undefined` for anonymous.
- **v10:** `new TokenManager()` (constructor has no `secret`); `user?: TokenManagerMinimalUser` (`{ id; anon? }`); `setTokenOrProvider` / `validateToken` take `TokenManagerMinimalUser`; new `isAnonymous` getter; `getToken(): string` returns `''` for anonymous; an `undefined` token is no longer rejected up front (the connect fails later with "User token is not set..."). `client._setToken` / `_setUser` take `TokenManagerMinimalUser`.
- **Migrate:** subclasses and mocks implement `isAnonymous`; do not rely on the early empty-token error.
- **Source:** `src/token_manager.ts:8-150`, `src/client.ts:637-651` (v10); `src/token_manager.ts:15-147` (v9)

<a id="dev-token-encoding"></a>

### `UserFromToken` / `DevToken` encoding

**Kind:** behavior · **Impact:** low · **PR:** #1819

- **v9:** base64 via `base64-js` / custom decoder, Latin-1 char codes; `connectUser({ id: 'müller' }, client.devToken('müller'))` passed the user-id check.
- **v10:** `DevToken` encodes UTF-8 bytes with `btoa`; `UserFromToken` decodes with global `atob` without UTF-8 decoding. Any non-ASCII id now fails `connectUser` with a dev token ("userToken does not have a user_id or is not matching with user.id") (tracked in v10-followups.md). Needs global `atob` / `btoa` (old Hermes: polyfill).
- **Migrate:** ASCII ids for dev tokens; polyfill `atob` on runtimes without it.
- **Source:** `src/signing.ts:7-35`, `src/token_manager.ts:92-99` (v10); `src/signing.ts:63-86`, `src/base64.ts:47-80` (v9)

<a id="insights-removed"></a>

### Insights telemetry removed

**Kind:** removed · **Impact:** low · **PR:** #1870

- **v9:** root exports `InsightMetrics`, `InsightTypes`, `postInsights`, `buildWsFatalInsight`, `buildWsSuccessAfterFailureInsight`; `client.insightMetrics`; the `enableInsights` option posted WS failure telemetry to chat-insights.
- **v10:** all removed; nothing is posted.
- **Migrate:** delete references; no replacement.
- **Source:** `src/insights.ts:6-80`, `src/client.ts:401,529` (v9)

<a id="data-model"></a>

## 5. Cross-cutting data model

Root causes referenced from every other section: custom data under `custom`, `TimestampNS` dates, the sort shape, generated types and the `Event` union. The complete v9 -> v10 type-name mapping is the [rename table](#type-rename-table).

<a id="generated-types"></a>

### Generated types replace hand-written types

**Kind:** type-shape · **Impact:** high · **PR:** #1760, #1836, #1896

- **v9:** about 5.6k lines of hand-written `type` aliases in `src/types.ts`; responses were `APIResponse & {...}` where `APIResponse = { duration: string; blocklist?: BlockListResponse }`; most fields optional.
- **v10:** `src/types.ts` keeps about 40 hand-written helpers and ends with `export * from './gen/models'`; models are generated `interface`s from the OpenAPI spec. Consequences:
  - required/optional flips in both directions: e.g. `MessageResponse.text/html/attachments/pinned/user/cid` are now required, while `ChannelStateResponseFields.channel`, `*UserGroupResponse.user_group` (`CreateUserGroupResponse`, `GetUserGroupResponse`, `UpdateUserGroupResponse`, `AddUserGroupMembersResponse`, `RemoveUserGroupMembersResponse`), `PollVoteResponse.vote`, `FileUploadResponse.file`, `DeleteChannelResponse.channel`, `MuteChannelResponse.channel_mute` are now optional.
  - `blocklist` is gone from every response (`APIResponse` is now `{ duration: string }`, kept as a legacy alias).
  - request methods resolve `StreamResponse<T> = T & { metadata: RequestMetadata }`.
  - nullable unions become optional (`T | null` -> `T | undefined`), e.g. `membership`, `created_by`, `pinned_by`, `reaction_counts`.
  - literal unions follow the spec (`MessageResponse.type: string`, `ChannelMemberResponse.status: string`, `Action.name/text/type` required).
  - `type` aliases became `interface`s (declaration merging now possible).
  - `SendMessageAPIResponse` / `UpdateMessageAPIResponse` are now `StreamResponse<SendMessageResponse>` / `StreamResponse<UpdateMessageResponse>` (no `pending_message_metadata`).
  - Other response types whose members changed this way: `ChatPreferences`, `CreateDraftResponse`, `DeleteChannelsResponse`, `DraftResponse`, `Field`, `GetDraftResponse`, `ParsedPredefinedFilterResponse`, `PushPreferencesResponse`, `QueryDraftsResponse`, `QueryRemindersResponse`, `SearchUserGroupsResponse`, `SearchWarning`, `SharedLiveLocationResponse`, `UpsertPushPreferencesResponse`, `UserGroupResponse`. Members touched include `call_level`, `chat_level`, `feeds_level`, `feeds_preferences`, `default_preference`, `channel_context`, `channel_mentions`, `direct_mentions`, `group_mentions`, `here_mentions`, `role_mentions`, `thread_replies`, `distinct_channel_messages`, `channel_search_cids`, `channel_search_count`, `mentioned_members`, `parent_message`, `quoted_message`, `scheduled_message`, `schedule`, `short`, `title`, `value`, `metadata`, `filter`, `sort`.
- **Migrate:** guard now-optional response fields (`res.user_group?.id`); remove reads of `res.blocklist`; rename imports with the [rename table](#type-rename-table).
- **Source:** `src/types.ts:66-68,434-436,450-452,489`, `src/gen/models/index.ts` (v10); `src/types.ts:73-76` (v9)

<a id="custom-data"></a>

### Custom data moves under `custom`

**Kind:** type-shape · **Impact:** high · **PR:** #1836

- **v9:** custom fields were spread at the top level: `MessageBase = CustomMessageData & {...}`, `UserResponse = CustomUserData & {...}`, `ChannelResponse = CustomChannelData & {...}`, `ChannelMemberResponse = CustomMemberData & {...}`, `Attachment = CustomAttachmentData & {...}`, `Reaction = CustomReactionData & {...}`, `PollResponse = CustomPollData & ...`, `Event = CustomEventData & {...}`. Reads were `message.priority`; writes were `channel.sendMessage({ text, priority })`.
- **v10:** every entity has a `custom` object typed by the matching `Custom*Data` interface. On responses it is required (`MessageResponse.custom: CustomMessageData`, `UserResponse.custom`, `ChannelResponse.custom`, `ChannelMemberResponse.custom`, `ReactionResponse.custom`, `ThreadResponse.custom`, `Attachment.custom`, `OGAttachment.custom`, events `custom: CustomEventData`); on requests it is optional (`MessageRequest.custom?`, `ChannelInput.custom?`, `ChannelMemberRequest.custom?`, `ReactionRequest.custom?`, `PollOptionInput.custom?`, `CreatePollRequest.custom?`) except `Attachment.custom`, which is required in requests too. The SDK talks to `/api/v2/...` (REST and `/api/v2/connect`), whose payloads nest custom fields; there is no client-side flattening. `Attachment` members whose types follow the generated model: `actions`, `author_icon`, `color`, `fallback`, `fields`, `footer`, `footer_icon`, `giphy` (`Images`), `original_height`, `original_width`, `pretext`.
- **Migrate:** read `message.custom.priority`; write `channel.sendMessage({ message: { text, custom: { priority } } })`; `client.channel('messaging', id, { custom: { name } })` via `ChannelInput`; outgoing attachments need at least `custom: {}`.
- **Channel `name` and `image`:** the most common read to fix. `ChannelResponse` has no top-level `name` or `image`, so `channel.data?.name` / `channel.data?.image` (channel headers, list previews, search results) become `channel.data?.custom.name` / `channel.data?.custom.image`; grep for `data?.name` and `data.name`. Filtering is the exception: `name` is still a top-level key of the channel `filter_conditions` (`{ name: { $autocomplete: q } }` keeps working), while any other custom field filters as `'custom.<key>'` ([filters](#filter-types)).
- **Source:** `src/gen/models/index.ts:598-599,4889,4820,11555,1511,1501,1398,2663-2668`, `src/connection/wsConnection/StableWSConnection.ts:246` (v10); `src/types.ts:338,419,1056,2579,3038,3179,1712`, `src/connection.ts:219` (v9)

```ts
// v9
await channel.sendMessage({ text: 'hi', priority: 'high' });
const p = message.priority;
// v10
await channel.sendMessage({ message: { text: 'hi', custom: { priority: 'high' } } });
const p = message.custom.priority;
```

<a id="custom-data-augmentation"></a>

### `Custom*Data` module-augmentation contract

**Kind:** type-shape · **Impact:** high

- **v9:** augmenting `CustomMessageData` (etc.) added top-level properties to `MessageResponse`, `Message`, filters and sort keys; `CustomCommandData` keys extended `CommandVariants`; `CustomEventData` extended every `Event`.
- **v10:** same 13 interfaces, same names, same root re-export. They now type the `custom` object only. Differences:
  - `CustomAttachmentData` ships two declared members, `mime_type?: string` and `file_size?: number` ([attachment metadata](#attachment-metadata-custom)); augmentations merge with them.
  - `CustomCommandData` is no longer referenced anywhere (`Command.name` / `set` are plain `string`), so augmenting it has no effect.
  - `CustomEventData` types `event.custom`; event names come from `CustomEventTypes` keys, and `on()` / `off()` reject an undeclared custom name ([custom events](#custom-events)).
  - poll options use `CustomPollOptionData` (v9 `PollOptionResponse` used `CustomPollData`).
  - filters reach custom fields through `custom.<field>` keys derived from the augmentation ([filters](#filter-types)); sort keys are untyped strings ([sort](#sort-shape)).
  - required members declared in an augmentation become required in every `custom` object, including test fixtures of response types.
- **Migrate:** keep the `declare module 'stream-chat'` blocks; move every read/write of augmented fields under `.custom`; drop `CustomCommandData` augmentations.
- **Source:** `src/custom_types.ts:1-16`, `src/gen/models/index.ts:1-12`, `src/index.ts:93-107` (v10); `src/custom_types.ts:1-13` (v9)

<a id="filter-types"></a>

### Filter types generated per endpoint; custom fields as `custom.<field>`

**Kind:** type-shape · **Impact:** medium

- **v9:** permissive hand-written filters built from `QueryFilters<...>`, `QueryFilter`, `PrimitiveFilter`, `ContainsOperator`, `ArrayOneOrMore` / `ArrayTwoOrMore`, `QueryLogicalOperators`; custom fields as top-level keys (`{ color: 'green' }`); `$and` / `$nor` needed one element, `$or` two.
- **v10:** `ChannelFilters`, `UserFilters`, `MemberFilters`, `MessageFilters`, `ReactionFilters`, `ThreadFilters`, `ReminderFilters`, `QueryPollsFilters`, `QueryVotesFilters` are derived from the generated request's `filter` / `filter_conditions` (`Filters<{ key: { type; operators } }>`). Only declared operators per key are allowed, one operator per key (`RequireOnlyOne`), `$eq` / `$ne` accept `null`, `$in` takes `T[]`. Custom fields use `` `custom.${field}` `` keys plus a `` `custom.${string}` `` index. Logical operators (`$and`, `$or`, `$nor`) are plain arrays. Keys removed from the typed filters include `ChannelFilters.deleted_at/config/cooldown/created_by/invites/truncated_*/auto_translation_language/own_capabilities`, all `MemberFilters` keys except via the generated payload, `UserFilters.privacy_settings/push_notifications/online/invisible/...`, `QueryPollsFilters.user_id`, `QueryVotesFilters.created_by_id`, `ReminderFilters.user_id`; added `ChannelFilters.channel_role`, `QueryVotesFilters.poll_id`, `ReminderFilters.expires_at`, `ThreadFilters.has_unread/reply_count/...`. Other filter keys whose typing changed (added, removed or retyped): `ChannelFilters.app_banned`, `auto_translation_enabled`, `distinct`, `filter_tags`, `hide_messages_before`, `invite`, `message_count`, `mute_expires_at`, `truncated_by`; `MemberFilters.invite`, `is_moderator`, `user.email`; `MessageFilters.mentioned_group_ids`, `mentioned_groups`, `mentioned_roles`, `mml`, `quoted_message_id`, `thread_participants`; `ThreadFilters.created_by_user_id`; `UserFilters.avg_response_time`, `bypass_moderation`, `deactivated_at`, `email`; `SearchPayload.force_default_search`, `force_sql_v2_backend`. `QueryFilters<Operators>` now requires its type argument. `SearchPayload` drops `client_id` / `connection_id` (and takes `filter_conditions`, `message_filter_conditions`, `query`).
- **Migrate:** `{ color: 'green' }` -> `{ 'custom.color': 'green' }`; split two operators on one key into `$and`; replace removed building blocks with `Filters<...>` or the derived alias (`NonNullable<QueryChannelsRequest['filter_conditions']>`). Whether the API still accepts old top-level custom keys is unverified.
- **Source:** `src/gen/models/index.ts:39-125`, `src/types.ts:215-231` (v10); `src/types.ts:31-40,1994,2182-2260` (v9)

<a id="user-response-types"></a>

### User response types

**Kind:** type-shape · **Impact:** high

- **v9:** `UserResponse = CustomUserData & { id; anon?; banned?; blocked_user_ids?; channel_last_read_at?; invisible?; language?: '' | TranslationLanguages; notifications_muted?; privacy_settings?; push_notifications?; revoke_tokens_issued_before?; shadow_banned?; username?; teams_role?: TeamsRole | null; ... }`; `OwnUserBase` hand-listed (`roles`, `devices: Device[]`, `mutes: Mute[]`, `total_unread_count_by_team`, `unread_count`).
- **v10:** generated `UserResponse` without `anon`, `channel_last_read_at`, `invisible`, `notifications_muted`, `privacy_settings`, `push_notifications`, `revoke_tokens_issued_before`, `shadow_banned`, `username`; now required `banned`, `blocked_user_ids`, `created_at`, `language: string`, `online`, `role`, `teams`, `updated_at`, `custom`; `teams_role` is `Record<string, string>`. `OwnUserResponse` keeps `invisible`, `privacy_settings: PrivacySettingsResponse`, `push_preferences`, `devices: DeviceResponse[]`, `mutes: UserMuteResponse[]`, adds `latest_hidden_channels`, drops `roles`. `OwnUserBase = Pick<OwnUserResponse, Exclude<keyof OwnUserResponse, keyof UserResponse>>`. User input for `connectUser` is `ClientUser` ([user fields](#client-user-listeners-mutes)).
- **Migrate:** read privacy/push settings from the own user only; build user input as `ClientUser` / `UserRequest`, not `UserResponse`; custom user fields under `custom`.
- **Source:** `src/gen/models/index.ts:11555,6238`, `src/types.ts:91-94` (v10); `src/types.ts:910-925,1056` (v9)

<a id="message-response-types"></a>

### Message response types (`MessageResponse`, `LocalMessage`)

**Kind:** type-shape · **Impact:** high · **PR:** #1849

- **v9:** `MessageResponse = MessageResponseBase & { quoted_message? }` with `type: MessageLabel`, `user_id?`, `status?`, `args?`, `command_info?`, `before_message_send_failed?`, `channel?`, `moderation_details?`, `i18n?: TranslatedField`; `LocalMessage` converted `created_at` / `updated_at` / `deleted_at` / `pinned_at` to `Date` and allowed `null`.
- **v10:** generated `MessageResponse` without `user_id`, `status`, `args`, `command_info`, `before_message_send_failed`, `channel`, `moderation_details`; `type: string`; `member?: ChannelMemberPartialResponse`; `moderation?: ModerationV2Response`; `poll?: PollResponseData`; `reminder?: ReminderResponseData`; `shared_location?: SharedLocationResponseData`; `i18n?: Record<string, string>`; now required: `created_at`, `updated_at`, `attachments`, `latest_reactions`, `own_reactions`, `reaction_counts`, `reaction_scores`, `mentioned_users`, `reply_count`, `deleted_reply_count`, `shadowed`, `silent`, `pinned`, `html`, `text`, `user`, `cid`, `restricted_visibility`, `mentioned_here`, `mentioned_channel`; changed: `pinned_by`, `quoted_message`; adds `custom`, `draft`, `image_labels`, `mentioned_channel_members`. `LocalMessage = MessageResponse & { status: string; error?: StreamAPIError; user_id?: string }`: dates stay `TimestampNS`, and `deleted_at` / `pinned_at` / `quoted_message` / `error` are `undefined` instead of `null`; `formatMessage` no longer converts dates ([formatMessage](#format-message)).
- **Migrate:** compare dates numerically or convert with `nsToDate`; replace `=== null` checks with `== null`; narrow `type` against string literals yourself (`MessageLabel` is still exported); read `moderation` instead of `moderation_details`.
- **Source:** `src/gen/models/index.ts:4889`, `src/types.ts:74-78,253-259`, `src/utils.ts:220-257` (v10); `src/types.ts:553-575,795-799` (v9)

<a id="message-request"></a>

### Message input types collapse into `MessageRequest`

**Kind:** type-shape · **Impact:** medium

- **v9:** `Message` (send), `UpdatedMessage` (update), `DraftMessagePayload` (draft), `MessageBase`; `DraftMessage` hand-written (`custom?: {}`, `mentioned_users?: string[]`, `shared_location?: StaticLocationPayload | LiveLocationPayload`).
- **v10:** all inputs are `MessageRequest` (`type?: 'regular' | 'system'`, no `html` / `user` / `user_id` / `status`, date fields `Date`, `custom?`, `shared_location?: SharedLocation`) wrapped by the endpoint request (`SendMessageRequest { message }`, `UpdateMessageRequest { message }`, `CreateDraftRequest { message }`). `DraftMessage = DraftPayloadResponse & Partial<Pick<MessageResponse, 'shared_location' | 'mentioned_*'>>` with `mentioned_users: UserResponse[]` and `custom: CustomMessageData`.
- **Migrate:** `channel.sendMessage({ message: { text, custom } }, requestOptions?)`; drop `user` / `user_id` (connected user only); convert response timestamps with `nsToDate` before putting them in a request.
- **Source:** `src/gen/models/index.ts:4820`, `src/types.ts:395-406` (v10); `src/types.ts:3038,4643` (v9)

<a id="channel-member-types"></a>

### Channel, member and channel-state response shapes

**Kind:** type-shape · **Impact:** medium

- **v9:** `ChannelResponse` had `created_by_id`, `invites`, `joined`, `truncated_by_id`, `created_by: UserResponse | null`, `auto_translation_language: TranslationLanguages`; `ChannelMemberResponse` fields optional, `channel_role: Role`, `status: InviteStatus`; `ChannelAPIResponse.membership: ChannelMemberResponse | null`, `channel` required; `ChannelData` spread custom keys and accepted `members: string[] | NewMemberPayload[]`.
- **v10:** `ChannelResponse` drops those four fields, `own_capabilities: ChannelOwnCapability[]`, `auto_translation_language: string`; `ChannelMemberResponse` requires `banned`, `notifications_muted`, `shadow_banned`, `user_id`, `created_at`, `updated_at`, `custom`, uses `channel_role: string`, `status?: string`, `user?`, adds `ban_from_future_channels`, `deleted_at`, `future_channel_ban_expires`, `deleted_messages`; `ChannelStateResponseFields.channel` optional, `threads` required, `membership` not nullable; channel input is `ChannelInput` (`members?: ChannelMemberRequest[]`, `custom?`, no `blocked` / `automod` / `blocklist_behavior`); `ChannelMute.user` optional.
- **Migrate:** guard `state.channel`; pass member objects `{ user_id, channel_role?, custom? }`; custom channel data under `custom`.
- **Source:** `src/gen/models/index.ts:1398,1501-1560,1679` (v10); `src/types.ts:338,419,2681` (v9)

<a id="poll-types"></a>

### Poll types

**Kind:** type-shape · **Impact:** medium

- **v9:** `PollResponse` was the poll data (`CustomPollData & PollEnrichData & {...}`); `PollOption` had `vote_count`, `votes`, `poll_id`, `created_at`, `updated_at`; votes were `PollVote` / `PollAnswer`; `VotingVisibility` was a runtime `enum`.
- **v10:** poll data is `PollResponseData`; `PollResponse` is the `{ duration, poll }` envelope ([same-name changes](#same-name-meaning-changes)); `PollOptionResponseData` is `{ id, text, custom, text_i18n? }` only; votes and answers are one `PollVoteResponseData` (`option_id` required, `answer_text` / `is_answer` optional); `VotingVisibility` is a type-only union ([VotingVisibility](#voting-visibility)); `PartialPollUpdate` keys (`set`, `unset`) are `keyof UpdatePollRequest`; `QueryPollsResponse.polls: PollResponseData[]` (with `next` / `prev`, `duration`).
- **Migrate:** rename `PollResponse` -> `PollResponseData` for data; read option vote counts from `PollResponseData.vote_counts_by_option[option.id]`; use string literals `'anonymous'` / `'public'` instead of the enum.
- **Source:** `src/gen/models/index.ts:6407-6440`, `src/types.ts:338-343` (v10); `src/types.ts:3662-3700,3757` (v9)

<a id="reaction-types"></a>

### Reaction types

**Kind:** type-shape · **Impact:** medium

- **v9:** `Reaction = CustomReactionData & { type; message_id?; score?; user?; user_id?; emoji_code? }` (send payload); `ReactionResponse = Reaction & { created_at; message_id; updated_at }`.
- **v10:** the send payload is `ReactionRequest` (`custom?`); `ReactionResponse` drops `emoji_code`, requires `score`, `user`, `user_id`, `custom`; `ReactionGroupResponse.first_reaction_at` / `last_reaction_at` are required `TimestampNS`, `latest_reactions_by` (`ReactionGroupUserResponse[]`) required. The v10 name `Reaction` denotes an unrelated generated activity reaction ([same-name changes](#same-name-meaning-changes)).
- **Migrate:** `import type { ReactionRequest }` for sending; custom reaction fields under `custom`.
- **Source:** `src/gen/models/index.ts:8354,8518,8538` (v10); `src/types.ts:945,3179` (v9)

<a id="option-types"></a>

### Option types derived from generated requests

**Kind:** type-shape · **Impact:** medium

- **v9:** hand-written option bags.
- **v10:** aliases over generated requests:

  | type                                      | v9                                                                                                                                    | v10                                                                    | what breaks                                                                                                                                                                                |
  | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `BanUserOptions`                          | `UnBanUserOptions & { ban_from_future_channels?, banned_by?, banned_by_id?, ... }`                                                    | `Omit<BanRequest, 'target_user_id'>`                                   | drops `client_id`, `connection_id`, `id`, `type`, `target_user_id`, `remove_future_channels_ban`, `banned_by`, `banned_by_id`; adds `channel_cid` (`delete_messages` follows `BanRequest`) |
  | `ChannelOptions`                          | hand-written                                                                                                                          | `Omit<QueryChannelsRequest, 'filter_conditions' \| 'sort'>`            | drops `user_id`; adds `member_custom_include`                                                                                                                                              |
  | `ChannelStateOptions`                     | `RequestOptions & {...}`                                                                                                              | `{ offlineMode?, skipInitialization?, skipHydration?, withResponse? }` | `signal` moved to the trailing `requestOptions`                                                                                                                                            |
  | `DeleteMessageOptions`                    | `{ deleteForMe?, hardDelete? }`                                                                                                       | `NonNullable<Parameters<ChatApi['deleteMessage']>[1]>`                 | keys renamed to `delete_for_me`, `hard`                                                                                                                                                    |
  | `GetThreadOptions`                        | hand-written                                                                                                                          | derived from `ChatApi.getThread`                                       | adds `connection_id` (non-breaking)                                                                                                                                                        |
  | `MessageOptions`                          | `{ include_thread_participants? }`                                                                                                    | generated                                                              | adds `member_custom_include` (non-breaking)                                                                                                                                                |
  | `ModerationFlagOptions`                   | `{ custom?, moderation_payload?, user_id? }`                                                                                          | `Omit<FlagRequest, 'entity_id' \| 'entity_type' \| 'reason'>`          | drops `user_id`; adds `entity_creator_id`                                                                                                                                                  |
  | `QueryPollsOptions` / `QueryVotesOptions` | `Pager`                                                                                                                               | `Omit<Query*Request, 'filter' \| 'sort'>`                              | same keys (`limit`, `next`, `prev`)                                                                                                                                                        |
  | `SearchUserGroupsOptions`                 | hand-written                                                                                                                          | `Parameters<ChatApi['searchUserGroups']>[0]`                           | same keys                                                                                                                                                                                  |
  | `SendMessageOptions`                      | `{ force_moderation?, is_pending_message?, keep_channel_hidden?, pending?, pending_message_metadata?, skip_enrich_url?, skip_push? }` | `Omit<SendMessageRequest, 'message'>`                                  | drops `force_moderation`, `is_pending_message`, `pending`, `pending_message_metadata`; adds `scheduled_at`, `include_channel_context`, `include_mentioned_members`                         |
  | `UpdateMessageOptions`                    | `{ skip_enrich_url?, skip_push? }`                                                                                                    | `Omit<UpdateMessageRequest, 'message'>`                                | same keys                                                                                                                                                                                  |
  | `UserOptions`                             | hand-written                                                                                                                          | `Omit<QueryUsersPayload, 'filter_conditions' \| 'sort'>`               | adds `id_gt` / `id_gte` / `id_lt` / `id_lte` (non-breaking)                                                                                                                                |

- **Migrate:** rename keys as in the table; pass `signal` through `requestOptions`. Pending-message send flags are no longer accepted by the type (server support unverified).
- **Source:** `src/types.ts:80,97,110-125,150,219-221,261,349-352,419,449-451` (v10); `src/types.ts:3924` (v9)

<a id="moderation-config-types"></a>

### Moderation and app-config generated types

**Kind:** type-shape · **Impact:** low

- **v9 -> v10** (all became generated interfaces; mostly used by moderation dashboards):
  - rule actions: `ModerationActionType` removed; `AutomodRule.action`, `BlockListRule.action` (adds `mask`, `mask_flag`), `LLMRule.action` (adds `keep`) are inline literal unions.
  - renamed members: `AIImageConfig.rules: AWSRekognitionRule[]` (plus `ocr_rules` required), `AITextConfig.rules: BodyguardRule[]`, `severity_rules: BodyguardSeverityRule[]`, `profile` now required; `ModerationConfig` / `ModerationConfigResponse` -> `UpsertConfigRequest` / `ConfigResponse` (`GetConfigResponse.config`, `UpsertConfigResponse.config` now optional `ConfigResponse`).
  - optional -> required: `BlockListResponse.type/is_*_enabled` (`is_confusable_folding_enabled`, `is_leet_check_enabled`, `is_plural_check_enabled`, `is_substring_matching_enabled`), `BlockListRule.name`, `VelocityFilterConfigRule.*`, `Field.*`, `Action.name/text/type`, `FileUploadConfig.*` (`allowed_file_extensions`, `allowed_mime_types`, `blocked_file_extensions`, `blocked_mime_types`, `size_limit`; no `null`), `ChannelConfigWithInfo` booleans and `name` / `max_message_length` / `message_retention`.
  - required -> optional: `BanOptions.*`, `ContentCountRuleParameters.*`, `ImageRuleParameters.*`, `TextRuleParameters.threshold/time_window`, `VideoRuleParameters.*`, `ImageContentParameters.harm_labels`, `VideoContentParameters.harm_labels`, `UserRuleParameters.max_age`, `UserCreatedWithinParameters.max_age`, `RuleBuilderRule.id/action`, `RuleBuilderConditionGroup.*`, `RuleBuilderCondition.type`, `FlagUserOptions.reason`, `SearchWarning.channel_search_*`.
  - `Automod` / `AutomodBehavior` lose the `| (string & {})` tail; `ChannelConfigWithInfo.automod_thresholds` no longer `null`; `Thresholds` values are `LabelThresholds`; `RuleBuilderAction.type` is a closed union; `UserCustomPropertyParameters.expected_value` removed; `ModerationPayload.created_at` removed; `ModerationResponse` drops `original_text`, `action: string`; `ChatPreferences` levels are `string`; `Configs` value type is the generated `ChannelConfigWithInfo`.
  - Other interfaces in this group whose members changed: `AutomodPlatformCircumventionConfig`, `AutomodSemanticFiltersConfig`, `AutomodSemanticFiltersRule`, `AutomodToxicityConfig`, `BlockListConfig`, `BlockListOptions`, `FilterConfigResponse`, `LLMConfig`, `SubmitActionResponse`, `TextContentParameters`, `VelocityFilterConfig`.
  - Further members added, removed or retyped across these interfaces: `action_sequences`, `advanced_filters`, `ai_image_labels`, `ai_image_ocr_labels`, `ai_image_taxonomy`, `allowed_flag_reasons`, `appeal_item`, `audios`, `auto_restore_warning`, `ban_duration`, `blocklists`, `call_custom_property_params`, `call_options`, `call_type_rule_params`, `call_violation_count_params`, `cascading_action`, `cascading_threshold`, `channel_message_count_rule_params`, `chat_preferences`, `check_message_context`, `cids_per_user`, `closed_caption_rule_params`, `config_keys`, `content_country_code_params`, `content_custom_property_count_params`, `content_custom_property_params`, `content_flag_count_rule_params`, `country_code`, `fast_spam_threshold`, `fast_spam_ttl`, `filterable_custom_keys`, `flood_identical_params`, `flood_similar_params`, `grants`, `image_ids`, `image_ordered_keys`, `intent_rule_params`, `ip_content_count_rule_params`, `ip_flag_count_rule_params`, `keyframe_ocr_rule_params`, `keyframe_rule_params`, `label_operator`, `match_substring`, `ocr_content_params`, `other_media`, `partition_size`, `partition_ttl`, `probation_period`, `property_key`, `rule_names`, `rule_type`, `semantic_filter_min_threshold`, `semantic_filter_names`, `severity_descriptions`, `shadow_ban`, `skip_inbox`, `slow_spam_threshold`, `slow_spam_ttl`, `spam`, `text_ids`, `text_length`, `text_length_operator`, `text_ordered_keys`, `toxic`, `url_only`, `user_channel_ban_count_params`, `user_channel_count_params`, `user_flag_count_rule_params`, `user_identical_content_count_params`, `user_identical_image_count_params`, `user_reaction_count_params`, `user_role_params`.
- **Migrate:** retype configs from the generated interfaces; supply now-required fields.
- **Source:** `src/gen/models/index.ts`, `src/types.ts:128-130,242` (v10)

<a id="timestamp-ns"></a>

### Server timestamps are `TimestampNS` (unix nanoseconds)

**Kind:** type-shape · **Impact:** high · **PR:** #1849, #1884

- **v9:** response and event date fields were ISO `string` (`created_at`, `updated_at`, `deleted_at`, `last_read`, `last_active`, `last_message_at`, `remind_at`, `pinned_at`, `expires`, ...); `formatMessage` / `LocalMessage` converted message dates to `Date`; `Event.received_at: string | Date`.
- **v10:** `type TimestampNS = number & { readonly [timestampNsBrand]: true }`; every server-sent date on generated responses and events (391 fields) and the hand-written state types carry it; a plain `number` is not assignable. Root-exported helpers: `nsToDate`, `convertTimestampToDate`, `nsToMs`, `msToNs`, `dateToNs`, `nowNs`, `nsToRfc3339`, `asTimestampNS`, `NS_PER_MS`. `received_at?: TimestampNS` on every event. Silent failure modes (no type error): `dayjs(ns)`, `ts > Date.now()`, `if (!created_at)` (0 is valid), persisted `Date` / ISO values. Slice-specific state fields: [state timestamps](#state-timestamps).
- **Migrate:** compare and sort timestamps numerically; convert at the UI edge with `nsToDate(ts)` / `convertTimestampToDate(ts)`; mint values with `nowNs()` / `msToNs()` / `dateToNs()`; brand DB rows with `asTimestampNS()`; migrate persisted state.
- **Source:** `src/gen/models/index.ts:13-37`, `src/utils/time.ts:1-80`, `src/index.ts:115-125`, `src/types.ts:193,197` (v10); `src/types.ts:1712-1776`, `src/utils.ts:351` (v9)

<a id="date-constructor-guard"></a>

### Global `DateConstructor` overload for `new Date(timestampNs)`

**Kind:** type-shape · **Impact:** medium · **PR:** #1884

- **v9:** none.
- **v10:** `src/index.ts` re-exports `./gen/models/timestamp-guard` type-only, which declares a global `DateConstructor` overload: `new <T extends TimestampNS>(t)` returns `{ readonly ERROR_use_SDKs_nsToDate_helper_instead: never }` and is `@deprecated`. `const d = new Date(message.created_at)` still compiles; the error appears only where the result is used as a `Date` (`new Date(ts).getTime()` -> TS2339, `const x: Date = new Date(ts)` -> TS2740), plus a deprecation strike-through in editors. Code that only passes the value along (dayjs, string interpolation, `JSON.stringify`), `new Date(x ?? 0)` and `any` values are not caught. The augmentation is global for every consumer whose type graph imports `stream-chat` (packaging details in [section 1](#installation-runtime-packaging)).
- **Migrate:** `nsToDate(ts)`. The guard cannot be excluded by tsconfig for package consumers.
- **Source:** `src/gen/models/timestamp-guard.ts:13-27`, `src/index.ts:83-87`, `dist/types/index.d.ts:35` (v10)

<a id="request-dates"></a>

### Request date fields are `Date`; responses must be converted before reuse

**Kind:** type-shape · **Impact:** medium

- **v9:** request dates accepted `string | Date` in many places (`hide_history_before`, `pinned_at_*`, `created_at_*` pagination, `message_timestamp`, `remind_at: string | null`, `end_at: string`, `disabled_until: string`).
- **v10:** generated request fields are `Date` only (22 fields, e.g. `MessageRequest.pin_expires/pinned_at`, `MessagePaginationParams.created_at_*`, `MarkUnreadRequest.message_timestamp`, `CreateReminderRequest.remind_at`, `UpdateLiveLocationRequest.end_at`, `SharedLocation.end_at`, `PushPreferenceInput.disabled_until`, `UpdateChannelRequest.hide_history_before`). `ChannelUpdateOptions.hide_history_before` and `PinnedMessagePaginationOptions.pinned_at_*` (`pinned_at_after`, `pinned_at_after_or_equal`, `pinned_at_around`, `pinned_at_before`, `pinned_at_before_or_equal`) drop `string`. `ChannelUpdateOptions` follows `UpdateChannelRequest` (`accept_invite`, `add_filter_tags`, `add_members`, `cooldown`, `data`, `invites`, `reject_invite`, `remove_filter_tags`, `remove_members`). A `TimestampNS` from a response is not assignable (TS2322). Exceptions: `QueryMembersPayload`, `QueryBannedUsersPayload`, `QueryFutureChannelBansPayload` type `created_at_*` as `TimestampNS` (so `QueryMembersOptions.created_at_*` went `string` -> `TimestampNS`, and `QueryMembersOptions` gains `type`, `id`, `members`, `sort`), and `listUserGroups` takes `created_at_gt: string`.
- **Migrate:** `new Date(iso)` for literals, `nsToDate(ts)` for server values; for `queryMembers` / `queryBannedUsers` / `queryFutureChannelBans` date bounds pass `msToNs(ms)` (server acceptance of ns there is unverified).
- **Source:** `src/gen/models/index.ts:4725,4820,6815-6818,7180-7183,7223-7226`, `src/types.ts:70,132-135,137`, `src/utils/time.ts:19-21` (v10)

<a id="sort-shape"></a>

### Sort is `SortParamRequest[]`; all sort aliases removed

**Kind:** type-shape · **Impact:** high · **PR:** #1836

- **v9:** `{ field: 1 | -1 }` objects or arrays of them, typed per endpoint (`ChannelSort`, `UserSort`, `MemberSort`, `ReactionSort`, `SearchMessageSort`, `ThreadSort`, `PollSort`, `VoteSort`, `DraftSort`, `PinnedMessagesSort`, `BannedUsersSort`, `ReminderSort`, `ReviewQueueSort`, `QueryModerationConfigsSort`, `QuerySort`, `PredefinedFilterSort`, with `*SortBase`, `Sort<T>`, `SortParam`, `PredefinedFilterSortParam`, `AscDesc = 1 | -1`); a runtime normalizer converted objects to `[{ field, direction }]`.
- **v10:** every sort is `SortParamRequest[]` with `{ field?: string; direction?: number; type?: string }` (`type: 'number' | 'boolean'` for non-string custom fields). All 29 sort aliases are removed with no replacement alias (also `CampaignSort`, `QueryMessageHistorySort(Base)`, `QueryModerationRulesSort` together with their APIs). `UserSortBase` never existed. Field names are not type-checked; `direction` is any number. Sort sits inside the request (`request.sort` or `payload.sort`). Exception: the moderation `CreateQueueRequest`-style queue sort stays `Array<Record<string, any>>`.
- **Migrate:** `{ last_message_at: -1, created_at: 1 }` -> `[{ field: 'last_message_at', direction: -1 }, { field: 'created_at', direction: 1 }]`, keeping key order; type variables as `SortParamRequest[]`. Full list in the [rename table](#type-rename-table).
- **Source:** `src/gen/models/index.ts:9951-9964` (v10); `src/types.ts:1789,2396-2450,3398` (v9)

<a id="event-union"></a>

### `Event` is a discriminated union

**Kind:** type-shape · **Impact:** high

- **v9:** `Event = CustomEventData & { type: EventTypes; ...~55 optional fields }`, so `e.user?.id`, `e.cid`, `e.total_unread_count` compiled on any event.
- **v10:** `Event = (WSEvent & { received_at?: TimestampNS }) | LocalEvent | CustomEventTypeUnion`. `WSEvent` is the generated union of `{ type: '<name>' } & <Name>Event` members (the spec's `{ type: '*' } & CustomEvent` placeholder is dropped when the client is generated, see [event names](#event-type-names)); `LocalEvent` (not exported) covers `live_location_sharing.started` / `stopped`, `channels.queried` (`queriedChannels`), `connection.recovered`, `connection.fallback_activated` (`mode`), `offline_reactions.queried` (`offlineReactions`), `capabilities.changed`, `message.read_locally`. Fields exist only on the members that declare them; `EventPayload<'message.new'>` extracts one member. `SyncResponse.events` is `WSEvent[]`; `TypingStartEvent` is the generated `typing.start` payload. v9 flat fields now present only on specific members include `ai_message`, `ai_state`, `app`, `channel_custom`, `channel_id`, `channel_last_message_at`, `channel_member_count`, `channel_type`, `clear_history`, `connection_id`, `deleted_for_me`, `draft`, `first_unread_message_id`, `hard_delete`, `last_delivered_at`, `last_delivered_message_id`, `last_read_at`, `last_read_message_id`, `live_location`, `mark_messages_deleted`, `me`, `member`, `online`, `own_capabilities`, `parent_id`, `poll`, `poll_vote`, `reaction`, `reminder`, `shadow`, `team`, `thread`, `thread_id`, `total_unread_count`, `unread_channels`, `unread_count`, `unread_messages`, `unread_thread_messages`, `unread_threads`, `watcher_count`.
- **Migrate:** narrow on `event.type` (or `'field' in event`), or type handlers as `EventPayload<'...'>`; `client.on('message.new', (e) => ...)` infers the member.
- **Source:** `src/types.ts:163-209,438-441`, `src/gen/models/index.ts:11938-12023` (v10); `src/types.ts:1712-1776` (v9)

<a id="event-type-names"></a>

### `EventTypes` -> `EventType`; `EVENT_MAP` removed; event-name set changed

**Kind:** renamed · **Impact:** medium · **PR:** #1836

- **v9:** `EventTypes = 'all' | keyof typeof EVENT_MAP | keyof CustomEventTypes`; `Event['type']` was `EventTypes`, so it included `'all'`. `EVENT_MAP` runtime object exported from `src/events.ts` (70 names).
- **v10:** `EventType = Event['type'] | 'all'`; `EVENT_MAP` and `src/events.ts` deleted (no runtime list of names). `'all'` is no longer an `Event['type']` literal but remains in `EventType`, and `client.on(cb)` / `channel.on(cb)` without a name still register under `'all'` and receive every event. `'*'` is not an event type: the spec's custom-event placeholder (`{ type: '*' } & CustomEvent`) is dropped from the generated unions, because nothing is dispatched under `'*'` and custom events arrive under their own names. Names no longer in the union: `connection.changed`, `transport.changed` ([removed](#connection-changed-removed)), `channel.muted`, `channel.unmuted`, `user.unread_message_reminder` (not in the v2 event spec; the v9 SDK never handled them). Added: `app.updated`, `channel.frozen`, `channel.unfrozen`, `channel.max_streak_changed`, `connection.ok`, `connection.error`, `connection.fallback_activated`, `message.pending`, `moderation.custom_action`, `moderation.flagged`, `moderation.mark_reviewed`, `poll.deleted`, `scheduled_message.created` / `deleted` / `failed` / `sent` / `updated`, `user.deactivated`, `user.reactivated`, `user.muted`, `user_group.created` / `deleted` / `updated` / `member_added` / `member_removed`.
- **Listener names:** `on()` / `off()` on the client and on a channel accept only an `EventType` (v9 also accepted any string). A typo, a name removed in v10 such as `connection.changed`, or a custom event not declared in `CustomEventTypes` is a compile error at the call site. `'all'` types the event as the full `Event` union.
- **Migrate:** `import type { EventType }`; replace `Object.keys(EVENT_MAP)` with your own list; use `client.on(cb)` or `client.on('all', cb)` for all events; declare custom event names in `CustomEventTypes`; drop listeners for removed names; listen to `notification.channel_mutes_updated` instead of `channel.muted` / `unmuted`.
- **Source:** `src/types.ts:196-209`, `src/client.ts:987-1040,1386-1396`, `src/channel.ts:2234-2297,2877`, `src/gen/models/index.ts:11854,11939` (v10); `src/events.ts:1-75`, `src/types.ts:1783`, `src/index.ts:10` (v9)

<a id="connection-changed-removed"></a>

### `connection.changed` and `transport.changed` are no longer dispatched

**Kind:** behavior · **Impact:** high

- **v9:** `StableWSConnection` / `WSConnectionFallback` dispatched `connection.changed` (`{ online }`) on health changes (drop announcement delayed about 5 s); switching to long-poll dispatched `transport.changed` (`{ mode: 'longpoll' }`); `ConnectionChangeEvent` type exported.
- **v10:** neither is emitted and `ConnectionChangeEvent` is removed. `client.on('connection.changed', fn)` no longer compiles: the name is not an `EventType`. Socket health: `client.wsConnection.state` (`isHealthy`, `lastHealthyAt`, `lastUnhealthyAt`, see [wsConnection](#ws-connection)); device network: `client.networkConnection.state` (`isOnline`, ...); fallback switch: local `connection.fallback_activated` (`{ mode }`, see [long-poll](#long-poll-fallback)); recovery: `connection.recovered`. The stores publish every transition immediately (no 5 s debounce). Offline sync no longer listens to it ([offline sync](#offline-sync-manager)); threads no longer read it ([thread manager](#thread-manager-behaviour)).
- **Migrate:** `client.wsConnection.state.subscribeWithSelector(({ isHealthy }) => ({ isHealthy }), ({ isHealthy }) => ...)` (fires once immediately); delay banners yourself.
- **Source:** `src/connection/wsConnection/WSConnection.ts:289`, `src/connection/ConnectionRecoveryManager.ts:353` (v10); `src/connection.ts:569,576`, `src/connection_fallback.ts:51-55`, `src/client.ts:1878`, `src/types.ts:1707` (v9)

<a id="custom-events"></a>

### Custom events: payload under `event.custom`; names must be declared

**Kind:** type-shape · **Impact:** medium

- **v9:** custom events were `Event` with `CustomEventData` spread at the top level (`e.text`); any string was a valid listener name; `UserCustomEvent = CustomEventData & { type: string }` for `client.sendUserCustomEvent`.
- **v10:** custom events arrive as `CustomEvent { type; custom: CustomEventData; created_at: TimestampNS; received_at? }`; `CustomEventTypes` keys become union members `{ type: K } & Omit<CustomEvent, 'type'>`. An undeclared name is not an `EventType`, so `client.on('my_custom', cb)` and `client.off('my_custom', cb)` do not compile. `UserCustomEvent` is removed with `sendUserCustomEvent`. Sending: `channel.sendEvent({ event: { type, custom: {...} } })` ([sendEvent](#channel-send-event)).
- **Migrate:** declare names in `interface CustomEventTypes { my_custom: true }` via module augmentation; read `e.custom.text`.
- **Source:** `src/types.ts:196-206`, `src/gen/models/index.ts:2663-2668` (v10); `src/types.ts:1712,1777-1783` (v9)

<a id="event-handler-generic"></a>

### `EventHandler` is generic

**Kind:** signature · **Impact:** low

- **v9:** `EventHandler = (event: Event) => void`.
- **v10:** `EventHandler<T extends EventType = 'all'>`: the event is the full `Event` union for `'all'` (the default, so unparameterised `EventHandler` still receives every event) and `Extract<Event, { type: T }>` for any other type. `off(type, handler)` takes `EventHandler<T>` as well, so the handler passed to `on(type, handler)` can be removed with the same type. `EventHandler<string>` no longer compiles ([listener names](#event-type-names)).
- **Migrate:** use `client.on(cb)` without a name for all events; annotate handlers as `EventHandler<'message.new'>` or `(e: EventPayload<'message.new'>) => void`; replace `EventHandler<string>` with `EventHandler`.
- **Source:** `src/types.ts:209`, `src/client.ts:987-1016`, `src/channel.ts:2234-2243` (v10); `src/types.ts:1781` (v9)

<a id="connection-open"></a>

### `ConnectionOpen` / `ConnectAPIResponse` are event payload types

**Kind:** type-shape · **Impact:** low

- **v9:** `ConnectionOpen = { connection_id; cid?; created_at?; received_at?; me?; type }` (string dates).
- **v10:** `ConnectionOpen = EventPayload<'health.check'> | EventPayload<'connection.ok'>`; `ConnectAPIResponse = Promise<void | ConnectionOpen>` (the `connectUser` result). `connection_id` is on both members; `me` is required on `connection.ok` and optional on `health.check`; dates are `TimestampNS`.
- **Migrate:** narrow on `type === 'connection.ok'` to get a non-optional `me`.
- **Source:** `src/types.ts:72,244` (v10); `src/types.ts:2785` (v9)

<a id="same-name-meaning-changes"></a>

### Exported names that still compile but mean something else

**Kind:** type-shape · **Impact:** high

These imports keep compiling and fail only at use sites.

| name                     | v9 meaning                                                                | v10 meaning                                                                                                                                               | use instead                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Role`                   | role-name union `'admin' \| 'user' \| ... \| (string & {})`               | generated role object `{ name, custom, scopes, created_at, updated_at }`                                                                                  | `string` for role names (`ChannelMemberResponse.channel_role` is `string`); `Role` for `searchRoles` results. There is no `RoleName` type |
| `User`                   | alias of `UserResponse` (with `deactivated_at`, `avg_response_time`, ...) | generated `{ id: string; data?: Record<string, any> }` (unrelated)                                                                                        | `ClientUser` (connectUser input) or `UserResponse`                                                                                        |
| `Reaction`               | send-reaction payload                                                     | generated activity reaction (`activity_id`, `kind`, `children_counts`, `latest_children`, `own_children`, `target_feeds`, `target_feeds_extra_data`, ...) | `ReactionRequest`                                                                                                                         |
| `PollResponse`           | poll data                                                                 | `{ duration; poll: PollResponseData }` envelope                                                                                                           | `PollResponseData`                                                                                                                        |
| `PollOptionResponse`     | poll option data                                                          | `{ duration; poll_option: PollOptionResponseData }` envelope                                                                                              | `PollOptionResponseData`                                                                                                                  |
| `MuteResponse`           | a user mute (`{ user, target, created_at, ... }`)                         | `/moderation/mute` response `{ duration, mutes?, non_existing_users?, own_user? }`                                                                        | `UserMuteResponse`                                                                                                                        |
| `SharedLocationResponse` | location data                                                             | endpoint response (data fields plus required `duration`, optional `channel`, `message`)                                                                   | `SharedLocationResponseData`                                                                                                              |
| `ThreadResponse`         | full thread incl. `read`, `latest_replies`, `draft`                       | minimal generated thread (no `read` / `latest_replies` / `draft`)                                                                                         | `ThreadStateResponse`                                                                                                                     |
| `TypingStartEvent`       | alias of `Event`                                                          | generated `typing.start` payload                                                                                                                          | `EventPayload<'typing.start'>`                                                                                                            |
| `UpdateChannelResponse`  | channel-type update response (config fields, `grants`, ...)               | channel update response `{ channel?, members, message?, duration }`                                                                                       | channel-type admin removed (node-sdk)                                                                                                     |
| `PendingMessageResponse` | `{ message; pending_message_metadata? }`                                  | `{ message?; channel?; user? }`                                                                                                                           | read `message?`                                                                                                                           |
| `ChannelConfig`          | server channel config                                                     | per-channel instance config                                                                                                                               | `ChannelConfigWithInfo` ([channel config](#channel-config))                                                                               |
| `Event`                  | flat object                                                               | discriminated union                                                                                                                                       | [event union](#event-union)                                                                                                               |
| `ConnectionOpen`         | flat object                                                               | event payload union                                                                                                                                       | [ConnectionOpen](#connection-open)                                                                                                        |
| `VotingVisibility`       | runtime enum                                                              | type-only literal union                                                                                                                                   | string literals ([VotingVisibility](#voting-visibility))                                                                                  |
| `Command`                | hand-written, string dates                                                | generated, `TimestampNS` dates (required fields unchanged)                                                                                                | same name ([commands](#composer-commands))                                                                                                |

- **Migrate:** audit `import type { Role, User, Reaction, PollResponse, PollOptionResponse, MuteResponse, SharedLocationResponse, ThreadResponse, TypingStartEvent, UpdateChannelResponse }`.
- **Source:** `src/gen/models/index.ts:8926,11170,8354,6422,6407,5586,9841,10171,10444,10719,6335,2257` (v10); `src/permissions.ts:60`, `src/types.ts:3332,3179,3662,3757,873,4669,578,3313,1029,3131,1319,3693` (v9)

<a id="ai-state"></a>

### `AIState` literals changed

**Kind:** type-shape · **Impact:** low

- **v9:** `'AI_STATE_ERROR' | 'AI_STATE_CHECKING_SOURCES' | 'AI_STATE_THINKING' | 'AI_STATE_GENERATING' | (string & {})`.
- **v10:** `'AI_STATE_IDLE' | 'AI_STATE_ERROR' | 'AI_STATE_EXTERNAL_SOURCES' | 'AI_STATE_THINKING' | 'AI_STATE_GENERATING' | 'AI_STATE_STOP' | (string & {})`, plus a new `AIStates` constant. Still open-ended, so no compile error; `AI_STATE_CHECKING_SOURCES` is now `AI_STATE_EXTERNAL_SOURCES`.
- **Migrate:** switch statements on `'AI_STATE_CHECKING_SOURCES'` should handle `'AI_STATE_EXTERNAL_SOURCES'`; prefer `AIStates.*`.
- **Source:** `src/types.ts:354-370` (v10); `src/types.ts:4438` (v9)

<a id="attachment-metadata-custom"></a>

### Attachment metadata fields moved into `attachment.custom`

**Kind:** type-shape · **Impact:** medium

- **v9:** `Attachment` had top-level `mime_type`, `file_size`, `duration`, `waveform_data`, `latitude`, `longitude`.
- **v10:** none of these are on `Attachment`. `CustomAttachmentData` declares `mime_type?`, `file_size?`; `VoiceRecordingAttachment.custom` adds `duration?`, `waveform_data?`; location moved to `MessageResponse.shared_location`. SDK helpers read and write `custom.*` only (composer side: [upload metadata](#composer-upload-metadata)).
- **Migrate:** `attachment.custom.mime_type`, `attachment.custom.file_size`, `attachment.custom.duration`, `attachment.custom.waveform_data`.
- **Source:** `src/custom_types.ts:1-4`, `src/messageComposer/types.ts:59-65`, `src/messageComposer/attachmentIdentity.ts:75-77` (v10); `src/types.ts:2579` (v9)

<a id="utility-types"></a>

### Utility types removed

**Kind:** removed · **Impact:** low

- **v9:** `Readable`, `KnownKeys`, `PartializeKeys`, `UnknownType`, `UR`, `LiteralStringForUnion`, `CreatedAtUpdatedAt`, `Unpacked`, `ArrayOneOrMore`, `ArrayTwoOrMore` exported from `src/types.ts`; `src/types.utility.ts` had `DeepPartial` (not root-exported).
- **v10:** all removed. `RequireOnlyOne`, `RequireAtLeastOne` kept; new `RequireLiteral`, `PartializeAllBut`; `DeepPartial` is now root-exported.
- **Migrate:** inline the built-ins (`Record<string, unknown>` for `UR` / `UnknownType`, `T[]` for the array helpers, `Partial<Pick<T, K>> & Omit<T, K>` for `PartializeKeys`).
- **Source:** `src/types.ts:46-53,443-447`, `src/types.utility.ts:1-17` (v10); `src/types.ts:31-40` (v9)

<a id="channel"></a>

## 6. `Channel`

Common pattern for every generated or overridden `Channel` method: the trailing `requestOptions?: StreamRequestOptions` (`{ signal, onUploadProgress, timeout }`) replaces v9 `RequestOptions` / `axiosRequestConfig`; responses are `StreamResponse<...>` generated types. Server-side `user_id` overrides are gone from every channel method (`MarkReadRequest`, `HideChannelRequest`, `MuteChannelRequest`, `UpdateMemberPartialRequest`, `TruncateChannelRequest` carry no `user_id`); server-side code moves to `@stream-io/node-sdk`. Sending messages and reactions: [section 9](#message-operations).

<a id="channel-class"></a>

### `Channel` class and constructor

**Kind:** signature · **Impact:** medium · **PR:** #1901

- **v9:** `new Channel(client, type, id, data: ChannelData)`; plain class; `type` / `id` / `cid` writable fields; a members-only channel had `cid === 'type:undefined'` until queried.
- **v10:** `new Channel(client, type, id, data: ChannelInput)` (ctor input changed); `class Channel extends ChannelApi` (generated); `type` is `readonly`; a members-only channel's `cid` is the temporary `type:!members-<sorted ids>` until the server answers, and `isProvisional` is true while it has no id. A constructed instance is not stored anywhere (no events reach it) unless created through `client.channelManager.ensure()` / `client.channel()`.
- **Migrate:** never `new Channel(...)`; use `client.channelManager.ensure({ type, id, data })` or `client.channel()`. `data.members` must be `[{ user_id }]` objects and custom fields go under `data.custom`. Do not assign `channel.type`.
- **Source:** `src/channel.ts:227,286-316`, `src/gen/chat/ChannelApi.ts:41-46`, `src/ChannelManager.ts:532-551` (v10); `src/channel.ts:90-187` (v9)

<a id="channel-data"></a>

### `channel.data` / `channel._data` are store-backed

**Kind:** behavior · **Impact:** medium

- **v9:** `data: Partial<ChannelData & ChannelResponse>` plain field holding the very object assigned (the constructor stored the caller's `data` object); `channel.data.x = y` mutated it in place.
- **v10:** `data` is a getter/setter over `channel.state` (`Partial<ChannelResponse> | undefined`). Assigning publishes `data`, `memberCount`, `ownCapabilities` in one update; when the new object omits `member_count` or `own_capabilities`, the previous values are carried onto a copy (so `channel.data !== assigned`, and capabilities can no longer be cleared by omission). In-place edits (`channel.data.member_count = n`) are not published to subscribers. `_data` (internal) is `ChannelInput`.
- **Migrate:** replace in-place edits with `channel.data = { ...channel.data, field }`; subscribe with `channel.state.subscribeWithSelector((s) => ({ data: s.data }), ...)`.
- **Source:** `src/channel.ts:229,1376-1408` (v10); `src/channel.ts:94-95,154-158` (v9)

<a id="channel-pending-disposal"></a>

### `channel.disconnected` -> `pendingDisposal`; `_disconnect()` -> `disconnect()`

**Kind:** renamed · **Impact:** medium · **PR:** #1901

- **v9:** writable `disconnected: boolean`; `_disconnect()` set it, cleared the cooldown timer and called `state.setIsUpToDate(false)`; `getClient()` then threw "You can't use a channel after client.disconnect() was called".
- **v10:** read-only reactive getter `pendingDisposal` (slice of `channel.state`), set only by public `disconnect()`. `disconnect()` also unsubscribes configuration, stops the receipts tracker and cooldown timer, disposes `messagePaginator` / `pinnedMessagesPaginator`, and sets `watchStatus: NotWatching`; it is idempotent and sends no request. Afterwards `getClient()` throws "Channel <cid> is pending disposal ... use client.channelManager.ensure()", `query()` / `watch()` reject, `activate()` warns and no-ops. The instance stays in the channel store until `releaseUnusedChannels()`, but `ensure()` returns a fresh instance for its cid.
- **Migrate:** `channel.disconnected` -> `channel.pendingDisposal`; `channel._disconnect()` -> `channel.disconnect()`; never assign it. Re-acquire with `client.channelManager.ensure({ type, id })`.
- **Source:** `src/channel.ts:505-515,1423-1425,1477-1481,1916,3074-3102` (v10); `src/channel.ts:118,187-192,2546-2559` (v9)

<a id="channel-initialized"></a>

### `initialized` / `offlineMode` are store-backed; set by `query()` and `create()`

**Kind:** behavior · **Impact:** low · **PR:** #1901

- **v9:** plain fields; `initialized` set only by `watch()` and `queryChannels` hydration.
- **v10:** accessors over `channel.state` (reactive); any applied live response sets `initialized: true` (`query()`, `create()`, `watch()`, hydration). `create()` therefore now unlocks `markRead()` / `markUnread()`.
- **Migrate:** read as before; subscribe via `channel.state` if needed. Do not rely on `create()` leaving the channel uninitialized.
- **Source:** `src/channel.ts:1320-1326,1360-1366,2057` (v10); `src/channel.ts:109,114,1339,1677` (v9)

<a id="channel-activate-recovery"></a>

### Reconnect recovery reloads only activated channels

**Kind:** behavior · **Impact:** high · **PR:** #1841

- **v9:** when `recoverStateOnReconnect` was on, `client.recoverState()` re-queried the cids in `client.activeChannels` with one `queryChannels({ cid: { $in } }, { last_message_at: -1 }, { limit: 30 })` (so at most 30), refreshing and re-watching the channels the app had touched.
- **v10:** `client.connectionRecovery` re-runs each loaded `ChannelPaginator`'s first page (`channelManager.recover()`) and, independently (after the offline sync when an offline DB is initialized), calls `channel.reload()` only for channels with `channel.active === true` (set by `channel.activate()`, ref-counted) and not `pendingDisposal`. Other channels stay `watchStatus: WasWatching` and are re-watched lazily (`ensureWatched()`) when an event names them. `reload()` re-watches with `messages.limit` = max(loaded head window, pageSize), reconciles offline hard deletes and re-ingests failed messages; it is a no-op on a channel that is neither initialized nor offline. Client side: [connection recovery](#connection-recovery).
- **Migrate:** call `const release = channel.activate()` while a channel is on screen and `release()` on unmount. A channel opened with `watch()` but never activated is not refreshed on reconnect and misses messages sent while offline until something re-queries it. Do not re-query on `connection.recovered` for active channels; it is dispatched after the reload.
- **Source:** `src/connection/ConnectionRecoveryManager.ts:229-233,282-353`, `src/channel.ts:1455-1496,1680-1721`, `src/ChannelManager.ts:142-150,1175-1182` (v10); `src/client.ts:1782-1826` (v9)

<a id="channel-watch"></a>

### `watch()` / `stopWatching()` / `watchStatus`

**Kind:** behavior · **Impact:** medium

- **v9:** `watch(options?: ChannelQueryOptions)` awaited `wsPromise`, silently downgraded to `watch: false` without a connection id, and resolved; `stopWatching()` took no arguments. No watch bookkeeping.
- **v10:** `watch(options?: ChannelGetOrCreateRequest, requestOptions?)`: the request waits until a connection id exists ([connection id wait](#watch-waits-for-connection-id)), rejects with "No connection id is available..." when no socket is open or opening, honours `requestOptions.signal` while waiting, and rejects for a `pendingDisposal` instance. New reactive `watchStatus` (`ChannelWatchStatus.NotWatching | WasWatching | Watching`); `stopWatching(request?, requestOptions?)` sets `NotWatching`. `ensureWatched(options?)` dedupes in-flight watches and resolves to the superseding instance (replaces the v9 internal `getAndWatchChannel`).
- **Migrate:** server-side or socket-less callers pass `{ watch: false }` or use `query()`. Use `ensureWatched()` where several call sites may watch the same channel. Read `channel.watchStatus` instead of guessing from `initialized`.
- **Source:** `src/channel.ts:1432-1438,1595-1657,1731-1740`, `src/channel_state.ts:41-70` (v10); `src/channel.ts:1324-1374` (v9)

<a id="channel-query"></a>

### `query()` / `create()`: only latest-page queries update the message list

**Kind:** behavior · **Impact:** medium

- **v9:** `query(options?: ChannelQueryOptions, messageSetToAddToIfDoesNotExist = 'current')` always added the returned messages to channel state (`'current'` extended the active set, `'new'` created a disjoint set, `'latest'` the latest set) and computed pagination flags.
- **v10:** `query(options?: ChannelGetOrCreateRequest, messageSetToAddToIfDoesNotExist = 'current', requestOptions?)` (wraps generated `getOrCreate`): returned messages are seeded into `channel.messagePaginator` only for `'latest'` (what `watch()` / `create()` pass). A direct `channel.query({ messages: { id_lt } })` returns the page but leaves the message list untouched; `'current'` and `'new'` behave identically. A latest-page query without `messages` now sends `messages: { limit: messagePaginator.pageSize }` (default 100). Queries on a `pendingDisposal` instance reject. A members-only channel answered with a cid another stored instance holds is marked `supersededBy` ([channel store](#active-channels)). The option type changed, so the signature is not unchanged. `channels.queried` and `offlineDb.upsertChannels` now get `isLatestMessageSet: true` only for `'latest'` queries without `id_around` / `created_at_around` (`watch()` / `create()`, not jump/around); v9 passed the target set's `isLatest`, which was `true` for a default `'current'` query on a fresh channel or on one that extended the latest set (e.g. `query({ messages: { id_lt } })`). Offline DBs that persist messages only for the latest set no longer persist pages fetched through a direct `channel.query()`.
- **Migrate:** paginate with `channel.messagePaginator.toTail()` (older) / `toHead()` (newer) / `jumpToMessage(id)`; use `channel.query()` only for one-off reads or channel fields.
- **Source:** `src/channel.ts:1909-2085` (`isLatestMessageSet` `:2034-2038,2067-2081`) (v10); `src/channel.ts:1568-1709,2410-2440` (`isLatest` `:1679-1696`), `src/channel_state.ts:851-852` (v9)

<a id="channel-id-guards"></a>

### Id / initialization guards and synchronous throws

**Kind:** behavior · **Impact:** low

- **v9:** `_checkInitialized()` was skipped for server-side auth (`_isUsingServerAuth()`) and guarded `sendEvent`, `sendAction`, `hide`, `show`, `banUser`, `unbanUser`, `muteStatus`, `deleteReaction`, `markAsReadRequest`, `markUnread`, `shadowBan`, `removeShadowBan`, `_deleteReaction`; most methods were `async`, so a missing id surfaced as a rejected promise (`sendAction` and `muteStatus` threw synchronously).
- **v10:** `_checkInitialized()` has no server-auth bypass and is used only by `markRead()` / `markUnread()` (server-side callers on an unqueried channel now get "hasn't been initialized"). New `_checkHasId()` ("Channel isn't yet created, call getOrCreateDistinctChannel() before this operation") guards `sendMessage`, `queryMembers`, `mute`, `unmute`, `muteStatus`, `sendAction`, `banUser`, `unbanUser`, `vote`, `removeVote`, `createDraft`, `deleteDraft`, `sendSharedLocation`, `stopLiveLocationSharing`. Inherited non-async `ChannelApi` methods (`sendEvent`, `delete`, `truncate`, `getDraft`, `getPinnedMessages`, `getMessagesById`, `deleteFile`, `deleteImage`, `updateMemberPartial`, `get`, `getOrCreate`) throw synchronously for an id-less channel, so `.catch()` chains miss it. `sendEvent`, `sendAction`, `hide`, `show` no longer require a prior query.
- **Migrate:** wrap calls on members-only channels in `try` (or `await` inside `try`); create the channel (`create()` / `watch()`) first.
- **Source:** `src/channel.ts:2892-2909`, `src/gen/chat/ChannelApi.ts:48-62,194-209` (v10); `src/channel.ts:2398-2408` (v9)

<a id="channel-send-event"></a>

### `channel.sendEvent` and AI indicator methods

**Kind:** signature · **Impact:** medium

- **v9:** `sendEvent(event: Event)` (required initialization; arbitrary top-level fields); `updateAIState(messageId, state, options?)` sent `ai_state` / `message_id` / `ai_message` top-level; `clearAIIndicator()`, `stopAIResponse()`.
- **v10:** `sendEvent({ event: { type, parent_id?, custom? } }, requestOptions?)`: non-`type` / `parent_id` fields must go under `event.custom` (custom event types need `CustomEventTypes` augmentation, see [custom events](#custom-events)); no initialization required; synchronous throw for id-less channels. `updateAIState(messageId, state, options?, requestOptions?)` sends the AI fields under `event.custom`. `clearAIIndicator(requestOptions?)` / `stopAIResponse(requestOptions?)` take a placeholder first argument. Incoming `ai_indicator.*` events now also drive `channel.state.aiState` (reset to `AIStates.Idle` while offline).
- **Migrate:** `channel.sendEvent({ type: 'x', text })` -> `channel.sendEvent({ event: { type: 'x', custom: { text } } })`; pass `undefined` first to reach `requestOptions` on the AI methods.
- **Source:** `src/channel.ts:1173-1240,2405-2415`, `src/gen/chat/ChannelApi.ts:194-209` (v10); `src/channel.ts:325-330,1135-1170` (v9)

<a id="channel-uploads"></a>

### `sendFile` / `sendImage` -> `uploadFile` / `uploadImage`; `deleteFile` / `deleteImage`

**Kind:** renamed · **Impact:** medium · **PR:** #1832

- **v9:** `sendFile(uri, name?, contentType?, user?, axiosRequestConfig?)`, `sendImage(...)` (accepted `Buffer` / streams); `deleteFile(url)`, `deleteImage(url)`.
- **v10:** `uploadFile({ file, user? }, requestOptions?)` / `uploadImage({ file, upload_sizes?, user? }, requestOptions?)` (aliases of `uploadChannelFile` / `uploadChannelImage`; `file` is `File` / `Blob` / RN `{ uri, name?, type }` / URI `string`, no Node streams or Buffers); routes `/api/v2/chat/channels/{type}/{id}/file|image`. `deleteFile({ url }, requestOptions?)` / `deleteImage({ url }, requestOptions?)`, the same request shape as `client.deleteFile` / `deleteImage` (aliases of `deleteChannelFile` / `deleteChannelImage`).
- **Migrate:** `channel.sendImage(file, name, type, user, { onUploadProgress, signal })` -> `channel.uploadImage({ file, user }, { onUploadProgress, signal })`; `channel.deleteImage(url)` -> `channel.deleteImage({ url })`.
- **Source:** `src/channel.ts:597-640` (v10); `src/channel.ts:266-316` (v9)

<a id="channel-search-removed"></a>

### `channel.search` removed

**Kind:** removed · **Impact:** medium · **PR:** #1836

- **v9:** `search(query: string | MessageFilters, options?)` scoped results to the channel (`filter_conditions: { cid }`), normalized sort, rejected offset plus next.
- **v10:** removed, no channel-scoped replacement.
- **Migrate:** `client.search({ payload: { filter_conditions: { cid: channel.cid }, query | message_filter_conditions, sort: [{ field, direction }] } })`.
- **Source:** `src/channel.ts:340-387` (v9)

<a id="channel-replies-reactions-removed"></a>

### `channel.getReplies` / `channel.getReactions` removed

**Kind:** removed · **Impact:** medium

- **v9:** `getReplies(parent_id, options, sort?)` fetched replies and added them to `channel.state.threads`; `getReactions(message_id, { limit, offset })`.
- **v10:** removed. `client.getReplies({ parent_id }, { limit, id_lt, sort: [...] })` and `client.getReactions({ id }, { limit, offset })` are raw requests with no state side effect.
- **Migrate:** for thread UIs use `client.threads.ensure(...)` / `thread.messagePaginator` ([threads](#threads)); for raw data use the client methods above.
- **Source:** `src/gen/chat/ChatApi.ts` (v10); `src/channel.ts:1387-1454` (v9)

<a id="channel-last-message"></a>

### `channel.lastMessage()` removed

**Kind:** removed · **Impact:** medium

- **v9:** `lastMessage()` returned the newest of the last 5 `latestMessages`.
- **v10:** removed. `channel.messagePaginator.lastMessage` (newest message that counts for previews, skips filtered/system per config) or `messagePaginator.headmostItem` (newest loaded, unfiltered); reactive via `messagePaginator.aggregateState`.
- **Migrate:** `channel.lastMessage()` -> `channel.messagePaginator.lastMessage ?? undefined`.
- **Source:** `src/pagination/paginators/MessagePaginator.ts:188-201`, `src/pagination/paginators/BasePaginator.ts:770-773` (v10); `src/channel.ts:1198-1211` (v9)

<a id="channel-pinned-messages-by-id"></a>

### `getPinnedMessages` / `getMessagesById`

**Kind:** signature · **Impact:** low

- **v9:** `getPinnedMessages(options, sort?: PinnedMessagesSort)`, `getMessagesById(messageIds)`.
- **v10:** `getPinnedMessages({ limit?, id_lt?, ..., sort?: [{ field, direction }] }, requestOptions?)` (sort inside the request; second argument is `requestOptions`); `getMessagesById(messageIds, requestOptions?)` (wraps `getManyMessages({ ids })`).
- **Migrate:** `channel.getPinnedMessages({ limit }, { pinned_at: -1 })` -> `channel.getPinnedMessages({ limit, sort: [{ field: 'pinned_at', direction: -1 }] })`. For a reactive pinned list use `channel.pinnedMessagesPaginator` ([pinned messages](#pinned-messages-paginator)).
- **Source:** `src/gen/chat/ChannelApi.ts:347-378`, `src/channel.ts:1750-1752` (v10); `src/channel.ts:1417-1466` (v9)

<a id="channel-shared-location"></a>

### `sendSharedLocation` / `stopLiveLocationSharing`

**Kind:** signature · **Impact:** low

- **v9:** `sendSharedLocation(location, userId?)` injected `user: { id: userId }`; `stopLiveLocationSharing(payload: UpdateLocationPayload)` spread the whole payload into `client.updateLocation` with `end_at` as ISO string.
- **v10:** `sendSharedLocation(location: SharedLocation & { message_id? })` (no user injection; queued offline only when `message_id` is set); `stopLiveLocationSharing(payload: UpdateLiveLocationRequest, requestOptions?)` sends only `{ latitude, longitude, message_id, end_at: new Date() }` via `client.updateLiveLocation`; both throw for id-less channels.
- **Migrate:** drop the `userId` argument (server-side only).
- **Source:** `src/channel.ts:762-806` (v10); `src/channel.ts:724-760` (v9)

<a id="channel-typing-actions"></a>

### `keystroke` / `stopTyping` / `sendAction` and typing gating

**Kind:** signature · **Impact:** low

- **v9:** `keystroke(parent_id?, { user_id }?)`, `stopTyping(parent_id?, { user_id }?)`; typing gated on `getConfig()?.typing_events` (no typing events before the channel was queried); `sendAction(messageID, formData)` required initialization and threw on empty id.
- **v10:** `keystroke(parentId?, requestOptions?)`, `stopTyping(parentId?, requestOptions?)`; gated on resolved `channel.config.typingEvents.enabled` (server flag ANDed with client config; unknown server config counts as enabled), `channel.isProvisional` and socket health. `sendAction(messageId, formData, requestOptions?)` requires only an id and calls `client.runMessageAction`.
- **Migrate:** drop `{ user_id }`. To disable typing client-side: `client.config.setConfig('channel', { typingEvents: { enabled: false } })`.
- **Source:** `src/channel.ts:1116-1160,1251-1279` (v10); `src/channel.ts:1086-1196` (v9)

<a id="channel-drafts"></a>

### Draft methods

**Kind:** signature · **Impact:** medium

- **v9:** `createDraft(message: DraftMessagePayload)`, `deleteDraft({ parent_id }?)`, `getDraft({ parent_id }?)`, internal `_createDraft(message)`, `_deleteDraft({ parent_id })`.
- **v10:** `createDraft({ message: MessageRequest }, requestOptions?)`, `deleteDraft({ parent_id }?, requestOptions?)`, `getDraft({ parent_id }?, requestOptions?)` (inherited); `_createDraft` / `_deleteDraft` take the same request shapes; `createDraft` / `deleteDraft` require an id; the offline queue payload is the argument list `[{ message }, requestOptions?]` (a passed `requestOptions`, including an `AbortSignal`, is persisted into the pending task). The composer side skips provisional channels ([composer drafts](#composer-drafts)).
- **Migrate:** `channel.createDraft({ text })` -> `channel.createDraft({ message: { text } })`.
- **Source:** `src/channel.ts:2165-2215`, `src/gen/chat/ChannelApi.ts:143-193` (v10); `src/channel.ts:1817-1930` (v9)

<a id="channel-votes"></a>

### `vote` / `removeVote`

**Kind:** signature · **Impact:** low

- **v9:** `vote(messageId, pollId, vote)`, `removeVote(messageId, pollId, voteId)`.
- **v10:** `vote({ message_id, poll_id }, { vote: { option_id?, answer_text? } }, requestOptions?)`, `removeVote({ message_id, poll_id, vote_id }, requestOptions?)`; both require an id.
- **Migrate:** wrap positional arguments into the path object and `{ vote }`.
- **Source:** `src/channel.ts:2155-2163` (v10); `src/channel.ts:1802-1815` (v9)

<a id="channel-update"></a>

### `update` / `_update` / slow mode / `updatePartial`

**Kind:** signature · **Impact:** medium

- **v9:** `update(channelData?, updateMessage?, options?)` stripped reserved keys (`cid`, `id`, `config`, `created_at`, `member_count`, `own_capabilities`, ...) then called `_update(payload)`; `enableSlowMode(n)`, `disableSlowMode()`; `updatePartial(update: PartialUpdateChannel)`.
- **v10:** `update({ data?, message?, skip_push?, hide_history?, hide_history_before?: Date, cooldown?, add_members?, ... }, requestOptions?)` (no reserved-key stripping; `data` is `ChannelInputRequest`); sets `channel.data` from the response. `_update` removed. `enableSlowMode(n, requestOptions?)`, `disableSlowMode(requestOptions?)`. `updatePartial({ set?, unset? }, requestOptions?)` (wraps generated `updateChannelPartial`) returns `StreamResponse<UpdateChannelPartialResponse>` and dispatches `capabilities.changed` only when the response carries `own_capabilities`.
- **Migrate:** `channel.update({ name }, { text })` -> `channel.update({ data: { custom: { name } }, message: { text } })`; `_update(payload)` -> `update(payload)`.
- **Careful:** `update` is a full update, so `data.custom` replaces the channel's entire custom data; the mapping above drops every other custom field (as v9's `update({ name })` did). To change one field, spread the current values (`update({ data: { custom: { ...channel.data?.custom, name } } })`) or use `channel.updatePartial({ set: { name } })`.
- **Source:** `src/channel.ts:693-760` (v10); `src/channel.ts:623-722,936-950` (v9)

<a id="channel-delete-truncate"></a>

### `delete` / `truncate`

**Kind:** signature · **Impact:** low

- **v9:** `delete({ hard_delete? })`, `truncate(options?: TruncateOptions)` (`truncated_at?: Date`, `user?`, `user_id?`).
- **v10:** `delete({ hard_delete? }?, requestOptions?)` (inherited, same flag); `truncate({ hard_delete?, skip_push?, truncated_at?: Date, member_ids?, message? }?, requestOptions?)`; `TruncateChannelRequest` has no `user_id`; both throw synchronously for id-less channels.
- **Migrate:** drop `user_id` / `user`.
- **Source:** `src/gen/chat/ChannelApi.ts:48-62,447-462`, `src/gen/models/index.ts:10402` (v10); `src/channel.ts:762-785` (v9)

<a id="channel-membership-helpers"></a>

### Membership helpers; `addModerators` / `demoteModerators` / `assignRoles` removed

**Kind:** removed · **Impact:** medium · **PR:** #1849

- **v9:** `addMembers(members, message?, options?)`, `addFilterTags`, `removeFilterTags`, `inviteMembers`, `removeMembers`, `acceptInvite(options?)`, `rejectInvite(options?)`, `addModerators(members, message?, options?)`, `demoteModerators(...)`, `assignRoles(roles, message?, options?)`; `message: Message`, `options: { hide_history?, hide_history_before?, skip_push? }`.
- **v10:** `addMembers({ members, message?, ...options }, requestOptions?)`, and likewise `inviteMembers` / `removeMembers` (`members`) and `addFilterTags` / `removeFilterTags` (`tags`): one request object holding the items, the notification `message` (`MessageRequest`) and any other `ChannelUpdateOptions` (`Omit<UpdateChannelRequest, 'message'>`) field, typed `AddMembersRequest`, `InviteMembersRequest`, `RemoveMembersRequest`, `FilterTagsRequest`. `addMembers` / `inviteMembers` map string ids to `{ user_id }`. `acceptInvite` / `rejectInvite(options?: UpdateChannelRequest, requestOptions?)`. `addModerators`, `demoteModerators`, `assignRoles` removed (the client-side `UpdateChannelRequest` has no `add_moderators` / `demote_moderators` / `assign_roles`).
- **Migrate:** `addMembers(ids, message, { hide_history: true })` -> `addMembers({ members: ids, message, hide_history: true })`, the same for the other four (`addFilterTags(tags)` -> `addFilterTags({ tags })`). Moderator promotion and role assignment move to the server-side node SDK; at insert time use `channel.addMembers({ members: [{ user_id, channel_role: 'channel_moderator' }] })`.
- **Source:** `src/channel.ts:816-958` (v10); `src/channel.ts:787-935` (v9)

<a id="channel-update-member-partial"></a>

### `updateMemberPartial`; `partialUpdateMember` removed

**Kind:** signature · **Impact:** low

- **v9:** `updateMemberPartial(updates, { userId? })` (could target another user via the `user_id` query param); `partialUpdateMember(user_id, updates)` (deprecated) targeted any member.
- **v10:** inherited `updateMemberPartial({ set?, unset? }?, requestOptions?)` updates the connected user's own membership only (`UpdateMemberPartialRequest` has only `set` / `unset`); `partialUpdateMember` removed.
- **Migrate:** `channel.updateMemberPartial({ set }, { userId })` / `partialUpdateMember(id, { set })` -> `channel.updateMemberPartial({ set })` for the current user; other users' memberships are server-side only.
- **Source:** `src/gen/chat/ChannelApi.ts:296-312`, `src/gen/models/index.ts:10757` (v10); `src/channel.ts:429-471` (v9)

<a id="channel-archive-pin"></a>

### `archive` / `unarchive` / `pin` / `unpin`

**Kind:** signature · **Impact:** medium

- **v9:** `archive({ user_id? })` etc.; resolved to `resp.channel_member`.
- **v10:** `archive(requestOptions?)` etc.; act on the connected user only; resolve to the full `updateMemberPartial` response (`{ channel_member?, duration }`).
- **Migrate:** `const member = await channel.archive()` -> `const { channel_member } = await channel.archive()`; pass `undefined` first to reach `requestOptions`.
- **Source:** `src/channel.ts:1029-1082` (v10); `src/channel.ts:997-1075` (v9)

<a id="channel-mute"></a>

### `mute` / `unmute` / `muteStatus`

**Kind:** signature · **Impact:** low

- **v9:** `mute({ expiration?, user_id? })`, `unmute({ user_id? })` (sent `channel_cid`); `muteStatus()` required initialization and returned `{ muted, createdAt: Date | null, expiresAt: Date | null }`.
- **v10:** `mute({ expiration?, channel_cids? }?, requestOptions?)`, `unmute(...)` (send `channel_cids: [cid]`, require an id; `MuteChannelRequest` has no `user`); `muteStatus()` requires only an id and returns `ChannelMuteStatus` with `TimestampNS | null` dates. Reactive copy at the `channel.state` slice `muteStatus`, kept in sync on `notification.channel_mutes_updated` / `health.check` (internal `_syncMuteStatus`).
- **Migrate:** drop `user_id`; convert timestamps with `nsToDate`; replace `notification.channel_mutes_updated` listeners with a `channel.state` selector on `muteStatus`.
- **Source:** `src/channel.ts:977-1015,1090-1114`, `src/channel_state.ts:111-127` (v10); `src/channel.ts:957-995,1077-1084` (v9)

<a id="channel-hide-show"></a>

### `hide` / `show`

**Kind:** signature · **Impact:** low

- **v9:** `hide(userId = null, clearHistory = false)`, `show(userId = null)`; both required initialization.
- **v10:** `hide({ clear_history? }?, requestOptions?)`, `show({}?, requestOptions?)`; no initialization requirement; the requests have no `user_id`.
- **Migrate:** `channel.hide(null, true)` -> `channel.hide({ clear_history: true })`.
- **Source:** `src/channel.ts:2113-2127`, `src/gen/models/index.ts:3960,9942` (v10); `src/channel.ts:1728-1755` (v9)

<a id="channel-ban"></a>

### `banUser` / `unbanUser`; `shadowBan` / `removeShadowBan` removed

**Kind:** signature · **Impact:** medium

- **v9:** `banUser(targetUserID, options: BanUserOptions)` (v1 `/moderation/ban` with `type` / `id`), `unbanUser(targetUserID, options?)`, `shadowBan(targetUserID, options)`, `removeShadowBan(targetUserID)`; all required initialization.
- **v10:** `banUser(targetUserId, options: Omit<BanUserOptions, 'channel_cid'>)` goes through `client.moderation.ban({ ...options, target_user_id, channel_cid })` (V2; returns `StreamResponse<ModerationBanResponse>`; `delete_reactions`, `ban_from_future_channels` follow `BanRequest`); `unbanUser(targetUserId, options?)` keeps the v1 call. Both require only an id. `shadowBan` / `removeShadowBan` removed.
- **Migrate:** `channel.shadowBan(id, o)` -> `channel.banUser(id, { ...o, shadow: true })`; `channel.removeShadowBan(id)` -> `channel.unbanUser(id, { shadow: true })`.
- **Source:** `src/channel.ts:2094-2144`, `src/types.ts:97,139-147` (v10); `src/channel.ts:1711-1800` (v9)

<a id="channel-query-members"></a>

### `queryMembers`

**Kind:** signature · **Impact:** medium

- **v9:** `queryMembers(filterConditions, sort?, options?, requestOptions?)` (sort normalized from `{ field: dir }`).
- **v10:** `queryMembers({ payload?: Partial<QueryMembersPayload> }?, requestOptions?)`; `type` / `id` filled in; an id-less (members-only) channel now rejects with `Channel isn't yet created...` because `_checkHasId()` runs first (v9 sent `data.members` instead; the v10 `members` branch is dead code, tracked in v10-followups.md); sort is `[{ field, direction }]`; date bounds are `TimestampNS` ([request dates](#request-dates)).
- **Migrate:** `channel.queryMembers(f, s, o)` -> `channel.queryMembers({ payload: { filter_conditions: f, sort: [...], ...o } })`. To query members of a distinct channel before it is created, call `watch()` / `create()` first (or `client.queryMembers({ payload: { type, members, ... } })`).
- **Source:** `src/channel.ts:652-682` (guard `:656`, `members` branch `:665`) (v10); `src/channel.ts:390-427` (v9)

<a id="channel-mark-read"></a>

### `markRead` semantic swap; `markAsReadRequest` removed; `markReadViaReporter`

**Kind:** behavior · **Impact:** high

- **v9:** `markRead(data?)` called `client.messageDeliveryReporter.markRead(channel)` (neither batched nor throttled; only `throttledMarkRead` throttles), which called `markAsReadRequest` and on success dropped the channel's delivery candidate; `markAsReadRequest(data?)` was the direct POST. Both returned `Promise<EventAPIResponse | null>`.
- **v10:** `markRead(request?: MarkReadRequest, requestOptions?)` is the direct request (no reporter, no delivery-candidate cleanup, no `requestHandlers.markReadRequest`, no local-unread fallback); returns `StreamResponse<MarkReadResponse>` (`event?` optional). `markReadViaReporter(data?)` replaces the v9 `markRead` path (reporter, drops the delivery candidate) and adds two v10-only behaviours: the `requestHandlers.markReadRequest` hook and the `markReadLocally()` fallback when read events are off and `localUnreadCountEnabled`; returns `Partial<StreamResponse<MarkReadResponse>> | null`. `markAsReadRequest` removed. Same name, different behaviour: code keeping `markRead()` silently loses candidate cleanup (and bypasses the new hook and fallback). Reporter details: [delivery reporter](#delivery-reporter-mark-read).
- **Migrate:** v9 `markRead()` -> `markReadViaReporter()`; v9 `markAsReadRequest()` -> `markRead()`. Narrow `response?.event`. `MarkReadOptions` -> `MarkReadRequest` (`{ message_id?, thread_id? }`).
- **Source:** `src/channel.ts:1290-1313`, `src/messageDelivery/MessageDeliveryReporter.ts:398-436` (v10); `src/channel.ts:1220-1254`, `src/messageDelivery/MessageDeliveryReporter.ts:281-298` (v9)

<a id="channel-read-events-throw"></a>

### `markRead` / `markUnread` throw when read events are off

**Kind:** behavior · **Impact:** medium

- **v9:** `markAsReadRequest` / `markUnread(data: MarkUnreadOptions)` resolved `null` without a request when the server config lacked `read_events`, when the config was not loaded yet, or when `own_capabilities` lacked `read-events`; server-side auth bypassed all gates.
- **v10:** both `throw new Error("Read events are disabled ...")` when the resolved `channel.config.readEvents.enabled` is false (server `read_events` ANDed with client `channel.readEvents.enabled`); an unknown server config counts as enabled; the `read-events` own-capability check is gone (the request is sent; the remaining capability checks elsewhere are tracked in v10-followups.md); no server-auth bypass; `_checkInitialized` still applies. `markUnread(request?: MarkUnreadRequest, requestOptions?)` (argument optional; `message_timestamp` is `Date`). Through the reporter, `markReadViaReporter()` therefore rejects for read-events-disabled channels unless a handler or `localUnreadCountEnabled` is configured.
- **Migrate:** replace `if (res === null)` checks with `try/catch`, or check `channel.config.readEvents.enabled` first.
- **Source:** `src/channel.ts:1303-1313,1506-1516,439-449` (v10); `src/channel.ts:1231-1281` (v9)

<a id="channel-mark-read-locally"></a>

### `markReadLocally` / local unread count

**Kind:** behavior · **Impact:** low · **PR:** #1886

- **v9:** enabled by client option `isLocalUnreadCountEnabled`; dispatched `message.read_locally` with `created_at` ISO string and `last_read_message_id` from `lastMessage()`.
- **v10:** enabled per channel config `client.config.setConfig('channel', { readEvents: { localUnreadCountEnabled: true } })` (applies only when `readEvents.enabled` is false); event `created_at` is `nowNs()` (`TimestampNS`), `last_read_message_id` from `messagePaginator.headmostItem`; returns the typed event.
- **Migrate:** move the option to the channel config; treat `created_at` as `TimestampNS`.
- **Source:** `src/channel.ts:1529-1546,143` (v10); `src/channel.ts:1283-1303` (v9)

<a id="channel-last-read"></a>

### `lastRead` / `countUnread` / `countUnreadMentions`

**Kind:** type-shape · **Impact:** low

- **v9:** `lastRead(): Date | null | undefined`; `countUnread(lastRead?: Date | null)` iterated `state.latestMessages`.
- **v10:** `lastRead(): TimestampNS | null | undefined`; `countUnread(lastRead?: TimestampNS | null)` (nullish check, so `0` is a valid timestamp) and `countUnreadMentions()` iterate `messagePaginator.headItems`; `countUnread()` without an argument returns the derived `state.unreadCount` ([ChannelState](#channel-state-store)).
- **Migrate:** see [TimestampNS](#timestamp-ns).
- **Source:** `src/channel.ts:1760-1831` (v10); `src/channel.ts:1469-1548` (v9)

<a id="channel-config"></a>

### `getConfig()` removed; `ChannelConfig` changes meaning

**Kind:** renamed · **Impact:** high · **PR:** #1831

- **v9:** `channel.getConfig()` returned `client.configs[cid]` (`ChannelConfigWithInfo`). Root type `ChannelConfig = ChannelConfigFields & CreatedAtUpdatedAt & { commands? }` was the server channel-type config (`read_events`, `typing_events`, `uploads`, `replies`, `reactions`, `search`, `mutes`, `quotes`, `polls`, `reminders`, `shared_locations`, `url_enrichment`, `custom_events`, `connect_events`, `delivery_events`, `user_message_reminders`, `count_messages`, `mark_messages_pending`, `skip_last_msg_update_for_system_msgs`, `push_level`, `push_notifications`, `max_message_length`, `message_retention`, `automod`, `automod_behavior`, `automod_thresholds`, `blocklist_behavior`, `name`, `created_at`, `updated_at`).
- **v10:** `channel.serverConfig` getter (same server value, `undefined` until queried; cannot be mocked with `vi.fn()`). New `channel.config` (resolved, frozen) / `channel.configState` (store) of type `ChannelConfig`, which now means the resolved instance config `{ requestHandlers?, typingEvents: { enabled }, readEvents: { enabled, localUnreadCountEnabled }, replies: { enabled }, userMessageReminders: { enabled }, deliveryEvents: { enabled }, availableCommands }`; `initializeConfig` resets it. Default `DEFAULT_CHANNEL_CONFIG`. Code typed with v9 `ChannelConfig` still compiles where only shared keys are read, but `config.read_events`, `config.commands` etc. no longer exist on it.
- **Migrate:** `channel.getConfig()?.uploads` -> `channel.serverConfig?.uploads`; v9 `ChannelConfig` type -> `ChannelConfigWithInfo`; feature gating -> `channel.config.readEvents.enabled` etc.; `commands` -> `channel.config.availableCommands`.
- **Source:** `src/channel.ts:116-175,215-222,526-561` (v10); `src/channel.ts:199-202`, `src/types.ts:2634-2679` (v9)

<a id="channel-listeners"></a>

### `channel.listeners` is a Map of Sets; `on` / `off`

**Kind:** type-shape · **Impact:** medium

- **v9:** `listeners: { [key: string]: (string | EventHandler)[] }`; `on(eventType: EventTypes, cb)`; registering the same callback twice called it twice.
- **v10:** `listeners: Map<EventType, Set<EventHandler>>`; `on<T extends EventType | string>(eventType: T, callback: EventHandler<T>)`, `off<T>(eventType, callback)`; duplicate registrations dedupe and one `unsubscribe` removes them; empty sets are deleted.
- **Migrate:** `channel.listeners = {}` -> `channel.listeners.clear()`; `channel.listeners['x'].length` -> `channel.listeners.get('x')?.size`; `EventTypes` -> `EventType` ([event names](#event-type-names)).
- **Source:** `src/channel.ts:232,2234-2297` (v10); `src/channel.ts:98,1932-1995` (v9)

<a id="channel-event-handling"></a>

### Channel event handling changes

**Kind:** behavior · **Impact:** medium

- **v9:** `_handleChannelEvent` mutated `channel.state` fields in place and wrote messages to message sets.
- **v10:** state is written through `channel.state` (store), the paginators and `client.messageStore`. Observable differences:

  | Event                                                    | v9                                                                                                 | v10                                                                                                                                                                                                             |
  | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `message.new` / `notification.message_new`               | `data.hidden` untouched                                                                            | sets `channel.data.hidden = false`                                                                                                                                                                              |
  | `message.new` (channel message)                          | pushed to the list only when `isUpToDate`; own unread bumped for every countable message           | always ingested (lands in the head interval when an older window is shown); own unread and unread snapshot not bumped while `messagePaginator.isViewingLive`; own read row seeded (`last_read: 0`) when missing |
  | `message.new` / `message.deleted` thread-only reply      | stored in `state.threads`                                                                          | ignored by the channel (owned by `Thread` via `client.threads`)                                                                                                                                                 |
  | `message.updated` / `message.undeleted` with `parent_id` | applied to `threads` and (if shown) the channel list                                               | applied to the channel list for `show_in_channel` replies; thread-only replies are owned by `Thread`                                                                                                            |
  | `message.deleted` soft                                   | message replaced in sets                                                                           | written to `client.messageStore` only if held                                                                                                                                                                   |
  | `message.read`, `message.read_locally`                   | read row reset, delivery untouched                                                                 | also advances `last_delivered_at` / `last_delivered_message_id`, clears `first_unread_message_id`                                                                                                               |
  | `notification.mark_read`                                 | not handled                                                                                        | handled like `message.read` unless it carries `thread_id`                                                                                                                                                       |
  | `message.delivered`                                      | overwrote delivery (could move back)                                                               | monotonic; new rows get `last_read = created_at`                                                                                                                                                                |
  | `reaction.*`                                             | replaced `event.message` with the state-merged message (own_reactions recomputed) before listeners | `event.message` left as received; the store copy is upserted only if held                                                                                                                                       |
  | `typing.*`                                               | `state.typing[id] = event`                                                                         | `state.setTypingEvent` / `removeTypingEvent`; `channel.state` is the only owner (see [ChannelState store](#channel-state-store))                                                                                |
  | `ai_indicator.*`                                         | none                                                                                               | `state.aiState`                                                                                                                                                                                                 |
  | `channel.updated`                                        | carried over `hidden`, `own_capabilities`                                                          | also carries over `member_count`                                                                                                                                                                                |
  | `channel.truncated`                                      | `channel.data` untouched                                                                           | `event.channel` merged into `channel.data` (so `truncated_at`, `truncated_by`, `updated_at`, ... land on `channel.data`, `channel.state.data` and `memberCount`)                                                |
  | `user.presence.changed` (client-level)                   | replaced the user in `members`, `watchers` and `read` (mutated in place)                           | replaces it in `members`, `watchers` and own `membership` (new objects published); `read[id].user` is refreshed only on `user.updated`, so read rows keep the old `online` / `last_active`                      |

- **Migrate:** listeners that relied on `event.message.own_reactions` being recomputed must read the message from `channel.messagePaginator.getItem(id)`; thread UIs must hold a `Thread`.
- **Source:** `src/channel.ts:2377-2870` (`channel.truncated` `:2689-2690`), `src/client.ts:1096-1126,1244-1247` (v10); `src/channel.ts:1997-2367` (`channel.truncated` `:2183-2214`), `src/client.ts:1508-1525,1631-1632` (v9)

<a id="user-messages-deleted-hard"></a>

### `user.messages.deleted` with `hard_delete` removes messages

**Kind:** behavior · **Impact:** medium

- **v9:** hard and soft delete both kept the user's messages, converted to `type: 'deleted'` (hard also stripped content), across all message sets, `state.threads` and `pinnedMessages`.
- **v10:** hard delete removes the messages from `messagePaginator` and `pinnedMessagesPaginator`; soft delete tombstones; every loaded message is processed, in all loaded intervals and not only the active window; thread replies are handled by `Thread.handleUserMessagesDeleted`. `message.deleted` with `hard_delete` keeps removing (as in v9). `messageOperations.delete({ localMessage, options: { hard: true } })` removes optimistically. `channel.delete({ hard_delete })` is unchanged.
- **Migrate:** UIs must not expect a "deleted" placeholder after a hard user-messages delete.
- **Source:** `src/channel.ts:2547-2577`, `src/pagination/paginators/MessageIntervalPaginator.ts:1405-1457` (v10); `src/channel.ts:2096-2120`, `src/channel_state.ts:776-800` (v9)

<a id="channel-state"></a>

## 7. `ChannelState` and message paginators

<a id="channel-state-store"></a>

### `ChannelState` is a `StateStore<ChannelStateData>`

**Kind:** type-shape · **Impact:** high · **PR:** #1834

- **v9:** plain class with writable fields `watcher_count`, `typing`, `read`, `watchers`, `members`, `membership`, `unreadCount` (own counter, assignable, separate from `read[me].unread_messages`).
- **v10:** `class ChannelState extends StateStore<ChannelStateData>` (from `@stream-io/state-store`: `getLatestValue`, `subscribe`, `subscribeWithSelector`, `next`, `partialNext`, `addPreprocessor`, `merge`; protected `value`, `handlers`, `preprocessors`). Flat slices: `watcherCount`, `watchers`, `watchStatus`, `typing`, `read`, `members`, `memberCount`, `membership`, `ownCapabilities`, `data`, `muteStatus`, `initialized`, `offlineMode`, `pendingDisposal`, `supersededBy`, `active`, `aiState`. `members` / `read` / `watchers` / `typing` / `membership` / `watcher_count` / new `member_count` are getter/setter proxies: assigning a new object publishes, in-place mutation (`state.read[uid] = ...`, `state.members[uid].x = ...`) does not notify subscribers. `unreadCount` is a getter only (`read[ownUserId].unread_messages ?? 0`): assigning throws in strict mode. `read[ownUserId].unread_messages` (and so `unreadCount`) is no longer bumped by muted/silent/shadowed messages (v9 bumped the read row for all of them; only its separate `unreadCount` skipped them) or by messages arriving while `isViewingLive`. `typing` (still `Record<string, Event>`) is owned by `channel.state` alone; the text composer keeps no copy, as in v9. The v10 release candidates mirrored it into `messageComposer.textComposer.state` `typing`, and UIs built on an rc must read the `channel.state` slice instead (stream-chat-react's `TypingIndicator` reads the composer copy: `useStateStore(channel.state, (s) => ({ typing: s.typing }))`); `membership` initializes to `{}`. New `setTypingEvent`, `removeTypingEvent`, `resetAIState`. Read timestamps are `TimestampNS`. `ChannelState.formatMessage` remains, but now returns the v10 `LocalMessage` (dates stay `TimestampNS`, see [formatMessage](#format-message)) and accepts only `MessageResponse | LocalMessage` (v9 also accepted `MessageResponseBase`).
- **Migrate:** subscribe with `channel.state.subscribeWithSelector((s) => ({ read: s.read }), ...)` (React: `useStateStore(channel.state, selector)`); replace in-place writes with whole-object assignment or `partialNext`; never assign `unreadCount` (use `markRead` / `markReadLocally`).
- **Source:** `src/channel_state.ts:201-374` (`formatMessage` `:338-344`) (v10); `src/channel_state.ts:70-122` (v9)

<a id="message-paginator"></a>

### Message storage moved from `ChannelState` to `channel.messagePaginator`

**Kind:** removed · **Impact:** high

- **v9:** `ChannelState` owned the message list: `messages`, `latestMessages`, `messageSets`, `messagePagination`, `last_message_at`, `mutedUsers` (never populated) and `addMessageSorted`, `addMessagesSorted`, `removeMessage`, `removeMessageFromArray`, `findMessage`, `findMessageByTimestamp`, `loadMessageIntoState`, `pruneOldest`, `initMessages`, `clearMessages`, `filterErrorMessages`, `addReaction`, `removeReaction`, `_addReactionToState`, `_addOwnReactionToMessage`, `_removeOwnReactionFromMessage`, `_removeReactionFromState`, `_updateQuotedMessageReferences`, `removeQuotedMessageReferences`, `_updateMessage`, `_addToMessageList`, `updateUserMessages`, `deleteUserMessages`.
- **v10:** all removed. `channel.messagePaginator` (`MessagePaginator`, interval-based, backed by the shared `client.messageStore`; window publishes are throttled in production):

  | v9                                                                                          | v10                                                                                                   |
  | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
  | `state.messages`                                                                            | `messagePaginator.items` / `.state` `items`                                                           |
  | `state.latestMessages`                                                                      | `messagePaginator.headItems`                                                                          |
  | `state.messagePagination.hasPrev` / `hasNext`                                               | `messagePaginator.state` `hasMoreTail` (older) / `hasMoreHead` (newer)                                |
  | `state.last_message_at`                                                                     | `messagePaginator.lastMessageAt` (`TimestampNS`, derived; reactive via `aggregateState`)              |
  | `addMessageSorted(m)` / `addMessagesSorted(ms)`                                             | `messagePaginator.ingestItem(m)` / `ingestPage(...)`                                                  |
  | `removeMessage({ id })`                                                                     | `messagePaginator.removeItem({ id })`                                                                 |
  | `findMessage(id)` / `findMessageByTimestamp(ts)`                                            | `messagePaginator.getItem(id)` / `findItemByTimestamp(ts)`                                            |
  | `loadMessageIntoState(id)`                                                                  | `messagePaginator.jumpToMessage(id)`; `jumpToTheLatestMessage()`, `jumpToTheFirstUnreadMessage()`     |
  | `pruneOldest(n)`                                                                            | `client.config.setConfig('messagePaginator', { maxLoadedItems })`                                     |
  | `clearMessages()` / `initMessages()`                                                        | `messagePaginator.clearStateAndCache()`                                                               |
  | `addReaction` / `removeReaction`                                                            | `channel.messageOperations.addReaction` / `deleteReaction`, or WS events                              |
  | `filterErrorMessages`, `updateUserMessages`, `deleteUserMessages`, quoted-reference helpers | handled internally (`reflectUserUpdate`, `applyMessageDeletionForUser`, `reflectQuotedMessageUpdate`) |
  | `mutedUsers`                                                                                | `client.mutedUsersStore` ([mutes](#client-user-listeners-mutes))                                      |

- **Migrate:** read and write the message list only through `channel.messagePaginator`; paginate with `toTail()` / `toHead()`. `MessageSet` type removed ([rename table](#type-rename-table)).
- **Source:** `src/pagination/paginators/MessagePaginator.ts:109-563`, `src/pagination/paginators/MessageIntervalPaginator.ts:521-1543` (v10); `src/channel_state.ts:75-1008` (v9)

<a id="pinned-messages-paginator"></a>

### `pinnedMessages` -> `channel.pinnedMessagesPaginator`

**Kind:** removed · **Impact:** medium

- **v9:** `state.pinnedMessages` array maintained by `addPinnedMessages` / `addPinnedMessage` / `removePinnedMessage`.
- **v10:** `channel.pinnedMessagesPaginator` (`PinnedMessagePaginator`): seeded from `pinned_messages` on every query, auto-adds/removes on message events by `pinned`, pruned on `channel.truncated`, cleared on full truncate / `channel.hidden` with `clear_history`.
- **Migrate:** `channel.state.pinnedMessages` -> `channel.pinnedMessagesPaginator.items`.
- **Source:** `src/pagination/paginators/PinnedMessagePaginator.ts:54-154`, `src/channel.ts:2935-2938` (v10); `src/channel_state.ts:75,322-352` (v9)

<a id="channel-state-threads"></a>

### `channel.state.threads` removed

**Kind:** removed · **Impact:** medium

- **v9:** `channel.state.threads[parent_id]` held replies, fed by `message.new` / `updated` / `deleted`, reactions, `getReplies()`.
- **v10:** removed; replies live only in `Thread` instances held by `client.threads` (`client.threads.ensure({ channel, parentMessage })`, `thread.messagePaginator`).
- **Migrate:** `channel.state.threads[id]` -> `client.threads.get(id)?.messagePaginator.items`.
- **Source:** `src/channel.ts:2543-2546,2584-2587,2680` (v10); `src/channel_state.ts:77` (v9)

<a id="is-up-to-date"></a>

### `isUpToDate` / `setIsUpToDate` removed

**Kind:** removed · **Impact:** medium

- **v9:** the UI set `state.setIsUpToDate(false)` while showing an older window so `message.new` was not pushed; `_disconnect()` and reconnect set it false.
- **v10:** removed. New messages always land in the head interval without disturbing the active window; use `messagePaginator.isActiveIntervalAtHead`, `hasMoreHead`, `jumpToTheLatestMessage()`; tell the SDK the user sees the latest messages with `messagePaginator.setViewingLive(true)` (suppresses the own unread bump). Reconnect state is `watchStatus: WasWatching`.
- **Migrate:** delete `setIsUpToDate` calls; drive the "jump to latest" affordance from `isActiveIntervalAtHead`.
- **Source:** `src/pagination/paginators/MessagePaginator.ts:540-546`, `src/channel.ts:2588-2611` (v10); `src/channel_state.ts:90,666-677`, `src/channel.ts:2128-2133` (v9)

<a id="channel-manager-section"></a>

## 8. `ChannelManager`, channel list and `activeChannels`

<a id="active-channels"></a>

### `client.activeChannels` / `client.configs` -> the channel store

**Kind:** removed · **Impact:** high · **PR:** #1901, #1813

- **v9:** `client.activeChannels: Record<cid, Channel>`, writable; `client.configs: Record<cid, ChannelConfigWithInfo>`; `client.createChannelManager({ eventHandlerOverrides, options, queryChannelsOverride })`. `client.channel()` deduped through `activeChannels` (a stored channel got the passed `data` merged into `data` / `_data`); members-only channels were keyed by temp cid until queried; `_disconnect()`ed channels were skipped and replaced.
- **v10:** `client.channelManager` is instantiated with the client and is the store (an `EntityStore<Channel>`; `channelStore` is `@internal`): `get(cid)`, `values()`, `ensure({ type, id?, data? })`, `releaseUnusedChannels()`, paginators. `createChannelManager` removed. `client.channelServerConfigs[cid]` (same cid key space, `@internal`) and reactive `client.channelServerConfigsStore` replace `configs`; read per channel via `channel.serverConfig`. Assigning into a plain object has no effect. For a stored channel `ensure` / `client.channel()` apply only `data.custom`. A `pendingDisposal` channel stays stored until `releaseUnusedChannels()`, but `ensure()` replaces it with a fresh instance. Channels are never evicted automatically: `releaseUnusedChannels()` removes and disconnects disposed channels and any channel that is not watched / `WasWatching`, not active, not loading, and not held by a list, thread, composer cache or active channel search (`getChannelUsage` reports holders). A members-only channel whose server cid is already stored is superseded (`supersedeChannel`): the stored instance stays, takes the response, local messages and (when the new one is active) its composition; the new one gets `supersededBy` and `watchStatus: NotWatching`, and receives no events. Store internals touched: `changeChannelId`, `clearChannels`, `getOrCreateChannel`, `removeChannel`, `resolveListedChannel`.
- **Migrate:** `client.activeChannels[cid]` -> `client.channelManager.get(cid)`; `Object.values(client.activeChannels)` -> `client.channelManager.values()`; `client.configs[cid]` -> `channel.serverConfig`; channel lists -> `ChannelPaginator` + `client.channelManager.insertPaginator(...)`. Call `releaseUnusedChannels()` after closing screens that held channels you no longer need; `channel.activate()` channels you keep using; switch UIs to `channel.supersededBy` when set.
- **Source:** `src/ChannelManager.ts:370-750`, `src/channel.ts:1857-1895`, `src/client.ts:164,232,380,476-483,1822-1830` (v10); `src/client.ts:345,364,817-835,2600-2604,2660-2762` (v9)

<a id="channel-manager"></a>

### `ChannelManager` rewritten and owned by the client

**Kind:** type-shape · **Impact:** high · **PR:** #1813

- **v9:** one list per manager; `new ChannelManager({ client, eventHandlerOverrides?, options?, queryChannelsOverride? })` or `client.createChannelManager(...)`; any number per client; `readonly state: StateStore<{ channels, initialized, pagination, error }>` (`ChannelManagerState`). The class carried the JSDoc `tags` `@internal` but was exported and used by the UI SDKs (v10 drops the tag).
- **v10:** a different class (former rc `ChannelPaginatorsOrchestrator`) holding N `ChannelPaginator` lists plus the client's channel store. The client builds exactly one, `client.channelManager`; ctor `({ client, paginators?, eventHandlers?, ownershipResolver? })`; `state: StateStore<{ paginators: ChannelPaginator[] }>`; `getPaginatorById`, `insertPaginator`, `removePaginator`, `setPaginators`, `clearPaginators`. List state lives on each `paginator.state`. Statics `getDefaultHandlers()`, `defaultEventHandlers` (protected).
- **Migrate:** use `client.channelManager`; create one `new ChannelPaginator({ client, filters, sort, id, paginatorOptions })` per list and `client.channelManager.insertPaginator({ paginator })` / `removePaginator(id)` / `setPaginators([...])`. Read list state from `paginator.state`:

  | v9 `manager.state`                | v10                                                               |
  | --------------------------------- | ----------------------------------------------------------------- |
  | `channels`                        | `paginator.state.items` (`undefined` = never queried)             |
  | `initialized`                     | `paginator.state.items !== undefined` / `paginator.isInitialized` |
  | `pagination.hasNext`              | `paginator.state.hasMoreTail`                                     |
  | `pagination.isLoading`            | `paginator.state.isLoading`                                       |
  | `pagination.isLoadingNext`        | none (`isLoading && items.length > 0`)                            |
  | `pagination.filters/sort/options` | `paginator.staticFilters` / `sort` / `options`                    |
  | `error`                           | `paginator.state.lastQueryError`                                  |

- **Source:** `src/ChannelManager.ts:322-457`, `src/client.ts:164,380` (v10); `src/channel_manager.ts:32-54,215-271` (v9)

```ts
// v10
const paginator = new ChannelPaginator({
  client,
  id: 'main',
  filters: { members: { $in: [userId] } },
  sort: [{ field: 'last_message_at', direction: -1 }],
});
client.channelManager.insertPaginator({ paginator });
const unsubscribe = client.channelManager.registerSubscriptions();
await paginator.toTail();
```

<a id="channel-manager-list-methods"></a>

### `ChannelManager` list methods removed

**Kind:** removed · **Impact:** high

- **v9:** `queryChannels(filters, sort?, options?, stateOptions?)`, `loadNext()`, `setChannels(valueOrFactory)`, `setQueryChannelsRequest(fn)`, `setOptions(options)`, `setEventHandlerOverrides(overrides)`.
- **v10:** removed from the manager.

  | v9                                    | v10                                                                                                                                                                                                                                                                   |
  | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `manager.queryChannels(f, s, o)`      | `paginator.toTail({ reset: 'yes' })` or `paginator.reload()`                                                                                                                                                                                                          |
  | `manager.loadNext()`                  | `paginator.toTail()` / `toTailDebounced()`                                                                                                                                                                                                                            |
  | `manager.setChannels(v)`              | `paginator.setItems({ valueOrFactory: v })`                                                                                                                                                                                                                           |
  | `manager.setQueryChannelsRequest(fn)` | `paginatorOptions.doRequest` (`paginator.updateConfig({ doRequest })`)                                                                                                                                                                                                |
  | `manager.setOptions(o)`               | per-paginator config (`updateConfig({ lockItemOrder })`)                                                                                                                                                                                                              |
  | `manager.setEventHandlerOverrides(o)` | `addEventHandler` / `setEventHandlers` / `removeEventHandlers` ([event handlers](#channel-manager-event-handlers))                                                                                                                                                    |
  | `queryChannels` `options.limit`       | `new ChannelPaginator({ paginatorOptions: { pageSize } })` (default `10`); `ChannelPaginatorRequestOptions` omits `limit` and `offset`, and the remaining request options (`state`, `watch`, `presence`, `message_limit`, `member_limit`, ...) go to `requestOptions` |

- **Migrate:** see table.
- **Source:** `src/ChannelManager.ts:968-1131`, `src/pagination/paginators/BasePaginator.ts:343,385,2848,3483-3531` (v10); `src/channel_manager.ts:273-544` (v9)

<a id="channel-manager-options"></a>

### `ChannelManagerOptions` replaced

**Kind:** type-shape · **Impact:** medium

- **v9:** `ChannelManagerOptions = { abortInFlightQuery?, allowNotLoadedChannelPromotionForEvent?, lockChannelOrder? }`.
- **v10:** `ChannelManagerOptions = { client, paginators?, eventHandlers?, ownershipResolver? }` (constructor options). `lockChannelOrder` -> per-paginator `lockItemOrder` (keeps existing items in place for every event, not just `message.new` / `member.updated`); `abortInFlightQuery` removed (a paginator never starts a query while loading; `paginator.cancelScheduledQuery()`); `allowNotLoadedChannelPromotionForEvent` removed (the default still admits unknown channels; opt out per event with `addEventHandler({ eventType, handle: ignoreEventsForUnknownChannels, id, index: 0 })`).
- **Migrate:** see mapping.
- **Source:** `src/ChannelManager.ts:120-125,330-348`, `src/pagination/paginators/BasePaginator.ts:409,469` (v10); `src/channel_manager.ts:115-157` (v9)

<a id="channel-manager-event-handlers"></a>

### Event handler overrides -> `EventHandlerPipeline`; manager types and constants removed

**Kind:** removed · **Impact:** medium

- **v9:** overrides keyed by handler name (`newMessageHandler`, `channelDeletedHandler`, ... 10 names), each `(setChannels, event)`; an override fully replaced the default; only the 10 mapped events were listened to. Exported: `ChannelManagerEventHandlerOverrides`, `ChannelManagerEventHandlerNames`, `ChannelManagerEventTypes`, `ChannelManagerPagination`, `ChannelSetterParameterType`, `ChannelSetterType`, `EventHandlerType`, `EventHandlerOverrideType`, `GenericEventHandlerType`, `ExecuteChannelsQueryPayload`, `QueryChannelsRequestType`, `QueryChannelsRequestOutput`, `channelManagerEventToHandlerMapping`, `DEFAULT_CHANNEL_MANAGER_OPTIONS`, `DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS`.
- **v10:** one `EventHandlerPipeline` per event type (any event string; internal `pipelines` / `_pipelines`, `ensurePipeline`); handlers `{ id, handle({ event, ctx: { channelManager } }) }` may return `{ action: 'stop' }`; default ids `ChannelManager:default-handler:<type>` (read-state events share `ChannelManager:default-handler:read-state-changed`); passing `eventHandlers` to the constructor replaces the whole default map. All listed types and constants removed.

  | v9                                                                                                                                                                                                        | v10                                                                   |
  | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
  | `ChannelManagerEventHandlerOverrides`                                                                                                                                                                     | `ChannelManagerEventHandlers` (event type -> `LabeledEventHandler[]`) |
  | `EventHandlerType` / `EventHandlerOverrideType` / `GenericEventHandlerType`                                                                                                                               | `EventHandlerPipelineHandler<ChannelManagerEventHandlerContext>`      |
  | `ChannelSetterParameterType` / `ChannelSetterType`                                                                                                                                                        | `SetPaginatorItemsParams<Channel>['valueOrFactory']`                  |
  | `QueryChannelsRequestType` / `QueryChannelsRequestOutput`                                                                                                                                                 | `PaginatorOptions<Channel, ChannelQueryShape>['doRequest']`           |
  | `channelManagerEventToHandlerMapping`                                                                                                                                                                     | `ChannelManager.getDefaultHandlers()`                                 |
  | `ChannelManagerPagination`, `ChannelManagerEventTypes`, `ChannelManagerEventHandlerNames`, `ExecuteChannelsQueryPayload`, `DEFAULT_CHANNEL_MANAGER_OPTIONS`, `DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS` | none                                                                  |

- **Migrate:** `eventHandlerOverrides: { newMessageHandler: (setChannels, e) => ... }` -> `client.channelManager.setEventHandlers({ eventType: 'message.new', handlers: [{ id: 'my', handle: ({ event, ctx }) => ... }] })`.
- **Source:** `src/ChannelManager.ts:24-30,200-320,326-328,419-436,810-818,1084-1144` (v10); `src/channel_manager.ts:56-113,148-161,304-318` (v9)

<a id="channel-manager-register-subscriptions"></a>

### `ChannelManager.registerSubscriptions` is ref-counted and returns an unsubscribe

**Kind:** behavior · **Impact:** medium

- **v9:** `registerSubscriptions` was an arrow property returning `void`; one `unregisterSubscriptions()` always tore everything down.
- **v10:** a method returning `Unsubscribe`; each call increments the ref count and listeners are removed only after every registration is released; uses one wildcard `client.on(listener)`.
- **Migrate:** pair every `registerSubscriptions()` with its returned unsubscribe (or `unregisterSubscriptions()`), e.g. in a `useEffect` cleanup.
- **Source:** `src/ChannelManager.ts:1116-1131` (v10); `src/channel_manager.ts:818-829` (v9)

<a id="channel-list-ordering"></a>

### List ordering: no promotion, sort-derived position

**Kind:** behavior · **Impact:** high

- **v9:** `message.new`, `notification.message_new`, `channel.visible`, `notification.added_to_channel` called `promoteChannel`: the channel jumped to index 0 (or just below the pinned block when `pinned_at` led the sort) regardless of the list's sort; `message.new` on a pinned channel left the list unchanged; unpinning placed the channel at the top of the unpinned section.
- **v10:** handlers call `channelManager.ingestChannel(channel)` -> `paginator.ingestItem`, which inserts the channel where the compiled sort comparator puts it; no event boosts. A channel whose sort key did not change does not move; pinned channels relocate inside the pinned block by the next sort key; an unpinned channel returns to its natural position. An empty `sort` means the backend default.
- **Migrate:** declare the order as sort, e.g. `[{ field: 'pinned_at', direction: -1 }, { field: 'last_message_at', direction: -1 }]`; force a top position with `paginator.boost(cid, { ttlMs })`.
- **Source:** `src/ChannelManager.ts:152-198`, `src/pagination/paginators/BasePaginator.ts:1539` (v10); `src/channel_manager.ts:578-801`, `src/utils.ts:1407-1453` (v9)

<a id="channel-list-event-routing"></a>

### Event routing: full filter matching, more events, unknown channels watched

**Kind:** behavior · **Impact:** medium

- **v9:** handlers inspected only `filters.archived` and a leading `pinned_at`; not-loaded channels were added even if other filters did not match; channels were never removed for no longer matching (except archive on `member.updated`). `member.updated` ignored other users and needed pinned/archived sort or filters. `channel.hidden` removed the channel unconditionally. `channel.updated` / `channel.truncated` were no-ops. `message.new` for an unknown channel used `client.channel()` (no request); other events used `getAndWatchChannel`.
- **v10:** every routed event evaluates `paginator.matchesFilter(channel)` (full effective filter; hidden channels excluded unless the filter constrains `hidden`) and ingests into matching/owning lists and removes from the rest (`dropFromUnmatchedLists`), so channels can now leave a list on `message.new`, `member.updated`, `channel.updated`, etc. `member.updated` for any member re-routes. `channel.hidden` re-evaluates filters. `channel.updated`, `channel.truncated`, hard `message.deleted` re-insert loaded channels. New defaults: `message.read`, `message.read_locally`, `notification.mark_read`, `notification.mark_unread` (only when a list filters or sorts on `has_unread` / `unread_count`), `notification.channel_mutes_updated` (re-routes all loaded channels). Events for unknown channels (`message.new`, `member.updated`, `channel.visible`, `channel.hidden`, `notification.added_to_channel`, `notification.message_new`) call `ensure().ensureWatched()` (a watch request); stored `WasWatching` channels get a detached `ensureWatched()`. With `ownershipResolver` (`setOwnershipResolver`, `resolveOwnership`, `filterItemsByOwnership`), a channel matching several lists is kept only by the owners, also for server query pages (`wrapPaginatorFiltering` / `unwrapPaginatorFiltering`, `filterQueryResultsBeforeWrapping`).
- **Migrate:** review lists whose server filter is not expressible client-side; to keep v9 "add without matching", use a catch-all paginator with low ownership priority.
- **Source:** `src/ChannelManager.ts:104-320,865-966`, `src/pagination/paginators/ChannelPaginator.ts:515-523` (v10); `src/channel_manager.ts:546-801` (v9)

<a id="promote-channel"></a>

### `promoteChannel` and pinned/archived helpers removed

**Kind:** removed · **Impact:** low · **PR:** #1813

- **v9:** root exports `promoteChannel({ channels, channelToMove, sort, channelToMoveIndexWithinChannels? }): Channel[]` (pin-aware move-to-top) and type `PromoteChannelParams`; internal (deep-import only) `findLastPinnedChannelIndex`, `findPinnedAtSortOrder`, `shouldConsiderPinnedChannels`, `shouldConsiderArchivedChannels`, `extractSortValue`, `isChannelPinned`, `isChannelArchived`, `getAndWatchChannel`.
- **v10:** all removed; list position derives from the `ChannelPaginator` sort.
- **Migrate:** ordering via sort ([list ordering](#channel-list-ordering)); `client.channelManager.ingestChannel(channel)` to surface a channel; `paginator.boost(cid, { ttlMs })` for temporary promotion; pinned/archived checks via `paginator.matchesFilter(channel)`; `getAndWatchChannel` -> `client.channelManager.ensure({ type, id }).ensureWatched()`.
- **Source:** `src/index.ts` (v10, absent); `src/utils.ts:1216-1453`, `src/index.ts:57-63`, `src/types.ts:4580` (v9)

<a id="channel-list-errors"></a>

### Channel list query errors, offline cache, logout

**Kind:** behavior · **Impact:** medium

- **v9:** after 3 failed retries `state.error = new Error('Maximum number of retries reached in queryChannels. Last error message is: ...')` plus `console.warn`; `setChannels` upserted every loaded cid into the offline DB; `disconnectUser` left an integrator-created manager's channels intact.
- **v10:** `paginator.state.lastQueryError` holds the raw error of the last attempt, set once the retries are used up as in v9 (not set when offline support is enabled and the list already holds items) and cleared on success (no wrapping, no console warn); the offline cid cache stores only the first `pageSize` cids; `client.disconnectUser()` calls `channelManager.resetPaginatorStates()` (every list back to `items: undefined`, registrations kept) and `clearChannels()`.
- **Migrate:** read `lastQueryError` (check `error.message` of the raw error); re-query whenever `items` is `undefined`, not only on mount.
- **Source:** `src/ChannelManager.ts:1077-1082`, `src/client.ts:851-856`, `src/pagination/paginators/ChannelPaginator.ts:610-646`, `src/pagination/paginators/BasePaginator.ts:3098-3127` (v10); `src/channel_manager.ts:288-412` (v9)

<a id="channel-batch-updater"></a>

### `ChannelBatchUpdater` removed

**Kind:** removed · **Impact:** low

- **v9:** root-exported class (`addMembers`, `removeMembers`, `inviteMembers`, `addModerators`, `demoteModerators`, `assignRoles`, `hide`, `show`, `archive`, `unarchive`, `updateData`) obtained from `client.channelBatchUpdater()`, wrapping `client.updateChannelsBatch`.
- **v10:** removed; `src/channel_batch_updater.ts` is a one-line comment stub.
- **Migrate:** server-side node SDK `client.chat.channelBatchUpdate(...)`; client-side, loop over `channel.*` methods.
- **Source:** `src/channel_batch_updater.ts:1` (v10); `src/channel_batch_updater.ts:19-237`, `src/index.ts:3` (v9)

<a id="query-channels-hydration"></a>

### Channel-state consequences of `queryChannels` -> `queryChannelsAndHydrate`

**Kind:** behavior · **Impact:** high

- **v9:** `client.queryChannels(...)` created and stored `Channel` instances, set `initialized`, merged each response's messages into the latest message set (always), dispatched `channels.queried`, upserted the offline DB.
- **v10:** `client.queryChannels(request)` is the raw request ([raw queryChannels](#query-channels-raw)): no `Channel` instance is created or updated, nothing is stored, no `channels.queried`, no offline upsert, so `client.channel(type, id)` afterwards returns an empty, uninitialized channel. `client.queryChannelsAndHydrate(request, stateOptions?, requestOptions?)` (or `client.hydrateChannels(response.channels)`) restores hydration with these differences: sets `initialized: true` / `offlineMode: false` (offline: the reverse) and `watchStatus: Watching` when `watch` was requested or the socket is healthy; seeds `messagePaginator` with `reconcile` (offline hard deletes pruned) but skips the re-seed for an `active` channel and for a channel whose paginator has jumped away from the latest window (v9 always merged); `skipInitialization` also skips the message seed; `stateOptions.skipHydration` is still a no-op.
- **Migrate:** replace `await client.queryChannels(f, s, o)` with `await client.queryChannelsAndHydrate({ filter_conditions: f, sort: [...], ...o })`, or better a `ChannelPaginator` registered on `client.channelManager`.
- **Source:** `src/client.ts:1516-1633,1680-1750` (v10); `src/client.ts:2245-2400` (v9)

<a id="message-operations"></a>

## 9. Message operations, offline sending and reactions

Raw client-level edit/delete: [updateMessage / deleteMessage](#update-delete-message-raw). Offline queue contract: [offline support](#offline-support).

<a id="channel-send-message"></a>

### `channel.sendMessage` is a request wrapper; offline queue moved to `messageOperations`

**Kind:** signature · **Impact:** high · **PR:** #1897, #1882

- **v9:** `sendMessage(message: Message, options?: SendMessageOptions)` queued a `send-message` offline task when an offline DB existed and `message.id` was set, otherwise called `_sendMessage` (sanitized attachments, POST). Options included `pending`, `pending_message_metadata`, `force_moderation`, `is_pending_message`, `keep_channel_hidden`, `skip_enrich_url`, `skip_push`.
- **v10:** `sendMessage({ message, skip_push?, skip_enrich_url?, keep_channel_hidden?, include_channel_context?, include_mentioned_members?, scheduled_at? }, requestOptions?)`: HTTP only (attachments sanitized, `_checkHasId`), no offline queueing, no local state. `pending`, `pending_message_metadata`, `force_moderation`, `is_pending_message` are not in `SendMessageRequest` (whether the API still honours them when sent untyped is unverified). `_sendMessage` removed. `channel.messageOperations` is the stateful flow.
- **Migrate:**

  | v9                                            | v10                                                                                                                                                                                               |
  | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `channel.sendMessage(msg, opts)`              | `channel.sendMessage({ message: msg, ...opts })` (HTTP only)                                                                                                                                      |
  | send with optimistic state and offline replay | `channel.messageComposer.send()` or `channel.messageOperations.send({ localMessage, message?, options? })`                                                                                        |
  | retry a failed message                        | `channel.messageOperations.retry({ localMessage })`                                                                                                                                               |
  | edit / delete with local state                | `channel.messageOperations.update({ localMessage, options? })` / `.delete({ localMessage, options: { hard?, delete_for_me? } })`                                                                  |
  | per-SDK request override props                | `client.config.setConfig('channel', { requestHandlers: { sendMessageRequest, retrySendMessageRequest, updateMessageRequest, deleteMessageRequest } })`; a handler gets `(params, defaultRequest)` |

  `messageOperations.*` resolve `void` and reject after marking the message `failed`; a send without `localMessage.id` is not queued.

- **Source:** `src/channel.ts:571-580`, `src/gen/models/index.ts:9742-9750`, `src/messageOperations/MessageOperations.ts:230-332`, `src/messageOperations/createMessageOperations.ts:142-200` (v10); `src/channel.ts:217-253`, `src/types.ts:3066-3075` (v9)

<a id="channel-send-reaction"></a>

### `channel.sendReaction` / `deleteReaction` are pass-throughs

**Kind:** signature · **Impact:** high · **PR:** #1906, #1897

- **v9:** `sendReaction(messageID, reaction, options?)` validated input and queued `send-reaction` when an offline DB existed; `deleteReaction(messageID, type, user_id?)` required `_checkInitialized`, wrote `offlineDb.deleteReaction` optimistically and queued `delete-reaction` (internal `_sendReaction` / `_deleteReaction`). Reaction WS events then updated state.
- **v10:** `sendReaction({ id }, { reaction, enforce_unique?, skip_push? }, requestOptions?)`, `deleteReaction({ id, type }, requestOptions?)`: forward to `client.sendReaction` / `client.deleteReaction`; no validation, no offline queue, no DB write, no id or initialization check. `_sendReaction` / `_deleteReaction` removed. The optimistic + queued + rollback flow is `channel.messageOperations.addReaction({ messageId, reaction, options? })` / `deleteReaction({ messageId, type })`. `user_id` override dropped.
- **Migrate:** `channel.sendReaction(id, r, o)` -> `channel.sendReaction({ id }, { reaction: r, ...o })` (custom reaction fields under `reaction.custom`); `channel.deleteReaction(id, type)` -> `channel.deleteReaction({ id, type })`. For offline support use `messageOperations`.
- **Source:** `src/channel.ts:582-588`, `src/messageOperations/MessageOperations.ts:334-396` (v10); `src/channel.ts:473-621` (v9)

<a id="threads"></a>

## 10. Threads

Client-level `queryThreads` / `getThread` becoming raw: [threads and reactions](#threads-reactions-hydrate). Thread state timestamps: [state timestamps](#state-timestamps).

<a id="thread-replies"></a>

### Thread reply list moved to `thread.messagePaginator`

**Kind:** removed · **Impact:** high · **PR:** #1795

- **v9:** `thread.state.getLatestValue().replies`, `state.pagination` (`ThreadRepliesPagination`: `isLoadingNext`, `isLoadingPrev`, `nextCursor`, `prevCursor`), `thread.loadNextPage({ limit })`, `thread.loadPrevPage({ limit })`, `thread.queryReplies(options)` (default limit 50).
- **v10:** removed from `Thread` / `ThreadState`. Replies live in `thread.messagePaginator` (a `MessagePaginator`, page size 50, seeded from `latest_replies`).

  | v9                                           | v10                                                             |
  | -------------------------------------------- | --------------------------------------------------------------- |
  | `state.replies`                              | `thread.messagePaginator.state.getLatestValue().items ?? []`    |
  | `loadPrevPage()` (older, `id_lt`)            | `thread.messagePaginator.toTail()`                              |
  | `loadNextPage()` (newer, `id_gt`)            | `thread.messagePaginator.toHead()`                              |
  | `pagination.prevCursor !== null`             | `messagePaginator.state.hasMoreTail`                            |
  | `pagination.nextCursor !== null`             | `messagePaginator.state.hasMoreHead`                            |
  | `pagination.isLoadingPrev` / `isLoadingNext` | `messagePaginator.state.isLoading` (one flag)                   |
  | `queryReplies(opts)`                         | `client.getReplies({ parent_id }, { limit, id_lt, ... })` (raw) |
  | type `ThreadRepliesPagination`               | `PaginatorState` ([paginator state](#paginator-state))          |

- **Migrate:** per table.
- **Source:** `src/thread.ts:51-76,126,245-278`, `src/gen/chat/ChatApi.ts:1044`, `src/pagination/paginators/MessageIntervalPaginator.ts:483` (v10); `src/thread.ts:30-62,582-648`, `src/index.ts:27-32` (v9)

<a id="thread-activate"></a>

### `Thread.activate()` returns a release function; `deactivate()` removed

**Kind:** signature · **Impact:** medium · **PR:** #1901

- **v9:** `thread.activate(): void`, `thread.deactivate(): void`; both only toggled `state.active`.
- **v10:** `thread.activate(): () => void`, ref-counted (active until every activation is released; a release is idempotent). The first activation calls `client.threads.register(thread)`, which keeps the thread in `client.threads` (subscribed, resolvable with `client.threads.get(id)`) for the rest of the session, also after release. A second instance with the same id is refused with a warning and stays unmanaged. `thread.deactivate()` does not exist.
- **Migrate:** `const release = thread.activate(); /* on unmount */ release();`
- **Source:** `src/thread.ts:380-396`, `src/thread_manager.ts:222-241` (v10); `src/thread.ts:205-211` (v9)

<a id="thread-event-routing"></a>

### Threads no longer subscribe to client events; `client.threads` routes them

**Kind:** behavior · **Impact:** medium · **PR:** #1888

- **v9:** `thread.registerSubscriptions()` added its own `client.on` listeners (`thread.updated`, `message.new`, `message.read`, `notification.mark_unread`, `message.deleted`, `message.updated`, `reaction.*`, `user.watching.stop`). Any registered `Thread` got events.
- **v10:** `thread.registerSubscriptions()` only wires state subscriptions (config key, parent message from `client.messageStore`, auto mark-read, stale reload, channel `watchStatus`). `ThreadManager.registerSubscriptions()` routes client events by id to threads in its store through the new public handlers `handleNewReply`, `handleRepliesRead`, `handleRepliesUnread`, `handleThreadUpdated`, `handleMessageDeleted`, `handleMessageUpdated`, `handleReactionChanged`, `handleUserMessagesDeleted`. A thread gets events only when `client.threads` holds it (listed, `ensure()`d or `activate()`d) and `client.threads.registerSubscriptions()` is active; the client does not call it itself. New: `message.undeleted` and `user.messages.deleted` / `user.deleted` now reach threads.
- **Migrate:** keep `client.threads.registerSubscriptions()` mounted while threads are shown; open threads with `client.threads.ensure(...)` or `activate()`, never a bare `new Thread(...)`.
- **Source:** `src/thread.ts:542-553,592-811`, `src/thread_manager.ts:300-374` (v10); `src/thread.ts:271-285,288-484` (v9)

<a id="thread-construction"></a>

### Thread construction: `threadData` optional; open threads with `client.threads.ensure()`

**Kind:** signature · **Impact:** medium

- **v9:** `new Thread({ client, threadData: ThreadResponse })` (required); apps used `client.threads.threadsById[id] ?? new Thread(...)`.
- **v10:** constructor `new Thread({ client, threadData?: ThreadStateResponse, channel?, parentMessage?, draft? })`. Without `threadData`, `channel` and `parentMessage` (with an `id`) are required, else it throws. A thread built from a parent message starts with `isStateStale: true` when the parent has replies or the channel is not watched, and loads once when activated. With `threadData`, `threadData.channel` and `threadData.parent_message` are required (throws otherwise) and the channel comes from `client.channelManager.ensure` (seeded with `channel.custom`, not `{ name }`). `ThreadResponse` -> `ThreadStateResponse` ([same-name changes](#same-name-meaning-changes)).
- **Migrate:** `const thread = client.threads.ensure({ channel, parentMessage })`. Use `client.getThreadAndHydrate({ message_id: id })` / `client.queryThreadsAndHydrate()` for fetched threads; both return the already-registered instance when one exists.
- **Source:** `src/thread.ts:133-231`, `src/thread_manager.ts:174-204`, `src/client.ts:2059-2142` (v10); `src/thread.ts:123-196` (v9)

<a id="thread-state-derivation"></a>

### Thread state derivation: `replyCount`, `custom`, parent message via message store

**Kind:** behavior · **Impact:** low · **PR:** #1888, #1849

- **v9:** `replyCount = threadData.reply_count` (excludes soft-deleted replies); `state.custom` = every non-reserved top-level key of the thread payload; `updateParentMessageLocally` wrote `state.parentMessage` / `deletedAt` / `replyCount` directly; `upsertReplyLocally({ message, timestampChanged })` repositioned on `timestampChanged`.
- **v10:** `replyCount = threadData.parent_message.reply_count` (includes soft-deleted, matches the channel badge; a local `message.new` never bumps it). `state.custom = threadData.custom ?? {}` on construct and `thread.updated`. The parent message lives in `client.messageStore`; `updateParentMessageLocally` upserts there only if the store already holds the id, and `state.parentMessage` / `deletedAt` / `replyCount` / `participants` follow through the store subscription that `registerSubscriptions()` creates, so on an unsubscribed thread the call changes nothing. `upsertReplyLocally` accepts `timestampChanged` and ignores it. Once subscribed, `state.participants` is rebuilt from `parentMessage.thread_participants` (users only) on subscribe and on every parent update: each row's `created_at` / `last_read_at` is set to the current time and its `custom` / `left_thread_at` / `last_thread_message_at` are dropped (tracked in v10-followups.md). v9 kept the thread response's participants unchanged.
- **Migrate:** read thread custom fields from `thread.state.custom` after moving them under `custom` server-side; call `registerSubscriptions()` (or let `client.threads` do it) before relying on local parent updates; do not read per-participant timestamps or `custom` from `thread.state.participants`.
- **Source:** `src/thread.ts:181-189,592-605,819-836,858-903` (`normalizeThreadParticipants` `:940-958`) (v10); `src/thread.ts:77-110,177-180,288-302,515-556` (v9)

<a id="thread-staleness"></a>

### Thread staleness and recovery triggers

**Kind:** behavior · **Impact:** low

- **v9:** a `user.watching.stop` event for the thread's channel and own user set `isStateStale: true`; an active stale thread reloaded.
- **v10:** only a channel `watchStatus` transition `Watching -> NotWatching` marks the thread stale. A dropped connection is handled by `ConnectionRecoveryManager`: it reloads active registered threads and marks inactive registered ones stale. `getThreadAndHydrate` / `queryThreadsAndHydrate` with `watch: true` set the channel's `watchStatus` to `Watching`.
- **Migrate:** do not drive thread freshness from `user.watching.stop`.
- **Source:** `src/thread.ts:633-644`, `src/connection/ConnectionRecoveryManager.ts:249-271`, `src/client.ts:135-137` (v10); `src/thread.ts:327-340` (v9)

<a id="thread-reload"></a>

### `Thread.reload()` request sizing and error handling

**Kind:** behavior · **Impact:** low

- **v9:** `client.getThread(id, { watch: true })` (server default reply limit), replaced `state.replies` (plus failed replies), rethrew every error.
- **v10:** `client.getThreadAndHydrate({ message_id: id }, { watch: true, reply_limit: max(loaded replies, pageSize) })`, merges into the reply paginator in place and re-ingests failed replies. A not-found error (Stream code or HTTP 404) resolves silently when `replyCount === 0`; other errors rethrow.
- **Migrate:** none.
- **Source:** `src/thread.ts:413-466` (v10); `src/thread.ts:213-226` (v9)

<a id="thread-mark-read"></a>

### `thread.markAsRead` deprecated; `thread.markRead` returns the generated response

**Kind:** signature · **Impact:** low

- **v9:** `markAsRead({ force }): Promise<EventAPIResponse | null>`; auto mark-read via a per-thread 1000 ms throttle.
- **v10:** `markRead({ force }): Promise<Partial<StreamResponse<MarkReadResponse>> | null>`; `markAsRead` is a deprecated alias. Auto mark-read goes through the shared `client.messageDeliveryReporter.throttledMarkRead` ([throttle](#throttled-mark-read)). With read events disabled the request throws ([delivery reporter](#delivery-reporter-mark-read)). A `thread.requestHandlers.markReadRequest` config handler replaces the request.
- **Migrate:** rename to `markRead`; read `response?.event` (optional).
- **Source:** `src/thread.ts:99-108,916-933` (v10); `src/thread.ts:568-580` (v9)

<a id="thread-unregister"></a>

### `Thread.unregisterSubscriptions()` disposes the reply paginator

**Kind:** behavior · **Impact:** low

- **v9:** removed listeners and set `isStateStale: true`; replies kept.
- **v10:** also calls `messagePaginator.dispose()` (clears its item index and store links, cancels publish throttles; `state.items` is left as is). The instance is meant to be discarded. (`client.threads.unregisterSubscriptions()` disposing every stored thread's paginator while keeping the threads is tracked in v10-followups.md.)
- **Migrate:** do not keep using a thread after unregistering it yourself; resolve it again through `client.threads`.
- **Source:** `src/thread.ts:838-848`, `src/pagination/paginators/BasePaginator.ts:3476-3481` (v10); `src/thread.ts:486-490` (v9)

<a id="thread-manager-list"></a>

### `ThreadManager` list state moved to `client.threads.paginator`

**Kind:** removed · **Impact:** high · **PR:** #1888, #1859

- **v9:** `ThreadManagerState.threads`, `.pagination` (`ThreadManagerPagination`: `isLoading`, `isLoadingNext`, `nextCursor`), `.ready`, `.lastConnectionDropAt`; `threadManager.threadsById`, `queryThreads(options)`, `loadNextPage(options)`; `THREAD_MANAGER_INITIAL_STATE` carried those fields.
- **v10:** `ThreadManagerState` = `active`, `wasActivatedAtLeastOnce`, `isThreadOrderStale`, `unreadThreadCount`, `unseenThreadIds`. The list is `client.threads.paginator` (`ThreadPaginator`, state `items | undefined`, `isLoading`, `hasMoreTail`, `lastQueryError`), server order, no client sort. `client.threads.get(id)` / `ensure(...)` resolve instances.

  | v9                                                      | v10                                                                                      |
  | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
  | `state.threads`                                         | `client.threads.paginator.state.getLatestValue().items ?? []`                            |
  | `state.ready`                                           | `paginator.state.items !== undefined` (not `isInitialized`)                              |
  | `pagination.isLoading` (first load)                     | `paginator.isLoading && !items?.length`                                                  |
  | `pagination.isLoadingNext`                              | `paginator.isLoading && items.length > 0`                                                |
  | `pagination.isLoading` during a reload of a loaded list | no flag; await `client.threads.reload()`                                                 |
  | `pagination.nextCursor`                                 | `paginator.state.hasMoreTail`                                                            |
  | `loadNextPage()`                                        | `client.threads.paginator.toTail()` (no-op before first load and at the end)             |
  | `queryThreads(opts)`                                    | `client.queryThreadsAndHydrate(opts)`                                                    |
  | `threadsById[id]`                                       | `client.threads.get(id)` (listed or opened); `paginator.getItem(id)` for list membership |
  | `threadsById[id] ?? new Thread(...)`                    | `client.threads.ensure({ channel, parentMessage })`                                      |
  | `lastConnectionDropAt`                                  | `client.wsConnection.state.getLatestValue().lastUnhealthyAt`                             |
  | type `ThreadManagerPagination`                          | `PaginatorState<Thread>`                                                                 |

- **Migrate:** per table.
- **Source:** `src/thread_manager.ts:41-66,75-158`, `src/pagination/paginators/ThreadPaginator.ts:16-181` (v10); `src/thread_manager.ts:11-52,74-93,294-337` (v9)

<a id="thread-manager-behaviour"></a>

### `ThreadManager` behaviour: reconnect reload, channel disposal, routing

**Kind:** behavior · **Impact:** low

- **v9:** reload after reconnect needed a recorded `connection.changed { online: false }` plus `wasActivatedAtLeastOnce`; only `notification.channel_deleted` dropped a channel's threads from the list; reload errors were logged through `client.logger`.
- **v10:** any `connection.recovered` (throttled by `config.connectionRecoveryThrottleMs`, default 1000) reloads with `force: true` if `wasActivatedAtLeastOnce`, which also covers `closeConnection()` / `openConnection()`. Threads (listed and opened) are released when their channel's `pendingDisposal` flips (`channel.deleted`, `notification.channel_deleted`, `notification.removed_from_channel`, channel disposal); `client.threads.get(id)` then returns `undefined`. Reload failures are recorded on `paginator.lastQueryError`; `unseenThreadIds` / `isThreadOrderStale` are cleared only on success. `resetState()` (run by `disconnectUser()`) releases every thread and returns `paginator.items` to `undefined`. `unread_threads` is also read from `connection.ok`.
- **Migrate:** do not reset the manager state on mount; read reload errors from `paginator.state.lastQueryError`.
- **Source:** `src/thread_manager.ts:252-290,376-405,458-510`, `src/client.ts:865` (v10); `src/thread_manager.ts:143-150,191-225,234-292` (v9)

<a id="polls"></a>

## 11. Polls

Poll data types and `PollResponse` renaming: [poll types](#poll-types). State timestamps: [state timestamps](#state-timestamps).

<a id="poll-client-methods"></a>

### `StreamChat` poll methods renamed, removed, path-param signatures

**Kind:** renamed · **Impact:** medium · **PR:** #1896

- **v9 -> v10:**

  | v9                                                         | v10                                                                                               |
  | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
  | `createPoll(poll: CreatePollData, userId?)`                | `createPoll(request: CreatePollRequest, requestOptions?)`                                         |
  | `getPoll(id, userId?)`                                     | `getPoll({ poll_id }, requestOptions?)`                                                           |
  | `updatePoll(poll: PollData, userId?)`                      | `updatePoll(request: UpdatePollRequest, requestOptions?)`                                         |
  | `partialUpdatePoll(id, { set, unset }, userId?)`           | `updatePollPartial({ poll_id }, { set, unset }, requestOptions?)`                                 |
  | `closePoll(id, userId?)`                                   | removed: `updatePollPartial({ poll_id }, { set: { is_closed: true } })` or `poll.close()`         |
  | `deletePoll(id, userId?)`                                  | `deletePoll({ poll_id })`                                                                         |
  | `createPollOption(pollId, option, userId?)`                | `createPollOption({ poll_id }, { text, custom? })`                                                |
  | `getPollOption(pollId, optionId, userId?)`                 | `getPollOption({ poll_id, option_id })`                                                           |
  | `updatePollOption(pollId, option, userId?)`                | `updatePollOption({ poll_id }, { id, text, custom? })`                                            |
  | `deletePollOption(pollId, optionId, userId?)`              | `deletePollOption({ poll_id, option_id })`                                                        |
  | `castPollVote(messageId, pollId, vote, userId?)`           | `castPollVote({ message_id, poll_id }, { vote: { option_id \| answer_text } })`                   |
  | `addPollAnswer(messageId, pollId, answerText, userId?)`    | removed: `castPollVote({ message_id, poll_id }, { vote: { answer_text } })` or `poll.addAnswer()` |
  | `removePollVote(messageId, pollId, voteId, userId?)`       | `deletePollVote({ message_id, poll_id, vote_id })`                                                |
  | `queryPolls(filter, sort, options, userId?)`               | `queryPolls({ filter, sort, limit?, next?, prev? })`                                              |
  | `queryPollVotes(pollId, filter, sort, options, userId?)`   | `queryPollVotes({ poll_id }, { filter, sort, ...options })`                                       |
  | `queryPollAnswers(pollId, filter, sort, options, userId?)` | `queryPollAnswers({ poll_id }, { filter, sort, ...options })` (adds `is_answer: true`)            |

- **Migrate:** move path ids into the first object; wrap votes in `{ vote }`; drop the `userId` argument; sort becomes `SortParamRequest[]`. Responses are `StreamResponse<...>` generated types (`PollResponse` is now the `{ duration, poll }` envelope).
- **Source:** `src/gen/chat/ChatApi.ts:964-995,1420-1590`, `src/client.ts:2253-2262` (v10); `src/client.ts:4830-5120` (v9)

<a id="poll-methods"></a>

### `Poll` method parameter and return types

**Kind:** signature · **Impact:** low

- **v9:** `poll.createOption(option: PollOptionData)`, `poll.updateOption(option: PollOptionData)`, `poll.update(data: Exclude<PollData, 'id'>)`, `poll.partialUpdate(...)`; hand-written `APIResponse & ...` returns; `handlePollUpdated` / `handlePollClosed` / `handleVoteCasted` / `handleVoteChanged` / `handleVoteRemoved` took `Event`; `reinitializeState(poll: PollResponse)`; `query()` returned `PollResponse`.
- **v10:** `createOption(option: CreatePollOptionRequest)` (`{ text, custom? }`), `updateOption(option: UpdatePollOptionRequest)` (`{ id, text, custom? }`), `update(data: UpdatePollRequest)` (still requires `id`, tracked in v10-followups.md); all return `StreamResponse<PollResponse | PollOptionResponse | PollVoteResponse | PollVotesResponse | Response>`; handlers take `EventPayload<'poll.updated' | ...>`; `reinitializeState(poll: PollResponseData)`; `query()` returns `PollResponseData`. Public method names and positional arguments (`castVote(optionId, messageId)`, `removeVote(voteId, messageId)`, `addAnswer`, `removeAnswer`, `queryAnswers`, `queryOptionVotes`, `close`, `delete`, `deleteOption`) are unchanged. New `handleUserUpdated(user)`.
- **Migrate:** nest option custom fields under `custom`; pass narrowed event payloads to the handlers (`client.on('poll.vote_casted', poll.handleVoteCasted)` still compiles); read response fields from the generated types.
- **Source:** `src/poll.ts:154-284,330-445` (v10); `src/poll.ts:181-405` (v9)

<a id="poll-state"></a>

### `PollState`, `PollAnswersQueryParams`, `PollOptionVotesQueryParams`

**Kind:** type-shape · **Impact:** low

- **v9:** `PollState = Omit<PollResponse, 'own_votes' | 'id'> & { lastActivityAt: Date; ownVotesByOptionId: Record<string, PollVote>; ownAnswer?: PollAnswer; ... }`; query params `{ filter?: QueryVotesFilters; options?: Pager; sort?: VoteSort }`.
- **v10:** `PollState` is built on generated `PollResponseData`: `custom` required, `description` / `allow_answers` / `allow_user_suggested_options` required, `max_votes_allowed` optional, `created_by` `UserResponse | undefined` (was `| null`), `voting_visibility` `'anonymous' | 'public'`, `description_i18n` / `name_i18n` `Record<string, string>`, `options` / `latest_answers` / `latest_votes_by_option` use `PollVoteResponseData`, `ownVotesByOptionId` / `ownAnswer` follow; timestamps per [state timestamps](#state-timestamps). Query params `sort?: SortParamRequest[]`, `options?: QueryVotesOptions`, `filter` derived from `QueryPollVotesRequest['filter']`.
- **Migrate:** read custom poll fields from `poll.data.custom`; sort as `[{ field, direction }]`.
- **Source:** `src/poll.ts:43-62` (v10); `src/poll.ts:64-84` (v9)

<a id="poll-helpers"></a>

### Poll helper exports retyped

**Kind:** type-shape · **Impact:** low

- **v9:** `isVoteAnswer(vote: PollVote | PollAnswer): vote is PollAnswer`; `extractPollData(PollResponse): PollData`; `extractPollEnrichedData(PollResponse): Omit<PollEnrichData, ...>`; `mapPollStateToResponse(poll, state?): PollResponse`.
- **v10:** `isVoteAnswer(vote: any): vote is RequireLiteral<PollVoteResponseData, 'answer_text' | 'is_answer'>`; `extractPollData(PollResponseData): UpdatePollRequest`; `extractPollEnrichedData(PollResponseData): Pick<PollResponseData, 'answers_count' | 'latest_votes_by_option' | 'vote_count' | 'vote_counts_by_option'>`; `mapPollStateToResponse(poll, state?): PollResponseData` (own votes sorted numerically).
- **Migrate:** update the surrounding type names ([rename table](#type-rename-table)).
- **Source:** `src/poll.ts:38-41,457-510` (v10); `src/poll.ts:61-62,417-460` (v9)

<a id="voting-visibility"></a>

### `VotingVisibility` enum -> string union type

**Kind:** type-shape · **Impact:** low · **PR:** #1904

- **v9:** `export enum VotingVisibility { anonymous = 'anonymous', public = 'public' }` (runtime value).
- **v10:** `export type VotingVisibility = NonNullable<CreatePollRequest['voting_visibility']>` (type only). `VotingVisibility.anonymous` fails to compile and is `undefined` at runtime in JS. The poll composer default is the string `'public'`.
- **Migrate:** use the literals `'anonymous'` / `'public'`.
- **Source:** `src/types.ts:338` (v10); `src/types.ts:3693-3696` (v9)

<a id="poll-manager"></a>

### `PollManager` signatures and `user.updated` handling

**Kind:** signature · **Impact:** low

- **v9:** `createPoll(poll: CreatePollData)`; `queryPolls(filter, sort: PollSort = [], options: Pager = {})`.
- **v10:** `createPoll(poll: CreatePollRequest)`; `queryPolls(request?: QueryPollsRequest, requestOptions?)`, the same request as `client.queryPolls` (`{ filter, sort, limit, next, prev }`). New: `registerSubscriptions()` also listens to `user.updated` and replaces that user in every cached poll's votes, answers and `created_by` (and writes the offline DB).
- **Migrate:** rename the type; `client.polls.queryPolls(filter, sort, { limit })` -> `client.polls.queryPolls({ filter, sort, limit })`, with sort as `SortParamRequest[]`.
- **Source:** `src/poll_manager.ts:40-60,80-100,165-170` (v10); `src/poll_manager.ts:49,77-90` (v9)

<a id="poll-reminder-cache"></a>

### Poll and reminder caches no longer gated by `disableCache`

**Kind:** behavior · **Impact:** low

- **v9:** `PollManager.setOrOverwriteInCache` and `ReminderManager.upsertToState` returned early when `client._cacheEnabled()` was false (server-side client with `disableCache: true`).
- **v10:** no gate; server-side clients always populate `client.polls` / `client.reminders` (the option is gone).
- **Migrate:** none; server-side code should use `@stream-io/node-sdk`.
- **Source:** `src/poll_manager.ts:116-127`, `src/reminders/ReminderManager.ts:139-160` (v10); `src/poll_manager.ts:113`, `src/reminders/ReminderManager.ts:122`, `src/client.ts:3894` (v9)

<a id="reminders-delivery"></a>

## 12. Reminders, live location, message delivery and receipts, cooldown

<a id="state-timestamps"></a>

### State timestamps: `Date` / ISO `string` / ms -> `TimestampNS`

**Kind:** type-shape · **Impact:** medium · **PR:** #1884, #1849

- **v9 / v10** (root cause: [TimestampNS](#timestamp-ns)):

  | member                                                                                                                                | v9                | v10                              |
  | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------- |
  | `ThreadState.createdAt`                                                                                                               | `Date`            | `TimestampNS`                    |
  | `ThreadState.deletedAt`, `.updatedAt`                                                                                                 | `Date \| null`    | `TimestampNS \| null`            |
  | `ThreadState.participants[]` `created_at`, `last_read_at`, `last_thread_message_at`, `left_thread_at`                                 | `string`          | `TimestampNS`                    |
  | `ThreadUserReadState.lastReadAt` (also via `ThreadReadState`)                                                                         | `Date`            | `TimestampNS`                    |
  | `ReminderState.created_at`, `.updated_at`                                                                                             | `Date`            | `TimestampNS`                    |
  | `ReminderState.remind_at`, `Reminder.remindAt`                                                                                        | `Date \| null`    | `TimestampNS \| null`            |
  | `timeLeftMs(remindAt)`                                                                                                                | epoch ms `number` | `TimestampNS` (still returns ms) |
  | `PollState.lastActivityAt`                                                                                                            | `Date`            | `TimestampNS`                    |
  | `PollState.created_at`, `.updated_at`, vote/answer `created_at`                                                                       | `string`          | `TimestampNS`                    |
  | `ScheduledLiveLocationSharing.created_at`, `.updated_at`, `.end_at`                                                                   | `string`          | `TimestampNS`                    |
  | `MessageReceiptsTracker.onMessageRead({ readAt })`, `onMessageDelivered({ deliveredAt })`, `onNotificationMarkUnread({ lastReadAt })` | ISO `string`      | `TimestampNS`                    |
  | `OwnMessageReceiptsTrackerMessageLocator(t)`                                                                                          | ms `number`       | `TimestampNS`                    |

  (`MessageReceiptsTracker.reconcileUserRead` was not a v9 API.)

- **Migrate:** compare numerically; convert at the UI boundary with `nsToDate` / `convertTimestampToDate` / `nsToMs`. `reminder.remindAt.getTime()` -> `nsToMs(reminder.remindAt)`.
- **Source:** `src/thread.ts:58-80`, `src/reminders/Reminder.ts:18-33`, `src/poll.ts:57-62`, `src/LiveLocationManager.ts:34-36`, `src/messageDelivery/MessageReceiptsTracker.ts:9-12,331-430` (v10); `src/thread.ts:37-64`, `src/reminders/Reminder.ts:6-22`, `src/poll.ts:78-79`, `src/messageDelivery/MessageReceiptsTracker.ts:5-8,179-270` (v9)

<a id="reminder-methods"></a>

### Reminder write methods take `({ message_id }, request)`; `remind_at` is a `Date`, `null` is gone

**Kind:** signature · **Impact:** medium · **PR:** #1896

- **v9:** `client.reminders.createReminder({ messageId, remind_at?: string | null, user_id? })`, same for `updateReminder` / `upsertReminder` (`CreateReminderOptions`); `client.createReminder(...)` / `client.updateReminder(...)` same object; `client.deleteReminder(messageId, userId?)`; `client.queryReminders({ filter, sort, ...pager })`. `remind_at: null` on update turned a timed reminder into "save for later". `ReminderFilters` already used `message_id`.
- **v10:** `client.reminders.createReminder({ message_id }, { remind_at?: Date, expires_at?: Date }?, requestOptions?)`, same for `updateReminder` / `upsertReminder`; `client.reminders.deleteReminder(messageId)`, `getFromState(messageId)`, `removeFromState(messageId)` still take a bare id. `client.createReminder` / `updateReminder` are the generated `({ message_id }, { remind_at?: Date, expires_at?: Date }?, requestOptions?)`; `client.deleteReminder({ message_id })` (no `user_id`); `client.queryReminders(request: QueryRemindersRequest)`. `UpdateReminderRequest.remind_at` has no `null`: omit it (`updateReminder({ message_id })` sends `{}`); the docs snippet test asserts the server then clears `remind_at` (live API, not run here). `queryNextReminders` / `queryPreviousReminders` call `paginator.toTail()` / `toHead()`.
- **Migrate:** `client.reminders.upsertReminder({ message_id: messageId }, { remind_at: new Date(...) })`; to clear the due date: `client.reminders.upsertReminder({ message_id })`. Pass `Date`, not ISO strings.
- **Source:** `src/reminders/ReminderManager.ts:276-320`, `src/gen/chat/ChatApi.ts:996-1042,1144-1157`, `src/gen/models/index.ts:2611-2614,10900-10903`, `test/docs-snippets/pages/chat/04-messages/09-message_reminders.test.ts:136-147` (v10); `src/reminders/ReminderManager.ts:251-295`, `src/client.ts:5199-5245`, `src/types.ts:4807-4813` (v9)

<a id="reminder-types"></a>

### Reminder data types follow `ReminderResponseData`

**Kind:** type-shape · **Impact:** low

- **v9:** `ReminderResponseBaseOrResponse = ReminderResponseBase & { user?; message? }` (string dates); `ReminderOptions.data`, `Reminder.setState(data)`, `Reminder.toStateValue(data)`, `ReminderManager.upsertToState({ data })` took it.
- **v10:** `ReminderResponseBaseOrResponse = ReminderResponseData` (alias; `TimestampNS` dates for `created_at` / `updated_at` / `remind_at`, adds `expires_at?`, `channel?`); the same members take `ReminderResponseData`.
- **Migrate:** use `ReminderResponseData`.
- **Source:** `src/reminders/Reminder.ts:20,52-60,76-91`, `src/reminders/ReminderManager.ts:139` (v10); `src/reminders/Reminder.ts:8-11,39-46` (v9)

<a id="reminder-event"></a>

### `ReminderEvent` is the generated event payload

**Kind:** type-shape · **Impact:** low

- **v9:** `ReminderEvent = { cid; created_at: string; message_id; reminder: ReminderResponse; type: EventTypes; user_id }`.
- **v10:** ``ReminderEvent = EventPayload<`reminder.${string}` | 'notification.reminder_due'>``; `reminder` is optional on the generated events, `created_at` is `TimestampNS`.
- **Migrate:** narrow with `ReminderManager.isReminderWsEventPayload(event)` and guard `event.reminder`.
- **Source:** `src/reminders/ReminderManager.ts:37-39,190-193` (v10); `src/reminders/ReminderManager.ts:41-48` (v9)

<a id="reminder-config-state"></a>

### `ReminderManager.configState` is a read-only getter

**Kind:** type-shape · **Impact:** low

- **v9:** `configState: StateStore<ReminderManagerConfig>` (assignable field).
- **v10:** `get configState()` backed by `ConfigController` (cannot be reassigned); adds `config` and `initializeConfig(config?)`; `updateConfig` unchanged. Live timers get a new `stopTimerRefreshBoundaryMs` on any config write, not only through `updateConfig`. `StateStore` comes from `@stream-io/state-store`. `updateConfig` patches are not retained (v9 kept them for the client's lifetime): they are discarded whenever the client re-derives manager config, which happens on any `client.config` change under `client` (including sibling keys such as `client.threads`), on `client.config.reset()`, and on every `connectUser()` after `disconnectUser()` (tracked in v10-followups.md). `DEFAULT_REMINDER_MANAGER_CONFIG` (including `scheduledOffsetsMs`) is deep-frozen, and the resolved config shares those arrays, so mutating them throws a `TypeError` in strict mode.
- **Migrate:** set persistent values through `client.config.set({ client: { reminders: ... } })` or the `client` setup function; treat `updateConfig` as valid only until the next re-derivation; never assign `configState`. Copy before changing defaults (`[...config.scheduledOffsetsMs, x]`) and apply the copy through config.
- **Source:** `src/reminders/ReminderManager.ts:17-27,55-120`, `src/client.ts:415-446,649-650,872-873`, `src/configuration/ConfigController.ts:161,192-196` (v10); `src/reminders/ReminderManager.ts:21-31,66-96` (v9)

<a id="reminder-paginator"></a>

### `ReminderPaginator` retyped on the new `BasePaginator`

**Kind:** type-shape · **Impact:** low

- **v9:** `class ReminderPaginator extends BasePaginator<ReminderResponse>`; `sort: ReminderSort`; `new ReminderPaginator(client, options?: PaginatorOptions)`; file `src/pagination/ReminderPaginator.ts`.
- **v10:** `extends BasePaginator<ReminderResponseData, QueryRemindersRequest>`; constructor options `PaginatorOptions<ReminderResponseData, QueryRemindersRequest>`; `sort: SortParamRequest[] | undefined` (setting it rebuilds a client-side comparator and resets; internal `_sort`); `filters: ReminderFilters` (internal `_filters`, derived from `QueryRemindersRequest`); `query` / `filterQueryResults` follow the new contract; items keyed by `message_id` (deduped); file moved to `src/pagination/paginators/` (still root-exported). Items are ordered client-side by the comparator built from `sort` (v9 appended pages in server order); with `sort` unset the order is `created_at` ascending, then `message_id`, not the server's response order. Inherited API changes: [paginator state](#paginator-state), [navigation](#paginator-navigation), [subclass contract](#paginator-subclass).
- **Migrate:** `client.reminders.paginator.sort = [{ field: 'remind_at', direction: 1 }]`, matching the order you query with; prefer `toTail()` over the deprecated `next()`.
- **Source:** `src/pagination/paginators/ReminderPaginator.ts:22-109` (v10); `src/pagination/ReminderPaginator.ts:10-56`, `src/pagination/BasePaginator.ts:121-129` (v9)

<a id="live-location-dispose"></a>

### `LiveLocationManager.dispose()` required for teardown

**Kind:** behavior · **Impact:** low

- **v9:** no configuration; `unregisterSubscriptions()` was the whole teardown.
- **v10:** the constructor subscribes the instance to the `liveLocationManager` configuration key; only `dispose()` releases it (`unregisterSubscriptions()` is ref-counted and leaves it). Until then the client's config registry holds the manager. Adds `config`, `configState`, `updateConfig`, `initializeConfig` (`minUpdateThrottleMs`, default 3000).
- **Migrate:** call `liveLocationManager.dispose()` next to the last `unregisterSubscriptions()`. Nothing fails to compile if you don't; it leaks the instance.
- **Source:** `src/LiveLocationManager.ts:86-100,143-188,195-236` (v10); `src/LiveLocationManager.ts:105` (v9)

<a id="live-location-requests"></a>

### Live location requests and expiry handling

**Kind:** behavior · **Impact:** low

- **v9:** coordinate updates via `client.updateLocation({ created_by_device_id, message_id, latitude, longitude })`; init via `client.getSharedLocations()`; a location without `end_at` was kept; stop-sharing timers used one `setTimeout` (a share longer than about 24.9 days fired after 1 ms).
- **v10:** `client.updateLiveLocation({ message_id, latitude, longitude })` (no device id); init via `client.getUserLiveLocations()`; locations with absent or non-finite `end_at` are dropped; long shares re-arm their timer in steps. Throttle floor read from `config.minUpdateThrottleMs`.
- **Migrate:** none for `LiveLocationManager` users; direct callers see [renamed methods](#renamed-client-methods).
- **Source:** `src/LiveLocationManager.ts:43-66,254-266,300-330,377-407` (v10); `src/LiveLocationManager.ts:38-42,124-140,192-197` (v9)

<a id="cooldown-timestamp"></a>

### `CooldownTimer.ownLatestMessageDate` -> `ownLatestMessageTimestamp`

**Kind:** renamed · **Impact:** low

- **v9:** `CooldownTimerState.ownLatestMessageDate?: Date`; `channel.cooldownTimer.ownLatestMessageDate`; `setOwnLatestMessageDate(date: Date | undefined)`.
- **v10:** `CooldownTimerState.ownLatestMessageTimestamp?: TimestampNS`; getter `ownLatestMessageTimestamp`; `setOwnLatestMessageTimestamp(ns: TimestampNS | undefined)`. `CooldownTimer` is reachable as the public `channel.cooldownTimer` in both versions.
- **Migrate:** rename; convert with `nsToDate` where a `Date` is needed.
- **Source:** `src/CooldownTimer.ts:21,57-59,144-147` (v10); `src/CooldownTimer.ts:18,63-65,135-137` (v9)

<a id="cooldown-subscriptions"></a>

### `CooldownTimer` derives from stores and is registered by `Channel`

**Kind:** behavior · **Impact:** low

- **v9:** `Channel` / the client refreshed the timer imperatively (4 call sites); the timer's own `registerSubscriptions` (`message.new`, `channel.updated`) existed but was never called. The refresh sites were `query()`, own `message.new`, `channel.updated` and `hydrateActiveChannels`; a capability-only `updatePartial` did not refresh it.
- **v10:** `Channel` calls `cooldownTimer.registerSubscriptions()` at construction and unregisters on disconnect; it refreshes on `channel.state` `data.cooldown` / `ownCapabilities` changes and on message-paginator item changes, and the countdown stops on unregister.
- **Migrate:** remove manual `cooldownTimer.refresh()` calls tied to WS events (harmless if kept).
- **Source:** `src/CooldownTimer.ts:61-95`, `src/channel.ts:358-359,3089` (v10); `src/CooldownTimer.ts:67-87`, `src/channel.ts:179,1674,2143,2298` (v9)

<a id="delivery-reporter-mark-read"></a>

### `MessageDeliveryReporter.markRead`: generated types; throws when read events are disabled

**Kind:** behavior · **Impact:** medium · **PR:** #1886

- **v9:** `markRead(collection, options?: MarkReadOptions): Promise<EventAPIResponse | null>`; delegated to `channel.markAsReadRequest`, which returned `null` without a request when `read_events` was off or the user lacked the `read-events` capability (candidate kept).
- **v10:** `markRead(collection, options?: MarkReadRequest): Promise<Partial<StreamResponse<MarkReadResponse>> | null>`. For channels: a `channel.requestHandlers.markReadRequest` config handler runs if set; else if `readEvents.enabled` is false and `readEvents.localUnreadCountEnabled` is true it calls `channel.markReadLocally()` and returns `null`; else it calls `channel.markRead()`, which throws `Read events are disabled ...` when `readEvents.enabled` is false. For threads: `thread.requestHandlers.markReadRequest` or `channel.markRead({ thread_id })` (throws the same way). Affects `channel.markReadViaReporter` and `thread.markRead` ([channel markRead](#channel-mark-read)).
- **Migrate:** catch the error on explicit calls, or gate on `channel.config.readEvents.enabled`; read `response?.event` (optional).
- **Source:** `src/messageDelivery/MessageDeliveryReporter.ts:398-440`, `src/channel.ts:1303-1313` (v10); `src/messageDelivery/MessageDeliveryReporter.ts:281-302`, `src/channel.ts:1231-1247` (v9)

<a id="throttled-mark-read"></a>

### `throttledMarkRead` fires on the leading edge and swallows errors

**Kind:** behavior · **Impact:** low

- **v9:** `throttle(markRead, 1000, { leading: false, trailing: true })` with the v9 `throttle`: a burst sent one request after 1 s with the last arguments, and a single isolated call was dropped. Rejections surfaced as unhandled.
- **v10:** `{ leading: true, trailing: true }` on the new throttle: the first call fires immediately, a burst adds one trailing call; rejections are caught and dropped. Interval from `config.markAsReadThrottleTimeoutMs` (rebuilt on change). One throttle is shared by every channel and thread (v9 threads had their own).
- **Migrate:** none; explicit `markRead()` still rejects.
- **Source:** `src/messageDelivery/MessageDeliveryReporter.ts:84-100,452-463`, `src/utils/throttling/throttle.ts:39-104`, `src/thread.ts:924-926` (v10); `src/messageDelivery/MessageDeliveryReporter.ts:304-307`, `src/utils.ts:874-904`, `src/thread.ts:576-580` (v9)

<a id="announce-delivery-options"></a>

### `AnnounceDeliveryOptions` and delivery gating

**Kind:** type-shape · **Impact:** low

- **v9:** `AnnounceDeliveryOptions = Omit<MarkDeliveredOptions, 'latest_delivered_messages'>` (included `user`, `user_id`); delivery reporting gated on `channel.getConfig()?.delivery_events`; requests via `client.markChannelsDelivered`.
- **v10:** `Omit<MarkDeliveredRequest, 'latest_delivered_messages'>` (no `user` / `user_id`); gated on `channel.config.deliveryEvents.enabled`; requests via generated `client.markDelivered` (empty batches are still skipped by `announceDelivery`). Buffer, batch size and back-off constants are now `config` fields. Protected `markDeliveredRequestPromise` is `Promise<void> | null` (subclasses only).
- **Migrate:** drop `user` / `user_id`.
- **Source:** `src/messageDelivery/MessageDeliveryReporter.ts:23-56,165-168,326-380` (v10); `src/messageDelivery/MessageDeliveryReporter.ts:15-30,71-74,263` (v9)

<a id="message-receipts-tracker"></a>

### `MessageReceiptsTracker` requires `channel`, self-subscribes, `MsgRef.timestamp`

**Kind:** signature · **Impact:** low

- **v9:** `new MessageReceiptsTracker({ locateMessage })` (`OwnMessageReceiptsTrackerOptions`, `locateMessage` required); fed only by `ingestInitial(ReadResponse[])` / `onMessageRead` / `onMessageDelivered` / `onNotificationMarkUnread` calls from `Channel`; `MsgRef = { timestampMs: number; msgId }`.
- **v10:** constructor `new MessageReceiptsTracker({ channel, locateMessage? })` (default locator `channel.messagePaginator.findItemByTimestamp`); `extends WithSubscriptions` (`addUnsubscribeFunction`, `hasSubscriptions`, `incrementRefCount`, `registerSubscriptions`, `unregisterSubscriptions`); `registerSubscriptions()` (called by `Channel`) reconciles from `channel.state.read` (`reconcileFromReadStore`, `setPendingReadStoreReconcileMeta`), and `Channel` no longer calls the `on*` methods; `ingestInitial(ReadStateResponse[])`; `MsgRef = { timestamp: TimestampNS; msgId }`. Adds `snapshotStore` (`MessageReceiptsSnapshot`), `isDeliveredToOthers`, `isReadByOthers`.
- **Migrate:** read receipts from `channel.messageReceiptsTracker.snapshotStore` or the query methods; rename `timestampMs` -> `timestamp` (ns). Only code constructing a tracker needs `channel`.
- **Source:** `src/messageDelivery/MessageReceiptsTracker.ts:9-17,128-131,191-245,295-330,483-498`, `src/channel.ts:355-356` (v10); `src/messageDelivery/MessageReceiptsTracker.ts:5-8,73-75,135-145`, `src/channel.ts:172,2041,2073,2276,2494` (v9)

<a id="search"></a>

## 13. Search

<a id="search-controller-internal-state"></a>

### `SearchController._internalState` / `InternalSearchControllerState` removed

**Kind:** removed · **Impact:** medium · **Internal:** yes (`_`-prefixed member; the type was exported) · **PR:** #1866

- **v9:** `searchController._internalState: StateStore<InternalSearchControllerState>` with `{ focusedMessage?: MessageResponse }`; type `InternalSearchControllerState` exported.
- **v10:** removed, no replacement on `SearchController`.
- **Migrate:** to focus a search result, open its channel and call `channel.messagePaginator.jumpToMessage(messageId)`; subscribe to `messagePaginator.messageFocusSignal` (`MessageFocusSignalState`) to highlight it (stream-chat-react does this).
- **Source:** `src/search/SearchController.ts:9-33`, `src/pagination/paginators/MessageIntervalPaginator.ts:49-58,239,653` (v10); `src/search/SearchController.ts:11-16,32,42` (v9)

<a id="search-controller-config"></a>

### `SearchController.config` and configuration

**Kind:** type-shape · **Impact:** low · **PR:** #1831, #1901

- **v9:** `config: SearchControllerConfig` plain writable field; `new SearchController({ config, sources })` (`SearchControllerOptions`).
- **v10:** `get config(): Readonly<SearchControllerConfig>` over a `configState` store; `updateConfig(partial)`, `initializeConfig(slice?)`; new optional `client` option that wires the controller to `client.config` key `searchController`; new `registerSubscriptions()` / `dispose()`.
- **Migrate:** replace `controller.config = {...}` (now throws `Cannot set property config ... which has only a getter`) and `controller.config.keepSingleActiveSource = x` (silent, non-reactive) with `controller.updateConfig({ keepSingleActiveSource: x })`. Pass `client` to take part in `client.config`. Call `controller.dispose()` on unmount and `registerSubscriptions()` on (re)mount; this releases the channel-store claims of active channel/message sources.
- **Source:** `src/search/SearchController.ts:20-33,55-121` (v10); `src/search/SearchController.ts:34,37-43` (v9)

<a id="channel-search-source-unwatched"></a>

### `ChannelSearchSource` results are not watched

**Kind:** behavior · **Impact:** medium · **PR:** #1901

- **v9:** `client.queryChannels(filters, sort ?? {}, { ...searchOptions, limit, offset })`, inheriting the default `watch: true`; result channels received WS events.
- **v10:** `client.queryChannelsAndHydrate({ filter_conditions, sort, watch: false, ...searchOptions, limit, offset }, { withResponse: false })`. Results are unwatched previews; opening a channel watches it. While the source is active it holds a claim on its result channels in `client.channelManager.channelStore` (released on deactivate or `dispose()`); it has `registerSubscriptions()` / `dispose()`.
- **Migrate:** pass `searchOptions: { watch: true }` to keep v9 behaviour, or watch the channel when the user opens it (`channel.watch()`). Call `searchController.dispose()` when tearing down a UI that keeps a source active.
- **Source:** `src/search/ChannelSearchSource.ts:18-23,70-127` (v10); `src/search/ChannelSearchSource.ts:75-77` (v9)

<a id="message-search-source-hydration"></a>

### `MessageSearchSource` channel hydration

**Kind:** behavior · **Impact:** medium · **PR:** #1901, #1836

- **v9:** unknown result channels were hydrated with `client.queryChannels(channelQueryFilters, { last_message_at: -1, ...channelQuerySort }, channelQueryOptions)` (defaults `watch: true, state: true`), so they were watched; `channelQuerySort` could override the sort.
- **v10:** hydration uses `queryChannelsAndHydrate({ filter_conditions, sort: [{ field: 'last_message_at', direction: -1 }], watch: false, ...channelQueryOptions })`. Channels are unwatched unless `channelQueryOptions.watch` is true. `channelQuerySort` is stored but never sent (tracked in v10-followups.md). Every result whose channel is still not in the store afterwards is created via `channelManager.ensure({ id, type })` with `data = message.channel` (unwatched, not loaded). Results without a `message` are dropped. The source claims its result channels while active (`registerSubscriptions()` / `dispose()`).
- **Migrate:** pass `channelQueryOptions: { watch: true }` if result channels must receive events before being opened; do not rely on `channelQuerySort`.
- **Source:** `src/search/MessageSearchSource.ts:58-72,165-208,255-305` (v10); `src/search/MessageSearchSource.ts:202,221-229` (v9)

<a id="search-source-sort"></a>

### Search source sort options take `SortParamRequest[]`

**Kind:** type-shape · **Impact:** medium · **PR:** #1836

- **v9:** `ChannelSearchSourceOptions.sort: ChannelSort`, `UserSearchSourceOptions.sort: UserSort`, `ChannelMemberSearchSourceOptions.sort: MemberSort`, `MessageSearchSourceOptions.messageSearchSort: SearchMessageSort`, `.channelQuerySort: ChannelSort` (object or array form); same-named instance fields.
- **v10:** all `SortParamRequest[]` (`[{ field, direction }]`), forwarded as-is except `messageSearchSort`, which is merged under the `created_at` primary order as in v9 (a `created_at` entry sets its direction). `UserSearchSource` appends `{ field: 'id', direction: 1 }` last unless an `id` entry exists (v9 object form made `id` the primary key). A non-array sort is no longer normalized: `UserSearchSource` fails inside `query` (`baseSort.some is not a function`), `MessageSearchSource` fails with `... is not iterable`, and `ChannelSearchSource` / `ChannelMemberSearchSource` send the object to the API; client-side failures land in `lastQueryError`. `searchOptions` / `channelQueryOptions` and `filters` types follow the generated request types ([filters](#filter-types)).
- **Migrate:** `{ created_at: -1 }` -> `[{ field: 'created_at', direction: -1 }]` ([sort](#sort-shape)).
- **Source:** `src/search/ChannelSearchSource.ts:18,32`, `src/search/UserSearchSource.ts:16,26,74-78`, `src/search/ChannelMemberSearchSource.ts:21,31`, `src/search/MessageSearchSource.ts:62,65,82,85,247`, `src/search/ChannelSearchSource.ts:112-123`, `src/search/ChannelMemberSearchSource.ts:82-88` (v10); `src/search/UserSearchSource.ts:74-80`, `src/search/MessageSearchSource.ts:62-65` (v9)

<a id="pagination"></a>

## 14. Pagination primitives (`BasePaginator`, `FilterBuilder`)

<a id="paginator-state"></a>

### `BasePaginator` state and cursor shape

**Kind:** type-shape · **Impact:** medium

- **v9:** `PaginatorState<T = any> = { hasNext, hasPrev, isLoading, items, lastQueryError?, cursor?: { next, prev }, offset? }`; `paginator.cursor.next/.prev`; getters `hasNext`, `hasPrev`; `initialState`.
- **v10:** `PaginatorState<T>` (type argument now required) `= { hasMoreHead, hasMoreTail, isLoading, items, lastQueryError?, cursor?: PaginatorCursor, offset? }`; `PaginatorCursor = { tailward, headward }` (`undefined` = not requested yet, `null` = exhausted); getters `hasMoreTail`, `hasMoreHead`; `hasNext` / `hasPrev` kept as `@deprecated` getters on the class only; `initialState` follows the new shape.
- **Migrate:** `state.hasNext` -> `state.hasMoreTail`, `state.hasPrev` -> `state.hasMoreHead`, `cursor.next` -> `cursor.tailward`, `cursor.prev` -> `cursor.headward`; `PaginatorState` -> `PaginatorState<Item>`. Selectors reading `hasNext` from `state` now get `undefined`.
- **Source:** `src/pagination/paginators/BasePaginator.ts:169-176,256-264,685-709,732-742` (v10); `src/pagination/BasePaginator.ts:5,19-27,56-62,72-82` (v9)

<a id="paginator-navigation"></a>

### `BasePaginator` navigation API

**Kind:** signature · **Impact:** medium

- **v9:** `next()`, `prev()`, `nextDebounced()`, `prevDebounced()` (no args); `executeQuery({ direction: 'next' | 'prev' })`; public `canExecuteQuery(direction)`.
- **v10:** `toTail(params?)`, `toHead(params?)`, `toTailDebounced(params?)`, `toHeadDebounced(params?)`, `reload()`; the old names are `@deprecated` aliases taking the same `params` (`reset`, `keepPreviousItems`, `silent`, `retryCount`, `updateState`, `requestOptions`). `executeQuery(params?: PaginationQueryParams<Q>)` (`{ direction, queryShape, reset, retryCount, requestOptions? }`) returns `ExecuteQueryReturnValue<T> | void`. Direction values are `'tailward' | 'headward'`. `canExecuteQuery` is `protected` and takes `{ direction?, reset? }`; both directions are refused while `isLoading`.
- **Migrate:** `next` -> `toTail`, `prev` -> `toHead`, `executeQuery({ direction: 'next' })` -> `executeQuery({ direction: 'tailward' })`; drop external `canExecuteQuery` calls (check `isLoading` / `hasMoreTail`).
- **Source:** `src/pagination/paginators/BasePaginator.ts:126,185-216,3023-3032,3138-3148,3483-3533` (v10); `src/pagination/BasePaginator.ts:4,104-106,131,174-183` (v9)

<a id="paginator-subclass"></a>

### `BasePaginator` subclass contract

**Kind:** signature · **Impact:** low

- **v9:** `abstract class BasePaginator<T>`; `protected constructor(options?: PaginatorOptions)`; subclasses implemented `query({ direction })` and `filterQueryResults(items): T[] | Promise<T[]>`; cursor mode auto-detected when the first response carried `next` / `prev` (`_isCursorPagination`); `_executeQueryDebounced`.
- **v10:** `BasePaginator<T, Q>` (query-shape type `Q`); `constructor(options?: PaginatorOptions<T, Q>, builtInDefaults?)`; subclasses must also implement `protected getNextQueryShape()` (the base throws `Paginator.getNextQueryShape() is not implemented`, so an unmigrated subclass's `next()` rejects); `query(params: PaginationQueryParams<Q>)` receives `{ direction, queryShape, reset, retryCount, requestOptions? }`; return `PaginationQueryReturnValue` `{ items, tailward?, headward? }` (`next` / `prev` deprecated, honored only when `initialCursor` is set); cursor mode is `isCursorPagination = !!cursor`, i.e. only with an `initialCursor` (e.g. `ZERO_PAGE_CURSOR`); `_isCursorPagination` removed; `filterQueryResults` must be synchronous; the first-page `query()` runs after an awaited offline-preload tick. `PaginatorOptions<T, Q>` and `PaginationQueryParams<Q>` now require type arguments. New `PaginatorOptions` / config members: `doRequest`, `initialCursor`, `initialOffset`, `itemOrderComparator`, `lockItemOrder`, `maxLoadedItems`, `hasPaginationQueryShapeChanged`, `retryCount`, `throwErrors`, `stateThrottleMs`, `declarativeConfig`; internal `itemIndex`, `createItemIndex`, `deriveCursor`, `getStateAfterQuery`.
- **Migrate:** add `Q` and `getNextQueryShape()`, return `tailward` / `headward`, pass `initialCursor: ZERO_PAGE_CURSOR` for cursor APIs, make `filterQueryResults` sync. See [UserGroupPaginator](#user-group-paginator) for a minimal port.
- **Source:** `src/pagination/paginators/BasePaginator.ts:185-249,351-430,477,621-670,728-730,987-1000,3260-3268` (v10); `src/pagination/BasePaginator.ts:6-10,29-33,39-50,96-98,142-158` (v9)

<a id="paginator-config"></a>

### `BasePaginator` configuration and defaults

**Kind:** type-shape · **Impact:** low

- **v9:** `pageSize` plain field; debounce set via constructor `debounceMs` or `setDebounceOptions`; `DEFAULT_PAGINATION_OPTIONS: Required<PaginatorOptions>` = `{ debounceMs: 300, pageSize: 10 }` (mutable).
- **v10:** `pageSize` is an accessor over `config.pageSize`; `config` is a `Readonly<BasePaginatorConfig<T, Q>>` getter over `configState`; change via `updateConfig(partial)` (`initializeConfig` resets); `DEFAULT_PAGINATION_OPTIONS: BasePaginatorConfig<any, any>` is deep-frozen and adds `lockItemOrder`, `hasPaginationQueryShapeChanged`, `retryCount`, `throwErrors`. Defaults (300 ms, 10) unchanged.
- **Migrate:** `paginator.pageSize = n` still works; use `updateConfig({ debounceMs })` instead of mutating config; do not write into `DEFAULT_PAGINATION_OPTIONS` (throws in strict mode).
- **Source:** `src/pagination/paginators/BasePaginator.ts:338-349,412-475,791-817` (v10); `src/pagination/BasePaginator.ts:29-37,41,100-102` (v9)

<a id="paginator-items"></a>

### `BasePaginator` item handling semantics

**Kind:** behavior · **Impact:** low

- **v9:** each page appended to `items` in server order, no dedup; `items` reset only by `resetState()` or when `undefined`; offset mode left `hasPrev` at `true`, `hasNext = items.length === pageSize`; `prev` could run while loading; errors only stored in `lastQueryError`.
- **v10:** pages are ingested into interval storage keyed by `getItemId` (default `item.id`): duplicates collapse, items are ordered by the paginator comparator, a changed query shape (deep-equal of `getNextQueryShape()`) is treated as a first page and resets state first. Offset mode: `hasMoreHead = initialOffset > 0`, `hasMoreTail = items.length >= pageSize`. Optional `retryCount` and `throwErrors`.
- **Migrate:** none for consumers of built-in paginators; custom subclasses must expose a stable id and a comparator matching server order.
- **Source:** `src/pagination/paginators/BasePaginator.ts:3034-3063,3098-3136,3278-3300` (v10); `src/pagination/BasePaginator.ts:104-129,150-156` (v9)

<a id="user-group-paginator"></a>

### `UserGroupPaginator`

**Kind:** type-shape · **Impact:** low

- **v9:** `new UserGroupPaginator(client, options?: PaginatorOptions)`, `extends BasePaginator<UserGroupResponse>`; called `client.queryUserGroups`; initial `cursor` `undefined`; `hasPrev: false`; cursor `created_at_gt` was the raw string `created_at`.
- **v10:** `extends BasePaginator<UserGroupResponse, ListUserGroupsOptions>`; options `PaginatorOptions<UserGroupResponse, ListUserGroupsOptions>`; `query` calls `client.listUserGroups`; implements `getNextQueryShape`; initial cursor `{ tailward: undefined, headward: null }`; `hasMoreHead: false`; items ordered by `created_at` then `id`; cursor `created_at_gt` built with `nsToRfc3339(created_at)`. Inherits every `BasePaginator` change above.
- **Migrate:** read `state.hasMoreTail` / call `toTail()`; the `teamId` setter is unchanged.
- **Source:** `src/pagination/paginators/UserGroupPaginator.ts:40-131` (v10); `src/pagination/UserGroupPaginator.ts:37-90` (v9)

<a id="extended-query-filter"></a>

### `ExtendedQueryFilter` / `ExtendedQueryFilters` / `ExtendedQueryLogicalOperators` removed

**Kind:** removed · **Impact:** low · **PR:** #1870

- **v9:** exported from `pagination/FilterBuilder` for typing `FilterBuilder` filter generators.
- **v10:** removed. `FilterBuilder` runtime unchanged; `FilterBuilderOptions` gained a default for `TContext`.
- **Migrate:** type filters with the endpoint filter types (`ChannelFilters`, `UserFilters`, `MemberFilters`, `MessageFilters`) or `Filters<{ field: { type, operators } }>` ([filters](#filter-types)).
- **Source:** `src/pagination/FilterBuilder.ts:1-19` (v10); `src/pagination/FilterBuilder.ts:4-23` (v9)

<a id="pagination-deep-imports"></a>

### Pagination source layout (deep imports)

**Kind:** packaging · **Impact:** low

- **v9:** `pagination/BasePaginator.ts`, `pagination/UserGroupPaginator.ts` (and `ReminderPaginator.ts`) re-exported by `pagination/index.ts`.
- **v10:** moved to `pagination/paginators/*`; `pagination/index.ts` re-exports `./paginators` and `./FilterBuilder`. Root exports keep the same names.
- **Migrate:** import from `stream-chat`, not from `stream-chat/dist/types/pagination/BasePaginator`.
- **Source:** `src/pagination/index.ts:1-2`, `src/pagination/paginators/index.ts:1-8` (v10); `src/pagination/index.ts:1-4` (v9)

<a id="moderation"></a>

## 15. Moderation

`StreamChat`-level moderation methods that moved to `client.moderation`: [client moderation methods](#client-moderation-methods). Generated moderation config types: [moderation config types](#moderation-config-types).

<a id="moderation-methods"></a>

### `Moderation` methods are generated request-object methods

**Kind:** signature · **Impact:** medium · **PR:** #1836

- **v9:** hand-written positional methods on `class Moderation`.
- **v10:** `class Moderation extends ModerationApi`; the methods below are inherited from `gen/moderation/ModerationApi.ts` with `(request | pathParams, request?, requestOptions?)` and return `StreamResponse<...>` generated responses. Server-side `user_id` options are gone. Passing a positional string where `pathParams` is expected throws at runtime (`"0" is not a path parameter of ...`). New public field `apiClient`.

  | v9                                                             | v10                                                                                           |
  | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
  | `queryReviewQueue(filter, sort, options)`                      | `queryReviewQueue({ filter, sort: SortParamRequest[], limit, next, ... })`                    |
  | `upsertConfig(config)`                                         | `upsertConfig(request: UpsertConfigRequest)`                                                  |
  | `getConfig(key, { team }?)`                                    | `getConfig({ key }, { team }?)`                                                               |
  | `deleteConfig(key, { team }?)`                                 | `deleteConfig({ key }, { team }?)`                                                            |
  | `queryConfigs(filter, sort, options)`                          | `queryModerationConfigs({ filter, sort, limit, next, prev })`                                 |
  | `submitAction(actionType, itemID, options)`                    | `submitAction({ action_type, item_id, ...payload })`                                          |
  | `flag(entityType, entityId, entityCreatorID, reason, options)` | `flag({ entity_type, entity_id, entity_creator_id?, reason?, custom?, moderation_payload? })` |
  | `muteUser(targetID, { timeout, user_id })`                     | `mute({ target_ids: [targetId], timeout })`                                                   |
  | `unmuteUser(targetID, { user_id })`                            | `unmuteUser(targetId, requestOptions?)` or `unmute({ target_ids })`                           |

  Other generated members now on `Moderation` (additive): `ban`, `unban`, `appeal`, `getAppeal`, `queryAppeals`, `bulkActionAppeals`, `createQueue`, `getQueue`, `listQueues`, `updateQueue`, `deleteQueue`, `getActionConfig`, `upsertActionConfig`, `deleteActionConfig`, `bulkUpsertActionConfig`, `bulkDeleteActionConfig`.

- **Migrate:** rewrite calls per the table; sort entries become `[{ field, direction }]`.
- **Source:** `src/moderation.ts:11-17,91-93`, `src/gen/moderation/ModerationApi.ts:205-282,375-404,423-436` (v10); `src/moderation.ts:43-48,91-255` (v9)

<a id="moderation-removed-methods"></a>

### `Moderation` methods removed without client-side replacement

**Kind:** removed · **Impact:** low

- **v9:** `getUserModerationReport(userID, options)`, `check(...)`, `checkUserProfile(userId, profile)`, `addCustomFlags(...)`, `addCustomMessageFlags(messageID, flags)`, `upsertModerationRule(rule)`, `queryModerationRules(filter, sort, options)`, `getModerationRule(id)`, `deleteModerationRule(id)`.
- **v10:** removed, no replacement in this package.
- **Migrate:** call these endpoints from a server-side SDK (e.g. `@stream-io/node-sdk`; exact method names unverified).
- **Source:** `src/moderation.ts:1-94`, `src/gen/moderation/ModerationApi.ts` (v10, absent); `src/moderation.ts:158-168,270-298,326-353,368-406,414-463` (v9)

<a id="moderation-flag"></a>

### `Moderation.flagUser` / `flagMessage`

**Kind:** signature · **Impact:** low

- **v9:** `flagUser(flaggedUserID, reason: string, options?: ModerationFlagOptions)` and `flagMessage(messageID, reason, options?)`; options `{ custom?, moderation_payload?, user_id? }`; always sent `entity_creator_id: ''`; returned `{ item_id } & APIResponse`.
- **v10:** `flagUser({ user_id, reason?, ...options }, requestOptions?)` / `flagMessage({ message_id, reason?, ...options }, requestOptions?)`, one request object; `reason` is optional; options `Omit<FlagRequest, 'entity_id' | 'entity_type' | 'reason'>` (no `user_id`; `entity_creator_id` settable and omitted unless given); returns `StreamResponse<FlagItemResponse>`.
- **Migrate:** `flagMessage(id, reason, { custom })` -> `flagMessage({ message_id: id, reason, custom })`, `flagUser(id, reason)` -> `flagUser({ user_id: id, reason })`; drop the v9 acting `user_id` option.
- **Source:** `src/moderation.ts:34-81`, `src/types.ts:349-352` (v10); `src/moderation.ts:60-76` (v9)

<a id="moderation-entity-types"></a>

### `MODERATION_ENTITY_TYPES.userprofile` removed

**Kind:** removed · **Impact:** low

- **v9:** `{ user: 'stream:user', message: 'stream:chat:v1:message', userprofile: 'stream:v1:user_profile' }`.
- **v10:** `{ user, message }`; `userprofile` removed with `checkUserProfile`.
- **Migrate:** inline `'stream:v1:user_profile'` if still needed.
- **Source:** `src/moderation.ts:5-8` (v10); `src/moderation.ts:36-40` (v9)

<a id="notifications"></a>

## 16. Notifications

<a id="notification-manager-config"></a>

### `NotificationManager.config` is read-only and follows `client.config`

**Kind:** type-shape · **Impact:** low · **PR:** #1831, #1872

- **v9:** `config: NotificationManagerConfig` plain field, `mergeWith(DEFAULT_NOTIFICATION_MANAGER_CONFIG, config)` at construction; mutable. A custom instance was passed as `options.notifications`.
- **v10:** `get config(): Readonly<NotificationManagerConfig>` over `configState`; `updateConfig(partial)` (deep merge), `initializeConfig(slice)`; `DEFAULT_NOTIFICATION_MANAGER_CONFIG` is deep-frozen. The client re-derives the manager's config from `client.config` key `client.notifications` at construction, on every change of any `client.*` key (not only `client.notifications`), on `client.config.reset()` and on every `connectUser()` after `disconnectUser()`, replacing earlier `updateConfig` patches (constructor arguments survive; tracked in v10-followups.md). A custom instance is passed as `config.client.notificationManager`. Severities and every notification type string v9 emitted are unchanged; `Notification.type` is typed `CoreNotificationType | (string & {})`; `CORE_NOTIFICATION_TYPE` lists the 14 emitted ids (including `api:message:send:failed` and `api:message:update:failed`).
- **Migrate:** `manager.config.durations.error = 5000` (throws on the frozen default) -> `manager.updateConfig({ durations: { error: 5000 } })` or `client.config.set({ client: { notifications: { durations: { error: 5000 } } } })`.
- **Source:** `src/notifications/NotificationManager.ts:20-74`, `src/notifications/configuration.ts:6-14`, `src/notifications/types.ts:40-60,97`, `src/client.ts:341,415-446,649-650,872-873` (v10); `src/notifications/NotificationManager.ts:15-19` (v9)

<a id="offline-support"></a>

## 17. Offline support (`AbstractOfflineDB` implementers)

`AbstractOfflineDB` is an injection point (`client.setOfflineDBApi(...)`); these entries matter mostly for custom implementations such as the React Native SQLite store.

<a id="offline-sync-manager"></a>

### `OfflineDBSyncManager.syncStatus` -> `isSynced`; sync trigger

**Kind:** renamed · **Impact:** medium · **PR:** #1859

- **v9:** `public syncStatus: boolean`; `connectionChangedListener: { unsubscribe(): void } | null` from `client.on('connection.changed', ...)`; sync and pending-task replay ran on `connection.changed` (`event.online`), so a manually dispatched `connection.changed` triggered it.
- **v10:** `public isSynced: boolean`; `connectionChangedListener: Unsubscribe | null` (a bare function) from `client.wsConnection.state.subscribeWithSelector(({ isHealthy }) => ...)` (first emission ignored as baseline). `connection.changed` no longer triggers a sync.
- **Migrate:** `syncManager.syncStatus` -> `syncManager.isSynced`; `connectionChangedListener.unsubscribe()` -> `connectionChangedListener?.()`; listen with `syncManager.onSyncStatusChange(cb)` (unchanged).
- **Source:** `src/offline-support/offline_sync_manager.ts:20-25,62-104,145` (v10); `src/offline-support/offline_sync_manager.ts:16-17,54-87,126` (v9)

<a id="offline-db-contract"></a>

### `OfflineDBApi` / `AbstractOfflineDB` implementer contract

**Kind:** signature · **Impact:** medium (high for custom offline DB implementations) · **PR:** #1869, #1884, #1836

- **v9:** `getChannelsForQuery({ userId, filters?, options?: ChannelOptions, sort? })` -> `Omit<ChannelAPIResponse, 'duration'>[] | null`; `getChannels` -> `Omit<ChannelAPIResponse, 'duration'>[] | null`; `getAppSettings` -> `AppSettingsAPIResponse | null`; `upsertCidsForQuery({ cids, filters?, options?: ChannelOptions, sort?, execute? })`.
- **v10:** `getChannelsForQuery({ userId, options?: QueryChannelsRequest })` (filters and sort now live inside `options.filter_conditions` / `options.sort`, or `options.predefined_filter`) -> `DBGetChannelsForQueryResult | null` = `{ channels, predefinedFilter? }` (`DBGetChannelsForQueryType` changed); `getChannels` -> `Omit<ChannelStateResponseFields, 'duration'>[] | null`; `getAppSettings` -> `GetApplicationResponse | null`; `upsertCidsForQuery` additionally receives `predefinedFilter?: ParsedPredefinedFilterResponse` (store it; clear it when absent) and `options` is the full request (`filters` / `sort` are still passed as `request.filter_conditions` / `request.sort`; `options` is typed `ChannelOptions` in `DBUpsertCidsForQueryType` but carries the whole `QueryChannelsRequest`, including `predefined_filter`); `getReactions.filters` widened to `ReactionFilters`. The set of abstract members is unchanged; `hardDeleteMessages`, `upsertMessageWithChannelGuard`, `getFailedMessages` are new concrete helpers. Handler `event` params are narrowed to `EventPayload<...>`.

  | type                                             | field                | v9                                     | v10                                                                |
  | ------------------------------------------------ | -------------------- | -------------------------------------- | ------------------------------------------------------------------ |
  | `DBUpsertChannelsType`                           | `channels`           | `ChannelAPIResponse[]`                 | `ChannelStateResponseFields[]`                                     |
  | `DBUpsertAppSettingsType`                        | `appSettings`        | `AppSettingsAPIResponse`               | `GetApplicationResponse`                                           |
  | `DBUpsertPollType`                               | `poll`               | `PollResponse`                         | `PollResponseData`                                                 |
  | `DBUpsertReadsType`                              | `reads`              | `ReadResponse[]` (`last_read: string`) | `ReadStateResponse[]` (`last_read: TimestampNS`, `0` = never read) |
  | `DBDeleteMessagesForChannelType`                 | `truncated_at`       | `string`                               | `TimestampNS`                                                      |
  | `DBGetReactionsType`, `DBUpsertCidsForQueryType` | `sort`               | `ReactionSort` / `ChannelSort`         | `SortParamRequest[]`                                               |
  | message/member/reaction/channel/draft rows       | timestamps, `custom` | strings, top-level custom              | `TimestampNS`, `custom` object                                     |

- **Migrate:** key the cid cache on `options.filter_conditions` + `options.sort` (or `options.predefined_filter`) on both write and read; return `{ channels, predefinedFilter }` from `getChannelsForQuery`; persist and parse timestamps as ns numbers (`asTimestampNS`).
- **Source:** `src/offline-support/types.ts:42-59,63-70,186-202,233-241,321-327,390-401`, `src/offline-support/offline_support_api.ts:276-287,830-960` (v10); `src/offline-support/types.ts:41-52,178-187,371-382` (v9)

<a id="offline-channel-guard"></a>

### `queriesWithChannelGuard` writes first and repairs the channel row on failure

**Kind:** behavior · **Impact:** low · **PR:** #1865

- **v9:** always probed `channelExists({ cid })` before writing; when missing, built the channel row from the event or from `client.channel(type, id)` (creating and registering a `Channel` as a side effect).
- **v10:** with `execute: true` and no `forceUpdate`, runs `createQueries(true)` first; only if that throws and the channel row is missing does it prepend the channel upsert and retry. The fallback reads `client.channelManager.get(cid)` and never creates a `Channel`.
- **Migrate:** implementations must make a write for a missing channel fail (FK constraint); otherwise rows are written without their channel.
- **Source:** `src/offline-support/offline_support_api.ts:557-680` (v10); `src/offline-support/offline_support_api.ts:538-597` (v9)

<a id="offline-queue-policy"></a>

### Offline queueing policy: only ephemeral failures are queued or kept

**Kind:** behavior · **Impact:** medium · **PR:** #1897

- **v9:** `shouldSkipQueueingTask` skipped only API codes 4 and 17; every other failure (5xx without a code, unknown codes, cancellations) was queued, and `executePendingTasks` kept such tasks.
- **v10:** `shouldSkipQueueingTask = !isEphemeral(error)`: queued/kept only when there was no response (network, `OfflineError`) or the Stream code is marked `retryable` in `APIErrorCodes`. Cancelled requests are never queued. Responses without a Stream code (e.g. a 502 HTML page) are dropped, and in `executePendingTasks` non-ephemeral failures delete the task.
- **Migrate:** none; expect fewer tasks to survive in the queue. Do not rely on aborting a request to keep it queued.
- **Source:** `src/offline-support/offline_support_api.ts:1421-1451,1563-1590`, `src/errors.ts:84-88` (v10); `src/offline-support/offline_support_api.ts:1131-1160,1332-1360` (v9)

<a id="offline-update-fold"></a>

### `update-message` pending tasks fold into queued sends

**Kind:** behavior · **Impact:** low · **PR:** #1873

- **v9:** non-replayable edits were always dropped. A replayable edit was folded into a queued `send-message` only when the socket was unhealthy and the edit had `status: 'failed'` (dropped if no send task was queued); in every other case it was queued on its own as an `update-message` task.
- **v10:** any edit is folded into a queued `send-message` task for the same message id (regardless of connection or status, non-replayable ones included), so a replayable edit on a healthy socket that v9 queued separately is now folded; without a send task a replayable edit is queued on its own, a non-replayable one dropped.
- **Migrate:** none.
- **Source:** `src/offline-support/offline_support_api.ts:1474-1515` (v10); `src/offline-support/offline_support_api.ts:1195-1255` (v9)

<a id="pending-task-payloads"></a>

### `PendingTask` payload shapes; v9-persisted tasks replay with wrong arguments

**Kind:** type-shape · **Impact:** low (custom `AbstractOfflineDB` implementations only; the React Native SDK drops v9 pending tasks) · **PR:** #1843, #1897

- **v9:** `PendingTask.payload` (and `DBUpdatePendingTaskType`) = argument list of the v9 replay method: `send-message` `[message, options]` (`channel._sendMessage`), `update-message` `[message, userId?, options?]` (`client._updateMessage`), `delete-message` `[messageID, hardDelete | options]`, `send-reaction` `[messageID, reaction, options]` (`channel._sendReaction`), `delete-reaction` `[messageID, reactionType]`, `create-draft` `[draftMessage]`, `delete-draft` `[{ parent_id }]`.
- **v10:** `payload` = `Parameters<QueueableOperationSignatures[type]>`: `send-message` `[{ message, ... }, requestOptions?]` (`channel.sendMessage`), `update-message` `[{ id }, { message, ... }, requestOptions?]`, `delete-message` `[{ id }, { hard?, delete_for_me? }?, requestOptions?]`, `send-reaction` `[{ id }, { reaction, ... }, requestOptions?]` and `delete-reaction` `[{ id, type }, _, requestOptions?]` (now on `client`), `create-draft` `[{ message }, requestOptions?]`, `delete-draft` unchanged. No migration of stored rows exists. Replaying a v9 row: `delete-message`, `send-reaction`, `delete-reaction` throw locally in `resolveUrl` (`"0" is not a path parameter ...`) and `update-message` throws a `TypeError` in `client.updateMessage` (`Cannot read properties of undefined (reading 'message')`, or `(reading 'attachments')` when the v9 `userId` was set); none of these errors has a `response`, so `isEphemeral` treats them as transient and the task is kept and fails again on every sync (tracked in v10-followups.md); `send-message` and `create-draft` send the bare message as the request body (server outcome unverified, likely an InputError that deletes the task and loses the message); `delete-draft` replays correctly. This applies to every v9 upgrade of a custom `AbstractOfflineDB` that keeps its pending tasks, not only early rcs. The React Native SDK's SQLite store is not affected: RN V10 bumps `SqliteClient.dbVersion` from 16 to 18, and the version mismatch drops every table (`pendingTasks` included) before replay, so RN apps lose v9 pending tasks instead of replaying them.
- **Migrate:** before the first v10 init, clear the pending-tasks table in your `OfflineDB` implementation (or `resetDB()`), or migrate rows to the v10 shapes.
- **Source:** `src/offline-support/types.ts:457-506`, `src/offline-support/queueableOperations.ts:83-147,235-239`, `src/api-client.ts:119-131`, `src/client.ts:2016-2024`, `src/errors.ts:84-88`, `src/offline-support/offline_support_api.ts:1563-1590` (v10); `src/offline-support/types.ts:428-462`, `src/offline-support/offline_support_api.ts:1272-1318` (v9)

<a id="message-composer"></a>

## 18. MessageComposer

`src/middleware.ts` (`MiddlewareExecutor`) is unchanged. The setup function moved to `client.config`: [setup function](#message-composer-setup-function).

<a id="composer-pending-uploads"></a>

### Pending-upload sending: middleware removed, now a config flag

**Kind:** removed · **Impact:** medium · **PR:** #1880, #1881

- **v9:** install `createSendWithPendingUploadsAttachmentsMiddleware(composer)` via `compositionMiddlewareExecutor.replace([...])`; it carried `MessageCompositionMiddleware.allowsPendingUploads: true`; `composer.allowsPendingUploads` scanned `compositionMiddlewareExecutor.installedMiddleware` (narrowed override on `MessageComposerMiddlewareExecutor`). The caller had to await uploads and patch URLs into the payload before sending.
- **v10:** the export, the `allowsPendingUploads` middleware field and the `installedMiddleware` narrowing are gone. The switch is `attachments.pendingUploadsEnabled` (default `false`), read per composition by the stock `createAttachmentsCompositionMiddleware`. `composer.allowsPendingUploads` returns `attachmentManager.config.pendingUploadsEnabled`. Settling uploads moved into `channel|thread.messageOperations.send` (`settlePendingAttachmentUploads`). In this mode `failed` uploads count for `hasSendableData` and ride along on `localMessage.attachments` (retried at send); only `blocked` stays behind. The "keep in composer" rule is `config.retainCompositionOnSubmit(composer)` (default `!!composer.pollId`, same as v9's hardcoded check).
- **Migrate:** delete the middleware install; `client.config.set({ messageComposer: { attachments: { pendingUploadsEnabled: true } } })` (or `composer.updateConfig(...)`). Drop any own await/patch-URLs step and send through `composer.send()` or `messageOperations.send`, otherwise uploads are handled twice. A custom middleware with `allowsPendingUploads: true` now does nothing.
- **Source:** `src/messageComposer/middleware/messageComposer/attachments.ts:54,62,124`, `src/messageComposer/messageComposer.ts:478,524`, `src/messageComposer/configuration/types.ts:109`, `src/messageOperations/createMessageOperations.ts:43` (v10); `src/messageComposer/middleware/messageComposer/attachments.ts:43,108`, `src/messageComposer/middleware/messageComposer/types.ts:55`, `src/messageComposer/messageComposer.ts:448`, `src/messageComposer/middleware/messageComposer/MessageComposerMiddlewareExecutor.ts:64` (v9)

<a id="composer-legacy-thread"></a>

### `legacy_thread` composition context removed

**Kind:** removed · **Impact:** low · **PR:** #1881

- **v9:** `CompositionContext = Channel | Thread | LocalMessageWithLegacyThreadId`; a context with `legacyThreadId` gave `contextType` / `evaluateContextType` = `'legacy_thread'`, `tag` / `constructTag` = `legacy_thread_<id>`, `threadId = legacyThreadId`.
- **v10:** `LocalMessageWithLegacyThreadId` removed, `CompositionContext = Channel | Thread | LocalMessage`; such a context evaluates to `'message'` and `threadId` falls back to `parent_id`. The `contextType` / `tag` unions lose the `legacy_thread` member.
- **Migrate:** compose replies against a `Thread` (`client.threads.ensure(...)`) or a `LocalMessage` with `parent_id`. Remove `'legacy_thread'` branches from switches on `contextType`.
- **Source:** `src/messageComposer/messageComposer.ts:105,321` (v10); `src/messageComposer/messageComposer.ts:86,282,292` (v9)

<a id="composer-server-restrictions"></a>

### Server channel flags resolve into `composer.config`

**Kind:** behavior · **Impact:** medium · **PR:** #1831

- **v9:** only `shared_locations` was merged into `location.enabled`, once, at construction. `uploads` and `polls` were never consulted; `url_enrichment` was ANDed live inside `linkPreviewsManager.enabled` (so `composer.config.linkPreviews.enabled` showed the client value only); `max_message_length` was ignored.
- **v10:** `composer.config` is the server-restricted result: `attachments.enabled` AND `uploads` (skipped when `customCdn`), `polls.enabled` AND `polls`, `linkPreviews.enabled` AND `url_enrichment`, `location.enabled` AND `shared_locations`; `text.maxLengthOnSend` / `maxLengthOnEdit` are capped by, and default to, `max_message_length`. Re-resolved when `client.channelServerConfigsStore` changes for the cid (after `registerSubscriptions()`) or on `channel.query`. Consequences: a channel type with `uploads: false` now blocks uploads client-side (`isUploadEnabled` false); `insertText` truncates typed/pasted text at the server limit and over-limit compositions are discarded. `polls.enabled` is only a resolved flag: `composer.createPoll()` / `PollComposer` do not check it (tracked in v10-followups.md).
- **Migrate:** gate UI on the resolved values (`composer.attachmentManager.isUploadEnabled`, `composer.config.polls.enabled`, `composer.config.linkPreviews.enabled`), not `channel.serverConfig?.*`.
- **Source:** `src/messageComposer/messageComposer.ts:620-664,921`, `src/messageComposer/textComposer.ts:455`, `src/messageComposer/middleware/messageComposer/compositionValidation.ts:71`, `src/channel.ts:2000` (v10); `src/messageComposer/messageComposer.ts:245`, `src/messageComposer/linkPreviewsManager.ts:160` (v9)

<a id="composer-config-frozen"></a>

### Composer config is read-only and deep-frozen

**Kind:** behavior · **Impact:** low

- **v9:** `composer.config` returned a mutable object; `composer.config.drafts.enabled = true` mutated state silently, and nested subtrees were the shared `DEFAULT_*` objects, so the write leaked into every composer. The exported `DEFAULT_COMPOSER_CONFIG` / `DEFAULT_*_CONFIG` constants were mutable.
- **v10:** getter typed `Readonly<MessageComposerConfig>`; every resolution is deep-frozen, and `DEFAULT_COMPOSER_CONFIG` is frozen in place, which also freezes `DEFAULT_ATTACHMENT_MANAGER_CONFIG`, `DEFAULT_COMMANDS_CONFIG`, `DEFAULT_LINK_PREVIEW_MANAGER_CONFIG`, `DEFAULT_LOCATION_COMPOSER_CONFIG`, `DEFAULT_TEXT_COMPOSER_CONFIG`. Writes throw `TypeError` in strict mode (ESM / TS output).
- **Migrate:** use `composer.updateConfig(...)` or `client.config.set({ messageComposer: ... })`; copy a default before changing it (`{ ...DEFAULT_LINK_PREVIEW_MANAGER_CONFIG, enabled: false }`).
- **Source:** `src/messageComposer/messageComposer.ts:283-290,349`, `src/messageComposer/configuration/configuration.ts:65`, `src/configuration/utils/deepFreezeConfig.ts` (v10); `src/messageComposer/messageComposer.ts:306`, `src/messageComposer/configuration/configuration.ts:48` (v9)

<a id="composer-update-config"></a>

### `updateConfig` patches are retained; config setters no longer short-circuit

**Kind:** behavior · **Impact:** low · **PR:** #1831

- **v9:** `updateConfig(patch)` merged into the current resolved state (`configState.partialNext`); `configState` was a plain `readonly` store you could `next()` directly. Setters `linkPreviewsManager.enabled`, `textComposer.enabled`, `textComposer.maxLengthOnEdit`, `textComposer.maxLengthOnSend`, `attachmentManager.maxNumberOfFilesPerMessage` returned early when the value equalled the current effective value.
- **v10:** `updateConfig` records a retained patch layer that is re-applied on every re-resolution (server change, declarative `client.config` change), so the last request wins once a server restriction lifts. `initializeConfig()` (called by `client.config.reset()`) discards all patches, including those made through sub-composer setters. `configState` is a getter over the internal controller store; a direct `configState.next(...)` is overwritten by the next re-resolution. All five setters always write. New `requestedConfig` getter exposes the pre-server request.
- **Migrate:** change config only via `updateConfig` / `client.config`; after `client.config.reset()` re-apply imperative settings.
- **Source:** `src/messageComposer/messageComposer.ts:218,580-581,591,694`, `src/messageComposer/linkPreviewsManager.ts:162`, `src/messageComposer/textComposer.ts:166,188,200`, `src/messageComposer/attachmentManager.ts:162` (v10); `src/messageComposer/messageComposer.ts:177,512` (v9)

<a id="composer-config-types"></a>

### New required fields on composer config types

**Kind:** type-shape · **Impact:** low · **PR:** #1831, #1881

- **v9:** `MessageComposerConfig { attachments, commands, drafts, linkPreviews, location, text }`; `AttachmentManagerConfig` without `enabled` / `customCdn` / `pendingUploadsEnabled`; `LocationComposerConfig { enabled, getDeviceId }` with a hardcoded 60 s live-location minimum.
- **v10:** required `MessageComposerConfig.polls: PollComposerConfig` (`{ enabled: true }`), `MessageComposerConfig.retainCompositionOnSubmit: (composer) => boolean` (default `!!composer.pollId`), `AttachmentManagerConfig.enabled` (`true`), `.customCdn` (`false`), `.pendingUploadsEnabled` (`false`), `LocationComposerConfig.minShareDurationMs` (`60000`, replaces the hardcoded constant; a shorter `durationMs` makes `validLocation` null).
- **Migrate:** partials (`updateConfig`, `client.config.set`, constructor `config`) need nothing. Values annotated as a complete config type must add the six fields.
- **Source:** `src/messageComposer/configuration/types.ts:66,103,109,136,149,152,160,172,178`, `src/messageComposer/configuration/configuration.ts:35-39,55,72` (v10); `src/messageComposer/configuration/types.ts:66,101,111`, `src/messageComposer/LocationComposer.ts:29` (v9)

<a id="composer-command-validator-override"></a>

### `applyCommandValidatorOverride` removed

**Kind:** removed · **Impact:** low · **PR:** #1831

- **v9:** exported helper `applyCommandValidatorOverride(targetConfig, sourceConfig?)` that copied `commands.sendValidator` from a partial onto a full config.
- **v10:** removed; config merging assigns function values directly, so `updateConfig({ commands: { sendValidator } })` sets it.
- **Migrate:** delete the call; pass `commands.sendValidator` through `updateConfig` / `client.config.set`.
- **Source:** `src/messageComposer/configuration/commands.configuration.ts:36`, `src/messageComposer/configuration/index.ts:3` (v9)

<a id="composer-compose-output"></a>

### `compose()` output shape changed

**Kind:** behavior · **Impact:** medium

- **v9:** `localMessage` had `deleted_at: null`, `error: null`, `pinned_at: null`, `quoted_message: null`, `reaction_groups: null`, `Date` timestamps, no `cid`; `localMessage.user` = `client.user` minus `channel_mutes` / `devices` / `mutes`. The edit `message` (via `toUpdatedMessagePayload`) kept `status`, `reaction_scores`, `message_text_updated_at` and dropped `pinned_at`.
- **v10:** those fields are `undefined`; `localMessage.cid` is set; timestamps are ns numbers; `localMessage.user.blocked_user_ids` defaults to `[]`. `message` is a `MessageRequest`; for edits `status`, `reaction_scores`, `message_text_updated_at` are stripped and `pinned_at` / `pin_expires` are kept as `Date`. `localMessage.shared_location` timestamps and `end_at` are ns numbers; `message.shared_location.end_at` is a `Date`.
- **Migrate:** replace `=== null` checks with `== null`; do not deep-equal `localMessage.user` against `client.user`.
- **Source:** `src/messageComposer/messageComposer.ts:1122-1150`, `src/constants.ts:6-30`, `src/messageComposer/middleware/messageComposer/userDataInjection.ts:45`, `src/messageComposer/middleware/messageComposer/sharedLocation.ts:23-45` (v10); `src/messageComposer/messageComposer.ts:900-916` (v9)

<a id="composer-drafts"></a>

### Drafts: request-object `createDraft`, provisional channels skipped

**Kind:** behavior · **Impact:** low

- **v9:** `composer.createDraft()` called `channel.createDraft(draft)`; `createDraft` / `deleteDraft` ran for any channel.
- **v10:** calls `channel.createDraft({ message: draft })`; both no-op while `channel.isProvisional` (no id yet). Draft composition seeds `custom: {}`. The optimistic offline draft carries `quoted_message` as the `LocalMessage` (v9 ran `unformatMessage`).
- **Migrate:** overrides and spies of `channel.createDraft` must accept the request object ([channel drafts](#channel-drafts)).
- **Source:** `src/messageComposer/messageComposer.ts:1180,1203,1211` (v10); `src/messageComposer/messageComposer.ts:953-970` (v9)

<a id="composer-last-change"></a>

### `LastComposerChange` timestamps: epoch ms -> ns

**Kind:** type-shape · **Impact:** low

- **v9:** `{ draftUpdate: number | null; stateUpdate: number }` in epoch milliseconds (`Date.getTime()`).
- **v10:** `{ draftUpdate: TimestampNS | null; stateUpdate: TimestampNS }` in unix nanoseconds (`nowNs()` / message `updated_at`). Also on `EditingAuditState.lastChange`.
- **Migrate:** compare with `nowNs()` or convert with `nsToMs` / `nsToDate`.
- **Source:** `src/messageComposer/messageComposer.ts:71` (v10); `src/messageComposer/messageComposer.ts:55` (v9)

<a id="composer-commands"></a>

### Commands: `CommandResponse` -> generated `Command`

**Kind:** signature · **Impact:** medium

- **v9:** composer command APIs took and returned `CommandResponse` (all fields optional, `name` / `set` typed `CommandVariants`, ISO string timestamps).
- **v10:** they use generated `Command` (`args`, `description`, `name`, `set` required `string`; `created_at` / `updated_at` `TimestampNS`). `CommandSearchSource.query` reads `channel.config.availableCommands` (was `channel.getConfig()?.commands`).

  | API                                                                                                                                                | v9                                                | v10                        |
  | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------- |
  | `MessageComposer.getCommandDisabledReason` / `isCommandDisabled` / `validateCommandSendability`                                                    | `(command: CommandResponse, ...)`                 | `(command: Command, ...)`  |
  | `TextComposer.command`, `setCommand`; `TextComposerState.command` (plus snapshot / executor-state / `TextComposerCommandActivationStateToRestore`) | `CommandResponse \| null`                         | `Command \| null`          |
  | `CommandSuggestion`                                                                                                                                | `BaseSuggestion & CommandResponse`                | `BaseSuggestion & Command` |
  | `CommandSendability.command`, `CommandSendValidationContext.command` (`commands.sendValidator` input)                                              | `CommandResponse`                                 | `Command`                  |
  | `TextComposerCommandActivationEffect.command`                                                                                                      | `CommandResponse`                                 | `Command`                  |
  | `getCommandByName` return, `notifyCommandDisabled` param                                                                                           | `CommandResponse`                                 | `Command`                  |
  | `CommandSearchSource.query().items`                                                                                                                | `CommandResponse`-like with `id: CommandVariants` | `Command`                  |

- **Migrate:** retype to `Command`; custom `sendValidator`s and command UIs reading `created_at` must handle ns numbers; objects passed to `setCommand` need all four string fields.
- **Source:** `src/messageComposer/messageComposer.ts:427`, `src/messageComposer/textComposer.ts:401`, `src/messageComposer/middleware/textComposer/types.ts:18,133`, `src/messageComposer/configuration/types.ts:43-56`, `src/messageComposer/middleware/textComposer/commandUtils.ts:50`, `src/messageComposer/middleware/textComposer/commands.ts:40-41` (v10)

<a id="composer-middleware-state"></a>

### Composition middleware state retyped onto generated request types

**Kind:** type-shape · **Impact:** medium

- **v9:** `MessageComposerMiddlewareState.message: Message | UpdatedMessage`; `MessageDraftComposerMiddlewareValueState.draft: DraftMessagePayload`; `PollComposerCompositionMiddlewareValueState.data: CreatePollData`.
- **v10:** `message: MessageRequest`; `draft: MessageRequest`; `data: CreatePollRequest`. Custom fields live under `custom`, request dates are `Date`, `mentioned_users` is `string[]`.
- **Migrate:** custom composition, draft and poll middleware must write custom data into `state.message.custom` and use `Date` for `pinned_at` / `pin_expires` / `shared_location.end_at`.
- **Source:** `src/messageComposer/middleware/messageComposer/types.ts:6,19`, `src/messageComposer/middleware/pollComposer/types.ts:52` (v10); `src/messageComposer/middleware/messageComposer/types.ts:12,25`, `src/messageComposer/middleware/pollComposer/types.ts:48` (v9)

<a id="composer-retyped-members"></a>

### Other composer members retyped

**Kind:** signature · **Impact:** low

- **v9:** `MessageComposerState.quotedMessage` / `composer.quotedMessage`: `LocalMessageBase | null`; `initStateFromChannelResponse(channelApiResponse: ChannelAPIResponse)`.
- **v10:** `LocalMessage | null`; `initStateFromChannelResponse(channelApiResponse: ChannelStateResponseFields)` (guards `channel?.cid`).
- **Migrate:** rename types ([rename table](#type-rename-table)).
- **Source:** `src/messageComposer/messageComposer.ts:127,744` (v10); `src/messageComposer/messageComposer.ts:93,543` (v9)

<a id="composer-class-members"></a>

### Composer classes gained members (hand-built fakes no longer type-check)

**Kind:** type-shape · **Impact:** low

- **v9:** class shapes without the members below.
- **v10:** added public members, so object literals and mocks typed as these classes, or v9-typed instances, fail structural checks (root of most `*Options` / `create*Middleware` compat failures that reference `MessageComposer`).

  | class                                                                          | added                                                                                                                                                                         |
  | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `MessageComposer`                                                              | `defaultSubmitTarget`, `retainsCompositionOnSubmit`, `requestedConfig`, `initializeConfig`, `send`, `update`, `applyServerRestrictions` (@internal), `transferTo` (@internal) |
  | `AttachmentManager`                                                            | `usesStreamStorage`, `takeOver` (@internal)                                                                                                                                   |
  | `TextComposer`                                                                 | `typing`, `setTyping`, `setTypingEvent`, `removeTypingEvent`, `takeOver` (@internal)                                                                                          |
  | `LinkPreviewsManager`, `LocationComposer`, `PollComposer`, `CustomDataManager` | `takeOver` (@internal)                                                                                                                                                        |
  | `FixedSizeQueueCache`                                                          | `values()`                                                                                                                                                                    |

- **Migrate:** build fakes from real instances or cast; no change for code using real instances.
- **Source:** `src/messageComposer/messageComposer.ts:491,505,591,694,715,797,1350,1385`, `src/messageComposer/attachmentManager.ts:203,300`, `src/messageComposer/textComposer.ts:244-266,282`, `src/utils/FixedSizeQueueCache.ts:82` (v10)

<a id="link-previews-default"></a>

### Link previews on by default

**Kind:** behavior · **Impact:** high · **PR:** #1831

- **v9:** `DEFAULT_LINK_PREVIEW_MANAGER_CONFIG.enabled = false`; `linkPreviewsManager.enabled` = `channel.getConfig()?.url_enrichment && config.linkPreviews.enabled`; enrichment via `client.enrichURL(url)`.
- **v10:** default `true`, ANDed with `url_enrichment` through config resolution ([server restrictions](#composer-server-restrictions)), so wherever the channel type enriches URLs the composer issues `client.getOG({ url })` requests while typing and attaches previews. Before the channel config is known, `url_enrichment` is undefined and does not restrict.
- **Migrate:** to keep v9 behaviour, `client.config.set({ messageComposer: { linkPreviews: { enabled: false } } })`. Spies or mocks on `client.enrichURL` no longer intercept.
- **Source:** `src/messageComposer/configuration/configuration.ts:15-17`, `src/messageComposer/linkPreviewsManager.ts:158,247` (v10); `src/messageComposer/configuration/configuration.ts:13-15`, `src/messageComposer/linkPreviewsManager.ts:160,242` (v9)

<a id="composer-upload-metadata"></a>

### Local upload metadata moved under `custom`; identity guards read `custom.mime_type`

**Kind:** type-shape · **Impact:** high · **PR:** #1760

- **v9:** `AttachmentManager.toLocalUploadAttachment` / `fileToLocalUploadAttachment` put `file_size`, `mime_type` at the attachment root and copied `FileReference.duration` to the root for any type (e.g. video). `isFileAttachment` / `isVideoAttachment` classified by root `mime_type`. Composer attachment types declared root `duration`, `file_size`, `mime_type`, `waveform_data`.
- **v10:** `file_size` / `mime_type` go to `attachment.custom`; `duration` goes to `custom.duration` only for `voiceRecording` (a video's duration is dropped). `isFileAttachment` / `isVideoAttachment` read `custom?.mime_type` only, so hand-built or legacy objects with root `mime_type` are no longer classified by mime. New helpers `resolveAttachmentFileSize` / `resolveAttachmentFullByteSize` fall back to the root field. Type side: [attachment metadata](#attachment-metadata-custom).
- **Migrate:** read `attachment.custom?.mime_type` / `.file_size` / `.duration` (or `resolveAttachmentFileSize(a)`); put `mime_type` under `custom` on attachments you build for the identity guards.
- **Source:** `src/messageComposer/attachmentManager.ts:523,558`, `src/messageComposer/attachmentIdentity.ts:69-80,115-125`, `src/messageComposer/attachmentUtils.ts:31` (v10); `src/messageComposer/attachmentManager.ts:463,494`, `src/messageComposer/attachmentIdentity.ts:57,101` (v9)

<a id="composer-attachment-types"></a>

### Attachment-shaped composer types derive from the generated `Attachment`

**Kind:** type-shape · **Impact:** medium

- **v9:** `FileAttachment`, `AudioAttachment`, `VideoAttachment`, `ImageAttachment`, `GiphyAttachment`, `VoiceRecordingAttachment` (and `LocalFileAttachment`, `LocalAudioAttachment`, `LocalVideoAttachment`, `LocalImageAttachment`, `LocalVoiceRecordingAttachment`, `AnyLocalAttachment`, `LocalUploadAttachment`, `UploadedAttachment`) re-declared fields such as `asset_url`, `title`, `thumb_url`, `image_url`, `giphy: GiphyData`, `thumbnail_url`, `latitude`, `longitude`; `VoiceRecordingAttachment.asset_url` was required. `LinkPreview` was the hand-written OG shape.
- **v10:** each is `Attachment & { type: '<t>' }` over the generated `Attachment` (`custom` required; `giphy` is `Images`; no `thumbnail_url`); `VoiceRecordingAttachment.asset_url` is optional and it adds `custom: CustomAttachmentData & { duration?; waveform_data? }`. `LinkPreview = OGAttachment & { status }`, so it requires `custom` (the manager stores `custom: {}`) and `LinkPreviewsManager.getPreviewData()` returns it. Middleware typed on `LocalUploadAttachment` (pre/post-upload) follows.
- **Migrate:** add `custom: {}` to attachment and preview literals; null-check `asset_url` on voice recordings; read `waveform_data` / `duration` from `custom`.
- **Source:** `src/messageComposer/types.ts:60-86`, `src/messageComposer/linkPreviewsManager.ts:9,310,338`, `src/types.ts:233` (v10); `src/messageComposer/types.ts:59-108` (v9)

<a id="composer-upload-gating"></a>

### Upload gating: `customCdn` replaces the custom-upload waiver; `enabled` and `uploads` enforced

**Kind:** behavior · **Impact:** medium · **PR:** #1831

- **v9:** `isUploadEnabled = hasUploadPermission && hasAvailableUploadSlots`; `uploadFiles` skipped the `upload-file` capability check whenever a custom `doUploadRequest` was configured (`hasCustomDoUploadRequest`).
- **v10:** `isUploadEnabled = config.enabled && hasAvailableUploadSlots && (!usesStreamStorage || hasUploadPermission)`, with `usesStreamStorage = !config.customCdn`; `uploadFiles` and the deprecated `uploadAttachment` both return early on `!isUploadEnabled`. A custom `doUploadRequest` without `customCdn: true` now needs `upload-file` and is subject to the channel type's `uploads` flag. `attachments.enabled: false` blocks even with `customCdn`.
- **Migrate:** if files go to your own storage, `client.config.set({ messageComposer: { attachments: { customCdn: true, doUploadRequest } } })`. Gate the attach button on `attachmentManager.isUploadEnabled`.
- **Source:** `src/messageComposer/attachmentManager.ts:203,219-225,823`, `src/messageComposer/messageComposer.ts:642` (v10); `src/messageComposer/attachmentManager.ts:181,785` (v9)

<a id="composer-default-upload"></a>

### Default upload request: `uploadImage` / `uploadFile`, throws without a file URL

**Kind:** behavior · **Impact:** low

- **v9:** `doDefaultUploadRequest` called `channel.sendImage/sendFile(uri|file, name, type, undefined, axiosConfig)` and returned the response minus `duration`, typed `{ file; thumb_url?; blocklist? }`, even without `file`.
- **v10:** calls `channel.uploadImage/uploadFile({ file }, requestOptions)` (FileReference passed whole), strips `duration` and `metadata`, throws `The upload succeeded but the response carried no file URL` when `file` is missing (surfaces as a failed upload). `doDefaultUploadRequest` / `doUploadRequest` return `MinimumUploadRequestResult`.
- **Migrate:** spies on `channel.sendImage/sendFile` no longer intercept composer uploads; stub `uploadImage/uploadFile` or set `doUploadRequest`.
- **Source:** `src/messageComposer/attachmentManager.ts:624-670` (v10); `src/messageComposer/attachmentManager.ts:552-601` (v9)

<a id="is-shared-location-response"></a>

### `isSharedLocationResponse` -> `isSharedLocationResponseData`

**Kind:** renamed · **Impact:** low · **PR:** #1760

- **v9:** `isSharedLocationResponse(location): location is SharedLocationResponse`.
- **v10:** `isSharedLocationResponseData(location): location is SharedLocationResponseData`; same check (`latitude && longitude && channel_cid`).
- **Migrate:** rename the import.
- **Source:** `src/messageComposer/attachmentIdentity.ts:141` (v10); `src/messageComposer/attachmentIdentity.ts:122` (v9)

<a id="location-composer"></a>

### Location preview types, `validLocation` shape and hydration

**Kind:** type-shape · **Impact:** medium

- **v9:** `StaticLocationPreview = StaticLocationPayload`, `LiveLocationPreview = Omit<LiveLocationPayload, 'end_at'> & { durationMs? }` (`message_id`, `created_by_device_id` required); `validLocation: StaticLocationPayload | LiveLocationPayload | null`, spread from state with `end_at` an ISO string computed only from `durationMs`; `initState` stored `message.shared_location` verbatim; minimum duration hardcoded 60 s.
- **v10:** `StaticLocationPreview = SharedLocation & { message_id? }`, `LiveLocationPreview = Omit<SharedLocation, 'end_at'> & { durationMs?; message_id? }`; `validLocation: StaticLocationPreview | null`, built field by field (`created_by_device_id`, `latitude`, `longitude`, `message_id`, `end_at` as `Date`), keeping a hydrated absolute `end_at` on edit instead of dropping it; `initState` keeps only those fields and converts ns `end_at` to `Date` (`LocationComposerState.location`, `LocationComposerSnapshot` follow); minimum is `location.minShareDurationMs`.
- **Migrate:** format `end_at` with `.toISOString()` at read sites; read `channel_cid` / `user_id` / timestamps off the message, not `locationComposer.location`.
- **Source:** `src/messageComposer/LocationComposer.ts:13-20,39-58,83-117`, `src/messageComposer/configuration/types.ts:149` (v10); `src/messageComposer/LocationComposer.ts:17-21,29-37,62-77` (v9)

<a id="poll-composer-user-id"></a>

### `user_id` removed from the poll composer

**Kind:** removed · **Impact:** low · **PR:** #1760

- **v9:** `pollComposer.user_id` getter; `state.data.user_id` seeded from `client.user.id` and sent in the create-poll payload; `user_id` was a key of `UpdateFieldsData`, `PollComposerState.data`, `handleFieldBlur`'s field union and the processor/validator records (`pollCompositionStateProcessors`, `PollComposerStateMiddlewareFactoryOptions` `processors` / `validators` / `targetFields`, `PollCompositionStateProcessorOutput`).
- **v10:** gone from the getter, state, payload and all those key unions. The `voting_visibility` default is the string `'public'` ([VotingVisibility](#voting-visibility)).
- **Migrate:** use `client.userId`; remove `user_id` processors and validators.
- **Source:** `src/messageComposer/pollComposer.ts:42-48`, `src/messageComposer/middleware/pollComposer/types.ts:35-47` (v10); `src/messageComposer/pollComposer.ts:48,79`, `src/messageComposer/middleware/pollComposer/types.ts:30-48` (v9)

<a id="poll-composer-errors"></a>

### Poll field errors: strings -> `PollComposerValidationError` objects

**Kind:** type-shape · **Impact:** medium · **PR:** #1830

- **v9:** `PollComposerFieldErrors` values were English strings (`'Question is required'`, ...), keyed on `CreatePollData`; validators returned strings.
- **v10:** values are `{ code: PollComposerValidationCode; message: string; metadata? }` keyed on `CreatePollRequest` (`allow_answers`, `allow_user_suggested_options`, `description`, `enforce_unique_vote`, `id`, `is_closed`, `max_votes_allowed`, `name`, `options`, `voting_visibility`, plus new `custom`, `team`; no `user_id`). Codes in `POLL_COMPOSER_VALIDATION_CODE` (`validation:poll:maxVotes:notNumeric|outOfRange|uniqueVoteEnforced`, `validation:poll:name:required`, `validation:poll:option:duplicate|empty`). Applies to `PollComposerState.errors`, `PollComposerSnapshot`, `PollComposerStateChangeMiddlewareValue`, `PollComposerCompositionMiddlewareValueState`, `PollStateValidationOutput`, the default validator maps (`defaultPollFieldBlurEventValidators`, `defaultPollFieldChangeEventValidators`, `pollStateChangeValidators`), and the `injectedFieldErrors` of [`updateFields`](#poll-composer-update-fields).
- **Migrate:** render `errors.name?.message` or translate by `.code`; custom validators and injected errors must return `pollComposerValidationError(code, metadata?)` objects.
- **Source:** `src/messageComposer/middleware/pollComposer/types.ts:29`, `src/messageComposer/middleware/pollComposer/state.ts:22-120`, `src/messageComposer/middleware/pollComposer/validation.ts:12-76` (v10); `src/messageComposer/middleware/pollComposer/types.ts:24`, `src/messageComposer/middleware/pollComposer/state.ts:16-90` (v9)

<a id="poll-composer-update-fields"></a>

### `PollComposer.updateFields` takes one object

**Kind:** signature · **Impact:** low

- **v9:** `updateFields(data, injectedFieldErrors?)`.
- **v10:** `updateFields({ data, injectedFieldErrors? })`.
- **Migrate:** `updateFields({ name })` -> `updateFields({ data: { name } })`; `updateFields(data, errors)` -> `updateFields({ data, injectedFieldErrors: errors })`.
- **Source:** `src/messageComposer/pollComposer.ts:122-146` (v10); `src/messageComposer/pollComposer.ts:124-127` (v9)

<a id="text-composer-typing"></a>

### `TextComposerState.typing` added as required

**Kind:** type-shape · **Impact:** low · **PR:** #1795

- **v9:** no `typing` in text composer state.
- **v10:** `typing: Record<string, Event>` is required on `TextComposerState`, its snapshots (`TextComposerSnapshot`, `TextComposerStateSnapshot`), `TextComposerMiddlewareExecutorState` and `TextComposerCommandActivationStateToRestore`; `channel.state.typing` reads it when the channel has a composer. New `setTyping`, `setTypingEvent`, `removeTypingEvent`.
- **Migrate:** include `typing: {}` in hand-built text composer states and snapshots. (A reset bug is tracked in v10-followups.md.)
- **Source:** `src/messageComposer/middleware/textComposer/types.ts:133`, `src/messageComposer/textComposer.ts:123,137,244`, `src/channel_state.ts:296-307` (v10)

<a id="mentions-search-source"></a>

### `MentionsSearchSource` sort options and query shape

**Kind:** signature · **Impact:** low

- **v9:** `userSort?: UserSort`, `memberSort?: MemberSort` (object form `{ name: 1 }`; a multi-key `memberSort` object fell back to `[{ user_id: 1 }]`); queries `client.queryUsers(filters, sort, options)` / `channel.queryMembers(filters, sort, options)`.
- **v10:** both `SortParamRequest[]` (`[{ field, direction }]`); the member query uses the first entry only; local member sorting iterates the array; requests are sent as `{ payload: { filter_conditions, sort, ...options } }` (`prepareQueryUsersParams` / `prepareQueryMembersParams`); `queryUsers` returns `FullUserResponse[]`. Filter option types are the generated `Filters<...>`.
- **Migrate:** `memberSort: [{ field: 'name', direction: 1 }]`.
- **Source:** `src/messageComposer/middleware/textComposer/mentions.ts:100-103,309-310,535-538,556-575,585-622` (v10); `src/messageComposer/middleware/textComposer/mentions.ts:101-104,539,564-590` (v9)

<a id="utilities"></a>

## 19. Utilities

In both versions `src/index.ts` re-exports only `isOwnUser`, `chatCodes`, `logChatPromiseExecution`, `localMessageToNewMessagePayload`, `formatMessage` (plus `promoteChannel` in v9) from `./utils`, plus `FixedSizeQueueCache` and the four concurrency runners. Everything else in `src/utils.ts` / `src/utils/**` is internal. v10 adds root exports from `./utils/time` ([TimestampNS](#timestamp-ns)). `promoteChannel`: [promote-channel](#promote-channel).

<a id="format-message"></a>

### `formatMessage`: no date conversion, `undefined` instead of `null`, memoized

**Kind:** behavior · **Impact:** medium · **PR:** #1849, #1876

- **v9:** `formatMessage(message: MessageResponseBase | MessageResponse | LocalMessage)` always returned a new object; parsed `created_at` / `updated_at` / `deleted_at` / `pinned_at` to `Date`; missing `deleted_at` / `pinned_at` / `error` / `quoted_message` became `null`.
- **v10:** `formatMessage(message: MessageResponse | LocalMessage)`; timestamps stay ns numbers (missing `created_at` / `updated_at` default to `nowNs()`); those fields are `undefined`; the result is memoized in a `WeakMap` keyed on the source object, so a second call with the same (possibly mutated) object returns the identical first result.
- **Migrate:** drop `MessageResponseBase`; use `nsToDate` / `convertTimestampToDate` for `Date`s; do not mutate a message and re-format it, pass a fresh object (`formatMessage({ ...msg, text })`).
- **Source:** `src/utils.ts:220-257`, `src/formatMessageMemo.ts:14-24` (v10); `src/utils.ts:351-381` (v9)

<a id="local-message-to-new-message-payload"></a>

### `localMessageToNewMessagePayload` returns `MessageRequest` with `Date` fields

**Kind:** signature · **Impact:** low

- **v9:** returned `Message` with `pinned_at` as an ISO string; `pin_expires`, `message_text_updated_at` and the response-shaped `shared_location` passed through.
- **v10:** returns `MessageRequest`; `pinned_at` / `pin_expires` are `Date`; `shared_location` narrowed to `{ latitude, longitude, created_by_device_id, end_at?: Date }`; `message_text_updated_at` stripped.
- **Migrate:** stop calling `.toISOString()`-dependent code on the result; adjust any persisted pending-send payloads.
- **Source:** `src/utils.ts:397-419,487-525` (v10); `src/utils.ts:480-509` (v9)

<a id="log-chat-promise-execution"></a>

### `logChatPromiseExecution` and composer errors go through `chatLoggerSystem`

**Kind:** behavior · **Impact:** low

- **v9:** `logChatPromiseExecution` -> `console.warn('failed to do <name>, ran into error: ', error)`; composer draft failures -> `client.logger('error', 'offlineDb:upsertDraft' | 'offlineDb:deleteDraft' | 'messageComposer:getDraft', ...)`; suggestion search errors -> `console.error`.
- **v10:** `chatLoggerSystem` scope `utils`, level `error`, message `Failed to execute "<name>".`; composer failures via scopes `offline-db` / `message-composer` / `text-composer` with sentence messages; output depends on logger configuration ([logging](#logging)).
- **Migrate:** configure `chatLoggerSystem` sinks and levels instead of watching `console.warn` or the old tag strings.
- **Source:** `src/utils.ts:29-35`, `src/messageComposer/messageComposer.ts:1199,1225,1266`, `src/messageComposer/middleware/textComposer/TextComposerMiddlewareExecutor.ts:82` (v10); `src/utils.ts:38-42` (v9)

<a id="encode-decode-base64"></a>

### `encodeBase64` / `decodeBase64` removed

**Kind:** removed · **Impact:** low · **PR:** #1819

- **v9:** root exports `encodeBase64(data)`, `decodeBase64(s)`.
- **v10:** removed, no replacement.
- **Migrate:** `btoa` / `atob` (with a UTF-8 aware wrapper if needed).
- **Source:** `src/base64.ts:44-80`, `src/index.ts:1` (v9)

<a id="campaign-segment-removed"></a>

### `Campaign` and `Segment` classes removed

**Kind:** removed · **Impact:** low · **PR:** #1760

- **v9:** `export class Campaign` (`create`, `start`, `update`, `delete`, `stop`, `get`) and `export class Segment` (`create`, `get`, `update`, `addTargets`, `removeTargets`, `delete`, `targetExists`, `queryTargets`), re-exported from the root.
- **v10:** not exported; `src/campaign.ts` and `src/segment.ts` are one-line comment stubs and `index.ts` does not re-export them at all. The `client.campaign()` / `client.segment()` factories and REST methods: [server-only methods](#server-only-methods-removed).
- **Migrate:** use a server-side SDK.
- **Source:** `src/campaign.ts:1`, `src/segment.ts:1`, `src/index.ts:63-89` (v10); `src/campaign.ts:4-77`, `src/segment.ts:17-95`, `src/index.ts:2,23` (v9)

<a id="permissions-removed"></a>

### `permissions` module removed

**Kind:** removed · **Impact:** low · **PR:** #1836

- **v9:** `Permission` class, `AllowAll`, `DenyAll` (instances), `Allow`, `Deny`, `AnyResource`, `AnyRole`, `MaxPriority`, `MinPriority`, `BuiltinRoles`, `BuiltinPermissions` (values such as `'Create Message'`), and type `Role`.
- **v10:** `src/permissions.ts` deleted; all runtime values gone (imports are compile errors and `undefined` at runtime in untyped code). The name `Role` now refers to the generated role object ([same-name changes](#same-name-meaning-changes)).
- **Migrate:** inline the role and permission strings you used; manage permissions server-side.
- **Source:** `src/index.ts` (v10, no `./permissions`); `src/permissions.ts:5-103`, `src/index.ts:18` (v9)

<a id="type-rename-table"></a>

## 20. Full type rename table

**Kind:** renamed · **Impact:** high · **PR:** #1760, #1836, #1896

All 384 hand-written v9 type exports from `src/types.ts` (383) and `src/events.ts` (1) that no longer exist under the same name, with their v10 mapping. Categories: renamed (same role), renamed with a shape change, derived expression, sort alias ([sort](#sort-shape)), removed with the API that used it (mostly server-side/admin methods removed from the client: use `@stream-io/node-sdk`), removed with no replacement. The "verified delta" column is computed member by member ("drops" = v9 members missing in v10; date fields that only changed to `TimestampNS` are counted, see [TimestampNS](#timestamp-ns)). Names that survive with a different meaning are in [same-name changes](#same-name-meaning-changes). Facts worth noting: `AppSettings` (the `updateAppSettings` input) has no client replacement (`AppResponseFields` is the read shape, not a replacement); `FlagMessageResponse`, `FlagUserResponse`, `MuteUserResponse`, `UnmuteUserResponse` are all removed; `ReminderAPIResponse` maps to `CreateReminderResponse` / `UpdateReminderResponse`, `PollAnswer` to `PollVoteResponseData`, `FlagMessageResponse` to `FlagItemResponse`; `UsersAPIResponse` (`users: UserResponse[]`) maps to `QueryUsersResponse`.

- **Migrate:** rename imports per row; for derived rows write the expression or inline the type.
- **Source:** `src/types.ts`, `src/gen/models/index.ts` (v10); `src/types.ts`, `src/events.ts` (v9)

### Renamed (same role, generated name) (92)

| v9                                | v10                              | verified delta / note                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIImageRule`                     | `AWSRekognitionRule`             | now required min_confidence; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                             |
| `AITextRule`                      | `BodyguardRule`                  | now required action, severity_rules; 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                     |
| `AITextSeverityRule`              | `BodyguardSeverityRule`          | 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `AIVideoConfig`                   | `AIVideoConfigResponse`          | read shape; AIVideoConfigRequest for input. 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                              |
| `AIVideoRule`                     | `AWSRekognitionRule`             | now required min_confidence; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                             |
| `AddUserGroupMembersOptions`      | `AddUserGroupMembersRequest`     |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `AppSettingsAPIResponse`          | `GetApplicationResponse`         | drops blocklist; now required app; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                       |
| `AutomodDetails`                  | `AutomodDetailsResponse`         | 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `BannedUsersResponse`             | `QueryBannedUsersResponse`       | drops blocklist; now required bans; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                      |
| `BlockUserAPIResponse`            | `BlockUsersResponse`             | drops blocklist, blocked_at; new required created_at                                                                                                                                                                                                                                                                                                                                                             |
| `BlockedUserDetails`              | `BlockedUserResponse`            | drops duration, blocklist; 1 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                 |
| `CastVoteAPIResponse`             | `PollVoteResponse`               | new required duration; now optional vote; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                |
| `ChannelAPIResponse`              | `ChannelStateResponseFields`     | now required threads; now optional channel; 5 field type(s) changed                                                                                                                                                                                                                                                                                                                                              |
| `ChannelConfigAutomodBehavior`    | `AutomodBehavior`                | = ChannelConfigWithInfo['automod_behavior']                                                                                                                                                                                                                                                                                                                                                                      |
| `ChannelConfigAutomodThresholds`  | `Thresholds`                     | null no longer allowed                                                                                                                                                                                                                                                                                                                                                                                           |
| `ChannelConfigAutomod`            | `Automod`                        | = ChannelConfigWithInfo['automod']                                                                                                                                                                                                                                                                                                                                                                               |
| `ChannelMemberAPIResponse`        | `MembersResponse`                | drops blocklist                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ChannelPushPreference`           | `ChannelPushPreferencesResponse` | 1 date field(s) string -> TimestampNS; 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                   |
| `ChannelQueryOptions`             | `ChannelGetOrCreateRequest`      | drops client_id, connection_id, created_by, created_by_id; 4 field type(s) changed                                                                                                                                                                                                                                                                                                                               |
| `CommandResponse`                 | `Command`                        | now required args, description, name, set; 2 date field(s) string -> TimestampNS; 2 field type(s) changed                                                                                                                                                                                                                                                                                                        |
| `CreatePollData`                  | `CreatePollRequest`              | custom poll fields under custom. drops user_id; 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                          |
| `CreatePollOptionAPIResponse`     | `PollOptionResponse`             | v10 PollOptionResponse is the { duration, poll_option } envelope (name reuse). new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                    |
| `CreateUserGroupOptions`          | `CreateUserGroupRequest`         |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `DeleteChannelAPIResponse`        | `DeleteChannelResponse`          | drops blocklist; now optional channel                                                                                                                                                                                                                                                                                                                                                                            |
| `DeliveredMessageConfirmation`    | `DeliveredMessagePayload`        | drops parent_id; now optional cid, id                                                                                                                                                                                                                                                                                                                                                                            |
| `ErrorFromResponse`               | `StreamAPIError`                 | runtime class. 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                           |
| `EventTypes`                      | `EventType`                      |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `FlagDetails`                     | `FlagDetailsResponse`            | new required original_text; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                              |
| `FormatMessageResponse`           | `LocalMessage`                   | was alias of LocalMessage. drops args, before_message_send_failed, channel, command_info, moderation_details; new required custom; now required attachments, html, pinned, restricted_visibility (+14); now optional deleted_at, pinned_at; 6 date field(s) -> TimestampNS (created_at, updated_at, deleted_at, pinned_at were Date; pin_expires, message_text_updated_at were string); 15 field type(s) changed |
| `FutureChannelBan`                | `FutureChannelBanResponse`       | now optional user; 2 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                         |
| `FutureChannelBansResponse`       | `QueryFutureChannelBansResponse` | drops blocklist; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                         |
| `GetBlockedUsersAPIResponse`      | `GetBlockedUsersResponse`        | drops blocklist; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                         |
| `GetMessageAPIResponse`           | `GetMessageResponse`             | drops blocklist, pending_message_metadata; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                               |
| `GetMultipleMessagesAPIResponse`  | `GetManyMessagesResponse`        | drops blocklist                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GetPollAPIResponse`              | `PollResponse`                   | v10 PollResponse is the { duration, poll } envelope (name reuse). new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                                 |
| `GetPollOptionAPIResponse`        | `PollOptionResponse`             | envelope { duration, poll_option }. new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                               |
| `GetReactionsAPIResponse`         | `GetReactionsResponse`           | channel.getReactions -> client.getReactions({ id }). drops blocklist                                                                                                                                                                                                                                                                                                                                             |
| `GetRepliesAPIResponse`           | `GetRepliesResponse`             | drops blocklist                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GetThreadAPIResponse`            | `GetThreadResponse`              | partialUpdateThread -> updateThreadPartial returns UpdateThreadPartialResponse. drops blocklist; 1 field type(s) changed                                                                                                                                                                                                                                                                                         |
| `GiphyData`                       | `Images`                         | 7 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `LLMSeverityRule`                 | `BodyguardSeverityRule`          | 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `MessageFlagsResponse`            | `QueryMessageFlagsResponse`      | drops blocklist; now required flags; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                     |
| `MessagePaginationOptions`        | `MessagePaginationParams`        | no offset. drops offset; 5 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                 |
| `ModerationActionConfig`          | `ModerationActionConfigResponse` | 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `ModerationFlag`                  | `ModerationFlagResponse`         | drops id, moderation_payload_hash; new required type, user_id; now optional custom, entity_creator_id, reason, review_queue_item_id (+1); 2 date field(s) string -> TimestampNS; 1 field type(s) changed                                                                                                                                                                                                         |
| `ModerationResult`                | `MessageModerationResult`        | 2 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                                            |
| `MuteChannelAPIResponse`          | `MuteChannelResponse`            | drops blocklist, mute; now optional channel_mute, own_user                                                                                                                                                                                                                                                                                                                                                       |
| `Mute`                            | `UserMuteResponse`               | now optional target, user; 2 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                 |
| `PartialMessageUpdate`            | `UpdateMessagePartialRequest`    | partialUpdateMessage -> updateMessagePartial({ id }, request). 2 field type(s) changed                                                                                                                                                                                                                                                                                                                           |
| `PartialThreadUpdate`             | `UpdateThreadPartialRequest`     | 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `PartialUpdateChannelAPIResponse` | `UpdateChannelPartialResponse`   | drops blocklist; now optional channel                                                                                                                                                                                                                                                                                                                                                                            |
| `PartialUpdateChannel`            | `UpdateChannelPartialRequest`    | 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `PartialUpdateMemberAPIResponse`  | `UpdateMemberPartialResponse`    | drops blocklist; now optional channel_member                                                                                                                                                                                                                                                                                                                                                                     |
| `PartialUpdateMember`             | `UpdateMemberPartialRequest`     | 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `PartialUserUpdate`               | `UpdateUserPartialRequest`       | partialUpdateUser(s) removed; updateUsersPartial({ users }). 2 field type(s) changed                                                                                                                                                                                                                                                                                                                             |
| `PollAnswer`                      | `PollVoteResponseData`           | now required option_id; now optional answer_text, is_answer; 2 date field(s) string -> TimestampNS; 1 field type(s) changed                                                                                                                                                                                                                                                                                      |
| `PollAnswersAPIResponse`          | `PollVotesResponse`              | new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                   |
| `PollVote`                        | `PollVoteResponseData`           | now required option_id; 2 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                    |
| `PollVotesAPIResponse`            | `PollVotesResponse`              | new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                   |
| `PrivacySettings`                 | `PrivacySettingsResponse`        | UserResponse no longer has privacy_settings (OwnUserResponse only). 3 field type(s) changed                                                                                                                                                                                                                                                                                                                      |
| `PushPreference`                  | `PushPreferenceInput`            | setPushPreferences -> updatePushNotificationPreferences({ preferences }). 4 field type(s) changed                                                                                                                                                                                                                                                                                                                |
| `QueryChannelAPIResponse`         | `ChannelStateResponse`           | drops blocklist; now required threads; now optional channel; 5 field type(s) changed                                                                                                                                                                                                                                                                                                                             |
| `QueryChannelsAPIResponse`        | `QueryChannelsResponse`          | drops blocklist; 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                         |
| `QueryConfigsResponse`            | `QueryModerationConfigsResponse` | moderation.queryConfigs -> moderation.queryModerationConfigs. new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                                     |
| `QueryReactionsAPIResponse`       | `QueryReactionsResponse`         | drops blocklist                                                                                                                                                                                                                                                                                                                                                                                                  |
| `QueryRemindersOptions`           | `QueryRemindersRequest`          | 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `QueryThreadsAPIResponse`         | `QueryThreadsResponse`           | drops blocklist; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                         |
| `QueryThreadsOptions`             | `QueryThreadsRequest`            | 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                          |
| `QueryUserGroupsOptions`          | `ListUserGroupsOptions`          | queryUserGroups -> listUserGroups                                                                                                                                                                                                                                                                                                                                                                                |
| `QueryUserGroupsResponse`         | `ListUserGroupsResponse`         | drops blocklist                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ReactionAPIResponse`             | `SendReactionResponse`           | DeleteReactionResponse for deleteReaction. drops blocklist                                                                                                                                                                                                                                                                                                                                                       |
| `ReadResponse`                    | `ReadStateResponse`              | now required unread_messages; 2 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                              |
| `ReminderAPIResponse`             | `CreateReminderResponse`         | UpdateReminderResponse for updateReminder. drops blocklist; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                              |
| `ReminderResponseBase`            | `ReminderResponseData`           | 3 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                                            |
| `ReminderResponse`                | `ReminderResponseData`           | now optional user, message; 3 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                |
| `RemoveUserGroupMembersOptions`   | `RemoveUserGroupMembersRequest`  |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `RequestOptions`                  | `StreamRequestOptions`           | adds onUploadProgress, timeout                                                                                                                                                                                                                                                                                                                                                                                   |
| `ReviewQueueResponse`             | `QueryReviewQueueResponse`       | new required duration; now required action_config, stats; 3 field type(s) changed                                                                                                                                                                                                                                                                                                                                |
| `RoleResponse`                    | `Role`                           | v10 Role is this object (name reuse; v9 Role was the role-name union). 2 date field(s) string -> TimestampNS; 1 field type(s) changed                                                                                                                                                                                                                                                                            |
| `SearchAPIResponse`               | `SearchResponse`                 | drops blocklist; 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                         |
| `SearchRolesAPIResponse`          | `SearchRolesResponse`            | drops blocklist; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                         |
| `SharedStaticLocationResponse`    | `SharedLocationResponseData`     | 2 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                                            |
| `TranslationLanguages`            | `TranslationLanguage`            |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `TruncateChannelAPIResponse`      | `TruncateChannelResponse`        | drops blocklist; now optional channel                                                                                                                                                                                                                                                                                                                                                                            |
| `TruncateOptions`                 | `TruncateChannelRequest`         | drops user, user_id; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                     |
| `UnmuteUserResponse`              | `UnmuteResponse`                 | drops blocklist                                                                                                                                                                                                                                                                                                                                                                                                  |
| `UpdateChannelAPIResponse`        | `UpdateChannelResponse`          | v10 UpdateChannelResponse replaces the v9 hand-written channel-type one (name reuse). drops blocklist; now optional channel                                                                                                                                                                                                                                                                                      |
| `UpdateChannelOptions`            | `UpdateChannelRequest`           | drops add_moderators, client_id, connection_id, demote_moderators, user, user_id; 4 field type(s) changed                                                                                                                                                                                                                                                                                                        |
| `UpdateLocationPayload`           | `UpdateLiveLocationRequest`      | end_at is Date. drops created_by_device_id, user, user_id; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                               |
| `UpdateUserGroupOptions`          | `UpdateUserGroupRequest`         |                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `UpdateUsersAPIResponse`          | `UpdateUsersResponse`            | drops blocklist; now required membership_deletion_task_id; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                               |
| `UserGroupMemberResponse`         | `UserGroupMember`                | new required app_pk; 1 date field(s) string -> TimestampNS                                                                                                                                                                                                                                                                                                                                                       |

### Renamed with a shape change that needs code edits (46)

| v9                               | v10                             | verified delta / note                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APIErrorResponse`               | `APIError`                      | StatusCode -> status_code. drops StatusCode; new required status_code; now required code, details; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                  |
| `ActiveLiveLocationsAPIResponse` | `SharedLocationsResponse`       | getSharedLocations -> getUserLiveLocations. drops blocklist; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                        |
| `BaseDeviceFields`               | `DeviceResponse`                | read shape; CreateDeviceRequest for client.createDevice input. new required created_at, user_id; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                    |
| `BlockList`                      | `CreateBlockListRequest`        | input of createBlockList; BlockListResponse for reads. drops validate; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                              |
| `ChannelData`                    | `ChannelInput`                  | custom fields move under custom. drops blocked, blocklist_behavior, automod; 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                        |
| `CreatePollAPIResponse`          | `PollResponse`                  | v10 PollResponse is the { duration, poll } envelope (name reuse). new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                            |
| `CreateReminderOptions`          | `CreateReminderRequest`         | messageId -> pathParams { message_id }; remind_at Date. drops messageId, user_id; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                   |
| `DeviceFields`                   | `DeviceResponse`                | new required user_id; 1 date field(s) string -> TimestampNS; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                        |
| `Device`                         | `DeviceResponse`                | created_at TimestampNS; no provider/user. drops provider, user; now required user_id; 1 date field(s) string -> TimestampNS; 1 field type(s) changed                                                                                                                                                                                                                                                                                        |
| `DraftMessagePayload`            | `MessageRequest`                | createDraft({ message: MessageRequest }). drops html, user_id; now optional text; 3 field type(s) changed                                                                                                                                                                                                                                                                                                                                   |
| `EventAPIResponse`               | `EventResponse`                 | sendEvent; markRead -> MarkReadResponse; markChannelsDelivered -> MarkDeliveredResponse. drops blocklist; 1 field type(s) changed                                                                                                                                                                                                                                                                                                           |
| `FlagMessageResponse`            | `FlagItemResponse`              | client.flagMessage -> client.moderation.flagMessage. drops blocklist, flag, review_queue_item_id; new required item_id                                                                                                                                                                                                                                                                                                                      |
| `FlagUserResponse`               | `FlagItemResponse`              | client.flagUser -> client.moderation.flagUser. drops blocklist, flag, review_queue_item_id; new required item_id                                                                                                                                                                                                                                                                                                                            |
| `GetUnreadCountAPIResponse`      | `WrappedUnreadCountsResponse`   | getUnreadCount(userID?) -> unreadCounts(). drops blocklist; 3 field type(s) changed                                                                                                                                                                                                                                                                                                                                                         |
| `LiveLocationPayload`            | `SharedLocation`                | sendSharedLocation(SharedLocation & { message_id? }); end_at Date. drops message_id; now optional created_by_device_id, end_at; 1 field type(s) changed                                                                                                                                                                                                                                                                                     |
| `LocalMessageBase`               | `LocalMessage`                  | no Date conversion: created_at etc. stay TimestampNS. drops args, before_message_send_failed, channel, command_info, moderation_details; new required custom; now required attachments, html, pinned, restricted_visibility (+14); now optional deleted_at, pinned_at; 6 date field(s) -> TimestampNS (created_at, updated_at, deleted_at, pinned_at were Date; pin_expires, message_text_updated_at were string); 13 field type(s) changed |
| `MarkChannelsReadOptions`        | `MarkChannelsReadRequest`       | user/user_id overrides gone (connected user only). drops client_id, connection_id, user, user_id                                                                                                                                                                                                                                                                                                                                            |
| `MarkDeliveredOptions`           | `MarkDeliveredRequest`          | user/user_id overrides gone. drops user, user_id; now optional latest_delivered_messages; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                           |
| `MarkReadOptions`                | `MarkReadRequest`               | user/user_id overrides gone. drops client_id, connection_id, user, user_id                                                                                                                                                                                                                                                                                                                                                                  |
| `MarkUnreadOptions`              | `MarkUnreadRequest`             | user/user_id overrides gone; message_timestamp Date only. drops client_id, connection_id, user, user_id; 1 field type(s) changed                                                                                                                                                                                                                                                                                                            |
| `MessageBase`                    | `MessageRequest`                | input; MessageResponse for reads. drops html, user, user_id; now optional id; 3 field type(s) changed                                                                                                                                                                                                                                                                                                                                       |
| `MessageResponseBase`            | `MessageResponse`               | drops user_id, args, before_message_send_failed, channel, command_info, moderation_details (+1); new required custom; now required attachments, html, pinned, restricted_visibility (+16); 6 date field(s) string -> TimestampNS; 13 field type(s) changed                                                                                                                                                                                  |
| `Message`                        | `MessageRequest`                | custom fields move under custom. drops html, user, user_id; 4 field type(s) changed                                                                                                                                                                                                                                                                                                                                                         |
| `ModerationConfigResponse`       | `ConfigResponse`                | new required async, supported_video_call_harm_types; now required team; 2 date field(s) string -> TimestampNS; 1 field type(s) changed                                                                                                                                                                                                                                                                                                      |
| `ModerationConfig`               | `UpsertConfigRequest`           | moderation.upsertConfig input. 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                      |
| `ModerationDetailsResponse`      | `ModerationV2Response`          | MessageResponse.moderation_details removed; read MessageResponse.moderation. drops error_msg, harms; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                |
| `ModerationMuteOptions`          | `MuteRequest`                   | moderation.muteUser(targetId, options) -> moderation.mute({ target_ids, timeout }). drops user_id; new required target_ids                                                                                                                                                                                                                                                                                                                  |
| `MuteUserOptions`                | `MuteRequest`                   | client.muteUser removed; client.moderation.mute({ target_ids, timeout }). drops client_id, connection_id, id, reason, target_user_id, type (+2); new required target_ids                                                                                                                                                                                                                                                                    |
| `MuteUserResponse`               | `MuteResponse`                  | v10 MuteResponse is the /moderation/mute envelope (name reuse). drops blocklist, mute; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                              |
| `NewMemberPayload`               | `ChannelMemberRequest`          | custom member fields under custom. 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                                  |
| `PaginationOptions`              | `PaginationParams`              | channel.query members/watchers; MessagePaginationParams for messages. drops created_at_after, created_at_after_or_equal, created_at_before, created_at_before_or_equal; 4 field type(s) changed                                                                                                                                                                                                                                             |
| `PollData`                       | `UpdatePollRequest`             | custom poll fields under custom. drops user_id; 2 field type(s) changed                                                                                                                                                                                                                                                                                                                                                                     |
| `PollOptionData`                 | `PollOptionInput`               | createOption -> CreatePollOptionRequest; updateOption -> UpdatePollOptionRequest; position dropped. drops id, position; now optional text                                                                                                                                                                                                                                                                                                   |
| `PollOption`                     | `PollOptionResponseData`        | only id, text, custom; vote_count/votes/created_at/poll_id gone. drops created_at, poll_id, updated_at, vote_count, votes; new required custom; 1 field type(s) changed                                                                                                                                                                                                                                                                     |
| `PollVoteData`                   | `VoteData`                      | castPollVote({ message_id, poll_id }, { vote }); is_answer dropped. drops is_answer                                                                                                                                                                                                                                                                                                                                                         |
| `QueryFutureChannelBansOptions`  | `QueryFutureChannelBansPayload` | queryFutureChannelBans({ payload }); user_id dropped. drops user_id                                                                                                                                                                                                                                                                                                                                                                         |
| `ReviewQueueItem`                | `ReviewQueueItemResponse`       | drops actions_taken, appealed_by, context, created_by, has_image, has_text (+4); new required ai_text_severity, escalated, flags_count, reviewed_by (+4); now required latest_moderator_action; now optional assigned_to, completed_at, config_key, moderation_payload (+1); 4 date field(s) string -> TimestampNS; 4 field type(s) changed                                                                                                 |
| `SendFileAPIResponse`            | `FileUploadResponse`            | client.uploadFile; ImageUploadResponse (uploadImage); UploadChannelFileResponse / UploadChannelResponse (channel.uploadChannelFile / uploadChannelImage). drops blocklist; now optional file                                                                                                                                                                                                                                                |
| `StaticLocationPayload`          | `SharedLocation`                | message_id moved to sendSharedLocation arg. drops message_id; now optional created_by_device_id                                                                                                                                                                                                                                                                                                                                             |
| `StreamChatOptions`              | `InstanceConfigTree`            | see [StreamChatOptions keys](#streamchat-options). drops url, method, baseURL, allowAbsoluteUrls, transformRequest, transformResponse (+59); new required channel, client, liveLocationManager, messageComposer (+4)                                                                                                                                                                                                                        |
| `SubmitActionOptions`            | `SubmitActionRequest`           | drops end_call, kick_user, user_id; new required action_type; 16 field type(s) changed                                                                                                                                                                                                                                                                                                                                                      |
| `UpdatePollAPIResponse`          | `PollResponse`                  | envelope { duration, poll } (name reuse). new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                    |
| `UpdatePollOptionAPIResponse`    | `PollOptionResponse`            | envelope { duration, poll_option }. new required duration; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                          |
| `UpdateReminderOptions`          | `UpdateReminderRequest`         | messageId -> pathParams { message_id }. drops messageId, user_id; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                                                   |
| `UpdatedMessage`                 | `MessageRequest`                | drops status, user_id, args, before_message_send_failed, channel, cid (+14); now optional id; 3 field type(s) changed                                                                                                                                                                                                                                                                                                                       |
| `UsersAPIResponse`               | `QueryUsersResponse`            | was unreferenced; UpdateUsersResponse for writes. drops blocklist, membership_deletion_task_id; 1 field type(s) changed                                                                                                                                                                                                                                                                                                                     |

### Removed: write the derived type (26)

| v9                              | v10                                                                                                                                                              | verified delta / note                                                                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BannedUsersFilterOptions`      | removed: use `QueryBannedUsersPayload['filter_conditions']`                                                                                                      |                                                                                                                                                                                                                   |
| `BannedUsersFilters`            | removed: use `QueryBannedUsersPayload['filter_conditions']`                                                                                                      |                                                                                                                                                                                                                   |
| `BannedUsersPaginationOptions`  | removed: use `Omit<QueryBannedUsersPayload, 'filter_conditions' \| 'sort'>`                                                                                      | queryBannedUsers({ payload })                                                                                                                                                                                     |
| `BlocklistBehavior`             | removed: use `ChannelConfigWithInfo['blocklist_behavior']`                                                                                                       |                                                                                                                                                                                                                   |
| `ChannelConfigFields`           | removed: use `ChannelConfigWithInfo`                                                                                                                             | server channel config; was also the base of v9 ChannelConfig. new required created_at, updated_at, commands; now required automod, automod_behavior, connect_events, custom_events (+20); 5 field type(s) changed |
| `ChannelMemberUpdates`          | removed: use `UpdateMemberPartialRequest['set']`                                                                                                                 |                                                                                                                                                                                                                   |
| `DeleteUserGroupOptions`        | removed: use `NonNullable<Parameters<StreamChat['deleteUserGroup']>[1]>`                                                                                         | inline { team_id? }                                                                                                                                                                                               |
| `DraftFilters`                  | removed: use `NonNullable<QueryDraftsRequest['filter']>`                                                                                                         |                                                                                                                                                                                                                   |
| `GetUserGroupOptions`           | removed: use `NonNullable<Parameters<StreamChat['getUserGroup']>[1]>`                                                                                            | inline { team_id? }                                                                                                                                                                                               |
| `MessageDeletionStrategy`       | removed: use `NonNullable<BanUserOptions['delete_messages']>`                                                                                                    |                                                                                                                                                                                                                   |
| `MessageFlagsFiltersOptions`    | removed: use `QueryMessageFlagsPayload['filter_conditions']`                                                                                                     |                                                                                                                                                                                                                   |
| `MessageFlagsFilters`           | removed: use `QueryMessageFlagsPayload['filter_conditions']`                                                                                                     |                                                                                                                                                                                                                   |
| `MessageFlagsPaginationOptions` | removed: use `Omit<QueryMessageFlagsPayload, 'filter_conditions' \| 'sort'>`                                                                                     | queryMessageFlags({ payload })                                                                                                                                                                                    |
| `MessageUpdatableFields`        | removed: use `NonNullable<UpdateMessagePartialRequest['set']>`                                                                                                   |                                                                                                                                                                                                                   |
| `Pager`                         | removed: use `Pick<QueryDraftsRequest, 'limit' \| 'next' \| 'prev'>`                                                                                             | pagination fields live on each request                                                                                                                                                                            |
| `PartialUpdateChannelFields`    | removed: use `NonNullable<UpdateChannelPartialRequest['set']>`                                                                                                   |                                                                                                                                                                                                                   |
| `PollEnrichData`                | removed: use `Pick<PollResponseData, 'answers_count' \| 'latest_answers' \| 'latest_votes_by_option' \| 'vote_count' \| 'vote_counts_by_option' \| 'own_votes'>` |                                                                                                                                                                                                                   |
| `QueryModerationConfigsFilters` | removed: use `NonNullable<QueryModerationConfigsRequest['filter']>`                                                                                              |                                                                                                                                                                                                                   |
| `QueryReactionsOptions`         | removed: use `Omit<QueryReactionsRequest, 'filter' \| 'sort'>`                                                                                                   |                                                                                                                                                                                                                   |
| `ReviewQueueFilters`            | removed: use `NonNullable<QueryReviewQueueRequest['filter']>`                                                                                                    |                                                                                                                                                                                                                   |
| `ReviewQueuePaginationOptions`  | removed: use `Pick<QueryReviewQueueRequest, 'limit' \| 'next' \| 'prev'>`                                                                                        |                                                                                                                                                                                                                   |
| `SearchOptions`                 | removed: use `Pick<SearchPayload, 'limit' \| 'next' \| 'offset' \| 'sort'>`                                                                                      | search({ payload })                                                                                                                                                                                               |
| `SearchRolesOptions`            | removed: use `Parameters<StreamChat['searchRoles']>[0]`                                                                                                          |                                                                                                                                                                                                                   |
| `SendReactionOptions`           | removed: use `Omit<SendReactionRequest, 'reaction'>`                                                                                                             |                                                                                                                                                                                                                   |
| `SyncOptions`                   | removed: use `Parameters<StreamChat['sync']>[0]`                                                                                                                 | watch / with_inaccessible_cids now inside the request                                                                                                                                                             |
| `VotesFiltersOptions`           | removed: use `NonNullable<QueryPollVotesRequest['filter']>`                                                                                                      |                                                                                                                                                                                                                   |

### Removed sort aliases (see [sort](#sort-shape)) (29)

| v9                           | v10                                          | verified delta / note                                                                                               |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `AscDesc`                    | removed: use `SortParamRequest['direction']` | direction is number                                                                                                 |
| `BannedUsersSortBase`        | removed: use `SortParamRequest`              | drops created_at                                                                                                    |
| `BannedUsersSort`            | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `ChannelSortBase`            | removed: use `SortParamRequest`              | drops created_at, has_unread, last_message_at, last_updated, member_count, pinned_at (+2)                           |
| `ChannelSort`                | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `DraftSortBase`              | removed: use `SortParamRequest`              | drops created_at                                                                                                    |
| `DraftSort`                  | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `MemberSort`                 | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `PinnedMessagesSortBase`     | removed: use `SortParamRequest`              | drops pinned_at                                                                                                     |
| `PinnedMessagesSort`         | removed: use `SortParamRequest[]`            | getPinnedMessages({ ...options, sort })                                                                             |
| `PollSortBase`               | removed: use `SortParamRequest`              | drops created_at, id, is_closed, name, updated_at                                                                   |
| `PollSort`                   | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `PredefinedFilterSortParam`  | removed: use `SortParamRequest`              | now optional field; 1 field type(s) changed                                                                         |
| `PredefinedFilterSort`       | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `QueryModerationConfigsSort` | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `QuerySort`                  | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `ReactionSortBase`           | removed: use `SortParamRequest`              | drops created_at                                                                                                    |
| `ReactionSort`               | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `ReminderSort`               | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `ReviewQueueSort`            | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `SearchMessageSortBase`      | removed: use `SortParamRequest`              | drops attachments, attachments.type, created_at, id, mentioned_users.id, parent_id (+6); 1 field type(s) changed    |
| `SearchMessageSort`          | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `SortParam`                  | removed: use `SortParamRequest`              | now optional field; 1 field type(s) changed                                                                         |
| `Sort`                       | removed: use `SortParamRequest`              |                                                                                                                     |
| `ThreadSortBase`             | removed: use `SortParamRequest`              | drops active_participant_count, created_at, last_message_at, parent_message_id, participant_count, reply_count (+1) |
| `ThreadSort`                 | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `UserSort`                   | removed: use `SortParamRequest[]`            |                                                                                                                     |
| `VoteSortBase`               | removed: use `SortParamRequest`              | drops created_at, id, is_closed, name, updated_at                                                                   |
| `VoteSort`                   | removed: use `SortParamRequest[]`            |                                                                                                                     |

### Removed together with the only API that used it (152)

| v9                                | v10                                                                                                                                                     | verified delta / note |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `APNConfig`                       | removed: no replacement (app-settings admin (updateAppSettings removed); node-sdk)                                                                      |                       |
| `AppSettings`                     | removed: no replacement (was the updateAppSettings input; updateAppSettings removed (node-sdk). AppResponseFields is the read shape, not a replacement) |                       |
| `AsyncModerationOptions`          | removed: no replacement (app-settings admin)                                                                                                            |                       |
| `BatchChannelDataUpdate`          | removed: no replacement (ChannelBatchUpdater / updateChannelsBatch removed)                                                                             |                       |
| `BatchUpdateOperation`            | removed: no replacement (ChannelBatchUpdater / updateChannelsBatch removed)                                                                             |                       |
| `CampaignData`                    | removed: no replacement (campaigns removed (node-sdk))                                                                                                  |                       |
| `CampaignFilters`                 | removed: no replacement (campaigns removed)                                                                                                             |                       |
| `CampaignQueryOptions`            | removed: no replacement (campaigns removed)                                                                                                             |                       |
| `CampaignResponse`                | removed: no replacement (campaigns removed)                                                                                                             |                       |
| `CampaignSort`                    | removed: no replacement (campaigns removed)                                                                                                             |                       |
| `CampaignStats`                   | removed: no replacement (campaigns removed)                                                                                                             |                       |
| `ChannelBatchDataUpdateOptions`   | removed: no replacement (ChannelBatchUpdater removed)                                                                                                   |                       |
| `CheckPushInput`                  | removed: no replacement (testPushSettings removed)                                                                                                      |                       |
| `CheckPushResponse`               | removed: no replacement (testPushSettings removed)                                                                                                      |                       |
| `CheckResponse`                   | removed: no replacement (moderation.check / checkUserProfile removed)                                                                                   |                       |
| `CheckSNSResponse`                | removed: no replacement (testSNSSettings removed)                                                                                                       |                       |
| `CheckSQSResponse`                | removed: no replacement (testSQSSettings removed)                                                                                                       |                       |
| `CreateChannelOptions`            | removed: no replacement (createChannelType removed)                                                                                                     |                       |
| `CreateChannelResponse`           | removed: no replacement (createChannelType removed)                                                                                                     |                       |
| `CreateCommandOptions`            | removed: no replacement (createCommand removed)                                                                                                         |                       |
| `CreateCommandResponse`           | removed: no replacement (createCommand removed)                                                                                                         |                       |
| `CreateImportOptions`             | removed: no replacement (imports removed)                                                                                                               |                       |
| `CreateImportResponse`            | removed: no replacement (imports removed)                                                                                                               |                       |
| `CreateImportURLResponse`         | removed: no replacement (imports removed)                                                                                                               |                       |
| `CreatePredefinedFilterOptions`   | removed: no replacement (predefined-filter CRUD removed)                                                                                                |                       |
| `CreateRoleAPIResponse`           | removed: no replacement (createRole removed)                                                                                                            |                       |
| `CustomCheckFlag`                 | removed: no replacement (moderation.addCustomFlags removed)                                                                                             |                       |
| `CustomCheckResponse`             | removed: no replacement (moderation.addCustomFlags removed)                                                                                             |                       |
| `CustomPermissionOptions`         | removed: no replacement (permission CRUD removed)                                                                                                       |                       |
| `DailyValue`                      | removed: no replacement (team usage stats removed)                                                                                                      |                       |
| `DeactivateUsersOptions`          | removed: no replacement (deactivateUser(s) removed)                                                                                                     |                       |
| `DeleteCampaignOptions`           | removed: no replacement (campaigns removed)                                                                                                             |                       |
| `DeleteCommandResponse`           | removed: no replacement (deleteCommand removed)                                                                                                         |                       |
| `DeleteRetentionPolicyResponse`   | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `DeleteType`                      | removed: no replacement (deleteUsers removed)                                                                                                           |                       |
| `DeleteUserOptions`               | removed: no replacement (deleteUsers removed)                                                                                                           |                       |
| `EndpointName`                    | removed: no replacement (getRateLimits removed)                                                                                                         |                       |
| `EventHook`                       | removed: no replacement (app-settings admin)                                                                                                            |                       |
| `ExportChannelOptions`            | removed: no replacement (exportChannel(s) removed)                                                                                                      |                       |
| `ExportChannelRequest`            | removed: no replacement (exportChannel(s) removed)                                                                                                      |                       |
| `ExportChannelResponse`           | removed: no replacement (exportChannel(s) removed)                                                                                                      |                       |
| `ExportChannelStatusResponse`     | removed: no replacement (getExportChannelStatus removed)                                                                                                |                       |
| `ExportUsersRequest`              | removed: no replacement (exportUsers removed)                                                                                                           |                       |
| `ExportUsersResponse`             | removed: no replacement (exportUsers removed)                                                                                                           |                       |
| `FirebaseConfig`                  | removed: no replacement (app-settings admin)                                                                                                            |                       |
| `FlagReport`                      | removed: no replacement (private \_queryFlagReports removed)                                                                                            |                       |
| `FlagReportsFiltersOptions`       | removed: no replacement (private \_queryFlagReports removed)                                                                                            |                       |
| `FlagReportsFilters`              | removed: no replacement (private \_queryFlagReports removed)                                                                                            |                       |
| `FlagReportsPaginationOptions`    | removed: no replacement (private \_queryFlagReports removed)                                                                                            |                       |
| `FlagReportsResponse`             | removed: no replacement (private \_queryFlagReports removed)                                                                                            |                       |
| `Flag`                            | removed: no replacement (private \_queryFlags removed; nearest MessageFlagResponse (queryMessageFlags))                                                 |                       |
| `FlagsFiltersOptions`             | removed: no replacement (private \_queryFlags removed)                                                                                                  |                       |
| `FlagsFilters`                    | removed: no replacement (private \_queryFlags removed)                                                                                                  |                       |
| `FlagsPaginationOptions`          | removed: no replacement (private \_queryFlags removed)                                                                                                  |                       |
| `FlagsResponse`                   | removed: no replacement (private \_queryFlags removed)                                                                                                  |                       |
| `GetCampaignOptions`              | removed: no replacement (campaigns removed)                                                                                                             |                       |
| `GetChannelTypeResponse`          | removed: no replacement (getChannelType removed)                                                                                                        |                       |
| `GetCommandResponse`              | removed: no replacement (getCommand removed)                                                                                                            |                       |
| `GetHookEventsResponse`           | removed: no replacement (getHookEvents removed)                                                                                                         |                       |
| `GetImportResponse`               | removed: no replacement (imports removed)                                                                                                               |                       |
| `GetRateLimitsResponse`           | removed: no replacement (getRateLimits removed)                                                                                                         |                       |
| `GetRetentionPolicyResponse`      | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `GetRetentionPolicyRunsOptions`   | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `GetRetentionPolicyRunsResponse`  | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `GetUnreadCountBatchAPIResponse`  | removed: no replacement (getUnreadCountBatch removed)                                                                                                   |                       |
| `GetUserModerationReportOptions`  | removed: no replacement (moderation.getUserModerationReport removed)                                                                                    |                       |
| `GetUserModerationReportResponse` | removed: no replacement (moderation.getUserModerationReport removed)                                                                                    |                       |
| `HookEvent`                       | removed: no replacement (getHookEvents removed)                                                                                                         |                       |
| `HookType`                        | removed: no replacement (app-settings admin)                                                                                                            |                       |
| `HuaweiConfig`                    | removed: no replacement (app-settings admin)                                                                                                            |                       |
| `ImportTaskHistory`               | removed: no replacement (imports removed)                                                                                                               |                       |
| `ImportTask`                      | removed: no replacement (imports removed)                                                                                                               |                       |
| `ListChannelResponse`             | removed: no replacement (listChannelTypes removed)                                                                                                      |                       |
| `ListChannelTypesAPIResponse`     | removed: no replacement (listChannelTypes removed)                                                                                                      |                       |
| `ListCommandsResponse`            | removed: no replacement (listCommands removed)                                                                                                          |                       |
| `ListImportsPaginationOptions`    | removed: no replacement (imports removed)                                                                                                               |                       |
| `ListImportsResponse`             | removed: no replacement (imports removed)                                                                                                               |                       |
| `ListPredefinedFiltersOptions`    | removed: no replacement (predefined-filter CRUD removed)                                                                                                |                       |
| `ListPredefinedFiltersResponse`   | removed: no replacement (predefined-filter CRUD removed)                                                                                                |                       |
| `ListRolesAPIResponse`            | removed: no replacement (listRoles removed)                                                                                                             |                       |
| `MessageHistoryEntry`             | removed: no replacement (queryMessageHistory removed)                                                                                                   |                       |
| `MessageSet`                      | removed: no replacement (ChannelState.messageSets removed ([message paginator](#message-paginator)))                                                    |                       |
| `MetricStats`                     | removed: no replacement (queryTeamUsageStats removed)                                                                                                   |                       |
| `ModerationRuleRequest`           | removed: no replacement (moderation rules CRUD removed)                                                                                                 |                       |
| `ModerationRule`                  | removed: no replacement (moderation rules CRUD removed)                                                                                                 |                       |
| `PermissionAPIObject`             | removed: no replacement (permission CRUD removed)                                                                                                       |                       |
| `PermissionAPIResponse`           | removed: no replacement (getPermission removed)                                                                                                         |                       |
| `PermissionObject`                | removed: no replacement (channel-type admin removed)                                                                                                    |                       |
| `PermissionsAPIResponse`          | removed: no replacement (listPermissions removed)                                                                                                       |                       |
| `PolicyRequest`                   | removed: no replacement (channel-type admin removed)                                                                                                    |                       |
| `Policy`                          | removed: no replacement (app-settings admin)                                                                                                            |                       |
| `PredefinedFilterOperation`       | removed: no replacement (predefined-filter CRUD removed)                                                                                                |                       |
| `PredefinedFilterResponse`        | removed: no replacement (predefined-filter CRUD removed)                                                                                                |                       |
| `PredefinedFilter`                | removed: no replacement (predefined-filter CRUD removed)                                                                                                |                       |
| `PromoteChannelParams`            | removed: no replacement (promoteChannel removed)                                                                                                        |                       |
| `PushProviderAPN`                 | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `PushProviderCommon`              | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `PushProviderConfig`              | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `PushProviderFirebase`            | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `PushProviderHuawei`              | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `PushProviderID`                  | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `PushProviderListResponse`        | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `PushProviderUpsertResponse`      | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `PushProviderXiaomi`              | removed: no replacement (push-provider admin removed)                                                                                                   |                       |
| `QueryMessageHistoryFilters`      | removed: no replacement (queryMessageHistory removed)                                                                                                   |                       |
| `QueryMessageHistoryOptions`      | removed: no replacement (queryMessageHistory removed)                                                                                                   |                       |
| `QueryMessageHistoryResponse`     | removed: no replacement (queryMessageHistory removed)                                                                                                   |                       |
| `QueryMessageHistorySortBase`     | removed: no replacement (queryMessageHistory removed)                                                                                                   |                       |
| `QueryMessageHistorySort`         | removed: no replacement (queryMessageHistory removed)                                                                                                   |                       |
| `QueryModerationRulesFilters`     | removed: no replacement (moderation rules CRUD removed)                                                                                                 |                       |
| `QueryModerationRulesResponse`    | removed: no replacement (moderation rules CRUD removed)                                                                                                 |                       |
| `QueryModerationRulesSort`        | removed: no replacement (moderation rules CRUD removed)                                                                                                 |                       |
| `QuerySegmentTargetsFilter`       | removed: no replacement (segments removed)                                                                                                              |                       |
| `QuerySegmentTargetsOptions`      | removed: no replacement (segments removed)                                                                                                              |                       |
| `QuerySegmentsOptions`            | removed: no replacement (segments removed)                                                                                                              |                       |
| `QueryTeamUsageStatsOptions`      | removed: no replacement (queryTeamUsageStats removed)                                                                                                   |                       |
| `QueryTeamUsageStatsResponse`     | removed: no replacement (queryTeamUsageStats removed)                                                                                                   |                       |
| `RateLimitsInfo`                  | removed: no replacement (getRateLimits removed)                                                                                                         |                       |
| `RateLimitsMap`                   | removed: no replacement (getRateLimits removed)                                                                                                         |                       |
| `ReactivateUserOptions`           | removed: no replacement (reactivateUser removed)                                                                                                        |                       |
| `ReactivateUsersOptions`          | removed: no replacement (reactivateUsers removed)                                                                                                       |                       |
| `Resource`                        | removed: no replacement (permission CRUD removed)                                                                                                       |                       |
| `RetentionPolicyConfig`           | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `RetentionPolicy`                 | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `RetentionRunResponse`            | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `RetentionRunStats`               | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `ReviewFlagReportOptions`         | removed: no replacement (private \_reviewFlagReport removed)                                                                                            |                       |
| `ReviewFlagReportResponse`        | removed: no replacement (private \_reviewFlagReport removed)                                                                                            |                       |
| `SegmentData`                     | removed: no replacement (segments removed)                                                                                                              |                       |
| `SegmentQueryOptions`             | removed: no replacement (segments removed)                                                                                                              |                       |
| `SegmentResponse`                 | removed: no replacement (segments removed)                                                                                                              |                       |
| `SegmentTargetsResponse`          | removed: no replacement (segments removed)                                                                                                              |                       |
| `SegmentType`                     | removed: no replacement (segments removed)                                                                                                              |                       |
| `SetRetentionPolicyResponse`      | removed: no replacement (retention policies removed)                                                                                                    |                       |
| `TaskStatus`                      | removed: no replacement (getTask removed)                                                                                                               |                       |
| `TeamUsageStats`                  | removed: no replacement (queryTeamUsageStats removed)                                                                                                   |                       |
| `TestPushDataInput`               | removed: no replacement (testPushSettings removed)                                                                                                      |                       |
| `TestSNSDataInput`                | removed: no replacement (testSNSSettings removed)                                                                                                       |                       |
| `TestSQSDataInput`                | removed: no replacement (testSQSSettings removed)                                                                                                       |                       |
| `TranslateResponse`               | removed: no replacement (translate removed (translateMessage remains: TranslateMessageResponse))                                                        |                       |
| `UpdateChannelTypeRequest`        | removed: no replacement (updateChannelType removed)                                                                                                     |                       |
| `UpdateChannelTypeResponse`       | removed: no replacement (updateChannelType removed)                                                                                                     |                       |
| `UpdateChannelsBatchFilters`      | removed: no replacement (updateChannelsBatch removed)                                                                                                   |                       |
| `UpdateChannelsBatchOptions`      | removed: no replacement (updateChannelsBatch removed)                                                                                                   |                       |
| `UpdateChannelsBatchResponse`     | removed: no replacement (updateChannelsBatch removed)                                                                                                   |                       |
| `UpdateCommandOptions`            | removed: no replacement (updateCommand removed)                                                                                                         |                       |
| `UpdateCommandResponse`           | removed: no replacement (updateCommand removed)                                                                                                         |                       |
| `UpdatePredefinedFilterOptions`   | removed: no replacement (predefined-filter CRUD removed)                                                                                                |                       |
| `UpdateSegmentData`               | removed: no replacement (segments removed)                                                                                                              |                       |
| `UpsertModerationRuleResponse`    | removed: no replacement (moderation rules CRUD removed)                                                                                                 |                       |
| `UserCustomEvent`                 | removed: no replacement (sendUserCustomEvent removed)                                                                                                   |                       |
| `XiaomiConfig`                    | removed: no replacement (app-settings admin)                                                                                                            |                       |

### Removed: no replacement type (39)

| v9                             | v10                                                                                                                   | verified delta / note |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `AnonUserType`                 | removed: no replacement; was `{}`                                                                                     |                       |
| `ArrayOneOrMore`               | removed: no replacement; use T[]                                                                                      |                       |
| `ArrayTwoOrMore`               | removed: no replacement; use T[]                                                                                      |                       |
| `CallLevelPushPreference`      | removed: no replacement; string (PushPreferencesResponse.call_level)                                                  |                       |
| `ChannelRole`                  | removed: no replacement; unused in v9 signatures                                                                      |                       |
| `ChatLevelPushPreference`      | removed: no replacement; string (PushPreferencesResponse.chat_level / PushPreferenceInput.chat_level)                 |                       |
| `CommandVariants`              | removed: no replacement; string (Command['name'] / Command['set'])                                                    |                       |
| `ConnectionChangeEvent`        | removed: no replacement; connection.changed event removed; client.wsConnection.state / client.networkConnection.state |                       |
| `ContainsOperator`             | removed: no replacement; filters generated per endpoint                                                               |                       |
| `CreatedAtUpdatedAt`           | removed: no replacement                                                                                               |                       |
| `DeleteMessagesOptions`        | removed: no replacement; was alias of MessageDeletionStrategy                                                         |                       |
| `EVENT_MAP`                    | removed: no replacement; event set is the Event union; EventType                                                      |                       |
| `GetMessageOptions`            | removed: no replacement; getMessage no longer sends show_deleted_message                                              |                       |
| `InviteStatus`                 | removed: no replacement; ChannelMemberResponse.status is string                                                       |                       |
| `KnownKeys`                    | removed: no replacement                                                                                               |                       |
| `LiteralStringForUnion`        | removed: no replacement; use string & {}                                                                              |                       |
| `Logger`                       | removed: no replacement; logger option removed; chatLoggerSystem / Sink (see [logging](#logging))                     |                       |
| `ModV2ReviewStatus`            | removed: no replacement                                                                                               |                       |
| `ModerationActionType`         | removed: no replacement; inline per rule, e.g. AutomodRule['action']                                                  |                       |
| `ModerationAction`             | removed: no replacement; ModerationResponse.action is string                                                          |                       |
| `ModerationHarmResponse`       | removed: no replacement; moderation_details removed; ModerationV2Response.text_harms is string[]                      |                       |
| `ModerationSeverity`           | removed: no replacement; string                                                                                       |                       |
| `PartialPollOptionUpdate`      | removed: no replacement; unused in v9 signatures                                                                      |                       |
| `PartializeKeys`               | removed: no replacement; Partial<Pick<T, K>> & Omit<T, K>                                                             |                       |
| `PollPaginationOptions`        | removed: no replacement; unused in v9 signatures                                                                      |                       |
| `PrimitiveFilter`              | removed: no replacement; filters generated per endpoint                                                               |                       |
| `Product`                      | removed: no replacement; runtime enum; use string literals 'chat' etc.                                                |                       |
| `PushNotificationSettings`     | removed: no replacement; UserResponse.push_notifications removed; OwnUserResponse.push_preferences                    |                       |
| `PushPreferenceLevel`          | removed: no replacement; string (ChatPreferences fields are string)                                                   |                       |
| `QueryFilter`                  | removed: no replacement; filters generated per endpoint (Filters / QueryFilters)                                      |                       |
| `QueryPollsParams`             | removed: no replacement; use QueryPollsRequest                                                                        |                       |
| `Readable`                     | removed: no replacement                                                                                               |                       |
| `ReservedUpdatedMessageFields` | removed: no replacement                                                                                               |                       |
| `TaskResponse`                 | removed: no replacement; per-endpoint responses carry task_id (e.g. DeleteChannelsResponse)                           |                       |
| `TeamsRole`                    | removed: no replacement; Record<string, string>                                                                       |                       |
| `TranslatedField`              | removed: no replacement; i18n fields are Record<string, string>                                                       |                       |
| `UR`                           | removed: no replacement; Record<string, unknown>                                                                      |                       |
| `UnknownType`                  | removed: no replacement; Record<string, unknown>                                                                      |                       |
| `Unpacked`                     | removed: no replacement                                                                                               |                       |

<a id="behaviour-index"></a>

## 21. Behaviour changes that still compile

Changes where code written for v9 can type-check (or run untyped) against v10 and behave differently. Each row links to the full entry above.

| Area              | What changes silently                                                                                                                           | Entry                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Packaging         | `StateStore` selector notification edge cases (dropped/added keys, `NaN`)                                                                       | [state-store-semantics](#state-store-semantics)                                   |
| Packaging         | Node 20 `connectUser` rejects without a `webSocketImpl`                                                                                         | [websocket-on-node](#websocket-on-node)                                           |
| Client            | JS calls with a `secret` or flat options run but ignore the options                                                                             | [streamchat-constructor](#streamchat-constructor)                                 |
| Client            | axios config applied once; SDK auth headers always win; no default keep-alive agent                                                             | [axios-instance](#axios-instance)                                                 |
| Client            | `revokeTokens` revokes only the connected user's tokens                                                                                         | [revoke-tokens](#revoke-tokens)                                                   |
| Client            | REST paths under `/api/v2`; `connection_id` only on watching requests                                                                           | [rest-routes](#rest-routes)                                                       |
| Client            | `preventThreadCleanup` is ignored                                                                                                               | [prevent-thread-cleanup](#prevent-thread-cleanup)                                 |
| Client            | `disconnectUser` resets channel lists and disposes every channel, including instances the app still holds                                       | [disconnect-user-teardown](#disconnect-user-teardown)                             |
| Connection        | watching / presence requests wait for (or fail without) a connection id                                                                         | [watch-waits-for-connection-id](#watch-waits-for-connection-id)                   |
| Connection        | connection id is cleared on drop / close                                                                                                        | [connection-id-lifecycle](#connection-id-lifecycle)                               |
| Connection        | reconnect recovery refreshes lists and activated channels only                                                                                  | [connection-recovery](#connection-recovery)                                       |
| Connection        | `connectionRecovery.enabled: false` stops `connection.recovered` on reconnects, `recover()` still works; with an offline DB it fires after sync | [connection-recovery](#connection-recovery)                                       |
| Connection        | WS connect timeout is 15 s even with the long-poll fallback                                                                                     | [long-poll-fallback](#long-poll-fallback)                                         |
| Connection        | `persistUserOnConnectionFailure` keeps the socket retrying                                                                                      | [persist-user-on-connection-failure](#persist-user-on-connection-failure)         |
| Connection        | network status comes from `client.networkConnection` reporters                                                                                  | [websocket-impl-network-status](#websocket-impl-network-status)                   |
| Connection        | WS handshake path and auth frame changed (proxies)                                                                                              | [ws-handshake](#ws-handshake)                                                     |
| Errors            | non-Stream failures are raw axios errors; message text has no prefix                                                                            | [stream-api-error](#stream-api-error)                                             |
| Errors            | `error.client_request_id` is `undefined`                                                                                                        | [stream-api-error](#stream-api-error)                                             |
| Errors            | `TOKEN_EXPIRED` from a token provider retried up to 10 times (about 100 s)                                                                      | [automatic-retries](#automatic-retries)                                           |
| Logging           | default console output at `info` (v9 was silent)                                                                                                | [logging](#logging)                                                               |
| Tokens            | dev tokens with non-ASCII user ids fail                                                                                                         | [dev-token-encoding](#dev-token-encoding)                                         |
| Events            | `connection.changed` / `transport.changed` listeners never fire (untyped code; TypeScript rejects the names)                                    | [connection-changed-removed](#connection-changed-removed)                         |
| Types             | `Role`, `User`, `Reaction`, `PollResponse`, ... imports compile but mean something else                                                         | [same-name-meaning-changes](#same-name-meaning-changes)                           |
| Types             | `new Date(timestampNs)` compiles unless used as a `Date`                                                                                        | [date-constructor-guard](#date-constructor-guard)                                 |
| Types             | `AI_STATE_CHECKING_SOURCES` is now `AI_STATE_EXTERNAL_SOURCES`                                                                                  | [ai-state](#ai-state)                                                             |
| Types             | timestamps are ns numbers: `dayjs(ts)`, `ts > Date.now()`, `!ts` misbehave                                                                      | [timestamp-ns](#timestamp-ns)                                                     |
| Channel           | in-place edits of `channel.data` are not published                                                                                              | [channel-data](#channel-data)                                                     |
| Channel           | `create()` / `query()` mark the channel initialized                                                                                             | [channel-initialized](#channel-initialized)                                       |
| Channel           | channels not `activate()`d are not reloaded on reconnect                                                                                        | [channel-activate-recovery](#channel-activate-recovery)                           |
| Channel           | `watch()` waits for or rejects without a socket                                                                                                 | [channel-watch](#channel-watch)                                                   |
| Channel           | `channel.query()` for older pages no longer writes to the message list                                                                          | [channel-query](#channel-query)                                                   |
| Channel           | default `channel.query()` reports `isLatestMessageSet: false` to `channels.queried` and the offline DB                                          | [channel-query](#channel-query)                                                   |
| Channel           | id-less channels throw synchronously; server-auth bypass gone                                                                                   | [channel-id-guards](#channel-id-guards)                                           |
| Channel           | `queryMembers()` on an id-less (members-only) channel rejects instead of sending `members`                                                      | [channel-query-members](#channel-query-members)                                   |
| Channel           | `markRead()` is now the direct request (reporter path is `markReadViaReporter`)                                                                 | [channel-mark-read](#channel-mark-read)                                           |
| Channel           | `markRead` / `markUnread` throw instead of resolving `null`                                                                                     | [channel-read-events-throw](#channel-read-events-throw)                           |
| Channel           | local unread count needs the channel config flag                                                                                                | [channel-mark-read-locally](#channel-mark-read-locally)                           |
| Channel           | v9 `ChannelConfig` shared keys compile against the new meaning                                                                                  | [channel-config](#channel-config)                                                 |
| Channel           | event handling (hidden, unread, threads, reactions, delivery, truncate, presence) changed                                                       | [channel-event-handling](#channel-event-handling)                                 |
| Channel           | hard `user.messages.deleted` removes messages                                                                                                   | [user-messages-deleted-hard](#user-messages-deleted-hard)                         |
| ChannelState      | in-place mutation of `read` / `members` does not notify                                                                                         | [channel-state-store](#channel-state-store)                                       |
| Channel list      | `registerSubscriptions` is ref-counted                                                                                                          | [channel-manager-register-subscriptions](#channel-manager-register-subscriptions) |
| Channel list      | no promote-to-top; position follows sort                                                                                                        | [channel-list-ordering](#channel-list-ordering)                                   |
| Channel list      | full filter matching; channels can leave lists; unknown channels watched                                                                        | [channel-list-event-routing](#channel-list-event-routing)                         |
| Channel list      | raw query errors; lists reset on logout                                                                                                         | [channel-list-errors](#channel-list-errors)                                       |
| Channel list      | `queryChannels` no longer creates or hydrates channels                                                                                          | [query-channels-hydration](#query-channels-hydration)                             |
| Threads           | threads get events only via `client.threads`                                                                                                    | [thread-event-routing](#thread-event-routing)                                     |
| Threads           | `replyCount` includes soft-deleted replies; parent via message store                                                                            | [thread-state-derivation](#thread-state-derivation)                               |
| Threads           | `state.participants` rebuilt with current-time timestamps and no `custom`                                                                       | [thread-state-derivation](#thread-state-derivation)                               |
| Threads           | staleness driven by channel `watchStatus`                                                                                                       | [thread-staleness](#thread-staleness)                                             |
| Threads           | `reload()` sizing and not-found handling                                                                                                        | [thread-reload](#thread-reload)                                                   |
| Threads           | `unregisterSubscriptions()` disposes the reply paginator                                                                                        | [thread-unregister](#thread-unregister)                                           |
| Threads           | reload on every `connection.recovered`; threads released with their channel                                                                     | [thread-manager-behaviour](#thread-manager-behaviour)                             |
| Polls             | `VotingVisibility.anonymous` is `undefined` in JS                                                                                               | [voting-visibility](#voting-visibility)                                           |
| Polls / reminders | caches always filled on server-side clients                                                                                                     | [poll-reminder-cache](#poll-reminder-cache)                                       |
| Reminders         | `updateConfig` patches dropped on any `client` config change and on reconnect; defaults frozen                                                  | [reminder-config-state](#reminder-config-state)                                   |
| Reminders         | paginator items ordered client-side (`created_at` ascending without `sort`)                                                                     | [reminder-paginator](#reminder-paginator)                                         |
| Live location     | `dispose()` needed to release the manager                                                                                                       | [live-location-dispose](#live-location-dispose)                                   |
| Live location     | locations without `end_at` dropped                                                                                                              | [live-location-requests](#live-location-requests)                                 |
| Cooldown          | timer self-subscribes                                                                                                                           | [cooldown-subscriptions](#cooldown-subscriptions)                                 |
| Delivery          | reporter `markRead` throws when read events are off                                                                                             | [delivery-reporter-mark-read](#delivery-reporter-mark-read)                       |
| Delivery          | `throttledMarkRead` leading edge, errors swallowed                                                                                              | [throttled-mark-read](#throttled-mark-read)                                       |
| Search            | channel search results are unwatched                                                                                                            | [channel-search-source-unwatched](#channel-search-source-unwatched)               |
| Search            | message search channels unwatched; `channelQuerySort` ignored                                                                                   | [message-search-source-hydration](#message-search-source-hydration)               |
| Pagination        | items deduped and comparator-ordered                                                                                                            | [paginator-items](#paginator-items)                                               |
| Notifications     | client re-derives the manager config on any `client.*` change and on reconnect, replacing `updateConfig` patches                                | [notification-manager-config](#notification-manager-config)                       |
| Offline           | channel guard writes first                                                                                                                      | [offline-channel-guard](#offline-channel-guard)                                   |
| Offline           | only ephemeral failures queued                                                                                                                  | [offline-queue-policy](#offline-queue-policy)                                     |
| Offline           | edits fold into queued sends                                                                                                                    | [offline-update-fold](#offline-update-fold)                                       |
| Offline           | v9 pending tasks replay with wrong arguments (custom `AbstractOfflineDB`; RN's schema bump drops them)                                          | [pending-task-payloads](#pending-task-payloads)                                   |
| Composer          | server flags (`uploads`, `polls`, `url_enrichment`, `max_message_length`) restrict config                                                       | [composer-server-restrictions](#composer-server-restrictions)                     |
| Composer          | config objects frozen; writes throw                                                                                                             | [composer-config-frozen](#composer-config-frozen)                                 |
| Composer          | `updateConfig` patches retained; setters always write                                                                                           | [composer-update-config](#composer-update-config)                                 |
| Composer          | `compose()` uses `undefined`, ns timestamps, `cid`                                                                                              | [composer-compose-output](#composer-compose-output)                               |
| Composer          | drafts skipped for provisional channels                                                                                                         | [composer-drafts](#composer-drafts)                                               |
| Composer          | link previews enabled by default                                                                                                                | [link-previews-default](#link-previews-default)                                   |
| Composer          | upload metadata under `custom`; identity guards read `custom.mime_type`                                                                         | [composer-upload-metadata](#composer-upload-metadata)                             |
| Composer          | custom `doUploadRequest` needs `customCdn: true` to skip permission checks                                                                      | [composer-upload-gating](#composer-upload-gating)                                 |
| Composer          | default upload throws without a file URL                                                                                                        | [composer-default-upload](#composer-default-upload)                               |
| Utilities         | `formatMessage` memoized, no `Date` conversion                                                                                                  | [format-message](#format-message)                                                 |
| Utilities         | `logChatPromiseExecution` logs through `chatLoggerSystem`                                                                                       | [log-chat-promise-execution](#log-chat-promise-execution)                         |

<a id="internal-surface"></a>

## 22. Internal surface touched

Members that are `_`-prefixed, `@internal` or `@private`, or reachable only by deep import. Listed briefly for SDK maintainers; integrators should not depend on them.

| v9 internal                                                                                                                                                                                                                                  | v10                                                                                                                                                                                                                                         | Entry                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StreamChat._setupConnection`, `_sayHi` (warmUp `GET /hi`), `_logApiRequest`, `_logApiResponse`, `_logApiError`, `_enrichAxiosOptions`, `_getToken`, `_cacheEnabled`, `_normalizeDate`, `errorFromResponse`, `handleResponse`                | removed. Nearest equivalents: `client.api.populateRequestConfigWithDefaults(config)`, `client.api._getToken()` / `client.tokenManager.getToken()`, logging via the `api-client` logger scope, `StreamAPIError` created inside `ApiClient`   | [stream-api-error](#stream-api-error)                                                                                                                                                                                                                                           |
| `Channel._channelURL()` (`{baseURL}/channels/{type}/{id}`)                                                                                                                                                                                   | removed, no replacement (routes are `/api/v2/chat/channels/{type}/{id}/...`)                                                                                                                                                                | [rest-routes](#rest-routes)                                                                                                                                                                                                                                                     |
| `Channel._callChannelListeners: (event: Event) => void`                                                                                                                                                                                      | `(event: WSEvent) => void`                                                                                                                                                                                                                  | [event-union](#event-union)                                                                                                                                                                                                                                                     |
| `Channel._initializeState(state: ChannelAPIResponse, messageSet?)` -> `{ messageSet, filteredMessageIds }`                                                                                                                                   | `_initializeState(state: ChannelStateResponseFields): void` (no message seeding; membership replaced only when present). SDKs calling it must seed messages through `messagePaginator.seedFirstPageSync` (or call `client.hydrateChannels`) | [message-paginator](#message-paginator)                                                                                                                                                                                                                                         |
| `Channel._extendEventWithOwnReactions(event: Event)`                                                                                                                                                                                         | takes `EventPayload<'message.deleted' \| 'message.updated' \| 'message.undeleted'>`                                                                                                                                                         | [channel-event-handling](#channel-event-handling)                                                                                                                                                                                                                               |
| `Channel.push_preferences?: ChannelPushPreference`                                                                                                                                                                                           | `ChannelPushPreferencesResponse`                                                                                                                                                                                                            | [type-rename-table](#type-rename-table)                                                                                                                                                                                                                                         |
| (none)                                                                                                                                                                                                                                       | new internal `Channel._checkHasId`, `_setOwnUnreadCount`, `_syncMuteStatus`, `isQueryingChannel`                                                                                                                                            | [channel-id-guards](#channel-id-guards)                                                                                                                                                                                                                                         |
| `Channel._data`                                                                                                                                                                                                                              | `ChannelInput`                                                                                                                                                                                                                              | [channel-data](#channel-data)                                                                                                                                                                                                                                                   |
| `Channel._sendMessage`, `_sendReaction`, `_deleteReaction`, `_update`                                                                                                                                                                        | removed                                                                                                                                                                                                                                     | [channel-send-message](#channel-send-message), [channel-send-reaction](#channel-send-reaction), [channel-update](#channel-update)                                                                                                                                               |
| `Channel._createDraft`, `_deleteDraft`                                                                                                                                                                                                       | request-object shapes                                                                                                                                                                                                                       | [channel-drafts](#channel-drafts)                                                                                                                                                                                                                                               |
| `client._updateMessage`, `_deleteMessage`, `_unblockMessage`, `_queryFlags`, `_queryFlagReports`, `_reviewFlagReport`, `_createImport*`, `_getImport`, `_listImports`, `_buildWSPayload`, `_isUsingServerAuth`, `_messageComposerSetupState` | removed                                                                                                                                                                                                                                     | [update-delete-message-raw](#update-delete-message-raw), [server-only-methods-removed](#server-only-methods-removed), [ws-handshake](#ws-handshake), [server-side-auth-removed](#server-side-auth-removed), [message-composer-setup-function](#message-composer-setup-function) |
| `ChannelState` underscore message helpers                                                                                                                                                                                                    | removed with the message list                                                                                                                                                                                                               | [message-paginator](#message-paginator)                                                                                                                                                                                                                                         |
| `SearchController._internalState`                                                                                                                                                                                                            | removed                                                                                                                                                                                                                                     | [search-controller-internal-state](#search-controller-internal-state)                                                                                                                                                                                                           |
| `UploadManager.upload` result type                                                                                                                                                                                                           | `MinimumUploadRequestResult`                                                                                                                                                                                                                | [query-channels-response-with-channels](#query-channels-response-with-channels)                                                                                                                                                                                                 |
| `client.channelServerConfigs`, `client.channelManager.channelStore`, `wsConnection.connection` / `.fallback`                                                                                                                                 | new `@internal` members                                                                                                                                                                                                                     | [active-channels](#active-channels), [ws-connection](#ws-connection)                                                                                                                                                                                                            |
| Composer `applyServerRestrictions`, `transferTo`, `takeOver`                                                                                                                                                                                 | new `@internal` members                                                                                                                                                                                                                     | [composer-class-members](#composer-class-members)                                                                                                                                                                                                                               |
| `utils.ts` helpers (`getAndWatchChannel`, pinned/archived helpers, `mergeWithCore` rewrite)                                                                                                                                                  | removed or rewritten (deep imports only)                                                                                                                                                                                                    | [promote-channel](#promote-channel)                                                                                                                                                                                                                                             |

<a id="open-questions"></a>

## 23. Open questions / unverified

Claims the source cannot settle; verify against the live API or the target package before relying on them in docs.

1. `@stream-io/node-sdk` method names for the removed server-only `StreamChat` methods and removed `Moderation` methods were not verified ([server-only methods](#server-only-methods-removed), [moderation removed](#moderation-removed-methods)).
2. Whether the API still honours `pending`, `pending_message_metadata`, `force_moderation`, `is_pending_message` when sent untyped on `sendMessage` ([sendMessage](#channel-send-message), [option types](#option-types)).
3. Server outcome of replaying v9-persisted `send-message` / `create-draft` pending tasks (bare message as request body; likely an InputError that deletes the task) ([pending tasks](#pending-task-payloads)).
4. TypeScript older than 5.5 was not tested against the v10 declarations ([TS requirements](#typescript-requirements)).
5. Whether the API still accepts old top-level custom filter keys (`{ color: 'green' }` instead of `{ 'custom.color': 'green' }`) ([filters](#filter-types)).
6. Whether the API accepts nanosecond `created_at_*` bounds on `QueryMembersPayload`, `QueryBannedUsersPayload`, `QueryFutureChannelBansPayload`, which are typed `TimestampNS` while every other request date is `Date` ([request dates](#request-dates)).
7. That `updateReminder({ message_id })` (no `remind_at`) clears the due date server-side is asserted by a docs snippet test against the live API, not run for this report ([reminder methods](#reminder-methods)).
