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

/** Represents a single notification message */
export type Notification = {
  /** Unique identifier for the notification */
  id: string;
  /** The notification message text */
  message: string;
  /** The severity level of the notification */
  severity: NotificationSeverity;
  /** Timestamp when notification was created */
  createdAt: number;
  /**
   * Identifier of the notification emitter.
   * The identifier then can be recognized by notification consumers to act upon specific origin values.
   */
  origin: NotificationOrigin;
  /** Optional code that can be used to group the notifications of the same type, e.g. attachment-upload-blocked. */
  code?: string;
  /** Optional timestamp when notification should expire */
  expiresAt?: number;
  /** Array of action buttons for the notification */
  actions?: NotificationAction[];
  /** Optional metadata to attach to the notification */
  metadata?: Record<string, unknown>;
};

/** Configuration options when creating a notification */
export type NotificationOptions = Partial<
  Pick<Notification, 'code' | 'severity' | 'actions' | 'metadata'>
> & {
  /** How long a notification should be displayed in milliseconds */
  duration?: number;
};

/**
 * State shape for the notification store
 * @deprcated use NotificationManagerState
 */
export type NotificationState = {
  /** Array of current notification objects */
  notifications: Notification[];
};

/** State shape for the notification store */
export type NotificationManagerState = NotificationState;

export type NotificationManagerConfig = {
  durations: Record<NotificationSeverity, number>;
};

export type AddNotificationPayload = Pick<Notification, 'message' | 'origin'> & {
  options?: NotificationOptions;
};
