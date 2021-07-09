import chai from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';

import { ChannelState, StreamChat, Channel } from '../../src';

const expect = chai.expect;

describe('ChannelState addMessagesSorted', function () {
	it('empty state add single messages', async function () {
		const state = new ChannelState();
		expect(state.messages).to.have.length(0);
		state.addMessagesSorted([
			generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }),
		]);
		expect(state.messages).to.have.length(1);
		state.addMessagesSorted([
			generateMsg({ id: '1', date: '2020-01-01T00:00:01.000Z' }),
		]);

		expect(state.messages).to.have.length(2);
		expect(state.messages[0].id).to.be.equal('0');
		expect(state.messages[1].id).to.be.equal('1');
	});

	it('empty state add multiple messages', async function () {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '1', date: '2020-01-01T00:00:00.001Z' }),
			generateMsg({ id: '2', date: '2020-01-01T00:00:00.002Z' }),
			generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }),
		]);

		expect(state.messages).to.have.length(3);
		expect(state.messages[0].id).to.be.equal('0');
		expect(state.messages[1].id).to.be.equal('1');
		expect(state.messages[2].id).to.be.equal('2');
	});

	it('update a message in place 1', async function () {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '0' })]);
		state.addMessagesSorted([{ ...state.messages[0], text: 'update' }]);

		expect(state.messages).to.have.length(1);
		expect(state.messages[0].text).to.be.equal('update');
	});

	it('update a message in place 2', async function () {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '1', date: '2020-01-01T00:00:00.001Z' }),
			generateMsg({ id: '2', date: '2020-01-01T00:00:00.002Z' }),
			generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }),
		]);

		state.addMessagesSorted([{ ...state.messages[1], text: 'update' }]);

		expect(state.messages).to.have.length(3);
		expect(state.messages[1].text).to.be.equal('update');
		expect(state.messages[0].id).to.be.equal('0');
		expect(state.messages[1].id).to.be.equal('1');
		expect(state.messages[2].id).to.be.equal('2');
	});

	it('update a message in place 3', async function () {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '1', date: '2020-01-01T00:00:00.001Z' }),
			generateMsg({ id: '2', date: '2020-01-01T00:00:00.002Z' }),
			generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }),
			generateMsg({ id: '3', date: '2020-01-01T00:00:00.003Z' }),
		]);

		state.addMessagesSorted([{ ...state.messages[0], text: 'update 0' }]);
		expect(state.messages).to.have.length(4);
		expect(state.messages[0].text).to.be.equal('update 0');

		state.addMessagesSorted([{ ...state.messages[2], text: 'update 2' }]);
		expect(state.messages).to.have.length(4);
		expect(state.messages[2].text).to.be.equal('update 2');

		state.addMessagesSorted([{ ...state.messages[3], text: 'update 3' }]);
		expect(state.messages).to.have.length(4);
		expect(state.messages[3].text).to.be.equal('update 3');
	});

	it('add a message with same created_at', async function () {
		const state = new ChannelState();

		for (let i = 0; i < 10; i++) {
			state.addMessagesSorted([
				generateMsg({ id: `${i}`, date: `2020-01-01T00:00:00.00${i}Z` }),
			]);
		}

		for (let i = 10; i < state.messages.length - 1; i++) {
			for (let j = i + 1; i < state.messages.length - 1; j++)
				expect(state.messages[i].created_at.getTime()).to.be.lessThan(
					state.messages[j].created_at.getTime(),
				);
		}

		expect(state.messages).to.have.length(10);
		state.addMessagesSorted([
			generateMsg({ id: 'id', date: `2020-01-01T00:00:00.007Z` }),
		]);
		expect(state.messages).to.have.length(11);
		expect(state.messages[7].id).to.be.equal('7');
		expect(state.messages[8].id).to.be.equal('id');
	});

	it('add lots of messages in order', async function () {
		const state = new ChannelState();

		for (let i = 100; i < 300; i++) {
			state.addMessagesSorted([
				generateMsg({ id: `${i}`, date: `2020-01-01T00:00:00.${i}Z` }),
			]);
		}

		expect(state.messages).to.have.length(200);
		for (let i = 100; i < state.messages.length - 1; i++) {
			for (let j = i + 1; j < state.messages.length - 1; j++)
				expect(state.messages[i].created_at.getTime()).to.be.lessThan(
					state.messages[j].created_at.getTime(),
				);
		}
	});

	it('add lots of messages out of order', async function () {
		const state = new ChannelState();

		const messages = [];
		for (let i = 100; i < 300; i++) {
			messages.push(generateMsg({ id: `${i}`, date: `2020-01-01T00:00:00.${i}Z` }));
		}
		// shuffle
		for (let i = messages.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[messages[i], messages[j]] = [messages[j], messages[i]];
		}

		state.addMessagesSorted(messages);

		expect(state.messages).to.have.length(200);
		for (let i = 0; i < 200; i++) {
			expect(state.messages[i].id).to.be.equal(`${i + 100}`);
		}
	});

	it('should avoid duplicates if message.created_at changes', async function () {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }),
		]);
		expect(state.messages).to.have.length(1);

		state.addMessageSorted(
			{
				...state.messages[0],
				created_at: '2020-01-01T00:00:00.044Z',
				text: 'update 0',
			},
			true,
		);
		expect(state.messages).to.have.length(1);
		expect(state.messages[0].text).to.be.equal('update 0');
		expect(state.messages[0].created_at.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.044Z').getTime(),
		);
	});

	it('should respect order and avoid duplicates if message.created_at changes', async function () {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '1', date: '2020-01-01T00:00:00.001Z' }),
			generateMsg({ id: '2', date: '2020-01-01T00:00:00.002Z' }),
			generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }),
			generateMsg({ id: '3', date: '2020-01-01T00:00:00.003Z' }),
		]);
		expect(state.messages).to.have.length(4);

		state.addMessagesSorted(
			[
				{
					...state.messages[3],
					created_at: '2020-01-01T00:00:00.033Z',
					text: 'update 3',
				},
			],
			true,
		);
		expect(state.messages).to.have.length(4);
		expect(state.messages[3].text).to.be.equal('update 3');

		state.addMessageSorted(
			{
				...state.messages[0],
				created_at: '2020-01-01T00:00:00.044Z',
				text: 'update 0',
			},
			true,
		);
		expect(state.messages).to.have.length(4);
		expect(state.messages[3].text).to.be.equal('update 0');
		expect(state.messages[0].id).to.be.equal('1');
		expect(state.messages[1].id).to.be.equal('2');
		expect(state.messages[2].id).to.be.equal('3');
		expect(state.messages[3].id).to.be.equal('0');
	});

	it('updates last_message_at correctly', async function () {
		const state = new ChannelState();
		expect(state.last_message_at).to.be.null;
		state.addMessagesSorted([
			generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }),
		]);
		expect(state.last_message_at.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.000Z').getTime(),
		);
		state.addMessagesSorted([
			generateMsg({ id: '1', date: '2019-01-01T00:00:00.000Z' }),
		]);
		expect(state.last_message_at.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.000Z').getTime(),
		);

		state.addMessagesSorted([
			generateMsg({ id: '2', date: '2020-01-01T00:00:00.001Z' }),
		]);
		expect(state.last_message_at.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.001Z').getTime(),
		);
	});

	it('sets pinnedMessages correctly', async function () {
		const msgs = [
			generateMsg({ id: '1', date: '2020-01-01T00:00:00.001Z' }),
			generateMsg({ id: '2', date: '2020-01-01T00:00:00.002Z' }),
			generateMsg({ id: '3', date: '2020-01-01T00:00:00.003Z' }),
		];
		msgs[0].pinned = true;
		msgs[0].pinned_at = new Date('2020-01-01T00:00:00.010Z');
		msgs[1].pinned = true;
		msgs[1].pinned_at = new Date('2020-01-01T00:00:00.012Z');
		msgs[2].pinned = true;
		msgs[2].pinned_at = new Date('2020-01-01T00:00:00.011Z');
		const state = new ChannelState();
		state.addPinnedMessages(msgs);
		expect(state.pinnedMessages.length).to.be.equal(3);
		expect(state.pinnedMessages[0].id).to.be.equal('1');
		expect(state.pinnedMessages[1].id).to.be.equal('3');
		expect(state.pinnedMessages[2].id).to.be.equal('2');
	});
});

