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
    const severity = options.severity;
    const duration =
      options.duration ?? (severity ? this.config.durations[severity] : undefined);

    const notification: Notification = {
      id,
      message,
      origin,
      type: options?.type,
      severity,
      createdAt: now,
      duration,
      actions: options.actions,
      metadata: options.metadata,
      tags: options.tags,
      originalError: options.originalError,
    };

    const notifications = [...this.store.getLatestValue().notifications, notification];

    this.store.partialNext({
      notifications: this.config.sortComparator
        ? [...notifications].sort(this.config.sortComparator)
        : notifications,
    });

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

  clearTimeout(id: string): void {
    const timeout = this.timeouts.get(id);

    if (!timeout) return;

    clearTimeout(timeout);
    this.timeouts.delete(id);
  }

  startTimeout(id: string, durationOverride?: number): void {
    const notification = this.store
      .getLatestValue()
      .notifications.find((n) => n.id === id);
    const duration = durationOverride ?? notification?.duration;

    if (!notification || !duration) return;

    this.clearTimeout(id);

    const timeout = setTimeout(() => {
      this.remove(id);
    }, duration);

    this.timeouts.set(id, timeout);
  }

  remove(id: string): void {
    this.clearTimeout(id);

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
