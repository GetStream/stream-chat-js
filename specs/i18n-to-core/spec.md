# i18n to core — one translation runtime for both UI SDKs

Status: **core landed** (2026-08). Scope: `stream-chat-js` (this initiative), then
`stream-chat-react` and `stream-chat-react-native` adopt.

## Why

`stream-chat-react` (v15) and `stream-chat-react-native` (v10) independently converged on the same
i18n architecture — English-only bundle, stable dotted keys with the English copy inline as i18next's
`defaultValue`, a generated type-only key catalog, and a drift gate on it. Two separate ports:

- React: `17c91bc70 feat(i18n): english-only bundle with namespaced, type-checked translation keys (#3261)` (305 files, +9865/−11234)
- RN: `a26851d79 feat(i18n): ship English only and rework the public i18n surface` (+683/−7447)

That left ~1,300–1,500 lines of near-duplicate **runtime** in two repos, plus a duplicated codegen
toolchain that differed by five lines in one file and ~60 in the other. `stream-chat` had no
localization code at all. All three packages were shipping breaking releases, which made it the only
cheap window to move the shared layer down.

The sharper motivation was not the duplication itself but what the duplication was working around:
**core emitted user-facing English prose, and both SDKs reverse-mapped it by exact string match** to
resolve a translation. Both carried the same comment — _"Renaming the notification messages at the
source needs a `stream-chat` change; until then this table is the seam"_.

## What was actually wrong

Investigation found the mechanism already existed and was mostly working, which changed the shape of
the work from greenfield to typing and gap-filling:

- `Notification.type` already carried a `domain:entity:operation:result` identifier on every core
  emission site. Its JSDoc documented a field named `code`, which does not exist — that mislabelling is
  why the mechanism looked absent.
- Because `type` was a bare `string`, **both SDKs hand-maintained the same 16-entry `type → key` table**
  and the copies had drifted in both directions: entries for identifiers nothing emits
  (`api:reply:search:failed`, mapped by both, emitted by neither), and core identifiers neither mapped
  (falling through to the English-string fallback, which is why React's map contained
  `'Command not ready to be sent'`).
- Core's own naming had drifted too: `api:messages:query:failed` and `api:message:query:failed` were
  two different operations distinguished only by a plural `s`, in the counterintuitive direction.
- **Poll-composer field errors had no identifier at all** — plain English in a `Record<string, string>`.
  That is the one place core genuinely emitted unkeyed prose.

## Shipped

- **`stream-chat/i18n` subpath** — `Streami18n` (reactive via `StateStore`), three formatters,
  `getDateString`, catalog-generic type helpers, `TranslationBuilder` plumbing, generated language
  names, the shared notification key registry.
- **`stream-chat/i18n/codegen` subpath** — the catalog generator, Node-only, with `typescript`
  injected rather than imported. Verified to reproduce both SDKs' real committed catalogs identically
  (React 634/634, RN 408/408 + 97 bundled).
- **Scoped identifiers** — `CORE_NOTIFICATION_TYPE` / `CoreNotificationType` and
  `POLL_VALIDATION_CODE` / `PollValidationError`, both exhaustiveness-checked.
- `i18next` and `dayjs` as direct dependencies of `stream-chat`.

Consumer-facing delta: `v9-to-v10-migration-guide-i18n.md`.

## Invariants the implementation has to hold

Three behavioural guarantees, ported from RN's `Streami18nGuarantees.test.ts` where each was written
against a real bug found reviewing the web implementation. They are core's acceptance contract now, so
a third SDK cannot regress them and neither UI SDK has to keep a copy:

- **G1** — the SDK's bundled defaults are layered under _every_ language, however it was selected. If
  not, a formatter key renders as its own dotted path and a timestamp as an unformatted ISO string.
- **G2** — a partial dictionary is safe: an unsupplied key renders English, never a raw dotted path.
  This includes not letting an integrator's `parseMissingKeyHandler` blank out prose keys, since
  i18next counts every prose key as "missing".
- **G3** — selecting an unregistered language warns and continues. It must not silently reset to `en`,
  which discards the integrator's choice and makes the cause very hard to see.

Two structural invariants enforced by the build rather than by review, because both fail invisibly:

- The **root bundle must not reach `src/i18n/`** or its dependencies. Asserted from esbuild's metafile;
  `dist/esm/index.mjs` is byte-identical at 907,599 bytes.
- The **runtime i18n layer must not reach `src/i18n-codegen/`**, which is Node-only.

## Not in scope here

The catalogs themselves. Each UI SDK generates `keys.ts` from its own `t()` call sites, so they stay
upstream — which is what forced core's type helpers to be generic over the catalog rather than
augmentation-based (two catalogs must be able to coexist in one TypeScript program).
