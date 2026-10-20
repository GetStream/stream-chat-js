import type { TranslationLanguage } from './types';

/**
 * The human-readable name of each {@link TranslationLanguage}, for text like "Translated from
 * German". `satisfies Record<TranslationLanguage, string>` fails to compile when the union and this
 * table disagree. Names are in English so they fit inside the reader's sentence; override the
 * `language.*` keys for endonyms.
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
 * The `language.*` slice of a translation catalog, to intersect into a UI SDK's own catalog so
 * `t('language.de')` is a checked key:
 *
 * ```ts
 * type TranslationCatalog = GeneratedCatalog & LanguageNameCatalog;
 * ```
 */
export type LanguageNameCatalog = {
  [K in keyof typeof LANGUAGE_NAMES as `language.${K & string}`]: (typeof LANGUAGE_NAMES)[K];
};

/**
 * {@link LANGUAGE_NAMES} keyed as a catalog (`language.<code>`), ready to merge into an SDK's
 * bundled defaults. The keys are resolved from a runtime value, so there is no call site for an
 * inline default.
 */
export const languageNameDefaults: Record<string, string> = Object.fromEntries(
  Object.entries(LANGUAGE_NAMES).map(([code, name]) => [`language.${code}`, name]),
);
