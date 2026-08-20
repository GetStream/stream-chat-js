/**
 * A synthetic translation catalog standing in for a UI SDK's generated `keys.ts`.
 *
 * Core ships no catalog of its own — each UI SDK generates one from its own `t()` call sites — so the
 * behavioural suites here run against this fixture instead. That is deliberately better than testing
 * through a real 400+ key catalog: every key *shape* the type layer and the runtime have to handle is
 * present and named, so a shape that stops working fails a test rather than hiding among hundreds of
 * structurally identical prose keys.
 */
export type FixtureCatalog = {
  // plain prose
  'common.cancel.label': 'Cancel';
  'common.loading.text': 'Loading...';
  // prose carrying interpolation
  'common.greeting.text': 'Hello {{ name }}';
  // a plural pair, single variable
  'channel.memberCount.title_one': '{{ count }} member';
  'channel.memberCount.title_other': '{{ count }} members';
  // a plural pair with a second variable, to exercise multi-var inference
  'poll.voteCount.title_one': '{{ count }} vote in {{ pollName }}';
  'poll.voteCount.title_other': '{{ count }} votes in {{ pollName }}';
  // formatter expressions — bundled, no inline default anywhere
  'timestamp.MessageTimestamp': '{{ timestamp | timestampFormatter(format: LT) }}';
  'timestamp.DateSeparator': '{{ timestamp | timestampFormatter(calendar: true) }}';
  'duration.messageReminder': '{{ milliseconds | durationFormatter(withSuffix: true) }}';
  // ordinary prose that nonetheless reaches t() as a runtime value, so it is bundled
  'a11y.close.label': 'Close';
};

/** The SDK-bundled keys with no inline default at any call site. */
export type FixtureBundledKey = 'a11y.close.label';

/**
 * The only translation data a UI SDK ships: keys that cannot carry an inline `defaultValue`.
 *
 * If these are not layered under every language, a formatter key renders as its own dotted path and
 * a timestamp renders as an unformatted ISO string — which is guarantee G1 below.
 */
export const fixtureRuntimeDefaults: Record<string, string> = {
  'a11y.close.label': 'Close',
  'duration.messageReminder': '{{ milliseconds | durationFormatter(withSuffix: true) }}',
  'timestamp.DateSeparator': '{{ timestamp | timestampFormatter(calendar: true) }}',
  'timestamp.MessageTimestamp': '{{ timestamp | timestampFormatter(format: LT) }}',
};

/** A formatter key: bundled data, no inline default. Renders as the literal key if G1 is broken. */
export const FORMATTER_KEY = 'timestamp.MessageTimestamp';
