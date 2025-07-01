import { StateStore } from '../store';
import { generateUUIDv4 } from '../utils';
import type {
  AddNotificationPayload,
  Notification,
  NotificationManagerConfig,
  NotificationState,
} from './types';
import { mergeWith } from '../utils/mergeWith';
import { DEFAULT_NOTIFICATION_MANAGER_CONFIG } from './configuration';

export class NotificationManager {
  store: StateStore<NotificationState>;
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  config: NotificationManagerConfig;

  constructor(config: Partial<NotificationManagerConfig> = {}) {
    this.store = new StateStore<NotificationState>({ notifications: [] });
    this.config = mergeWith(DEFAULT_NOTIFICATION_MANAGER_CONFIG, config);
  }

  get notifications() {
    return this.store.getLatestValue().notifications;
  }

  get warning() {
    return this.notifications.filter((n) => n.severity === 'warning');
  }

  get error() {
    return this.notifications.filter((n) => n.severity === 'error');
  }

  get info() {
    return this.notifications.filter((n) => n.severity === 'info');
  }

  get success() {
    return this.notifications.filter((n) => n.severity === 'success');
  }

  add({ message, origin, options = {} }: AddNotificationPayload): string {
    const id = generateUUIDv4();
    const now = Date.now();
    const severity = options.severity || 'info';
    const duration = options.duration ?? this.config.durations[severity];

    const notification: Notification = {
      id,
      message,
      origin,
      type: options?.type,
      severity,
      createdAt: now,
      expiresAt: now + duration,
      actions: options.actions,
      metadata: options.metadata,
      originalError: options.originalError,
    };

    this.store.partialNext({
      notifications: [...this.store.getLatestValue().notifications, notification],
    });

    if (notification.expiresAt) {
      const timeout = setTimeout(() => {
        this.remove(id);
      }, options.duration || this.config.durations[notification.severity]);

      this.timeouts.set(id, timeout);
    }

    return id;
  }

  addError({ message, origin, options }: AddNotificationPayload) {
    return this.add({ message, origin, options: { ...options, severity: 'error' } });
  }

  addWarning({ message, origin, options }: AddNotificationPayload) {
    return this.add({ message, origin, options: { ...options, severity: 'warning' } });
  }

  addInfo({ message, origin, options }: AddNotificationPayload) {
    return this.add({ message, origin, options: { ...options, severity: 'info' } });
  }

  addSuccess({ message, origin, options }: AddNotificationPayload) {
    return this.add({ message, origin, options: { ...options, severity: 'success' } });
  }

  remove(id: string): void {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }

    this.store.partialNext({
      notifications: this.store.getLatestValue().notifications.filter((n) => n.id !== id),
    });
  }

  clear(): void {
    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.timeouts.clear();

    this.store.partialNext({ notifications: [] });
  }
}
