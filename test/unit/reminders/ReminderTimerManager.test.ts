import {
  DEFAULT_REMINDER_TIMER_MANAGER_CONFIG,
  Reminder,
  ReminderTimerManager,
  ReminderTimerManagerConfig,
} from '../../../src';
import { describe, expect, it, vi } from 'vitest';
import { generateReminderResponse } from './ReminderManager.test';

const oneSecond = 1000;
const oneMinute = 60 * oneSecond;
const oneHour = 60 * oneMinute;
const oneDay = 24 * oneHour;
const oneWeek = 7 * oneDay;
const scheduleOffsets = [oneMinute, oneHour, oneDay, oneWeek];
const groupNamesByOffset = {
  [oneMinute]: 'minute',
  [oneHour]: 'hour',
  [oneDay]: 'day',
  [oneWeek]: 'week',
} as const;

describe('ReminderTimerManager', () => {
  it('initiates with default state', () => {
    const timerManager = new ReminderTimerManager();
    // @ts-expect-error accessing private property
    expect(timerManager.timers).toEqual(new Map());
    expect(timerManager.config).toEqual(DEFAULT_REMINDER_TIMER_MANAGER_CONFIG);
  });
  it('initiates with custom config', () => {
    const config: ReminderTimerManagerConfig = {
      stopRefreshBoundaryMs: 10,
    };
    const timerManager = new ReminderTimerManager({ config });
    // @ts-expect-error accessing private property
    expect(timerManager.timers).toEqual(new Map());
    expect(timerManager.config).toEqual(config);
  });
  it('adds a reminder timer', () => {
    const reminder = new Reminder({
      data: generateReminderResponse({
        scheduleOffsetMs: 30 * oneSecond,
      }),
    });
    const timerManager = new ReminderTimerManager();
    timerManager.add(reminder);
    // @ts-expect-error accessing private property
    expect(timerManager.timers.size).toBe(1);
    // @ts-expect-error accessing private property
    expect(timerManager.timers.get(reminder.id)).toEqual({
      timeout: expect.any(Object),
      reminder,
    });
  });

  it('does not add a reminder timer for bookmark reminder', () => {
    const reminder = new Reminder({
      data: generateReminderResponse({
        data: { message_id: '1' },
      }),
    });
    const timerManager = new ReminderTimerManager();
    timerManager.add(reminder);
    // @ts-expect-error accessing private property
    expect(timerManager.timers.size).toBe(0);
  });

  it('refreshes reminder time left on every scheduled interval', async () => {
    vi.useFakeTimers();
    const reminder = new Reminder({
      data: generateReminderResponse({
        scheduleOffsetMs: oneMinute + 30 * oneSecond,
      }),
    });
    const timerManager = new ReminderTimerManager();
    const refreshTimeLeftSpy = vi
      .spyOn(reminder, 'refreshTimeLeft')
      .mockImplementationOnce(() => null);
    timerManager.add(reminder);
    expect(refreshTimeLeftSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(oneMinute);
    expect(refreshTimeLeftSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * oneSecond);
    expect(refreshTimeLeftSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * oneSecond);
    expect(refreshTimeLeftSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * oneSecond);
    expect(refreshTimeLeftSpy).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('does not schedule refresh if behind the reminder refresh boundary', async () => {
    vi.useFakeTimers();
    const reminder = new Reminder({
      data: generateReminderResponse({
        data: {},
        scheduleOffsetMs: oneWeek, //todo
      }),
    });
    const timerManager = new ReminderTimerManager();
    const refreshTimeLeftSpy = vi
      .spyOn(reminder, 'refreshTimeLeft')
      .mockImplementationOnce(() => null);
    timerManager.add(reminder);
    expect(refreshTimeLeftSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(
      timerManager.config.stopRefreshBoundaryMs + oneWeek + oneMinute,
    );
    expect(refreshTimeLeftSpy).toHaveBeenCalledTimes(6 + 23 + 60 + 60 + 1 + 23 + 6 + 7); // 6 days + 23 hours + 60 minutes + 1 minute for 2 weeks, then 7 days
    // @ts-expect-error accessing private property
    expect(timerManager.timers.get(reminder.id)!.timeout).toBeNull();
    vi.useRealTimers();
  });

  it('adds multiple reminders', () => {
    const reminders = [
      new Reminder({
        data: generateReminderResponse({
          data: { message_id: '1' },
          scheduleOffsetMs: 30 * oneSecond,
        }),
      }),
      new Reminder({
        data: generateReminderResponse({
          data: { message_id: '2' },
          scheduleOffsetMs: 30 * oneMinute,
        }),
      }),
    ];
    const timerManager = new ReminderTimerManager();
    timerManager.addAll(reminders);
    // @ts-expect-error accessing private property
    expect(timerManager.timers.size).toBe(reminders.length);
    // @ts-expect-error accessing private property
    expect(timerManager.timers.get(reminders[0].id)).toEqual({
      timeout: expect.any(Object),
      reminder: reminders[0],
    });
    // @ts-expect-error accessing private property
    expect(timerManager.timers.get(reminders[1].id)).toEqual({
      timeout: expect.any(Object),
      reminder: reminders[1],
    });
  });
  it('removes a reminder', () => {
    const reminder = new Reminder({
      data: generateReminderResponse({
        scheduleOffsetMs: 30 * oneSecond,
      }),
    });
    const timerManager = new ReminderTimerManager();
    timerManager.add(reminder);
    timerManager.remove(reminder.id);
    // @ts-expect-error accessing private property
    expect(timerManager.timers.size).toBe(0);
  });
  it('removes multiple reminders', () => {
    const reminders = [
      new Reminder({
        data: generateReminderResponse({
          data: { message_id: '1' },
          scheduleOffsetMs: 30 * oneSecond,
        }),
      }),
      new Reminder({
        data: generateReminderResponse({
          data: { message_id: '2' },
          scheduleOffsetMs: 30 * oneMinute,
        }),
      }),
    ];
    const timerManager = new ReminderTimerManager();
    timerManager.addAll(reminders);
    timerManager.removeAll();

    // @ts-expect-error accessing private property
    expect(timerManager.timers.size).toBe(0);
  });
  it('clears a timer interval', () => {
    const reminder = new Reminder({
      data: generateReminderResponse({
        scheduleOffsetMs: 30 * oneSecond,
      }),
    });
    const timerManager = new ReminderTimerManager();
    timerManager.add(reminder);
    // @ts-expect-error accessing private property
    const timer = timerManager.timers.get(reminder.id);
    timerManager.clearTimer(timer!);
    // @ts-expect-error accessing private property
    expect(timerManager.timers.get(reminder.id).timeout).toBeNull();
  });
  it('clears all timers intervals', () => {
    const reminders = [
      new Reminder({
        data: generateReminderResponse({
          data: { message_id: '1' },
          scheduleOffsetMs: 30 * oneSecond,
        }),
      }),
      new Reminder({
        data: generateReminderResponse({
          data: { message_id: '2' },
          scheduleOffsetMs: 30 * oneMinute,
        }),
      }),
    ];
    const timerManager = new ReminderTimerManager();
    timerManager.addAll(reminders);
    timerManager.clearAll();

    // @ts-expect-error accessing private property
    expect(timerManager.timers.get(reminders[0].id).timeout).toBeNull();
    // @ts-expect-error accessing private property
    expect(timerManager.timers.get(reminders[1].id).timeout).toBeNull();
  });
});
