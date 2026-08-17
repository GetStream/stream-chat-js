# i18n to core — decisions

Decisions taken, with the reasoning that is not recoverable from the diff. Reversals are recorded
rather than rewritten, since the reason a rejected option was rejected is the useful part.

## Packaging: a subpath, not the root barrel

`stream-chat/i18n` is a separate entry point. The layer needs `i18next` and `dayjs`, and core had three
runtime dependencies; putting it in the root barrel would make every consumer — Node/SSR, custom UI,
other SDKs — pay for translation machinery they may never use.

The boundary is asserted from esbuild's `metafile` at build time, in both directions, because a leak
fails invisibly: everything still works, the bundle is just quietly bigger. Verified by deliberately
adding `export * from './i18n'` to `src/index.ts` and confirming the build fails and names every leaked
file.

## Dependencies: direct, not optional peers — **reversed**

First built as optional `peerDependencies` to hold core at three runtime dependencies. **Rejected.**

Optional peers are not installed. A project with only `stream-chat` installed threw
`MODULE_NOT_FOUND: Cannot find module 'dayjs'` on `require('stream-chat/i18n')`, so the requirement was
declared in core but satisfiable only somewhere else — pushing core's own import onto consumers, and
making the UI SDKs responsible for a dependency core is the one importing. Verified both ways against a
packed tarball.

Accepted cost: ~2.3 MB unpacked in `node_modules` for a consumer who never translates, and five runtime
dependencies rather than three. Bundle size is unaffected either way — the subpath, not the dependency
kind, is what keeps them out of the root bundle.

Consequence for the UI SDKs: they should **drop** their own `i18next`/`dayjs` declarations rather than
keep them, since two `i18next` instances mean dictionaries registered on one are read from the other.

## Type layer: generic over the catalog, not module augmentation

The derivations (`TranslationKeyOf`, `StreamTFunctionFor`, …) live in core while each SDK's generated
catalog stays upstream, so the helpers take the catalog as a type parameter.

Module augmentation was rejected for two reasons: two catalogs must be able to coexist in one
TypeScript program (a monorepo typechecking both SDKs in one pass), which a single augmented interface
cannot express; and augmentation is ambient, so an SDK's key union would leak into an integrator's
unrelated `t()` calls — the same objection that kept this out of i18next's `CustomTypeOptions`.

This does not reintroduce the v9-era generics problem. Those were on runtime domain types and infected
every signature; these are type-only aliases instantiated once per SDK, and the generic never appears
in a user-facing signature.

Prototyped and typechecked before committing: 614-entry synthetic catalog compiles in 0.44 s with all
eight negative assertions firing. **`Bundled` must default to `never`** — defaulting to `string` would
collapse the prose overload and silently disable all key checking.

Note the ported comment claiming `CopyFor<ProseKey>` exceeds TypeScript's union limit (TS2590) **does
not reproduce** on TS 6.0.3 at real catalog size. The constraint is kept anyway — the payoff is small
and TS's limit is a heuristic on instantiation depth × union breadth, so it can trip on a more
interpolation-heavy catalog — but the justification was rewritten to stop citing an error we cannot
substantiate.

## Reactivity: `StateStore`, not listeners

React had a single `setLanguageCallback` that one caller clobbers for all others; RN had five listener
members. Both collapse to one `StateStore`, which both SDKs already consume via `useStateStore`.

`subscribe` fires synchronously with the current value, which dissolves the queued-override race RN
needed `queuedTFunctionOverride` for: `overrideTFunction` before `init()` is just a store write, and a
later subscriber sees it immediately. `init()` must not clobber it, tracked with a flag.

## `setLanguage` returns `void`

