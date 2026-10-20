export type NotificationSeverity =
  | 'error'
  | 'warning'
  | 'info'
  | 'success'
  | (string & {});

export type NotificationAction = {
  label: string;
  handler: () => void;
  metadata?: Record<string, unknown>;
};

export type NotificationOrigin = { emitter: string; context?: Record<string, unknown> };

/**
 * Notification types emitted by `stream-chat`, formatted `domain:entity:operation:result`
 * (e.g. `api:message:send:failed`).
 *
 * **The values are public API**: UI SDKs key their translations on them. Emit them through this
 * map, never as inline literals.
 */
export const CORE_NOTIFICATION_TYPE = {
  attachmentFileMissing: 'validation:attachment:file:missing',
  attachmentIdMissing: 'validation:attachment:id:missing',
  attachmentUploadBlocked: 'validation:attachment:upload:blocked',
  attachmentUploadFailed: 'api:attachment:upload:failed',
  attachmentUploadInProgress: 'validation:attachment:upload:in-progress',
  /** Carries `metadata.reason` (`'editing' | 'quoted_message'`), which the message depends on. */
  commandDisabled: 'validation:command:disabled',
  commandNotReady: 'validation:command:not-ready',
  locationCreateFailed: 'api:location:create:failed',
  messageJumpFailed: 'api:message:jump:failed',
  messageJumpToLatestFailed: 'api:message:jumpToLatest:failed',
  /** The message stays in the list, marked failed. */
  messageSendFailed: 'api:message:send:failed',
  /** The edit is kept on the message, marked failed. */
  messageUpdateFailed: 'api:message:update:failed',
  pollCastVoteLimit: 'validation:poll:castVote:limit',
  pollCreateFailed: 'api:poll:create:failed',
} as const;

/** A notification type emitted by `stream-chat` itself. See {@link CORE_NOTIFICATION_TYPE}. */
export type CoreNotificationType =
  (typeof CORE_NOTIFICATION_TYPE)[keyof typeof CORE_NOTIFICATION_TYPE];

export type Notification = {
  id: string;
  /**
   * Untranslated English text, a developer-facing fallback rather than display copy. Its wording
   * can change in a minor release: resolve {@link Notification.type} to your own copy instead.
   */
  message: string;
  /** Creation time, in ms since epoch. */
  createdAt: number;
  /** The emitter, which consumers can match to act on specific origins. */
  origin: NotificationOrigin;
  actions?: NotificationAction[];
  severity?: NotificationSeverity;
  /**
   * Stable identifier for what the notification is about, for grouping and for resolving a
   * translation. Values emitted by `stream-chat` are in {@link CORE_NOTIFICATION_TYPE}. Custom
   * identifiers should follow the same `domain:entity:operation:result` format.
   */
  type?: CoreNotificationType | (string & {});
  /** Auto-dismiss duration in ms. The countdown starts on `NotificationManager.startTimeout()`. */
  duration?: number;
  metadata?: Record<string, unknown>;
  /** For routing or grouping (e.g. `target:channel`). */
  tags?: string[];
  /** The originally thrown error, for error notifications. */
  originalError?: Error;
};

export type NotificationOptions = Partial<
  Pick<
    Notification,
    'type' | 'severity' | 'actions' | 'metadata' | 'tags' | 'originalError'
  >
> & {
  /**
   * Display time in ms, defaulting to the configured duration of the severity. `0` is persistent:
   * dismiss it with `client.notifications.remove(id)`.
   */
  duration?: number;
};

/** @deprecated Use {@link NotificationManagerState} instead. */
export type NotificationState = {
  notifications: Notification[];
};

export type NotificationManagerState = NotificationState;

export type NotificationSortComparator = (a: Notification, b: Notification) => number;

export type NotificationManagerConfig = {
  durations: Partial<Record<NotificationSeverity, number>>;
  sortComparator?: NotificationSortComparator;
};

export type AddNotificationPayload = Pick<Notification, 'message' | 'origin'> & {
  options?: NotificationOptions;
};
