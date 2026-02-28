import { StreamChat } from '../../../src';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
		client = new StreamChat('api_key');
		client.user = user1;
		client.userID = user1.id;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('createReminder', () => {
		it('should create a reminder successfully', async () => {
			const postSpy = vi.spyOn(client, 'post').mockResolvedValueOnce(reminderResponse);

			const result = await client.createReminder({
				messageId: 'message123',
				remind_at: '2025-04-12T23:20:50.52Z',
			});

			expect(postSpy).toHaveBeenCalledTimes(1);
			expect(postSpy.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/message123/reminders`,
			);
			expect(postSpy.mock.calls[0][1]).toEqual({
				remind_at: '2025-04-12T23:20:50.52Z',
			});
			expect(result).toEqual(reminderResponse);
		});

		it('should create a reminder without remind_at', async () => {
			const postSpy = vi.spyOn(client, 'post').mockResolvedValueOnce(reminderResponse);

			await client.createReminder({ messageId: 'message123' });

			expect(postSpy).toHaveBeenCalledTimes(1);
			expect(postSpy.mock.calls[0][1]).toEqual({});
		});

		it('should create a reminder with null remind_at', async () => {
			const reminderWithNullDate = {
				...reminderResponse,
				remind_at: null,
			};
			const postSpy = vi
				.spyOn(client, 'post')
				.mockResolvedValueOnce(reminderWithNullDate);

			const result = await client.createReminder({
				messageId: 'message123',
				remind_at: null,
			});

			expect(postSpy).toHaveBeenCalledTimes(1);
			expect(postSpy.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/message123/reminders`,
			);
			expect(postSpy.mock.calls[0][1]).toEqual({
				remind_at: null,
			});
			expect(result).toEqual(reminderWithNullDate);
		});

		it('should create a reminder with undefined remind_at', async () => {
			const reminderWithoutDate = {
				...reminderResponse,
				remind_at: undefined,
			};
			const postSpy = vi.spyOn(client, 'post').mockResolvedValueOnce(reminderWithoutDate);

			const result = await client.createReminder({
				messageId: 'message123',
				remind_at: undefined,
			});

			expect(postSpy).toHaveBeenCalledTimes(1);
			expect(postSpy.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/message123/reminders`,
			);
			expect(postSpy.mock.calls[0][1]).toEqual({
				remind_at: undefined,
			});
			expect(result).toEqual(reminderWithoutDate);
		});
	});

	describe('updateReminder', () => {
		it('should update a reminder successfully', async () => {
			const updatedReminder = {
				...reminderResponse,
				remind_at: '2025-05-12T23:20:50.52Z',
			};
			const patchStub = vi.spyOn(client, 'patch').mockResolvedValueOnce(updatedReminder);

			const result = await client.updateReminder({
				messageId: 'message123',
				remind_at: '2025-05-12T23:20:50.52Z',
			});

			expect(patchStub).toHaveBeenCalledTimes(1);
			expect(patchStub.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/message123/reminders`,
			);
			expect(patchStub.mock.calls[0][1]).toEqual({
				remind_at: '2025-05-12T23:20:50.52Z',
			});
			expect(result).toEqual(updatedReminder);
		});

		it('should update a reminder to remove remind_at', async () => {
			const updatedReminder = {
				...reminderResponse,
				remind_at: null,
			};
			const patchStub = vi.spyOn(client, 'patch').mockResolvedValueOnce(updatedReminder);

			const result = await client.updateReminder({
				messageId: 'message123',
				remind_at: null,
			});

			expect(patchStub).toHaveBeenCalledTimes(1);
			expect(patchStub.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/message123/reminders`,
			);
			expect(patchStub.mock.calls[0][1]).toEqual({
				remind_at: null,
			});
			expect(result).toEqual(updatedReminder);
		});

		it('should update a reminder with undefined remind_at', async () => {
			const updatedReminder = {
				...reminderResponse,
				remind_at: undefined,
			};
			const patchStub = vi.spyOn(client, 'patch').mockResolvedValueOnce(updatedReminder);

			const result = await client.updateReminder({
				messageId: 'message123',
				remind_at: undefined,
			});

			expect(patchStub).toHaveBeenCalledTimes(1);
			expect(patchStub.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/message123/reminders`,
			);
			expect(patchStub.mock.calls[0][1]).toEqual({
				remind_at: undefined,
			});
			expect(result).toEqual(updatedReminder);
		});
	});

	describe('deleteReminder', () => {
		it('should delete a reminder successfully', async () => {
			const deleteStub = vi.spyOn(client, 'delete').mockResolvedValueOnce({});

			await client.deleteReminder('message123');

			expect(deleteStub).toHaveBeenCalledTimes(1);
			expect(deleteStub.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/message123/reminders`,
			);
			expect(deleteStub.mock.calls[0][1]).toEqual({});
		});

		it('should delete a reminder with user_id', async () => {
			const deleteStub = vi.spyOn(client, 'delete').mockResolvedValueOnce({});

			await client.deleteReminder('message123', 'user1');

			expect(deleteStub).toHaveBeenCalledTimes(1);
			expect(deleteStub.mock.calls[0][1]).toEqual({ user_id: 'user1' });
		});
	});

	describe('queryReminders', () => {
		it('should query reminders successfully', async () => {
			const queryResponse = {
				reminders: [reminderResponse],
				next: 'next_page_token',
			};
			const postSpy = vi.spyOn(client, 'post').mockResolvedValueOnce(queryResponse);

			const result = await client.queryReminders({
				filter_conditions: {
					channel_cid: 'messaging:123',
					remind_at: { $gt: '2024-01-01T00:00:00.000Z' },
				},
				sort: [{ remind_at: 1 }],
				limit: 10,
			});

			expect(postSpy).toHaveBeenCalledTimes(1);
			expect(postSpy.mock.calls[0][0]).toBe(`${client.baseURL}/reminders/query`);
			expect(postSpy.mock.calls[0][1]).toEqual({
				filter_conditions: {
					channel_cid: 'messaging:123',
					remind_at: { $gt: '2024-01-01T00:00:00.000Z' },
				},
				sort: [{ field: 'remind_at', direction: 1, type: null }],
				limit: 10,
			});
			expect(result).toEqual(queryResponse);
		});

		it('should query reminders with empty options', async () => {
			const queryResponse = { reminders: [] };
			const postSpy = vi.spyOn(client, 'post').mockResolvedValueOnce(queryResponse);

			const result = await client.queryReminders();

			expect(postSpy).toHaveBeenCalledTimes(1);
			expect(postSpy.mock.calls[0][1]).toEqual({});
			expect(result).toEqual(queryResponse);
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

	describe('reminder feature flag in channel config', () => {
		let channelType;
		let channel;
		let message;

		beforeEach(async () => {
			// Create a unique channel type name
			channelType = 'reminders-test-' + Math.random().toString(36).substring(2, 10);

			// Create a new channel type
			vi.spyOn(client, 'createChannelType').mockResolvedValueOnce({
				name: channelType,
				user_message_reminders: false, // Initially disabled
			});

			await client.createChannelType({
				name: channelType,
				user_message_reminders: false,
			});

			// Create a channel with this type
			channel = client.channel(channelType, 'test-channel');

			// Mock the channel.create method
			vi.spyOn(channel, 'create').mockResolvedValueOnce({
				channel: {
					id: 'test-channel',
					type: channelType,
					cid: `${channelType}:test-channel`,
					config: {
						user_message_reminders: false, // Feature flag disabled
					},
				},
			});

			await channel.create();

			// Mock the client.configs to return the channel config
			client.configs = {
				[`${channelType}:test-channel`]: {
					user_message_reminders: false, // Feature flag disabled
				},
			};

			// Create a test message
			message = {
				id: 'test-message',
				text: 'Hello, world!',
				user: user1,
			};
		});

		it('should fail to create a reminder when user_message_reminders is disabled', async () => {
			// Mock the post method to simulate an error response
			const postSpy = vi.spyOn(client, 'post').mockRejectedValueOnce({
				code: 403,
				message: 'User message reminders are not enabled for this channel',
				status: 403,
			});

			try {
				await client.createReminder({
					messageId: 'test-message',
					remind_at: '2025-04-12T23:20:50.52Z',
				});
				// If we reach here, the test should fail
				expect.fail('Expected createReminder to throw an error');
			} catch (error) {
				expect(error.code).toBe(403);
				expect(error.message).toBe(
					'User message reminders are not enabled for this channel',
				);
			}

			expect(postSpy).toHaveBeenCalledTimes(1);
			expect(postSpy.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/test-message/reminders`,
			);
		});

		it('should successfully create a reminder after enabling user_message_reminders', async () => {
			// Update the channel type to enable user_message_reminders
			vi.spyOn(client, 'updateChannelType').mockResolvedValueOnce({
				name: channelType,
				user_message_reminders: true, // Now enabled
			});

			await client.updateChannelType(channelType, {
				user_message_reminders: true,
			});

			// Update the client.configs to reflect the updated channel config
			client.configs = {
				[`${channelType}:test-channel`]: {
					user_message_reminders: true, // Feature flag enabled
				},
			};

			// Mock the post method to simulate a successful response
			const postSpy = vi.spyOn(client, 'post').mockResolvedValueOnce({
				...reminderResponse,
				message_id: 'test-message',
			});

			const result = await client.createReminder({
				messageId: 'test-message',
				remind_at: '2025-04-12T23:20:50.52Z',
			});

			expect(postSpy).toHaveBeenCalledTimes(1);
			expect(postSpy.mock.calls[0][0]).toBe(
				`${client.baseURL}/messages/test-message/reminders`,
			);
			expect(postSpy.mock.calls[0][1]).toEqual({
				remind_at: '2025-04-12T23:20:50.52Z',
			});
			expect(result.message_id).toBe('test-message');
		});
	});
});
