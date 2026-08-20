import type { TOptions } from 'i18next';

/* ------------------------------------------------------------------------------------------------
 * Catalog-generic key machinery
 *
 * Core ships no translation catalog. Each UI SDK generates its own `keys.ts` from its `t()` call
 * sites, then instantiates these helpers against it once. Everything here is type-only and erased at
 * runtime.
 *
 * These are generic rather than driven by module augmentation on purpose: two catalogs must be able
 * to coexist in one TypeScript program (a monorepo typechecking both UI SDKs in one pass), and a
 * single augmented interface can only hold one. Augmentation is also ambient, which would leak an
 * SDK's key union into an integrator's unrelated `t()` calls — the same objection that kept this out
 * of i18next's `CustomTypeOptions`.
 * ---------------------------------------------------------------------------------------------- */

/** The shape a generated `keys.ts` catalog satisfies: key -> its English copy. */
export type AnyTranslationCatalog = Record<string, string>;

type Whitespace = ' ' | '\n' | '\t';

type Trim<S extends string> = S extends `${Whitespace}${infer R}`
  ? Trim<R>
  : S extends `${infer R}${Whitespace}`
    ? Trim<R>
    : S;

/** `{{ value, formatter }}` and `{{ value | formatter(...) }}` — the name is the leading part. */
type VarName<S extends string> = Trim<
  S extends `${infer Name},${string}`
    ? Name
    : S extends `${infer Name}|${string}`
      ? Name
      : S
>;

/**
 * The interpolation variables a copy string requires.
 *
 * i18next ships `InterpolationMap`, but it does not trim the placeholder, so `{{ setting }}` yields a
 * property literally named `" setting "`. SDK copy uses spaced placeholders throughout, so the
 * placeholders are parsed here instead.
 */
type InterpolationVars<S extends string> =
  S extends `${string}{{${infer V}}}${infer Rest}`
    ? (VarName<V> extends '' ? never : VarName<V>) | InterpolationVars<Rest>
    : never;

type InterpolationArgs<S extends string> = [InterpolationVars<S>] extends [never]
  ? Record<never, never>
  : { [K in InterpolationVars<S>]: number | string };

/** Every plural category `Intl.PluralRules` can select. */
export type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export type CatalogKeyOf<C extends AnyTranslationCatalog> = keyof C & string;

/**
 * Keys whose catalog entries are plural forms (`<key>_one` / `<key>_other`).
 *
 * The `infer K` indirection is what makes the inner conditional distribute over the key union; a bare
 * `Extract<..., \`${string}_other\`>` would not.
 */
export type PluralTranslationKeyOf<C extends AnyTranslationCatalog> =
  CatalogKeyOf<C> extends infer K
    ? K extends `${infer Base}_other`
      ? Base
      : never
    : never;

/**
 * Every key the SDK's `t` accepts: the singular entries plus the bare handle for each plural.
 *
 * This is the *call-site* key set. It is deliberately **not** the right type for a dictionary: a
 * plural lives in the catalog as `<key>_one` / `<key>_other` while `t()` takes the bare `<key>`, so
 * keying a dictionary on this rejects the very entries a translator has to supply. Use
 * {@link TranslationDictionaryOf} for that.
 */
export type TranslationKeyOf<C extends AnyTranslationCatalog> =
  | Exclude<CatalogKeyOf<C>, `${string}_${PluralSuffix}`>
  | PluralTranslationKeyOf<C>;

/**
 * A translation dictionary for `registerTranslation()` / `translationsForLanguage`.
 *
 * Restricted to the SDK's own keys, so a typo or a leftover key from a previous major is a compile
 * error rather than an override that silently never applies. Keyed on the catalog rather than on
 * {@link TranslationKeyOf} so the `_one` / `_other` plural entries are accepted.
 *
 * SDK copy only needs `_one` / `_other`, but a plural key accepts every category `Intl.PluralRules`
 * can select, so Arabic, Hebrew or Russian can supply `_few`, `_many` and `_zero` and stay checked. A
 * plural suffix on a key that is not plural is rejected.
 */
