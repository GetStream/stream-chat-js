import { describe, expect, it } from 'vitest';

import { DEFAULT_LANGUAGE, TranslationStore } from '../../../src/i18n';

/**
 * The layering rule, tested directly.
 *
 * It used to be reachable only through a fully initialized `Streami18n`, which meant asserting on it
 * required i18next, dayjs and an async `init()` — so the rule that actually matters (bundled defaults
 * survive a partial dictionary) was only ever verified as a side effect of rendering.
 */
const BUNDLED = {
  'a11y.close.label': 'Close',
  'timestamp.MessageTimestamp': '{{ timestamp | timestampFormatter(format: LT) }}',
};

describe('TranslationStore', () => {
  it('starts with English registered and nothing else', () => {
    const store = new TranslationStore(BUNDLED);

    expect(store.registeredLanguages.has(DEFAULT_LANGUAGE)).toBe(true);
    expect([...store.registeredLanguages]).toEqual([DEFAULT_LANGUAGE]);
    // No dictionary is created until one is asked for.
    expect(store.languages).toEqual([]);
  });

  it('layers the bundled defaults under a language nobody registered', () => {
    const store = new TranslationStore(BUNDLED);

    expect(store.ensure('de')).toEqual(BUNDLED);
    expect(store.languages).toEqual(['de']);
    // Present, but not *registered* -- the distinction the unregistered-language warning needs.
    expect(store.isRegistered('de')).toBe(false);
  });

  /** Guarantee G1: a partial dictionary must not knock out the bundled formatter keys. */
  it('keeps the bundled keys when a partial dictionary is registered', () => {
    const store = new TranslationStore(BUNDLED);

    const merged = store.register('de', { 'a11y.close.label': 'Schließen' });

    expect(merged['a11y.close.label']).toBe('Schließen');
    expect(merged['timestamp.MessageTimestamp']).toBe(
      '{{ timestamp | timestampFormatter(format: LT) }}',
    );
    expect(store.isRegistered('de')).toBe(true);
  });

  it('accumulates repeated registrations for one language', () => {
    const store = new TranslationStore(BUNDLED);

    store.register('de', { 'a11y.close.label': 'Schließen' });
    const merged = store.register('de', { 'fixture.prose': 'Abbrechen' });

    expect(merged['a11y.close.label']).toBe('Schließen');
    expect(merged['fixture.prose']).toBe('Abbrechen');
  });

  it('lets a later registration win over an earlier one', () => {
    const store = new TranslationStore(BUNDLED);

    store.register('de', { 'a11y.close.label': 'Erste' });
    const merged = store.register('de', { 'a11y.close.label': 'Zweite' });

    expect(merged['a11y.close.label']).toBe('Zweite');
  });

  it('lets an integrator override a bundled key', () => {
    const store = new TranslationStore(BUNDLED);

    const merged = store.register('en', {
      'timestamp.MessageTimestamp': '{{ timestamp | timestampFormatter(format: HH:mm) }}',
    });

    expect(merged['timestamp.MessageTimestamp']).toBe(
      '{{ timestamp | timestampFormatter(format: HH:mm) }}',
    );
  });

  it('does not mutate the bundled defaults it was handed', () => {
    const runtimeDefaults = { ...BUNDLED };
    const store = new TranslationStore(runtimeDefaults);

    store.register('de', { 'a11y.close.label': 'Schließen' });
    store.ensure('fr');

    expect(runtimeDefaults).toEqual(BUNDLED);
  });

  it('keeps a region-coded language separate from its base', () => {
    const store = new TranslationStore(BUNDLED);

    store.register('pt', { 'fixture.prose': 'pt' });
    const ptBR = store.register('pt-BR', { 'fixture.prose': 'pt-BR' });

    expect(ptBR['fixture.prose']).toBe('pt-BR');
    expect(store.entries()).toHaveLength(2);
  });

  it('ensure() is idempotent and preserves what was registered', () => {
    const store = new TranslationStore(BUNDLED);

    store.register('de', { 'fixture.prose': 'Abbrechen' });
    const ensured = store.ensure('de');

    expect(ensured['fixture.prose']).toBe('Abbrechen');
    expect(store.languages).toEqual(['de']);
    expect(store.isRegistered('de')).toBe(true);
  });

  it('works with no bundled defaults at all', () => {
    const store = new TranslationStore();

    expect(store.ensure('de')).toEqual({});
    expect(store.register('de', { 'fixture.prose': 'Abbrechen' })).toEqual({
      'fixture.prose': 'Abbrechen',
    });
  });
});
