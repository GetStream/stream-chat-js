import { timeLeftMs } from './Reminder';
import type { Reminder } from './Reminder';

const oneMinute = 60 * 1000;
const oneHour = 60 * oneMinute;
const oneDay = 24 * oneHour;
const oneWeek = 7 * oneDay;

const GROUP_BOUNDS = {
  minute: { lower: oneMinute, upper: oneHour },
  hour: { lower: oneHour, upper: oneDay },
  day: { lower: oneDay, upper: oneWeek },
} as const;

export const DEFAULT_STOP_REFRESH_BOUNDARY_MS = 2 * oneWeek;

export type ReminderTimerConfig = {
  stopRefreshBoundaryMs?: number;
};

export class ReminderTimer {
  reminder: Reminder;
  timeout: ReturnType<typeof setTimeout> | null = null;
  stopRefreshBoundaryMs: number = DEFAULT_STOP_REFRESH_BOUNDARY_MS;

  constructor({
    reminder,
    config,
  }: {
    reminder: Reminder;
    config?: ReminderTimerConfig;
  }) {
    this.reminder = reminder;

    if (typeof config?.stopRefreshBoundaryMs === 'number') {
      this.stopRefreshBoundaryMs = config.stopRefreshBoundaryMs;
    }
  }

  getRefreshIntervalLength = () => {
    if (!this.reminder.remindAt) return null;
    const distanceFromDeadlineMs = Math.abs(timeLeftMs(this.reminder.remindAt.getTime()));
    let refreshInterval: number | null;
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

  init = () => {
    if (!this.reminder.remindAt) return null;
    const timeoutLength = this.getRefreshIntervalLength();
    if (timeoutLength === null) return null;

    const boundaryTimestamp =
      this.reminder.remindAt?.getTime() + this.stopRefreshBoundaryMs;
    const timeLeftToBoundary = boundaryTimestamp - Date.now();

    if (timeLeftToBoundary <= 0) {
      this.timeout = null;
      return;
    }

    if (this.timeout) clearTimeout(this.timeout);

    this.timeout = setTimeout(() => {
      this.reminder.refreshTimeLeft();
      this.init();
    }, timeoutLength);
  };

  clear = () => {
    if (this.timeout) {
      clearInterval(this.timeout);
      this.timeout = null;
    }
  };
}
