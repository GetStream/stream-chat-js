import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDefaultTranslatorFunction,
  defaultDateTimeParser,
  getCalendarDateStringForA11y,
  getDateString,
  Streami18n,
} from '../../../src/i18n';
import type { TDateTimeParserInput } from '../../../src/i18n';

/**
 * A key whose formatter expression carries its own arguments — the shape a UI SDK actually ships.
 *
 * Multi-argument, because that is where the bug this suite pins was: a single argument masked it.
 */
const KEY = 'timestamp.MessageTimestamp';
const KEY_VALUE = '{{ timestamp | timestampFormatter(calendar: false; format: HH:mm) }}';
const AT = '2019-04-03T14:42:47.087Z';

/** `Streami18n` with the catalog left open, so a test can supply an arbitrary formatter expression. */
const StreamI18nForLogger = Streami18n as unknown as new (options: {
  logger: (message?: string) => void;
  runtimeDefaults: Record<string, string>;
}) => Streami18n;

const setup = async (runtimeDefaults: Record<string, string> = { [KEY]: KEY_VALUE }) => {
  const i18n = new Streami18n({ logger: () => {}, runtimeDefaults });
  return i18n.init();
};

describe('getDateString', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2019-04-03T18:00:00.000Z'));
  });

  /**
   * Regression, and the reason this file exists.
   *
   * The options `getDateString` forwards reach i18next as interpolation values and are merged *over*
   * the arguments the key's own formatter expression declares. Forwarding `format: undefined` — which
   * is the normal case, since callers are components passing optional props straight through —
   * therefore overrode `timestampFormatter(format: HH:mm)` with nothing, and the timestamp rendered as
   * a raw ISO string (`2019-04-03T14:42:47+00:00`) instead of `14:42`.
   *
   * It fails only through this path: calling `t(KEY, { timestamp })` directly renders correctly, which
   * is what made it invisible in the unit tests for the formatter itself.
   */
  it('does not let undefined options override the key’s own formatter arguments', async () => {
    const { t, tDateTimeParser } = await setup();

    expect(
      getDateString({
        calendar: undefined,
        calendarFormats: undefined,
        format: undefined,
        formatDate: undefined,
        messageCreatedAt: AT,
        t: t as never,
        tDateTimeParser,
        timestampTranslationKey: KEY,
      }),
    ).toBe('14:42');
  });

  it('still lets a caller override the key’s arguments when it supplies them', async () => {
    const { t, tDateTimeParser } = await setup();

    expect(
      getDateString({
        format: 'YYYY',
        messageCreatedAt: AT,
        t: t as never,
        tDateTimeParser,
        timestampTranslationKey: KEY,
      }),
    ).toBe('2019');
  });

  it('renders the same through t() and through getDateString', async () => {
    const { t, tDateTimeParser } = await setup();
    const direct = (t as unknown as (k: string, o: Record<string, unknown>) => string)(
      KEY,
      {
        timestamp: AT,
      },
    );

    expect(
      getDateString({
        messageCreatedAt: AT,
        t: t as never,
        tDateTimeParser,
        timestampTranslationKey: KEY,
      }),
    ).toBe(direct);
  });

  it('lets an integrator formatDate win over everything', async () => {
    const { t, tDateTimeParser } = await setup();

    expect(
      getDateString({
        formatDate: () => 'CUSTOM',
        messageCreatedAt: AT,
        t: t as never,
        tDateTimeParser,
        timestampTranslationKey: KEY,
      }),
    ).toBe('CUSTOM');
  });

  it('falls through to the parser when the key resolves to nothing', async () => {
    const { t, tDateTimeParser } = await setup({});

    expect(
      getDateString({
        format: 'YYYY',
        messageCreatedAt: AT,
        t: t as never,
        tDateTimeParser,
        timestampTranslationKey: 'timestamp.NotDeclared',
      }),
    ).toBe('2019');
  });

  it('returns null for a missing or unparseable timestamp', async () => {
    const { t, tDateTimeParser } = await setup();

    expect(
      getDateString({ messageCreatedAt: undefined, t: t as never, tDateTimeParser }),
    ).toBe(null);
    expect(
      getDateString({ messageCreatedAt: 'not a date', t: t as never, tDateTimeParser }),
    ).toBe(null);
  });
});

