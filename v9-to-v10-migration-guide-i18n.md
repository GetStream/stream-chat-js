# v9 → v10 Migration Guide — Notifications, Poll Validation & i18n

> Scope: this guide covers **notification identity** (`Notification.type` and `Notification.message`), the **shape of poll-composer field errors**, and the new **`stream-chat/i18n`** and **`stream-chat/i18n/codegen`** subpath exports. It is relevant to you even if you never translate anything: the notification and poll-error changes affect any app that renders either.
>
> Sibling guides:
>
> - `v9-to-v10-migration-guide-client-construction.md` (constructor & options)
> - `v9-to-v10-migration-guide-logging.md` (`chatLoggerSystem`, sinks, scopes)
> - `v9-to-v10-migration-guide-methods.md` (per-method signatures)
> - `v9-to-v10-migration-guide-server-side.md` (server-side surface removal)
> - `v9-to-v10-migration-guide-sort.md` (`SortParamRequest[]` shape)
> - `v9-to-v10-migration-guide-type-renames.md` (type aliases → generated names)
> - `v9-to-v10-migration-guide-other.md` (everything else)

## TL;DR

- **Two notification identifiers were renamed.** `api:messages:query:failed` → `api:message:jump:failed`, and `api:message:query:failed` → `api:message:jumpToLatest:failed`. They were a singular/plural split describing two _different_ operations, which made the pair impossible to grep for reliably. **Breaking** if you switch on either.
- **`PollComposerFieldErrors` values are now objects**, not bare English strings: `{ code, message, metadata? }`. Read `.message` for the previous value, or switch on `.code` to localize. **Breaking.**
- **`Notification.type` is now typed** as `CoreNotificationType | (string & {})` and enumerated in the exported `CORE_NOTIFICATION_TYPE` map. Additive — your own identifiers still pass.
- **`Notification.message` is now documented as a developer-facing fallback, not display copy.** Its wording is not part of the public contract and may change in a minor release. Nothing breaks today, but anything user-facing should switch on `type`. See [Rendering notifications](#rendering-notifications).
- **New subpath `stream-chat/i18n`** carries the shared translation runtime (`StreamI18n`, formatters, date handling). Nothing is re-exported from `stream-chat`'s root, so the root bundle is unchanged.
- **New subpath `stream-chat/i18n/codegen`** carries the build-time translation-catalog generator. Node-only.
- **`stream-chat` now depends on `i18next` and `dayjs`.** Install footprint grows ~2.3 MB; **bundle size is unaffected** unless you import `stream-chat/i18n`.
- Nothing in the JSDoc ever described a `Notification.code` field. There is no such field and never was — the block documenting the `domain:entity:operation:result` scheme was attached to `type` and mislabelled. It has been corrected.

## Notification identity

### `type` is the stable identifier; `message` is not

Every notification `stream-chat` emits carries a `type`: a stable
`domain:entity:operation:result` identifier. That has been true since v10 rc, but it was typed as a bare
`string`, so nothing checked it and nothing enumerated it.

v10 exports the full set, so you can switch on it with autocomplete and have a typo caught at compile
time:

```ts
import { CORE_NOTIFICATION_TYPE } from 'stream-chat';
import type { CoreNotificationType } from 'stream-chat';

client.notifications.state.subscribe(({ notifications }) => {
  for (const notification of notifications) {
    if (notification.type === CORE_NOTIFICATION_TYPE.attachmentUploadFailed) {
      // …
    }
  }
});
```

The field stays open (`CoreNotificationType | (string & {})`), so identifiers emitted by a UI SDK or by
your own code are still valid — you only lose autocomplete for them.

### Every identifier core emits

| Identifier                                 | Suggested translation key                 |
| ------------------------------------------ | ----------------------------------------- |
| `validation:attachment:file:missing`       | `notification.attachmentFileMissing`      |
| `validation:attachment:id:missing`         | `notification.attachmentIdMissing`        |
| `validation:attachment:upload:blocked`     | `notification.attachmentUploadBlocked`    |
| `api:attachment:upload:failed`             | `notification.attachmentUploadFailed`     |
| `validation:attachment:upload:in-progress` | `notification.attachmentUploadInProgress` |
| `validation:command:disabled`              | `notification.commandDisabled`            |
| `validation:command:not-ready`             | `notification.commandNotReady`            |
| `api:location:create:failed`               | `notification.locationCreateFailed`       |
| `api:message:jump:failed`                  | `notification.messageJumpFailed`          |
| `api:message:jumpToLatest:failed`          | `notification.messageJumpToLatestFailed`  |
| `validation:poll:castVote:limit`           | `notification.pollCastVoteLimit`          |
| `api:poll:create:failed`                   | `notification.pollCreateFailed`           |

The right-hand column is a suggestion, not an export. Each UI SDK uses its own key names — they predate
this table and integrators' dictionaries are already written against them — so there is no single
canonical set to publish. What _is_ exported, and what makes the mapping safe, is the
`CORE_NOTIFICATION_TYPE` union: keying a `Record<CoreNotificationType, …>` on it turns a new identifier
into a compile error until you map it, and rejects an entry for one that no longer exists.

`validation:command:disabled` additionally carries `metadata.reason` (`'editing' | 'replying'`), which
its English message varies by. Copy for that key should interpolate `{{ reason }}`.

### Renamed identifiers

**Breaking.** Two identifiers described two different operations under near-identical names:

| v9 / earlier v10 rc         | v10                               | What it means                        |
| --------------------------- | --------------------------------- | ------------------------------------ |
| `api:messages:query:failed` | `api:message:jump:failed`         | jumping to a specific message failed |
| `api:message:query:failed`  | `api:message:jumpToLatest:failed` | jumping to the latest message failed |

The old pair differed only by a plural `s`, in the opposite order from what you would guess — the
_plural_ name was the single-message jump. Neither UI SDK had ever mapped either one, which is how the
mismatch survived.

```ts
// v9 / earlier v10 rc
if (notification.type === 'api:messages:query:failed') showJumpError();

// v10
if (notification.type === CORE_NOTIFICATION_TYPE.messageJumpFailed) showJumpError();
```

### Rendering notifications

`Notification.message` is untranslated English intended as a **developer-facing fallback**. Its exact
wording is not part of the public contract and can be reworded in a minor release.

This is a contract change rather than an immediate break: the field still exists and still contains the
same text today. But if you render it directly, you are relying on something now documented as unstable,
and you have no way to localize it.

```ts
// Before — the English sentence is the only thing identifying the notification
toast(notification.message);

// After — dispatch on the identifier, and fall back to `message` for one you do not recognize
import { CORE_NOTIFICATION_TYPE } from 'stream-chat';
import type { CoreNotificationType, Notification } from 'stream-chat';

const copy: Record<CoreNotificationType, (n: Notification) => string> = {
  [CORE_NOTIFICATION_TYPE.attachmentUploadFailed]: () => t('notification.uploadFailed'),
  // `validation:command:disabled` carries metadata.reason, so branch on it here
  [CORE_NOTIFICATION_TYPE.commandDisabled]: (n) =>
    t('notification.commandDisabled', { reason: n.metadata?.reason }),
  // …one entry per identifier; TypeScript will tell you which are missing
};

// `message` verbatim for anything unmapped, so a newer `stream-chat` cannot produce an empty toast.
toast(
  notification.type && copy[notification.type as CoreNotificationType]
    ? copy[notification.type as CoreNotificationType](notification)
    : notification.message,
);
```

Type the record as `Record<CoreNotificationType, …>` rather than `Record<string, …>` — that is the whole
point, and it is why core does not ship a ready-made resolver: your keys are yours, and a helper that
resolved them from a table would be invisible to a key-extraction step like the one both UI SDKs run.

If you are using `stream-chat-react` or `stream-chat-react-native`, this is handled for you; see that
SDK's own i18n guide.

## Poll-composer field errors

**Breaking.** Field validation errors on the poll composer were bare English strings, which meant a UI
had to match on prose to localize them. They now carry a stable code:

```ts
// v9
type PollComposerFieldErrors = Partial<
  Omit<Record<keyof CreatePollRequest, string>, 'options'> & {
    options?: Record<string, string>;
  }
>;

// v10
type PollValidationError = {
  code: PollValidationCode;
  /** Untranslated English fallback. Not part of the public contract. */
  message: string;
  metadata?: Record<string, unknown>;
};

type PollComposerFieldErrors = Partial<
  Omit<Record<keyof CreatePollRequest, PollValidationError>, 'options'> & {
    options?: Record<string, PollValidationError>;
  }
>;
```

The one-property migration, if you do not want to localize:

```ts
// v9
<span>{errors.name}</span>
<span>{errors.options?.[option.id]}</span>

// v10
<span>{errors.name?.message}</span>
<span>{errors.options?.[option.id]?.message}</span>
```

To localize, switch on `code`:

```ts
import { POLL_VALIDATION_CODE } from 'stream-chat';

const copy: Record<PollValidationCode, string> = {
  [POLL_VALIDATION_CODE.maxVotesNotNumeric]: t('poll.maxVotes.notNumeric'),
  // …
};
const text = errors.name ? (copy[errors.name.code] ?? errors.name.message) : undefined;
```

`message` is kept alongside `code` deliberately: a plain-JS integrator gets a compile error with a
one-property fix rather than a silently blank field, and an unrecognized code still renders readable
text.

### Every poll validation code

| Code                                          | English fallback               |
| --------------------------------------------- | ------------------------------ |
| `validation:poll:maxVotes:notNumeric`         | Only numbers are allowed       |
| `validation:poll:maxVotes:outOfRange`         | Type a number from 2 to 10     |
| `validation:poll:maxVotes:uniqueVoteEnforced` | Enforce unique vote is enabled |
| `validation:poll:name:required`               | Question is required           |
| `validation:poll:option:duplicate`            | Option already exists          |
| `validation:poll:option:empty`                | Option is empty                |

These are **not** notifications and are deliberately not routed through `NotificationManager` — they are
field-level form state rendered inline next to an input, and a toast per keystroke would be wrong.

## New subpath: `stream-chat/i18n`

The translation runtime shared by the React and React Native SDKs now lives in core. If you use a UI
SDK, you do not need to import this directly — the SDK re-exports what you need, bound to its own key
catalog.

```ts
import { StreamI18n, getDateString, predefinedFormatters } from 'stream-chat/i18n';
```

It is a separate entry point, not part of `stream-chat`'s root barrel, because it pulls in `i18next` and
`dayjs`. **The root bundle is unchanged** — the build fails if anything in `src/i18n/` becomes reachable
from it.

Notable if you are building custom UI directly on `stream-chat`:

- `StreamI18n` is generic over your translation catalog: `new StreamI18n<MyCatalog, MyBundledKeys>(…)`.
- Reactivity goes through `i18n.state`, a `StateStore`. `subscribe` fires synchronously with the current
  value, so there is no listener-registration ordering to get right.
- `setLanguage()` returns `Promise<void>`. The new `t` is published to `state`; a returned translator
  would go stale on the next language change.
- `init()` is idempotent and safe to call concurrently.
- The keys with no inline default at their call site are injected via the `runtimeDefaults` option,
  because the catalog belongs to the UI layer rather than to core.

## New subpath: `stream-chat/i18n/codegen`

Build-time only, and **Node-only**: it reads the filesystem and uses the TypeScript parser API. It
generates a type-only translation-key catalog from your `t()` call sites, which is how a mistyped key
becomes a compile error.

`typescript` is injected rather than imported, so `stream-chat` does not depend on the compiler:

```ts
import ts from 'typescript';
import { generateI18nKeys } from 'stream-chat/i18n/codegen';

generateI18nKeys({
  ts,
  runtimeDefaultsPath: 'src/i18n/runtimeDefaults.ts',
  keysOut: 'src/i18n/keys.ts',
});
```

This is primarily for the UI SDKs. You only need it if you maintain your own translation catalog with
the same call-site-as-source-of-truth approach.

## New dependencies

`stream-chat` now depends on:

| Package   | Range      | Why                                               |
| --------- | ---------- | ------------------------------------------------- |
| `i18next` | `^26.3.6`  | the translation runtime behind `stream-chat/i18n` |
| `dayjs`   | `^1.11.13` | date and duration formatting                      |

Direct dependencies rather than optional peers, so importing `stream-chat/i18n` works without you
installing anything extra.

Two things to note:

- **Bundle size is unaffected** if you do not import `stream-chat/i18n`. Both are externalized and the
  root bundle is byte-identical.
- **Install footprint grows ~2.3 MB unpacked** (`i18next` ~416 KB, `dayjs` ~1.9 MB) even if you never
  translate. This takes `stream-chat` from three runtime dependencies to five, which is a deliberate
  trade: a package that imports something should depend on it rather than push the requirement onto
  consumers.

If you already declared `i18next` or `dayjs` because a UI SDK needed them, you can drop them — but check
that only one copy resolves, since two `i18next` instances mean dictionaries registered on one are read
from the other:

```bash
find . -maxdepth 4 -name i18next -type d -path '*node_modules*'
```

## Mechanical migration checklist

1. `grep -rn "api:messages:query:failed\|api:message:query:failed"` → replace with
   `CORE_NOTIFICATION_TYPE.messageJumpFailed` / `.messageJumpToLatestFailed`.
2. `grep -rn "notification.message"` → for anything user-facing, switch on `notification.type` (use
   `CORE_NOTIFICATION_TYPE`). Keep `message`
   only as the unrecognized-identifier fallback.
3. Typecheck. Every `PollComposerFieldErrors` read will fail: append `?.message`, or switch on `.code`.
4. If you match notification identifiers anywhere, retype the local as `CoreNotificationType` to get the
   set checked.
5. If you declared `i18next` or `dayjs` only for a Stream SDK, remove them and verify a single copy
   resolves.
