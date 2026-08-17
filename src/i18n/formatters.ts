import { isDate, isDayOrMoment, isNumberOrString } from './dayjs';
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
  translate: LooseTranslateFunction,
): Record<string, string> | undefined => {
  if (!value) return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    translate(
      asDynamicKey('__invalidCalendarFormats'),
      `StreamI18n: calendarFormats is not valid JSON, ignoring it: ${value}`,
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

  if (daysAgo <= 0) return translate('relativeTime.today', 'Today');
  if (daysAgo === 1) return translate('relativeTime.yesterday', 'Yesterday');
  if (daysAgo <= maxDays) {
    return translate('relativeTime.daysAgo', '{{ count }}d ago', { count: daysAgo });
  }

  const weeksAgo = Math.floor(daysAgo / 7);
  if (weeksAgo <= maxWeeks) {
    return translate('relativeTime.weeksAgo', '{{ count }}w ago', { count: weeksAgo });
  }

  return parsed.format('DD/MM/YY');
};

const timestampFormatter: FormatterFactory<string | Date> =
  ({ tDateTimeParser, translate }: FormatterContext) =>
  (value, _lng, options) => {
    const {
      calendar,
      calendarFormats,
      format,
      relativeCompact,
      relativeCompactMaxDays,
      relativeCompactMaxWeeks,
    } = options as TimestampFormatterOptions;

    if (value === null || value === undefined) return '';

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
        return parsed.calendar(
          undefined,
          parseCalendarFormats(calendarFormats, translate),
        );
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

  if (t && timestampTranslationKey) {
    const translated = t(asDynamicKey(timestampTranslationKey), {
      calendar,
      calendarFormats,
      format,
      relativeCompact,
      relativeCompactMaxDays,
      relativeCompactMaxWeeks,
      timestamp: messageCreatedAt,
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