export type TranslationDictionaryOf<C extends AnyTranslationCatalog> = Partial<
  Record<CatalogKeyOf<C>, string>
> &
  Partial<Record<`${PluralTranslationKeyOf<C>}_${PluralSuffix}`, string>>;

/**
 * A dictionary that also admits keys the SDK does not define, so one instance can carry an
 * application's own copy alongside the SDK's.
 *
 * Nothing catches a mistyped or stale SDK key here — it compiles, then never matches at runtime.
 * {@link TranslationDictionaryOf} already covers the extra plural categories, so a language needing
 * `_few` / `_many` / `_zero` does not have to give up key checking.
 */
export type LooseTranslationDictionaryOf<C extends AnyTranslationCatalog> = Partial<
  Record<CatalogKeyOf<C>, string>
> &
  Record<string, string>;

/** The English copy for a key, used to infer that key's interpolation variables. */
export type CopyFor<C extends AnyTranslationCatalog, K extends string> =
  K extends CatalogKeyOf<C>
    ? C[K]
    : `${K}_other` extends CatalogKeyOf<C>
      ? C[`${K}_other` & CatalogKeyOf<C>]
      : string;

/**
 * Formatter expression keys, matched by prefix so overload resolution stays cheap.
 *
 * An SDK adds its own bundled prose keys through the `Bundled` parameter rather than widening this.
 */
export type FormatterExpressionKey = `timestamp.${string}` | `duration.${string}`;

/**
 * A translation key resolved from a runtime value rather than written literally.
 *
 * The brand is *required*, so a plain `string` is not assignable and the escape hatch has to be taken
 * deliberately via `asDynamicKey()` — which also makes every such site greppable.
 *
 * @example t(asDynamicKey(command.description))
 */
export type DynamicTranslationKey = string & {
  readonly __dynamicTranslationKey: true;
};

/** Keys whose value is English copy, passed inline as the `defaultValue`. */
export type ProseKeyOf<
  C extends AnyTranslationCatalog,
  Bundled extends string = never,
> = Exclude<
  TranslationKeyOf<C>,
  FormatterExpressionKey | Bundled | PluralTranslationKeyOf<C>
>;

/**
 * The SDK's translation function, instantiated once per catalog.
 *
 * Every prose call site passes its English copy inline as i18next's `defaultValue`, so the key stays
 * stable across copy edits and a key missing from a custom dictionary still renders English.
 * Interpolation variables are inferred from that copy, and plural keys require `count`.
 *
 * `Bundled` is the SDK's own set of keys resolved from bundled defaults rather than from an inline
 * default — screen-reader labels and lookup-table entries that are ordinary prose but reach `t()` as
 * runtime values, leaving nowhere to write a default. **It must default to `never`:** defaulting to
 * `string` would collapse the prose overload and silently disable all key checking.
 */
export type StreamTFunctionFor<
  C extends AnyTranslationCatalog,
  Bundled extends string = never,
> = {
  /** Plural key: `count` selects between the `_one` / `_other` copy. */
  <K extends PluralTranslationKeyOf<C>>(
    key: K,
    options: TOptions & { count: number } & InterpolationArgs<CopyFor<C, K>>,
  ): string;
  /** Bundled or formatter key: resolves from bundled defaults, so no inline default. */
  (
    key: FormatterExpressionKey | Bundled,
    options?: TOptions & Record<string, unknown>,
  ): string;
  /**
   * Prose key with its English copy inline.
   *
   * Neither `defaultValue` nor `options` is tied to the key's exact copy. That would mean
   * materialising the union of every copy string in the catalog, and the two checks it would buy are
   * covered elsewhere: the default matching the generated catalog is enforced by the codegen drift
   * gate, and a missing interpolation variable surfaces as a literal `{{ placeholder }}` in the
   * rendered output, which the render tests assert on.
   *
   * Plural keys keep precise typing (see the first overload) because that union is small.
   */
  <K extends ProseKeyOf<C, Bundled>>(
    key: K,
    defaultValue: string,
    options?: TOptions & Record<string, unknown>,
  ): string;
  /** Escape hatch for keys only known at runtime. */
  (
    key: DynamicTranslationKey,
    defaultValueOrOptions?: string | (TOptions & Record<string, unknown>),
    options?: TOptions & Record<string, unknown>,
  ): string;
};

