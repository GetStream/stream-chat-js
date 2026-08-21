import type { TranslationLanguage } from '../types';

/**
 * The human-readable name of each language the API can auto-translate a message into.
 *
 * These are display copy for a **core-owned** set: `message.i18n.language` is typed
 * {@link TranslationLanguage}, so core defines which languages exist and therefore owns their names
 * too. A UI SDK uses them to say "Translated from German" rather than "Translated from de".
 *
 * `satisfies Record<TranslationLanguage, string>` is the drift gate, and it works in both
 * directions: adding a language to the API union fails to compile until a name is supplied here, and a
 * name for a language the union does not contain is rejected as an excess property. Before this lived
 * in core, each UI SDK hand-maintained its own copy with nothing tying it to the union — so a miss
 * could only be detected at runtime, by comparing the rendered string against the key.
 *
 * Names are in English on purpose. A language picker conventionally shows each language endonymously
 * ("Deutsch", not "German"), but this is the *source* language of an auto-translated message rendered
 * inside a sentence in the reader's own language, so it has to agree with the surrounding copy. An
 * integrator wanting endonyms overrides the `language.*` keys.
 */
export const LANGUAGE_NAMES = {
  af: 'Afrikaans',
  am: 'Amharic',
  ar: 'Arabic',
  az: 'Azerbaijani',
  bg: 'Bulgarian',
  bn: 'Bengali',
  bs: 'Bosnian',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  'es-MX': 'Spanish (Mexico)',
  et: 'Estonian',
  fa: 'Persian',
  'fa-AF': 'Dari',
  fi: 'Finnish',
  fr: 'French',
  'fr-CA': 'French (Canada)',
  ha: 'Hausa',
  he: 'Hebrew',
  hi: 'Hindi',
  hr: 'Croatian',
  ht: 'Haitian Creole',
  hu: 'Hungarian',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ka: 'Georgian',
  ko: 'Korean',
  lt: 'Lithuanian',
  lv: 'Latvian',
  ms: 'Malay',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  ps: 'Pashto',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sk: 'Slovak',
  sl: 'Slovenian',
  so: 'Somali',
  sq: 'Albanian',
  sr: 'Serbian',
  sv: 'Swedish',
  sw: 'Swahili',
  ta: 'Tamil',
  th: 'Thai',
  tl: 'Tagalog',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  vi: 'Vietnamese',
  zh: 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
} as const satisfies Record<TranslationLanguage, string>;

/**
 * The `language.*` slice of a translation catalog.
 *
 * A UI SDK intersects this into its own generated catalog, which makes `t('language.de')` a checked
 * key rather than something that has to go through `asDynamicKey()`:
 *
 * ```ts
 * type TranslationCatalog = GeneratedCatalog & LanguageNameCatalog;
 * ```
 */
export type LanguageNameCatalog = {
  [K in keyof typeof LANGUAGE_NAMES as `language.${K & string}`]: (typeof LANGUAGE_NAMES)[K];
};

/**
 * {@link LANGUAGE_NAMES} keyed the way a catalog is, ready to merge into an SDK's bundled defaults.
 *
 * These keys are resolved from a runtime value (the message's source language), so there is no call
 * site to carry an inline default — which is exactly why they have to ship as data.
 */
export const languageNameDefaults: Record<string, string> = Object.fromEntries(
  Object.entries(LANGUAGE_NAMES).map(([code, name]) => [`language.${code}`, name]),
);