describe('getDateString — options handed to a custom formatter', () => {
  /**
   * Integrators override a `timestamp.*` key with their own formatter and read `options.timestamp`,
   * which they expect to be a `Date`. Forwarding the raw value breaks them with
   * `timestamp.toISOString is not a function`.
   */
  it('passes the timestamp as a Date', async () => {
    const seen: Record<string, unknown>[] = [];
    const i18n = new Streami18n({
      logger: () => {},
      runtimeDefaults: { [KEY]: KEY_VALUE },
      formatters: {
        timestampFormatter: () => (v, l, o) => {
          seen.push(o as never);
          return 'SPY';
        },
      },
    });
    const { t, tDateTimeParser } = await i18n.init();

    getDateString({
      messageCreatedAt: AT,
      t: t as never,
      tDateTimeParser,
      timestampTranslationKey: KEY,
    });

    expect(seen[0].timestamp).toBeInstanceOf(Date);
    expect((seen[0].timestamp as Date).toISOString()).toBe(AT);
  });
});

describe('timestampFormatter — nothing renderable', () => {
  /**
   * `null` used to render the literal text "null" and an unparseable string "Invalid Date". Both are
   * junk a user can see, and both reached the UI because the formatter is a separate path from
   * `getDateString`, which has always guarded this.
   */
  // `undefined` is deliberately absent: i18next skips interpolation when the value is undefined, so it
  // never reaches the formatter and the raw expression comes through. That is unchanged behaviour, and a
  // sign the option name is misspelled at the call site.
  it.each([
    ['null', null],
    ['an unparseable string', 'not a date'],
    ['an empty string', ''],
  ])('renders empty for %s', async (_label, value) => {
    const i18n = new Streami18n({
      logger: () => {},
      runtimeDefaults: { [KEY]: KEY_VALUE },
    });
    const { t } = await i18n.init();

    expect(
      (t as unknown as (k: string, o: Record<string, unknown>) => string)(KEY, {
        timestamp: value,
      }),
    ).toBe('');
  });
});

/**
 * The React Native SDK's a11y variant, which is deliberately *not* the same function as
 * `getDateStringForA11y`. It keeps the locale's relative wording and substitutes `LL` only into
 * `sameElse`, because iOS VoiceOver reads a numeric date character by character. Consolidating the two
 * SDKs' i18n layers initially collapsed both into the `LLLL` variant, which would have silently
 * changed every announced date label in the RN SDK.
 */
describe('getCalendarDateStringForA11y', () => {
  const parser = (input?: TDateTimeParserInput) => defaultDateTimeParser(input);

  // The suites above freeze the clock to `AT`; these assertions are about the distance between now and
  // the timestamp, so they need the real one back.
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('keeps relative wording for a recent date', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(
      getCalendarDateStringForA11y({
        messageCreatedAt: yesterday,
        tDateTimeParser: parser,
      }),
    ).toBe('Yesterday');
  });

  it('spells an older date out rather than leaving it numeric', () => {
    expect(
      getCalendarDateStringForA11y({ messageCreatedAt: AT, tDateTimeParser: parser }),
    ).toBe('April 3, 2019');
  });

  it('applies calendarFormatOverrides over the locale defaults', () => {
    const now = new Date();
    // What ChannelPreviewStatus does: show the time, not the word "Today".
    const rendered = getCalendarDateStringForA11y({
      calendarFormatOverrides: { sameDay: 'LT' },
      messageCreatedAt: now,
      tDateTimeParser: parser,
    });
    expect(rendered).not.toBe('Today');
    expect(rendered).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns undefined rather than a malformed date when there is nothing to announce', () => {
    expect(getCalendarDateStringForA11y({ tDateTimeParser: parser })).toBeUndefined();
    expect(
      getCalendarDateStringForA11y({
        messageCreatedAt: 'not a date',
        tDateTimeParser: parser,
      }),
    ).toBeUndefined();
    expect(getCalendarDateStringForA11y({ messageCreatedAt: AT })).toBeUndefined();
  });
});

/**
 * The relative-compact branch matrix.
 *
 * Ported from the React SDK, which owned it before the runtime moved here — it was asserting this
 * module's behaviour through a thin re-export. Four of these boundaries are regressions found while
 * porting: a future timestamp rendering as "Today", `relativeCompactMaxWeeks: 0` rendering "0w ago",
 * `relativeCompact` being ignored on the direct `getDateString` path, and the weeks branch firing
 * before a full week had elapsed.
 *
 * `createDefaultTranslatorFunction` stands in for `t`: it honours the inline defaults and the
 * `defaultValue_one` / `defaultValue_other` pair exactly as i18next would, which is the shape the
 * formatter passes for the plural cases.
 */
