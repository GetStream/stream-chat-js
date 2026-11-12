import type { PushPreference, PushPreferencesResponse } from '../types';
import type { MergeOwnPushPreferencesParams } from './types';

const isOwnUserLevelPreference = (
  { channel_cid, user_id }: PushPreference,
  userId: string,
) => {
  const isUserLevel = !channel_cid;
  const isOwn = !user_id || user_id === userId;

  const isOwnUserLevel = isUserLevel && isOwn;
  return isOwnUserLevel;
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
