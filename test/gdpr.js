/* eslint no-unused-vars: "off" */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Immutable from 'seamless-immutable';
import { StreamChat } from '../src';
import fs from 'fs';
import {
	createUserToken,
	getTestClient,
	getTestClientForUser,
	getTestClientForUser2,
	getServerTestClient,
	createUsers,
	runAndLogPromise,
	sleep,
} from './utils';
import uuidv4 from 'uuid/v4';

const expect = chai.expect;

chai.use(chaiAsPromised);

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

Promise = require('bluebird'); // eslint-disable-line no-global-assign
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

describe('GDPR endpoints', function() {
	const serverClient = getServerTestClient();

	it('export data for a user', async function() {
		// setup a message and a reaction
		const userID = uuidv4();
		const creatorID = uuidv4();
		const channelID = uuidv4();
		const user = await serverClient.updateUser({ id: userID, name: 'hello' });
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

	describe('deactivate user', function() {
		it('cannot update deactivated user', async function() {
			// setup
			const userID = uuidv4();

			await serverClient.updateUser({ id: userID, name: 'hello' });

			const { user } = await serverClient.deactivateUser(userID);
			expect(user.id).to.equal(userID);
			expect(user.deactivated_at).to.not.be.undefined;

			const p = serverClient.updateUser({ id: userID, name: 'new name' });

			await expect(p).to.be.rejectedWith('was deactivated');
		});

		it('deactivate a user', async function() {
			// setup
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.updateUser({ id: userID, name: 'hello' });
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

		it('deactivate a user and remove their messages', async function() {
			// setup
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.updateUser({ id: userID, name: 'hello' });
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
			expect(state.messages[0].text).to.equal('hi');
		});
	});

	describe('activate user', function() {
		it('cannot activate active user', async function() {
			const userID = uuidv4();
			await serverClient.updateUser({ id: userID, name: 'hello' });

			const p = serverClient.activateUser(userID);

			await expect(p).to.be.rejectedWith('is not deactivated');
		});

		it('activate user and keep messages', async function() {
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			await serverClient.updateUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			await channel.sendMessage({
				text: 'hi',
				user: { id: userID },
			});

			await serverClient.deactivateUser(userID);

			const { user } = await serverClient.activateUser(userID);
			expect(user.deactivated_at).to.be.undefined;

			// user can do stuff again
			const messageResponsePromise = channel.sendMessage({
				text: 'I HAVE RISEN!!!',
				user: { id: userID },
			});
			await expect(messageResponsePromise).to.be.fulfilled;

			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();
			expect(state.messages).to.be.ofSize(2);
			for (const msg of state.messages) {
				expect(msg.deleted_at).to.be.undefined;
			}
		});

		it('activate user and delete messages', async function() {
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			await serverClient.updateUser({ id: userID, name: 'hello' });
			const channel = serverClient.channel('livestream', channelID, {
				created_by: { id: creatorID },
			});
			await channel.create();
			await channel.sendMessage({
				text: 'hi',
				user: { id: userID },
			});

			await serverClient.deactivateUser(userID);

			const { user } = await serverClient.activateUser(userID, {
				mark_messages_deleted: true,
			});
			expect(user.deactivated_at).to.be.undefined;

			// user can do stuff again
			const { message } = await channel.sendMessage({
				text: 'I HAVE RISEN!!!',
				user: { id: userID },
			});

			const channel2 = serverClient.channel('livestream', channelID);
			const state = await channel2.query();
			expect(state.messages).to.be.ofSize(2);
			expect(state.messages[0].deleted_at).to.not.be.undefined;
			expect(state.messages[1].id).to.equal(message.id);
			expect(state.messages[1].deleted_at).to.be.undefined;
		});
	});

	describe('delete user', function() {
		it('cannot update deleted user', async function() {
			// setup
			const userID = uuidv4();

			await serverClient.updateUser({ id: userID, name: 'hello' });

			const { user } = await serverClient.deleteUser(userID);
			expect(user.id).to.equal(userID);
			expect(user.deleted_at).to.not.be.undefined;

			const p = serverClient.updateUser({ id: userID, name: 'new name' });

			await expect(p).to.be.rejectedWith('was deleted');
		});

		it('delete a user', async function() {
			// setup
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.updateUser({ id: userID, name: 'hello' });
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

		it('delete a user and their message', async function() {
			// setup
			const userID = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.updateUser({ id: userID, name: 'hello' });
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
			expect(state.messages[0].text).to.equal('hi');
		});

		it('hard delete a user, their message and reactions', async function() {
			// setup
			const userID = uuidv4();
			const userID2 = uuidv4();
			const creatorID = uuidv4();
			const channelID = uuidv4();
			const user = await serverClient.updateUser({ id: userID, name: 'hello' });
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
			expect(deletedMessage.text).to.equal('');
		});
	});
});
