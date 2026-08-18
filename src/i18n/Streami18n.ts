import i18next from 'i18next';
import type { i18n as I18nInstance, InitOptions } from 'i18next';

import { StateStore } from '../store';
import {
  addOrUpdateDayjsLocale,
  dayjsLocaleExists,
  ensureDayjsPlugins,
  getDefaultDateTimeParserModule,
  isDayjsLike,
  supportsTimezone,
} from './dayjs';
import type { DayjsLocaleConfig } from './dayjs';
import { predefinedFormatters } from './formatters';
import { TranslationBuilder } from './TranslationBuilder';
import type { TranslationTopicConstructor } from './TranslationBuilder';
import { DEFAULT_LANGUAGE, TranslationStore } from './TranslationStore';
import {
  asDynamicKey,
  createDefaultTranslatorFunction,
  guardMissingKeyHandler,
} from './translator';
import type {
  AnyTranslationCatalog,
  CustomFormatters,
  DateTimeParserModule,
  FormatterContext,
  LooseTranslateFunction,
  PredefinedFormatters,
  StreamTFunctionFor,
  TDateTimeParser,
  TranslationDictionaryOf,
} from './types';

const DEFAULT_NAMESPACE = 'translation';

export type Streami18nOptions<C extends AnyTranslationCatalog = AnyTranslationCatalog> = {
  /** A dayjs or moment module. Defaults to dayjs with the required plugins registered. */
  DateTimeParser?: DateTimeParserModule;
  dayjsLocaleConfigForLanguage?: DayjsLocaleConfig;
  debug?: boolean;
  /** Keep dates in English regardless of the active language. */
  disableDateTimeTranslations?: boolean;
  formatters?: Partial<PredefinedFormatters> & CustomFormatters;
  /**
   * Any i18next `InitOptions`. Applied over the SDK's defaults, so it can reach settings the SDK does
   * not surface. `parseMissingKeyHandler` supplied here is guarded the same way as the top-level
   * option.
   */
  i18nextConfigOverrides?: Partial<InitOptions>;
  language?: string;
  logger?: (message?: string) => void;
  /**
   * Called only for keys that are genuinely missing — one with no inline default and no bundled
   * value. See {@link guardMissingKeyHandler} for why it cannot be passed straight to i18next.
   */
  parseMissingKeyHandler?: (key: string, defaultValue?: string) => string;
  /**
   * The SDK's bundled translation data: the keys that cannot carry an inline `defaultValue` at their
   * call site.
   *
   * Injected rather than imported because the catalog belongs to the UI SDK, not to core. Layered
   * under **every** language, which is what stops a partial dictionary from knocking out formatter
   * keys.
   */
  runtimeDefaults?: Record<string, string>;
  /** A valid TZ identifier, e.g. `Europe/Prague`. */
  timezone?: string;
  /**
   * Post-processor topics for copy that cannot be resolved from a key alone — see
   * {@link TranslationBuilder}. The key here must match the post-processor name in the translation
   * value, i.e. `{{ value, topicName }}`.
   */
  translationBuilderTopics?: Record<string, TranslationTopicConstructor>;
  translationsForLanguage?: TranslationDictionaryOf<C>;
};

export type Streami18nState<
  C extends AnyTranslationCatalog = AnyTranslationCatalog,
  Bundled extends string = never,
> = {
  initialized: boolean;
  language: string;
  t: StreamTFunctionFor<C, Bundled>;
  tDateTimeParser: TDateTimeParser;
};

/**
 * Wrapper around [i18next](https://www.i18next.com/) for Stream's translations. A UI SDK passes an
 * instance to its `<Chat>` component to control language and copy. Only English ships; every other
 * language comes from the integrator, and a partial dictionary is safe.
 *
 * ```ts
 * import 'dayjs/locale/de';
 *
 * const i18n = new Streami18n({ language: 'de' });
 * i18n.registerTranslation('de', de, { calendar: { sameDay: '[heute um] LT', ... } });
 * ```
 *
 * No dayjs locale file defines `calendar` — that field belongs to the calendar plugin — so a new
 * language needs both the locale import and a `calendar` config, or relative dates render English
 * scaffolding around translated day names.
 */
export class Streami18n<
  C extends AnyTranslationCatalog = AnyTranslationCatalog,
  Bundled extends string = never,
