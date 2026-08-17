import { CORE_NOTIFICATION_TYPE } from '../notifications';
import type { CoreNotificationType, Notification } from '../notifications';
import { asDynamicKey } from './translator';
import type { LooseTranslateFunction } from './types';

/**
 * The canonical translation key for each notification `stream-chat` emits.
 *
 * `Record<CoreNotificationType, string>` is the drift gate: adding an identifier to
 * {@link CORE_NOTIFICATION_TYPE} fails to compile until a key is supplied here, and a key for an
 * identifier that no longer exists is rejected. That is the check both UI SDKs were missing — they each
 * hand-maintained the same 16-entry table, and the copies had drifted in both directions: entries for
 * identifiers nothing emits, and core identifiers neither mapped, which fell through to rendering
 * untranslated English.
 *
 * Keys are shared rather than per-SDK so an integrator's notification dictionary is portable between
 * the React and React Native SDKs.
 */
export const CORE_NOTIFICATION_TRANSLATION_KEY: Record<CoreNotificationType, string> = {
  [CORE_NOTIFICATION_TYPE.attachmentFileMissing]: 'notification.attachmentFileMissing',
  [CORE_NOTIFICATION_TYPE.attachmentIdMissing]: 'notification.attachmentIdMissing',
  [CORE_NOTIFICATION_TYPE.attachmentUploadBlocked]:
    'notification.attachmentUploadBlocked',
  [CORE_NOTIFICATION_TYPE.attachmentUploadFailed]: 'notification.attachmentUploadFailed',
  [CORE_NOTIFICATION_TYPE.attachmentUploadInProgress]:
    'notification.attachmentUploadInProgress',
  // Carries `metadata.reason` ('editing' | 'replying'), which the English message varies by. Copy for
  // this key should interpolate `{{ reason }}` or the SDK should branch before calling in.
  [CORE_NOTIFICATION_TYPE.commandDisabled]: 'notification.commandDisabled',
  [CORE_NOTIFICATION_TYPE.commandNotReady]: 'notification.commandNotReady',
  [CORE_NOTIFICATION_TYPE.locationCreateFailed]: 'notification.locationCreateFailed',
  [CORE_NOTIFICATION_TYPE.messageJumpFailed]: 'notification.messageJumpFailed',
  [CORE_NOTIFICATION_TYPE.messageJumpToLatestFailed]:
    'notification.messageJumpToLatestFailed',
  [CORE_NOTIFICATION_TYPE.pollCastVoteLimit]: 'notification.pollCastVoteLimit',
  [CORE_NOTIFICATION_TYPE.pollCreateFailed]: 'notification.pollCreateFailed',
};

/** The subset of a notification {@link translateNotification} reads. */
export type TranslatableNotification = Pick<Notification, 'message'> &
  Partial<Pick<Notification, 'type' | 'metadata'>>;

/**
 * Resolves a notification to display copy.
 *
 * Dispatches on `notification.type` — the stable identifier — and never on `notification.message`,
 * which is untranslated English whose wording is not part of core's public contract. Both UI SDKs
 * previously fell back to matching that prose against a hand-maintained table of English sentences,
 * which silently grew stale on every core upgrade.
 *
 * `metadata` is passed through as interpolation values, so copy can reference `{{ reason }}` and the
 * like.
 *
 * An unrecognized identifier renders `message` verbatim rather than a blank or a raw dotted path: a
 * newer core, or an SDK or integrator emitting its own identifier, must not produce an empty toast.
 * Pass `translationKeys` to extend the map with the SDK's own identifiers.
 */
export const translateNotification = ({
  notification,
  t,
  translationKeys = CORE_NOTIFICATION_TRANSLATION_KEY,
}: {
  notification: TranslatableNotification;
  t: LooseTranslateFunction;
  translationKeys?: Record<string, string>;
}): string => {
  const key = notification.type ? translationKeys[notification.type] : undefined;
  if (!key) return notification.message;

  // `message` doubles as the default, so a mapped-but-untranslated key still renders English.
  return t(asDynamicKey(key), notification.message, notification.metadata ?? {});
};