describe('ChannelState reactions', () => {
	const message = generateMsg();
	let state;
	beforeEach(() => {
		const client = new StreamChat();
		client.userID = 'observer';
		state = new ChannelState(new Channel(client, 'live', 'stream', {}));
		state.addMessageSorted(message);
	});
	it('Add one reaction', () => {
		const reaction = {
			user_id: 'observer',
			type: 'like',
			score: 1,
		};
		const msg = { ...message };
		msg.latest_reactions.push(reaction);
		const newMessage = state.addReaction(reaction, msg);
		expect(newMessage.own_reactions.length).to.be.eq(1);
		// validate the message got updated in channel state
		expect(state.messages[0].latest_reactions.length).to.be.eq(1);
	});
	it('Add same reaction twice', () => {
		let newMessage = state.addReaction(
			{
				user_id: 'observer',
				type: 'like',
				score: 1,
			},
			message,
		);
		newMessage = state.addReaction(
			{
				user_id: 'observer',
				type: 'like',
				score: 1,
			},
			newMessage,
		);
		expect(newMessage.own_reactions.length).to.be.eq(1);
	});
	it('Add two reactions', () => {
		let newMessage = state.addReaction(
			{
				user_id: 'observer',
				type: 'like',
				score: 1,
			},
			message,
		);
		newMessage = state.addReaction(
			{
				user_id: 'user2',
				type: 'like',
				score: 4,
			},
			newMessage,
		);
		expect(newMessage.own_reactions.length).to.be.eq(1);
		expect(newMessage.own_reactions[0].user_id).to.be.eq('observer');
	});
});

