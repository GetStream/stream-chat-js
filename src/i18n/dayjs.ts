import Dayjs from 'dayjs';
import calendar from 'dayjs/plugin/calendar.js';
import duration from 'dayjs/plugin/duration.js';
import localeData from 'dayjs/plugin/localeData.js';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import timezone from 'dayjs/plugin/timezone.js';
import updateLocale from 'dayjs/plugin/updateLocale.js';
import utc from 'dayjs/plugin/utc.js';

import type {
  DateTimeLike,
  DateTimeParserModule,
  TDateTimeParserInput,
  TDateTimeParserOutput,
} from './types';

/**
 * The calendar-plugin config shape. Not part of dayjs's own `ILocale`, so it has to be declared here.
 *
 * Supplying it is how relative wording ("heute um", "ieri alle") gets localized — no dayjs locale file
 * defines `calendar`, which is the single most common surprise when adding a language.
 */
export type CalendarFormats = {
  lastDay: string;
  lastWeek: string;
  nextDay: string;
  nextWeek: string;
  sameDay: string;
  sameElse: string;
};

/**
 * A dayjs locale config, as accepted by `dayjsLocaleConfigForLanguage` and by
 * `registerTranslation`'s third argument.
 *
 * Typing this as a bare `Partial<ILocale>` makes passing a calendar config a TS2345 "no properties in
 * common" error, which is exactly the wording an integrator hits first — hence the explicit
 * `calendar`.
 */
export type DayjsLocaleConfig = Partial<ILocale> & { calendar?: CalendarFormats };

/**
 * The dayjs module surface this file drives: our own `dayjs`, or a module an integrator supplied
 * through `DateTimeParser`. Method shorthand, so a real `typeof dayjs` satisfies it -- as function
 * properties these would be checked contravariantly and rejected.
 *
 * `Ls`, `locale` and `updateLocale` are optional because a module only has them once the plugins are
 * registered, and because a non-dayjs parser (a Moment) has a different shape entirely.
 */
type DayjsExtendable = object & {
  extend?(plugin: unknown, option?: unknown): unknown;
  Ls?: Record<string, unknown>;
  locale?(preset: unknown, object?: unknown, isLocal?: boolean): unknown;
  updateLocale?(name: string, config: unknown): unknown;
};

/** The module locale helpers default to, when a caller does not name one. */
const ownDayjs = () => Dayjs as unknown as DayjsExtendable;

/**
 * The English locale skeleton a custom locale is merged over, so a partial config still has month and
 * weekday names to fall back on.
 */
const EN_LOCALE_FALLBACK = {
  /**
   * `formats` and `relativeTime` are empty on purpose, and are not removable: `Dayjs.locale()` takes an
   * `ILocale`, which declares both as required, so omitting them is a type error. Empty means "inherit
   * dayjs's own defaults", which is the intent.
   */
  formats: {},
  relativeTime: {},
  months: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  weekdays: [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ],
};

/**
 * The plugins the formatters depend on, in dependency order: `timezone` builds on `utc`.
 */
const REQUIRED_PLUGINS = [
  updateLocale,
  utc,
  timezone,
  localizedFormat,
  calendar,
  localeData,
  relativeTime,
  duration,
];

/**
 * Modules already extended. A `WeakSet` rather than a boolean because the module to extend is not
 * always ours -- see {@link ensureDayjsPlugins}.
 */
const extendedModules = new WeakSet<object>();

/**
 * Registers the dayjs plugins the formatters need, once per module.
 *
 * Takes the module to extend, defaulting to our own `dayjs`. Passing it matters: an integrator
 * supplying `DateTimeParser` may hand over a *different physical copy* of dayjs, and extending ours
 * leaves theirs without the plugins. That failure is silent and total -- `.calendar()` is simply
 * absent, and `format('LT')` returns the literal string `"LT"` because `localizedFormat` never
 * registered the token.
 *
 * Deliberately **not** done at module scope. Module-scope `Dayjs.extend(...)` is a side effect, which
 * would force `stream-chat` to declare `sideEffects` and would make importing this module do work
 * whether or not anything uses it. Calling it from both the constructor and `defaultDateTimeParser`
 * covers the two ways the formatters can be reached, including a standalone `getDateString()` call
 * with no `Streami18n` instance in play.
 *
 * Idempotent twice over: tracked here, and dayjs itself no-ops a repeated `extend` via the plugin's
 * `$i` marker. The module is recorded *after* the extends run, so a throw does not leave it marked as
 * done.
 *
 * `timezone` is included because it depends on `utc` and callers can set `timezone` at any point;
 * registering it lazily on first use would leave the plugin missing for an instance that only sets
 * `timezone` later.
 */
