import type { PushPreferenceInput, PushPreferencesResponse } from '../gen/models';

export type MergeOwnPushPreferencesParams = {
  preferences: PushPreferenceInput[];
  userId: string;
  previous?: PushPreferencesResponse;
  updated?: PushPreferencesResponse;
};
