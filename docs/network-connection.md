# Network connection

Suppose you want to show "You're offline" when the device loses its network.

There is a `connection.changed` event, and it carries an `online` boolean, so the obvious thing is to
render off that. It is also the wrong thing, and this page exists mostly to explain why.

## Three separate facts

| Fact                      | The question it answers                            | Where to read it                 |
| ------------------------- | -------------------------------------------------- | -------------------------------- |
| **Device network status** | Does this device have a network right now?         | `client.networkConnection`       |
| **WebSocket status**      | Is our WebSocket up and holding a connection ID?   | `client.wsConnection`            |
| **Recovery finished**     | Have we re-queried and re-watched after reconnect? | the `connection.recovered` event |

They are genuinely different, and they disagree in both directions. A socket dies on a perfectly good
network — a server close, an expired token, a health-check timeout. A device goes offline while the
socket has not noticed yet and keeps looking healthy for up to 35 seconds. Conflating them is what
makes an app blame the network for a dead socket.

So:

- **"You're offline"** is `client.networkConnection`.
- **"Reconnecting…"**, or hiding the composer, is `client.wsConnection`.
- **"Refetch what's on screen"** is `connection.recovered`.

## Telling the SDK about the network

The SDK cannot work out the device's network status by itself. Every platform reports it differently —
the browser has `window.addEventListener('online' | 'offline')` and `navigator.onLine`, React Native
has `@react-native-community/netinfo`, a Node process has neither — so it has to be told.

You tell it by supplying one function: a **registrar** that installs a platform listener and returns an
unsubscribe.

```ts
import type { NetworkStatusListenerRegistrar } from 'stream-chat';

const registrar: NetworkStatusListenerRegistrar = (onStatusChange) => {
  // Report the current status right away, then on every change.
  onStatusChange(navigator.onLine);

  const handle = () => onStatusChange(navigator.onLine);
  window.addEventListener('online', handle);
  window.addEventListener('offline', handle);

  return () => {
    window.removeEventListener('online', handle);
    window.removeEventListener('offline', handle);
  };
};

client.config.set({
  client: { networkConnection: { statusListenerRegistrar: registrar } },
});
```

**In a browser you do not need to do this.** That exact registrar is installed for you when
`window.addEventListener` exists and `navigator.onLine` is a boolean. Supply your own only to replace
it.

Everywhere else, nothing is installed and the status stays **unknown** until you supply one.

### React Native

```ts
import NetInfo from '@react-native-community/netinfo';
import type { NetworkStatusListenerRegistrar } from 'stream-chat';

const netInfoRegistrar: NetworkStatusListenerRegistrar = (onStatusChange) => {
  // `addEventListener` fires once with the current state on subscribe, so this covers the required
  // initial report as well as every change.
  return NetInfo.addEventListener((state) => {
    onStatusChange(Boolean(state.isConnected));
  });
};

client.config.set({
  client: { networkConnection: { statusListenerRegistrar: netInfoRegistrar } },
});
```

### If you have no listener to register

Some hosts have no event to subscribe to, only a value you learn about some other way. Push it
directly:

```ts
client.networkConnection.setStatus(false);
```

This is also the supported replacement for the old trick of synthesizing a DOM event and passing it to
`client.wsConnection.onlineStatusChanged(...)`. That method still exists and is deprecated.

### The registrar contract

- It **must** report the current status as soon as it is known — synchronously if the platform allows
  (`navigator.onLine`), after an await if it does not (`NetInfo.fetch()`) — and again on every change.
- It returns a function that removes the listener. The SDK calls it when the registrar is replaced and
  on teardown.
- Installing the same function reference twice is a no-op, so re-applying configuration will not churn
  a native listener.
- If it throws, the status stays unknown and the SDK logs a warning rather than failing to construct.

## Reading it

```ts
client.networkConnection.isOnline; // boolean | undefined
client.networkConnection.state.getLatestValue();
// { isOnline: boolean | undefined, lastOnlineAt: Date | null, lastOfflineAt: Date | null }

const unsubscribe = client.networkConnection.state.subscribeWithSelector(
  ({ isOnline }) => ({ isOnline }),
  ({ isOnline }) => {
    if (isOnline === false) showOfflineBanner();
    else hideOfflineBanner();
  },
);
```

`subscribe` fires immediately with the current value, so there is no separate "read it once first"
step.

### `undefined` means unknown, and you must handle it

`isOnline` has **three** states, not two. `undefined` means nobody has told us — no registrar is
installed, or one is installed and has not reported yet.

