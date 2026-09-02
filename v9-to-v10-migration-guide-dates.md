# v9 → v10 Migration Guide — Dates Are Unix-Nanosecond Numbers

> Scope: this guide covers the one change that touches **every** response and event type in the
> package — server-sent dates are now the unix-**nanosecond** `number` the API puts on the wire,
> rather than `Date` objects. It also covers the SDK state types that carry those values, the request
> fields that did **not** change, and the ways this breaks without a compile error.
>
> Sibling guides:
>
> - `v9-to-v10-migration-guide-client-construction.md` (constructor & options)
> - `v9-to-v10-migration-guide-logging.md` (`chatLoggerSystem`, sinks, scopes)
> - `v9-to-v10-migration-guide-methods.md` (per-method signatures)
> - `v9-to-v10-migration-guide-sort.md` (`SortParamRequest[]` shape)
> - `v9-to-v10-migration-guide-server-side.md` (server-side surface removal)
> - `v9-to-v10-migration-guide-type-renames.md` (hand-rolled type aliases → generated names)
> - `v9-to-v10-migration-guide-i18n.md` (notification identity, the `stream-chat/i18n` subpath)
> - `v9-to-v10-migration-guide-other.md` (everything else)

## TL;DR

- **Every server-sent date is a unix-nanosecond `number`.** `created_at`, `updated_at`, `deleted_at`,
  `last_read`, `last_active`, `last_message_at`, `remind_at`, `pinned_at`, `end_at`, `archived_at`,
  `expires` — on every response type, every `WSEvent` member, and the SDK state stores that mirror
  them. Not a `Date`, not an ISO string. In v9 these were typed `string`; in the early v10 RCs they
  were decoded to `Date`. Both are gone: there is no decoder layer any more.
- **Outgoing request date fields are still `Date`.** So a response value can no longer be assigned to
  a request field — the one thing that _was_ safe in v9, when both sides were `string`. The compiler
  catches this.
- **Three things break with no compile error**: every `Date`-based path is out of range, so
  `new Date(ns)` and `dayjs(ns)` are both an `Invalid Date`; a millisecond/nanosecond mix-up between
  two `number`s produces a plausible wrong answer and no complaint; and `0` is now a legitimate
  timestamp, so `if (!created_at)` is wrong.
