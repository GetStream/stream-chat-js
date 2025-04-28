import { StateStore } from '../store';
import { generateUUIDv4 } from '../utils';
import type {
  AddNotificationPayload,
  Notification,
  NotificationManagerConfig,
  NotificationState,
} from './types';

const DURATIONS: NotificationManagerConfig['durations'] = {
  error: 10000,
  warning: 5000,
  info: 3000,
  success: 3000,
} as const;

export class NotificationManager {
  store: StateStore<NotificationState>;
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  config: NotificationManagerConfig;

  constructor(config: Partial<NotificationManagerConfig> = {}) {
    this.store = new StateStore<NotificationState>({ notifications: [] });
    this.config = {
      ...config,
      durations: config.durations || DURATIONS,
    };
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

    const notification: Notification = {
      id,
      message,
      origin,
      severity: options.severity || 'info',
      createdAt: now,
      expiresAt: options.duration ? now + options.duration : undefined,
      autoClose: options.autoClose ?? true,
      actions: options.actions,
      metadata: options.metadata,
    };

    this.store.partialNext({
      notifications: [...this.store.getLatestValue().notifications, notification],
    });

    if (notification.autoClose && notification.expiresAt) {
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
