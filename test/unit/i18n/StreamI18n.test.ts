import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type DateTimeParserModule,
  isDayOrMoment,
  RELATIVE_TIME_CATALOG,
  StreamI18n,
  type StreamI18nState,
  type TDateTimeParserOutput,
} from '../../../src/i18n';
import {
  fixtureRuntimeDefaults,
  type FixtureBundledKey,
  type FixtureCatalog,
} from './fixtures';

const setup = (options: Record<string, unknown> = {}) =>
  new StreamI18n<FixtureCatalog, FixtureBundledKey>({
    logger: () => {},
    runtimeDefaults: fixtureRuntimeDefaults,
    ...options,
  });

describe('StreamI18n', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T14:32:00.000Z'));
  });

  describe('formatters', () => {
    it('renders a timestamp through its format template', async () => {
      const { t } = await setup().init();
      expect(
        t('timestamp.MessageTimestamp', { timestamp: '2026-03-13T14:32:00.000Z' }),
      ).toBe('2:32 PM');
    });

    it('renders a calendar timestamp', async () => {
      const { t } = await setup().init();
      expect(
        t('timestamp.DateSeparator', { timestamp: '2026-03-13T09:00:00.000Z' }),
      ).toBe('Today at 9:00 AM');
    });

    /**
     * Regression: a duration has to go through the date library's `.duration()`. Parsing the number as
     * a timestamp instead reads 600000 as "ten minutes past the epoch" and renders "57 years ago".
     */
    it('renders a duration as a length of time, not a date', async () => {
      const { t } = await setup().init();
      expect(t('duration.messageReminder', { milliseconds: 1000 * 60 * 10 })).toBe(
        'in 10 minutes',
      );
    });

    it('leaves no uninterpolated placeholders in any bundled default', async () => {
      const { t } = await setup().init();
      for (const key of Object.keys(fixtureRuntimeDefaults)) {
        const rendered = t(key as never, {
          milliseconds: 1000,
          timestamp: '2026-03-13T14:32:00.000Z',
        });
        expect(rendered, `${key} left a placeholder`).not.toContain('{{');
      }
    });

    it('accepts a custom formatter and an override of a predefined one', async () => {
      const i18n = setup({
        formatters: {
          shout: () => (value: unknown) => String(value).toUpperCase(),
        },
      });
      i18n.registerTranslation('en', { 'common.cancel.label': '{{ word | shout }}' });
      const { t } = await i18n.init();
      expect(t('common.cancel.label', 'Cancel', { word: 'cancel' })).toBe('CANCEL');
    });
  });

  describe('plurals and interpolation', () => {
    it('selects a plural category and interpolates', async () => {
      const i18n = setup();
      i18n.registerTranslation('en', {
        'channel.memberCount.title_one': '{{ count }} member',
        'channel.memberCount.title_other': '{{ count }} members',
      });
      const { t } = await i18n.init();

      expect(t('channel.memberCount.title', { count: 1 })).toBe('1 member');
      expect(t('channel.memberCount.title', { count: 5 })).toBe('5 members');
    });

    it('interpolates a prose default', async () => {
      const { t } = await setup().init();
      expect(t('common.greeting.text', 'Hello {{ name }}', { name: 'Ada' })).toBe(
        'Hello Ada',
      );
    });
  });

  describe('state store', () => {
    it('publishes the live translator, so a late subscriber sees it immediately', async () => {
      const i18n = setup();
      await i18n.init();

      const seen: StreamI18nState<FixtureCatalog, FixtureBundledKey>[] = [];
      // `subscribe` fires synchronously with the current value — that is what removes the
      // callback-registration ordering problem the listener-based API had.
      const unsubscribe = i18n.state.subscribe((state) => seen.push(state));

      expect(seen).toHaveLength(1);
      expect(seen[0].initialized).toBe(true);
      expect(seen[0].language).toBe('en');
      unsubscribe();
    });

    it('publishes a language change', async () => {
      const i18n = setup();
      i18n.registerTranslation('de', { 'common.cancel.label': 'Abbrechen' });
      await i18n.init();

      const languages: string[] = [];
      const unsubscribe = i18n.state.subscribeWithSelector(
        (state) => ({ language: state.language }),
        ({ language }) => languages.push(language),
      );

      await i18n.setLanguage('de');

      expect(languages).toEqual(['en', 'de']);
      expect(i18n.t('common.cancel.label', 'Cancel')).toBe('Abbrechen');
      unsubscribe();
    });

    it('exposes t, language and initialized as state-backed getters', async () => {
      const i18n = setup();
      expect(i18n.initialized).toBe(false);
      await i18n.init();
      expect(i18n.initialized).toBe(true);
      expect(i18n.currentLanguage).toBe('en');
      expect(typeof i18n.t).toBe('function');
    });
  });

  describe('init', () => {
    it('is idempotent and shares one promise across concurrent callers', async () => {
      const i18n = setup();
      const spy = vi.spyOn(i18n.i18nInstance, 'init');

      const [a, b] = await Promise.all([i18n.init(), i18n.init()]);
      await i18n.init();

      // Two independent consumers (a chat root and an overlay host) both call this.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
    });

    it('resolves to the same object the state store holds', async () => {
      const i18n = setup();
      const state = await i18n.init();
      expect(state).toEqual(i18n.state.getLatestValue());
    });
  });

  describe('overrideTFunction', () => {
    it('applies after init', async () => {
      const i18n = setup();
      await i18n.init();
      i18n.overrideTFunction((() => 'OVERRIDDEN') as never);
      expect(i18n.t('common.cancel.label', 'Cancel')).toBe('OVERRIDDEN');
    });

    /** The queued-override race in the listener-based design: init must not undo a pre-init override. */
    it('survives a later init', async () => {
      const i18n = setup();
      i18n.overrideTFunction((() => 'OVERRIDDEN') as never);
      await i18n.init();
      expect(i18n.t('common.cancel.label', 'Cancel')).toBe('OVERRIDDEN');
    });

    it('survives a later setLanguage', async () => {
      const i18n = setup();
      i18n.registerTranslation('de', { 'common.cancel.label': 'Abbrechen' });
      await i18n.init();
      i18n.overrideTFunction((() => 'OVERRIDDEN') as never);
      await i18n.setLanguage('de');
      expect(i18n.t('common.cancel.label', 'Cancel')).toBe('OVERRIDDEN');
    });
  });

  describe('setLanguage', () => {
    it('returns nothing, so no caller can cache a translator that goes stale', async () => {
      const i18n = setup();
      await i18n.init();
      await expect(i18n.setLanguage('de')).resolves.toBeUndefined();
    });

    it('takes effect before init and is applied at init', async () => {
      const i18n = setup();
      i18n.registerTranslation('de', { 'common.cancel.label': 'Abbrechen' });
      await i18n.setLanguage('de');
      const { t } = await i18n.init();
      expect(i18n.currentLanguage).toBe('de');
      expect(t('common.cancel.label', 'Cancel')).toBe('Abbrechen');
    });
  });

  describe('timezone', () => {
    it('renders in the configured zone', async () => {
      const { t } = await setup({ timezone: 'Asia/Tokyo' }).init();
      // 14:32 UTC is 23:32 in Tokyo.
      expect(
        t('timestamp.MessageTimestamp', { timestamp: '2026-03-13T14:32:00.000Z' }),
      ).toBe('11:32 PM');
    });
  });

  describe('disableDateTimeTranslations', () => {
    it('keeps dates in English for a registered language', async () => {
      const i18n = setup({ disableDateTimeTranslations: true, language: 'de' });
      i18n.registerTranslation('de', { 'common.cancel.label': 'Abbrechen' });
      const { t } = await i18n.init();
      expect(
        t('timestamp.DateSeparator', { timestamp: '2026-03-13T09:00:00.000Z' }),
      ).toBe('Today at 9:00 AM');
    });
  });

  describe('logging', () => {
    /** `JSON.stringify(error)` renders an Error as `{}`, which is how these used to be logged. */
    it('logs an Error by message rather than as an empty object', async () => {
      const logger = vi.fn();
      const i18n = setup({ logger });
      await i18n.init();
      vi.spyOn(i18n.i18nInstance, 'changeLanguage').mockRejectedValue(new Error('boom'));

      await i18n.setLanguage('de');

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('boom'));
      expect(logger).not.toHaveBeenCalledWith(expect.stringContaining('{}'));
    });
  });

  describe('getAvailableLanguages', () => {
    it('includes languages carrying only the bundled defaults', async () => {
      const i18n = setup({ language: 'de' });
      await i18n.init();
      expect(i18n.getAvailableLanguages()).toContain('de');
      // ...while registeredLanguages stays narrower, which is what makes the G3 warning possible.
      expect(i18n.registeredLanguages.has('de')).toBe(false);
    });
  });
});

