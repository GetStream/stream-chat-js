import { StateStore } from '@stream-io/state-store';
import { isEqual } from '../utils/mergeWith/mergeWithCore';
import { generateUUIDv4 } from '../utils';
import type {
  AddNotificationPayload,
  Notification,
  NotificationManagerConfig,
  NotificationState,
} from './types';
import { mergeWith } from '../utils/mergeWith';
import { ConfigController } from '../configuration/ConfigController';
import type { DeepPartial } from '../types.utility';
import { DEFAULT_NOTIFICATION_MANAGER_CONFIG } from './configuration';

export class NotificationManager {
  store: StateStore<NotificationState>;
  private timeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private readonly configController: ConfigController<NotificationManagerConfig>;
  get configState(): StateStore<NotificationManagerConfig> {
    return this.configController.state;
  }

  constructor(config: Partial<NotificationManagerConfig> = {}) {
    this.store = new StateStore<NotificationState>({ notifications: [] });
    this.configController = new ConfigController<NotificationManagerConfig>({
      defaults: DEFAULT_NOTIFICATION_MANAGER_CONFIG,
      constructorOptions: config,
      // `durations` is nested: naming one severity keeps the others.
      mergeSlice: 'deep',
    });
  }

  get config(): Readonly<NotificationManagerConfig> {
    return this.configState.getLatestValue();
  }

  /**
   * Merges a partial configuration into the resolved config.
   *
   * @param config - Fields to merge into the resolved config.
   */
  updateConfig(config: Partial<NotificationManagerConfig>) {
    // Compares the merged result, so a patch naming one severity is not a change to the others.
    this.configState.next((current) => {
      const next = mergeWith({ ...current }, config as object);
      return isEqual(current, next) ? current : next;
    });
  }

  /**
   * Rebuilds the config from the defaults, `config` and the constructor options instead of merging
   * into the current value, so a `sortComparator` set through `updateConfig` is dropped.
   *
   * @param config - The declarative slice. Defaults to `{}`.
   */
  initializeConfig(config: DeepPartial<NotificationManagerConfig> = {}) {
    this.configController.initialize(config as Partial<NotificationManagerConfig>);
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

  /** Like {@link startTimeout}, but a no-op when a countdown is already running. */
  ensureTimeout(id: string, durationOverride?: number): void {
    if (this.timeouts.has(id)) return;

    this.startTimeout(id, durationOverride);
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
