import { DEFAULT_STOP_REFRESH_BOUNDARY_MS, Reminder, ReminderTimer } from '../../../src';
import { describe, expect, it, vi } from 'vitest';
import { generateReminderResponse } from './ReminderManager.test';

const oneSecond = 1000;
const oneMinute = 60 * oneSecond;
const oneHour = 60 * oneMinute;
const oneDay = 24 * oneHour;
const oneWeek = 7 * oneDay;

describe('ReminderTimer', () => {
  it('initiates with default state', () => {
    const reminder = new Reminder({
      data: generateReminderResponse({ scheduleOffsetMs: oneMinute }),
    });
    const timer = new ReminderTimer({ reminder });
    expect(timer.reminder).toBeInstanceOf(Reminder);
    expect(timer.stopRefreshBoundaryMs).toBe(DEFAULT_STOP_REFRESH_BOUNDARY_MS);
    expect(timer.timeout).toBeNull();
  });

  it('initiates with custom config', () => {
    const reminder = new Reminder({
      data: generateReminderResponse({ scheduleOffsetMs: oneMinute }),
    });
    const timer = new ReminderTimer({
      reminder,
      config: { stopRefreshBoundaryMs: oneHour },
    });
    expect(timer.reminder).toBeInstanceOf(Reminder);
    expect(timer.stopRefreshBoundaryMs).toBe(oneHour);
    expect(timer.timeout).toBeNull();
  });

  it('sets up timeout', () => {
    const reminder = new Reminder({
      data: generateReminderResponse({ scheduleOffsetMs: oneMinute }),
    });
    const timer = new ReminderTimer({ reminder });
    timer.init();
    expect(timer.timeout).toEqual(expect.any(Object));
  });

  it('does not initiate timeout if reminder is not timed', () => {
    const reminder = new Reminder({ data: generateReminderResponse() });
    const timer = new ReminderTimer({ reminder });
    timer.init();
    expect(timer.timeout).toBeNull();
  });

  it('clears the timeout', () => {
    const reminder = new Reminder({
      data: generateReminderResponse({ scheduleOffsetMs: oneMinute }),
    });
    const timer = new ReminderTimer({ reminder });
    timer.init();
    timer.clear();
    expect(timer.timeout).toBeNull();
  });

  it('refreshes reminder time left on every scheduled interval', async () => {
    vi.useFakeTimers();
    const reminder = new Reminder({
      data: generateReminderResponse({
        scheduleOffsetMs: oneMinute + 30 * oneSecond,
      }),
    });
    const timer = new ReminderTimer({ reminder });
    const refreshTimeLeftSpy = vi
      .spyOn(reminder, 'refreshTimeLeft')
      .mockImplementationOnce(() => null);
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
        scheduleOffsetMs: oneWeek,
      }),
    });
    const timer = new ReminderTimer({ reminder });
    const refreshTimeLeftSpy = vi
      .spyOn(reminder, 'refreshTimeLeft')
      .mockImplementationOnce(() => null);
    expect(refreshTimeLeftSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(timer.stopRefreshBoundaryMs + oneWeek + oneMinute);
    expect(refreshTimeLeftSpy).toHaveBeenCalledTimes(6 + 23 + 60 + 60 + 1 + 23 + 6 + 7); // 6 days + 23 hours + 60 minutes + 1 minute for 2 weeks, then 7 days
    expect(timer.timeout).toBeNull();
    vi.useRealTimers();
  });
});
