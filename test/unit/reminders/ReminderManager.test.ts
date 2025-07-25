import {
  DEFAULT_REMINDER_MANAGER_CONFIG,
  DEFAULT_STOP_REFRESH_BOUNDARY_MS,
  EventTypes,
  Reminder,
  ReminderManager,
  ReminderResponse,
  ReminderState,
  StreamChat,
} from '../../../src';
import { describe, expect, it, vi } from 'vitest';
import { PaginationQueryReturnValue } from '../../../src/pagination';

const baseData = {
  channel_cid: 'channel_cid',
  message_id: 'message_id',
  user_id: 'user_id',
} as const;

export const generateReminderResponse = ({
  data,
  scheduleOffsetMs,
}: {
  data?: Partial<ReminderResponse>;
  scheduleOffsetMs?: number;
} = {}): ReminderResponse => {
  const created_at = new Date().toISOString();
  const basePayload: ReminderResponse = {
    ...baseData,
    created_at,
    message: { id: baseData.message_id, type: 'regular' },
    updated_at: created_at,
    user: { id: baseData.user_id },
  };
  if (typeof scheduleOffsetMs === 'number') {
    basePayload.remind_at = new Date(
      new Date(created_at).getTime() + scheduleOffsetMs,
    ).toISOString();
  }
  return {
    ...basePayload,
    ...data,
  };
};

const generateReminderEvent = (type: EventTypes, reminder: ReminderResponse) => ({
  ...baseData,
  cid: baseData.channel_cid,
  created_at: new Date().toISOString(),
  reminder,
  type,
});

