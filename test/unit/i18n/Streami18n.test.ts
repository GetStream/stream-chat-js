import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type DateTimeParserModule,
  defaultDateTimeParser,
  isDayOrMoment,
  RELATIVE_TIME_CATALOG,
  Streami18n,
  type Streami18nState,
  type TDateTimeParserOutput,
} from '../../../src/i18n';
import {
  fixtureRuntimeDefaults,
  type FixtureBundledKey,
  type FixtureCatalog,
} from './fixtures';

const setup = (options: Record<string, unknown> = {}) =>
  new Streami18n<FixtureCatalog, FixtureBundledKey>({
    logger: () => {},
    runtimeDefaults: fixtureRuntimeDefaults,
    ...options,
  });

describe('Streami18n', () => {
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

      const seen: Streami18nState<FixtureCatalog, FixtureBundledKey>[] = [];
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

  describe('registeredLanguages', () => {
    it('excludes a language carrying only the bundled defaults', async () => {
      const i18n = setup({ language: 'de' });
      const { t } = await i18n.init();

      // The dictionary exists -- a bundled formatter key resolves rather than rendering its own
      // dotted path...
      expect(t('timestamp.MessageTimestamp', { timestamp: new Date(0) })).not.toBe(
        'timestamp.MessageTimestamp',
      );
      // ...while `registeredLanguages` stays narrower, which is what makes the G3 warning possible.
      expect(i18n.registeredLanguages.has('de')).toBe(false);
      expect(i18n.registeredLanguages.has('en')).toBe(true);
    });

    it('includes a language once a dictionary is registered for it', async () => {
      const i18n = setup({ language: 'de' });
      i18n.registerTranslation('de', { 'fixture.prose': 'Abbrechen' } as never);
      await i18n.init();

      expect(i18n.registeredLanguages.has('de')).toBe(true);
    });
  });
});

/**
 * Region-coded languages. Ported from the React Native SDK's suite, which owned these before the
 * runtime moved here.
 *
 * The hyphen must not be read as a separator of any kind — `keySeparator: false` and
 * `nsSeparator: false` are what keep `pt-BR` a single language name rather than a namespace lookup,
 * and a base-language dictionary must not shadow the region-coded one.
 */
describe('Streami18n — region-coded languages', () => {
  it.each(['pt-BR', 'zh-TW', 'fr-CA', 'es-MX'])(
    'resolves a dictionary for %s',
    async (language) => {
      const i18n = setup({ language });
      i18n.registerTranslation(language, {
        'fixture.prose': `cancel-${language}`,
      } as never);
      const { t } = await i18n.init();

      expect(t('fixture.prose', 'Cancel')).toBe(`cancel-${language}`);
      expect(i18n.currentLanguage).toBe(language);
      expect(i18n.registeredLanguages.has(language)).toBe(true);
    },
  );

  it('keeps a region-coded language distinct from its base language', async () => {
    const i18n = setup({ language: 'pt-BR' });
    i18n.registerTranslation('pt', { 'fixture.prose': 'Cancelar-pt' } as never);
    i18n.registerTranslation('pt-BR', { 'fixture.prose': 'Cancelar-ptBR' } as never);
    const { t } = await i18n.init();

    expect(t('fixture.prose', 'Cancel')).toBe('Cancelar-ptBR');
  });

  it('still layers the bundled defaults under a region-coded language', async () => {
    const i18n = setup({ language: 'pt-BR' });
    const { t } = await i18n.init();

    // Would render as the raw key if runtimeDefaults had not been layered under `pt-BR`.
    expect(t('timestamp.MessageTimestamp', { timestamp: new Date(0) })).not.toBe(
      'timestamp.MessageTimestamp',
    );
  });
});

/**
 * Behaviours the React SDK's suite owned before the runtime moved here. They were asserting this
 * module through a thin subclass, so they belong on this side of the boundary — and none of them was
 * covered here.
 */