It previously returned three different shapes (i18next's `TFunction`, `StreamTFunction`, `undefined`).
No call site in either SDK, either example app, or the docs used the value. Returning `t` is actively
misleading once the store exists: it hands out a value valid only until the next language change.

## `init()` memoized and never cleared

RN's `waitForInitializing` cleared its guard on completion, leaving a window where a third caller
re-entered initialization. `this.initPromise ??= this.#doInit()` is genuinely idempotent. Two
independent consumers calling this is the normal case, not an edge case — a UI SDK's chat root and its
overlay host both do.

## `runtimeDefaults` injected, not imported

The one addition the move forced. `StreamI18n` imported it from a sibling file, and that file is
per-SDK catalog data core cannot import. Each SDK's public export becomes a thin subclass injecting its
own, so `new StreamI18n(...)` keeps working verbatim for integrators while the layering guarantee (G1)
stays tested in core.

## `TranslationBuilder`: plumbing down, topics stay up

React routes notification translation through an i18next post-processor; RN dispatches at the render
site. Both are legitimate, and the choice is a UI-layer concern core should not make. Only the
mechanism moves, so RN can adopt the topic later with no core change.

Non-obvious property worth keeping in mind: i18next post-processing is configured **globally**, so a
topic is invoked for _every_ key and must pass through calls it does not recognize. Getting that wrong
silently rewrites unrelated copy, so there is a test for it.

## Formatters: four, with `relativeCompactDateFormatter` as an alias

RN's standalone implementation hardcoded `'Today'` / `'Yesterday'` / `` `${n}d ago` ``, which no
dictionary could translate — and because the wording lived in a formatter body rather than a catalog
value, the codegen's English-prose guard never saw it. It is now an alias of
`timestampFormatter(relativeCompact: true)`, whose wording goes through `t()`.

`durationFormatter` is typed `number | string`: dayjs accepts both at runtime, and its post-1.11
signature narrowed to string only, which had forced a cast in React.

A regression test names the failure mode found while building this: a duration must go through the date
library's `.duration()`. Parsing the number as a timestamp reads 600000 as ten minutes past the epoch
and renders "57 years ago". That also forced `DateTimeParser` to be the date library _module_ rather
than a parse function, since `.duration()` lives on the module.

## dayjs: no module-scope side effects

Every `Dayjs.extend` moved into `ensureDayjsPlugins()`, called from the constructor and from
`defaultDateTimeParser` — the latter is what keeps a standalone `getDateString()` working with no
instance in play. That makes `sideEffects: false` accurate for the first time.

RN's module-scope `Dayjs.updateLocale('en', { calendar, format })` is **not** ported: it rewrote
`L`/`LL`/`LT` for the entire host app, which a chat SDK should not do.

The `import 'dayjs/locale/en'` both SDKs carried is deleted — dayjs registers `en` before any import
runs, so it was a no-op.

Explicit `.js` on dayjs subpath imports. `dayjs` stays external, so the specifier survives verbatim
into `dist/esm/i18n.mjs` and has to be valid Node ESM.

The `formats: {}` / `relativeTime: {}` stubs in the English locale skeleton were initially removed as
cruft and **restored**: `Dayjs.locale()` takes an `ILocale`, which declares both as required, so
omitting them is a type error. Comment added, since their purpose is not self-evident.

## `Intl.PluralRules` coverage is warned about, not polyfilled

Hermes ships a partial ICU: the constructor exists but silently falls back to the root locale's rules —
`{ other }` only — for locales it lacks data for. A dictionary correctly supplying `_few` / `_many` then
renders none of them, with no error, locale-specific and order-dependent.

Core cannot install the polyfill (`intl-pluralrules` is an RN-only need and would be wasted bytes
elsewhere), but it can detect the inadequate environment and say so. Checked inside `init()`, which is
the last moment a polyfill could still have been loaded in time — i18next caches an `Intl.PluralRules`
per language during init.

## Codegen: `typescript` injected, four guards

Injected via config so core does not depend on the compiler; only the parser API is used, so no
`Program` and no type checker.

Four guards, not the five RN had. The dropped one policed `EXTERNAL_STRING_KEYS` — that map is gone,
because notifications resolve through a stable identifier instead of by matching English prose.

Guards return failures as data with a thin printer on top, so tests assert on the failure rather than
scraping stderr and run in-process rather than spawning. That is most of why the SDK-side suite was 381
lines.

## Naming: `StreamI18n`

Both SDKs spell it `Streami18n`. Core normalizes the initialism; each SDK re-exports `Streami18n` as a
deprecated alias for one cycle so no integrator code breaks on the rename alone.

## Notification `type`, not `code`

Keeping the field name. Renaming to match its own mislabelled JSDoc would touch ~120 emission sites
across three repos plus two dispatcher maps, for no benefit. The JSDoc was corrected instead.

`type?: CoreNotificationType | (string & {})` keeps the field open, mirroring `NotificationSeverity`
two lines above it in the same file. Narrowing to a closed union would break the ~120 identifiers the
SDKs and integrators emit.

## Poll validation errors keep `message` alongside `code`

A bare code would be smaller but strands every consumer without an i18n layer. Keeping `message` means
a plain-JS integrator gets a compile error with a one-property fix (`errors.name.message`) rather than
a silently blank field, and an unrecognized code degrades to readable text.

They are deliberately **not** notifications: field-level form state rendered inline next to an input,
where a toast per keystroke would be wrong.

## Corrections to the initial analysis

Recorded because each was asserted before being checked, and each changed the work:

- `connection:lost` is **not** a notification type — it is `OfflineErrorType` in
  `offline-support/types.ts`, a separate taxonomy. Out of scope for the notification union; three core
  identifiers were unmapped, not four.
- **Every** core emission site already carried a `type`. `commandUtils.ts:65` appeared un-typed only
  because its `type` sits more than eight lines from its `addWarning` call, outside a grep window.
- No eslint override is needed for `src/i18n/**`. `import/no-extraneous-dependencies` permits
  `dependencies` outright — the override was only ever required for the rejected peer variant.
- Importing from the `notifications` barrel does **not** drag `NotificationManager` into the i18n
  bundle; esbuild already tree-shakes it. A "fix" importing the module directly measured 27 bytes
  _worse_ and was reverted.
- Vitest now forces `TZ=UTC`. The date assertions previously passed only on a machine that happened to
  be in UTC, which is what CI is — so a local run disagreed with CI by exactly the host's offset.