describe('ReminderManager', () => {
  describe('constructor', () => {
    it('initiates with default config', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      // @ts-expect-error accessing private property
      expect(manager.client).toBe(client);
      expect(manager.configState.getLatestValue()).toEqual(
        DEFAULT_REMINDER_MANAGER_CONFIG,
      );
      expect(manager.state.getLatestValue()).toEqual({ reminders: new Map() });
    });

    it('initiates with custom config', () => {
      const client = new StreamChat('api-key');
      const config = { scheduledOffsetsMs: [1, 2, 3] };
      const manager = new ReminderManager({ client, config });
      // @ts-expect-error accessing private property
      expect(manager.client).toBe(client);
      expect(manager.configState.getLatestValue()).toEqual({
        ...DEFAULT_REMINDER_MANAGER_CONFIG,
        ...config,
      });
      expect(manager.state.getLatestValue()).toEqual({ reminders: new Map() });
    });
  });

  describe('config state API', () => {
    it('updates scheduledOffsetsMs', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      const config = { scheduledOffsetsMs: [1, 2, 3] };
      manager.updateConfig(config);
      expect(manager.scheduledOffsetsMs).toEqual(config.scheduledOffsetsMs);
    });

    it('updates stopTimerRefreshBoundaryMs for every timer', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      const scheduleOffsetMs = 62 * 1000;
      const reminderResponse = generateReminderResponse({ scheduleOffsetMs });
      manager.upsertToState({ data: reminderResponse });

      expect(manager.stopTimerRefreshBoundaryMs).toBe(DEFAULT_STOP_REFRESH_BOUNDARY_MS);
      const config = { stopTimerRefreshBoundaryMs: 1 };
      manager.updateConfig(config);
      expect(manager.stopTimerRefreshBoundaryMs).toEqual(
        config.stopTimerRefreshBoundaryMs,
      );
      expect(
        manager.reminders.get(reminderResponse.message_id)?.timer.stopRefreshBoundaryMs,
      ).toBe(1);
    });
  });

  describe('state API', () => {
    it('adds new bookmark reminder', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });

      const reminderResponse = generateReminderResponse();
      manager.upsertToState({ data: reminderResponse });
      expect(manager.reminders.size).toBe(1);
      expect(manager.reminders.get(reminderResponse.message_id)).toBeInstanceOf(Reminder);
      expect(
        manager.reminders.get(reminderResponse.message_id)?.state.getLatestValue(),
      ).toEqual({
        ...reminderResponse,
        created_at: new Date(reminderResponse.created_at),
        remind_at: null,
        updated_at: new Date(reminderResponse.updated_at),
        timeLeftMs: null,
      });
    });

    it('adds new timed reminder', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      const scheduleOffsetMs = 62 * 1000;
      const now = new Date().getTime();
      const reminderResponse = generateReminderResponse({ scheduleOffsetMs });
      manager.upsertToState({ data: reminderResponse });

      expect(manager.reminders.size).toBe(1);

      const reminder = manager.getFromState(reminderResponse.message_id);
      expect(reminder).toBeInstanceOf(Reminder);

      const remindAtDate = new Date(
        new Date(reminderResponse.created_at).getTime() + scheduleOffsetMs,
      );
      const reminderState = reminder!.state.getLatestValue();
      expect(reminderState).toEqual({
        ...reminderResponse,
        created_at: new Date(reminderResponse.created_at),
        remind_at: remindAtDate,
        updated_at: new Date(reminderResponse.updated_at),
        timeLeftMs: expect.any(Number),
      });
      expect(Math.floor((reminderState!.timeLeftMs as number) / 10000)).toBe(
        Math.floor((remindAtDate.getTime() - now) / 10000),
      );
    });

    it('does not add new reminders if client cache is disabled', () => {
      const secret = 'secret';
      const client = new StreamChat('api-key', secret, { disableCache: true });
      const manager = new ReminderManager({ client });

      const reminderResponse = generateReminderResponse();
      manager.upsertToState({ data: reminderResponse });
      expect(manager.reminders.size).toBe(0);
    });

    it('updates existing reminders', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });

      const reminderResponse = generateReminderResponse();
      manager.upsertToState({ data: reminderResponse });
      reminderResponse.remind_at = undefined;
      manager.upsertToState({ data: reminderResponse });
      expect(manager.reminders.size).toBe(1);
      expect(
        manager.reminders.get(reminderResponse.message_id)?.state.getLatestValue(),
      ).toEqual({
        ...reminderResponse,
        created_at: new Date(reminderResponse.created_at),
        remind_at: null,
        updated_at: new Date(reminderResponse.updated_at),
        timeLeftMs: null,
      });
    });

    it('does not update reminder when overwriting is disabled', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });

      const reminderResponse = generateReminderResponse();
      manager.upsertToState({ data: reminderResponse });
      const updatedReminderResponseBase = generateReminderResponse({
        data: { remind_at: undefined },
      });
      manager.upsertToState({ data: updatedReminderResponseBase, overwrite: false });

      expect(manager.reminders.size).toBe(1);
      expect(
        manager.reminders.get(reminderResponse.message_id)?.state.getLatestValue(),
      ).toEqual({
        ...reminderResponse,
        created_at: new Date(reminderResponse.created_at),
        remind_at: null,
        updated_at: new Date(reminderResponse.updated_at),
        timeLeftMs: null,
      });
    });

    it('removes a reminder', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });

      const reminderResponse = generateReminderResponse();
      manager.upsertToState({ data: reminderResponse });
      manager.removeFromState(reminderResponse.message_id);

      expect(manager.reminders.size).toBe(0);
    });

    it('does nothing when removing a non-existent reminder', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });

      const reminderResponse = generateReminderResponse();
      manager.upsertToState({ data: reminderResponse });
      manager.removeFromState('non-existent-reminder');

      expect(manager.getFromState(reminderResponse.message_id)).toBeDefined();
    });

    it('hydrates state from message objects', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });

      const messages = [
        {
          id: 'message-1',
          reminder: generateReminderResponse({
            data: { message_id: 'message-1' },
            scheduleOffsetMs: 12 * 1000,
          }),
          type: 'regular' as const,
        },
        {
          id: 'message-2',
          reminder: generateReminderResponse({
            data: { message_id: 'message-2' },
            scheduleOffsetMs: 22 * 1000,
          }),
          type: 'regular' as const,
        },
      ];

      manager.hydrateState(messages);
      expect(manager.reminders.size).toBe(2);
      expect(manager.getFromState('message-1')).toBeInstanceOf(Reminder);
      expect(manager.getFromState('message-2')).toBeInstanceOf(Reminder);
    });
  });

  describe('WS event handling', () => {
    it('adds bookmark reminder to state from reminder.created event', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      manager.registerSubscriptions();
      const reminderResponse = generateReminderResponse();
      const type: EventTypes = 'reminder.created';
      client.dispatchEvent(generateReminderEvent(type, reminderResponse));
      expect(manager.reminders.size).toBe(1);
      expect(manager.reminders.get(reminderResponse.message_id)).toBeInstanceOf(Reminder);
      expect(
        manager.reminders.get(reminderResponse.message_id)?.state.getLatestValue(),
      ).toEqual({
        ...reminderResponse,
        created_at: new Date(reminderResponse.created_at),
        remind_at: null,
        updated_at: new Date(reminderResponse.updated_at),
        timeLeftMs: null,
      });
    });

    it('adds timed reminder to state from reminder.created event', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      manager.registerSubscriptions();

      const scheduleOffsetMs = 62 * 1000;
      const now = new Date().getTime();
      const reminderResponse = generateReminderResponse({ scheduleOffsetMs });
      const type: EventTypes = 'reminder.created';
      client.dispatchEvent(generateReminderEvent(type, reminderResponse));
      const reminder = manager.getFromState(reminderResponse.message_id);
      expect(reminder).toBeInstanceOf(Reminder);

      const remindAtDate = new Date(
        new Date(reminderResponse.created_at).getTime() + scheduleOffsetMs,
      );
      const reminderState = reminder!.state.getLatestValue();
      expect(reminderState).toEqual({
        ...reminderResponse,
        created_at: new Date(reminderResponse.created_at),
        remind_at: remindAtDate,
        updated_at: new Date(reminderResponse.updated_at),
        timeLeftMs: expect.any(Number),
      });
      expect(Math.floor((reminderState!.timeLeftMs as number) / 10000)).toBe(
        Math.floor((remindAtDate.getTime() - now) / 10000),
      );
    });

    it('updates reminder in state from reminder.created event', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      manager.registerSubscriptions();

      const reminderResponse = generateReminderResponse();
      manager.upsertToState({ data: reminderResponse });
      reminderResponse.remind_at = '1970-01-01';
      const type: EventTypes = 'reminder.updated';
      const now = new Date();
      client.dispatchEvent(generateReminderEvent(type, reminderResponse));
      expect(manager.reminders.size).toBe(1);
      const remindAtDate = new Date('1970-01-01');
      const { timeLeftMs, ...state } = manager.reminders
        .get(reminderResponse.message_id)
        ?.state.getLatestValue() as ReminderState;
      expect({
        ...state,
        timeLeftMs: Math.round((timeLeftMs ?? 0) / 1000),
      }).toEqual({
        ...reminderResponse,
        created_at: new Date(reminderResponse.created_at),
        remind_at: remindAtDate,
        updated_at: new Date(reminderResponse.updated_at),
        timeLeftMs: Math.round((remindAtDate.getTime() - now.getTime()) / 1000),
      });
    });
    it('removes reminder from state on reminder.deleted event', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      const reminderResponse = generateReminderResponse();
      manager.upsertToState({ data: reminderResponse });
      manager.registerSubscriptions();

      const type: EventTypes = 'reminder.deleted';
      client.dispatchEvent(generateReminderEvent(type, reminderResponse));

      expect(manager.reminders.size).toBe(0);
    });
    it('ignores non-reminder WS events', () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      manager.registerSubscriptions();
      let reminderResponse = undefined;
      let type: EventTypes = 'reminder.created';
      // @ts-expect-error passing undefined to mandatory param
      client.dispatchEvent(generateReminderEvent(type, reminderResponse));
      expect(manager.reminders.size).toBe(0);

      reminderResponse = generateReminderResponse();
      type = 'message.new';
      client.dispatchEvent(generateReminderEvent(type, reminderResponse));
      expect(manager.reminders.size).toBe(0);
    });
  });
  describe('API calls', () => {
    it('creates a reminder server-side and updates the state', async () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      const reminderResponse = generateReminderResponse();
      const postSpy = vi
        .spyOn(client, 'post')
        .mockResolvedValueOnce({ reminder: reminderResponse });
      const stateUpdateSpy = vi
        .spyOn(manager, 'upsertToState')
        .mockReturnValueOnce(undefined);
      await manager.createReminder({
        messageId: reminderResponse.message_id,
        user_id: reminderResponse.user_id,
      });
      expect(stateUpdateSpy).toHaveBeenCalledWith({
        data: reminderResponse,
        overwrite: false,
      });
    });
    it('updates a reminder server-side and updates the state', async () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      const reminderResponse = generateReminderResponse();
      const postSpy = vi
        .spyOn(client, 'patch')
        .mockResolvedValueOnce({ reminder: reminderResponse });
      const stateUpdateSpy = vi
        .spyOn(manager, 'upsertToState')
        .mockReturnValueOnce(undefined);
      await manager.updateReminder({
        messageId: reminderResponse.message_id,
        user_id: reminderResponse.user_id,
      });
      expect(stateUpdateSpy).toHaveBeenCalledWith({ data: reminderResponse });
    });
    it('deletes a reminder server-side and updates the state', async () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      const messageId = 'messageId';
      const postSpy = vi.spyOn(client, 'delete').mockResolvedValueOnce(undefined);
      const stateUpdateSpy = vi
        .spyOn(manager, 'removeFromState')
        .mockReturnValueOnce(undefined);
      await manager.deleteReminder(messageId);
      expect(stateUpdateSpy).toHaveBeenCalledWith(messageId);
    });
    describe('upsertReminder', () => {
      it('creates a reminder if not present in state', async () => {
        const client = new StreamChat('api-key');
        const manager = new ReminderManager({ client });
        const payload = { messageId: 'message_id', user_id: 'user_id' };
        const createReminderSpy = vi
          .spyOn(manager, 'createReminder')
          .mockResolvedValue(undefined);
        const updateReminderSpy = vi
          .spyOn(manager, 'updateReminder')
          .mockResolvedValue(undefined);
        await manager.upsertReminder(payload);
        expect(createReminderSpy).toHaveBeenCalledWith(payload);
        expect(updateReminderSpy).not.toHaveBeenCalledWith(payload);
      });
      it('updates a reminder after failed create request if exists server-side', async () => {
        const client = new StreamChat('api-key');
        const manager = new ReminderManager({ client });
        const payload = { messageId: 'message_id', user_id: 'user_id' };
        const createReminderSpy = vi
          .spyOn(manager, 'createReminder')
          .mockRejectedValue(
            new Error('already has reminder created for this message_id'),
          );
        const updateReminderSpy = vi
          .spyOn(manager, 'updateReminder')
          .mockResolvedValue(undefined);
        await manager.upsertReminder(payload);
        expect(updateReminderSpy).toHaveBeenCalledWith(payload);
      });
      it('updates a reminder if present in state', async () => {
        const client = new StreamChat('api-key');
        const manager = new ReminderManager({ client });
        const reminder = generateReminderResponse();
        manager.upsertToState({ data: reminder });
        const payload = { messageId: reminder.message_id, user_id: reminder.user_id };
        const createReminderSpy = vi
          .spyOn(manager, 'createReminder')
          .mockResolvedValue(undefined);
        const updateReminderSpy = vi
          .spyOn(manager, 'updateReminder')
          .mockResolvedValue(undefined);
        await manager.upsertReminder(payload);
        expect(createReminderSpy).not.toHaveBeenCalledWith(payload);
        expect(updateReminderSpy).toHaveBeenCalledWith(payload);
      });
      it('creates a reminder after failed update request if does not exist server-side', async () => {
        const client = new StreamChat('api-key');
        const manager = new ReminderManager({ client });
        const reminder = generateReminderResponse();
        manager.upsertToState({ data: reminder });
        const payload = { messageId: reminder.message_id, user_id: reminder.user_id };
        const createReminderSpy = vi
          .spyOn(manager, 'createReminder')
          .mockResolvedValue(undefined);
        const updateReminderSpy = vi
          .spyOn(manager, 'updateReminder')
          .mockRejectedValue(new Error('reminder does not exist'));
        await manager.upsertReminder(payload);
        expect(createReminderSpy).toHaveBeenCalledWith(payload);
        expect(updateReminderSpy).toHaveBeenCalledWith(payload);
      });
    });
  });
  describe('pagination', () => {
    it('adds newly paginated reminders on paginating next', async () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      manager.registerSubscriptions();
      const reminders = Array.from({ length: 4 }, (_, i) =>
        generateReminderResponse({ data: { message_id: `message_id_${i}` } }),
      );
      const queryReturnValue: PaginationQueryReturnValue<ReminderResponse> = {
        items: reminders,
      };
      vi.spyOn(manager.paginator, 'query').mockResolvedValue(queryReturnValue);
      await manager.queryNextReminders();
      expect(manager.reminders.size).toBe(4);
      Array.from(manager.reminders.values()).forEach((reminder, i) => {
        expect(reminder.id).toBe(reminders[i].message_id);
      });
    });
    it('adds newly paginated reminders on paginating previous', async () => {
      const client = new StreamChat('api-key');
      const manager = new ReminderManager({ client });
      manager.registerSubscriptions();
      const reminders = Array.from({ length: 4 }, (_, i) =>
        generateReminderResponse({ data: { message_id: `messag_id_${i}` } }),
      );
      const queryReturnValue: PaginationQueryReturnValue<ReminderResponse> = {
        items: reminders,
      };
      vi.spyOn(manager.paginator, 'query').mockResolvedValue(queryReturnValue);
      await manager.queryPreviousReminders();

      expect(manager.reminders.size).toBe(4);
      Array.from(manager.reminders.values()).forEach((reminder, i) => {
        expect(reminder.id).toBe(reminders[i].message_id);
      });
    });
  });
});
