import { StateStore } from '../store';
import type {
  Notification,
  NotificationManagerConfig,
  NotificationOptions,
  NotificationSeverity,
  NotificationState,
} from './types';
import { v4 as uuidv4 } from 'uuid';

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

  private add(
    message: string,
    origin: string,
    options: NotificationOptions = {},
  ): string {
    const id = uuidv4();
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

  error(message: string, origin: string, options = {}) {
    return this.add(message, origin, { severity: 'error', ...options });
  }

  warning(message: string, origin: string, options = {}) {
    return this.add(message, origin, { severity: 'warning', ...options });
  }

  info(message: string, origin: string, options = {}) {
    return this.add(message, origin, { severity: 'info', ...options });
  }

  success(message: string, origin: string, options = {}) {
    return this.add(message, origin, { severity: 'success', ...options });
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

  getBySeverity(severity: NotificationSeverity): Notification[] {
    return this.store
      .getLatestValue()
      .notifications.filter((n) => n.severity === severity);
  }

  subscribe(callback: (state: NotificationState) => void) {
    return this.store.subscribe(callback);
  }

  getState(): NotificationState {
    return this.store.getLatestValue();
  }
}
