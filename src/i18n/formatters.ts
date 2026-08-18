import { isDate, isDayOrMoment, isNumberOrString } from './dayjs';
import type { CalendarFormats } from './dayjs';
import { asDynamicKey } from './translator';
import type {
  DurationFormatterOptions,
  FormatterContext,
  FormatterFactory,
  LooseTranslateFunction,
  PredefinedFormatters,
  TDateTimeParser,
  TimestampFormatterOptions,
} from './types';

/**
 * The `relativeTime.*` keys this module renders, with their English copy.
 *
 * Exported as a catalog fragment because the *call sites* are here, in core, while the *catalog* is
 * generated from each UI SDK's own source. Without this an SDK's codegen cannot see these keys, so they
 * would drop out of its `TranslationCatalog` and an integrator could no longer type them in a
 * dictionary — i.e. could no longer translate relative dates at all. A UI SDK intersects this into its
 * catalog type.
 *
 * Plurals appear as `_one` / `_other` because that is how a dictionary supplies them; English needs no
 * distinction, but a language with different forms does.
 */
export const RELATIVE_TIME_CATALOG = {
  'relativeTime.daysAgo_one': '{{ count }}d ago',
  'relativeTime.daysAgo_other': '{{ count }}d ago',
  'relativeTime.today': 'Today',
  'relativeTime.weeksAgo_one': '{{ count }}w ago',
  'relativeTime.weeksAgo_other': '{{ count }}w ago',
  'relativeTime.yesterday': 'Yesterday',
} as const;

export type RelativeTimeCatalog = typeof RELATIVE_TIME_CATALOG;

/** Defaults for the relative-compact window, matching what both UI SDKs shipped. */
const DEFAULT_RELATIVE_COMPACT_MAX_DAYS = 6;
const DEFAULT_RELATIVE_COMPACT_MAX_WEEKS = 3;

/**
 * Coerces a numeric formatter option.
 *
 * These arrive as strings, not numbers: they are written inside an i18next format expression
 * (`{{ timestamp | timestampFormatter(relativeCompactMaxDays: 10) }}`), and i18next hands every
 * argument over as text. The declared type says `number` because that is what a programmatic caller
 * passes, so both have to be accepted.
 */
