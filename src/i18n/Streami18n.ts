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
const DEFAULT_LANGUAGE = 'en';

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
 * instance to its `<Chat>` component to control language and copy.
 *
 * Only English ships, and only as much of it as has to: prose renders from the inline `defaultValue`
 * at each call site, so the bundled data is just formatter expressions and the handful of keys
 * resolved by name at runtime. Every other language comes from the integrator.
 *
 * Reactivity goes through {@link Streami18n.state}, a {@link StateStore}. `subscribe` fires
 * synchronously with the current value, so a consumer that attaches after `init()` still sees the live
 * `t` immediately and there is no callback-registration ordering to get wrong.
 *
 * ## Overriding some of the English copy
 *
 * ```ts
 * const i18n = new Streami18n({
 *   translationsForLanguage: { 'autoCompleteInput.placeholder': 'Write something…' },
 * });
 * ```
 *
 * ## Registering a language
 *
 * ```ts
 * import 'dayjs/locale/de';
 *
 * const i18n = new Streami18n({ language: 'de' });
 * i18n.registerTranslation('de', de, {
 *   calendar: { sameDay: '[heute um] LT', lastDay: '[gestern um] LT', ... },
 * });
 * ```
 *
 * A partial dictionary is safe: keys you do not supply render their English copy, never a raw dotted
 * path. Plurals are stored as `<key>_one` / `<key>_other`; supply whichever categories your language
 * needs and `Intl.PluralRules` selects between them.
 *
 * Note that no dayjs locale file defines `calendar` — that field belongs to the calendar plugin — so a
 * new language needs both `import 'dayjs/locale/xx'` and a `calendar` config, or relative dates render
 * English scaffolding around translated day names.
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

  /** The resource dictionaries handed to i18next, keyed by language. */
  translations: Record<string, Record<string, Record<string, string>>> = {};

  /**
   * Languages an integrator actually supplied a dictionary for.
   *
   * Deliberately narrower than `Object.keys(this.translations)`, which also contains every language
   * created just to carry the bundled defaults. Without the distinction the unregistered-language
   * warning could never fire.
   */
  readonly registeredLanguages = new Set<string>([DEFAULT_LANGUAGE]);

  /**
   * Locale configs supplied through `registerTranslation`, applied when the language becomes active.
   *
   * `Dayjs.locale()` also changes the *global* locale, which registering a translation must not do.
   */
  readonly dayjsLocales: Record<string, DayjsLocaleConfig> = {};

  readonly logger: (message?: string) => void;
  readonly DateTimeParser: DateTimeParserModule;
  readonly isCustomDateTimeParser: boolean;
  readonly formatters: PredefinedFormatters & CustomFormatters;
  readonly timezone?: string;

  private readonly translationBuilderTopics: Record<string, TranslationTopicConstructor>;
  private readonly runtimeDefaults: Record<string, string>;
  private readonly disableDateTimeTranslations: boolean;
  private readonly i18nextConfig: InitOptions;
  private initPromise?: Promise<Streami18nState<C, Bundled>>;
  /** Set by {@link overrideTFunction}, so `init()` does not clobber a swapped-in implementation. */
  private tOverridden = false;

  constructor(options: Streami18nOptions<C> = {}) {
    this.logger = options.logger ?? ((message?: string) => console.warn(message));
    this.runtimeDefaults = options.runtimeDefaults ?? {};
    this.disableDateTimeTranslations = options.disableDateTimeTranslations ?? false;
    this.timezone = options.timezone;
    this.formatters = { ...predefinedFormatters, ...options.formatters };
    this.isCustomDateTimeParser = Boolean(options.DateTimeParser);
    this.translationBuilder = new TranslationBuilder(this.i18nInstance);
    this.translationBuilderTopics = options.translationBuilderTopics ?? {};

    const language = options.language ?? DEFAULT_LANGUAGE;

    if (options.DateTimeParser) {
      this.DateTimeParser = options.DateTimeParser;
      // The supplied module, not ours: it may be a second physical copy of dayjs, in which case
      // extending ours leaves theirs plugin-less and every `LT` / `LLLL` token renders literally.
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

    // `en` always exists so the bundled keys resolve, and so does the active language — including one
    // nobody registered, which then renders the SDK's English copy from the inline defaults rather
    // than dotted key paths.
    this.ensureLanguage(DEFAULT_LANGUAGE);
    this.ensureLanguage(language);

    if (options.translationsForLanguage) {
      this.translations[language] = {
        [DEFAULT_NAMESPACE]: this.mergeWithRuntimeDefaults(
          language,
          options.translationsForLanguage as Record<string, string>,
        ),
      };
      this.registeredLanguages.add(language);
    }

    const missingKeyHandler =
      options.parseMissingKeyHandler ??
      options.i18nextConfigOverrides?.parseMissingKeyHandler;

    this.i18nextConfig = {
      debug: options.debug ?? false,
      fallbackLng: false,
      interpolation: { escapeValue: false, formatSeparator: '|' },
      // Keys are flat strings that happen to contain dots, and several contain `...` in their copy,
      // which `keySeparator: '.'` would mis-resolve. This must stay false.
      keySeparator: false,
      lng: language,
      nsSeparator: false,
      // i18next only runs post-processors it was told about at init time.
      ...(Object.keys(this.translationBuilderTopics).length > 0
        ? { postProcess: Object.keys(this.translationBuilderTopics) }
        : {}),
      ...options.i18nextConfigOverrides,
      // An integrator handler replaces ours wholesale, so it has to be guarded too — otherwise
      // supplying one silently blanks every prose key.
      parseMissingKeyHandler: missingKeyHandler
        ? guardMissingKeyHandler(missingKeyHandler)
        : (key: string, defaultValue?: string) => {
            if (typeof defaultValue === 'string') return defaultValue;
            this.logger(`Streami18n: missing translation for key: ${key}`);
            return key;
          },
    };

    // Deliberately *not* validating the language here. `registerTranslation()` legitimately runs after
    // construction, so warning now would fire for every integrator who registers a dictionary the normal
    // way. The check belongs in `init()`, which is the first moment the set of registered languages is
    // final.
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

  /* ---------------------------------------------------------------------------------------------
   * State-backed accessors
   * ------------------------------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------------------------------
   * Lifecycle
   * ------------------------------------------------------------------------------------------- */

  /**
   * Initializes i18next. Idempotent and safe to call concurrently.
   *
   * The promise is memoized and never cleared **on success**: two independent consumers (a UI SDK's
   * chat root and its overlay host, say) both call this, and clearing it on completion would leave a
   * window where a third caller re-entered initialization.
   *
   * A rejection *is* cleared, so a retry is possible. `runInit` guards everything it does, so the only
   * way to get here is something genuinely unexpected — most plausibly an integrator-supplied `logger`
   * that throws. Latching that permanently would leave the instance uninitialized for the process
   * lifetime, rendering the default English translator with no way back.
   */
  init(): Promise<Streami18nState<C, Bundled>> {
    this.initPromise ??= this.runInit().catch((error: unknown) => {
      this.initPromise = undefined;
      throw error;
    });
    return this.initPromise;
  }

  private async runInit(): Promise<Streami18nState<C, Bundled>> {
    try {
      // Inside the `try`, all three of them. These log and touch dayjs, so each can throw for reasons
      // that have nothing to do with i18next — and a throw out of `runInit` is an unhandled rejection
      // at both UI SDKs' call sites, which do not await this.
      this.validateCurrentLanguage();
      this.assertPluralRulesCoverage(this.currentLanguage);

      const dayjsLocale = this.dayjsLocales[this.currentLanguage];
      if (dayjsLocale) this.addOrUpdateLocale(this.currentLanguage, dayjsLocale);

      const t = await this.i18nInstance.init({
        ...this.i18nextConfig,
        lng: this.currentLanguage,
        resources: this.translations,
      });

      this.registerFormatters();

      // After init, so the topics' post-processors are attached to a live instance and any buffered
      // translator registrations flush.
      Object.entries(this.translationBuilderTopics).forEach(([topic, Topic]) => {
        this.translationBuilder.registerTopic(topic, Topic);
      });

      this.state.partialNext({
        initialized: true,
        // An `overrideTFunction` call before init must not be undone by init.
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
   * Builds each formatter from its factory and hands it to i18next.
   *
   * Re-run on every language change, not just at `init()`. Factories receive the language through their
   * context and virtually all of them **destructure** it, which snapshots the value — so a factory run
   * once at initialization keeps formatting in the initial language forever, with no error. i18next's
   * `formatter.add` replaces an existing name, so re-registering is the whole fix.
   */
  private registerFormatters = () => {
    const context = this.createFormatterContext();

    Object.entries(this.formatters).forEach(([name, factory]) => {
      if (!factory) return;
      const formatter = factory(context);
      // A custom formatter's value type is declared `never` so that any implementation is assignable
      // to it (parameters are contravariant). i18next's own signature takes `any`, so the widening
      // happens here rather than weakening the public type.
      this.i18nInstance.services.formatter?.add(
        name,
        formatter as (value: any, lng: string | undefined, options: any) => string,
      );
    });
  };

  /**
   * What each formatter factory is handed.
   *
   * `currentLanguage` and `tDateTimeParser` are accessors rather than snapshots, which covers a
   * formatter that holds the context and reads a property per call. A formatter that *destructures* the
   * context still snapshots, which is why {@link registerFormatters} also re-runs on a language change
   * — the two together are what make both styles correct.
   *
   * Nested arrow functions rather than an aliased `this`: a getter in an object literal binds `this` to
   * the literal.
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

  /* ---------------------------------------------------------------------------------------------
   * Languages and dictionaries
   * ------------------------------------------------------------------------------------------- */

  /**
   * A dictionary layered over the bundled defaults.
   *
   * Every write into `this.translations` goes through here: bundled keys have no inline `defaultValue`
   * at their call site and `fallbackLng` is false, so a language missing them renders raw dotted keys
   * and unformatted ISO timestamps.
   */
  private mergeWithRuntimeDefaults = (
    language: string,
    translation?: Record<string, string>,
  ): Record<string, string> => ({
    ...this.runtimeDefaults,
    ...this.translations[language]?.[DEFAULT_NAMESPACE],
    ...translation,
  });

  /**
   * Guarantees `language` has a dictionary, so a language nobody registered still formats dates and
   * renders the SDK's copy in English. Writes into i18next's store too when already initialized — the
   * only route for a language added after `init()`.
   */
  private ensureLanguage = (language: string) => {
    const translation = this.mergeWithRuntimeDefaults(language);
    this.translations[language] = { [DEFAULT_NAMESPACE]: translation };

    if (this.initialized) {
      this.i18nInstance.addResources(language, DEFAULT_NAMESPACE, translation);
    }
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

    // Merged, not replaced, so repeated calls for one language accumulate and the bundled keys
    // survive a partial dictionary.
    const merged = this.mergeWithRuntimeDefaults(
      language,
      translation as Record<string, string>,
    );
    this.translations[language] = { [DEFAULT_NAMESPACE]: merged };
    this.registeredLanguages.add(language);

    if (dayjsLocaleConfig) {
      this.dayjsLocales[language] = { ...dayjsLocaleConfig };
    } else if (!this.localeExists(language)) {
      this.logger(
        `Streami18n: no dayjs locale is registered for '${language}'. Import it with ` +
          `"import 'dayjs/locale/${language}';" in your app, or pass a config as the third ` +
          `argument to registerTranslation.`,
      );
    }

    if (this.initialized) {
      // `merged`, not `translation`: for a language registered after init this is the only write into
      // i18next's store, so passing the partial would leave the bundled defaults absent there.
      this.i18nInstance.addResources(language, DEFAULT_NAMESPACE, merged);
    }
  }

  /**
   * Changes the active language.
   *
   * Returns nothing: the new `t` is published to {@link Streami18n.state}, which is the single source
   * of the current translator. Handing one back would offer a value that goes stale on the next
   * language change and invite callers to cache it.
   */
  async setLanguage(language: string): Promise<void> {
    const previousLanguage = this.state.getLatestValue().language;

    // Published before the switch so `validateCurrentLanguage` reports on the language being adopted,
    // and rolled back below if the switch does not happen -- otherwise the store advertises a language
    // i18next never adopted, and `tDateTimeParser` starts formatting dates in a locale whose copy is
    // not loaded.
    this.state.partialNext({ language });
    this.ensureLanguage(language);

    if (!this.initialized) return;

    this.validateCurrentLanguage();
    this.assertPluralRulesCoverage(language);

    try {
      const t = await this.i18nInstance.changeLanguage(language);
      const dayjsLocale = this.dayjsLocales[language];
      if (dayjsLocale) this.addOrUpdateLocale(language, dayjsLocale);
      // Rebuilt against the new language -- see `registerFormatters`.
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
   * Swaps in a different translation implementation, for an app that already has an i18n layer.
   *
   * Safe before `init()`: the store holds it and initialization will not overwrite it.
   */
  overrideTFunction(t: StreamTFunctionFor<C, Bundled>) {
    this.tOverridden = true;
    this.state.partialNext({ t });
  }

  /**
   * Warns when the active language has no registered dictionary.
   *
   * Not an error, and not a reason to fall back to `en`: the language renders the SDK's English copy
   * from the inline defaults while keeping its own date formats. Silently resetting the language
   * instead discards the integrator's choice and makes the cause very hard to see.
   */
  validateCurrentLanguage = () => {
    const language = this.currentLanguageValue;
    if (this.registeredLanguages.has(language)) return;

    this.logger(
      `Streami18n: no translation dictionary is registered for '${language}', so the SDK's copy ` +
        `renders in English. Call registerTranslation('${language}', {...}) to translate it. ` +
        `Registered: ${[...this.registeredLanguages].join(', ')}`,
    );
  };

  /** Whether the date library has locale data for `language`. */
  localeExists = (language: string) => {
    if (this.isCustomDateTimeParser) return true;
    return dayjsLocaleExists(language);
  };

  addOrUpdateLocale(language: string, config: DayjsLocaleConfig) {
    addOrUpdateDayjsLocale(language, config);
  }

  /** Languages with a dictionary, including those carrying only the bundled defaults. */
  getAvailableLanguages = () => Object.keys(this.translations);

  /**
   * The resource dictionaries handed to i18next, keyed by language.
   *
   * Not the full English catalog: prose keys are never bundled — they render from the inline
   * `defaultValue` at their call site — so `en` holds the bundled defaults plus whatever has been
   * registered.
   */
  getTranslations = () => this.translations;

  /**
   * A loose translate used by formatters, which resolve keys handed to them at runtime.
   *
   * Bound to i18next rather than to the typed `t` so a formatter can reach its own `relativeTime.*`
   * copy without the catalog having to declare it.
   */
  private translate: LooseTranslateFunction = (key, defaultValueOrOptions, options) =>
    (this.t as LooseTranslateFunction)(
      asDynamicKey(key),
      defaultValueOrOptions,
      options,
    ) as string;

  /**
   * Warns when `Intl.PluralRules` has no data for a language.
   *
   * Hermes ships a partial ICU: the constructor exists but silently falls back to the root locale's
   * rules — `{ other }` only — for locales it lacks data for. A dictionary correctly supplying
   * `_few` / `_many` then renders none of them, with no error anywhere. React Native apps load
   * `intl-pluralrules` to fix this; this check is what turns the silent version into a visible one for
   * anyone who has not.
   *
   * Checked here rather than at module scope because i18next builds its plural resolver during
   * `init()`, caching an `Intl.PluralRules` per language — so this is the last moment a polyfill could
   * still have been loaded in time.
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

/** `JSON.stringify(error)` renders an `Error` as `{}`, which is how these used to get logged. */
const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
