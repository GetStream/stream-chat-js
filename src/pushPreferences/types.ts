import type {
  PushPreferenceInput,
  PushPreferencesResponse,
  PushScheduleResponse,
  QuietHoursRuleResponse,
} from '../gen/models';
import type { QuietHoursDay } from './constants';

export type IsInQuietHoursParams = {
  schedule: PushScheduleResponse;
  date?: Date;
};

export type ZonedWallClock = {
  minutes: number;
  weekday: QuietHoursDay;
};

export type IsQuietHoursRuleActiveParams = {
  rule: QuietHoursRuleResponse;
  wallClock: ZonedWallClock;
};

export type MergeOwnPushPreferencesParams = {
  preferences: PushPreferenceInput[];
  userId: string;
  previous?: PushPreferencesResponse;
  updated?: PushPreferencesResponse;
};
