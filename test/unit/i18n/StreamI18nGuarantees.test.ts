import { describe, expect, it, vi } from 'vitest';

import { asDynamicKey, StreamI18n } from '../../../src/i18n';
import {
  FORMATTER_KEY,
  fixtureRuntimeDefaults,
  type FixtureBundledKey,
  type FixtureCatalog,
} from './fixtures';

/**
 * The three behavioural guarantees the shared i18n architecture has to hold.
 *
 * Ported from `stream-chat-react-native`'s `Streami18nGuarantees.test.ts`, where each one was written
 * against a real bug found reviewing the web implementation. They live here now because they describe
 * `StreamI18n` behaviour rather than anything React- or RN-specific, which means a third SDK cannot
 * regress them and neither UI SDK has to keep its own copy.
 *
 * G1 — every language is layered over the SDK's bundled defaults, however it was selected.
 * G2 — a partial dictionary is safe: unsupplied keys render English, never a raw dotted path.
 * G3 — selecting an unregistered language warns and continues; it must not silently reset to `en`.
 */

type Dictionary = Partial<Record<keyof FixtureCatalog, string>>;

/** Core has no catalog, so every instance is handed the fixture's bundled defaults. */
const setup = (options: Record<string, unknown> = {}) =>
  new StreamI18n<FixtureCatalog, FixtureBundledKey>({
    logger: () => {},
    runtimeDefaults: fixtureRuntimeDefaults,
    ...options,
  });

describe('G1 — bundled defaults are layered under every language', () => {
  it('applies to a language selected via the `language` option', async () => {
    const i18n = setup({ language: 'de' });
    const { t } = await i18n.getTranslators();

    expect(t(FORMATTER_KEY)).not.toBe(FORMATTER_KEY);
  });

  it('applies to a language added with registerTranslation', async () => {
    const i18n = setup();
    i18n.registerTranslation('de', {
      'common.cancel.label': 'Abbrechen',
    } satisfies Dictionary);
    await i18n.setLanguage('de');
    const { t } = await i18n.getTranslators();

    expect(t(FORMATTER_KEY)).not.toBe(FORMATTER_KEY);
  });

  it('applies to `en` when no dictionary is supplied at all', async () => {
    const i18n = setup();
    const { t } = await i18n.getTranslators();

    expect(t(FORMATTER_KEY)).not.toBe(FORMATTER_KEY);
  });

  it('survives registerTranslation for a language that already had one', async () => {
    const i18n = setup({ language: 'de' });
    i18n.registerTranslation('de', {
      'common.cancel.label': 'Abbrechen',
    } satisfies Dictionary);
    i18n.registerTranslation('de', { 'common.loading.text': 'Lädt...' });
    const { t } = await i18n.getTranslators();

    // Registering twice must accumulate, and must not knock out the bundled formatter keys.
    expect(t(FORMATTER_KEY)).not.toBe(FORMATTER_KEY);
    expect(t('common.cancel.label', 'Cancel')).toBe('Abbrechen');
    expect(t('common.loading.text', 'Loading...')).toBe('Lädt...');
  });

  it('never lets an integrator dictionary shadow a bundled key by omission', async () => {
    const i18n = setup({
      language: 'de',
      translationsForLanguage: { 'common.cancel.label': 'Abbrechen' },
    });
    const { t } = await i18n.getTranslators();

    expect(t(FORMATTER_KEY)).toBe(fixtureRuntimeDefaults[FORMATTER_KEY]);
  });
});

