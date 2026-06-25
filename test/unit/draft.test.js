import { getClientWithUser } from './test-utils/getClient';
import { MockOfflineDB } from './offline-support/MockOfflineDB';
import { describe, afterEach, beforeEach, it, expect, vi } from 'vitest';

describe('create draft flow', () => {
	const draftMessage = {
		id: 'msg-123',
		parent_id: 'thread-789',
		text: 'hello world',
	};

	let client;
	let channel;
	let loggerSpy;
	let queueTaskSpy;

	beforeEach(async () => {
		client = await getClientWithUser();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		channel = client.channel('messaging', 'test');

		loggerSpy = vi.spyOn(client, 'logger').mockImplementation(vi.fn());
		queueTaskSpy = vi
			.spyOn(client.offlineDb, 'queueTask')
			.mockResolvedValue({ draft: draftMessage });
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('createDraft', () => {
		beforeEach(() => {
			vi.spyOn(channel, '_createDraft').mockResolvedValue({ draft: draftMessage });
		});

		it('queues task if offlineDb exists', async () => {
			await channel.createDraft({ message: draftMessage });

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);

			const taskArg = queueTaskSpy.mock.calls[0][0];
			expect(taskArg).to.deep.equal({
				task: {
					channelId: 'test',
					channelType: 'messaging',
					threadId: draftMessage.parent_id,
					payload: [{ message: draftMessage }],
					type: 'create-draft',
				},
			});

			expect(channel._createDraft).not.toHaveBeenCalled();
		});

		it('falls back to _createDraft if offlineDb throws', async () => {
			client.offlineDb.queueTask.mockRejectedValue(new Error('Offline failure'));

			await channel.createDraft({ message: draftMessage });

			expect(loggerSpy).toHaveBeenCalledTimes(1);
			expect(channel._createDraft).toHaveBeenCalledTimes(1);
			expect(channel._createDraft).toHaveBeenCalledWith({ message: draftMessage });
		});

		it('falls back to _createDraft if offlineDb is undefined', async () => {
			client.offlineDb = undefined;

			await channel.createDraft({ message: draftMessage });

			expect(channel._createDraft).toHaveBeenCalledTimes(1);
			expect(channel._createDraft).toHaveBeenCalledWith({ message: draftMessage });
		});
	});
});

describe('delete draft flow', () => {
	const parent_id = 'thread-456';

	let client;
	let channel;
	let loggerSpy;
	let queueTaskSpy;

	beforeEach(async () => {
		client = await getClientWithUser();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		channel = client.channel('messaging', 'test');

		loggerSpy = vi.spyOn(client, 'logger').mockImplementation(vi.fn());
		queueTaskSpy = vi.spyOn(client.offlineDb, 'queueTask').mockResolvedValue({});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('deleteDraft', () => {
		beforeEach(() => {
			vi.spyOn(channel, '_deleteDraft').mockResolvedValue({});
		});

		it('queues task if offlineDb exists', async () => {
			await channel.deleteDraft({ parent_id });

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);

			const taskArg = queueTaskSpy.mock.calls[0][0];
			expect(taskArg).to.deep.equal({
				task: {
					channelId: 'test',
					channelType: 'messaging',
					threadId: parent_id,
					payload: [{ parent_id }],
					type: 'delete-draft',
				},
			});

			expect(channel._deleteDraft).not.toHaveBeenCalled();
		});

		it('falls back to _deleteDraft if offlineDb throws', async () => {
			client.offlineDb.queueTask.mockRejectedValue(new Error('Offline failure'));

			await channel.deleteDraft({ parent_id });

			expect(loggerSpy).toHaveBeenCalledTimes(1);
			expect(channel._deleteDraft).toHaveBeenCalledTimes(1);
			expect(channel._deleteDraft).toHaveBeenCalledWith({ parent_id });
		});

		it('falls back to _deleteDraft if offlineDb is undefined', async () => {
			client.offlineDb = undefined;

			await channel.deleteDraft({ parent_id });

			expect(channel._deleteDraft).toHaveBeenCalledTimes(1);
			expect(channel._deleteDraft).toHaveBeenCalledWith({ parent_id });
		});
	});
});