describe('DateTimeLike', () => {
  /**
   * Regression: `DateTimeLike` must be declared with **method shorthand**, not
   * property-with-function-type. Under `strictFunctionTypes` a function property is checked
   * contravariantly, which makes a real Dayjs instance unassignable — its `calendar` takes a narrower
   * reference type than a permissive structural signature demands. Method syntax is bivariant, which is
   * what duck-typing across dayjs and moment needs.
   *
   * A type-level assertion, so this fails at `yarn types` rather than at runtime.
   */
  it('accepts a real dayjs instance', async () => {
    const i18n = setup();
    const { tDateTimeParser } = await i18n.init();
    const parsed = tDateTimeParser('2026-03-13T14:32:00.000Z');

    // If `DateTimeLike` regresses to property syntax, assigning the parser output fails to compile.
    const asDateTimeLike: TDateTimeParserOutput = parsed;
    expect(asDateTimeLike).toBeDefined();
    expect(isDayOrMoment(asDateTimeLike)).toBe(true);
  });

  /**
   * Regression: a Moment must satisfy `DateTimeLike` too. The docs promise bring-your-own-Moment, and
   * it was broken — `startOf` returned `DateTimeLike`, so checking Moment against it required Moment's
   * `startOf` return (a Moment) to satisfy `DateTimeLike`, requiring `startOf` again. Method bivariance
   * does not break that cycle. Narrow unit unions on `diff`/`startOf` compounded it.
   *
   * Moment itself is not a dependency here, so this is a hand-written stand-in reproducing the two
   * properties that actually broke: narrow unit unions, and a self-returning `startOf`. It is a
   * type-level assertion — it fails at `yarn types`, not at runtime. The React Native SDK's suite,
   * which passes the real `moment` in, is the end-to-end check.
   */
  it('accepts a moment-shaped parser output', () => {
    type MomentUnit = 'day' | 'week' | 'month' | 'year';
    type MomentInput = MomentLike | Date | string | number;
    type MomentLike = {
      calendar(referenceTime?: MomentInput, formats?: Record<string, string>): string;
      diff(other: MomentInput, unit?: MomentUnit): number;
      format(template?: string): string;
      fromNow(withoutSuffix?: boolean): string;
      startOf(unit: MomentUnit): MomentLike;
      valueOf(): number;
    };

    const momentLike = {} as MomentLike;
    const asDateTimeLike: TDateTimeParserOutput = momentLike;
    expect(asDateTimeLike).toBeDefined();

    // The same failure mode one level up: `DateTimeParserModule`'s members must be method shorthand
    // too, or moment's overloaded `locale` is rejected as a contravariant function property.
    type MomentModuleLike = ((input?: string | number | Date) => MomentLike) & {
      duration(input: number | string): { humanize(withSuffix?: boolean): string };
      locale(language?: string, definition?: Record<string, unknown> | null): string;
      tz?: unknown;
    };

    const asParserModule: DateTimeParserModule = {} as MomentModuleLike;
    expect(asParserModule).toBeDefined();
  });
});