/* ------------------------------------------------------------------------------------------------
 * Date/time
 * ---------------------------------------------------------------------------------------------- */

/**
 * The dayjs/moment surface the formatters actually call.
 *
 * Structural on purpose: naming `moment-timezone` here would leak a type-only dependency into the
 * published `.d.ts`, so consumers without it installed got unresolved types. Bring-your-own-Moment
 * still works — it satisfies this shape.
 *
 * Declared with **method shorthand**, not property-with-function-type, and that is load-bearing: under
 * `strictFunctionTypes` a function *property* is checked contravariantly, so `calendar?: (ref?:
 * unknown) => string` demands an implementation accepting literally anything and Dayjs — whose
 * `calendar` takes a narrower union — is not assignable. Method syntax is checked bivariantly, which is
 * what duck-typing across two date libraries needs.
 *
 * `startOf` deliberately does **not** return `DateTimeLike`. Doing so made the whole type circular, and
 * a real Moment then failed to satisfy it: checking `Moment` against `DateTimeLike` required
 * `startOf`'s return `Moment` to satisfy `DateTimeLike`, which required `startOf` again. Method
 * bivariance could not rescue it, and the failure was silent until a UI SDK's test passed `moment` in.
 * Only `.diff()` is ever called on the result, so that is all the return type promises.
 */
export type DateTimeLike = {
  format(template?: string): string;
  calendar?(referenceTime?: DateTimeReference, formats?: Record<string, string>): string;
  fromNow?(withoutSuffix?: boolean): string;
  diff(other: DateTimeOperand, unit?: DateTimeUnit): number;
  startOf(unit: DateTimeUnit): {
    diff(other: DateTimeOperand, unit?: DateTimeUnit): number;
  };
  valueOf(): number;
};

/**
 * A calendar-unit name (`'day'`, `'week'`, …) and a `diff` operand.
 *
 * Both are `any`, and deliberately so: dayjs and moment each declare their own narrow unions here
 * (`OpUnitType` vs `unitOfTime.Diff`, `ConfigType` vs `MomentInput`), and a structural bridge that must
 * accept either library cannot name one without excluding the other. Narrowing them is what made a real
 * Moment fail to satisfy this type. Core only ever passes literals both libraries accept, and these
 * arguments are inputs — nothing downstream depends on their type.
 */

type DateTimeUnit = any;

type DateTimeOperand = any;

/** Anything a date library will accept as a point in time. */
type DateTimeReference = DateTimeLike | Date | string | number | null | undefined;

export type TDateTimeParserInput = string | number | Date;

export type TDateTimeParserOutput = string | number | Date | DateTimeLike;

export type TDateTimeParser = (input?: TDateTimeParserInput) => TDateTimeParserOutput;

/**
 * A duration, as returned by dayjs's or moment's `.duration()`.
 *
 * `format` is optional because only dayjs's duration plugin provides it; moment durations humanize
 * only.
 */
export type DurationLike = {
  humanize: (withSuffix?: boolean) => string;
  format?: (template?: string) => string;
};

/**
 * A date/time library *module*, as accepted by `Streami18nOptions.DateTimeParser`.
 *
 * Structural for the same reason as {@link DateTimeLike}: this admits `dayjs` and `moment` without
 * naming either. It is the module rather than a parse function because `durationFormatter` needs
 * `.duration()`, which lives on the module.
 *
 * Every member is **method shorthand**, and as with `DateTimeLike` that is load-bearing. As function
 * properties they are checked contravariantly, so `locale?: (...args: unknown[]) => unknown` demanded
 * an implementation accepting anything at all and rejected moment's overloaded, narrower `locale`.
 * Method syntax is bivariant, which is what duck-typing across two libraries needs.
 */
export type DateTimeParserModule = ((input?: TDateTimeParserInput) => DateTimeLike) & {
  duration?(input: number | string): DurationLike;
  extend?(plugin: unknown, option?: unknown): unknown;
  tz?: unknown;
  locale?(...args: never[]): unknown;
};

