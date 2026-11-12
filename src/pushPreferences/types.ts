import type { PushPreference, PushPreferencesResponse } from '../types';

export type MergeOwnPushPreferencesParams = {
  preferences: PushPreference[];
  userId: string;
  previous?: PushPreferencesResponse;
  updated?: PushPreferencesResponse;
};