describe('getDateString — relativeCompact', () => {
  const FIXED_NOW = new Date('2025-02-19T12:00:00.000Z');
  const t = createDefaultTranslatorFunction();
  const tDateTimeParser = (input?: TDateTimeParserInput) => defaultDateTimeParser(input);
  const daysBefore = (n: number) =>
    new Date(FIXED_NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  const render = (messageCreatedAt: string, options: Record<string, unknown> = {}) =>
    getDateString({
      messageCreatedAt,
      relativeCompact: true,
      t,
      tDateTimeParser,
      ...options,
    });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
  });

  it('renders today and yesterday as words', () => {
    expect(render(FIXED_NOW.toISOString())).toBe('Today');
    expect(render(daysBefore(1))).toBe('Yesterday');
  });

  it('renders 2–6 days as a day count', () => {
    expect(render(daysBefore(2))).toBe('2d ago');
    expect(render(daysBefore(6))).toBe('6d ago');
  });

  it('renders 1–3 weeks as a week count', () => {
    expect(render(daysBefore(7))).toBe('1w ago');
    expect(render(daysBefore(21))).toBe('3w ago');
  });

  it('falls back to a date beyond the week window', () => {
    expect(render(daysBefore(28))).toBe('22/01/25');
  });

  it('renders a future timestamp as a date, not as "Today"', () => {
    const tomorrow = new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
    expect(render(tomorrow)).toBe('20/02/25');
  });

  it('never renders "0w ago" when relativeCompactMaxWeeks is 0', () => {
    // `Math.floor(3 / 7) === 0`, which matched the weeks branch before the guard was added.
    expect(render(daysBefore(3), { relativeCompactMaxWeeks: 0 })).toBe('3d ago');
    expect(render(daysBefore(9), { relativeCompactMaxWeeks: 0 })).toBe('10/02/25');
  });

  it('honours relativeCompactMaxDays', () => {
    expect(render(daysBefore(4), { relativeCompactMaxDays: 3 })).not.toBe('4d ago');
    expect(render(daysBefore(3), { relativeCompactMaxDays: 3 })).toBe('3d ago');
  });

  it('is inert without both a translator and a parser', () => {
    expect(render(daysBefore(1), { t: undefined })).not.toBe('Yesterday');
    expect(render(daysBefore(1), { tDateTimeParser: undefined })).not.toBe('Yesterday');
  });
});

/**
 * `calendarFormats` arriving as a string is not a quirk: a bundled default embeds the config inside the
 * i18next expression, so the formatter receives text. Malformed text is a developer mistake, and the
 * report goes to the instance logger rather than through `translate` — a diagnostic is not copy, and
 * routing it through the translator was the original bug here.
 */
describe('timestampFormatter — malformed calendarFormats', () => {
  const KEY_BAD = 'timestamp.MessageTimestamp';

  it('reports invalid JSON through the instance logger and still renders', async () => {
    const logger = vi.fn();
    const i18n = new StreamI18nForLogger({
      logger,
      runtimeDefaults: {
        // A bare non-JSON word. A brace-wrapped malformation never reaches the formatter at all --
        // i18next's own argument parser drops the whole argument first, so nothing is logged and the
        // timestamp silently renders unformatted. Worth knowing: this guard only catches the subset
        // i18next hands through.
        [KEY_BAD]:
          '{{ timestamp | timestampFormatter(calendar: true; calendarFormats: notjson) }}',
      },
    });
    const { t } = await i18n.init();

    const rendered = t(KEY_BAD, { timestamp: AT });

    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('calendarFormats is not valid JSON'),
    );
    // The malformed argument is dropped, not fatal — the calendar still renders, just with the
    // locale's own formats.
    expect(rendered).toBe('04/03/2019');
  });

  it('accepts a well-formed JSON string', async () => {
    const logger = vi.fn();
    const i18n = new StreamI18nForLogger({
      logger,
      runtimeDefaults: {
        [KEY_BAD]:
          '{{ timestamp | timestampFormatter(calendar: true; calendarFormats: {"sameElse":"YYYY"}) }}',
      },
    });
    const { t } = await i18n.init();

    expect(t(KEY_BAD, { timestamp: AT })).toBe('2019');
    expect(logger).not.toHaveBeenCalled();
  });
});
