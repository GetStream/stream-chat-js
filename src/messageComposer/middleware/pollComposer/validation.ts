/**
 * Identifiers for poll-composer field validation failures. They are rendered inline and never reach
 * `NotificationManager` (unlike `CORE_NOTIFICATION_TYPE`). **Public API:** UI SDKs key translations on
 * them, so renaming one is breaking.
 */
export const POLL_COMPOSER_VALIDATION_CODE = {
  maxVotesNotNumeric: 'validation:poll:maxVotes:notNumeric',
  maxVotesOutOfRange: 'validation:poll:maxVotes:outOfRange',
  maxVotesUniqueVoteEnforced: 'validation:poll:maxVotes:uniqueVoteEnforced',
  nameRequired: 'validation:poll:name:required',
  optionDuplicate: 'validation:poll:option:duplicate',
  optionEmpty: 'validation:poll:option:empty',
} as const;

export type PollComposerValidationCode =
  (typeof POLL_COMPOSER_VALIDATION_CODE)[keyof typeof POLL_COMPOSER_VALIDATION_CODE];

/** Untranslated English fallback per code. The wording is not public contract. */
const POLL_COMPOSER_VALIDATION_MESSAGE: Record<PollComposerValidationCode, string> = {
  [POLL_COMPOSER_VALIDATION_CODE.maxVotesNotNumeric]: 'Only numbers are allowed',
  [POLL_COMPOSER_VALIDATION_CODE.maxVotesOutOfRange]: 'Type a number from 2 to 10',
  [POLL_COMPOSER_VALIDATION_CODE.maxVotesUniqueVoteEnforced]:
    'Enforce unique vote is enabled',
  [POLL_COMPOSER_VALIDATION_CODE.nameRequired]: 'Question is required',
  [POLL_COMPOSER_VALIDATION_CODE.optionDuplicate]: 'Option already exists',
  [POLL_COMPOSER_VALIDATION_CODE.optionEmpty]: 'Option is empty',
};

/** A poll-composer field validation failure. `message` is an English fallback for `code`. */
export type PollComposerValidationError = {
  /** Stable identifier. See {@link POLL_COMPOSER_VALIDATION_CODE}. */
  code: PollComposerValidationCode;
  /** Untranslated English fallback. Not part of the public contract. */
  message: string;
  /** Extra context for interpolation, e.g. the offending value. */
  metadata?: Record<string, unknown>;
};

/** Builds a {@link PollComposerValidationError}, filling in the English fallback for `code`. */
export const pollComposerValidationError = (
  code: PollComposerValidationCode,
  metadata?: Record<string, unknown>,
): PollComposerValidationError => ({
  code,
  message: POLL_COMPOSER_VALIDATION_MESSAGE[code],
  ...(metadata ? { metadata } : {}),
});

/** Distinguishes a single failure from the per-option-id record that `options` errors use. */
export const isPollComposerValidationError = (
  value: unknown,
): value is PollComposerValidationError =>
  typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
