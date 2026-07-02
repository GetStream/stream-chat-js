# v9 → v10 Migration Guide — Logging

> Scope: this guide covers **only** the logging system replacement — the removal of the v9 `logger` option / `client.logger()` / `_log()` surface, and the introduction of the scoped `@stream-io/logger`-based system exposed as `chatLoggerSystem`. Construction, method-signature, and sort changes are covered in separate guides.

## TL;DR

- The `logger` option on `StreamChatOptions` is **removed**. `new StreamChat(key, { logger: fn })` no longer type-checks — the field is silently dropped at runtime.
- The `client.logger` field is **removed**. Any `client.logger('info', 'msg', extra)` call no longer compiles.
- The v9 `Logger` and `LogLevel` types (from `stream-chat`) are **removed**. Import their replacements from `stream-chat`'s new logger surface (re-exported from `./logger`): `LogLevel`, `Sink`, `ConfigureLoggersOptions`, `LogLevelEnum`, `ScopedLogger`, `ChatLoggerScope`, `chatLoggerSystem`.
- Log-level enum expanded from **3** values (`'info' | 'warn' | 'error'`) to **5** (`'trace' | 'debug' | 'info' | 'warn' | 'error'`).
- Configure logging by calling `chatLoggerSystem.configureLoggers({...})` **before** constructing the client (there is no constructor option for it — `logLevel` / `logOptions` fields do not exist on `StreamChatOptions`).
- Internal `_log()` methods (notably on `StableWSConnection`) are gone. If you subclassed or spied on them, switch to the scoped loggers.

## What ships in v10

```ts
// src/logger.ts — re-exported from the package root
import {
  chatLoggerSystem,          // LoggerSystem<ChatLoggerScope>
  LogLevelEnum,              // numeric enum: trace=0 debug=1 info=2 warn=3 error=4
  type ChatLoggerScope,      // union of the 15 built-in scopes (see table below)
  type ConfigureLoggersOptions,
  type LogLevel,             // 'trace' | 'debug' | 'info' | 'warn' | 'error'
  type Sink,                 // (logLevel, message, ...data) => void
  type ScopedLogger,         // = Logger<ChatLoggerScope>
} from 'stream-chat';
```

`chatLoggerSystem` is a **module-level singleton**. It is created once when `./logger` is imported and is shared across every `StreamChat` instance (and across every SDK internal caller). Configuration is process-wide, not per-client.

The default sink writes to `console.{trace,debug,info,warn,error}` (with a React-Native-safe fallback for `warn`/`error`). Default level is `'info'`.

### Built-in scopes

Every internal module attaches to one of these scopes via `chatLoggerSystem.getLogger('<scope>')`:

| Scope                 | Emitted by                                                |
| --------------------- | --------------------------------------------------------- |
| `api-client`          | `src/api-client.ts` — HTTP request/response tracing       |
| `channel`             | `src/channel.ts`                                          |
| `channel-manager`     | `src/channel_manager.ts`                                  |
| `client`              | `src/client.ts` — connection lifecycle, event dispatch    |
| `connection`          | `src/connection.ts` — primary WS transport                |
| `connection-fallback` | `src/connection_fallback.ts` — long-poll transport        |
| `message-composer`    | `src/messageComposer/messageComposer.ts`                  |
| `offline-db`          | `src/offline-support/*` **and** offline-DB paths in `client.ts` / `channel.ts` / `messageComposer.ts` |
| `state-store`         | reserved — declared in the scope union, not yet emitted   |
| `text-composer`       | `src/messageComposer/middleware/textComposer/*`           |
| `thread`              | `src/thread.ts`                                           |
| `thread-manager`      | `src/thread_manager.ts`                                   |
| `token-manager`       | `src/token_manager.ts`                                    |
| `upload-manager`      | `src/uploadManager.ts`                                    |
| `utils`               | `src/utils.ts` — `logChatPromiseExecution`, `isOnline`, `messageSetPagination`, `runDetached` |

Unknown scope names fall through to `'default'`. The `ChatLoggerScope` union narrows autocomplete but is not enforced at runtime.

## Removed surface

