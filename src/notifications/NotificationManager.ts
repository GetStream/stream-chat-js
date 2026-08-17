import { StateStore } from '../store';
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
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<NotificationManagerConfig>;
  /**
   * Resolved configuration, as a store so consumers can react to it — the same shape every configurable
   * class exposes (`configState` for the store, {@link config} for the current value).
   */
  get configState(): StateStore<NotificationManagerConfig> {
    return this.configController.state;
  }

  constructor(config: Partial<NotificationManagerConfig> = {}) {
    this.store = new StateStore<NotificationState>({ notifications: [] });
    this.configController = new ConfigController<NotificationManagerConfig>({
      defaults: DEFAULT_NOTIFICATION_MANAGER_CONFIG,
      constructorOptions: config,
      // `durations` is a nested group, so naming one severity must keep the other three.
      mergeSlice: 'deep',
    });
  }

  /**
   * The current resolved configuration. `Readonly` because the value is the store's live object —
   * assigning to a field of it would change state without notifying anyone. Use {@link updateConfig}.
   */
  get config(): Readonly<NotificationManagerConfig> {
    return this.configState.getLatestValue();
  }

  /** Deep-merges a partial configuration into the resolved config and notifies subscribers. */
  updateConfig(config: Partial<NotificationManagerConfig>) {
    // Deep-merged rather than patched, so the guard compares the merged *result*: `durations` is
    // nested, and a patch naming one severity must not read as a change to the other three.
    this.configState.next((current) => {
      const next = mergeWith({ ...current }, config as object);
      return isEqual(current, next) ? current : next;
    });
  }

  /**
   * Rebuilds the resolved configuration from package defaults plus the declarative slice, **replacing**
   * what is there rather than merging into it. Called by the client's derivation, which shares one path
   * with `client.config.reset()`.
   *
   * The distinction is not cosmetic here, and this manager is the only one that needs it.
   * {@link updateConfig} deep-merges, and `sortComparator` is optional — so unlike every other field of
   * every other manager config, it has no counterpart in {@link DEFAULT_NOTIFICATION_MANAGER_CONFIG} for
   * a derivation to overwrite it with. Registering one through `client.config` therefore made it
   * permanent: `reset()` re-derived, the merge kept it, and nothing could ever remove it. A merge cannot
   * express a removal; this is the same rule `Channel.initializeConfig` follows for `requestHandlers`.
   *
   * The defaults are copied rather than spread, because a shallow spread would leave `durations`
   * pointing at the module-level object and put it in the store, where a nested write would change the
   * default for every client in the process.
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
