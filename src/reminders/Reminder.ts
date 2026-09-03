import { ReminderTimer } from './ReminderTimer';
import { StateStore } from '../store';
import { nowNs, nsToMs } from '../utils/time';
import type { ReminderTimerConfig } from './ReminderTimer';
import type { MessageResponse, ReminderResponseData, UserResponse } from '../types';

/**
 * Milliseconds until `remindAt`, negative once it has passed.
 *
 * @param remindAt - Unix nanoseconds, as the API sends it. The subtraction happens in the wire unit
 *   and is converted once, so the returned duration stays in the milliseconds `setTimeout` speaks.
 */
export const timeLeftMs = (remindAt: number) => nsToMs(remindAt - nowNs());

export type ReminderResponseBaseOrResponse = ReminderResponseData;

export type ReminderState = {
  channel_cid: string;
  /** Unix nanoseconds, as the API sends it. */
  created_at: number;
  message: MessageResponse | null;
  message_id: string;
  /** Unix nanoseconds, as the API sends it. */
  remind_at: number | null;
  /** A duration, so milliseconds — see {@link timeLeftMs}. */
  timeLeftMs: number | null;
  /** Unix nanoseconds, as the API sends it. */
  updated_at: number;
  user: UserResponse | null;
  user_id: string;
};

export type ReminderOptions = {
  data: ReminderResponseBaseOrResponse;
  config?: ReminderTimerConfig;
};

export class Reminder {
  state: StateStore<ReminderState>;
  timer: ReminderTimer;
  constructor({ data, config }: ReminderOptions) {
    this.state = new StateStore(Reminder.toStateValue(data));
    this.timer = new ReminderTimer({ reminder: this, config });
    this.initTimer();
  }

  static toStateValue = (data: ReminderResponseBaseOrResponse): ReminderState => ({
    ...data,
    created_at: data.created_at,
    message: data.message || null,
    remind_at: data.remind_at ?? null,
    // Nullish rather than truthy: `0` is a legitimate timestamp (the epoch), and treating it as
    // "no reminder set" is a real bug now that these are numbers rather than `Date` objects.
    timeLeftMs: data.remind_at != null ? timeLeftMs(data.remind_at) : null,
    updated_at: data.updated_at,
    user: data.user || null,
  });

  get id() {
    return this.state.getLatestValue().message_id;
  }

  get remindAt() {
    return this.state.getLatestValue().remind_at;
  }

  get timeLeftMs() {
    return this.state.getLatestValue().timeLeftMs;
  }

  setState = (data: ReminderResponseBaseOrResponse) => {
    this.state.next((current) => {
      const newState = { ...current, ...Reminder.toStateValue(data) };
      if (newState.remind_at != null) {
        newState.timeLeftMs = timeLeftMs(newState.remind_at);
      }
      return newState;
    });

    if (data.remind_at != null) {
      this.initTimer();
    } else {
      this.clearTimer();
    }
  };

  refreshTimeLeft = () => {
    if (this.remindAt == null) return;
    this.state.partialNext({ timeLeftMs: timeLeftMs(this.remindAt) });
  };

  initTimer = () => {
    this.timer.init();
  };

  clearTimer = () => {
    this.timer.clear();
  };
}
