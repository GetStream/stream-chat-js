/**
 * Stable identifiers for poll-composer field validation failures.
 *
 * Same `domain:entity:operation:result` convention as `CORE_NOTIFICATION_TYPE`, but these are *field*
 * errors rendered inline next to an input, so they deliberately do not go through
 * `NotificationManager` — that would surface a toast per keystroke.
 *
 * **These values are public API.** UI SDKs key their translation tables on them, so renaming one is a
 * breaking change.
 */
export const POLL_VALIDATION_CODE = {
  maxVotesNotNumeric: 'validation:poll:maxVotes:notNumeric',
  maxVotesOutOfRange: 'validation:poll:maxVotes:outOfRange',
  maxVotesUniqueVoteEnforced: 'validation:poll:maxVotes:uniqueVoteEnforced',
  nameRequired: 'validation:poll:name:required',
  optionDuplicate: 'validation:poll:option:duplicate',
  optionEmpty: 'validation:poll:option:empty',
} as const;

export type PollValidationCode =
  (typeof POLL_VALIDATION_CODE)[keyof typeof POLL_VALIDATION_CODE];

/**
 * Untranslated English for each code.
 *
 * Kept here rather than at the call sites so one code cannot end up with two different wordings, and
 * so the whole set is reviewable in one place. This is a developer-facing fallback — the wording is
 * not part of the public contract and may change in a minor release.
 */
const POLL_VALIDATION_MESSAGE: Record<PollValidationCode, string> = {
  [POLL_VALIDATION_CODE.maxVotesNotNumeric]: 'Only numbers are allowed',
  [POLL_VALIDATION_CODE.maxVotesOutOfRange]: 'Type a number from 2 to 10',
  [POLL_VALIDATION_CODE.maxVotesUniqueVoteEnforced]: 'Enforce unique vote is enabled',
  [POLL_VALIDATION_CODE.nameRequired]: 'Question is required',
  [POLL_VALIDATION_CODE.optionDuplicate]: 'Option already exists',
  [POLL_VALIDATION_CODE.optionEmpty]: 'Option is empty',
};

/**
 * A poll-composer field validation failure.
 *
 * `code` is the stable identifier to resolve localized copy from. `message` carries untranslated
 * English alongside it so a consumer with no i18n layer still renders something, and so an
 * identifier a consumer does not recognize degrades to readable text instead of a blank field.
 */
export type PollValidationError = {
  /** Stable identifier. See {@link POLL_VALIDATION_CODE}. */
  code: PollValidationCode;
  /** Untranslated English fallback. Not part of the public contract. */
  message: string;
  /** Extra context for interpolation, e.g. the offending value. */
  metadata?: Record<string, unknown>;
};

/** Builds a {@link PollValidationError}, filling in the English fallback for `code`. */
export const pollValidationError = (
  code: PollValidationCode,
  metadata?: Record<string, unknown>,
): PollValidationError => ({
  code,
  message: POLL_VALIDATION_MESSAGE[code],
  ...(metadata ? { metadata } : {}),
});

/**
 * Narrows a field's error to a single failure.
 *
 * `options` errors are keyed by option id, so a field error is either one `PollValidationError` or a
 * record of them; this distinguishes the two.
 */
export const isPollValidationError = (value: unknown): value is PollValidationError =>
  typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
