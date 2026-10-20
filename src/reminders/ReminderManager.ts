import { Reminder } from './Reminder';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';
import { DEFAULT_STOP_REFRESH_BOUNDARY_MS } from './ReminderTimer';
import { StateStore } from '@stream-io/state-store';
import { ConfigController } from '../configuration/ConfigController';
import { ReminderPaginator } from '../pagination';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import type { ReminderResponseBaseOrResponse } from './Reminder';
import type { StreamChat } from '../client';
import type { ChatApi } from '../gen/chat/ChatApi';
import type { Event, EventPayload, LocalMessage, MessageResponse } from '../types';

const oneMinute = 60 * 1000;
const oneHour = 60 * oneMinute;
const oneDay = 24 * oneHour;

export const DEFAULT_REMINDER_MANAGER_CONFIG: ReminderManagerConfig = deepFreezeConfig({
  scheduledOffsetsMs: [
    2 * oneMinute,
    30 * oneMinute,
    oneHour,
    2 * oneHour,
    8 * oneHour,
    oneDay,
  ],
  stopTimerRefreshBoundaryMs: DEFAULT_STOP_REFRESH_BOUNDARY_MS,
});

const isReminderExistsError = (error: Error) =>
  error.message.match('already has reminder created for this message_id');

const isReminderDoesNotExistError = (error: Error) =>
  error.message.match('reminder does not exist');

type MessageId = string;

export type ReminderEvent = EventPayload<
  `reminder.${string}` | 'notification.reminder_due'
>;

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
  private readonly configController: ConfigController<ReminderManagerConfig>;

  get configState(): StateStore<ReminderManagerConfig> {
    return this.configController.state;
  }
  state: StateStore<ReminderManagerState>;
  paginator: ReminderPaginator;

  constructor({ client, config }: ReminderManagerOptions) {
    super();
    this.client = client;
    this.configController = new ConfigController<ReminderManagerConfig>({
      defaults: DEFAULT_REMINDER_MANAGER_CONFIG,
      constructorOptions: config,
      // Live timers hold the boundary, so a change is pushed to them.
      onChanged: (next, previous) => {
        if (next.stopTimerRefreshBoundaryMs === previous.stopTimerRefreshBoundaryMs)
          return;
        this.reminders.forEach((reminder) => {
          reminder.timer.stopRefreshBoundaryMs = next.stopTimerRefreshBoundaryMs;
        });
      },
    });
    this.state = new StateStore({ reminders: new Map<MessageId, Reminder>() });
    this.paginator = new ReminderPaginator(client);
  }

  get config(): Readonly<ReminderManagerConfig> {
    return this.configState.getLatestValue();
  }

  /**
   * Merges a partial configuration into the resolved config.
   *
   * @param config - Fields to merge into the resolved config.
   */
  updateConfig(config: Partial<ReminderManagerConfig>) {
    this.configController.patch(config);
  }

  /**
   * Re-derives the configuration from the declarative slice.
   *
   * @param config - The declarative slice. Leave it out to rebuild from the defaults.
   */
  initializeConfig(config?: Partial<ReminderManagerConfig>) {
    this.configController.initialize(config);
  }

  get stopTimerRefreshBoundaryMs() {
    return this.configState.getLatestValue().stopTimerRefreshBoundaryMs;
  }

  get scheduledOffsetsMs() {
    return this.configState.getLatestValue().scheduledOffsetsMs;
  }

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

  initTimers = () => {
    this.reminders.forEach((reminder) => reminder.initTimer());
  };

  clearTimers = () => {
    this.reminders.forEach((reminder) => reminder.clearTimer());
  };

  static isReminderWsEventPayload = (event: Event): event is ReminderEvent =>
    'reminder' in event &&
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
      // TODO: OAPI discrepancy?
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.upsertToState({ data: reminder! });
    }).unsubscribe;

  private subscribeReminderUpdated = () =>
    this.client.on('reminder.updated', (event) => {
      if (!ReminderManager.isReminderWsEventPayload(event)) return;
      const { reminder } = event;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.upsertToState({ data: reminder! });
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

  upsertReminder = async (...args: Parameters<ChatApi['createReminder']>) => {
    const [{ message_id }] = args;
    if (this.getFromState(message_id)) {
      try {
        return await this.updateReminder(...args);
      } catch (error) {
        if (isReminderDoesNotExistError(error as Error)) {
          return await this.createReminder(...args);
        }
        throw error;
      }
    } else {
      try {
        return await this.createReminder(...args);
      } catch (error) {
        if (isReminderExistsError(error as Error)) {
          return await this.updateReminder(...args);
        }
        throw error;
      }
    }
  };

  createReminder = async (...args: Parameters<ChatApi['createReminder']>) => {
    const response = await this.client.createReminder(...args);
    return this.upsertToState({ data: response.reminder, overwrite: false });
  };

  updateReminder = async (...args: Parameters<ChatApi['updateReminder']>) => {
    const response = await this.client.updateReminder(...args);
    return this.upsertToState({ data: response.reminder });
  };

  deleteReminder = async (messageId: MessageId) => {
    await this.client.deleteReminder({ message_id: messageId });
    this.removeFromState(messageId);
  };

  queryNextReminders = async () => {
    await this.paginator.toTail();
  };

  queryPreviousReminders = async () => {
    await this.paginator.toHead();
  };
}