describe('G2 — a partial dictionary renders English, not a dotted path', () => {
  it('renders the inline default for a key the dictionary does not supply', async () => {
    const i18n = setup({ language: 'de' });
    i18n.registerTranslation('de', {
      'common.cancel.label': 'Abbrechen',
    } satisfies Dictionary);
    const { t } = await i18n.getTranslators();

    expect(t('common.loading.text', 'Loading...')).toBe('Loading...');
  });

  it('renders the supplied translation when the dictionary does supply it', async () => {
    const i18n = setup({ language: 'de' });
    i18n.registerTranslation('de', {
      'common.cancel.label': 'Abbrechen',
    } satisfies Dictionary);
    const { t } = await i18n.getTranslators();

    expect(t('common.cancel.label', 'Cancel')).toBe('Abbrechen');
  });

  it('never renders a raw dotted key for a prose key', async () => {
    const i18n = setup({ language: 'de' });
    const { t } = await i18n.getTranslators();

    const rendered = t('common.loading.text', 'Loading...');
    expect(rendered).not.toMatch(/^[a-z][a-zA-Z]*(\.[a-zA-Z]+)+$/);
  });

  it('does not let an integrator parseMissingKeyHandler blank out prose keys', async () => {
    // Every prose key looks "missing" to i18next — it resolves from the inline default, not from a
    // resource bundle — and the handler's return value replaces the rendered string. An unguarded
    // handler therefore blanks out most of the UI.
    const i18n = setup({ i18nextConfigOverrides: { parseMissingKeyHandler: () => '' } });
    const { t } = await i18n.getTranslators();

    expect(t('common.loading.text', 'Loading...')).toBe('Loading...');
  });

  it('still reports a genuinely missing key to an integrator handler', async () => {
    const parseMissingKeyHandler = vi.fn(() => 'MISSING');
    const i18n = setup({ i18nextConfigOverrides: { parseMissingKeyHandler } });
    const { t } = await i18n.getTranslators();

    // No inline default and not in runtimeDefaults — this one really is missing.
    expect(t(asDynamicKey('nothing.declares.this'))).toBe('MISSING');
    expect(parseMissingKeyHandler).toHaveBeenCalled();
  });
});

describe('G3 — an unregistered language warns and continues', () => {
  it('does not silently reset the language to en', async () => {
    const i18n = setup({ language: 'de' });
    await i18n.getTranslators();

    expect(i18n.currentLanguage).toBe('de');
  });

  it('warns that the language has no dictionary', async () => {
    const logger = vi.fn();
    const i18n = setup({ language: 'de', logger });
    await i18n.getTranslators();

    // Specifically the *translation* warning — not an unrelated dayjs "locale config for de does not
    // exist" message, which would let this pass for the wrong reason.
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('registerTranslation'));
    expect(logger).toHaveBeenCalledWith(
      expect.stringMatching(/no translation dictionary is registered/i),
    );
  });

  it('keeps the language after setLanguage to an unregistered one', async () => {
    const i18n = setup();
    await i18n.getTranslators();
    await i18n.setLanguage('de');

    expect(i18n.currentLanguage).toBe('de');
  });

  it('still renders English copy in the unregistered language', async () => {
    const i18n = setup({ language: 'de' });
    const { t } = await i18n.getTranslators();

    expect(t('common.loading.text', 'Loading...')).toBe('Loading...');
  });
});

describe('G3 — when the warning fires', () => {
  /**
   * Timing matters as much as the message. `registerTranslation()` legitimately runs *after*
   * construction — it is the documented way to add a language — so warning in the constructor fires for
   * every integrator doing the normal thing, and trains them to ignore it.
   */
  it('does not warn at construction, before registerTranslation has had a chance to run', () => {
    const logger = vi.fn();

    new StreamI18n<FixtureCatalog, FixtureBundledKey>({
      language: 'de',
      logger,
      runtimeDefaults: fixtureRuntimeDefaults,
    });

    expect(logger).not.toHaveBeenCalledWith(
      expect.stringMatching(/no translation dictionary is registered/i),
    );
  });

  it('warns exactly once, at init, when no dictionary ever arrives', async () => {
    const logger = vi.fn();
    const i18n = setup({ language: 'de', logger });

    await i18n.init();

    const warnings = logger.mock.calls.filter(([message]) =>
      /no translation dictionary is registered/i.test(String(message)),
    );
    expect(warnings).toHaveLength(1);
  });

  it('does not warn when a dictionary was registered before init', async () => {
    const logger = vi.fn();
    const i18n = setup({ language: 'de', logger });
    i18n.registerTranslation('de', { 'common.cancel.label': 'Abbrechen' });

    await i18n.init();

    expect(logger).not.toHaveBeenCalledWith(
      expect.stringMatching(/no translation dictionary is registered/i),
    );
  });
});
