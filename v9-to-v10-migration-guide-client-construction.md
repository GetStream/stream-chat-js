# v9 → v10 Migration Guide — Client Construction

> Scope: this guide covers **only** changes to `StreamChat` construction (`new StreamChat(...)` and `StreamChat.getInstance(...)`) and the shape of `StreamChatOptions`. Other v10 changes will be documented separately.

## TL;DR

- `secret` is gone. The constructor and `getInstance` no longer accept it. **v10 does not support server-side use.**
- The constructor and `getInstance` are now a single signature: `(key, options?)`. The `(key, secret, options?)` overload has been removed.
- `StreamChatOptions` no longer extends `AxiosRequestConfig`. Axios-level fields (`timeout`, `httpsAgent`, `withCredentials`, headers, etc.) must now be passed via the dedicated `axiosRequestConfig` property.
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
new StreamChat(API_KEY, options);
```

Same change applies to `StreamChat.getInstance`:

```ts
// v9
StreamChat.getInstance(API_KEY, 'a-secret', { timeout: 5000 });

// v10
StreamChat.getInstance(API_KEY, { axiosRequestConfig: { timeout: 5000 } });
```

### Removed: `client.secret`

The `secret` field on the client instance no longer exists. The internal `_isUsingServerAuth()` method has also been removed; any guard that branched on it should be deleted (the branch was always the server-side path).

## `StreamChatOptions` no longer extends `AxiosRequestConfig`

In v9, `StreamChatOptions = AxiosRequestConfig & { ... }`. That meant you could pass axios fields directly at the top level:

```ts
// v9
new StreamChat(API_KEY, {
  timeout: 5000,
  withCredentials: true,
  httpsAgent: customAgent,
  headers: { 'Cache-Control': 'no-cache' },
});
```

In v10, axios fields must go through the dedicated `axiosRequestConfig` property:

```ts
// v10
new StreamChat(API_KEY, {
  axiosRequestConfig: {
    timeout: 5000,
    withCredentials: true,
    httpsAgent: customAgent,
    headers: { 'Cache-Control': 'no-cache' },
  },
});
```

The full mapping for top-level axios fields previously accepted in v9 → `axiosRequestConfig.<same-key>` in v10.

### `axiosRequestConfig` now actually configures the axios instance

In v9, `axiosRequestConfig` was stored on `client.options` but **not** applied to `axios.create` during construction — it was only spread into per-request calls. As a result, defaults like `timeout: 3000` could not be overridden through it.

In v10, `axiosRequestConfig` is spread into the `axios.create` call during construction, so it can override the baked-in defaults:

```ts
const client = new StreamChat(API_KEY, {
  axiosRequestConfig: { timeout: 9999, withCredentials: true },
});
client.axiosInstance.defaults.timeout; // 9999
client.axiosInstance.defaults.withCredentials; // true
```

The defaults (`timeout: 3000`, `withCredentials: false`) still apply when `axiosRequestConfig` does not set them.

### `httpsAgent` location moved

```ts
// v9 — top-level
new StreamChat(API_KEY, { browser: false, httpsAgent: customAgent });

// v10 — under axiosRequestConfig
new StreamChat(API_KEY, {
  browser: false,
  axiosRequestConfig: { httpsAgent: customAgent },
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
  axiosRequestConfig: {
    httpsAgent: new https.Agent({ keepAlive: true, keepAliveMsecs: 3000 }),
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

Two options were dropped in v10. Both are silent no-ops if left in place — TypeScript will flag
them, but a plain-JS call site will not error, so remove them explicitly.

| Option             | Replacement                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`           | Call [`client.createDevice({ id, push_provider, push_provider_name? })`](./v9-to-v10-migration-guide-methods.md#clientsetlocaldevice) after connecting. |
| `enableWSFallback` | None — see [long-poll fallback removed](./v9-to-v10-migration-guide-other.md#long-poll-fallback-removed).                                               |

```diff
  const client = new StreamChat(API_KEY, {
-   device: { id: pushToken, push_provider: 'firebase' },
-   enableWSFallback: true,
  });
+ await client.createDevice({ id: pushToken, push_provider: 'firebase' });
```

`device` existed to have the device serialized into the WebSocket connect payload, where the
server registered it as a side effect of connecting. The v2 connect endpoint's auth message has
no `device` field, so the option had no remaining effect. It was undocumented and unused by every
Stream SDK, so most integrations are unaffected. `client.setLocalDevice()`, the setter for this
option, was removed with it.

## Unchanged behavior worth confirming

These are intentionally listed so agents don't "fix" them during migration:

- `new StreamChat(key)` still works with no options.
- `StreamChat.getInstance(key)` still returns the same cached instance on repeated calls and ignores the `key`/`options` of subsequent calls.
- All remaining non-axios options are unchanged: `allowServerSideConnect`, `baseURL`, `browser`, `disableCache`, `enableInsights`, `notifications`, `persistUserOnConnectionFailure`, `recoverStateOnReconnect`, `warmUp`, `wsConnection`, `wsUrlParams`. One option is **new**: `WebSocketImpl?: typeof WebSocket`, which overrides the constructor `StableWSConnection` instantiates. It exists because v10 dropped the `isomorphic-ws` / `ws` dependency in favor of the platform's global `WebSocket`; it is meant for test doubles, and for node runtimes older than 22 that have no global `WebSocket` — see [`v9-to-v10-migration-guide-server-side.md`](./v9-to-v10-migration-guide-server-side.md#running-the-ws-client-under-node). Browser and React-Native apps should leave it unset.
- `STREAM_LOCAL_TEST_RUN` / `STREAM_LOCAL_TEST_HOST` env-var overrides on `baseURL` still work the same way.
- `browser` auto-detection (`typeof window !== 'undefined'`) and the `browser: true | false` override still work the same way.
- The subsystem managers constructed on the client (`state`, `notifications`, `uploadManager`, `moderation`, `tokenManager`, `threads`, `polls`, `reminders`, `messageDeliveryReporter`, `messageComposerCache`, `insightMetrics`) are identical in v10.

## Mechanical migration recipe

1. If the call site passes a secret, **stop** — migrate that code to `stream-node` instead.
2. Remove any `secret` argument and any `undefined`/`''` placeholders in the second slot:
   - `new StreamChat(key, undefined, opts)` → `new StreamChat(key, opts)`
   - `new StreamChat(key, '', opts)` → `new StreamChat(key, opts)`
   - `StreamChat.getInstance(key, undefined, opts)` → `StreamChat.getInstance(key, opts)`
3. For each option key in the `options` object, check whether it's an axios field (`timeout`, `withCredentials`, `httpsAgent`, `headers`, `adapter`, `proxy`, `responseType`, etc. — anything from `AxiosRequestConfig`). If yes, move it under a new `axiosRequestConfig` sub-object.
4. Remove any reads of `client.secret` and any branches gated on `client._isUsingServerAuth()`.
5. Drop any custom `paramsSerializer` you were passing — it has no effect in v10.
6. If the client runs under node and you depended on HTTP keep-alive, add `axiosRequestConfig.httpsAgent` explicitly — v10 no longer creates one for you.
