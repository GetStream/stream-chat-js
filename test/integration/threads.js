/* eslint no-unused-vars: "off" */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Immutable from 'seamless-immutable';
import { StreamChat } from '../../src';
import fs from 'fs';
import {
	createUserToken,
	getTestClient,
	getTestClientForUser,
	getTestClientForUser2,
	getServerTestClient,
	sleep,
	runAndLogPromise,
} from './utils';
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

async function getTestMessage(text, channel) {
	const data = await channel.sendMessage({ text });
	return data.message;
}

describe('Threads and Replies', function () {
	let replyClient;
	let channel;

	before(async () => {
		replyClient = await getTestClientForUser('replytesting', 'testingreaplies');
		channel = replyClient.channel('livestream', 'replies');
		const state = await channel.watch();
	});

	beforeEach(() => {
		replyClient.listeners = {};
		channel.listeners = {};
	});

	it('Add Message with Parent should create a channel.state.threads entry', (done) => {
		async function runTest() {
			const text = 'super interesting topic....';
			const response = await channel.sendMessage({ text });
			const parentID = response.message.id;

			const reply = 'no way';
			const replyResponse = await channel.sendMessage({
				text: reply,
				parent_id: parentID,
				show_in_channel: false,
			});
		}

		channel.on('message.new', (event) => {
			const parentID = event.message.parent_id;
			const replyID = event.message.id;
			if (parentID) {
				expect(channel.state.threads[parentID]).to.be.ok;
				expect(channel.state.threads[parentID].length).to.equal(1);
				expect(channel.state.threads[parentID][0].id).to.equal(replyID);
				done();
			}
		});

		runAndLogPromise(runTest);
	});
	it('Query replies should add message to channel.state.threads', async () => {
		// create a few replies using the server side on a channel where we are not listening...
		const testClient = getServerTestClient();
		const user = { id: 'john' };
		const testChannel = testClient.channel('livestream', 'getRepliesTest', {
			created_by: user,
		});
		await testChannel.create();
		// add a message
		const sendMessageResponse = await testChannel.sendMessage({
			text: 'testing replies',
			user,
		});
		const parentID = sendMessageResponse.message.id;
		expect(testChannel.state.threads[parentID]).to.equal(undefined);
		// add a reply
		const replyResponse = await testChannel.sendMessage({
			text: 'testing replies',
			parent_id: parentID,
			user,
		});
		expect(testChannel.state.threads[parentID]).to.equal(undefined);

		// query replies -> should trigger the state to update...
		await testChannel.getReplies(parentID);
		expect(testChannel.state.threads[parentID][0].id).to.equal(
			replyResponse.message.id,
		);
		expect(testChannel.state.threads[parentID][0].reaction_counts).to.eql({});
	});

	it('Posting a reaction to a threaded message should work correctly', async () => {
		// create a few replies on a channel where we are not listening...
		const serverClient = getServerTestClient();
		const serverUser = { id: 'john' };
		const testChannel = replyClient.channel('livestream', 'reactionRepliesTest');
		await testChannel.create();
		const serverChannel = serverClient.channel('livestream', 'reactionRepliesTest');
		// add a message
		const sendMessageResponse = await testChannel.sendMessage({
			text: 'testing replies',
		});
		const parentID = sendMessageResponse.message.id;
		expect(testChannel.state.threads[parentID]).to.equal(undefined);
		// add a reply
		const replyResponse = await testChannel.sendMessage({
			text: 'testing replies',
			parent_id: parentID,
		});
		expect(testChannel.state.threads[parentID]).to.equal(undefined);

		const { reaction } = await channel.sendReaction(replyResponse.message.id, {
			type: 'love',
		});

		const { reaction: serverReaction } = await serverChannel.sendReaction(
			replyResponse.message.id,
			{
				type: 'love',
				user: serverUser,
			},
		);

		// query replies -> should trigger the state to update...
		await testChannel.getReplies(parentID);
		const thread = testChannel.state.threads[parentID];
		expect(thread[0].id).to.equal(replyResponse.message.id);
		expect(thread[0].user.id).to.equal('replytesting');
		expect(thread[0].reaction_counts).to.eql({ love: 2 });
		expect(thread[0].own_reactions).to.eql([reaction]);
		expect(thread[0].latest_reactions).to.eql([serverReaction, reaction]);
	});

	it('Query replies should return the last x replies and support pagination', async () => {
		// create a few replies using the server side on a channel where we are not listening...
		const testClient = getServerTestClient();
		const user = { id: 'john' };
		const testChannel = testClient.channel('livestream', 'getRepliesTest', {
			created_by: user,
		});
		await testChannel.create();
		// add a message
		const sendMessageResponse = await testChannel.sendMessage({
			text: 'testing reply pagination',
			user,
		});
		const parentID = sendMessageResponse.message.id;

		for (let i = 1; i <= 11; i++) {
			// add a reply
			const replyResponse = await testChannel.sendMessage({
				text: `reply test ${i}`,
				parent_id: parentID,
				user,
			});
		}

		// query replies should return message 10 and 11
		const response = await testChannel.getReplies(parentID, { limit: 2 });
		const firstMessage = response.messages[0];
		expect(firstMessage.text).to.equal('reply test 10');
		// paginate should return element 8 and 9
		const paginationResponse = await testChannel.getReplies(parentID, {
			limit: 2,
			id_lt: firstMessage.id,
		});
		const message = paginationResponse.messages[0];
		expect(message.text).to.equal('reply test 8');
	});

	it('Query replies should work with id_lt, id_lte, id_gt, id_gte', async () => {
		// create a few replies using the server side on a channel where we are not listening...
		const testClient = getServerTestClient();
		const user = { id: 'john' };
		const testChannel = testClient.channel('messaging', 'getRepliesTest', {
			created_by: user,
		});
		await testChannel.create();
		// add a message
		const sendMessageResponse = await testChannel.sendMessage({
			text: 'testing reply pagination id_lt, id_lte, id_gt, id_gte',
			user,
		});
		const parentID = sendMessageResponse.message.id;

		const replies = [];
		for (let i = 0; i < 10; i++) {
			// add a reply
			const replyResponse = await testChannel.sendMessage({
				text: `reply test ${i}`,
				parent_id: parentID,
				user,
			});

			//send random regular messages to the channel
			const regularMessage = await testChannel.sendMessage({
				text: `regular message test ${i}`,
				user,
			});

			replies.push(replyResponse.message);
		}
		// query replies should return messages 4 to 9
		let response = await testChannel.getReplies(parentID, {
			id_gt: replies[3].id,
			limit: 10,
		});
		let wantIds = replies.slice(4, 10).map((m) => m.id);
		let gotIds = response.messages.map((m) => m.id);
		expect(wantIds).to.eql(gotIds);

		// query replies should return messages 3 to 9
		response = await testChannel.getReplies(parentID, {
			id_gte: replies[3].id,
			limit: 10,
		});
		wantIds = replies.slice(3, 10).map((m) => m.id);
		gotIds = response.messages.map((m) => m.id);
		expect(wantIds).to.eql(gotIds);

		response = await testChannel.getReplies(parentID, {
			id_lt: replies[3].id,
			limit: 10,
		});
		wantIds = replies.slice(0, 3).map((m) => m.id);
		gotIds = response.messages.map((m) => m.id);
		expect(wantIds).to.eql(gotIds);

		response = await testChannel.getReplies(parentID, {
			id_lte: replies[3].id,
			limit: 10,
		});
		wantIds = replies.slice(0, 4).map((m) => m.id);
		gotIds = response.messages.map((m) => m.id);
		expect(wantIds).to.eql(gotIds);
	});

	it('Replies should not be in the main channel.messages', async () => {
		const text = 'super interesting topic....';
		const response = await channel.sendMessage({ text });
		const parentID = response.message.id;

		const reply1 = await channel.sendMessage({
			text: 'reply1',
			parent_id: parentID,
			show_in_channel: true,
		});
		const reply2 = await channel.sendMessage({
			text: 'reply2',
			parent_id: parentID,
			show_in_channel: false,
		});

		const state = await channel.query({ limit: 10 });
		const lastMessage = state.messages[state.messages.length - 1];
		expect(lastMessage.id).to.equal(reply1.message.id);
		expect(lastMessage.show_in_channel).to.equal(true);
	});

	it('Reply counts', async () => {
		// parent message
		const text = 'super interesting topic....';
		const response = await channel.sendMessage({ text });
		const parentID = response.message.id;

		// reply
		const reply = 'no way';
		const response2 = await channel.sendMessage({
			text: reply,
			parent_id: parentID,
			show_in_channel: false,
		});
		expect(response2.message.parent_id).to.equal(parentID);
		expect(response2.message.show_in_channel).to.equal(undefined);

		// realtime events are identical to regular messages. only the rendering is different
		// load the channel and show the last 3 messages for every thread...
		const state = await channel.query();
		const lastMessage = state.messages[state.messages.length - 1];
		// check the reply count...
		expect(lastMessage.id).to.equal(parentID);
		expect(lastMessage.reply_count).to.equal(1);

		// Read the replies...
		const thread = await channel.getReplies(parentID);
		const replyMessage = thread.messages[0];
		expect(replyMessage.parent_id).to.equal(parentID);
		expect(replyMessage.type).to.equal('reply');

		// Remove the reply and verify the counts go to 0
		const deleteResponse = await replyClient.deleteMessage(replyMessage.id);
		// Replies should be 0 length
		const thread2 = await channel.getReplies(parentID);
		expect(thread2.messages.length).to.equal(0);
		// check the count..., should be 0
		const stateAfterDelete = await channel.query();
		const lastMessage2 = stateAfterDelete.messages[state.messages.length - 1];
		expect(lastMessage2.id).to.equal(parentID);
		expect(lastMessage2.reply_count).to.equal(0);
	});

	it('Nesting level', async function () {
		const parent = await channel.sendMessage({ text: 'Check this out!!!' });
		const reply = await channel.sendMessage({
			text: 'No way!',
			parent_id: parent.message.id,
		});
		const p = channel.sendMessage({
			text: 'yes way!',
			parent_id: reply.message.id,
		});

		await expect(p).to.be.rejected;
	});

	it('Parent not found', async function () {
		const msg = await channel.sendMessage({ text: 'HEEY' });
		await replyClient.deleteMessage(msg.message.id);

		const p = channel.sendMessage({ text: 'yo', parent_id: msg.message.id + 1 });
		await expect(p).to.be.rejected;
	});

	it('Deleted reply should not be listed in channel', async function () {
		await replyClient.channel('livestream', 'replies').query();
		const parent = await channel.sendMessage({ text: 'Check this out!!!' });
		const reply = await channel.sendMessage({
			text: 'No way!',
			parent_id: parent.message.id,
		});
		await replyClient.deleteMessage(reply.message.id);
		const response = await replyClient.channel('livestream', 'replies').query();
		expect(response.messages.map((m) => m.id)).to.not.contain(reply.message.id);
	});
});