describe('ChannelState isUpToDate', () => {
	it('isUpToDate flag should be set to false, when watcher is disconnected', async () => {
		const chatClient = await getClientWithUser();
		const channelId = uuidv4();
		const mockedChannelResponse = generateChannel({
			channel: {
				id: channelId,
			},
		});

		// to mock the channel.watch call
		chatClient.post = () =>
			getOrCreateChannelApi(mockedChannelResponse).response.data;
		const channel = chatClient.channel('messaging', channelId);

		await channel.watch();
		// This is a responsibility of application layer to set the flag, depending
		// on what state is queried - most recent or some older.
		channel.state.setIsUpToDate(true);

		expect(channel.state.isUpToDate).to.be.eq(true);

		await channel._disconnect();
		expect(channel.state.isUpToDate).to.be.eq(false);
	});
});

describe('ChannelState clean', () => {
	let client;
	let channel;
	beforeEach(() => {
		client = new StreamChat();
		client.userID = 'observer';
		channel = new Channel(client, 'live', 'stream', {});
		client.activeChannels[channel.cid] = channel;
	});

	it('should remove any stale typing events with either string or Date received_at', async () => {
		// string received_at
		client.dispatchEvent({
			cid: channel.cid,
			type: 'typing.start',
			user: { id: 'other' },
			received_at: new Date(Date.now() - 10000).toISOString(),
		});
		expect(channel.state.typing['other']).not.to.be.undefined;

		channel.state.clean();
		expect(channel.state.typing['other']).to.be.undefined;

		// Date received_at
		client.dispatchEvent({
			cid: channel.cid,
			type: 'typing.start',
			user: { id: 'other' },
			received_at: new Date(Date.now() - 10000),
		});
		expect(channel.state.typing['other']).not.to.be.undefined;

		channel.state.clean();
		expect(channel.state.typing['other']).to.be.undefined;
	});
});

