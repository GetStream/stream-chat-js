# v9 → v10 Migration Guide — Client Construction

> Scope: this guide covers **only** changes to `StreamChat` construction (`new StreamChat(...)` and `StreamChat.getInstance(...)`) and what the second argument is. Other v10 changes will be documented separately.

## TL;DR

- `secret` is gone. The constructor and `getInstance` no longer accept it. **v10 does not support server-side use.**
- The constructor and `getInstance` are now a single signature: `(key, config?)`. The `(key, secret, options?)` overload has been removed.
- **There is no options object any more.** `StreamChatOptions` is removed, and the second argument is the declarative configuration tree itself — `DeepPartial<InstanceConfigTree>`, the same thing `client.config.set()` takes. Each former option became a field of the tree, the argument itself, or was removed: see [`StreamChatOptions` became the configuration tree](#streamchatoptions-became-the-configuration-tree). `client.options` is gone too.
- Axios-level fields (`timeout`, `httpsAgent`, `withCredentials`, headers, etc.) are passed through `client.axiosRequestConfig`.
- The remaining axios defaults (`timeout: 3000`, `withCredentials: false`) are still applied, but in v10 they can be overridden through `axiosRequestConfig`. In v9 they could not be — `axiosRequestConfig` only affected per-request calls.
- **The implicit keep-alive `httpsAgent` in node is gone.** v9 created an `https.Agent({ keepAlive: true, keepAliveMsecs: 3000 })` whenever node was detected; v10 no longer imports `node:https` at all. If you relied on connection reuse, pass your own agent — see [`httpsAgent` is no longer defaulted in node](#httpsagent-is-no-longer-defaulted-in-node).
- `paramsSerializer` cannot be overridden. Any `paramsSerializer` passed in `axiosRequestConfig` is ignored; the client always uses its internal `axiosParamsSerializer`.

## Server-side users — stop here

v10 removes all server-side functionality (secret-based auth, server-side JWT signing, etc.). If your integration uses `stream-chat` with a `secret` on a backend, **do not migrate to v10**. Switch to the dedicated server SDK:

- https://github.com/GetStream/stream-node

For client-side / React Native / browser apps that previously called `new StreamChat(key)` without a secret, keep reading.

## Constructor signature

### Removed: the `secret` parameter and its overload

```ts
// v9 — all of these worked
new StreamChat(API_KEY);
new StreamChat(API_KEY, 'a-secret');
new StreamChat(API_KEY, { timeout: 5000 });
new StreamChat(API_KEY, 'a-secret', { timeout: 5000 });
new StreamChat(API_KEY, undefined, { timeout: 5000 });
new StreamChat(API_KEY, ''); // empty string was treated as "no secret"
```

```ts
// v10 — only this shape is valid
new StreamChat(API_KEY);
new StreamChat(API_KEY, config);
```

Same change applies to `StreamChat.getInstance`:

```ts
// v9
StreamChat.getInstance(API_KEY, 'a-secret', { timeout: 5000 });

// v10
StreamChat.getInstance(API_KEY, { client: { axiosRequestConfig: { timeout: 5000 } } });
```

### Removed: `client.secret`

The `secret` field on the client instance no longer exists. The internal `_isUsingServerAuth()` method has also been removed; any guard that branched on it should be deleted (the branch was always the server-side path).

## `StreamChatOptions` became the configuration tree

`StreamChatOptions` is removed, and so is `client.options`. The constructor's and `getInstance`'s second argument is now the declarative configuration tree itself (`DeepPartial<InstanceConfigTree>`) — the same thing `client.config.set()` takes. Every v9 option went to one of three places: a field of the tree, the argument itself, or nowhere (removed).

| v9 option (`StreamChatOptions`)                                       | v10                                                                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `config` (added in v10 release candidates)                            | **The argument itself.** Drop the `config` wrapper.                                                                                         |
| `allowServerSideConnect`                                              | `client.allowServerSideConnect`                                                                                                             |
| `axiosRequestConfig`                                                  | `client.axiosRequestConfig`                                                                                                                 |
| Axios fields at the top level (`timeout`, `httpsAgent`, `headers`, …) | `client.axiosRequestConfig.<same key>` — see [below](#axios-fields-moved-to-axiosrequestconfig)                                             |
| `baseURL`                                                             | `client.baseURL`                                                                                                                            |
| `browser`                                                             | `client.browser`                                                                                                                            |
| `notifications` (a `NotificationManager` instance)                    | `client.notificationManager`                                                                                                                |
| `persistUserOnConnectionFailure`                                      | `client.persistUserOnConnectionFailure`                                                                                                     |
| `recoverStateOnReconnect`                                             | `client.connectionRecovery.enabled`                                                                                                         |
| `enableWSFallback`                                                    | `client.wsConnection.enableWSFallback` — see [long-poll fallback](./v9-to-v10-migration-guide-other.md#long-poll-fallback-enablewsfallback) |
| `WebSocketImpl` (added in v10 release candidates)                     | `client.wsConnection.webSocketImpl`                                                                                                         |
| `wsUrlParams`                                                         | `client.wsConnection.urlParams`                                                                                                             |
| `wsConnection`                                                        | `client.wsConnection.connection`                                                                                                            |
| `isLocalUnreadCountEnabled`                                           | `channel.readEvents.localUnreadCountEnabled`                                                                                                |
| `device`, `disableCache`, `enableInsights`, `warmUp`, `logger`        | **Removed** — see [Removed options](#removed-options)                                                                                       |

```diff
- new StreamChat(API_KEY, {
-   allowServerSideConnect: true,
-   baseURL: 'https://chat-proxy-dublin.stream-io-api.com',
-   timeout: 5000,
-   recoverStateOnReconnect: false,
-   isLocalUnreadCountEnabled: true,
- });
+ new StreamChat(API_KEY, {
+   client: {
+     allowServerSideConnect: true,
+     baseURL: 'https://chat-proxy-dublin.stream-io-api.com',
+     axiosRequestConfig: { timeout: 5000 },
+     connectionRecovery: { enabled: false },
+     wsConnection: { enableWSFallback: true },
+   },
+   channel: { readEvents: { localUnreadCountEnabled: true } },
+ });
```

How soon each field is applied differs, because some are consumed while the client is built:

| Field                                                                       | Applied                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `client.baseURL`, `client.axiosRequestConfig`, `client.notificationManager` | at construction (`axiosRequestConfig.headers` / `params` are also read on every request) |
| `client.browser`                                                            | live, through the `client.browser` / `client.node` getters                               |
| `client.persistUserOnConnectionFailure`                                     | when a connect fails                                                                     |
| `client.allowServerSideConnect`                                             | on every connect                                                                         |
| `client.wsConnection.*`                                                     | when the socket is built, so before `connectUser()`                                      |
| everything else                                                             | live                                                                                     |

Things that behave differently from an option:

- **Fields applied "at construction" are read once.** Registering one later through `client.config.set()` logs a warning and has no effect on the existing client, the same as every other construction-only path. `client.setBaseURL()` remains the way to change the base URL at runtime. `browser` and `persistUserOnConnectionFailure` are read when needed, so registering them later works.
- **The fields are gone from the client.** `client.persistUserOnConnectionFailure` no longer exists as a field, so assigning it does nothing in v10 — call `client.config.setConfig('client', { persistUserOnConnectionFailure })` instead. `client.browser` and `client.node` are now read-only getters that resolve from the configuration (falling back to the `window` check), so assigning to them throws in strict mode; register `client.browser` instead.
- **The configuration is copied.** The tree copies what you register, so keeping a reference to the `axiosRequestConfig` object you passed and mutating it afterwards no longer reaches the client, and `client.axiosRequestConfig === yourObject` no longer holds. Register a new value with `client.config.setConfig('client', { axiosRequestConfig })` instead — keeping in mind the instance-building fields above are read at construction. Class instances (a `NotificationManager`, an `https.Agent`) are passed through by reference.
- **A supplied `NotificationManager` keeps the configuration it was built with.** `new NotificationManager({ durations: { error: 5000 } })` wins, field by field, over `client.notifications.durations` in the tree, and the tree fills in the rest. This also holds after `client.config.reset()`.
- **`client.config.reset()` does not undo construction-only fields.** `client.baseURL` and the manager the client already holds stay as they were built.

## Axios fields moved to `axiosRequestConfig`

In v9, the options type was `AxiosRequestConfig & { ... }`. That meant you could pass axios fields directly at the top level:

```ts
// v9
new StreamChat(API_KEY, {
  timeout: 5000,
  withCredentials: true,
  httpsAgent: customAgent,
  headers: { 'Cache-Control': 'no-cache' },
});
```

In v10, axios fields must go through `client.axiosRequestConfig`:

```ts
// v10
new StreamChat(API_KEY, {
  client: {
    axiosRequestConfig: {
      timeout: 5000,
      withCredentials: true,
      httpsAgent: customAgent,
      headers: { 'Cache-Control': 'no-cache' },
    },
  },
});
```

The full mapping for top-level axios fields previously accepted in v9 → `axiosRequestConfig.<same-key>` in v10.

### `axiosRequestConfig` now actually configures the axios instance

In v9, `axiosRequestConfig` was stored on `client.options` (removed in v10) but **not** applied to `axios.create` during construction — it was only spread into per-request calls. As a result, defaults like `timeout: 3000` could not be overridden through it.

In v10, `axiosRequestConfig` is spread into the `axios.create` call during construction, so it can override the baked-in defaults:

```ts
const client = new StreamChat(API_KEY, {
  client: { axiosRequestConfig: { timeout: 9999, withCredentials: true } },
});
client.axiosInstance.defaults.timeout; // 9999
client.axiosInstance.defaults.withCredentials; // true
```

The defaults (`timeout: 3000`, `withCredentials: false`) still apply when `axiosRequestConfig` does not set them.

### `httpsAgent` location moved

```ts
// v9 — top-level
new StreamChat(API_KEY, { browser: false, httpsAgent: customAgent });

// v10 — under client.axiosRequestConfig
new StreamChat(API_KEY, {
  client: { browser: false, axiosRequestConfig: { httpsAgent: customAgent } },
});
```

### `httpsAgent` is no longer defaulted in node

In v9, node mode (`browser: false` or auto-detected) auto-created a keep-alive agent when none was supplied:

```ts
// v9 / v10-rc — removed from src/client.ts
httpsAgent: this.node
  ? new https.Agent({ keepAlive: true, keepAliveMsecs: 3000 })
  : undefined,
```

v10 drops the `node:https` import along with the rest of the server-side surface, so axios falls back to Node's default agent — **a fresh TCP connection and TLS handshake per request**. Browser mode is unaffected (it never had an agent).

Most client-side integrations do not care. If you run `stream-chat` under node — a bot, a worker, an SSR process, a test suite that makes many sequential requests — and want the old behavior back, supply the agent yourself:

```ts
import https from 'node:https';

new StreamChat(API_KEY, {
  client: {
    axiosRequestConfig: {
      httpsAgent: new https.Agent({ keepAlive: true, keepAliveMsecs: 3000 }),
    },
  },
});
```

### `paramsSerializer` is fixed

Any `paramsSerializer` passed via `axiosRequestConfig` is silently dropped. The client always uses its internal `axiosParamsSerializer`:

```ts
const client = new StreamChat(API_KEY, {
  axiosRequestConfig: { paramsSerializer: () => 'overridden' },
});
client.axiosInstance.defaults.paramsSerializer; // === axiosParamsSerializer (NOT the override)
```

If you relied on a custom serializer, file an issue — there is no supported way to change this in v10.

### Removed options

Five options were dropped in v10. All are silent no-ops if left in place — TypeScript will flag
them, but a plain-JS call site will not error, so remove them explicitly.

| Option           | Replacement                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`         | Call [`client.createDevice({ id, push_provider, push_provider_name? })`](./v9-to-v10-migration-guide-methods.md#clientsetlocaldevice) after connecting. |
| `disableCache`   | None — the client always caches. See [`disableCache`](#disablecache).                                                                                   |
| `enableInsights` | None — the telemetry it enabled was removed. See [`enableInsights`](#enableinsights).                                                                   |
| `logger`         | `chatLoggerSystem.configureLoggers(...)`. See the [logging guide](./v9-to-v10-migration-guide-logging.md).                                              |
| `warmUp`         | None — see [`warmUp`](#warmup).                                                                                                                         |

```diff
  const client = new StreamChat(API_KEY, {
-   device: { id: pushToken, push_provider: 'firebase' },
-   disableCache: true,
-   enableInsights: true,
-   logger: myLogger,
-   warmUp: true,
  });
+ await client.createDevice({ id: pushToken, push_provider: 'firebase' });
```

#### `device`

`device` existed to have the device serialized into the WebSocket connect payload, where the
server registered it as a side effect of connecting. The v2 connect endpoint's auth message has
no `device` field, so the option had no remaining effect. It was undocumented and unused by every
Stream SDK, so most integrations are unaffected. `client.setLocalDevice()`, the setter for this
option, was removed with it.

#### `disableCache`

`disableCache` suppressed every client-side cache write — `activeChannels`, the channel config
cache, `ClientState.users`, `PollManager.pollCache` and `ReminderManager`. It existed for
integrations that used `stream-chat` as a stateless server-side REST wrapper.

**In v9 it did nothing unless you also passed a `secret`.** The guard read
`_cacheEnabled = () => !this._isUsingServerAuth() || !this.options.disableCache`, and
`_isUsingServerAuth()` was `!!this.secret` — so for any client-side integration the option was
already a no-op. v10 removes server-side support entirely, so the only configuration in which it
ever took effect is gone; those integrations belong on
[stream-node](https://github.com/GetStream/stream-node).

There is no replacement. `client._cacheEnabled()` was removed along with it.

#### `enableInsights`

Off by default, this opted into WebSocket-health telemetry POSTed to
`https://chat-insights.getstream.io` — `ws_fatal`, `ws_success_after_failure` and
`http_hi_failed`. v10 removes the telemetry entirely: `src/insights.ts` is deleted, along with
the `InsightMetrics`, `postInsights`, `buildWsFatalInsight` and `buildWsSuccessAfterFailureInsight`
exports and the `client.insightMetrics` property.

If you imported any of those directly, drop the import — there is no replacement. Note that the
insight payload included the connected user's auth token and user details, so removing it also
removes that egress.

#### `warmUp`

Off by default, `warmUp` fired a fire-and-forget `GET /hi` before opening the WebSocket so the
first real API call could reuse an already-established connection.

Under node its benefit depended on the keep-alive `https.Agent` the v9 constructor created, which
v10 [no longer creates](#httpsagent-is-no-longer-defaulted-in-node) — without keep-alive the
warmed socket closes and the next request handshakes again. In the browser it saved at most one
connection setup on a cold start. The `/hi` request is no longer issued at all.

If you want the node behavior back, supply a keep-alive agent through
`axiosRequestConfig.httpsAgent` rather than reaching for a warm-up request.

## Unchanged behavior worth confirming

These are intentionally listed so agents don't "fix" them during migration:

- `new StreamChat(key)` still works with no configuration.
- `StreamChat.getInstance(key)` still returns the same cached instance on repeated calls and ignores the `key`/`config` of subsequent calls.
- The former options keep their meaning; only their address changed — see [`StreamChatOptions` became the configuration tree](#streamchatoptions-became-the-configuration-tree).
- `STREAM_LOCAL_TEST_RUN` / `STREAM_LOCAL_TEST_HOST` env-var overrides on `client.baseURL` still work the same way.
- `browser` auto-detection (`typeof window !== 'undefined'`) and the `client.browser: true | false` override still work the same way.
- The subsystem managers constructed on the client (`state`, `notifications`, `uploadManager`, `moderation`, `tokenManager`, `threads`, `polls`, `reminders`, `messageDeliveryReporter`, `messageComposerCache`) are identical in v10. `insightMetrics` is **gone** — see [`enableInsights`](#enableinsights) — and one manager is **new**: `connectionIdManager`, which holds the WebSocket connection id and lets requests that watch or subscribe to presence await one (see [watching a channel now requires a connected user](./v9-to-v10-migration-guide-other.md#watching-a-channel-now-requires-a-connected-user)).

## Mechanical migration recipe

1. If the call site passes a secret, **stop** — migrate that code to `stream-node` instead.
2. Remove any `secret` argument and any `undefined`/`''` placeholders in the second slot:
   - `new StreamChat(key, undefined, opts)` → `new StreamChat(key, config)`
   - `new StreamChat(key, '', opts)` → `new StreamChat(key, config)`
   - `StreamChat.getInstance(key, undefined, opts)` → `StreamChat.getInstance(key, config)`
3. For each option key, check whether it's an axios field (`timeout`, `withCredentials`, `httpsAgent`, `headers`, `adapter`, `proxy`, `responseType`, etc. — anything from `AxiosRequestConfig`). If yes, move it under `client.axiosRequestConfig`. Then move every other option to its new place using [the mapping table](#streamchatoptions-became-the-configuration-tree) — most go under `client`, but `recoverStateOnReconnect` and `isLocalUnreadCountEnabled` do not — and unwrap `config`, whose contents become the argument.
4. Remove any reads of `client.secret` and any branches gated on `client._isUsingServerAuth()`.
5. Drop any custom `paramsSerializer` you were passing — it has no effect in v10.
6. If the client runs under node and you depended on HTTP keep-alive, add `client.axiosRequestConfig.httpsAgent` explicitly — v10 no longer creates one for you.
