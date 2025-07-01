import { Reminder } from './Reminder';
import { DEFAULT_STOP_REFRESH_BOUNDARY_MS } from './ReminderTimer';
import { StateStore } from '../store';
import { ReminderPaginator } from '../pagination';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import type { ReminderResponseBaseOrResponse } from './Reminder';
import type { StreamChat } from '../client';
import type {
  CreateReminderOptions,
  Event,
  EventTypes,
  LocalMessage,
  MessageResponse,
  ReminderResponse,
} from '../types';

const oneMinute = 60 * 1000;
const oneHour = 60 * oneMinute;
const oneDay = 24 * oneHour;

export const DEFAULT_REMINDER_MANAGER_CONFIG: ReminderManagerConfig = {
  scheduledOffsetsMs: [
    2 * oneMinute,
    30 * oneMinute,
    oneHour,
    2 * oneHour,
    8 * oneHour,
    oneDay,
  ],
  stopTimerRefreshBoundaryMs: DEFAULT_STOP_REFRESH_BOUNDARY_MS,
};

const isReminderExistsError = (error: Error) =>
  error.message.match('already has reminder created for this message_id');

const isReminderDoesNotExistError = (error: Error) =>
  error.message.match('reminder does not exist');

type MessageId = string;

export type ReminderEvent = {
  cid: string;
  created_at: string;
  message_id: MessageId;
  reminder: ReminderResponse;
  type: EventTypes;
  user_id: string;
};

export type ReminderManagerState = {
  reminders: Map<MessageId, Reminder>;
};

export type ReminderManagerConfig = {
  scheduledOffsetsMs: number[];
  stopTimerRefreshBoundaryMs: number;
};

export type ReminderManagerOptions = {
  client: StreamChat;
  config?: Partial<ReminderManagerConfig>;
};

export class ReminderManager extends WithSubscriptions {
  private client: StreamChat;
  configState: StateStore<ReminderManagerConfig>;
  state: StateStore<ReminderManagerState>;
  paginator: ReminderPaginator;

  constructor({ client, config }: ReminderManagerOptions) {
    super();
    this.client = client;
    this.configState = new StateStore({
      scheduledOffsetsMs:
        config?.scheduledOffsetsMs ?? DEFAULT_REMINDER_MANAGER_CONFIG.scheduledOffsetsMs,
      stopTimerRefreshBoundaryMs:
        config?.stopTimerRefreshBoundaryMs ??
        DEFAULT_REMINDER_MANAGER_CONFIG.stopTimerRefreshBoundaryMs,
    });
    this.state = new StateStore({ reminders: new Map<MessageId, Reminder>() });
    this.paginator = new ReminderPaginator(client);
  }

  // Config API START //
  updateConfig(config: Partial<ReminderManagerConfig>) {
    if (
      typeof config.stopTimerRefreshBoundaryMs === 'number' &&
      config.stopTimerRefreshBoundaryMs !== this.stopTimerRefreshBoundaryMs
    ) {
      this.reminders.forEach((reminder) => {
        reminder.timer.stopRefreshBoundaryMs =
          config?.stopTimerRefreshBoundaryMs as number;
      });
    }
    this.configState.partialNext(config);
  }

  get stopTimerRefreshBoundaryMs() {
    return this.configState.getLatestValue().stopTimerRefreshBoundaryMs;
  }

  get scheduledOffsetsMs() {
    return this.configState.getLatestValue().scheduledOffsetsMs;
  }
  // Config API END //

  // State API START //
  get reminders() {
    return this.state.getLatestValue().reminders;
  }
  getFromState(messageId: MessageId) {
    return this.reminders.get(messageId);
  }

  upsertToState = ({
    data,
    overwrite = true,
  }: {
    data: ReminderResponseBaseOrResponse;
    overwrite?: boolean;
  }) => {
    if (!this.client._cacheEnabled()) {
      return;
    }
    const cachedReminder = this.getFromState(data.message_id);
    if (!cachedReminder) {
      const reminder = new Reminder({
        data,
        config: { stopRefreshBoundaryMs: this.stopTimerRefreshBoundaryMs },
      });
      this.state.partialNext({
        reminders: new Map(this.reminders.set(data.message_id, reminder)),
      });
    } else if (overwrite) {
      cachedReminder.setState(data);
    }
    return cachedReminder;
  };

  removeFromState = (messageId: string) => {
    const cachedReminder = this.getFromState(messageId);
    if (!cachedReminder) return;
    cachedReminder.clearTimer();
    const reminders = this.reminders;
    reminders.delete(messageId);
    this.state.partialNext({ reminders: new Map(reminders) });
  };

  hydrateState = (messages: MessageResponse[] | LocalMessage[]) => {
    messages.forEach(({ reminder }) => {
      if (reminder) {
        this.upsertToState({ data: reminder });
      }
    });
  };
  // State API END //