- **`t('timestamp.X', { timestamp })` is not type-checked** — i18next's interpolation bag is untyped,
  so a raw nanosecond number reaches the formatter and renders the literal text `Invalid Date` into
  your UI. See
  [Rendering timestamps](#rendering-timestamps-the-one-path-the-compiler-does-not-guard).
- **Filter operands changed meaning**: a bare `number` in a filter is now read as nanoseconds, not
  milliseconds.
- Convert with the helpers the package now exports: `convertTimestampToDate` (guarded), `nsToDate`,
  `nsToMs`, `msToNs`, `nowNs`, `dateToNs`, `nsToRfc3339`, `NS_PER_MS`.

---

## Why the numbers, and what they are

The API has always sent timestamps as nanoseconds since the unix epoch. v9 typed them `string`; the
first v10 RCs generated a per-model decoder layer that turned them into `Date` objects on the way in.
The client is now generated with `--opt response_dates_as_number`, which types them as what the wire
actually carries, and `src/gen/model-decoders/` is no longer emitted at all. Frames arrive and are
used as-is.

A current timestamp looks like `1786219962651957000`.

### The two failure modes

**Every `Date`-based path is out of range.** `Date` tops out at ±8.64e15 ms (ECMA-262 `TimeClip`,
about ±273,790 years). A nanosecond timestamp is ~1.79e18, so it does not fit — and a date library
reads a bare number as milliseconds, which lands in exactly the same place rather than somewhere
plausible.

```ts
new Date(message.created_at); // Invalid Date
new Date(message.created_at).toISOString(); // RangeError: Invalid time value
dayjs(message.created_at).isValid(); // false
dayjs(message.created_at).format(); // 'Invalid Date' — the literal string
```

Neither is a type error, and the two surface differently: `.toISOString()` **throws**, usually
mid-render in a component that had no reason to expect it, while dayjs's `.format()` quietly returns
the string `'Invalid Date'` and renders it on screen. So this mistake is loud in a `RangeError` stack
trace and near-silent in a formatted timestamp — do not rely on noticing it either way.

**A unit mix-up between two `number`s is the genuinely silent one.** Because nanoseconds are out of
`Date`'s range, that mistake at least announces itself. Comparing a wire timestamp against
`Date.now()`, adding a millisecond duration to one, or passing epoch milliseconds where nanoseconds
are expected all produce a plausible-looking number and no complaint at all:

```ts
// Compiles, runs, and is wrong by a factor of a million.
if (mute.expires > Date.now()) { … } // every expiry looks ~56 million years away
```

The rest of this guide is organised around that: the conversions are mechanical, and the places
worth auditing are the ones where two numbers meet.

### Precision

Nanosecond epoch values exceed `Number.MAX_SAFE_INTEGER` (~9.01e15), so a `double` cannot hold every
one of them: at this magnitude the representable values are 256 ns apart. `JSON.parse` has already
quantised the value before your code sees it.

What this means in practice:

- **Ordering and comparison are unaffected.** Two distinct instants more than 256 ns apart compare
  correctly, which is every instant a chat application distinguishes.
- **Exact equality against a value that has round-tripped through JSON is not guaranteed.** Do not
  build an equality filter on a nanosecond timestamp you sent and read back.
- **`nsToMs` floors.** `nsToMs(msToNs(ms))` can land one millisecond early, because `msToNs` may
  round down by up to 128 ns and `Math.floor` then crosses the millisecond boundary. Milliseconds are
  the unit of display and of `setTimeout`, so this is cosmetic — but do not treat the ms↔ns round trip
  as an identity.

---

## The helpers

All exported from the package root.

| Helper                        | Signature                                         | Use for                                                                  |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `convertTimestampToDate(ts?)` | `number \| null \| undefined → Date \| undefined` | The default. Guarded: `undefined` for an absent or non-finite value.     |
| `nsToDate(ns)`                | `number → Date`                                   | A value known to be present.                                             |
| `nsToMs(ns)`                  | `number → number`                                 | Epoch milliseconds, for arithmetic against `Date.now()`.                 |
| `msToNs(ms)`                  | `number → number`                                 | Milliseconds back into the wire unit.                                    |
| `nowNs()`                     | `() → number`                                     | The local clock as a wire timestamp, for optimistic writes.              |
| `dateToNs(date)`              | `Date → number`                                   | A `Date` into the wire unit.                                             |
| `nsToRfc3339(ns)`             | `number → string`                                 | A nanosecond-precision RFC3339 string, when milliseconds are not enough. |
| `NS_PER_MS`                   | `1e6`                                             | The conversion constant, if you need it directly.                        |

**Prefer `convertTimestampToDate` at the boundary where a wire number becomes something a date
library or a UI prop consumes.** Many timestamps are optional in practice even where the generated
type marks them required, and the guard is the whole point: an absent or `NaN` value returns
`undefined` instead of producing an `Invalid Date` that throws further along.

```ts
import { convertTimestampToDate } from 'stream-chat';

const createdAt = convertTimestampToDate(message.created_at);
if (!createdAt) return null; // nothing renderable
```

Do not cast the `undefined` away, and do not paper over it with `new Date()` — that labels a
months-old message "Today".

```ts
// WRONG — launders `undefined` into a required `Date`.
convertTimestampToDate(message.created_at) as Date;
// WRONG — invents "now".
convertTimestampToDate(message.created_at) ?? new Date();
```

### Comparison and arithmetic

Compare and sort the raw numbers. Do not round-trip through `Date`.

```ts
// v9 / early v10 RC
if (new Date(a.created_at).getTime() < new Date(b.created_at).getTime()) { … }
messages.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

// v10
if (a.created_at < b.created_at) { … }
messages.sort((a, b) => a.created_at - b.created_at);
```

For a **duration**, subtract in nanoseconds and convert **once**. Durations, intervals and delays stay
in milliseconds throughout the SDK, because that is what `setTimeout` and every "time left" value
speak. Converting each operand separately is how a rounding error becomes a visible one.

```ts
// Time since a message, in seconds.
const secondsAgo = nsToMs(nowNs() - message.created_at) / 1000;

// Delay until a live location expires.
setTimeout(stop, Math.max(0, nsToMs(location.end_at - nowNs())));
```

The mirror-image mistake is comparing a wire timestamp against `Date.now()` directly. Both are
numbers, so nothing warns, and every wire timestamp looks about 56 million years in the future.

```ts
// WRONG
if (mute.expires > Date.now()) { … }
// RIGHT
if (mute.expires > nowNs()) { … }
```

---

## `0` is a valid timestamp

`0` is the unix epoch, and `!0` is `true`. Every truthiness check on a date field is now a latent
bug — where it used to be harmless, because a `Date` object is always truthy and an ISO string is
never empty.

```ts
// WRONG — an epoch timestamp reads as "no timestamp".
if (!message.pinned_at) return;
const at = reminder.remind_at ? new Date(reminder.remind_at) : null;
const last = paginator.lastMessageAt || nowNs();

// RIGHT
if (message.pinned_at == null) return;
const at = reminder.remind_at != null ? nsToDate(reminder.remind_at) : null;
const last = paginator.lastMessageAt ?? nowNs();
```

**This is not hypothetical for read state.** `0` is the sentinel this SDK actively writes for "never
read" — `channel.state.read[userId].last_read` is set to `0` when a channel gains its first unread
message for a user with no prior read state, and the offline-DB layer persists `0` for the same case.
So a truthiness check on `last_read` conflates "this user has never read the channel" — precisely
when an unread indicator matters most — with "there is no read state". Use `!= null`.

The same applies to `channel.countUnread(lastRead?)`: it now distinguishes `null`/`undefined` (fall
back to the stored unread count) from `0` (count everything after the epoch). Passing `0` where you
previously passed `new Date(0)` keeps the old meaning.

---

## Request fields are still `Date`

Outgoing date fields are unchanged: `JSON.stringify` emits RFC3339 for a `Date`, and that is the
format the request spec declares. The consequence is that **a response value can no longer be handed
to a request field** — in v9 both sides were `string`, so this was safe and common.

| Request field                                                                                                 | Type   |
| ------------------------------------------------------------------------------------------------------------- | ------ |
| `MessagePaginationParams.created_at_around` / `_before` / `_before_or_equal` / `_after` / `_after_or_equal`   | `Date` |
| `MessageRequest.pinned_at`, `MessageRequest.pin_expires`                                                      | `Date` |
| `SharedLocation.end_at`, `UpdateLiveLocationRequest.end_at`                                                   | `Date` |
| `CreateReminderRequest.remind_at`, `UpdateReminderRequest.remind_at`                                          | `Date` |
| `MarkUnreadRequest.message_timestamp`                                                                         | `Date` |
| `SyncRequest.last_sync_at`, `TruncateChannelRequest.truncated_at`, `UpdateChannelRequest.hide_history_before` | `Date` |
| `ReactionRequest.created_at` / `updated_at`, `PushPreferenceInput.disabled_until`                             | `Date` |

The compiler catches the mismatch. Convert with `nsToDate` on the way out:

```ts
// v9 — both sides were strings, so this worked.
await channel.query({ messages: { created_at_around: message.created_at } });

// v10 — `created_at` is a number, `created_at_around` is a `Date`.
await channel.query({ messages: { created_at_around: nsToDate(message.created_at) } });
```

`nsToDate` is millisecond-precision, which is all a `Date` can hold. If you need the nanosecond
remainder preserved on an outgoing field, `nsToRfc3339` produces a nine-fractional-digit RFC3339
string — but note it does not satisfy a `Date`-typed field without a cast, and casting a string into a
`Date` annotation breaks any caller that inspects the payload rather than just serializing it.

### One field the spec still types as a string

`MessageDeliveredEvent.last_delivered_at` is declared as a bare `type: string` with no
`format: date-time`, so it arrives as RFC3339 while `created_at` on the very same event arrives as a
number. The SDK normalises it internally (`src/channel.ts`); if you read the field off the event
yourself, parse it rather than treating it as a wire number. This is an upstream spec bug and the
field is expected to become a number.

### `pinMessage`'s `number` overload now collides with the response type

```ts
client.pinMessage(messageOrId, timeoutOrExpirationDate?, pinnedAt?, requestOptions?);
```

For both date arguments a `number` means **relative seconds**, not a timestamp — unchanged from v9,
but `message.pinned_at` is now also a `number`, so the wrong thing type-checks:

```ts
// WRONG — reads the timestamp as "1.79e18 seconds from now".
client.pinMessage(id, null, message.pinned_at);
// RIGHT
client.pinMessage(id, null, nsToDate(message.pinned_at));
```

### Filter operands read a bare number as nanoseconds

Filter and sort operands are normalised to nanoseconds. A `Date` and an ISO string are converted; a
bare `number` is taken to **already be** the wire unit. If you were passing epoch milliseconds — which
worked in v9 — the bound now resolves to 1970.

```ts
// WRONG in v10 — epoch milliseconds read as nanoseconds.
{
  created_at: {
    $gt: 1700000000000;
  }
}
// RIGHT — pass a Date, an ISO string, or nanoseconds.
{
  created_at: {
    $gt: new Date('2023-11-14T12:39:29Z');
  }
}
{
  created_at: {
    $gt: msToNs(1700000000000);
  }
}
```

---

## Rendering timestamps: the one path the compiler does not guard

`stream-chat/i18n` exposes two ways to render a timestamp, and only one of them is type-safe.

**`getDateString({ messageCreatedAt })` is typed `string | Date`.** A raw number is a compile error,
so this path guides you to the conversion:

```ts
import { getDateString } from 'stream-chat/i18n';
import { convertTimestampToDate } from 'stream-chat';

getDateString({
  messageCreatedAt: convertTimestampToDate(message.created_at),
  t,
  tDateTimeParser,
  timestampTranslationKey: 'timestamp.MessageTimestamp',
});
```

**`t('timestamp.X', { timestamp })` is not.** The `timestamp.*` translation keys carry a
`timestampFormatter` expression, and the value reaches it through i18next's interpolation options —
which are untyped. `timestampFormatter` itself declares `FormatterFactory<string | Date>`, but nothing
enforces that at the call site, so this compiles cleanly:

```ts
// COMPILES. Renders the literal text 'Invalid Date' into the UI.
t('timestamp.LiveLocation', { timestamp: location.end_at });
```

There is no error, no warning, and no `Invalid Date` to notice in review — just a wrong year in the
UI. **Convert at every `t('timestamp.*', …)` and `t('duration.*', …)` call site**, and treat these as
the places to audit first when migrating:

```ts
t('timestamp.LiveLocation', { timestamp: convertTimestampToDate(location.end_at) });
```

The formatter tolerates `undefined` — it renders an empty string rather than the literal text
`"undefined"` — so the guarded helper can be passed straight through.

Two related notes:

- **`duration.*` keys take a duration, not a timestamp.** `durationFormatter` goes through the date
  library's `.duration()`, so it expects a length of time in **milliseconds**. Handing it a timestamp
  renders something like "57 years ago". If you are deriving a duration from two wire timestamps,
  subtract first and convert once (see [Comparison and arithmetic](#comparison-and-arithmetic)).
- **Presentational props still take `Date`.** The conversion boundary is where core data enters your
  component tree, not the leaf that formats it. Components whose job is to render a date keep their
  `Date` props.

---

## Changed public types and members in this package

Type changes where the member name is unchanged and only the type moved from `Date` to `number`:

| Type / member                                               | Was                 | Now                   |
| ----------------------------------------------------------- | ------------------- | --------------------- |
| `ChannelMuteStatus.createdAt` / `.expiresAt`                | `Date \| null`      | `number \| null`      |
| `ChannelState['read'][userId].last_read`                    | `Date`              | `number`              |
| `ChannelState['read'][userId].last_delivered_at`            | `Date \| undefined` | `number \| undefined` |
| `ThreadState.createdAt`                                     | `Date`              | `number`              |
| `ThreadState.deletedAt` / `.updatedAt`                      | `Date \| null`      | `number \| null`      |
| `ThreadUserReadState.lastReadAt`                            | `Date`              | `number`              |
| `ReminderState.created_at` / `.updated_at`                  | `Date`              | `number`              |
| `ReminderState.remind_at`                                   | `Date \| null`      | `number \| null`      |
| `UnreadSnapshotState.lastReadAt`                            | `Date \| null`      | `number \| null`      |
| `MessagePaginatorAggregateState.seededLastMessageAt`        | `Date \| null`      | `number \| null`      |
| `MessagePaginator.lastMessageAt` (getter)                   | `Date \| null`      | `number \| null`      |
| `LocalEvent` `created_at`, and `received_at` on every event | `Date`              | `number`              |
| `ConnectedEvent.created_at` / `.received_at`                | `Date`              | `number`              |
| `DBDeleteMessagesForChannelType.truncated_at`               | `Date \| undefined` | `number \| undefined` |

Signature changes:

| Member                                                           | Was                                   | Now                                |
| ---------------------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| `channel.countUnread(lastRead?)`                                 | `Date \| null`                        | `number \| null`                   |
| `channel.lastRead()`                                             | `Date \| null \| undefined`           | `number \| null \| undefined`      |
| `channel.muteStatus()`                                           | `{ createdAt: Date \| null; … }`      | `{ createdAt: number \| null; … }` |
| `MessagePaginator.seedLastMessageAt(value)`                      | `string \| Date \| null \| undefined` | `number \| null \| undefined`      |
| `MessagePaginator.truncate({ truncatedAt })`                     | `Date`                                | `number`                           |
| `MessagePaginator.applyMessageDeletionForUser({ deletedAt })`    | `Date`                                | `number`                           |
| `MessagePaginator.findItemByTimestamp(timestamp, exactTsMatch?)` | epoch **ms**                          | wire **ns**                        |
| `MessageReceiptsTracker.onMessageDelivered({ deliveredAt })`     | `Date`                                | `number`                           |
| `MessageReceiptsTracker.onMessageRead({ readAt })`               | `Date`                                | `number`                           |
| `MessageReceiptsTracker.reconcileUserRead({ lastReadAt })`       | `Date \| undefined`                   | `number \| undefined`              |
| `timeLeftMs(remindAt)`                                           | epoch **ms**                          | wire **ns**                        |
| `LocationComposer.validLocation` (getter)                        | `SharedLocation \| null`              | `StaticLocationPreview \| null`    |

Renames — these do **not** fail as a type error if you were reading them off a value typed `any`:

| Was                                              | Now                                              |
| ------------------------------------------------ | ------------------------------------------------ |
| `CooldownTimerState.ownLatestMessageDate`        | `CooldownTimerState.ownLatestMessageTimestamp`   |
| `cooldownTimer.ownLatestMessageDate`             | `cooldownTimer.ownLatestMessageTimestamp`        |
| `cooldownTimer.setOwnLatestMessageDate(date)`    | `cooldownTimer.setOwnLatestMessageTimestamp(ns)` |
| `MsgRef.timestampMs`                             | `MsgRef.timestamp`                               |
| `OwnMessageReceiptsTrackerMessageLocator(msgMs)` | `OwnMessageReceiptsTrackerMessageLocator(ns)`    |

**Unit changes with no type change** — the compiler cannot help with these at all:

| Member                                            | Was          | Now         |
| ------------------------------------------------- | ------------ | ----------- |
| `PollState.lastActivityAt`                        | `Date`       | wire **ns** |
| `LastComposerChange.stateUpdate` / `.draftUpdate` | epoch **ms** | wire **ns** |

Removed:

- `isDate` is gone from `src/utils`. It was never exported from the package root. The `isDate` in
  `stream-chat/i18n` is unrelated and still there — but note it correctly reports that a wire number
  is not a `Date`, so `timestamp && isDate(timestamp) ? … : undefined` now yields `undefined` for
  every timestamp. Convert instead of guarding.
- `RESERVED_UPDATED_MESSAGE_FIELDS` no longer lists `pinned_at` and now lists
  `message_text_updated_at`. `pinned_at`, `pin_expires` and `shared_location` **are** `MessageRequest`
  fields, so stripping them from an update payload clears them server-side; they are converted and
  sent instead.

---

## Persisted state

If you persist SDK values yourself — an offline database, a cache, a hydrated store — timestamps
written by a previous version are ISO strings or serialized `Date`s, and nothing in v10 coerces them
any more. In particular **`formatMessage` is no longer a normalisation boundary**: it used to turn
whatever it received into `Date` objects, and now passes a value straight through.

Version your storage and discard or migrate what was written before the upgrade. `stream-chat-react-native`'s
offline database does this by bumping its schema version, which drops and recreates every table (note
that this also discards queued offline pending tasks).

Storage-level notes if you maintain your own:

- Store timestamps as a 64-bit **integer** column, not text. An integral `double` below 2^63
  round-trips through SQLite `INTEGER` exactly, and lexicographic ISO sorting is no longer needed.
- `ORDER BY` and range comparisons become plain numeric ones — drop any `datetime(…)` /
  `strftime(…)` wrapping, which silently returns `NULL` for an integer column.
- Distinguish absent from epoch. Write `NULL` for an absent timestamp rather than `0` or `''`, or you
  reintroduce exactly the ambiguity the `!= null` discipline above exists to remove.
