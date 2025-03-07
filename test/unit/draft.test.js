import { expect } from 'chai';
import sinon from 'sinon';
import { StreamChat } from '../../src';
import { generateChannel } from './test-utils/generateChannel';
import { v4 as uuidv4 } from 'uuid';

describe.only('Draft Messages', () => {
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
		client.userID = userID;
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
			drafts: [draftResponse.draft, { ...draftResponse.draft, channel_cid: 'messaging:other-channel' }],
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