/* ------------------------------------------------------------------------------------------------
 * Formatters
 * ---------------------------------------------------------------------------------------------- */

/**
 * A translate function loose enough for formatter internals and for accepting any SDK's narrowed `t`.
 *
 * Formatters resolve keys they are handed at runtime (and their own `relativeTime.*` copy), so they
 * cannot be typed against a specific catalog.
 *
 * The parameters are `any` deliberately, and narrowing them breaks callers. An SDK's `t` is a
 * four-overload callable whose key parameter is a union of its own catalog keys; under
 * `strictFunctionTypes` a function *parameter* is checked contravariantly, so a `t` accepting only its
 * own keys is **not** assignable to one declared as accepting any `string`. Typing these as `string` /
 * `Record<string, unknown>` therefore forces a cast at every call site that passes a real `t` in —
 * which was nine of them in `stream-chat-react` alone.
 */
export type LooseTranslateFunction = (
  key: any,
  defaultValueOrOptions?: any,
  options?: any,
) => string;

/**
 * What a formatter is given about the instance it belongs to.
 *
 * Structural rather than the concrete class, so `types.ts` does not have to import `Streami18n.ts`
 * and formatter factories stay testable in isolation.
 */
export type FormatterContext = {
  currentLanguage: string;
  /** The instance's logger, for diagnostics. A malformed formatter argument is not copy. */
  logger: (message?: string) => void;
  /** The date library module. `durationFormatter` needs `.duration()`, which lives here. */
  dateTimeParser: DateTimeParserModule;
  /** Parses a single timestamp, with the active locale and timezone already applied. */
  tDateTimeParser: TDateTimeParser;
  translate: LooseTranslateFunction;
  timezone?: string;
};

export type FormatterFactory<V> = (
  context: FormatterContext,
) => (value: V, lng: string | undefined, options: Record<string, unknown>) => string;

export type TimestampFormatterOptions = {
  /** Render relative to today ("Today at 14:32") via the dayjs calendar plugin. */
  calendar?: boolean | null;
  /** Per-key calendar config. Replaces the locale's calendar wholesale for this key. */
  calendarFormats?: Record<string, string> | string;
  /** A dayjs/moment format template, e.g. `LT` or `dddd L`. */
  format?: string;
  /** Render as "Today" / "Yesterday" / "3d ago" / "2w ago", then fall back to a date. */
  relativeCompact?: boolean;
  relativeCompactMaxDays?: number;
  relativeCompactMaxWeeks?: number;
  /**
   * How a "weeks ago" label rounds, and what bounds the window.
   *
   * `floor` (the default) reports whole elapsed weeks and stops once that count passes
   * `relativeCompactMaxWeeks` — 8 days is "1w ago", 27 days is "3w ago".
   *
   * `ceil` rounds up and bounds on *days* instead, stopping after `relativeCompactMaxWeeks * 7` — 8
   * days is "2w ago", and 22 days falls through to a date. It exists because that is what
   * `stream-chat-react` rendered before its formatter moved here, and changing those labels is a
   * visible UI change rather than a refactor. New call sites should prefer `floor`.
   */
  relativeCompactWeekRounding?: 'ceil' | 'floor';
};

export type DurationFormatterOptions = {
  format?: string;
  withSuffix?: boolean;
};

export type PredefinedFormatters = {
  durationFormatter: FormatterFactory<number | string>;
  fromNowFormatter: FormatterFactory<string | Date>;
  /**
   * Renders a timestamp. `relativeCompact: true` selects the "Today" / "3d ago" wording, which routes
   * through `t()` and is therefore translatable.
   *
   * The React Native SDK's separate `relativeCompactDateFormatter` is gone rather than aliased here: it
   * hardcoded English that no dictionary could reach, and an alias would have been a second name for
   * one behaviour. A `timestamp.*` expression that used it becomes
   * `{{ timestamp | timestampFormatter(relativeCompact: true) }}`.
   */
  timestampFormatter: FormatterFactory<string | Date>;
};

export type CustomFormatters = Record<string, FormatterFactory<never>>;
