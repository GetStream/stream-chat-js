import type {
  AnyTranslationCatalog,
  DynamicTranslationKey,
  StreamTFunctionFor,
} from './types';

/**
 * Brands a runtime-resolved string as a translation key.
 *
 * The brand on {@link DynamicTranslationKey} is required, so this is the only way to pass a key the
 * compiler cannot see — which keeps every such escape deliberate and greppable.
 */
export const asDynamicKey = (key: string): DynamicTranslationKey =>
  key as DynamicTranslationKey;

/** Matches `{{ name }}` / `{{name}}`, allowing dots so `{{ user.name }}` interpolates too. */
const INTERPOLATION_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

const interpolate = (copy: string, values: Record<string, unknown>) =>
  copy.replace(INTERPOLATION_PATTERN, (whole, name: string) =>
    values[name] === undefined ? whole : String(values[name]),
  );

/**
 * The `t` in force before i18next has initialized, and the default for a UI SDK's translation context.
 *
 * It has to honour the inline `defaultValue`: every prose call site passes its English copy as the
 * second argument, so echoing the key back would flash raw dotted paths on the first frame — and would
 * render them permanently anywhere a context default is in play (a component used outside the SDK's
 * provider).
 *
 * A ~30-line stand-in for i18next, deliberately: pulling i18next in just to render the first frame
 * would defeat keeping it out of the default path.
 */
export const createDefaultTranslatorFunction = <
  C extends AnyTranslationCatalog = AnyTranslationCatalog,
  Bundled extends string = never,
>(): StreamTFunctionFor<C, Bundled> =>
  ((
    key: string,
    defaultValueOrOptions?: string | Record<string, unknown>,
    maybeOptions?: Record<string, unknown>,
  ) => {
    // Prose: the copy arrives positionally.
    if (typeof defaultValueOrOptions === 'string') {
      return maybeOptions
        ? interpolate(defaultValueOrOptions, maybeOptions)
        : defaultValueOrOptions;
    }

    const options = defaultValueOrOptions ?? maybeOptions;
    if (!options) return key;

    // Plural call sites pass their copy as `defaultValue_one` / `defaultValue_other` inside the
    // options object, so a bare `defaultValue` check would still leak the raw key for them. English
    // only distinguishes one from other; a registered language's own categories are irrelevant here,
    // since this function is only ever in play before i18next has initialized.
    const resolved =
      (options.count === 1 ? options.defaultValue_one : options.defaultValue_other) ??
      options.defaultValue;

    return typeof resolved === 'string' ? interpolate(resolved, options) : key;
  }) as StreamTFunctionFor<C, Bundled>;

/**
 * Wraps an integrator's `parseMissingKeyHandler` so it only sees genuinely missing translations.
 *
 * i18next counts every prose key as missing — they render from the inline `defaultValue`, not from a
 * resource bundle — and lets the handler's return value replace the rendered string. An unguarded
 * handler therefore blanks out most of the UI. A resolved default arrives as the second argument,
 * which is how the two cases are told apart.
 */
export const guardMissingKeyHandler =
  (handler: (key: string, defaultValue?: string) => string) =>
  (key: string, defaultValue?: string) =>
    typeof defaultValue === 'string' ? defaultValue : handler(key, defaultValue);
