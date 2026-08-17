import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDateString, StreamI18n } from '../../../src/i18n';

/**
 * A key whose formatter expression carries its own arguments — the shape a UI SDK actually ships.
 *
 * Multi-argument, because that is where the bug this suite pins was: a single argument masked it.
 */
const KEY = 'timestamp.MessageTimestamp';
const KEY_VALUE = '{{ timestamp | timestampFormatter(calendar: false; format: HH:mm) }}';
const AT = '2019-04-03T14:42:47.087Z';

const setup = async (runtimeDefaults: Record<string, string> = { [KEY]: KEY_VALUE }) => {
  const i18n = new StreamI18n({ logger: () => {}, runtimeDefaults });
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
    const i18n = new StreamI18n({
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