describe('RELATIVE_TIME_CATALOG', () => {
  /**
   * These keys are rendered by core but declared in each SDK's catalog, so the two have to agree. If a
   * key here stops being emitted, an integrator silently loses the ability to translate it — the English
   * default still renders, so nothing looks broken.
   */
  it('declares exactly the keys the relative-compact formatter renders', async () => {
    const i18n = setup({
      runtimeDefaults: {
        ...fixtureRuntimeDefaults,
        'timestamp.Relative':
          '{{ timestamp | timestampFormatter(relativeCompact: true) }}',
      },
    });
    const { t } = await i18n.init();
    const render = (daysAgo: number) =>
      (t as unknown as (k: string, o: Record<string, unknown>) => string)(
        'timestamp.Relative',
        { timestamp: new Date(Date.now() - daysAgo * 86_400_000).toISOString() },
      );

    expect(render(0)).toBe(RELATIVE_TIME_CATALOG['relativeTime.today']);
    expect(render(1)).toBe(RELATIVE_TIME_CATALOG['relativeTime.yesterday']);
    expect(render(3)).toBe('3d ago');
    expect(render(14)).toBe('2w ago');
  });

  it('is translatable through a dictionary', async () => {
    const i18n = setup({
      language: 'de',
      runtimeDefaults: {
        ...fixtureRuntimeDefaults,
        'timestamp.Relative':
          '{{ timestamp | timestampFormatter(relativeCompact: true) }}',
      },
    });
    i18n.registerTranslation('de', {
      'relativeTime.daysAgo_other': 'vor {{ count }} Tagen',
      'relativeTime.today': 'Heute',
    } as never);
    const { t } = await i18n.init();
    const render = (daysAgo: number) =>
      (t as unknown as (k: string, o: Record<string, unknown>) => string)(
        'timestamp.Relative',
        { timestamp: new Date(Date.now() - daysAgo * 86_400_000).toISOString() },
      );

    expect(render(0)).toBe('Heute');
    expect(render(3)).toBe('vor 3 Tagen');
  });
});
