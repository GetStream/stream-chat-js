# i18n to core — plan

Four phases. Core is done; the two UI SDK adoptions are not.

## Phase 0 — Scoped identifiers in core ✅

Ships alone, because it is the only irreversible change in the initiative.

- `CORE_NOTIFICATION_TYPE` + `CoreNotificationType`; every core emission site routed through the map.
- `api:messages:query:failed` / `api:message:query:failed` → `api:message:jump:failed` /
  `api:message:jumpToLatest:failed`.
- `Notification.message` documented as a developer-facing fallback, not display copy.
- Poll-composer field errors carry `{ code, message, metadata? }`.
- Drift gates: every declared identifier must be emitted; no raw type literal may appear in `src/`.

Commit `766b1ddb`. Gate: `yarn lint && yarn types && yarn test-unit --run && yarn build`.

## Phase 1 — The `stream-chat/i18n` module ✅

Based on RN's implementation, which was the later and better of the two.

- `Streami18n` with a `StateStore`; catalog-generic type helpers; dayjs handling with no module-scope
  side effects; three formatters; `getDateString`.
- Generated `languageNames`, the shared notification key registry, `TranslationBuilder` plumbing.
- `stream-chat/i18n` and `stream-chat/i18n/codegen` exports; second and third bundle entries; build-time
  boundary assertion.
- `i18next` + `dayjs` as direct dependencies.

Commits `8828c57e`, `3b573689`, `db7687d0`, `d9cac551`. 2,752 tests; root bundle byte-identical.

## Phase 2 — `stream-chat-react` adopts

**Blocker to clear first:** `src/i18n/types.ts:4` imports `MessageContextValue` from `'../context'` and
line 3 imports `Moment` from `moment-timezone`. Both must be cut before the type machinery can move, or
core gains a circular UI dependency and a devDependency type leak.

- Delete `Streami18n.ts`, the formatter half of `utils.ts`, `TranslationBuilder/TranslationBuilder.ts`,
  `externalStrings.ts` (~1,100 lines).
- `types.ts` → ~8-line instantiation of core's generics, intersecting `LanguageNameCatalog`.
- Delete the 57 `language.*` entries from `runtimeDefaults.ts`; merge core's `languageNameDefaults`. Drop
  the `asDynamicKey` + string-compare fallback in `MessageTranslationIndicator.tsx:54`.
- Replace `translatorsByNotificationType.ts` with a `Record<CoreNotificationType, Translator>` — the
  unmapped identifiers now fail to compile.
- Move the `Dayjs.extend` calls out of `context/TranslationContext.tsx`. **Highest-risk line in the
  diff**: it fails silently, as malformed dates rather than a throw.
- Rewire to `useStateStore`; `useChat.ts:96` keeps its truthiness check.
- Codegen script 249 → ~15 lines. Delete the stale `sideEffects` entry. Drop `i18next`, `dayjs`,
  `moment-timezone`.
- **Add a `catalogRenders` test** — React has no equivalent of RN's strongest regression net, and it is
  the test most likely to catch a regression from this refactor.
- One-line PR first: add `release-v15` to `size.yml`'s branch filter, or the bundle-size check never
  runs on this branch.

Gate: `yarn build && tsc -p tsconfig.lib.json --noEmit && yarn lint && yarn test && yarn validate-translations`.
Note `yarn types` checks nothing (solution-file `tsconfig.json` with `files: []`).

## Phase 3 — `stream-chat-react-native` adopts

Prerequisites, each its own PR:

1. **Manifests.** `stream-chat` is declared `^9.51.0` in `package/` and both examples, papered over by a
   root `resolutions` entry — and **resolutions do not publish**, so a consumer installing the SDK today
   gets `stream-chat@9.x` against v10 source. Bump the declared ranges and delete the resolutions entry.
   Same PR: the RN 0.79 / Expo 53 baseline (all four ranges).
2. **Replace `instanceof Streami18n`** in `useStreami18n.ts:20` with a brand check plus a
   `logger.warn` on the fallback. Today a cross-bundle-copy instance is silently discarded for a fresh
   English default — every dictionary, formatter and registered language gone, no warning. RN has three
   physical `stream-chat` copies.
3. Add `V10` to `check-pr.yml`'s branch filter, or every gate is manual.

Then: delete `src/utils/i18n/**`, same type/codegen shrink as React, drop the module-scope
`Dayjs.updateLocale`, add the four `relativeTime.*` keys the translatable relative-compact formatter
needs, replace `useStreami18n` with the `useStateStore` version, migrate
`new Streami18n(opts, i18nextConfig)` call sites, and newly export `Streami18nOptions` and the formatter
types — both unreachable today despite `options.formatters` referencing them.

Optional, and a real gap: RN renders auto-translated message text
(`useTranslatedMessage.ts:24`) with no indicator of the source language, because it has no equivalent of
React's `MessageTranslationIndicator`. `languageNameDefaults` makes the data one merge away; the
component is a small feature to scope explicitly rather than assume.

## Cross-repo validation

Use a `yarn pack` tarball, not `link:`/`portal:`. `enableScripts: false` in all three repos means
`link:` never runs core's `prepare`, so a stale `dist/` gets validated — and they read the live
`package.json`, so they cannot prove the subpath actually shipped, which is the thing under test.

`git diff --exit-code -- package.json yarn.lock` as an explicit exit gate. Precedent: RN commit
`9dc3f5f6f` committed `portal:/Users/isekovanic/Projects/stream-chat-js`, which resolved on one machine
and failed 399 tests everywhere else.

End-to-end proof is `examples/SampleApp/src/i18n/` (German + Italian + switcher). Assert in order,
because each isolates a different failure: copy switches → registration and resolution work; month/day
names switch → the locale import reached _core's_ dayjs instance, not a second copy; relative dates read
"Gestern" not "Last Mittwoch" → the calendar plugin was extended on core's dayjs and the per-key
`calendarFormats` still lands.
