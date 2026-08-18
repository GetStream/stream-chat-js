/**
 * The translation dictionaries an instance holds, and the one rule that governs them.
 *
 * Extracted from `Streami18n` because it is a self-contained concern with no dependency on i18next or
 * dayjs: given the SDK's bundled defaults and whatever dictionaries an integrator supplies, produce the
 * dictionary for a language. That makes the layering rule testable on its own rather than only through
 * a fully initialized instance.
 *
 * Deliberately free of i18next concepts — no namespaces, no resource nesting. `Streami18n` adapts these
 * flat dictionaries to i18next's shape, so the rule below stays readable without knowing that library.
 */

/** The one language whose dictionary always exists, because the bundled copy is English. */
export const DEFAULT_LANGUAGE = 'en';

export class TranslationStore {
  /**
   * The SDK's bundled translation data: the keys that cannot carry an inline `defaultValue` at their
   * call site — formatter expressions, and prose reaching `t()` as a runtime value.
   */
  private readonly runtimeDefaults: Record<string, string>;

  private readonly dictionaries = new Map<string, Record<string, string>>();

  private readonly registered = new Set<string>([DEFAULT_LANGUAGE]);

  constructor(runtimeDefaults: Record<string, string> = {}) {
    this.runtimeDefaults = runtimeDefaults;
  }

  /**
   * Languages an integrator actually supplied a dictionary for.
   *
   * Deliberately narrower than {@link TranslationStore.languages}, which also counts every language
   * created just to carry the bundled defaults. Without the distinction there would be no way to warn
   * that the active language has no translations — every language would look registered.
   */
  get registeredLanguages(): ReadonlySet<string> {
    return this.registered;
  }

  /** Every language with a dictionary, including those carrying only the bundled defaults. */
  get languages(): string[] {
    return [...this.dictionaries.keys()];
  }

  /** `language -> dictionary`, for a caller that has to hand them all over at once. */
  entries(): Array<[string, Record<string, string>]> {
    return [...this.dictionaries];
  }

  isRegistered(language: string) {
    return this.registered.has(language);
  }

  /**
   * Guarantees `language` has a dictionary, and returns it.
   *
   * Called for a language nobody registered, so that it still formats dates and renders the SDK's copy
   * in English rather than raw dotted keys.
   */
  ensure(language: string): Record<string, string> {
    return this.merge(language);
  }

  /**
   * Layers a dictionary over what `language` already has, and marks it registered.
   *
   * **Merged, not replaced.** Repeated calls for one language accumulate, and — the reason this class
   * exists — the bundled defaults survive a partial dictionary. A bundled key has no inline
   * `defaultValue` at its call site and `fallbackLng` is false, so a language that loses them renders
   * raw dotted keys and unformatted ISO timestamps. That is guarantee G1 of the i18n suite.
   */
  register(language: string, dictionary: Record<string, string>): Record<string, string> {
    const merged = this.merge(language, dictionary);
    this.registered.add(language);
    return merged;
  }

  /**
   * Bundled defaults first, then whatever the language already had, then the incoming dictionary — so
   * an integrator can override a bundled key, and a later registration wins over an earlier one.
   */
  private merge(
    language: string,
    dictionary?: Record<string, string>,
  ): Record<string, string> {
    const merged = {
      ...this.runtimeDefaults,
      ...this.dictionaries.get(language),
      ...dictionary,
    };
    this.dictionaries.set(language, merged);
    return merged;
  }
}
