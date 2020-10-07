import { getTestClient, createUserToken, getTestClientForUser } from './utils';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;
chai.use(chaiAsPromised);

async function testUnreadCount(userId, expectedCount) {
	const client = await getTestClientForUser(userId);
	await client.disconnect(5000);
	expect(client.health.me.unread_count).to.eql(expectedCount);
}

describe('Silent Messages', () => {
	const serverSideClient = getTestClient(true);
	const channelID = uuidv4();
	const systemUser = { id: uuidv4() };
	const otherUser = { id: uuidv4() };
	let otherUserClient;
	let channel;
	let silentMessage;

	before(async () => {
		await serverSideClient.upsertUser(systemUser);
		await serverSideClient.upsertUser(otherUser);
		channel = serverSideClient.channel('messaging', channelID, {
			members: [otherUser.id, systemUser.id],
			created_by: systemUser,
		});
		await channel.create();
		otherUserClient = await getTestClientForUser(otherUser.id);
	});

	it('Regular messages should not be silent', async () => {
		const response = await channel.sendMessage({
			text: 'just a regular message',
			user: otherUser,
		});
		expect(response.message.silent).to.not.be.true;
	});

	it('Add a silent message', async () => {
		const response = await channel.sendMessage({
			text: 'system message',
			user: systemUser,
			silent: true,
		});
		expect(response.message.silent).to.be.true;
		silentMessage = response.message;
	});

	it('message.silent should be true on channel.query()', async () => {
		const chan = otherUserClient.channel('messaging', channelID);
		const response = await chan.query();
		expect(response.messages[0].silent).to.be.false;
		expect(response.messages[1].silent).to.be.true;
	});

	it('silent messages should not increase unread channels or messages counts', async () => {
		await testUnreadCount(otherUser.id, 0);
	});

	it('count unread should handle silent messages', async () => {
		const chan = otherUserClient.channel('messaging', channelID);
		await chan.watch();
		// this is 0 because 1 message is from same user and another is a silent message
		expect(chan.countUnread()).to.eql(0);
	});

	it('message.silent should be true on get message', async () => {
		const response = await serverSideClient.getMessage(silentMessage.id);
		expect(response.message.silent).to.be.true;
	});

	it('updating silent messages should not be supported', async () => {
		const p = serverSideClient.updateMessage(
			{ ...silentMessage, silent: false },
			systemUser.id,
		);
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: UpdateMessage failed with error: "message.silent field cannot be updated"',
		);
	});

	it('deleting a silent message should not decrease unread count', async () => {
		await channel.sendMessage({
			text: 'just a regular message',
			user: systemUser,
		});
		await testUnreadCount(otherUser.id, 1);

		await serverSideClient.deleteMessage(silentMessage.id, true);
		await testUnreadCount(otherUser.id, 1);

		const chan = otherUserClient.channel('messaging', channelID);
		await chan.watch();
		expect(chan.countUnread()).to.eql(1);
	});
});
