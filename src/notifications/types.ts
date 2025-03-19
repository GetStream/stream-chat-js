/** Represents the severity level of a notification */
export type NotificationSeverity =
  | 'error'
  | 'warning'
  | 'info'
  | 'success'
  | (string & {});

/** Represents an action button for a notification */
export interface NotificationAction {
  /** Text label for the action button */
  label: string;
  /** Handler function called when action button is clicked */
  handler: () => void;
  /** Optional metadata for styling or other custom properties */
  metadata?: Record<string, unknown>;
}

/** Represents a single notification message */
export interface Notification {
  /** Unique identifier for the notification */
  id: string;
  /** The notification message text */
  message: string;
  /** The severity level of the notification */
  severity: NotificationSeverity;
  /** Timestamp when notification was created */
  createdAt: number;
  /** Optional timestamp when notification should expire */
  expiresAt?: number;
  /** Whether notification should automatically close after duration. Defaults to true */
  autoClose?: boolean;
  /** Array of action buttons for the notification */
  actions?: NotificationAction[];
  /** Optional metadata to attach to the notification */
  metadata?: Record<string, unknown>;
}

/** Configuration options when creating a notification */
export interface NotificationOptions {
  /** The severity level. Defaults to 'info' */
  severity?: NotificationSeverity;
  /** How long notification should display in milliseconds */
  duration?: number;
  /** Whether notification should auto-close after duration. Defaults to true */
  autoClose?: boolean;
  /** Array of action buttons for the notification */
  actions?: NotificationAction[];
  /** Optional metadata to attach to the notification */
  metadata?: Record<string, unknown>;
}

/** State shape for the notification store */
export type NotificationState = {
  /** Array of current notification objects */
  notifications: Notification[];
};

export type NotificationManagerConfig = {
  durations: Record<NotificationSeverity, number>;
};
