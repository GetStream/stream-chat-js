import type { PushPreference, PushPreferencesResponse } from '../types';
import { MINUTES_PER_HOUR, QUIET_HOURS_WEEK } from './constants';
import type { QuietHoursDay } from './constants';
import type {
  IsInQuietHoursParams,
  IsQuietHoursRuleActiveParams,
  MergeOwnPushPreferencesParams,
  ZonedWallClock,
} from './types';

const toMinutes = (wallClockTime: string) => {
  const [hours, minutes] = wallClockTime.split(':').map(Number);

  const totalMinutes = hours * MINUTES_PER_HOUR + minutes;
  return totalMinutes;
};

const getPreviousDay = (day: QuietHoursDay) => {
  const { length: daysInWeek } = QUIET_HOURS_WEEK;
  const dayIndex = QUIET_HOURS_WEEK.indexOf(day);
  const previousDayIndex = (dayIndex + daysInWeek - 1) % daysInWeek;

  const previousDay = QUIET_HOURS_WEEK[previousDayIndex];
  return previousDay;
};

const getZonedWallClock = (date: Date, timeZone: string): ZonedWallClock => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const {
    hour = '',
    minute = '',
    weekday = '',
  } = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  const wallClock = {
    minutes: toMinutes(`${hour}:${minute}`),
    weekday: weekday.toLowerCase() as QuietHoursDay,
  };
  return wallClock;
};

const isQuietHoursRuleActive = ({ rule, wallClock }: IsQuietHoursRuleActiveParams) => {
  const { days = [], end, start } = rule;
  const { minutes, weekday } = wallClock;
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const previousDay = getPreviousDay(weekday);

  const appliesEveryDay = !days.length;
  const opensToday = appliesEveryDay || days.includes(weekday);
  const openedYesterday = appliesEveryDay || days.includes(previousDay);
  const runsPastMidnight = startMinutes >= endMinutes;
  const isAfterStart = minutes >= startMinutes;
  const isBeforeEnd = minutes < endMinutes;
  const isActiveSinceToday =
    opensToday && isAfterStart && (runsPastMidnight || isBeforeEnd);
  const isActiveSinceYesterday = runsPastMidnight && openedYesterday && isBeforeEnd;

  const isActive = isActiveSinceToday || isActiveSinceYesterday;
  return isActive;
};

const isOwnUserLevelPreference = (
  { channel_cid, user_id }: PushPreference,
  userId: string,
) => {
  const isUserLevel = !channel_cid;
  const isOwn = !user_id || user_id === userId;

  const isOwnUserLevel = isUserLevel && isOwn;
  return isOwnUserLevel;
};

export const getDeviceTimeZone = () => {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  return timeZone;
};

export const isInQuietHours = ({ date = new Date(), schedule }: IsInQuietHoursParams) => {
  const { quiet_hours: quietHours, timezone } = schedule;
  const wallClock = getZonedWallClock(date, timezone);

  const inQuietHours = quietHours.some((rule) =>
    isQuietHoursRuleActive({ rule, wallClock }),
  );
  return inQuietHours;
};

export const mergeOwnPushPreferences = ({
  preferences,
  previous,
  updated,
  userId,
}: MergeOwnPushPreferencesParams) => {
  const ownPreferences = preferences.filter((preference) =>
    isOwnUserLevelPreference(preference, userId),
  );
  if (!ownPreferences.length) return previous;

  const { disabled_until: updatedDisabledUntil, schedule: updatedSchedule } =
    updated ?? {};
  const removesSchedule = ownPreferences.some(({ remove_schedule }) => remove_schedule);
  const removesDisabledUntil = ownPreferences.some(
    ({ remove_disable }) => remove_disable,
  );
  const keepsSchedule = !removesSchedule || !!updatedSchedule;
  const keepsDisabledUntil = !removesDisabledUntil || !!updatedDisabledUntil;

  const { disabled_until, schedule, ...otherPreferences } = { ...previous, ...updated };
  const hasDisabledUntil = keepsDisabledUntil && disabled_until !== undefined;
  const hasSchedule = keepsSchedule && !!schedule;

  const mergedPreferences: PushPreferencesResponse = {
    ...otherPreferences,
    ...(hasDisabledUntil && { disabled_until }),
    ...(hasSchedule && { schedule }),
  };
  return mergedPreferences;
};