  // Timers API START //
  initTimers = () => {
    this.reminders.forEach((reminder) => reminder.initTimer());
  };

  clearTimers = () => {
    this.reminders.forEach((reminder) => reminder.clearTimer());
  };
  // Timers API END //

  // WS event handling START //
  static isReminderWsEventPayload = (event: Event): event is ReminderEvent =>
    !!event.reminder &&
    (event.type.startsWith('reminder.') || event.type === 'notification.reminder_due');

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;
    this.addUnsubscribeFunction(this.subscribeReminderCreated());
    this.addUnsubscribeFunction(this.subscribeReminderUpdated());
    this.addUnsubscribeFunction(this.subscribeReminderDeleted());
    this.addUnsubscribeFunction(this.subscribeNotificationReminderDue());
    this.addUnsubscribeFunction(this.subscribeMessageDeleted());
    this.addUnsubscribeFunction(this.subscribeMessageUndeleted());
    this.addUnsubscribeFunction(this.subscribePaginatorStateUpdated());
    this.addUnsubscribeFunction(this.subscribeConfigStateUpdated());
  };

  private subscribeReminderCreated = () =>
    this.client.on('reminder.created', (event) => {
      if (!ReminderManager.isReminderWsEventPayload(event)) return;
      const { reminder } = event;
      this.upsertToState({ data: reminder });
    }).unsubscribe;

  private subscribeReminderUpdated = () =>
    this.client.on('reminder.updated', (event) => {
      if (!ReminderManager.isReminderWsEventPayload(event)) return;
      const { reminder } = event;
      this.upsertToState({ data: reminder });
    }).unsubscribe;

  private subscribeReminderDeleted = () =>
    this.client.on('reminder.deleted', (event) => {
      if (!ReminderManager.isReminderWsEventPayload(event)) return;
      this.removeFromState(event.message_id);
    }).unsubscribe;

  private subscribeMessageDeleted = () =>
    this.client.on('message.deleted', (event) => {
      if (!event.message?.id) return;
      this.removeFromState(event.message.id);
    }).unsubscribe;

  private subscribeMessageUndeleted = () =>
    this.client.on('message.undeleted', (event) => {
      if (!event.message?.reminder) return;
      // todo: not sure whether reminder specific event is emitted too and this can be ignored here
      this.upsertToState({ data: event.message.reminder });
    }).unsubscribe;

  private subscribeNotificationReminderDue = () =>
    this.client.on('notification.reminder_due', () => null).unsubscribe; // todo: what should be performed on this event?

  private subscribePaginatorStateUpdated = () =>
    this.paginator.state.subscribeWithSelector(
      ({ items }) => [items],
      ([items]) => {
        if (!items) return;
        for (const reminder of items) {
          this.upsertToState({ data: reminder });
        }
      },
    );

  private subscribeConfigStateUpdated = () =>
    this.configState.subscribeWithSelector(
      ({ stopTimerRefreshBoundaryMs }) => ({ stopTimerRefreshBoundaryMs }),
      ({ stopTimerRefreshBoundaryMs }, previousValue) => {
        if (
          typeof stopTimerRefreshBoundaryMs === 'number' &&
          stopTimerRefreshBoundaryMs !== previousValue?.stopTimerRefreshBoundaryMs
        ) {
          this.reminders.forEach((reminder: Reminder) => {
            if (reminder.timer) {
              reminder.timer.stopRefreshBoundaryMs = stopTimerRefreshBoundaryMs;
            }
          });
        }
      },
    );
  // WS event handling END //

  // API calls START //
  upsertReminder = async (options: CreateReminderOptions) => {
    const { messageId } = options;
    if (this.getFromState(messageId)) {
      try {
        return await this.updateReminder(options);
      } catch (error) {
        if (isReminderDoesNotExistError(error as Error)) {
          return await this.createReminder(options);
        }
        throw error;
      }
    } else {
      try {
        return await this.createReminder(options);
      } catch (error) {
        if (isReminderExistsError(error as Error)) {
          return await this.updateReminder(options);
        }
        throw error;
      }
    }
  };

  createReminder = async (options: CreateReminderOptions) => {
    const { reminder } = await this.client.createReminder(options);
    return this.upsertToState({ data: reminder, overwrite: false });
  };

  updateReminder = async (options: CreateReminderOptions) => {
    const { reminder } = await this.client.updateReminder(options);
    return this.upsertToState({ data: reminder });
  };

  deleteReminder = async (messageId: MessageId) => {
    await this.client.deleteReminder(messageId);
    this.removeFromState(messageId);
  };

  queryNextReminders = async () => {
    await this.paginator.next();
  };

  queryPreviousReminders = async () => {
    await this.paginator.prev();
  };

  // API calls END //
}
