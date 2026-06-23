import sinon from 'sinon';
import { StreamChat } from '../../src';
import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from './test-utils/getClient';
import { MockOfflineDB } from './offline-support/MockOfflineDB';
import { describe, afterEach, beforeEach, it, expect, vi } from 'vitest';

describe('Draft Messages', () => {
	let client;
	let channel;
	const apiKey = 'test-api-key';
	const channelType = 'messaging';
	const channelID = 'test-channel';
	const userID = 'test-user';
	const parentID = 'parent-message-id';

	const draftMessage = {
		text: 'Draft message text',
		attachments: [{ type: 'image', url: 'https://example.com/image.jpg' }],
		mentioned_users: ['user1', 'user2'],
	};

	const draftWithParent = {
		text: 'Draft message text',
		attachments: [{ type: 'image', url: 'https://example.com/image.jpg' }],
		mentioned_users: ['user1', 'user2'],
		parent_id: parentID,
	};

	const draftResponse = {
		draft: {
			channel_cid: `${channelType}:${channelID}`,
			created_at: '2023-01-01T00:00:00Z',
			message: {
				id: 'draft-id',
				...draftMessage,
			},
			parent_id: parentID,
		},
	};

	beforeEach(() => {
		client = new StreamChat(apiKey);
		client.user = { id: userID };
		let channelResponse = generateChannel({
			channel: { id: channelID, name: 'Test channel', members: [] },
		}).channel;
		channel = client.channel(channelResponse.type, channelResponse.id);

		// Mock the methods
		sinon.stub(client, 'queryDrafts').resolves(draftResponse);
		sinon.stub(channel, 'createDraft').resolves(draftResponse);
		sinon.stub(channel, 'getDraft').resolves(draftResponse);
		sinon.stub(channel, 'deleteDraft').resolves({ duration: '0.01ms' });
	});

	afterEach(() => {
		sinon.restore();
	});

	it('should create a draft message', async () => {
		const response = await channel.createDraft(draftMessage);

		expect(channel.createDraft.calledOnce).to.be.true;
		expect(channel.createDraft.firstCall.args[0]).to.deep.equal(draftMessage);
		expect(response).to.deep.equal(draftResponse);
	});

	it('should create a draft message with parent ID', async () => {
		const response = await channel.createDraft(draftWithParent);

		expect(channel.createDraft.calledOnce).to.be.true;
		expect(channel.createDraft.firstCall.args[0]).to.deep.equal(draftWithParent);
		expect(response).to.deep.equal(draftResponse);
	});

	it('should get a draft message', async () => {
		const response = await channel.getDraft(parentID);

		expect(channel.getDraft.calledOnce).to.be.true;
		expect(channel.getDraft.firstCall.args[0]).to.deep.equal(parentID);
		expect(response).to.deep.equal(draftResponse);
	});

	it('should get a draft message with parent ID', async () => {
		const response = await channel.getDraft(parentID);

		expect(channel.getDraft.calledOnce).to.be.true;
		expect(channel.getDraft.firstCall.args[0]).to.deep.equal(parentID);
		expect(response).to.deep.equal(draftResponse);
	});

	it('should delete a draft message', async () => {
		await channel.deleteDraft();

		expect(channel.deleteDraft.calledOnce).to.be.true;
		expect(channel.deleteDraft.firstCall.args[0]).to.be.undefined;
	});

	it('should delete a draft message with parent ID', async () => {
		await channel.deleteDraft(parentID);

		expect(channel.deleteDraft.calledOnce).to.be.true;
		expect(channel.deleteDraft.firstCall.args[0]).to.deep.equal(parentID);
	});

	it('should query drafts', async () => {
		const queryOptions = {
			filter: { created_at: { $gt: '2023-01-01T00:00:00Z' } },
			limit: 10,
		};

		const queryResponse = {
			drafts: [
				draftResponse.draft,
				{ ...draftResponse.draft, channel_cid: 'messaging:other-channel' },
			],
			next: 'next-page-token',
		};
		client.queryDrafts.resolves(queryResponse);

		const response = await client.queryDrafts(queryOptions);

		expect(client.queryDrafts.calledOnce).to.be.true;
		expect(client.queryDrafts.firstCall.args[0]).to.deep.equal(queryOptions);
		expect(response).to.deep.equal(queryResponse);
	});

	it('should query drafts with default options', async () => {
		const queryResponse = {
			drafts: [draftResponse.draft],
		};
		client.queryDrafts.resolves(queryResponse);

		const response = await client.queryDrafts();
		expect(client.queryDrafts.calledOnce).to.be.true;
		expect(client.queryDrafts.firstCall.args[0]).to.be.undefined;
		expect(response).to.deep.equal(queryResponse);
	});
});

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
	let requestSpy;

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
		requestSpy = vi
			.spyOn(client.axiosInstance, 'request')
			.mockResolvedValue({ data: { draft: draftMessage } });
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

	describe('_createDraft', () => {
		it('calls post with correct URL and message payload', async () => {
			await channel._createDraft({ message: draftMessage });

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'POST',
				url: `${client.baseURL}/api/v2/chat/channels/messaging/test/draft`,
				data: { message: draftMessage },
			});
		});

		it('returns the response from post', async () => {
			requestSpy.mockResolvedValue({ data: { draft: draftMessage } });

			const result = await channel._createDraft({ message: draftMessage });

			expect(result).toMatchObject({ draft: draftMessage });
		});
	});
});

describe('delete draft flow', () => {
	const parent_id = 'thread-456';

	let client;
	let channel;
	let loggerSpy;
	let queueTaskSpy;
	let requestSpy;

	beforeEach(async () => {
		client = await getClientWithUser();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		channel = client.channel('messaging', 'test');

		loggerSpy = vi.spyOn(client, 'logger').mockImplementation(vi.fn());
		queueTaskSpy = vi.spyOn(client.offlineDb, 'queueTask').mockResolvedValue({});
		requestSpy = vi
			.spyOn(client.axiosInstance, 'request')
			.mockResolvedValue({ data: {} });
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

	describe('_deleteDraft', () => {
		it('calls delete with correct URL and params', async () => {
			await channel._deleteDraft({ parent_id });

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'DELETE',
				url: `${client.baseURL}/api/v2/chat/channels/messaging/test/draft`,
				params: { parent_id },
			});
		});

		it('calls delete with undefined parent_id if none provided', async () => {
			await channel._deleteDraft();

			expect(requestSpy).toHaveBeenCalledTimes(1);
			expect(requestSpy.mock.calls[0][0]).toMatchObject({
				method: 'DELETE',
				url: `${client.baseURL}/api/v2/chat/channels/messaging/test/draft`,
			});
			expect(requestSpy.mock.calls[0][0].params.parent_id).toBeUndefined();
		});

		it('returns the response from delete', async () => {
			requestSpy.mockResolvedValue({ data: { success: true } });

			const result = await channel._deleteDraft({ parent_id });

			expect(result).toMatchObject({ success: true });
		});
	});
});
