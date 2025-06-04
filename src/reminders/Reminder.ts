import { ReminderTimer } from './ReminderTimer';
import { StateStore } from '../store';
import type { ReminderTimerConfig } from './ReminderTimer';
import type { MessageResponse, ReminderResponseBase, UserResponse } from '../types';

export const timeLeftMs = (remindAt: number) => remindAt - new Date().getTime();

export type ReminderResponseBaseOrResponse = ReminderResponseBase & {
  user?: UserResponse;
  message?: MessageResponse;
};

export type ReminderState = {
  channel_cid: string;
  created_at: Date;
  message: MessageResponse | null;
  message_id: string;
  remind_at: Date | null;
  timeLeftMs: number | null;
  updated_at: Date;
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
    created_at: new Date(data.created_at),
    message: data.message || null,
    remind_at: data.remind_at ? new Date(data.remind_at) : null,
    timeLeftMs: data.remind_at ? timeLeftMs(new Date(data.remind_at).getTime()) : null,
    updated_at: new Date(data.updated_at),
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
      if (newState.remind_at) {
        newState.timeLeftMs = timeLeftMs(newState.remind_at.getTime());
      }
      return newState;
    });

    if (data.remind_at) {
      this.initTimer();
    } else if (!data.remind_at) {
      this.clearTimer();
    }
  };

  refreshTimeLeft = () => {
    if (!this.remindAt) return;
    this.state.partialNext({ timeLeftMs: timeLeftMs(this.remindAt.getTime()) });
  };

  initTimer = () => {
    this.timer.init();
  };

  clearTimer = () => {
    this.timer.clear();
  };
}
