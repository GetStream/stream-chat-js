import type { Reminder } from './Reminder';
import { timeLeftMs } from './Reminder';
import { mergeWith } from '../utils/mergeWith';

type MessageId = string;

export type ReminderTimer = {
  timeout: ReturnType<typeof setTimeout> | null;
  reminder: Reminder;
};

export type ReminderTimerManagerConfig = {
  stopRefreshBoundaryMs: number;
};

export type ReminderTimerManagerOptions = {
  config?: Partial<ReminderTimerManagerConfig>;
};

const oneMinute = 60 * 1000;
const oneHour = 60 * oneMinute;
const oneDay = 24 * oneHour;
const oneWeek = 7 * oneDay;

const GROUP_BOUNDS = {
  minute: { lower: oneMinute, upper: oneHour },
  hour: { lower: oneHour, upper: oneDay },
  day: { lower: oneDay, upper: oneWeek },
} as const;

export const DEFAULT_REMINDER_TIMER_MANAGER_CONFIG: ReminderTimerManagerConfig = {
  stopRefreshBoundaryMs: 2 * oneWeek,
};

export class ReminderTimerManager {
  private timers: Map<MessageId, ReminderTimer> = new Map();
  private config: ReminderTimerManagerConfig;

  constructor({ config }: ReminderTimerManagerOptions = {}) {
    this.config = mergeWith(DEFAULT_REMINDER_TIMER_MANAGER_CONFIG, config ?? {});
  }

  static getRefreshIntervalLength = (reminder: Reminder) => {
    if (!reminder.remindAt) return null;
    const distanceFromDeadlineMs = Math.abs(timeLeftMs(reminder.remindAt.getTime()));
    let refreshInterval: number | null = null;
    if (distanceFromDeadlineMs === 0) {
      refreshInterval = oneMinute;
    } else if (distanceFromDeadlineMs < GROUP_BOUNDS.minute.lower) {
      refreshInterval = distanceFromDeadlineMs;
    } else if (distanceFromDeadlineMs <= GROUP_BOUNDS.minute.upper) {
      refreshInterval = oneMinute;
    } else if (distanceFromDeadlineMs <= GROUP_BOUNDS.hour.upper) {
      refreshInterval = oneHour;
    } else {
      refreshInterval = oneDay;
    }
    return refreshInterval;
  };

  add = (reminder: Reminder) => {
    const existingTimer = this.timers.get(reminder.id);
    const timeoutLength = ReminderTimerManager.getRefreshIntervalLength(reminder);
    if (timeoutLength === null || !reminder.remindAt) return;
    const boundaryTimestamp =
      reminder.remindAt?.getTime() + this.config.stopRefreshBoundaryMs;
    const timeLeftToBoundary = boundaryTimestamp - Date.now();
    if (timeLeftToBoundary < 0) {
      this.timers.set(reminder.id, {
        timeout: null,
        reminder,
      });
      return;
    }

    const timeout = setTimeout(() => {
      const timer = this.timers.get(reminder.id);
      if (!timer) return;
      timer.reminder.refreshTimeLeft();
      this.add(reminder);
    }, timeoutLength);

    if (!existingTimer) {
      this.timers.set(reminder.id, {
        timeout,
        reminder,
      });
    } else {
      if (existingTimer.timeout) clearTimeout(existingTimer.timeout);
      existingTimer.timeout = timeout;
    }
  };

  addAll = (reminders: Reminder[]) => {
    reminders.forEach(this.add);
  };

  remove = (messageId: string) => {
    const timer = this.timers.get(messageId);
    if (timer) {
      this.clearTimer(timer);
      this.timers.delete(messageId);
    }
  };

  removeAll = () => {
    this.clearAll();
    this.timers.clear();
  };

  clearTimer = (timer: ReminderTimer) => {
    if (timer?.timeout) {
      clearInterval(timer.timeout);
      timer.timeout = null;
    }
  };

  clearAll = () => {
    Array.from(this.timers.values()).forEach(this.clearTimer);
  };
}
