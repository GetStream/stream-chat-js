# Network connection

Suppose you want to show "You're offline" when the device loses its network.

There is one `isOnline` on the WebSocket and another on the network, so the obvious thing is to render
off whichever you reach first. That is the wrong thing, and this page exists mostly to explain why.

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

You tell it by supplying one function: a **reporter** that installs a platform listener and returns an
unsubscribe.

```ts
import type { NetworkStatusReporter } from 'stream-chat';

const reporter: NetworkStatusReporter = (onStatusChange) => {
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
  client: { networkConnection: { statusReporter: reporter } },
});
```

You can also install one imperatively, which React Native needs because its native handlers are
registered after the client exists:

```ts
client.networkConnection.setStatusReporter(reporter);
```

Either survives a later `client.config.set`, and whichever was set last wins.

**In a browser you do not need to do this.** That exact reporter is installed for you when
`window.addEventListener` exists and `navigator.onLine` is a boolean. Supply your own only to replace
it.

### Everywhere else, install one — and read this if you do not

A host that cannot answer the question gets a stand-in that **mirrors this client's WebSocket**, so an
integration that forgets the setup has a signal rather than nothing at all.

It is a safety net, not a measurement, and it has one consequence you must know about. Under it, the
device's status is the socket's status, so `isOnline === false` whenever the socket dies **for its own
reasons** — a server close, an expired token, a health-check timeout — on a perfectly good network.
Every "you're offline" rule on this page is written for a real reporter; under the stand-in, that rule
fires for a dead socket too.

The stand-in also reports nothing until the socket has been up once, so a client that has never
connected still answers `undefined`.

Installing a real reporter is what makes the network signal independent of the socket, which is the
entire point of having two. On React Native that means the snippet below.

### React Native

```ts
import NetInfo from '@react-native-community/netinfo';
import type { NetworkStatusReporter } from 'stream-chat';

const netInfoReporter: NetworkStatusReporter = (onStatusChange) => {
  // `addEventListener` fires once with the current state on subscribe, so this covers the required
  // initial report as well as every change.
  return NetInfo.addEventListener((state) => {
    onStatusChange(Boolean(state.isConnected));
  });
};

client.config.set({
  client: { networkConnection: { statusReporter: netInfoReporter } },
});
```

### If you have no listener to install

Some hosts have no event to subscribe to, only a value you learn about some other way. Push it
directly:

```ts
client.networkConnection.setStatus(false);
```

This is also the supported replacement for the old trick of synthesizing a DOM event and passing it to
`client.wsConnection.onlineStatusChanged(...)`. That method still exists and is deprecated.

### The reporter contract

- It **must** report the current status as soon as it is known — synchronously if the platform allows
  (`navigator.onLine`), after an await if it does not (`NetInfo.fetch()`) — and again on every change.
- It returns a function that removes the listener. The SDK calls it when the reporter is replaced and
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

`isOnline` has **three** states, not two. `undefined` means nobody has told us yet: the reporter has
not reported, or the stand-in is in use and the socket has never been up.

```ts
if (client.networkConnection.isOnline === false) {
  // Definitely offline. Safe to say so.
}

if (!client.networkConnection.isOnline) {
  // WRONG: also true when the answer is unknown, which is every client that has
  // not connected yet — an offline app launch, a server-side render, a test.
}
```

The SDK deliberately does not fabricate `true` here. A made-up value is worse than an absent one,
because nothing downstream can tell it apart from a real reading.

**Never gate a request on it.** Network status is an accelerator, not a precondition: it lets the SDK
notice a drop sooner than its own 35-second connection check would. Everything works with the status
unknown, and nothing in the SDK requires it.

## The WebSocket

```ts
client.wsConnection.isHealthy; // boolean — always known, a socket always has a state
client.wsConnection.state.getLatestValue();
// { isHealthy: boolean, lastHealthyAt: Date | null, lastUnhealthyAt: Date | null }
```

Two things about this store are worth knowing.

**It records every transition**, including `disconnect()` — what `client.closeConnection()` calls, the
documented mobile backgrounding path — and the socket's internal error paths. There is nothing it
stays silent about.

**It publishes a drop the moment it happens.** That is one transition you should not render
immediately: the socket retries on its own and most drops resolve in well under a second, so showing
them all makes a working application look broken. Hold a drop for
`offlineNotificationDisplayDelayMs`, cancel the wait if the socket returns inside it, and show coming
back without delay.

**The connection id is not here.** It lives on `client.connectionIdManager`, which the request layer
awaits for anything that watches a channel or subscribes to presence — so those requests ride out a
reconnect instead of going out keyed to a connection the server has closed. You rarely need to read
it; `client.connectionIdManager.connectionId` is there if you do.

### Timing and transport settings

```ts
client.config.set({
  client: {
    wsConnection: {
      connectTimeoutMs: 15000, // how long connect() waits for the server's hello
      pingIntervalMs: 25000, // how often a health-check ping goes out — 25s is also the maximum
      healthCheckGracePeriodMs: 10000, // extra room before the socket is declared dead
      offlineNotificationDisplayDelayMs: 5000, // how long a UI holds a drop before reporting it
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

## The one event

There is exactly one, and it reports that a recovery finished rather than that a status changed.
Status is what the two stores are for.

```ts
client.on('connection.recovered', () => {
  // Channel lists, active channels and threads have been reloaded.
  refetchWhateverElseIsOnScreen();
});
```

There is no `connection.changed`. Connectivity used to be published twice, as the stores and as that
event, and the two disagreed: the event was silent on `closeConnection()` and two error paths, and
held a drop for five seconds. Subscribe to whichever store you mean instead.

## Migration

| Before                                                      | Now                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `client.wsConnection.onlineStatusChanged(fakeDomEvent)`     | `client.networkConnection.setStatus(isOnline)`                                |
| `client.on('connection.changed', …)`                        | `client.wsConnection.state` or `client.networkConnection.state`, subscribed   |
| `connection.recovered`'s `connection` field                 | gone; the event reports the socket and carries no payload                     |
| `NetworkStatusListenerRegistrar`, `statusListenerRegistrar` | `NetworkStatusReporter`, `statusReporter`                                     |
| `client.threads.state.lastConnectionDropAt`                 | `client.wsConnection.state.lastUnhealthyAt`                                   |
| `client.defaultWSTimeout = 5000`                            | `client.config.set({ client: { wsConnection: { connectTimeoutMs: 5000 } } })` |
| `new StreamChat(key, { WebSocketImpl, wsUrlParams })`       | `wsConnection` config: `webSocketImpl`, `urlParams`                           |

`utils.ts` also had an internal `isOnline()` helper and an `addConnectionEventListeners()` pair. None
was exported from the package, so there is nothing to migrate — they are gone, and
`client.networkConnection` replaces what they were for.
