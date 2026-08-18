import type * as ts from 'typescript';

/**
 * The TypeScript module, injected by the caller.
 *
 * Injected rather than imported so `stream-chat` never depends on the compiler. Only the parser API is
 * used — no `Program`, no type checker — so this needs no tsconfig and is fast. Both UI SDKs already
 * have `typescript` as a devDependency, which is the only place this runs.
 */
export type TypeScriptModule = typeof ts;

export type GeneratorConfig = {
  /** The TypeScript module. See {@link TypeScriptModule}. */
  ts: TypeScriptModule;
  /** Path to the file exporting `runtimeDefaults`. */
  runtimeDefaultsPath: string;
  /** Where to write the generated catalog. */
  keysOut: string;
  /** Source root to scan for `t()` call sites. Default `'src'`. */
  srcRoot?: string;
  /** Directory names to skip while scanning. Default `['__tests__', 'mock-builders']`. */
  ignoreDirs?: string[];
  /**
   * Where to write a JSON data twin of the catalog.
   *
   * `keys.ts` is type-only, so no runtime test can iterate it. This is what lets a test render every
   * key and assert none surfaces as its own dotted path — the strongest regression net in the i18n
   * suite. Put it under `__tests__` so it never reaches the published build.
   */
  fixtureOut?: string;
  /**
   * Emit a `BundledTranslationKey` union alongside `TranslationCatalog`.
   *
   * Prefix-matching `timestamp.` / `duration.` is not enough for an SDK whose bundled set also includes
   * ordinary prose resolved by name at runtime (screen-reader labels, lookup-table entries).
   */
  emitBundledKeyUnion?: boolean;
  /**
   * Extra prefixes whose values are expressions rather than copy, added to the built-in
   * `timestamp.` / `duration.`. Excluded from the translator-facing JSON export.
   */
  extraFormatterPrefixes?: string[];
  /** Write a translator-facing JSON export. */
  json?: {
    out: string;
    /** Include formatter expressions. Off by default: a TMS that translates them breaks dates. */
    includeFormats?: boolean;
  };
  /** Doc reference quoted in the "these carry English copy" hint. */
  migrationGuideRef?: string;
  /** Where to report progress. Defaults to `console.log`. */
  log?: (message: string) => void;
};

export type CallSiteCopy = {
  /** `key -> English copy` for every key written with an inline default. */
  copy: Map<string, string>;
  /**
   * `key -> file` for keys called with no inline copy — `t('timestamp.MessageTimestamp', {…})`.
   * These must be present in `runtimeDefaults` or they render as the raw key.
   */
  withoutCopy: Map<string, string>;
  /** Keys seen with two different inline copies — a key must render one thing. */
  conflicts: Array<{ key: string; a: string; b: string; file: string }>;
};

export type GuardFailureKind =
  | 'conflicting-copy'
  | 'unresolvable-key'
  | 'shadowed-key'
  | 'prefix-collision';

/**
 * A guard failure, as data.
 *
 * Returned rather than printed so tests can assert on the failure itself instead of scraping stderr —
 * which is most of why the fixture suite for this was as large as it was.
 */
export type GuardFailure = {
  kind: GuardFailureKind;
  summary: string;
  entries: string[];
};

export type GeneratedCatalog = {
  /** Every key mapped to its English copy, sorted. */
  catalog: Map<string, string>;
  /** Keys resolved from `runtimeDefaults` rather than an inline default. */
  bundledKeys: string[];
  failures: GuardFailure[];
};