export const ensureDayjsPlugins = (
  module: DayjsExtendable = Dayjs as unknown as DayjsExtendable,
) => {
  if (extendedModules.has(module)) return;
  if (typeof module.extend !== 'function') return;

  for (const plugin of REQUIRED_PLUGINS) module.extend(plugin);
  extendedModules.add(module);
};

/**
 * The parser used when none is supplied, and by `getDateString()` called outside an instance.
 *
 * Note there is no `import 'dayjs/locale/en'` anywhere: dayjs bundles `en` and has it registered
 * before any import runs (`Object.keys(Dayjs.Ls)` is already `['en']`), so that import — which both UI
 * SDKs carried — was a no-op.
 */
export const defaultDateTimeParser = (input?: TDateTimeParserInput) => {
  ensureDayjsPlugins();
  return Dayjs(input);
};

/**
 * The dayjs module itself, with plugins registered.
 *
 * `Streami18n.DateTimeParser` has to be the *module*, not a parse function, because
 * `durationFormatter` calls `.duration()` — which lives on the module, not on a parsed instance.
 */
export const getDefaultDateTimeParserModule = (): DateTimeParserModule => {
  ensureDayjsPlugins();
  return Dayjs as unknown as DateTimeParserModule;
};

/**
 * Registers or updates a dayjs locale without changing the global locale.
 *
 * Takes the module to register on, defaulting to ours. Passing it matters for the same reason
 * {@link ensureDayjsPlugins} takes one: an integrator supplying `DateTimeParser` may hand over a second
 * physical copy of dayjs, and registering on ours would leave the locale absent from the module that
 * actually formats the dates -- so a `calendar` config or a `dayjsLocaleConfigForLanguage` would be
 * silently ignored.
 */
export const addOrUpdateDayjsLocale = (
  language: string,
  config: DayjsLocaleConfig,
  module: DayjsExtendable = ownDayjs(),
) => {
  ensureDayjsPlugins(module);

  if (dayjsLocaleExists(language, module)) {
    module.updateLocale?.(language, { ...config });
    return;
  }
  // Merged over the English skeleton so missing keys still resolve.
  module.locale?.({ name: language, ...EN_LOCALE_FALLBACK, ...config }, undefined, true);
};

export const dayjsLocaleExists = (
  language: string,
  module: DayjsExtendable = ownDayjs(),
) => Object.keys(module.Ls ?? {}).includes(language);

/**
 * Whether a parser is dayjs, as opposed to a Moment the integrator brought.
 *
 * A property check rather than the `.extend !== undefined` both UI SDKs used, which throws on `null`.
 */
export const isDayjsLike = (parser: unknown): parser is DateTimeParserModule =>
  typeof parser === 'function' &&
  typeof (parser as DateTimeParserModule).extend === 'function';

/** Whether a parser supports `.tz()`, i.e. dayjs with the timezone plugin, or moment-timezone. */
export const supportsTimezone = (parser: unknown): boolean =>
  typeof parser === 'function' && typeof (parser as { tz?: unknown }).tz === 'function';

export const isDate = (value: TDateTimeParserOutput): value is Date =>
  value instanceof Date;

export const isNumberOrString = (
  value: TDateTimeParserOutput,
): value is number | string => typeof value === 'number' || typeof value === 'string';

/** Whether a parser output is a dayjs or Moment object rather than a raw Date/string/number. */
export const isDayOrMoment = (value: TDateTimeParserOutput): value is DateTimeLike =>
  typeof value === 'object' &&
  value !== null &&
  !(value instanceof Date) &&
  typeof (value as DateTimeLike).format === 'function';
