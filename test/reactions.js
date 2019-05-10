/* eslint no-unused-vars: "off" */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { expectHTTPErrorCode, getTestClient, getTestClientForUser } from './utils';
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

async function getTestMessage(text, channel) {
	const data = await channel.sendMessage({ text });
	const message = data.message;
	return message;
}

describe('Reactions', function() {
	let reactionClient;
	let reactionClientServerSide;
	let channel;
	let serverSideUser;
	const userID = uuidv4();
	const everythingDisabledChannelType = uuidv4();

	before(async () => {
		reactionClientServerSide = getTestClient(true);
		await reactionClientServerSide.createChannelType({
			name: everythingDisabledChannelType,
			typing_events: false,
			read_events: false,
			connect_events: false,
			reactions: false,
			replies: false,
			search: false,
			mutes: false,
			message_retention: 'infinite',
			automod: 'disabled',
			commands: ['moderation_set'],
		});

		serverSideUser = {
			id: uuidv4(),
			name: 'tommy',
			status: 'busy',
			image: 'myimageurl',
			role: 'user',
		};

		reactionClientServerSide.updateUser(serverSideUser);
		reactionClientServerSide.setUser(serverSideUser);
		reactionClient = await getTestClientForUser(userID, 'reacting to stuff yeah');
		channel = reactionClient.channel('livestream', uuidv4());
		await channel.watch();
	});

	beforeEach(() => {
		reactionClient.listeners = {};
		channel.listeners = {};
	});

	/*
    - Add a reaction and verify own_reactions, counts and latest_reactions are correct
    - Remove a reaction and verify own_reactions, counts and latest_reactions are correct
    - Verify we don't return more than 10 reactions upon initial read
    - Check pagination for when there are more than 10 reactions
    - Verify that you cant add a reaction when reactions are disabled..
    */

	it('Add a reaction', async function() {
		// setup the test message
		const message = await getTestMessage('Add a reaction', channel);
		// add a reaction
		const reply = await channel.sendReaction(message.id, {
			type: 'love',
		});
		expect(reply.message.text).to.equal(message.text);
		expect(reply.reaction.user.id).to.equal(userID);
		const reactionID = reply.reaction.id;
		// check the message from the response
		expect(reply.message.own_reactions).to.deep.equal([reply.reaction]);
		// query state
		const state = await channel.query();
		const lastMessage = state.messages[state.messages.length - 1];
		expect(lastMessage.id).to.equal(message.id);
		// check the counts should be {love: 1}
		expect(lastMessage.reaction_counts).to.deep.equal({ love: 1 });
		// check the reactions, should contain the new reaction
		expect(lastMessage.latest_reactions).to.deep.equal([reply.reaction]);
		// check the own reactions
		expect(lastMessage.own_reactions.length).to.equal(1);
		expect(lastMessage.own_reactions).to.deep.equal([reply.reaction]);
	});

	it('Add a reaction server-side', async function() {
		// setup the test message
		const message = await getTestMessage('Add a reaction', channel);

		const serverSide = getTestClient(true);
		const serverSideChannel = serverSide.channel('livestream', channel.id);
		// add a reaction
		const reply = await serverSideChannel.sendReaction(
			message.id,
			{
				type: 'love',
			},
			userID,
		);

		expect(reply.message.text).to.equal(message.text);
		expect(reply.reaction.user.id).to.equal(userID);
		const reactionID = reply.reaction.id;

		// query state
		const state = await channel.query();
		const lastMessage = state.messages[state.messages.length - 1];
		expect(lastMessage.id).to.equal(message.id);
		// check the counts should be {love: 1}
		expect(lastMessage.reaction_counts).to.deep.equal({ love: 1 });
		// check the reactions, should contain the new reaction
		expect(lastMessage.latest_reactions).to.have.length(1);
		expect(lastMessage.latest_reactions[0].user.id).to.eq(userID);
	});

	it('Size constraints', async function() {
		const message = await getTestMessage('Whatever bro', channel);
		await expectHTTPErrorCode(
			400,
			channel.sendReaction(message.id, {
				type: 'love',
				extra: 'x'.repeat(256),
			}),
		);
	});

	it('Remove a reaction', async function() {
		// setup the test message
		const message = await getTestMessage('Remove a reaction', channel);
		// add a reaction
		const reply = await channel.sendReaction(message.id, {
			type: 'love',
		});
		// remove the reaction...
		const removeResponse = await channel.deleteReaction(message.id, 'love');
		// query state
		const state = await channel.query();
		const lastMessage = state.messages[state.messages.length - 1];
		expect(lastMessage.id).to.equal(message.id);
		// check the counts should be {love: 1}
		expect(lastMessage.reaction_counts).to.deep.equal({});
		// check the reactions, should contain the new reaction
		expect(lastMessage.latest_reactions).to.deep.equal([]);
		// check the own reactions
		expect(lastMessage.own_reactions.length).to.equal(0);
		expect(lastMessage.own_reactions).to.deep.equal([]);
	});

	it('Remove a Reaction server side', async function() {
		const channel = reactionClientServerSide.channel('livestream', 'reactions', {
			created_by: serverSideUser,
		});
		await channel.watch();
		// setup the test message
		const data = await channel.sendMessage({
			text: 'server side message',
			user: serverSideUser,
		});
		const message = data.message;
		// add a reaction
		const reply = await channel.sendReaction(message.id, {
			type: 'love',
		});
		// remove the reaction...
		const removeResponse = await channel.deleteReaction(
			message.id,
			'love',
			serverSideUser.id,
		);
		// query state
		const state = await channel.query();
		const lastMessage = state.messages[state.messages.length - 1];
		expect(lastMessage.id).to.equal(message.id);
		// check the counts should be {love: 1}
		expect(lastMessage.reaction_counts).to.deep.equal({});
		// check the reactions, should contain the new reaction
		expect(lastMessage.latest_reactions).to.deep.equal([]);
		// check the own reactions
		expect(lastMessage.own_reactions.length).to.equal(0);
		expect(lastMessage.own_reactions).to.deep.equal([]);
	});

	it.skip('Many Reactions', async function() {
		// setup the test message
		const serverSide = getTestClient(true);
		const sChannel = serverSide.channel('livestream', 'reactions');
		const message = await getTestMessage('Many Reactions', channel);

		// add 11 reactions from different users...
		for (let i = 1; i <= 11; i++) {
			await serverSide.updateUser({
				id: `user-${i}`,
				name: `Many Reactions - user ${i}`,
			});
			await sChannel.sendReaction(message.id, {
				type: 'love',
				user: { id: `user-${i}` },
			});
		}
		// add a 12th reaction from your own user
		const myReactionResponse = await channel.sendReaction(message.id, {
			type: 'like',
		});

		// query state
		const state = await channel.query();

		const lastMessage = state.messages[state.messages.length - 1];
		expect(lastMessage.id).to.equal(message.id);
		// check the counts should be {love: 12}
		expect(lastMessage.reaction_counts).to.deep.equal({ love: 11, like: 1 });
		// check the own reactions
		expect(lastMessage.own_reactions.length).to.equal(1);
		expect(lastMessage.own_reactions).to.deep.equal([myReactionResponse.reaction]);
		// we return the 10 latest reactions
		expect(lastMessage.latest_reactions.length).to.equal(10);
	});

	it('React to a Chat message', async function() {
		const text = 'testing reactions';
		const data = await channel.sendMessage({ text });
		const messageID = data.message.id;
		expect(data.message.text).to.equal('testing reactions');
		const reply = await channel.sendReaction(messageID, {
			type: 'love',
		});
		expect(reply.message.text).to.equal(text);
		expect(reply.reaction.user.id).to.equal(userID);
		expect(reply.reaction.type).to.equal('love');

		const state = await channel.query();
		const last = state.messages.length - 1;
		expect(state.messages[last].id).to.equal(messageID);
		expect(state.messages[last].latest_reactions.length).to.equal(1);

		await channel.deleteReaction(messageID, reply.reaction.type);
	});

	it('List Reactions', async function() {
		// setup 10 reactions
		const text = 'testing reactions list';
		const data = await channel.sendMessage({ text });

		const messageID = data.message.id;
		for (let i = 0; i < 10; i++) {
			const reaction = await channel.sendReaction(messageID, {
				type: `love-${i}`,
			});
		}
		// paginate
		const response = await channel.getReactions(messageID, { limit: 3 });
		expect(response.reactions.length).to.equal(3);
	});

	it('Reactions with colons and dots', async function() {
		const data = await channel.sendMessage({ text: uuidv4() });
		const messageID = data.message.id;
		const reaction = await channel.sendReaction(messageID, {
			type: 'love:1.0',
		});
		await channel.deleteReaction(messageID, 'love:1.0');
	});

	it('Reactions disabled', async function() {
		const serverSide = getTestClient(true);
		const user = { id: 'thierry' };
		const disabledChannel = serverSide.channel(
			everythingDisabledChannelType,
			'old-school-irc',
			{ created_by: user },
		);
		await disabledChannel.create();
		//adding reactions
		const text = 'nada';
		const data = await disabledChannel.sendMessage({ text, user });
		const messageID = data.message.id;
		expect(data.message.text).to.equal('nada');
		await expectHTTPErrorCode(
			400,
			disabledChannel.sendReaction(messageID, {
				type: 'love',
				user,
			}),
		);

		//listing reactions
		await expectHTTPErrorCode(
			400,
			disabledChannel.getReactions(messageID, { limit: 3 }),
		);
	});
});
