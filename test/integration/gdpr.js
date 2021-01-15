import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { getTestClientForUser, getServerTestClient, expectHTTPErrorCode } from './utils';
import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;

chai.use(chaiAsPromised);

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

describe('GDPR endpoints', function () {
	const serverClient = getServerTestClient();

	it('export data for a user', async function () {
		// setup a message and a reaction
		const userID = uuidv4();
		const creatorID = uuidv4();
		const channelID = uuidv4();
		const user = await serverClient.upsertUser({ id: userID, name: 'hello' });
		const channel = serverClient.channel('livestream', channelID, {
			created_by: { id: creatorID },
		});
		await channel.create();
		const messageResponse = await channel.sendMessage({
			text: 'hi',
			user: { id: userID },
		});
		const reactionResponse = await channel.sendReaction(messageResponse.message.id, {
			type: 'haha',
			user: { id: userID },
		});

		// this should not be allowed client side...
		const client = await getTestClientForUser(userID);
		const exportPromise = client.exportUser(userID);
		await expect(exportPromise).to.be.rejectedWith(
			'users can only be exported server side',
		);

		// server side is allowed
		const exportResponse = await serverClient.exportUser(userID);
		expect(exportResponse.user.id).to.equal(userID);
		expect(exportResponse.messages.length).to.equal(1);
		expect(exportResponse.messages[0].id).to.equal(messageResponse.message.id);
		expect(exportResponse.reactions.length).to.equal(1);
	});

	describe('deactivate user', function () {
		it('cannot update deactivated user', async function () {
			// setup
			const userID = uuidv4();

			await serverClient.upsertUser({ id: userID, name: 'hello' });

			const { user } = await serverClient.deactivateUser(userID);
			expect(user.id).to.equal(userID);
			expect(user.deactivated_at).to.not.be.undefined;

			const p = serverClient.upsertUser({ id: userID, name: 'new name' });

			await expect(p).to.be.rejectedWith('was deactivated');
		});

		it('deactivate a user', async function () {
			// setup
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.upsertUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			const messageResponse = await channel.sendMessage({
				text: 'hi',
				user: { id: userID },
			});

			// delete the user
			const response = await serverClient.deactivateUser(userID);
			expect(response.user.id).to.equal(userID);
			expect(response.user.deactivated_at).to.not.be.undefined;
			// 1. verify the user can't connect
			const connectPromise = getTestClientForUser(userID);
			await expect(connectPromise).to.be.rejectedWith('was deactivated');

			// 2. verify the user can't send messages either
			const messageResponsePromise = channel.sendMessage({
				text: 'no dice',
				user: { id: userID },
			});
			await expect(messageResponsePromise).to.be.rejectedWith('was deactivated');

			// 3. verify the message is not deleted
			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();
			expect(state.messages[0].id).to.equal(messageResponse.message.id);
			expect(state.messages[0].deleted_at).to.equal(undefined);
		});

		it('deactivate a user and remove their messages', async function () {
			// setup
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.upsertUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			const messageResponse = await channel.sendMessage({
				text: 'hi',
				user: { id: userID },
			});

			// delete the user
			const response = await serverClient.deactivateUser(userID, {
				mark_messages_deleted: true,
			});
			expect(response.user.id).to.equal(userID);
			expect(response.user.deactivated_at).to.not.be.undefined;
			// 1. verify the user can't connect
			const connectPromise = getTestClientForUser(userID);
			await expect(connectPromise).to.be.rejectedWith('was deactivated');

			// 2. verify the user can't send messages either
			const messageResponsePromise = channel.sendMessage({
				text: 'no dice',
				user: { id: userID },
			});
			await expect(messageResponsePromise).to.be.rejectedWith('was deactivated');

			// 3. verify the message is deleted
			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();
			expect(state.messages.length).to.equal(1);
			expect(state.messages[0].deleted_at).to.not.be.undefined;
			expect(state.messages[0].type).to.be.equal('deleted');
			expect(state.messages[0].text).to.equal('hi');
		});
	});

	describe('reactivate user', function () {
		it('cannot reactivate active user', async function () {
			const userID = uuidv4();
			await serverClient.upsertUser({ id: userID, name: 'hello' });

			const p = serverClient.reactivateUser(userID);

			await expect(p).to.be.rejectedWith('is not deactivated');
		});

		it('reactivate user without restoring messages', async function () {
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			await serverClient.upsertUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			await channel.sendMessage({
				text: 'hi',
				user: { id: userID },
			});

			await serverClient.deactivateUser(userID, {
				mark_messages_deleted: true,
			});

			const { user } = await serverClient.reactivateUser(userID);
			expect(user.deactivated_at).to.be.undefined;

			// user can do stuff again
			const { message } = await channel.sendMessage({
				text: 'I HAVE RISEN!!!',
				user: { id: userID },
			});

			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();
			expect(state.messages).to.be.lengthOf(2);
			expect(state.messages[0].deleted_at).to.not.be.undefined;
			expect(state.messages[0].type).to.be.equal('deleted');
			expect(state.messages[1].id).to.be.equal(message.id);
			expect(state.messages[1].deleted_at).to.be.undefined;
		});

		it('reactivate user and restore messages', async function () {
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			await serverClient.upsertUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			await channel.sendMessage({
				text: 'hi',
				user: { id: userID },
			});

			await serverClient.deactivateUser(userID, {
				mark_messages_deleted: true,
			});

			const { user } = await serverClient.reactivateUser(userID, {
				restore_messages: true,
			});
			expect(user.deactivated_at).to.be.undefined;

			// user can do stuff again
			const { message } = await channel.sendMessage({
				text: 'I HAVE RISEN!!!',
				user: { id: userID },
			});

			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();
			expect(state.messages).to.be.lengthOf(2);
			expect(state.messages[0].deleted_at).to.be.undefined;
			expect(state.messages[1].id).to.equal(message.id);
			expect(state.messages[1].deleted_at).to.be.undefined;
		});

		it('hard delete a message with replies on the channel', async function () {
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();

			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});

			await channel.create();

			const response = await channel.sendMessage({
				text: 'message1',
				user: { id: userID },
			});

			// add a reply to the message but show it on the channel (show_in_channel)
			await channel.sendMessage({
				text: 'reply to the top man',
				parent_id: response.message.id,
				show_in_channel: true,
				user: { id: userID },
			});

			// delete the parent message
			await serverClient.deleteMessage(response.message.id, true);

			// reply should be gone as well
			const channelResponse = await serverClient
				.channel('livestream', channelID, {
					created_by: { id: creatorID },
				})
				.query();

			expect(channelResponse.messages).to.have.length(0);
		});

		it('deleted messages do not get restored', async function () {
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			await serverClient.upsertUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			await channel.sendMessage({
				text: 'message1',
				user: { id: userID },
			});

			const resp = await channel.sendMessage({
				text: 'TO BE DELETED',
				user: { id: userID },
			});

			const deletedID = resp.message.id;

			await serverClient.deleteMessage(deletedID);

			await serverClient.deactivateUser(userID, {
				mark_messages_deleted: true,
			});

			const { user } = await serverClient.reactivateUser(userID, {
				restore_messages: true,
			});
			expect(user.deactivated_at).to.be.undefined;

			// user can do stuff again
			const { message } = await channel.sendMessage({
				text: 'I HAVE RISEN!!!',
				user: { id: userID },
			});

			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();

			expect(state.messages).to.be.lengthOf(3);
			expect(state.messages[0].deleted_at).to.be.undefined;
			//this one remains deleted
			expect(state.messages[1].id).to.equal(deletedID);
			expect(state.messages[1].deleted_at).to.not.be.undefined;
			expect(state.messages[1].type).to.be.equal('deleted');

			expect(state.messages[2].id).to.equal(message.id);
			expect(state.messages[2].deleted_at).to.be.undefined;
		});
	});

	describe('delete user', function () {
		it('cannot update deleted user', async function () {
			// setup
			const userID = uuidv4();

			await serverClient.upsertUser({ id: userID, name: 'hello' });

			const { user } = await serverClient.deleteUser(userID);
			expect(user.id).to.equal(userID);
			expect(user.deleted_at).to.not.be.undefined;

			const p = serverClient.upsertUser({ id: userID, name: 'new name' });

			await expect(p).to.be.rejectedWith('was deleted');
		});

		it('delete a user', async function () {
			// setup
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.upsertUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			const messageResponse = await channel.sendMessage({
				text: 'hi',
				user: { id: userID },
			});

			// delete the user
			const response = await serverClient.deleteUser(userID, {
				mark_messages_deleted: false,
			});
			expect(response.user.id).to.equal(userID);
			expect(response.user.deleted_at).to.not.be.undefined;
			// 1. verify the user can't connect
			const connectPromise = getTestClientForUser(userID);
			await expect(connectPromise).to.be.rejectedWith('was deleted');

			// 2. verify the user can't send messages either
			const messageResponsePromise = channel.sendMessage({
				text: 'no dice',
				user: { id: userID },
			});
			await expect(messageResponsePromise).to.be.rejectedWith('was deleted');

			// 3. verify the message is not deleted
			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();
			expect(state.messages[0].id).to.equal(messageResponse.message.id);
			expect(state.messages[0].deleted_at).to.equal(undefined);
		});

		it('delete a user and their message', async function () {
			// setup
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.upsertUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			const messageResponse = await channel.sendMessage({
				text: 'hi',
				user: { id: userID },
			});

			// delete the user
			const response = await serverClient.deleteUser(userID, {
				mark_messages_deleted: true,
			});
			expect(response.user.id).to.equal(userID);
			expect(response.user.deleted_at).to.not.be.undefined;
			// 1. verify the user can't connect
			const connectPromise = getTestClientForUser(userID);
			await expect(connectPromise).to.be.rejectedWith('was deleted');

			// 2. verify the user can't send messages either
			const messageResponsePromise = channel.sendMessage({
				text: 'no dice',
				user: { id: userID },
			});
			await expect(messageResponsePromise).to.be.rejectedWith('was deleted');

			// 3. verify the message is deleted
			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();
			expect(state.messages.length).to.equal(1);
			expect(state.messages[0].deleted_at).to.not.be.undefined;
			expect(state.messages[0].type).to.be.equal('deleted');
			expect(state.messages[0].text).to.equal('hi');
		});

		it('hard delete with delete_conversation_channels', async function () {
			const userID = uuidv4();
			const userID2 = uuidv4();
			const userID3 = uuidv4();

			await serverClient.upsertUser({ id: userID, name: 'hello' });
			await serverClient.upsertUser({ id: userID2 });
			await serverClient.upsertUser({ id: userID3 });

			const chan1 = serverClient.channel('messaging', {
				members: [userID, userID2],
				created_by: { id: userID },
			});
			await chan1.create();

			await chan1.sendMessage({
				text: 'yo',
				user: { id: userID },
			});

			const chan2 = serverClient.channel('messaging', {
				members: [userID, userID3],
				created_by: { id: userID },
			});
			await chan2.create();

			await chan2.sendMessage({
				text: 'yo',
				user: { id: userID },
			});

			const chan3 = serverClient.channel('messaging', {
				members: [userID, userID2, userID3],
				created_by: { id: userID },
			});
			await chan3.create();

			await chan3.sendMessage({
				text: 'yo',
				user: { id: userID },
			});

			const chan4 = serverClient.channel('messaging', uuidv4(), {
				members: [userID, userID3],
				created_by: { id: userID },
			});
			await chan4.create();

			let userID2Client = await getTestClientForUser(userID2);
			expect(userID2Client.health.me.unread_count).to.eq(2);

			// delete the user
			await serverClient.deleteUser(userID, {
				hard_delete: true,
				delete_conversation_channels: true,
			});

			userID2Client = await getTestClientForUser(userID2);
			expect(userID2Client.health.me.unread_count).to.eq(1);

			const channels = await serverClient.queryChannels({
				cid: { $in: [chan1.cid, chan2.cid, chan3.cid, chan4.cid] },
			});

			expect(channels).to.have.length(1);
			expect(channels[0].cid).to.eq(chan3.cid);

			await expectHTTPErrorCode(400, chan1.query());
		});

		it('hard delete a user, their message and reactions', async function () {
			// setup
			const userID = uuidv4();
			const userID2 = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.upsertUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			const messageResponse2 = await channel.sendMessage({
				text: 'thats funny',
				user: { id: userID2 },
			});
			const reactionResponse = await channel.sendReaction(
				messageResponse2.message.id,
				{
					type: 'haha',
					user: { id: userID },
				},
			);
			const messageResponse = await channel.sendMessage({
				text: 'indeed',
				user: { id: userID },
			});

			// delete the user
			const response = await serverClient.deleteUser(userID, {
				mark_messages_deleted: true,
				hard_delete: true,
			});
			expect(response.user.id).to.equal(userID);
			expect(response.user.deleted_at).to.not.be.undefined;
			// 1. verify the user can't connect
			const connectPromise = getTestClientForUser(userID);
			await expect(connectPromise).to.be.rejectedWith('was deleted');

			// 2. verify the user can't send messages either
			const messageResponsePromise = channel.sendMessage({
				text: 'no dice',
				user: { id: userID },
			});
			await expect(messageResponsePromise).to.be.rejectedWith('was deleted');

			// 3. verify the message is deleted
			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();

			const otherMessage = state.messages[0];
			const deletedMessage = state.messages[1];
			// validate the reaction is gone
			expect(otherMessage.text).to.equal('thats funny');
			expect(state.messages.length).to.equal(2);
			expect(otherMessage.reaction_counts).to.deep.equal({});
			expect(otherMessage.latest_reactions.length).to.equal(0);
			expect(otherMessage.own_reactions.length).to.equal(0);

			// verify that the message is marked as deleted and the content is removed..
			expect(deletedMessage.deleted_at).to.not.be.undefined;
			expect(deletedMessage.type).to.be.equal('deleted');
			expect(deletedMessage.text).to.equal('');
		});
	});
});
