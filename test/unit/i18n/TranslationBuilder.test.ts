import { describe, expect, it, vi } from 'vitest';

import { Streami18n, TranslationTopic } from '../../../src/i18n';
import type { Translator } from '../../../src/i18n';

/**
 * i18next post-processors are configured **globally** (`postProcess: [...]`), so a topic is invoked for
 * every key, not only the one named after it. A topic therefore has to recognise its own calls and pass
 * everything else through untouched — which is what `options.kind` does here, and what a real topic does
 * by checking for the object it dispatches on.
 */
class KindTopic extends TranslationTopic<{ kind?: string }> {
  translate = (value: string, key: string, options: { kind?: string }) => {
    if (!options.kind) return value;
    const chosen = this.translators.get(options.kind) ?? this.translators.get('*');
    return chosen?.({ key, options, t: this.i18next.t, value }) ?? value;
  };
}

/** The key's own value is only a fallback: a topic that handles the call replaces it wholesale. */
const FALLBACK = 'FALLBACK';

const setup = (options: Record<string, unknown> = {}) =>
  new Streami18n({
    logger: () => {},
    runtimeDefaults: { 'translationBuilderTopic.kind': FALLBACK },
    translationBuilderTopics: { kind: KindTopic },
    ...options,
  });

const render = (
  t: unknown,
  options: Record<string, unknown> = { kind: 'shout', value: 'hello' },
) =>
  (t as (k: string, o?: Record<string, unknown>) => string)(
    'translationBuilderTopic.kind',
    options,
  );

describe('TranslationBuilder', () => {
  it('runs the topic as an i18next post-processor', async () => {
    const i18n = setup();
    i18n.translationBuilder.registerTranslators('kind', {
      shout: ({ options }) => String(options.value).toUpperCase(),
    });
    const { t } = await i18n.init();

    expect(render(t)).toBe('HELLO');
  });

  /**
   * The reason the registration buffer exists: topics are only constructed during `init()`, but an
   * integrator registers translators against the instance they just built. Without buffering, anything
   * registered first is silently dropped.
   */
  it('flushes translators registered before init', async () => {
    const i18n = setup();
    expect(i18n.translationBuilder.getTopic('kind')).toBeUndefined();
    i18n.translationBuilder.registerTranslators('kind', {
      '*': ({ options }) => `[${options.value}]`,
    });

    const { t } = await i18n.init();

    expect(i18n.translationBuilder.getTopic('kind')).toBeDefined();
    expect(render(t, { kind: 'anything', value: 'x' })).toBe('[x]');
  });

  /**
   * Removal has to reach the buffer too, not just a live topic.
   *
   * Registering and then removing before `init()` is a real sequence — an integrator swapping one
   * translator out during setup — and if `removeTranslators` only looked at constructed topics, the
   * removed translator would come back when the buffer flushed. Ported from the React SDK's suite,
   * which owned this case before the plumbing moved here.
   */
  it('removes a buffered translator before the topic exists', async () => {
    const i18n = setup();
    i18n.translationBuilder.registerTranslators('kind', {
      quiet: ({ options }) => String(options.value).toLowerCase(),
      shout: ({ options }) => String(options.value).toUpperCase(),
    });
    i18n.translationBuilder.removeTranslators('kind', ['shout']);

    const { t } = await i18n.init();

    // `quiet` survived the flush; `shout` did not come back with it.
    expect(render(t, { kind: 'quiet', value: 'HeLLo' })).toBe('hello');
    expect(render(t, { kind: 'shout', value: 'HeLLo' })).toBe(FALLBACK);
  });

  it('lets a later registration override an earlier one', async () => {
    const i18n = setup();
    const { t } = await i18n.init();

    i18n.translationBuilder.registerTranslators('kind', { '*': () => 'first' });
    expect(render(t)).toBe('first');

    i18n.translationBuilder.registerTranslators('kind', { '*': () => 'second' });
    expect(render(t)).toBe('second');
  });

  it('falls back to the key value when a translator declines', async () => {
    const i18n = setup();
    const declines: Translator<{ kind?: string }> = () => null;
    i18n.translationBuilder.registerTranslators('kind', { '*': declines as Translator });
    const { t } = await i18n.init();

    expect(render(t)).toBe(FALLBACK);
  });

  /** A topic must not touch keys that are not its own, since post-processing is global. */
  it('passes through calls it does not recognise', async () => {
    const i18n = setup({
      runtimeDefaults: {
        'timestamp.Unrelated': '{{ timestamp | timestampFormatter(format: LT) }}',
        'translationBuilderTopic.kind': FALLBACK,
      },
    });
    i18n.translationBuilder.registerTranslators('kind', { '*': () => 'HANDLED' });
    const { t } = await i18n.init();

    const unrelated = (t as (k: string, o?: Record<string, unknown>) => string)(
      'timestamp.Unrelated',
      { timestamp: '2026-03-13T14:32:00.000Z' },
    );
    expect(unrelated).toBe('2:32 PM');
  });

  it('removeTranslators drops a registered translator', async () => {
    const i18n = setup();
    i18n.translationBuilder.registerTranslators('kind', { '*': () => 'handled' });
    const { t } = await i18n.init();
    expect(render(t)).toBe('handled');

    i18n.translationBuilder.removeTranslators('kind', ['*']);

    expect(render(t)).toBe(FALLBACK);
  });

  it('disableTopic turns the post-processor into a pass-through', async () => {
    const i18n = setup();
    i18n.translationBuilder.registerTranslators('kind', { '*': () => 'handled' });
    const { t } = await i18n.init();
    expect(render(t)).toBe('handled');

    i18n.translationBuilder.disableTopic('kind');

    expect(i18n.translationBuilder.getTopic('kind')).toBeUndefined();
    expect(render(t)).toBe(FALLBACK);
  });

  it('registerTopic is idempotent', async () => {
    const i18n = setup();
    await i18n.init();
    const first = i18n.translationBuilder.getTopic('kind');

    i18n.translationBuilder.registerTopic('kind', KindTopic);

    expect(i18n.translationBuilder.getTopic('kind')).toBe(first);
  });

  it('configures no post-processing when no topics are supplied', async () => {
    const i18n = new Streami18n({ logger: vi.fn(), runtimeDefaults: {} });
    const { t } = await i18n.init();

    expect((t as (k: string, d: string) => string)('common.thing', 'Thing')).toBe(
      'Thing',
    );
  });
});