describe('Streami18n — locale and timezone wiring', () => {
  it('registers a dayjs locale config supplied at construction', async () => {
    const i18n = setup({
      dayjsLocaleConfigForLanguage: { calendar: { sameDay: '[custom today] LT' } },
      language: 'nl',
    });
    const { tDateTimeParser } = await i18n.init();

    const parsed = tDateTimeParser(new Date());
    expect(isDayOrMoment(parsed)).toBe(true);
    expect((parsed as { calendar: () => string }).calendar()).toContain('custom today');
  });

  it('registers a dayjs locale config supplied through registerTranslation', async () => {
    const i18n = setup({ language: 'de' });
    i18n.registerTranslation('de', { 'fixture.prose': 'Hallo' } as never, {
      calendar: { sameDay: '[heute um] LT' },
    });
    const { tDateTimeParser } = await i18n.init();

    expect(
      (tDateTimeParser(new Date()) as { calendar: () => string }).calendar(),
    ).toContain('heute um');
  });

  it('defaults to the local timezone', async () => {
    const i18n = setup();
    const { tDateTimeParser } = await i18n.init();
    const date = new Date();

    expect((tDateTimeParser(date) as { format: (t: string) => string }).format('H')).toBe(
      date.getHours().toString(),
    );
  });

  it('ignores a timezone when the parser cannot apply one', async () => {
    // dayjs without the timezone plugin, i.e. no `.tz` on the module. The option must degrade to local
    // time rather than throwing or silently producing a wrong hour.
    const parserWithoutTz = Object.assign(
      (input?: string | number | Date) => defaultDateTimeParser(input),
      { duration: undefined, extend: undefined, locale: undefined },
    );
    const i18n = new Streami18n<FixtureCatalog, FixtureBundledKey>({
      DateTimeParser: parserWithoutTz as never,
      logger: () => {},
      runtimeDefaults: fixtureRuntimeDefaults,
      timezone: 'Europe/Prague',
    });
    const { tDateTimeParser } = await i18n.init();
    const date = new Date();

    expect((tDateTimeParser(date) as { format: (t: string) => string }).format('H')).toBe(
      date.getHours().toString(),
    );
  });
});

