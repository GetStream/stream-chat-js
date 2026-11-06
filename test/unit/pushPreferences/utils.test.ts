import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PushScheduleResponse, QuietHoursRuleResponse } from '../../../src';
import { getDeviceTimeZone, isInQuietHours, QuietHoursDay } from '../../../src';
import { mergeOwnPushPreferences } from '../../../src/pushPreferences/utils';

const schedule = (
  quiet_hours: QuietHoursRuleResponse[],
  timezone = 'UTC',
): PushScheduleResponse => ({ quiet_hours, timezone });

const at = (isoDate: string) => new Date(isoDate);

const FRIDAY_23_00 = '2030-01-04T23:00:00Z';
const FRIDAY_06_00 = '2030-01-04T06:00:00Z';
const SATURDAY_06_00 = '2030-01-05T06:00:00Z';
const SATURDAY_23_00 = '2030-01-05T23:00:00Z';
const SUNDAY_23_59 = '2030-01-06T23:59:00Z';
const MONDAY_00_00 = '2030-01-07T00:00:00Z';

describe('isInQuietHours', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is quiet from the start of a window until just before its end', () => {
    const lunch = schedule([{ end: '14:00', start: '13:00' }]);

    expect(isInQuietHours({ date: at('2030-01-04T12:59:00Z'), schedule: lunch })).toBe(
      false,
    );
    expect(isInQuietHours({ date: at('2030-01-04T13:00:00Z'), schedule: lunch })).toBe(
      true,
    );
    expect(isInQuietHours({ date: at('2030-01-04T13:59:00Z'), schedule: lunch })).toBe(
      true,
    );
    expect(isInQuietHours({ date: at('2030-01-04T14:00:00Z'), schedule: lunch })).toBe(
      false,
    );
  });

  it('wraps a window that ends earlier than it starts past midnight', () => {
    const night = schedule([{ end: '07:00', start: '22:00' }]);

    expect(isInQuietHours({ date: at(FRIDAY_23_00), schedule: night })).toBe(true);
    expect(isInQuietHours({ date: at('2030-01-05T06:59:00Z'), schedule: night })).toBe(
      true,
    );
    expect(isInQuietHours({ date: at('2030-01-05T07:00:00Z'), schedule: night })).toBe(
      false,
    );
  });

  it('keeps a wrapped window on the day it opens', () => {
    const fridayNight = schedule([
      { days: [QuietHoursDay.Friday], end: '07:00', start: '22:00' },
    ]);

    expect(isInQuietHours({ date: at(FRIDAY_23_00), schedule: fridayNight })).toBe(true);
    expect(isInQuietHours({ date: at(SATURDAY_06_00), schedule: fridayNight })).toBe(
      true,
    );
    expect(isInQuietHours({ date: at(SATURDAY_23_00), schedule: fridayNight })).toBe(
      false,
    );
    expect(isInQuietHours({ date: at(FRIDAY_06_00), schedule: fridayNight })).toBe(false);
  });

  it('covers the whole day with a window from 00:00 to 24:00', () => {
    const sunday = schedule([
      { days: [QuietHoursDay.Sunday], end: '24:00', start: '00:00' },
    ]);

    expect(isInQuietHours({ date: at(SUNDAY_23_59), schedule: sunday })).toBe(true);
    expect(isInQuietHours({ date: at(MONDAY_00_00), schedule: sunday })).toBe(false);
  });

  it('is quiet while any of the windows is active', () => {
    const workdayBreaks = schedule([
      { end: '09:00', start: '08:00' },
      { end: '14:00', start: '13:00' },
    ]);

    expect(
      isInQuietHours({ date: at('2030-01-04T13:30:00Z'), schedule: workdayBreaks }),
    ).toBe(true);
    expect(
      isInQuietHours({ date: at('2030-01-04T11:00:00Z'), schedule: workdayBreaks }),
    ).toBe(false);
  });

  it('reads the wall clock in the time zone of the schedule', () => {
    const newYorkNight = schedule([{ end: '07:00', start: '22:00' }], 'America/New_York');

    expect(
      isInQuietHours({ date: at('2030-01-15T02:00:00Z'), schedule: newYorkNight }),
    ).toBe(false);
    expect(
      isInQuietHours({ date: at('2030-01-15T03:30:00Z'), schedule: newYorkNight }),
    ).toBe(true);
  });

  it('follows daylight saving time in a region time zone', () => {
    const amsterdamNight = schedule(
      [{ end: '07:00', start: '22:00' }],
      'Europe/Amsterdam',
    );

    expect(
      isInQuietHours({ date: at('2030-07-01T20:30:00Z'), schedule: amsterdamNight }),
    ).toBe(true);
    expect(
      isInQuietHours({ date: at('2030-01-01T20:30:00Z'), schedule: amsterdamNight }),
    ).toBe(false);
  });

  it('checks the current time by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at(FRIDAY_23_00));

    expect(
      isInQuietHours({ schedule: schedule([{ end: '07:00', start: '22:00' }]) }),
    ).toBe(true);
  });
});

