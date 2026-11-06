import type {
  PushPreference,
  PushPreferencesResponse,
  PushScheduleResponse,
  QuietHoursRuleResponse,
} from '../types';
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
  preferences: PushPreference[];
  userId: string;
  previous?: PushPreferencesResponse;
  updated?: PushPreferencesResponse;
};
