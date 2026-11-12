import { describe, expect, it } from 'vitest';
import type { PushScheduleResponse, QuietHoursRuleResponse } from '../../../src';
import { mergeOwnPushPreferences } from '../../../src/pushPreferences/utils';

const schedule = (
  quiet_hours: QuietHoursRuleResponse[],
  timezone = 'UTC',
): PushScheduleResponse => ({ quiet_hours, timezone });

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