> {
  /** Marks instances across bundle copies, where `instanceof` silently fails. */
  static readonly brand = Symbol.for('stream-chat.Streami18n');

  readonly i18nInstance: I18nInstance = i18next.createInstance();

  readonly state: StateStore<Streami18nState<C, Bundled>>;

  readonly translationBuilder: TranslationBuilder;

  readonly logger: (message?: string) => void;
  readonly DateTimeParser: DateTimeParserModule;
  readonly formatters: PredefinedFormatters & CustomFormatters;
  readonly timezone?: string;

  private readonly translations: TranslationStore;

  /** Applied when the language becomes active, not on registration: `Dayjs.locale()` is global. */
  private readonly dayjsLocales: Record<string, DayjsLocaleConfig> = {};

  private readonly isCustomDateTimeParser: boolean;
  private readonly translationBuilderTopics: Record<string, TranslationTopicConstructor>;
  private readonly disableDateTimeTranslations: boolean;
  private readonly i18nextConfig: InitOptions;
  private initPromise?: Promise<Streami18nState<C, Bundled>>;
  /** Set by {@link overrideTFunction}, so `init()` does not clobber a swapped-in implementation. */
  private tOverridden = false;

  constructor(options: Streami18nOptions<C> = {}) {
    this.logger = options.logger ?? ((message?: string) => console.warn(message));
    this.translations = new TranslationStore(options.runtimeDefaults);
    this.disableDateTimeTranslations = options.disableDateTimeTranslations ?? false;
    this.timezone = options.timezone;
    this.formatters = { ...predefinedFormatters, ...options.formatters };
    this.isCustomDateTimeParser = Boolean(options.DateTimeParser);
    this.translationBuilder = new TranslationBuilder(this.i18nInstance);
    this.translationBuilderTopics = options.translationBuilderTopics ?? {};

    const language = options.language ?? DEFAULT_LANGUAGE;

    if (options.DateTimeParser) {
      this.DateTimeParser = options.DateTimeParser;
      // The supplied module, not ours -- it may be a second copy of dayjs, and extending ours would
      // leave theirs plugin-less, rendering every `LT` / `LLLL` token literally.
      if (isDayjsLike(this.DateTimeParser)) ensureDayjsPlugins(this.DateTimeParser);
    } else {
      this.DateTimeParser = getDefaultDateTimeParserModule();
    }

    const tDateTimeParser: TDateTimeParser = (timestamp) => {
      const locale =
        this.disableDateTimeTranslations || !this.localeExists(this.currentLanguageValue)
          ? DEFAULT_LANGUAGE
          : this.currentLanguageValue;

      const parsed = this.DateTimeParser(timestamp);
      const withZone =
        this.timezone && supportsTimezone(this.DateTimeParser)
          ? (parsed as unknown as { tz: (tz: string) => typeof parsed }).tz(this.timezone)
          : parsed;

      return (withZone as unknown as { locale: (l: string) => typeof parsed }).locale(
        locale,
      );
    };

    this.state = new StateStore<Streami18nState<C, Bundled>>({
      initialized: false,
      language,
      t: createDefaultTranslatorFunction<C, Bundled>(),
      tDateTimeParser,
    });

    // Both always exist, so an unregistered language still renders English copy rather than dotted keys.
    this.translations.ensure(DEFAULT_LANGUAGE);
    this.translations.ensure(language);

    if (options.translationsForLanguage) {
      this.translations.register(
        language,
        options.translationsForLanguage as Record<string, string>,
      );
    }

    const missingKeyHandler =
      options.parseMissingKeyHandler ??
      options.i18nextConfigOverrides?.parseMissingKeyHandler;

    this.i18nextConfig = {
      debug: options.debug ?? false,
      fallbackLng: false,
      interpolation: { escapeValue: false, formatSeparator: '|' },
      // Must stay false: keys are flat strings containing dots, and some copy contains `...`.
      keySeparator: false,
      lng: language,
      nsSeparator: false,
      // i18next only runs post-processors it was told about at init time.
      ...(Object.keys(this.translationBuilderTopics).length > 0
        ? { postProcess: Object.keys(this.translationBuilderTopics) }
        : {}),
      ...options.i18nextConfigOverrides,
      // Guarded even when integrator-supplied: an unguarded handler silently blanks every prose key.
      parseMissingKeyHandler: missingKeyHandler
        ? guardMissingKeyHandler(missingKeyHandler)
        : (key: string, defaultValue?: string) => {
            if (typeof defaultValue === 'string') return defaultValue;
            this.logger(`Streami18n: missing translation for key: ${key}`);
            return key;
          },
    };

    // No dictionary check here -- `registerTranslation()` legitimately runs after construction, so
    // `init()` is the first moment the registered set is final.
    if (options.dayjsLocaleConfigForLanguage) {
      this.addOrUpdateLocale(language, options.dayjsLocaleConfigForLanguage);
    } else if (!this.localeExists(language)) {
      this.logger(
        `Streami18n: no dayjs locale is registered for '${language}', so dates render with the ` +
          `English locale. Import it with "import 'dayjs/locale/${language}';" in your app, or pass ` +
          `a config via registerTranslation('${language}', translation, dayjsLocaleConfig).`,
      );
    }
  }

  get t(): StreamTFunctionFor<C, Bundled> {
    return this.state.getLatestValue().t;
  }

  get tDateTimeParser(): TDateTimeParser {
    return this.state.getLatestValue().tDateTimeParser;
  }

  get currentLanguage(): string {
    return this.state.getLatestValue().language;
  }

  get initialized(): boolean {
    return this.state.getLatestValue().initialized;
  }

  /** Read inside the constructor, before `state` getters are safe to rely on externally. */
  private get currentLanguageValue(): string {
    return this.state?.getLatestValue().language ?? DEFAULT_LANGUAGE;
  }

  /**
   * Initializes i18next. Idempotent and safe to call concurrently.
   *
   * Memoized on success, so two independent consumers (a chat root and its overlay host) share one
   * initialization. Cleared on rejection, so a retry is possible rather than the instance staying
   * uninitialized for the process lifetime.
   */
  init(): Promise<Streami18nState<C, Bundled>> {
    this.initPromise ??= this.runInit().catch((error: unknown) => {
      this.initPromise = undefined;
      throw error;
    });
    return this.initPromise;
  }

  private async runInit(): Promise<Streami18nState<C, Bundled>> {
    // Everything is inside the `try`: neither UI SDK awaits `init()`, so a throw escaping here is an
    // unhandled rejection.
    try {
      this.validateCurrentLanguage();
      this.assertPluralRulesCoverage(this.currentLanguage);

      const dayjsLocale = this.dayjsLocales[this.currentLanguage];
      if (dayjsLocale) this.addOrUpdateLocale(this.currentLanguage, dayjsLocale);

      const t = await this.i18nInstance.init({
        ...this.i18nextConfig,
        lng: this.currentLanguage,
        resources: this.i18nextResources(),
      });

      this.registerFormatters();

      // After init, so post-processors attach to a live instance and buffered translators flush.
      Object.entries(this.translationBuilderTopics).forEach(([topic, Topic]) => {
        this.translationBuilder.registerTopic(topic, Topic);
      });

      this.state.partialNext({
        initialized: true,
        ...(this.tOverridden
          ? {}
          : { t: t as unknown as StreamTFunctionFor<C, Bundled> }),
      });
    } catch (error) {
      this.logger(`Streami18n: initialization failed: ${describeError(error)}`);
      this.state.partialNext({ initialized: true });
    }

    return this.state.getLatestValue();
  }

  /**
   * Re-run on every language change, not just at `init()`: factories destructure the language out of
   * their context, so one built once keeps formatting in the initial language forever. `formatter.add`
   * replaces by name, which is what makes re-registering sufficient.
   */
  private registerFormatters = () => {
    const context = this.createFormatterContext();

    Object.entries(this.formatters).forEach(([name, factory]) => {
      if (!factory) return;
      const formatter = factory(context);
      // Widened here rather than in the public type: a custom formatter's value is `never` so any
      // implementation is assignable (parameters are contravariant), while i18next's takes `any`.
      this.i18nInstance.services.formatter?.add(
        name,
        formatter as (value: any, lng: string | undefined, options: any) => string,
      );
    });
  };

  /**
   * Accessors rather than snapshots, for a formatter that holds the context and reads per call; one
   * that destructures is covered by {@link registerFormatters} re-running instead.
   *
   * The nested arrows are load-bearing: a getter in an object literal binds `this` to the literal.
   */
  private createFormatterContext = (): FormatterContext => {
    const readLanguage = () => this.currentLanguage;
    const readDateTimeParser = () => this.tDateTimeParser;

    return {
      get currentLanguage() {
        return readLanguage();
      },
      dateTimeParser: this.DateTimeParser,
      logger: this.logger,
      get tDateTimeParser() {
        return readDateTimeParser();
      },
      timezone: this.timezone,
      translate: this.translate,
    };
  };

  /** The store's flat dictionaries in i18next's nested `resources` shape. */
  private i18nextResources = (): Record<string, Record<string, Record<string, string>>> =>
    Object.fromEntries(
      this.translations
        .entries()
        .map(([language, dictionary]) => [language, { [DEFAULT_NAMESPACE]: dictionary }]),
    );

  /** The only route for a language added after `init()`. */
  private ensureLanguage = (language: string) => {
    this.addResources(language, this.translations.ensure(language));
  };

  private addResources = (language: string, dictionary: Record<string, string>) => {
    if (!this.initialized) return;
    this.i18nInstance.addResources(language, DEFAULT_NAMESPACE, dictionary);
  };

  registerTranslation(
    language: string,
    translation: TranslationDictionaryOf<C>,
    dayjsLocaleConfig?: DayjsLocaleConfig,
  ) {
    if (!translation) {
      this.logger(
        'Streami18n: registerTranslation called without a translation dictionary',
      );
      return;
    }

    const merged = this.translations.register(
      language,
      translation as Record<string, string>,
    );

    if (dayjsLocaleConfig) {
      this.dayjsLocales[language] = { ...dayjsLocaleConfig };
    } else if (!this.localeExists(language)) {
      this.logger(
        `Streami18n: no dayjs locale is registered for '${language}'. Import it with ` +
          `"import 'dayjs/locale/${language}';" in your app, or pass a config as the third ` +
          `argument to registerTranslation.`,
      );
    }

    // `merged`, not `translation`: for a post-init language this is the only write into i18next's
    // store, so the partial would leave the bundled defaults absent there.
    this.addResources(language, merged);
  }

  /**
   * Returns nothing: the new `t` is published to {@link Streami18n.state}. Handing one back would offer
   * a value that goes stale on the next language change.
   */
  async setLanguage(language: string): Promise<void> {
    const previousLanguage = this.state.getLatestValue().language;

    // Published up front so the warnings below name the language being adopted, and rolled back in the
    // `catch` -- otherwise the store advertises one i18next never switched to.
    this.state.partialNext({ language });
    this.ensureLanguage(language);

    if (!this.initialized) return;

    this.validateCurrentLanguage();
    this.assertPluralRulesCoverage(language);

    try {
      const t = await this.i18nInstance.changeLanguage(language);
      const dayjsLocale = this.dayjsLocales[language];
      if (dayjsLocale) this.addOrUpdateLocale(language, dayjsLocale);
      this.registerFormatters();
      if (!this.tOverridden) {
        this.state.partialNext({ t: t as unknown as StreamTFunctionFor<C, Bundled> });
      }
    } catch (error) {
      this.state.partialNext({ language: previousLanguage });
      this.logger(`Streami18n: failed to set language: ${describeError(error)}`);
    }
  }

  /**
   * Swaps in a different translation implementation, for an app that already has an i18n layer. Safe
   * before `init()`, which will not overwrite it.
   */
  overrideTFunction(t: StreamTFunctionFor<C, Bundled>) {
    this.tOverridden = true;
    this.state.partialNext({ t });
  }

  /**
   * Languages an integrator supplied a dictionary for. Read-only because adding to it would claim a
   * language is registered with no dictionary behind it; use `registerTranslation`.
   */
  get registeredLanguages(): ReadonlySet<string> {
    return this.translations.registeredLanguages;
  }

  /**
   * Warns rather than falling back to `en`: the language renders English copy from the inline defaults
   * while keeping its own date formats, and resetting it would discard the integrator's choice.
   */
  private validateCurrentLanguage = () => {
    const language = this.currentLanguageValue;
    if (this.translations.isRegistered(language)) return;

    this.logger(
      `Streami18n: no translation dictionary is registered for '${language}', so the SDK's copy ` +
        `renders in English. Call registerTranslation('${language}', {...}) to translate it. ` +
        `Registered: ${[...this.translations.registeredLanguages].join(', ')}`,
    );
  };

  /** Always true for a supplied parser -- we cannot inspect a foreign module's locale registry. */
  private localeExists = (language: string) => {
    if (this.isCustomDateTimeParser) return true;
    return dayjsLocaleExists(language);
  };

  private addOrUpdateLocale(language: string, config: DayjsLocaleConfig) {
    addOrUpdateDayjsLocale(language, config);
  }

  /**
   * For formatters, which resolve keys handed to them at runtime -- including their own
   * `relativeTime.*` copy, which no catalog declares.
   */
  private translate: LooseTranslateFunction = (key, defaultValueOrOptions, options) =>
    (this.t as LooseTranslateFunction)(
      asDynamicKey(key),
      defaultValueOrOptions,
      options,
    ) as string;

  /**
   * Hermes ships a partial ICU: `Intl.PluralRules` silently falls back to root rules (`other` only) for
   * locales it lacks, so a dictionary's `_few` / `_many` never render and nothing errors.
   *
   * Called from `init()` because i18next caches a resolver per language there — the last moment
   * `intl-pluralrules` could still have been loaded in time.
   */
  private assertPluralRulesCoverage = (language: string) => {
    try {
      const resolved = new Intl.PluralRules(language).resolvedOptions().locale;
      if (resolved.split('-')[0] === language.split('-')[0]) return;
      this.logger(
        `Streami18n: Intl.PluralRules has no data for '${language}' (it resolved to ` +
          `'${resolved}'), so every count selects the '_other' form. On React Native, import ` +
          `'intl-pluralrules' before anything else in your entry file.`,
      );
    } catch {
      this.logger(
        `Streami18n: Intl.PluralRules is unavailable, so plural selection will not work. On React ` +
          `Native, import 'intl-pluralrules' before anything else in your entry file.`,
      );
    }
  };
}

/** `JSON.stringify(error)` renders an `Error` as `{}`. */
const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