describe('getDeviceTimeZone', () => {
  it('returns the IANA time zone of the device', () => {
    expect(getDeviceTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('mergeOwnPushPreferences', () => {
  const userId = 'user1';
  const nightSchedule = schedule([{ end: '07:00', start: '22:00' }], 'Europe/Amsterdam');
  const disabledUntil = '2030-01-01T00:00:00.000Z';

  it('keeps the known preferences when no request item is a user-level one of the user', () => {
    const previous = { chat_level: 'all' };

    const merged = mergeOwnPushPreferences({
      preferences: [
        { channel_cid: 'messaging:general', chat_level: 'none' },
        { chat_level: 'none', user_id: 'user2' },
      ],
      previous,
      updated: { chat_level: 'none' },
      userId,
    });

    expect(merged).toBe(previous);
  });

  it('merges the updated preferences into the known ones', () => {
    const merged = mergeOwnPushPreferences({
      preferences: [{ schedule: nightSchedule }],
      previous: { chat_level: 'all' },
      updated: { schedule: nightSchedule },
      userId,
    });

    expect(merged).toEqual({ chat_level: 'all', schedule: nightSchedule });
  });

  it('drops the schedule after remove_schedule', () => {
    const merged = mergeOwnPushPreferences({
      preferences: [{ remove_schedule: true }],
      previous: { chat_level: 'all', schedule: nightSchedule },
      updated: {},
      userId,
    });

    expect(merged).toEqual({ chat_level: 'all' });
  });

  it('keeps the new schedule when remove_schedule replaces the stored one', () => {
    const newSchedule = schedule([{ end: '09:00', start: '08:00' }], 'Europe/Amsterdam');

    const merged = mergeOwnPushPreferences({
      preferences: [{ remove_schedule: true, schedule: newSchedule }],
      previous: { schedule: nightSchedule },
      updated: { schedule: newSchedule },
      userId,
    });

    expect(merged).toEqual({ schedule: newSchedule });
  });

  it('drops disabled_until after remove_disable', () => {
    const merged = mergeOwnPushPreferences({
      preferences: [{ remove_disable: true, user_id: userId }],
      previous: { disabled_until: disabledUntil, schedule: nightSchedule },
      updated: { schedule: nightSchedule },
      userId,
    });

    expect(merged).toEqual({ schedule: nightSchedule });
  });

  it('switches from a schedule to a snooze', () => {
    const merged = mergeOwnPushPreferences({
      preferences: [{ disabled_until: disabledUntil, remove_schedule: true }],
      previous: { schedule: nightSchedule },
      updated: { disabled_until: disabledUntil },
      userId,
    });

    expect(merged).toEqual({ disabled_until: disabledUntil });
  });
});
