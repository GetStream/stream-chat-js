import { describe, expect, it } from 'vitest';

import { CORE_NOTIFICATION_TYPE } from '../../../src';
import {
  CORE_NOTIFICATION_TRANSLATION_KEY,
  LANGUAGE_NAMES,
  languageNameDefaults,
  StreamI18n,
  translateNotification,
} from '../../../src/i18n';
import { fixtureRuntimeDefaults } from './fixtures';

const translatorFor = async (dictionary: Record<string, string> = {}) => {
  const i18n = new StreamI18n({
    logger: () => {},
    runtimeDefaults: { ...fixtureRuntimeDefaults, ...dictionary },
  });
  const { t } = await i18n.init();
  return t as unknown as (
    key: string,
    d?: string | Record<string, unknown>,
    o?: Record<string, unknown>,
  ) => string;
};

describe('CORE_NOTIFICATION_TRANSLATION_KEY', () => {
  /**
   * The compile-time guard is `Record<CoreNotificationType, string>` in the source; this is the runtime
   * half. Together they are what both UI SDKs lacked — each hand-maintained the same table, and the two
   * copies drifted in both directions.
   */
  it('covers every identifier core emits, and nothing else', () => {
    expect(Object.keys(CORE_NOTIFICATION_TRANSLATION_KEY).sort()).toEqual(
      Object.values(CORE_NOTIFICATION_TYPE).sort(),
    );
  });

  it('maps each identifier to a distinct key under the notification namespace', () => {
    const keys = Object.values(CORE_NOTIFICATION_TRANSLATION_KEY);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach((key) => expect(key).toMatch(/^notification\.[a-zA-Z]+$/));
  });
});

describe('translateNotification', () => {
  it('resolves a recognized identifier through its key', async () => {
    const t = await translatorFor({
      'notification.pollCreateFailed': 'Umfrage konnte nicht erstellt werden',
    });

    expect(
      translateNotification({
        notification: {
          message: 'Failed to create the poll',
          type: CORE_NOTIFICATION_TYPE.pollCreateFailed,
        },
        t,
      }),
    ).toBe('Umfrage konnte nicht erstellt werden');
  });

  it('falls back to the English message for a mapped but untranslated key', async () => {
    const t = await translatorFor();

    expect(
      translateNotification({
        notification: {
          message: 'Failed to create the poll',
          type: CORE_NOTIFICATION_TYPE.pollCreateFailed,
        },
        t,
      }),
    ).toBe('Failed to create the poll');
  });

  /** A newer core, or an SDK/integrator identifier, must not produce an empty toast. */
  it('renders the message verbatim for an unrecognized identifier', async () => {
    const t = await translatorFor();

    expect(
      translateNotification({
        notification: {
          message: 'Something new happened',
          type: 'api:future:thing:failed',
        },
        t,
      }),
    ).toBe('Something new happened');
  });

  it('renders the message when there is no identifier at all', async () => {
    const t = await translatorFor();

    expect(translateNotification({ notification: { message: 'No type here' }, t })).toBe(
      'No type here',
    );
  });

  it('passes metadata through as interpolation values', async () => {
    const t = await translatorFor({
      'notification.commandDisabled': 'Not available while {{ reason }}',
    });

    expect(
      translateNotification({
        notification: {
          message: 'Command not available while editing',
          metadata: { reason: 'editing' },
          type: CORE_NOTIFICATION_TYPE.commandDisabled,
        },
        t,
      }),
    ).toBe('Not available while editing');
  });

  it('accepts extra identifiers a UI SDK emits itself', async () => {
    const t = await translatorFor({
      'notification.audioFailed': 'Wiedergabe fehlgeschlagen',
    });

    expect(
      translateNotification({
        notification: {
          message: 'Audio playback failed',
          type: 'browser:audio:playback:error',
        },
        t,
        translationKeys: {
          ...CORE_NOTIFICATION_TRANSLATION_KEY,
          'browser:audio:playback:error': 'notification.audioFailed',
        },
      }),
    ).toBe('Wiedergabe fehlgeschlagen');
  });
});

describe('LANGUAGE_NAMES', () => {
  /**
   * Exhaustiveness against `TranslationLanguage` is enforced at compile time by
   * `satisfies Record<TranslationLanguage, string>`; this covers the runtime shape.
   */
  it('exposes a non-empty English name for every language', () => {
    const entries = Object.entries(LANGUAGE_NAMES);
    expect(entries.length).toBeGreaterThan(50);
    entries.forEach(([code, name]) => {
      expect(name, `${code} has no name`).toBeTruthy();
    });
  });

  it('prefixes the catalog-ready defaults with `language.`', () => {
    expect(languageNameDefaults['language.de']).toBe('German');
    expect(languageNameDefaults['language.zh-TW']).toBe('Chinese (Traditional)');
    expect(Object.keys(languageNameDefaults)).toHaveLength(
      Object.keys(LANGUAGE_NAMES).length,
    );
    Object.keys(languageNameDefaults).forEach((key) =>
      expect(key.startsWith('language.')).toBe(true),
    );
  });

  it('renders through t() when merged into the bundled defaults', async () => {
    const t = await translatorFor(languageNameDefaults);
    expect(t('language.de')).toBe('German');
  });
});