describe('Streami18n — registerTranslation does not clobber', () => {
  it('keeps a dictionary when setLanguage moves away and back', async () => {
    const i18n = setup({ language: 'en' });
    i18n.registerTranslation('de', { 'fixture.prose': 'Hallo' } as never);
    i18n.registerTranslation('fr', { 'fixture.prose': 'Bonjour' } as never);
    await i18n.init();

    await i18n.setLanguage('de');
    expect(i18n.t('fixture.prose', 'Hello')).toBe('Hallo');

    await i18n.setLanguage('fr');
    expect(i18n.t('fixture.prose', 'Hello')).toBe('Bonjour');

    // Back again: switching must not have dropped the first dictionary.
    await i18n.setLanguage('de');
    expect(i18n.t('fixture.prose', 'Hello')).toBe('Hallo');
  });

  it('keeps a registered dictionary when setLanguage targets an unregistered language', async () => {
    const i18n = setup({ language: 'en' });
    i18n.registerTranslation('de', { 'fixture.prose': 'Hallo' } as never);
    await i18n.init();

    await i18n.setLanguage('ja');
    await i18n.setLanguage('de');
    expect(i18n.t('fixture.prose', 'Hello')).toBe('Hallo');
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

/**
 * A dayjs module the integrator supplied gets the plugins too.
 *
 * `ensureDayjsPlugins()` used to always extend *our* `dayjs` import, whatever module was passed in.
 * With a second physical copy of dayjs -- the normal case for an integrator who imports their own
 * locales -- that left theirs plugin-less, and the failure was silent and total: `format('LT')` echoed
 * the literal token back and `.calendar()` was simply absent.
 */
describe('Streami18n — an integrator-supplied dayjs module', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  /** A stand-in for a second dayjs copy: records what was registered on it. */
  const makeUnextendedDayjsLike = () => {
    const registered: unknown[] = [];
    const parser = ((input?: unknown) => ({
      calendar: () => 'calendar',
      diff: () => 0,
      format: (template?: string) => `formatted:${template ?? ''}:${String(input)}`,
      locale: () => parser(input),
      startOf: () => ({ diff: () => 0 }),
      valueOf: () => 0,
    })) as unknown as DateTimeParserModule & { extend: (plugin: unknown) => unknown };

    parser.extend = (plugin: unknown) => {
      registered.push(plugin);
      return parser;
    };

    return { parser, registered };
  };

  it('registers the plugins on the supplied module, not only on ours', () => {
    const { parser, registered } = makeUnextendedDayjsLike();

    setup({ DateTimeParser: parser });

    // The eight the formatters need: updateLocale, utc, timezone, localizedFormat, calendar,
    // localeData, relativeTime, duration.
    expect(registered).toHaveLength(8);
    expect(registered.every((plugin) => typeof plugin === 'function')).toBe(true);
  });

  it('does not re-register on a second instance sharing the module', () => {
    const { parser, registered } = makeUnextendedDayjsLike();

    setup({ DateTimeParser: parser });
    setup({ DateTimeParser: parser });

    expect(registered).toHaveLength(8);
  });

  it('leaves a module without `extend` alone rather than throwing', () => {
    const momentish = ((input?: unknown) => ({
      diff: () => 0,
      format: () => String(input),
      startOf: () => ({ diff: () => 0 }),
      valueOf: () => 0,
    })) as unknown as DateTimeParserModule;

    expect(() => setup({ DateTimeParser: momentish })).not.toThrow();
  });
});

/**
 * `Date.parse` returns `0` for the epoch, so `!Date.parse(value)` classified a valid timestamp as junk.
 */
describe('Streami18n — the Unix epoch is a valid timestamp', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('formats an epoch timestamp string rather than rendering nothing', async () => {
    const { t } = await setup().init();

    expect(
      t('timestamp.MessageTimestamp', { timestamp: '1970-01-01T00:00:00.000Z' }),
    ).toBe('12:00 AM');
  });

  it('still renders nothing for a string that is genuinely not a date', async () => {
    const { t } = await setup().init();

    expect(t('timestamp.MessageTimestamp', { timestamp: 'not a date' })).toBe('');
  });
});

/**
 * Formatter factories run once, during `init()`, and are never re-run on a language change -- so the
 * context has to expose accessors rather than the values it had at initialization.
 */
describe('Streami18n — the formatter context follows the active language', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('reports the language in force at call time, not at init time', async () => {
    const seen: string[] = [];
    const i18n = setup({
      formatters: {
        languageProbe:
          ({ currentLanguage }: { currentLanguage: string }) =>
          () => {
            seen.push(currentLanguage);
            return currentLanguage;
          },
      },
      translationsForLanguage: {
        'fixture.probe': '{{ value | languageProbe }}',
      },
    });
    i18n.registerTranslation('de', {
      'fixture.probe': '{{ value | languageProbe }}',
    } as never);

    const { t } = await i18n.init();
    (t as (key: string, options: object) => string)('fixture.probe', { value: 'x' });

    await i18n.setLanguage('de');
    const after = i18n.state.getLatestValue().t as unknown as (
      key: string,
      options: object,
    ) => string;
    after('fixture.probe', { value: 'x' });

    expect(seen).toEqual(['en', 'de']);
  });
});

/**
 * A failed language switch must not leave the store advertising a language i18next never adopted --
 * `tDateTimeParser` reads it on every call, so dates would format in a locale whose copy is absent.
 */
describe('Streami18n — a failed setLanguage rolls back', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('restores the previous language when changeLanguage rejects', async () => {
    const logger = vi.fn();
    const i18n = setup({ logger });
    await i18n.init();
    expect(i18n.currentLanguage).toBe('en');

    vi.spyOn(i18n.i18nInstance, 'changeLanguage').mockRejectedValue(new Error('nope'));
    await i18n.setLanguage('de');

    expect(i18n.currentLanguage).toBe('en');
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('failed to set language: nope'),
    );
  });

  it('keeps the new language when the switch succeeds', async () => {
    const i18n = setup();
    await i18n.init();
    await i18n.setLanguage('de');

    expect(i18n.currentLanguage).toBe('de');
  });
});

/**
 * A rejected `init()` must not be latched: both UI SDKs call `init()` without awaiting it, so a
 * permanently rejected memo leaves the instance uninitialized for the process lifetime.
 */
describe('Streami18n — init() is retryable after a genuine failure', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('recovers when the cause is gone', async () => {
    let shouldThrow = true;
    const i18n = setup({
      logger: (message?: string) => {
        if (shouldThrow) throw new Error('logger exploded');
        void message;
      },
      // Unregistered, so `validateCurrentLanguage` logs -- and the logger throws.
      language: 'de',
    });

    await expect(i18n.init()).rejects.toThrow('logger exploded');
    expect(i18n.initialized).toBe(false);

    shouldThrow = false;
    const state = await i18n.init();

    expect(state.initialized).toBe(true);
  });

  it('hands the same promise to concurrent callers on the happy path', async () => {
    const i18n = setup();
    const first = i18n.init();

    expect(i18n.init()).toBe(first);
    await first;
    expect(i18n.init()).toBe(first);
  });
});