| v9                                                                                                | v10                                                                                    |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `StreamChatOptions.logger`                                                                        | **REMOVED** — no field on `StreamChatOptions`                                          |
| `client.logger` (instance field)                                                                  | **REMOVED**                                                                            |
| `type Logger = (level, message, extra?) => void`                                                  | **REMOVED** — no direct replacement (write a `Sink` instead)                           |
| `type LogLevel = 'info' \| 'error' \| 'warn'`                                                     | **REPLACED** — same name, now `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error'`      |
| `isFunction(inputOptions.logger)` guard in constructor                                            | gone                                                                                   |
| `StableWSConnection._log(msg, extra?, level?)`                                                    | **REMOVED** — use `chatLoggerSystem.getLogger('connection')`                           |
| `extraData.tags: string[]` convention (`{ tags: ['channel', 'offlineDb'], error }`)               | replaced by scope + `.withExtraTags(...)` (see below)                                  |
| Structured extra as second positional arg (`(level, msg, { tags, error, event })`)               | passed as rest args after the message (`.error('msg', { error })`)                     |

## The v9 → v10 shape shift

### v9 — a single `logger` function receives everything

```ts
// v9
type LogLevel = 'info' | 'error' | 'warn';
type Logger = (
  logLevel: LogLevel,
  message: string,
  extraData?: Record<string, unknown>,
) => void;

const client = new StreamChat('api_key', {
  logger: (level, message, extraData) => {
    // extraData contains a `tags: string[]` array plus arbitrary context
    console.log(level, message, extraData);
  },
});

client.logger('info', 'anything I want to log', {
  tags: ['channel', 'offlineDb'],
  error: someError,
});
```

The SDK routed *all* internal log calls into this single function; disambiguation was done via the `extraData.tags` array (values like `'api'`, `'api_request'`, `'api_response'`, `'client'`, `'channel'`, `'connection'`, `'event'`).

### v10 — scoped loggers with per-scope sinks and levels

```ts
// v10 — configure the shared logger system before creating the client
import { chatLoggerSystem, type Sink } from 'stream-chat';

const sink: Sink = (logLevel, message, ...rest) => {
  // `message` is prefixed with `[<scope>](<tags>): ` by the system
  // `rest` is whatever the SDK passes after the message (e.g. `{ error }`)
  myLogger[logLevel](message, ...rest);
};

chatLoggerSystem.configureLoggers({
  default: { level: 'info', sink },
});

const client = new StreamChat('api_key');
```