```ts
if (client.networkConnection.isOnline === false) {
  // Definitely offline. Safe to say so.
}

if (!client.networkConnection.isOnline) {
  // WRONG: also true when the answer is unknown, so this claims "offline" on
  // any host without a registrar — React Native before you install one, Node, SSR.
}
```

The SDK deliberately does not fabricate `true` here. A made-up value is worse than an absent one,
because nothing downstream can tell it apart from a real reading.

**Never gate a request on it.** Network status is an accelerator, not a precondition: it lets the SDK
notice a drop sooner than its own 35-second connection check would. Everything works with the status
unknown, and nothing in the SDK requires it.

## The WebSocket

```ts
client.wsConnection.isOnline; // boolean — always known, a socket always has a state
client.wsConnection.connectionID; // string | undefined
client.wsConnection.state.getLatestValue();
// { isOnline: boolean, connectionId: string | undefined,
//   lastOnlineAt: Date | null, lastOfflineAt: Date | null }
```

Two things about this store are worth knowing.

**It reports paths the event does not.** `connection.changed` is not dispatched by `disconnect()` —
which is what `client.closeConnection()` calls, the documented mobile backgrounding path — nor by two
internal error paths. The store is written on every transition, so subscribe to it if you need the
truth rather than the announcement.

**It publishes a drop immediately; the event waits five seconds.** The delay stops a brief flap from
strobing a "connection lost" banner, and the announcement is dropped entirely if the socket returns
inside the window. If you want the drop without the wait, use the store.

**`connectionID` is never cleared.** It is assigned on a successful connect and left alone afterwards,
so a value there means "connected at some point", not "connected now". Read `isOnline` for the latter.

### Timing and transport settings

```ts
client.config.set({
  client: {
    wsConnection: {
      connectTimeoutMs: 15000, // how long connect() waits for the server's hello
      pingIntervalMs: 25000, // how often a health-check ping goes out — 25s is also the maximum
      healthCheckGracePeriodMs: 10000, // extra room before the socket is declared dead
      webSocketImpl: WebSocket, // for hosts with no usable global
      urlParams: new URLSearchParams({}), // extra query parameters on the WebSocket URL
    },
  },
});
```

`pingIntervalMs` can only be **lowered**: 25 seconds is both the default and the maximum, because a
slower ping risks the connection being closed for idleness. A higher value is clamped back with a
warning. Lowering it makes a dead socket noticed sooner, since the connection check moves with it
(it fires at `pingIntervalMs + healthCheckGracePeriodMs`).

## The events

```ts
client.on('connection.changed', (event) => {
  if (event.connection === 'network') {
    // event.online is the DEVICE's network
  } else {
    // event.connection === 'ws' — event.online is OUR SOCKET, on a possibly fine network
  }
});

client.on('connection.recovered', (event) => {
  // event.connection === 'ws' — channel lists, active channels and threads have been reloaded
  refetchWhateverElseIsOnScreen();
});
```

> **The `online` field alone does not tell you what went offline.** Both events carry a `connection`
> discriminator precisely because `online` is ambiguous without it. A handler that ignores
> `connection` and renders "you are offline" off `online` will say the device lost its network every
> time the socket drops on a working one. That mistake is the reason this whole surface exists — check
> `connection` first.

`connection.recovered` currently only ever reports `'ws'`. Do not wait for a `'network'` recovery;
none is dispatched.

## Migration

| Before                                                        | Now                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `client.wsConnection.onlineStatusChanged(fakeDomEvent)`       | `client.networkConnection.setStatus(isOnline)`                                 |
| reading `connection.changed`'s `online` as the device network | `client.networkConnection.isOnline`, or check `event.connection === 'network'` |
| `client.wsConnection.isHealthy`                               | `client.wsConnection.isOnline`                                                 |
| `client.threads.state.lastConnectionDropAt`                   | `client.wsConnection.state.lastOfflineAt`                                      |
| `client.defaultWSTimeout = 5000`                              | `client.config.set({ client: { wsConnection: { connectTimeoutMs: 5000 } } })`  |
| `new StreamChat(key, { WebSocketImpl, wsUrlParams })`         | `wsConnection` config: `webSocketImpl`, `urlParams`                            |

`utils.ts` also had an internal `isOnline()` helper and an `addConnectionEventListeners()` pair. None
was exported from the package, so there is nothing to migrate — they are gone, and
`client.networkConnection` replaces what they were for.
