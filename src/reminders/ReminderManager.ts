import { Reminder } from './Reminder';
import { ReminderTimerManager } from './ReminderTimerManager';
import { StateStore } from '../store';
import { ReminderPaginator } from '../pagination';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import type { ReminderResponseBaseOrResponse } from './Reminder';
import type { StreamChat } from '../client';
import type {
  CreateReminderOptions,
  Event,
  EventTypes,
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
};

export type ReminderManagerOptions = {
  client: StreamChat;
  config?: ReminderManagerConfig;
};

export class ReminderManager extends WithSubscriptions {
  private client: StreamChat;
  private timers: ReminderTimerManager;
  configState: StateStore<ReminderManagerConfig>;
  state: StateStore<ReminderManagerState>;
  paginator: ReminderPaginator;

  constructor({ client, config }: ReminderManagerOptions) {
    super();
    this.client = client;
    this.configState = new StateStore({
      scheduledOffsetsMs:
        config?.scheduledOffsetsMs ?? DEFAULT_REMINDER_MANAGER_CONFIG.scheduledOffsetsMs,
    });
    this.state = new StateStore({ reminders: new Map<MessageId, Reminder>() });
    this.paginator = new ReminderPaginator(client);
    this.timers = new ReminderTimerManager();
  }

  // Config API START //
  updateConfig(config: Partial<ReminderManagerConfig>) {
    this.configState.partialNext(config);
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
      const reminder = new Reminder({ data });
      this.state.partialNext({
        reminders: new Map(this.reminders.set(data.message_id, reminder)),
      });
      this.timers.addAll([reminder]);
    } else if (overwrite) {
      cachedReminder.setState(data);
      this.timers.addAll([cachedReminder]);
    }
    return cachedReminder;
  };

  removeFromState = (messageId: string) => {
    const cachedReminder = this.getFromState(messageId);
    if (!cachedReminder) return;
    this.timers.remove(cachedReminder.id);
    const reminders = this.reminders;
    reminders.delete(messageId);
    this.state.partialNext({ reminders: new Map(reminders) });
  };

  hydrateState = (messages: MessageResponse[]) => {
    messages.forEach(({ reminder }) => {
      if (reminder) {
        this.upsertToState({ data: reminder });
      }
    });
  };
  // State API END //

  // Timers API START //
  initTimers = () => {
    this.timers.addAll(Array.from(this.reminders.values()));
  };

  clearTimers = () => {
    this.timers.clearAll();
  };
  // Timers API END //

  // WS event handling START //
  static isReminderWsEventPayload = (event: Event): event is ReminderEvent =>
    !!event.reminder &&
    (event.type.startsWith('reminder.') || event.type === 'notification.reminder_due');

  public registerSubscriptions = () => {
    this.addUnsubscribeFunction(this.subscribeReminderCreated());
    this.addUnsubscribeFunction(this.subscribeReminderUpdated());
    this.addUnsubscribeFunction(this.subscribeReminderDeleted());
    this.addUnsubscribeFunction(this.subscribeNotificationReminderDue());
    this.addUnsubscribeFunction(this.subscribePaginatorStateUpdated());
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
  // WS event handling END //

  // API calls START //
  createOrUpdateReminder = async (options: CreateReminderOptions) => {
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
