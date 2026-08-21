/**
 * The shared i18n layer, published as `stream-chat/i18n`.
 *
 * Deliberately **not** re-exported from `stream-chat`'s root barrel: this module pulls in `i18next` and
 * `dayjs`, and keeping them out of the root bundle is the entire reason it is a separate entry point.
 * `scripts/bundle.mts` asserts that boundary at build time.
 */
export * from './dayjs';
export * from './formatters';
export * from './languageNames';
export * from './Streami18n';
export * from './TranslationBuilder';
export * from './TranslationStore';
export * from './translator';
export * from './types';
