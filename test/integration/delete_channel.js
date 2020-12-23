import { v4 as uuidv4 } from 'uuid';
import { getTestClientForUser, createUsers, getServerTestClient } from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
const expect = chai.expect;

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

const Promise = require('bluebird');
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

chai.use(chaiAsPromised);

async function setupDeletedChannel() {
	const johnID = `john-${uuidv4()}`;
	const client = await getTestClientForUser(johnID);
	await createUsers(['jack', 'notjack']);
	const channel = client.channel('messaging', uuidv4(), {
		color: 'green',
		members: ['jack', johnID],
	});
	await channel.create();
	const messageResponse = await channel.sendMessage({ text: 'helloworld' });
	const message = messageResponse.message;
	const deleteResponse = await channel.delete();
	return [client, channel, message, deleteResponse];
}

describe('Channels - Truncate', function () {
	it('Truncated messages shouldnt show up', async function () {
		const kerryID = `kerry-${uuidv4()}`;
		const client = await getTestClientForUser(kerryID);
		const c = client.channel('messaging', uuidv4());
		await c.create();
		const messageResponse = await c.sendMessage({ text: 'hi hi, hello' });
		const state = await c.query();
		expect(state.messages.length).to.equal(1);
		const response = await c.truncate();
		const state2 = await c.query();
		expect(state2.messages.length).to.equal(0);
	});
});

describe('Channels - Delete', function () {
	/*

	- Channel Update, Query and Watch all revive the deleted channel

	 */
	it('Basic delete', async function () {
		const [client, channel, message, deleteResponse] = await setupDeletedChannel();
		expect(deleteResponse.channel.cid).to.equal(channel.cid);
		expect(deleteResponse.channel.color).to.be.undefined;
		expect(deleteResponse.channel.created_by).to.be.null;
		expect(deleteResponse.channel.last_message_at).to.be.undefined;
	});

	it('Query channels should not return a deleted channel', async function () {
		const [client, channel, message, deleteResponse] = await setupDeletedChannel();
		const channels = await client.queryChannels({ cid: channel.cid });
		expect(channels.length).to.equal(0);
	});

	it('Updating a message should fail', async function () {
		const [client, channel, message, deleteResponse] = await setupDeletedChannel();
		message.text = 'updated';
		const updatePromise = client.updateMessage(message);
		await expect(updatePromise).to.be.rejectedWith('has been deleted');
	});

	it('Sending a reaction should fail', async function () {
		const [client, channel, message, deleteResponse] = await setupDeletedChannel();
		const addPromise = channel.sendReaction(message.id, { type: 'love' });
		await expect(addPromise).to.be.rejectedWith('has been deleted');
	});

	it('Sending a reply should fail', async function () {
		const [client, channel, message, deleteResponse] = await setupDeletedChannel();
		const replyPromise = channel.sendMessage({
			text: 'test',
			parent_id: message.id,
		});
		await expect(replyPromise).to.be.rejectedWith('find channel');
	});

	it('Basic recovery - querying a channel', async function () {
		const [client, channel, message, deleteResponse] = await setupDeletedChannel();
		const state = await channel.query();

		expect(state.channel.deleted_at).to.be.undefined;
		expect(state.channel.member_count).to.equal(2);
		expect(state.messages.length).to.equal(0);
		expect(state.channel.color).to.equal('green');
		expect(state.channel.created_by.id).to.equal(client.user.id);
	});

	it('Update channel is not allowed to recover', async function () {
		// TODO: not 100% sure about this behaviour...
		const [client, channel, message, deleteResponse] = await setupDeletedChannel();
		const serverClient = getServerTestClient();
		const serverChannel = serverClient.channel(channel.type, channel.id);

		const updatePromise = serverChannel.update(
			{
				color: 'blue',
			},
			{ text: 'Jack changed the channel color to blue', user: { id: 'jack' } },
		);

		await expect(updatePromise).to.be.rejectedWith('find channel');
	});

	it('Recover a deleted channel', async function () {
		const [client, _, oldMessage, deleteResponse] = await setupDeletedChannel();
		const channel = client.channel('messaging', uuidv4(), {
			resource: 'spice',
			members: ['notjack', client.userID],
		});
		// recover the channel...
		// verify that old props didnt come back and old members
		const createResponse = await channel.create();
		expect(createResponse.channel.color).to.be.undefined;
		expect(createResponse.members.length).to.equal(2);
		expect(createResponse.channel.resource).to.equal('spice');

		// verify that the old message is not found
		// verify that the new message is found
		const newMessageResponse = await channel.sendMessage({ text: 'the new message' });
		const newMessage = newMessageResponse.message;
		const state = await channel.watch();
		expect(state.messages.length).to.equal(1);
		expect(state.messages[0].text).to.equal('the new message');

		// verify that for the new message react, reply and update work
		await channel.sendReaction(newMessage.id, { type: 'love' });
		await client.updateMessage(newMessage);
		await channel.sendMessage({
			text: 'test',
			parent_id: newMessage.id,
		});

		// verify that for the old message react, reply and update dont work
		const addPromise = channel.sendReaction(oldMessage.id, { type: 'love' });
		await expect(addPromise).to.be.rejectedWith('has been deleted');
		const updatePromise = client.updateMessage(oldMessage);
		await expect(updatePromise).to.be.rejectedWith('has been deleted');
		const replyPromise = channel.sendMessage({
			text: 'test',
			parent_id: oldMessage.id,
		});
		await expect(replyPromise).to.be.rejectedWith('has been deleted');
	});
});
