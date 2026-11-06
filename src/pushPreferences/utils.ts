import type { PushPreferenceInput, PushPreferencesResponse } from '../gen/models';
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
  const dayIndex = QUIET_HOURS_WEEK.indexOf(day);
  const previousDay =
    QUIET_HOURS_WEEK[(dayIndex + QUIET_HOURS_WEEK.length - 1) % QUIET_HOURS_WEEK.length];
  return previousDay;
};

const getZonedWallClock = (date: Date, timeZone: string): ZonedWallClock => {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone,
    weekday: 'short',
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const wallClock = {
    minutes: toMinutes(`${getPart('hour')}:${getPart('minute')}`),
    weekday: getPart('weekday').toLowerCase() as QuietHoursDay,
  };
  return wallClock;
};

const isQuietHoursRuleActive = ({ rule, wallClock }: IsQuietHoursRuleActiveParams) => {
  const { days = [], end, start } = rule;
  const { minutes, weekday } = wallClock;
  const opensOn = (day: QuietHoursDay) => !days.length || days.includes(day);
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);

  if (startMinutes < endMinutes) {
    return opensOn(weekday) && minutes >= startMinutes && minutes < endMinutes;
  }

  const isActive =
    (opensOn(weekday) && minutes >= startMinutes) ||
    (opensOn(getPreviousDay(weekday)) && minutes < endMinutes);
  return isActive;
};

const isOwnUserLevelPreference = (preference: PushPreferenceInput, userId: string) =>
  !preference.channel_cid && (!preference.user_id || preference.user_id === userId);

export const getDeviceTimeZone = () => {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  return timeZone;
};

export const isInQuietHours = ({ date = new Date(), schedule }: IsInQuietHoursParams) => {
  const wallClock = getZonedWallClock(date, schedule.timezone);

  const inQuietHours = schedule.quiet_hours.some((rule) =>
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

  const removesSchedule = ownPreferences.some(({ remove_schedule }) => remove_schedule);
  const removesDisabledUntil = ownPreferences.some(
    ({ remove_disable }) => remove_disable,
  );
  const keepsSchedule = !removesSchedule || !!updated?.schedule;
  const keepsDisabledUntil = !removesDisabledUntil || !!updated?.disabled_until;
  const { disabled_until, schedule, ...otherPreferences } = { ...previous, ...updated };

  const mergedPreferences: PushPreferencesResponse = {
    ...otherPreferences,
    ...(keepsDisabledUntil && disabled_until !== undefined && { disabled_until }),
    ...(keepsSchedule && schedule && { schedule }),
  };
  return mergedPreferences;
};
