# Logging

Logging is configured through `chatLoggerSystem`, a process-wide singleton exported from the
package root. There is **no** `logger` client option — `new StreamChat(key, { logger: fn })` was a
v9 API and no longer exists.

Configure it before constructing the client:

```ts
import { chatLoggerSystem, LogLevelEnum } from 'stream-chat';

chatLoggerSystem.configureLoggers({
  level: 'info',
  sink: (logLevel, message, ...data) => {
    console.log(message, ...data); // or any logging tool you use, e.g. reactotron
  },
});
```

Levels are `'trace' | 'debug' | 'info' | 'warn' | 'error'`, defaulting to `'info'`. The default sink
writes to the matching `console` method.

Each internal module logs under a scope, so levels and sinks can be set per scope — `api-client`,
`channel`, `channel-manager`, `client`, `connection`, `instance-configuration`, `message-composer`,
`offline-db`, `state-store`, `text-composer`, `thread`, `thread-manager`, `token-manager`,
`upload-manager`, `utils`. Messages also carry tags added via `withExtraTags(...)`, which name the
method that emitted them.

For the full surface — per-scope configuration, the `Sink` / `LogLevel` / `ConfigureLoggersOptions`
types, and the mapping from every v9 logging API to its v10 replacement — see
[`v9-to-v10-migration-guide-logging.md`](../v9-to-v10-migration-guide-logging.md).
