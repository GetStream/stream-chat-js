import { getTestClient, createUserToken, getTestClientForUser } from './utils';
import uuidv4 from 'uuid/v4';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

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
		client.setUser({ id }, createUserToken(id));
		const p = client.sync();
		await expect(p).to.be.rejected;
	});

	it('should do nothing if there is nothing to do', async () => {
		const p = userClient.sync(['messaging:hello'], new Date());
		await expect(p).to.not.be.rejected;
		const response = await p;
		expect(response.channels).to.eql({});
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
		await serverSideClient.updateUser({ id: otherUserID });
		blueChannel = serverSideClient.channel('messaging', uuidv4(), {
			created_by_id: otherUserID,
			members: [userID, otherUserID],
		});
		redChannel = serverSideClient.channel('messaging', uuidv4(), {
			created_by_id: otherUserID,
			members: [userID, otherUserID],
		});
		greenChannel = serverSideClient.channel('messaging', uuidv4(), {
			created_by_id: otherUserID,
			members: [userID, otherUserID],
		});
		await blueChannel.create();
		await redChannel.create();
		await greenChannel.create();

		messages = await Promise.all(
			[blueChannel, greenChannel]
				.map(chan => [
					chan.sendMessage({ text: uuidv4(), user_id: otherUserID }),
					chan.sendMessage({ text: uuidv4(), user_id: userID }),
				])
				.flat(),
		);
	});

	let lastEventAt;

	it('disconnect', async () => {
		await userClient.disconnect();
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
		await blueChannel.sendReaction(
			messageWithReaction,
			{ type: 'like' },
			otherUserID,
		);
	});

	it('hide the green channel for current user (via backend)', async () => {
		await greenChannel.hide(userID, true);
	});

	let syncReply;

	it('sync should return a response', async () => {
		await userClient.setUser({ id: userID }, createUserToken(userID));
		syncReply = await userClient.sync(
			[blueChannel.cid, redChannel.cid, greenChannel.cid],
			lastEventAt,
		);
	});

	describe('check sync response data', () => {
		it('red channel should be marked as removed', () => {
			expect(syncReply.channels[blueChannel.cid].removed).to.eql(false);
			expect(syncReply.channels[redChannel.cid].removed).to.eql(true);
			expect(syncReply.channels[greenChannel.cid].removed).to.eql(false);
		});

		it('blue channel should be marked as updated', () => {
			const chan = syncReply.channels[blueChannel.cid].channel;
			expect(chan.created_at).to.not.eql(chan.updated_at);
			expect(chan.color).to.eql('blue');
		});

		it('green channel should be marked as hidden', () => {
			const chan = syncReply.channels[greenChannel.cid].channel;
			expect(chan.hidden).to.be.true;
			expect(chan.hide_messages_before).to.not.be.undefined;
		});

		it('should include deleted channels', () => {
			const msgs = syncReply.channels[greenChannel.cid].messages.concat(
				syncReply.channels[blueChannel.cid].messages,
			);
			const deletedMessages = msgs
				.filter(m => m.deleted_at != null)
				.map(m => m.id)
				.sort();
			expect(deletedMessages).to.eql(deletedMessages);
		});

		it('messages should include new reactions', () => {
			const msgs = syncReply.channels[blueChannel.cid].messages.filter(
				m => m.id === messageWithReaction,
			);
			expect(msgs).to.have.length(1);
			expect(msgs[0].latest_reactions).to.have.length(1);
			expect(msgs[0].reaction_counts).to.eql({ like: 1 });
		});
	});
});
