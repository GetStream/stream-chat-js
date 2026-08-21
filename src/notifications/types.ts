/** Represents the severity level of a notification */
export type NotificationSeverity =
  | 'error'
  | 'warning'
  | 'info'
  | 'success'
  | (string & {});

/** Represents an action button for a notification */
export type NotificationAction = {
  /** Text label for the action button */
  label: string;
  /** Handler function called when action button is clicked */
  handler: () => void;
  /** Optional metadata for styling or other custom properties */
  metadata?: Record<string, unknown>;
};

export type NotificationOrigin = { emitter: string; context?: Record<string, unknown> };

/**
 * Every notification type emitted by `stream-chat` itself.
 *
 * Format is `domain:entity:operation:result`:
 *   - `domain` — where it happened: `api`, `validation`, `permission`, `network`, `auth`, `system`
 *   - `entity` — what was operated on: `attachment`, `poll`, `message`, `command`, `location`
 *   - `operation` — what was attempted, lowerCamelCase: `upload`, `create`, `castVote`, `jumpToLatest`
 *   - `result` — what happened: `failed`, `blocked`, `invalid`, `missing`, `limit`, `success`,
 *     or a short hyphenated state such as `in-progress` / `not-ready`
 *
 * **These values are public API.** UI SDKs key their translation tables on them, so renaming one is
 * a breaking change. Emit them through this map rather than writing the literal inline, so the whole
 * set stays greppable from one place and a typo is a compile error.
 *
 * Consumers translating notifications should switch on {@link Notification.type} rather than matching
 * on {@link Notification.message}, which is untranslated English intended as a developer-facing
 * fallback.
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
  /** Jumping to a specific message failed. */
  messageJumpFailed: 'api:message:jump:failed',
  /** Jumping to the latest message failed. */
  messageJumpToLatestFailed: 'api:message:jumpToLatest:failed',
  pollCastVoteLimit: 'validation:poll:castVote:limit',
  pollCreateFailed: 'api:poll:create:failed',
} as const;

/** A notification type emitted by `stream-chat` itself. See {@link CORE_NOTIFICATION_TYPE}. */
export type CoreNotificationType =
  (typeof CORE_NOTIFICATION_TYPE)[keyof typeof CORE_NOTIFICATION_TYPE];

/** Represents a single notification message */
export type Notification = {
  /** Unique identifier for the notification */
  id: string;
  /**
   * Untranslated English text describing what happened.
   *
   * This is a **developer-facing fallback, not display copy.** It is not localized and its exact
   * wording is not part of the public contract — it can be reworded in a minor release. Anything
   * user-facing should resolve {@link Notification.type} to its own copy and fall back to this string
   * only for an identifier it does not recognize.
   */
  message: string;
  /** Timestamp when notification was created */
  createdAt: number;
  /**
   * Identifier of the notification emitter.
   * The identifier then can be recognized by notification consumers to act upon specific origin values.
   */
  origin: NotificationOrigin;
  /** Array of action buttons for the notification */
  actions?: NotificationAction[];
  /** The severity level of the notification (defaults to `undefined` unless explicitly provided). */
  severity?: NotificationSeverity;
  /**
   * Stable identifier for what this notification is about, used to group notifications of the same
   * kind and — for UI SDKs — to resolve a translation without matching on the English `message`.
   *
   * Values emitted by `stream-chat` are enumerated in {@link CORE_NOTIFICATION_TYPE}; those are the
   * ones that autocomplete. The type stays open so SDKs and integrators can emit their own
   * identifiers following the same `domain:entity:operation:result` convention.
   */
  type?: CoreNotificationType | (string & {});
  /** Optional auto-dismiss duration in milliseconds. The timeout starts when NotificationManager.startTimeout() is called. */
  duration?: number;
  /** Optional metadata to attach to the notification */
  metadata?: Record<string, unknown>;
  /** Optional tags that can be used for routing or grouping notifications (e.g. `target:channel`). */
  tags?: string[];
  /** In case of error notification the instance of the originally thrown error */
  originalError?: Error;
};

/** Configuration options when creating a notification */
export type NotificationOptions = Partial<
  Pick<
    Notification,
    'type' | 'severity' | 'actions' | 'metadata' | 'tags' | 'originalError'
  >
> & {
  /**
   * How long a notification should be displayed in milliseconds.
   * Use `0` for persistent (no auto-dismiss); call `client.notifications.remove(id)` to dismiss.
   */
  duration?: number;
};

/**
 * State shape for the notification store.
 *
 * @deprecated Use {@link NotificationManagerState} instead.
 */
export type NotificationState = {
  /** Array of current notification objects. */
  notifications: Notification[];
};

/** State shape for the notification store */
export type NotificationManagerState = NotificationState;

export type NotificationSortComparator = (a: Notification, b: Notification) => number;

export type NotificationManagerConfig = {
  durations: Partial<Record<NotificationSeverity, number>>;
  sortComparator?: NotificationSortComparator;
};

export type AddNotificationPayload = Pick<Notification, 'message' | 'origin'> & {
  options?: NotificationOptions;
};
