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
  /** Array of action buttons for the notification */
  actions?: NotificationAction[];
  /**
   * Optional code that can be used to group the notifications of the same type, e.g. attachment-upload-blocked.
   * Format: domain:entity:operation:result
   *   domain: where the error occurred (api, validation, permission, etc)
   *   entity: what was being operated on (poll, attachment, message, etc)
   *   operation: what was being attempted (create, upload, validate, etc)
   *   result: what happened (failed, blocked, invalid, etc)
   *
   *   Poll related errors
   *   'api:poll:create:failed'           // API call to create poll failed
   *   'validation:poll:create:invalid'   // Poll creation validation failed
   *
   *   Attachment related errors
   *   'validation:attachment:file:missing'     // Required file is missing
   *   'permission:attachment:upload:blocked'   // Upload blocked due to permissions
   *   'api:attachment:upload:failed'          // API upload call failed
   *   'validation:attachment:type:unsupported' // Unsupported file type
   *   'validation:attachment:size:exceeded'    // File size too large
   *   'validation:attachment:count:exceeded'   // Too many attachments
   *
   *   Message related errors
   *   'api:message:send:failed'          // Message send failed
   *   'validation:message:content:empty' // Message content validation failed
   *
   *   Channel related errors
   *   'api:channel:join:failed'          // Channel join failed
   *   'permission:channel:access:denied' // Channel access denied
   *
   *   Authentication related errors
   *   'auth:token:expired'               // Auth token expired
   *   'auth:token:invalid'               // Invalid auth token
   *
   *   Network related errors
   *   'network:request:timeout'          // Request timed out
   *   'network:request:failed'           // Network request failed
   *
   *    Rate limiting
   *   'rate:limit:exceeded'              // Rate limit exceeded
   *
   *   System errors
   *   'system:internal:error'            // Internal system error
   *   'system:resource:unavailable';     // System resource unavailable
   */
  type?: string;
  /** Optional timestamp when notification should expire */
  expiresAt?: number;
  /** Optional metadata to attach to the notification */
  metadata?: Record<string, unknown>;
  /** In case of error notification the instance of the originally thrown error */
  originalError?: Error;
};

/** Configuration options when creating a notification */
export type NotificationOptions = Partial<
  Pick<Notification, 'type' | 'severity' | 'actions' | 'metadata' | 'originalError'>
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