const asNumber = (value: unknown, fallback: number) => {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Per-key calendar config may arrive as an object or as a JSON string.
 *
 * The string case is not a quirk to clean up: bundled defaults embed the config inside the i18next
 * expression itself, so by the time it reaches a formatter it is text.
 */
const parseCalendarFormats = (
  value: TimestampFormatterOptions['calendarFormats'],
  logger: (message?: string) => void,
): Record<string, string> | undefined => {
  if (!value) return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch (error) {
    // Reported through the instance's logger, not through `translate` -- a diagnostic is not copy.
    logger(
      `StreamI18n: calendarFormats is not valid JSON, ignoring it: ${value} (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return undefined;
  }
};

/**
 * "Today" / "Yesterday" / "3d ago" / "2w ago", falling back to a short date.
 *
 * Every word goes through `t()`. The React Native SDK shipped this as a standalone formatter with the
 * English baked in, which no dictionary could translate — and because the wording lived in a formatter
 * body rather than a catalog value, the codegen's English-prose guard never saw it either.
 */
const relativeCompactDateString = ({
  maxDays,
  maxWeeks,
  tDateTimeParser,
  timestamp,
  translate,
}: {
  maxDays: number;
  maxWeeks: number;
  tDateTimeParser: TDateTimeParser;
  timestamp: string | Date;
  translate: LooseTranslateFunction;
}): string | null => {
  const parsed = tDateTimeParser(timestamp as string);
  if (!isDayOrMoment(parsed)) return null;

  const now = tDateTimeParser(new Date());
  if (!isDayOrMoment(now)) return null;

  const daysAgo = now.startOf('day').diff(parsed.startOf('day'), 'day');

  // A future timestamp is not "Today" — fall straight through to a date.
  if (daysAgo < 0) return parsed.format('DD/MM/YY');

  if (daysAgo === 0)
    return translate('relativeTime.today', RELATIVE_TIME_CATALOG['relativeTime.today']);
  if (daysAgo === 1)
    return translate(
      'relativeTime.yesterday',
      RELATIVE_TIME_CATALOG['relativeTime.yesterday'],
    );
  // Plural defaults rather than one `defaultValue`: English needs no distinction here, but a language
  // whose plural categories differ has to be able to supply `_one` / `_other` and have i18next select.
  if (daysAgo <= maxDays) {
    return translate('relativeTime.daysAgo', {
      count: daysAgo,
      defaultValue_one: RELATIVE_TIME_CATALOG['relativeTime.daysAgo_one'],
      defaultValue_other: RELATIVE_TIME_CATALOG['relativeTime.daysAgo_other'],
    });
  }

  // `maxWeeks > 0` and a full week elapsed, both required: with `maxWeeks: 0` a 3-day-old timestamp
  // has `Math.floor(3 / 7) === 0`, which would otherwise match and render "0w ago".
  const weeksAgo = Math.floor(daysAgo / 7);
  if (maxWeeks > 0 && daysAgo >= 7 && weeksAgo <= maxWeeks) {
    return translate('relativeTime.weeksAgo', {
      count: weeksAgo,
      defaultValue_one: RELATIVE_TIME_CATALOG['relativeTime.weeksAgo_one'],
      defaultValue_other: RELATIVE_TIME_CATALOG['relativeTime.weeksAgo_other'],
    });
  }

  return parsed.format('DD/MM/YY');
};

const timestampFormatter: FormatterFactory<string | Date> =
  ({ logger, tDateTimeParser, translate }: FormatterContext) =>
  (value, _lng, options) => {
    const {
      calendar,
      calendarFormats,
      format,
      relativeCompact,
      relativeCompactMaxDays,
      relativeCompactMaxWeeks,
    } = options as TimestampFormatterOptions;

    // Nothing renderable: empty rather than the stringified value. `null` used to come out as the
    // literal text "null" and an unparseable string as "Invalid Date", both of which are junk a user
    // can see. `getDateString` has always guarded this; the formatter is a separate path and did not.
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' && !Date.parse(value)) return '';

    if (relativeCompact) {
      const relative = relativeCompactDateString({
        maxDays: asNumber(relativeCompactMaxDays, DEFAULT_RELATIVE_COMPACT_MAX_DAYS),
        maxWeeks: asNumber(relativeCompactMaxWeeks, DEFAULT_RELATIVE_COMPACT_MAX_WEEKS),
        tDateTimeParser,
        timestamp: value,
        translate,
      });
      if (relative !== null) return relative;
    }

    const parsed = tDateTimeParser(value as string);

    if (isDayOrMoment(parsed)) {
      if (calendar && typeof parsed.calendar === 'function') {
        return parsed.calendar(undefined, parseCalendarFormats(calendarFormats, logger));
      }
      return parsed.format(format);
    }
    if (isDate(parsed)) return parsed.toDateString();
    if (isNumberOrString(parsed)) return String(parsed);
    return '';
  };

/**
 * Renders a length of time, e.g. `600000` -> "10 minutes".
 *
 * Goes through the date library's `.duration()` rather than parsing the number as a timestamp — which
 * would read 600000 as "10 minutes past the epoch" and render "57 years ago".
 */
const durationFormatter: FormatterFactory<number | string> =
  ({ dateTimeParser }: FormatterContext) =>
  (value, _lng, options) => {
    const { format, withSuffix } = options as DurationFormatterOptions;
    if (typeof dateTimeParser.duration !== 'function') return String(value);

    const duration = dateTimeParser.duration(value as number);
    // Only dayjs's duration plugin has `.format`; moment durations humanize only.
    if (format && typeof duration.format === 'function') return duration.format(format);
    return duration.humanize(Boolean(withSuffix));
  };

const fromNowFormatter: FormatterFactory<string | Date> =
  ({ tDateTimeParser }: FormatterContext) =>
  (value, _lng, options) => {
    if (value === null || value === undefined) return '';
    const parsed = tDateTimeParser(value as string);
    if (!isDayOrMoment(parsed) || typeof parsed.fromNow !== 'function') return '';
    return parsed.fromNow(
      Boolean((options as { withoutSuffix?: boolean }).withoutSuffix),
    );
  };

/**
 * The formatters registered with i18next by default.
 *
 * `relativeCompactDateFormatter` is an alias rather than its own implementation — see the deprecation
 * note on {@link PredefinedFormatters}.
 */
export const predefinedFormatters: PredefinedFormatters = {
  durationFormatter,
  fromNowFormatter,
  relativeCompactDateFormatter: (context) => (value, lng, options) =>
    timestampFormatter(context)(value, lng, { ...options, relativeCompact: true }),
  timestampFormatter,
};

/* ------------------------------------------------------------------------------------------------
 * getDateString
 * ---------------------------------------------------------------------------------------------- */

export type GetDateStringParams = TimestampFormatterOptions & {
  /** The timestamp to render. */
  messageCreatedAt?: string | Date;
  /** An integrator-supplied override, which wins over everything else. */
  formatDate?: (date: Date) => string;
  /** The key carrying a formatter expression for this timestamp, if there is one. */
  timestampTranslationKey?: string;
  t?: LooseTranslateFunction;
  tDateTimeParser?: TDateTimeParser;
};

/**
 * Resolves a timestamp to a display string.
 *
 * Resolution order, and why: an integrator's `formatDate` wins outright; then the translation key, so
 * a language can restyle the timestamp without touching component props; then the parser. Returns
 * `null` rather than a placeholder when there is nothing sensible to render, so callers can omit the
 * element entirely.
 */
export const getDateString = ({
  calendar,
  calendarFormats,
  format,
  formatDate,
  messageCreatedAt,
  relativeCompact,
  relativeCompactMaxDays,
  relativeCompactMaxWeeks,
  t,
  tDateTimeParser,
  timestampTranslationKey,
}: GetDateStringParams): string | number | null => {
  if (
    !messageCreatedAt ||
    (typeof messageCreatedAt === 'string' && !Date.parse(messageCreatedAt))
  ) {
    return null;
  }

  if (formatDate) return formatDate(new Date(messageCreatedAt));

  // Before the translation-key path, so a caller can ask for relative-compact rendering directly
  // rather than only through a key whose expression sets it. Falls through when it declines (a future
  // date, or no dayjs-like parser), so the normal formatting still applies.
  if (relativeCompact && t && tDateTimeParser) {
    const relative = relativeCompactDateString({
      maxDays: asNumber(relativeCompactMaxDays, DEFAULT_RELATIVE_COMPACT_MAX_DAYS),
      maxWeeks: asNumber(relativeCompactMaxWeeks, DEFAULT_RELATIVE_COMPACT_MAX_WEEKS),
      tDateTimeParser,
      timestamp: messageCreatedAt,
      translate: t,
    });
    if (relative) return relative;
  }

  if (t && timestampTranslationKey) {
    // Only forward options that were actually supplied.
    //
    // These reach i18next as interpolation values and are merged over the arguments the key's own
    // formatter expression declares — so passing `format: undefined` explicitly *overrides*
    // `timestampFormatter(format: HH:mm)` with nothing, and the timestamp renders as a raw ISO string.
    // The caller is usually a component forwarding optional props, so most of these are undefined most
    // of the time.
    const overrides: Record<string, unknown> = {};
    const supplied = {
      calendar,
      calendarFormats,
      format,
      relativeCompact,
      relativeCompactMaxDays,
      relativeCompactMaxWeeks,
    };
    for (const [key, value] of Object.entries(supplied)) {
      if (value !== undefined) overrides[key] = value;
    }

    const translated = t(asDynamicKey(timestampTranslationKey), {
      ...overrides,
      // A `Date`, not the raw value. Integrators override a `timestamp.*` key with their own
      // formatter, and those read `options.timestamp` expecting a Date — passing the string through
      // breaks them with `timestamp.toISOString is not a function`.
      timestamp: new Date(messageCreatedAt),
    });
    // i18next echoes the key back when nothing resolved it, which is how a miss is detected.
    if (translated !== timestampTranslationKey) return translated;
  }

  if (!tDateTimeParser) return null;

  const parsed = tDateTimeParser(messageCreatedAt);

  if (isDayOrMoment(parsed)) {
    if (calendar && typeof parsed.calendar === 'function') {
      return parsed.calendar(
        undefined,
        typeof calendarFormats === 'string' ? undefined : calendarFormats,
      );
    }
    return parsed.format(format);
  }
  if (isDate(parsed)) return parsed.toDateString();
  if (isNumberOrString(parsed)) return parsed;
  return null;
};

/**
 * The same resolution as {@link getDateString}, but always spelling the date out in full.
 *
 * A screen reader announcing "14:32" with no date is ambiguous, so the a11y string ignores the compact
 * and calendar options a visual timestamp uses.
 */
export const getDateStringForA11y = ({
  messageCreatedAt,
  t,
  tDateTimeParser,
  timestampTranslationKey,
}: Pick<
  GetDateStringParams,
  'messageCreatedAt' | 't' | 'tDateTimeParser' | 'timestampTranslationKey'
>): string | number | null =>
  getDateString({
    calendar: false,
    format: 'LLLL',
    messageCreatedAt,
    t,
    tDateTimeParser,
    timestampTranslationKey,
  });

/**
 * Calendar wording used by {@link getCalendarDateStringForA11y}, for the one bundled locale.
 *
 * Only English ships. A language an integrator registers supplies its own wording through
 * `dayjsLocaleConfigForLanguage` (or `registerTranslation`'s third argument) — a per-locale block here
 * is useless on its own without the matching `dayjs/locale/xx` beside it.
 */
export const A11Y_CALENDAR_FORMATS: Record<string, CalendarFormats> = {
  en: {
    lastDay: '[Yesterday]',
    lastWeek: 'dddd',
    nextDay: '[Tomorrow]',
    nextWeek: 'dddd [at] LT',
    sameDay: '[Today]',
    sameElse: 'L',
  },
};

export type GetCalendarDateStringForA11yParams = {
  /**
   * Calendar-format overrides applied over the locale defaults and the `sameElse: 'LL'` substitution.
   * Use it where the visible date deliberately diverges — a channel preview shows `sameDay: 'LT'`, the
   * time rather than "Today".
   */
  calendarFormatOverrides?: Partial<CalendarFormats>;
  /** Calendar wording per language. Defaults to {@link A11Y_CALENDAR_FORMATS}. */
  calendarFormats?: Record<string, CalendarFormats>;
  messageCreatedAt?: string | Date;
  tDateTimeParser?: TDateTimeParser;
  /**
   * The UI language, used to pick calendar wording. Plain `string`: it indexes `calendarFormats`, which
   * an integrator extends for whatever language they registered — not `stream-chat`'s
   * auto-translation `TranslationLanguage` union.
   */
  userLanguage?: string;
};

/**
 * A TTS-friendly calendar string, preserving relative wording.
 *
 * Distinct from {@link getDateStringForA11y}, which spells the date out in full via `LLLL`. Both exist
 * because the two UI SDKs arrived at different answers and both are defensible: this one keeps
 * "Today"/"Yesterday"/weekday names from the locale's calendar and substitutes `LL` ("April 8, 2026")
 * only into the `sameElse` slot, because iOS VoiceOver reads a numeric date like "04/08/2026"
 * character by character. Do not collapse them into one — that would silently change one SDK's
 * announced labels.
 *
 * Returns `undefined` when there is nothing to announce, including when the parser has no calendar
 * plugin, so the caller omits the label rather than announcing a malformed date.
 */
export const getCalendarDateStringForA11y = ({
  calendarFormatOverrides,
  calendarFormats = A11Y_CALENDAR_FORMATS,
  messageCreatedAt,
  tDateTimeParser,
  userLanguage,
}: GetCalendarDateStringForA11yParams): string | undefined => {
  if (
    !messageCreatedAt ||
    (typeof messageCreatedAt === 'string' && !Date.parse(messageCreatedAt)) ||
    !tDateTimeParser
  ) {
    return undefined;
  }

  const parsed = tDateTimeParser(messageCreatedAt);
  if (!isDayOrMoment(parsed) || !parsed.calendar) return undefined;

  const localeFormats =
    (userLanguage && calendarFormats[userLanguage]) || calendarFormats.en;

  return parsed.calendar(undefined, {
    ...localeFormats,
    sameElse: 'LL',
    ...calendarFormatOverrides,
  });
};