describe('deleteUserMessages', () => {
	it('should remove content of messages from given user, when hardDelete is true', () => {
		const state = new ChannelState();
		const user1 = generateUser();
		const user2 = generateUser();

		const m1u1 = generateMsg({ user: user1 });
		const m2u1 = generateMsg({ user: user1 });
		const m1u2 = generateMsg({ user: user2 });
		const m2u2 = generateMsg({ user: user2 });

		state.addMessagesSorted([m1u1, m2u1, m1u2, m2u2]);

		expect(state.messages).to.have.length(4);

		state.deleteUserMessages(user1, true);

		expect(state.messages).to.have.length(4);

		expect(state.messages[0].type).to.be.equal('deleted');
		expect(state.messages[0].text).to.be.equal(undefined);
		expect(state.messages[0].html).to.be.equal(undefined);

		expect(state.messages[1].type).to.be.equal('deleted');
		expect(state.messages[1].text).to.be.equal(undefined);
		expect(state.messages[1].html).to.be.equal(undefined);

		expect(state.messages[2].type).to.be.equal('regular');
		expect(state.messages[2].text).to.be.equal(m1u2.text);
		expect(state.messages[2].html).to.be.equal(m1u2.html);

		expect(state.messages[3].type).to.be.equal('regular');
		expect(state.messages[3].text).to.be.equal(m2u2.text);
		expect(state.messages[3].html).to.be.equal(m2u2.html);
	});
	it('should mark messages from given user as deleted, when hardDelete is false', () => {
		const state = new ChannelState();

		const user1 = generateUser();
		const user2 = generateUser();

		const m1u1 = generateMsg({ user: user1 });
		const m2u1 = generateMsg({ user: user1 });
		const m1u2 = generateMsg({ user: user2 });
		const m2u2 = generateMsg({ user: user2 });

		state.addMessagesSorted([m1u1, m2u1, m1u2, m2u2]);
		expect(state.messages).to.have.length(4);

		state.deleteUserMessages(user1);

		expect(state.messages).to.have.length(4);

		expect(state.messages[0].type).to.be.equal('deleted');
		expect(state.messages[0].text).to.be.equal(m1u1.text);
		expect(state.messages[0].html).to.be.equal(m1u1.html);

		expect(state.messages[1].type).to.be.equal('deleted');
		expect(state.messages[1].text).to.be.equal(m2u1.text);
		expect(state.messages[1].html).to.be.equal(m2u1.html);

		expect(state.messages[2].type).to.be.equal('regular');
		expect(state.messages[2].text).to.be.equal(m1u2.text);
		expect(state.messages[2].html).to.be.equal(m1u2.html);

		expect(state.messages[3].type).to.be.equal('regular');
		expect(state.messages[3].text).to.be.equal(m2u2.text);
		expect(state.messages[3].html).to.be.equal(m2u2.html);
	});
});

describe('updateUserMessages', () => {
	it('should update user property of messages from given user', () => {
		const state = new ChannelState();
		let user1 = generateUser();
		const user2 = generateUser();

		const m1u1 = generateMsg({ user: user1 });
		const m2u1 = generateMsg({ user: user1 });
		const m1u2 = generateMsg({ user: user2 });
		const m2u2 = generateMsg({ user: user2 });

		state.addMessagesSorted([m1u1, m2u1, m1u2, m2u2]);

		expect(state.messages).to.have.length(4);

		const user1NewName = uuidv4();
		user1 = {
			...user1,
			name: user1NewName,
		};

		state.updateUserMessages(user1, true);

		expect(state.messages).to.have.length(4);

		expect(state.messages[0].user.name).to.be.equal(user1NewName);
		expect(state.messages[1].user.name).to.be.equal(user1NewName);

		expect(state.messages[2].user.name).to.be.equal(user2.name);
		expect(state.messages[3].user.name).to.be.equal(user2.name);
	});
});
