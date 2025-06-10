import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STOP_REFRESH_BOUNDARY_MS, Reminder, ReminderTimer } from '../../../src';
import { sleep } from '../../../src/utils';
import { generateReminderResponse } from './ReminderManager.test';

describe('Reminder', () => {
  it('constructor sets up state for bookmark reminder', () => {
    const data = generateReminderResponse();
    const reminder = new Reminder({ data });
    expect(reminder.state.getLatestValue()).toEqual({
      ...data,
      created_at: new Date(data.created_at),
      remind_at: null,
      updated_at: new Date(data.updated_at),
      timeLeftMs: null,
    });
    expect(reminder.timer).toBeInstanceOf(ReminderTimer);
    expect(reminder.timer.timeout).toBeNull;
  });

  it('constructor sets up state for timed reminder', () => {
    const scheduleOffsetMs = 62 * 1000;
    const data = generateReminderResponse({ scheduleOffsetMs });
    const reminder = new Reminder({ data });
    const now = new Date();
    const remindAtDate = new Date(data.remind_at!);
    const reminderState = reminder!.state.getLatestValue();
    expect({
      ...reminderState,
      timeLeftMs: Math.round(reminderState.timeLeftMs! / 1000) * 1000,
    }).toEqual({
      ...data,
      created_at: new Date(data.created_at),
      remind_at: remindAtDate,
      updated_at: new Date(data.updated_at),
      timeLeftMs: scheduleOffsetMs,
    });
    expect(Math.floor((reminderState!.timeLeftMs as number) / 1000)).toBe(
      Math.floor((remindAtDate.getTime() - now.getTime()) / 1000),
    );
    expect(reminder.timer).toBeInstanceOf(ReminderTimer);
    expect(reminder.timer.timeout).toEqual(expect.any(Object));
  });

  it('calculates time left in ms and re-initiates timer on state update', () => {
    const scheduleOffsetMs = 62 * 1000;
    const data = generateReminderResponse({ scheduleOffsetMs });
    const reminder = new Reminder({ data });
    const timerInitSpy = vi.spyOn(reminder.timer, 'init');
    reminder.setState({ ...data, remind_at: new Date().toISOString() });
    expect(reminder.timeLeftMs).toBe(0);
    expect(timerInitSpy).toHaveBeenCalledTimes(1);
  });

  it('stops timer on remind_at state update if re-initiates timer on state update and is behind the boundary', () => {
    vi.useFakeTimers();
    const scheduleOffsetMs = 62 * 1000;
    const data = generateReminderResponse({ scheduleOffsetMs });
    const orignalRemindAt = data.remind_at;
    const reminder = new Reminder({ data });
    vi.advanceTimersByTime(scheduleOffsetMs + DEFAULT_STOP_REFRESH_BOUNDARY_MS);
    reminder.setState({
      ...data,
      remind_at: new Date(
        new Date(orignalRemindAt as string).getTime() - 1000,
      ).toISOString(),
    });
    expect(reminder.timer.timeout).toBeNull();
    expect(reminder.timeLeftMs).toBe(-1 * (DEFAULT_STOP_REFRESH_BOUNDARY_MS + 1000));
    vi.useRealTimers();
  });

  it('clears timer on state update if remind_at is undefined', () => {
    const scheduleOffsetMs = 62 * 1000;
    const data = generateReminderResponse({ scheduleOffsetMs });
    const reminder = new Reminder({ data });
    expect(reminder.timer.timeout).toEqual(expect.any(Object));
    const timerInitSpy = vi.spyOn(reminder.timer, 'init');
    reminder.setState({ ...data, remind_at: undefined });
    expect(reminder.timeLeftMs).toBe(null);
    expect(timerInitSpy).not.toHaveBeenCalled();
    expect(reminder.timer.timeout).toBeNull();
  });

  it('refreshes time left if remind_at is set', async () => {
    const scheduleOffsetMs = 62 * 1000;
    const data = generateReminderResponse({ scheduleOffsetMs });
    const reminder = new Reminder({ data });
    expect(Math.round(reminder.timeLeftMs! / 1000) * 1000).toBe(scheduleOffsetMs);
    await sleep(600);
    reminder.refreshTimeLeft();
    expect(Math.round(reminder.timeLeftMs! / 1000) * 1000).toBe(scheduleOffsetMs - 1000);
  });
});
