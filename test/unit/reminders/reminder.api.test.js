import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from '../test-utils/getClient';

const user1 = {
	id: 'user1',
	role: 'user',
	created_at: '2024-01-01T00:00:00.000Z',
	updated_at: '2024-01-01T00:00:00.000Z',
	name: 'Test User 1',
};

const reminderResponse = {
	id: 'reminder1',
	remind_at: '2025-04-12T23:20:50.52Z',
	user_id: user1.id,
	user: user1,
	channel_cid: 'messaging:123',
	message_id: 'message123',
	created_at: '2024-01-01T00:00:00.000Z',
	updated_at: '2024-01-01T00:00:00.000Z',
};

describe('Reminder', () => {
	let client;

	beforeEach(() => {
		client = getClientWithUser(user1);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('createReminder', () => {
		it('should create a reminder successfully', async () => {
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: reminderResponse });

			const result = await client.createReminder({
				message_id: 'message123',
				remind_at: '2025-04-12T23:20:50.52Z',
			});

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				url: `${client.baseURL}/api/v2/chat/messages/message123/reminders`,
				data: { remind_at: '2025-04-12T23:20:50.52Z' },
			});
			expect(result).toMatchObject(reminderResponse);
		});

		it('should create a reminder without remind_at', async () => {
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: reminderResponse });

			await client.createReminder({ message_id: 'message123' });

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'POST',
				url: `${client.baseURL}/api/v2/chat/messages/message123/reminders`,
			});
			expect(requestSpy.mock.calls[0][0].data).toEqual({});
		});

		it('should create a reminder with null remind_at', async () => {
			const reminderWithNullDate = {
				...reminderResponse,
				remind_at: null,
			};
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: reminderWithNullDate });

			const result = await client.createReminder({
				message_id: 'message123',
				remind_at: null,
			});

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'POST',
				url: `${client.baseURL}/api/v2/chat/messages/message123/reminders`,
				data: { remind_at: null },
			});
			expect(result).toMatchObject(reminderWithNullDate);
		});

		it('should create a reminder with undefined remind_at', async () => {
			const reminderWithoutDate = {
				...reminderResponse,
				remind_at: undefined,
			};
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: reminderWithoutDate });

			const result = await client.createReminder({
				message_id: 'message123',
				remind_at: undefined,
			});

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'POST',
				url: `${client.baseURL}/api/v2/chat/messages/message123/reminders`,
			});
			expect(requestSpy.mock.calls[0][0].data).toEqual({});
			expect(result).toMatchObject(reminderWithoutDate);
		});
	});

	describe('updateReminder', () => {
		it('should update a reminder successfully', async () => {
			const updatedReminder = {
				...reminderResponse,
				remind_at: '2025-05-12T23:20:50.52Z',
			};
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: updatedReminder });

			const result = await client.updateReminder({
				message_id: 'message123',
				remind_at: new Date('2025-05-12T23:20:50.52Z'),
			});

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'PATCH',
				url: `${client.baseURL}/api/v2/chat/messages/message123/reminders`,
				data: { remind_at: new Date('2025-05-12T23:20:50.52Z') },
			});
			expect(result).toMatchObject(updatedReminder);
		});

		it('should update a reminder to remove remind_at', async () => {
			const updatedReminder = {
				...reminderResponse,
				remind_at: null,
			};
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: updatedReminder });

			const result = await client.updateReminder({
				message_id: 'message123',
				remind_at: null,
			});

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'PATCH',
				url: `${client.baseURL}/api/v2/chat/messages/message123/reminders`,
				data: { remind_at: null },
			});
			expect(result).toMatchObject(updatedReminder);
		});

		it('should update a reminder with undefined remind_at', async () => {
			const updatedReminder = {
				...reminderResponse,
				remind_at: undefined,
			};
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: updatedReminder });

			const result = await client.updateReminder({
				message_id: 'message123',
				remind_at: undefined,
			});

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'PATCH',
				url: `${client.baseURL}/api/v2/chat/messages/message123/reminders`,
			});
			expect(requestSpy.mock.calls[0][0].data).toEqual({});
			expect(result).toMatchObject(updatedReminder);
		});
	});

	describe('deleteReminder', () => {
		it('should delete a reminder successfully', async () => {
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: {} });

			await client.deleteReminder('message123');

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'DELETE',
				url: `${client.baseURL}/api/v2/chat/messages/message123/reminders`,
			});
		});
	});

	describe('queryReminders', () => {
		it('should query reminders successfully', async () => {
			const queryResponse = {
				reminders: [reminderResponse],
				next: 'next_page_token',
			};
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: queryResponse });

			const result = await client.queryReminders({
				filter: {
					channel_cid: 'messaging:123',
					remind_at: { $gt: '2024-01-01T00:00:00.000Z' },
				},
				sort: [{ remind_at: 1 }],
				limit: 10,
			});

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'POST',
				url: `${client.baseURL}/api/v2/chat/reminders/query`,
				data: {
					filter: {
						channel_cid: 'messaging:123',
						remind_at: { $gt: '2024-01-01T00:00:00.000Z' },
					},
					sort: [{ field: 'remind_at', direction: 1 }],
					limit: 10,
				},
			});
			expect(result).toMatchObject(queryResponse);
		});

		it('should query reminders with empty options', async () => {
			const queryResponse = { reminders: [] };
			const requestSpy = vi
				.spyOn(client.axiosInstance, 'request')
				.mockResolvedValueOnce({ data: queryResponse });

			const result = await client.queryReminders();

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'POST',
				url: `${client.baseURL}/api/v2/chat/reminders/query`,
			});
			expect(requestSpy.mock.calls[0][0].data).toEqual({});
			expect(result).toMatchObject(queryResponse);
		});
	});

	describe('Reminder Events', () => {
		it('should handle reminder.created event', () => {
			const eventHandler = vi.fn();
			client.on('reminder.created', eventHandler);

			const reminderEvent = {
				type: 'reminder.created',
				reminder: reminderResponse,
			};

			client.dispatchEvent(reminderEvent);

			expect(eventHandler).toHaveBeenCalledTimes(1);
			expect(eventHandler.mock.calls[0][0]).toEqual(reminderEvent);
		});

		it('should handle reminder.updated event', () => {
			const eventHandler = vi.fn();
			client.on('reminder.updated', eventHandler);

			const reminderEvent = {
				type: 'reminder.updated',
				reminder: {
					...reminderResponse,
					remind_at: '2025-05-12T23:20:50.52Z',
				},
			};

			client.dispatchEvent(reminderEvent);

			expect(eventHandler).toHaveBeenCalledTimes(1);
			expect(eventHandler.mock.calls[0][0]).toEqual(reminderEvent);
		});

		it('should handle reminder.deleted event', () => {
			const eventHandler = vi.fn();
			client.on('reminder.deleted', eventHandler);

			const reminderEvent = {
				type: 'reminder.deleted',
				reminder: reminderResponse,
			};

			client.dispatchEvent(reminderEvent);

			expect(eventHandler).toHaveBeenCalledTimes(1);
			expect(eventHandler.mock.calls[0][0]).toEqual(reminderEvent);
		});

		it('should handle notification.reminder_due event', () => {
			const eventHandler = vi.fn();
			client.on('notification.reminder_due', eventHandler);

			const reminderEvent = {
				type: 'notification.reminder_due',
				reminder: reminderResponse,
			};

			client.dispatchEvent(reminderEvent);

			expect(eventHandler).toHaveBeenCalledTimes(1);
			expect(eventHandler.mock.calls[0][0]).toEqual(reminderEvent);
		});
	});
});
