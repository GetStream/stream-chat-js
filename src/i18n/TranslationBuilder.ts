import type { i18n as I18nInstance } from 'i18next';

/**
 * An i18next instance, as accepted by {@link TranslationTopic} and exposed as
 * `Streami18n.i18nInstance`.
 *
 * Re-exported because it is part of this module's public surface: a consumer implementing a topic, or
 * mocking one in a test, has to be able to name the type. Without this they would reach past
 * `stream-chat` into `i18next` directly and have to declare it themselves — the same mistake the
 * `moment-timezone` type leak was.
 */
export type { I18nInstance };

import type { LooseTranslateFunction } from './types';

/**
 * i18next post-processor plumbing, for copy that cannot be resolved from a key alone.
 *
 * The motivating case is a notification: what to render depends on a runtime object, not just the key,
 * so `t('translationBuilderTopic.notification', { notification })` dispatches through a *topic* which
 * picks a *translator* based on that object. This is only the mechanism — the topics and their
 * translators are SDK-specific and stay in the UI SDKs, since they reference SDK key names.
 *
 * A UI SDK may not need this at all: dispatching on the object at the render site instead is perfectly
 * valid, and the React Native SDK does exactly that. The plumbing lives here so either approach is
 * available without a core change.
 */
type TopicName = string;
type TranslatorName = string;

/**
 * Resolves one case within a topic. Returning `null` means "not mine" and lets the next candidate try.
 *
 * `t` is loose rather than catalog-typed: a translator is handed keys by the post-processor at runtime,
 * so it cannot be checked against a specific catalog.
 */
export type Translator<O extends Record<string, unknown> = Record<string, unknown>> =
  (params: {
    key: string;
    options: O;
    t: LooseTranslateFunction;
    value: string;
  }) => string | null;

export type TranslationTopicOptions<
  O extends Record<string, unknown> = Record<string, unknown>,
> = {
  i18next: I18nInstance;
  translators?: Record<string, Translator<O>>;
};

export abstract class TranslationTopic<
  O extends Record<string, unknown> = Record<string, unknown>,
> {
  protected translators: Map<string, Translator<O>> = new Map();
  protected i18next: I18nInstance;

  constructor(protected options: TranslationTopicOptions<O>) {
    this.i18next = options.i18next;
    if (options.translators) {
      Object.entries(options.translators).forEach(([name, translator]) => {
        this.setTranslator(name, translator);
      });
    }
  }

  abstract translate(value: string, key: string, options: O): string;

  setTranslator = (name: string, translator: Translator<O>) => {
    this.translators.set(name, translator);
  };

  removeTranslator = (name: string) => {
    this.translators.delete(name);
  };
}

export type TranslationTopicConstructor = new (
  options: TranslationTopicOptions,
) => TranslationTopic;

const forwardTranslation: Translator = ({ value }) => value;

export class TranslationBuilder {
  private topics = new Map<string, TranslationTopic>();

  /**
   * Translators registered before their topic exists.
   *
   * Topics are only created during `Streami18n.init()`, but an integrator registers translators against
   * the constructed instance — so registrations that arrive first are buffered and flushed when the
   * topic appears, rather than silently dropped.
   */
  private translatorRegistrationsBuffer: Record<
    TopicName,
    Record<TranslatorName, Translator>
  > = {};

  constructor(private i18next: I18nInstance) {}

  registerTopic = (name: TopicName, Topic: TranslationTopicConstructor) => {
    let topic = this.topics.get(name);

    if (!topic) {
      topic = new Topic({ i18next: this.i18next });
      this.topics.set(name, topic);
      this.i18next.use({
        name,
        process: (value: string, key: string, options: Record<string, unknown>) => {
          // Re-read from the map rather than closing over `topic`, so `disableTopic` takes effect.
          const registered = this.topics.get(name);
          if (!registered) return value;
          return registered.translate(value, key, options);
        },
        type: 'postProcessor' as const,
      });
    }

    const buffered = this.translatorRegistrationsBuffer[name];
    if (buffered) {
      Object.entries(buffered).forEach(([translatorName, translator]) => {
        topic.setTranslator(translatorName, translator);
      });
      delete this.translatorRegistrationsBuffer[name];
    }

    return topic;
  };

  disableTopic = (topicName: TopicName) => {
    const topic = this.topics.get(topicName);
    if (!topic) return;
    // i18next has no way to remove a post-processor, so it is replaced with a pass-through.
    this.i18next.use({
      name: topicName,
      process: forwardTranslation,
      type: 'postProcessor',
    });
    this.topics.delete(topicName);
  };

  getTopic = (topicName: TopicName) => this.topics.get(topicName);

  registerTranslators(
    topicName: TopicName,
    translators: Record<TranslatorName, Translator>,
  ) {
    const topic = this.getTopic(topicName);

    if (!topic) {
      this.translatorRegistrationsBuffer[topicName] ??= {};
      Object.entries(translators).forEach(([translatorName, translator]) => {
        this.translatorRegistrationsBuffer[topicName][translatorName] = translator;
      });
      return;
    }

    Object.entries(translators).forEach(([name, translator]) => {
      topic.setTranslator(name, translator);
    });
  }

  removeTranslators(topicName: TopicName, translators: TranslatorName[]) {
    if (this.translatorRegistrationsBuffer[topicName]) {
      translators.forEach((translatorName) => {
        delete this.translatorRegistrationsBuffer[topicName][translatorName];
      });
    }

    const topic = this.getTopic(topicName);
    if (!topic) return;
    translators.forEach((name) => {
      topic.removeTranslator(name);
    });
  }
}
