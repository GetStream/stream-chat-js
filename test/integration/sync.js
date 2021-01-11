import { getTestClient, createUserToken, getTestClientForUser } from './utils';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { sleep } from '../../src/utils';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Sync endpoint', () => {
	const userID = uuidv4();
	let userClient;
	let serverSideClient;
	const otherUserID = uuidv4();

	before(async () => {
		userClient = await getTestClientForUser(userID);
	});

	it('should not work if called before set user', async () => {
		const client = getTestClient(false);
		const id = uuidv4();
		client.connectUser({ id }, createUserToken(id));
		const p = client.sync();
		await expect(p).to.be.rejected;
	});

	it('should do nothing if there is nothing to do', async () => {
		const p = userClient.sync(['messaging:hello'], new Date());
		await expect(p).to.not.be.rejected;
		const response = await p;
		expect(response.events).to.eql([]);
	});

	it('should validate presence of cids and last_sync_at', async () => {
		let p = userClient.sync([], new Date());
		await expect(p).to.be.rejected;
		p = userClient.sync(['messaging:hello']);
		await expect(p).to.be.rejected;
	});

	let blueChannel;
	let redChannel;
	let greenChannel;
	let messages = [];

	it('connect to red, blue and green channels and put some messages', async () => {
		serverSideClient = getTestClient(true);
		await serverSideClient.upsertUser({ id: otherUserID });
		blueChannel = serverSideClient.channel('messaging', `blue-${uuidv4()}`, {
			created_by_id: otherUserID,
			members: [userID, otherUserID],
		});
		redChannel = serverSideClient.channel('messaging', `red-${uuidv4()}`, {
			created_by_id: otherUserID,
			members: [userID, otherUserID],
		});
		greenChannel = serverSideClient.channel('messaging', `green-${uuidv4()}`, {
			created_by_id: otherUserID,
			members: [userID, otherUserID],
		});
		await blueChannel.create();
		await redChannel.create();
		await greenChannel.create();

		messages = await Promise.all(
			[blueChannel, greenChannel]
				.map((chan) => [
					chan.sendMessage({ text: uuidv4(), user_id: otherUserID }),
					chan.sendMessage({ text: uuidv4(), user_id: userID }),
				])
				.flat(),
		);
	});

	let lastEventAt;

	it('disconnect', async () => {
		await userClient.disconnect(5000);
		lastEventAt = new Date();
	});

	it('remove user from red channel', async () => {
		await redChannel.removeMembers([userID]);
	});

	it('update some data for blue channel', async () => {
		await blueChannel.update({ color: 'blue' });
	});

	const deletedMessages = [];
	let messageWithReaction;

	it('delete some messages', async () => {
		deletedMessages.push(messages[0].message.id);
		deletedMessages.push(messages[2].message.id);
		await serverSideClient.deleteMessage(deletedMessages[0]);
		await serverSideClient.deleteMessage(deletedMessages[1]);
		deletedMessages.sort();
	});

	it('add a message reaction', async () => {
		messageWithReaction = messages[1].message.id;
		await blueChannel.sendReaction(messageWithReaction, { type: 'like' }, userID);
	});

	it('hide the green channel for current user (via backend)', async () => {
		await greenChannel.hide(userID, true);
	});

	let syncReply;

	it('sync should return a response', async () => {
		await userClient.connectUser({ id: userID }, createUserToken(userID));
		syncReply = await userClient.sync(
			[blueChannel.cid, redChannel.cid, greenChannel.cid],
			lastEventAt,
		);
	});

	const eventsByType = {};

	it('group events by type', () => {
		syncReply.events.reduce((acc, e) => {
			acc[e.type] = [...(acc[e.type] || []), e];
			return acc;
		}, eventsByType);
	});

	it('green channel should be marked as hidden', () => {
		expect(eventsByType['channel.hidden']).to.have.length(1);
		const evt = eventsByType['channel.hidden'][0];
		expect(evt.cid).to.eql(greenChannel.cid);
	});

	it('blue channel should be marked as updated', () => {
		const evts = eventsByType['channel.updated'].filter(
			(e) => e.cid === blueChannel.cid,
		);
		expect(evts).to.have.length(1);
		const evt = evts[0];
		expect(evt.channel.created_at).to.not.eql(evt.channel.updated_at);
		expect(evt.channel.color).to.eql('blue');
		expect(evts[0].channel.created_by).to.not.be.null;
	});

	it('should include deleted channels', () => {
		const evts = eventsByType['message.deleted'];
		const deletedMessageIds = evts.map((m) => m.message.id).sort();
		expect(deletedMessageIds).to.eql(deletedMessages);
		expect(evts[0].user).to.not.be.undefined;
		expect(evts[0].message.user).to.not.be.undefined;
	});

	it('messages should include new reactions', () => {
		const evts = eventsByType['message.updated'].filter(
			(e) => e.message.id === messageWithReaction,
		);
		expect(evts).to.have.length(1);
		expect(evts[0].message.latest_reactions).to.have.length(1);
		expect(evts[0].message.reaction_counts).to.eql({ like: 1 });
		expect(evts[0].message.own_reactions.length).to.eql(1);
		expect(evts[0].user).to.not.be.undefined;
		expect(evts[0].message.user).to.not.be.undefined;
	});

	it('create and update a message', async () => {
		const message = { id: uuidv4(), user_id: otherUserID, text: 'some text' };
		const response = await blueChannel.sendMessage(message);
		await sleep(100);
		serverSideClient.updateMessage(message, otherUserID);
		await sleep(100);
		syncReply = await userClient.sync([blueChannel.cid], response.message.created_at);
		expect(syncReply.events).to.have.length(1);
		expect(syncReply.events[0].type).to.eql('message.new');
	});
});
