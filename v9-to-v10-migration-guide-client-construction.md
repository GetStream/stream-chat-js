# v9 → v10 Migration Guide — Client Construction

> Scope: this guide covers **only** changes to `StreamChat` construction (`new StreamChat(...)` and `StreamChat.getInstance(...)`) and the shape of `StreamChatOptions`. Other v10 changes will be documented separately.

## TL;DR

- `secret` is gone. The constructor and `getInstance` no longer accept it. **v10 does not support server-side use.**
- The constructor and `getInstance` are now a single signature: `(key, options?)`. The `(key, secret, options?)` overload has been removed.
- `StreamChatOptions` no longer extends `AxiosRequestConfig`. Axios-level fields (`timeout`, `httpsAgent`, `withCredentials`, headers, etc.) must now be passed via the dedicated `axiosRequestConfig` property.
- The same axios defaults (`timeout: 3000`, `withCredentials: false`, keep-alive `httpsAgent` in node) are still applied, but in v10 they can be overridden through `axiosRequestConfig`. In v9 they could not be — `axiosRequestConfig` only affected per-request calls.
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
client.axiosInstance.defaults.timeout;         // 9999
client.axiosInstance.defaults.withCredentials; // true
```

The defaults (`timeout: 3000`, `withCredentials: false`, keep-alive `https.Agent` in node) still apply when `axiosRequestConfig` does not set them.

### `httpsAgent` location moved

```ts
// v9 — top-level
new StreamChat(API_KEY, { browser: false, httpsAgent: customAgent });

// v10 — under axiosRequestConfig
new StreamChat(API_KEY, { browser: false, axiosRequestConfig: { httpsAgent: customAgent } });
```

In both versions, node mode (`browser: false` or auto-detected) auto-creates a keep-alive `https.Agent` when none is supplied. Browser mode does not.

### `paramsSerializer` is fixed

Any `paramsSerializer` passed via `axiosRequestConfig` is silently dropped. The client always uses its internal `axiosParamsSerializer`:

```ts
const client = new StreamChat(API_KEY, {
  axiosRequestConfig: { paramsSerializer: () => 'overridden' },
});
client.axiosInstance.defaults.paramsSerializer; // === axiosParamsSerializer (NOT the override)
```

If you relied on a custom serializer, file an issue — there is no supported way to change this in v10.

## Unchanged behavior worth confirming

These are intentionally listed so agents don't "fix" them during migration:

- `new StreamChat(key)` still works with no options.
- `StreamChat.getInstance(key)` still returns the same cached instance on repeated calls and ignores the `key`/`options` of subsequent calls.
- All non-axios options are unchanged: `allowServerSideConnect`, `baseURL`, `browser`, `device`, `disableCache`, `enableInsights`, `enableWSFallback`, `notifications`, `persistUserOnConnectionFailure`, `recoverStateOnReconnect`, `warmUp`, `wsConnection`, `wsUrlParams`.
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