SDK-internal call sites look like this (do not call these yourself unless you're extending the SDK):

```ts
const logger = chatLoggerSystem.getLogger('connection');
logger.withExtraTags('_reconnect').info('Initiating a reconnect.');
// → sink receives: 'warn' | 'info' | ... , '[connection](_reconnect): Initiating a reconnect.', ...rest
```

## Configuring logging in v10

There is **no constructor option** for logging in v10 (an earlier commit briefly added `logLevel` / `logOptions` to `StreamChatOptions`; both were dropped before release — do not rely on them). Configure `chatLoggerSystem` directly. Because it is a module-level singleton, configuration applies to every `StreamChat` you construct afterwards.

### Route all output to your own logger

```ts
import { chatLoggerSystem, type Sink } from 'stream-chat';

const sink: Sink = (level, message, ...rest) => myLogger[level](message, ...rest);

chatLoggerSystem.configureLoggers({
  default: { level: 'info', sink },
});
```

### Raise the level globally (silence everything below `warn`)

```ts
chatLoggerSystem.configureLoggers({ default: { level: 'warn' } });
```

### Debug one subsystem without touching the others

```ts
chatLoggerSystem.configureLoggers({
  connection: { level: 'trace' },
  'connection-fallback': { level: 'trace' },
});
// leaves `default` and every other scope at 'info'
```

### Reset one scope back to defaults, or reset everything

```ts
chatLoggerSystem.configureLoggers({
  connection: { level: null, sink: null }, // remove per-scope overrides
});

chatLoggerSystem.restoreDefaults(); // wipe all overrides, restore default sink + 'info'
```

### `configureLoggers` semantics you must know

- Passing `{ level: 'warn' }` sets the level. Passing `{ level: null }` **deletes** the override (falls back to `'default'`). Same for `sink`.
- The `default` scope can be overridden but **cannot be deleted** — `{ default: { level: null } }` is a no-op.
- Undefined values are ignored — only explicit `null` clears an override.
- Configuration is not additive across calls to `configureLoggers` for the *same* key — the last call wins per (scope, field). Untouched scopes keep their prior override.
- `chatLoggerSystem` is process-wide. Two `StreamChat` instances in the same process share it; there is no per-instance override.

### Sink signature

```ts
type Sink = (logLevel: LogLevel, message: string, ...data: any[]) => void;
```

- `logLevel` is the string form (`'trace' | 'debug' | 'info' | 'warn' | 'error'`), not the enum.
- `message` arrives already prefixed by the system with `[<scope>](<comma-separated-tags>): ` (tags parenthetical is omitted when empty).
- `...data` is whatever the SDK passed after the message (e.g. `{ error }`, `{ event }`, `{ wsURL }`).
- Use `LogLevelEnum` to compare severity numerically: `LogLevelEnum[record.logLevel] >= LogLevelEnum.warn`.

## Mechanical migration recipe

For every call site:

1. **Delete the `logger` option** from `new StreamChat(key, options)` and `StreamChat.getInstance(key, options)`. If you were forwarding to your own logger, replace it with a top-level `chatLoggerSystem.configureLoggers({ default: { sink: yourSink } })` call (once, at bootstrap).
2. **Rewrite `client.logger(level, message, extra)` calls.** If it was your own instrumentation code, drop it — the SDK's internal call sites already log through `chatLoggerSystem`. If you must emit into the same stream, use `chatLoggerSystem.getLogger('<scope>')[level](message, extra)`.
3. **Remove any reads of `client.logger`.** Tests and integrations that asserted on `client.logger` being a function must be deleted or rewritten against `chatLoggerSystem`. See the `client.construction-old.test.ts` block in this branch for a concrete v9 example that must be dropped.
4. **Delete the `logger` field from `StreamChatOptions` type-satisfaction sites.** If you had `const opts: StreamChatOptions = { logger, timeout: 5000 }`, drop `logger`.
5. **Replace `import type { Logger } from 'stream-chat'`.** Write a `Sink` instead:
   ```ts
   // v9
   import type { Logger } from 'stream-chat';
   const myLogger: Logger = (level, msg, extra) => { … };

   // v10
   import { type Sink } from 'stream-chat';
   const mySink: Sink = (level, msg, ...rest) => { … };
   ```
6. **Update `LogLevel` consumers.** If your code was `switch(level) { case 'info': … case 'warn': … case 'error': … }`, add `case 'trace':` and `case 'debug':` (or let them fall through to a default branch). Any exhaustive union check on `LogLevel` will now fail without those cases.
7. **Drop the `tags` array convention.** In v9, extras looked like `{ tags: ['channel', 'offlineDb'], error }`. In v10, the scope already carries the primary category (`offline-db`, `channel`, …) and `.withExtraTags('sendMessage', channelCid)` adds call-site tags — you don't reconstruct them by hand. When translating an internal callsite, pick the scope that matches the module and use `.withExtraTags(...)` for the finer-grained context.
8. **Remove `_log()` calls in any code that subclassed SDK internals.** Every `_log(msg, extra?, level?)` in v9 mapped to `this.client.logger(level ?? 'info', '<prefix>:' + msg, { tags: […], ...extra })`. Replace with the appropriate scoped logger. Example (from `StableWSConnection`):
   ```ts
   // v9
   this._log(`connect() - established with healthcheck ${hc}`);

   // v10
   const logger = chatLoggerSystem.getLogger('connection');
   logger.withExtraTags('connect').info(`Established a WebSocket connection. Health check: ${hc}.`);
   ```

## Type-import mapping cheat sheet

| v9 import from `stream-chat`                    | v10 replacement                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Logger`                                        | REMOVED — write a `Sink` instead                                                                                   |
| `LogLevel`                                      | still exported (same name), but the union is now 5 values, not 3                                                   |
| —                                               | `Sink` — new. Sink function signature.                                                                             |
| —                                               | `LogLevelEnum` — new. Numeric enum, useful for severity comparisons in sinks.                                      |
| —                                               | `ConfigureLoggersOptions<ChatLoggerScope>` — new. Argument shape for `chatLoggerSystem.configureLoggers`.          |
| —                                               | `ChatLoggerScope` — new. String union of the 15 built-in scopes.                                                   |
| —                                               | `ScopedLogger` — new. Alias for `Logger<ChatLoggerScope>` (the return type of `chatLoggerSystem.getLogger(scope)`). |
| —                                               | `chatLoggerSystem` — new. The shared `LoggerSystem<ChatLoggerScope>` singleton.                                    |

## Things that did NOT change

- The categories of information the SDK logs (WS lifecycle, event dispatch, API request/response, offline-DB failures, upload errors, composer state) are unchanged in v10 — only the transport and the shape of the record.
- No log call is now silent-by-default that was noisy in v9 within the shared 3-level range; several v9 `.info` calls became `.debug` (e.g. `client.on/off` listener attach/detach, `openConnection` already-connecting guard). If you rely on those, lower the level to `'debug'` for that scope.
- The default sink still writes to the `console`. No behavior change for callers that never installed a custom `logger` in v9 — they now see richer output (with the `[scope](tags):` prefix), but the surface is still `console`.
- Log messages are not part of the semver contract. Do not pattern-match on message strings in production; use `logLevel` + `scope` (via the `[scope]` prefix) instead.
