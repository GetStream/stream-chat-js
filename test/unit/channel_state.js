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
		state.addMessagesSorted([generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' })]);
		expect(state.messages).to.have.length(1);
		state.addMessagesSorted([generateMsg({ id: '1', date: '2020-01-01T00:00:01.000Z' })]);

		expect(state.messages).to.have.length(2);
		expect(state.messages[0].id).to.be.equal('0');
		expect(state.messages[1].id).to.be.equal('1');
	});

	it('should not add messages from shadow banned users', () => {
		const state = new ChannelState();

		state.addMessagesSorted([generateMsg({ shadowed: true })]);

		expect(state.messages).to.be.empty;
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
			state.addMessagesSorted([generateMsg({ id: `${i}`, date: `2020-01-01T00:00:00.00${i}Z` })]);
		}

		for (let i = 10; i < state.messages.length - 1; i++) {
			for (let j = i + 1; i < state.messages.length - 1; j++)
				expect(state.messages[i].created_at.getTime()).to.be.lessThan(state.messages[j].created_at.getTime());
		}

		expect(state.messages).to.have.length(10);
		state.addMessagesSorted([generateMsg({ id: 'id', date: `2020-01-01T00:00:00.007Z` })]);
		expect(state.messages).to.have.length(11);
		expect(state.messages[7].id).to.be.equal('7');
		expect(state.messages[8].id).to.be.equal('id');
	});

	it('add lots of messages in order', async function () {
		const state = new ChannelState();

		for (let i = 100; i < 300; i++) {
			state.addMessagesSorted([generateMsg({ id: `${i}`, date: `2020-01-01T00:00:00.${i}Z` })]);
		}

		expect(state.messages).to.have.length(200);
		for (let i = 100; i < state.messages.length - 1; i++) {
			for (let j = i + 1; j < state.messages.length - 1; j++)
				expect(state.messages[i].created_at.getTime()).to.be.lessThan(state.messages[j].created_at.getTime());
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
		state.addMessagesSorted([generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' })]);
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
		expect(state.messages[0].created_at.getTime()).to.be.equal(new Date('2020-01-01T00:00:00.044Z').getTime());
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

	it('should add messages to new message set', () => {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '12' }), generateMsg({ id: '13' }), generateMsg({ id: '14' })]);
		state.addMessagesSorted([generateMsg({ id: '0' }), generateMsg({ id: '1' })], false, false, true, 'new');

		expect(state.messages.length).to.be.equal(3);
		expect(state.messages[0].id).to.be.equal('12');
		expect(state.messages[1].id).to.be.equal('13');
		expect(state.messages[2].id).to.be.equal('14');
		expect(state.messageSets[1].messages.length).to.be.equal(2);
		expect(state.messageSets[1].messages[0].id).to.be.equal('0');
		expect(state.messageSets[1].messages[1].id).to.be.equal('1');
	});

	it('should add messages to current message set', () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[generateMsg({ id: '12' }), generateMsg({ id: '13' }), generateMsg({ id: '14' })],
			false,
			false,
			true,
			'current',
		);

		expect(state.messages.length).to.be.equal(3);
		expect(state.messages[0].id).to.be.equal('12');
		expect(state.messages[1].id).to.be.equal('13');
		expect(state.messages[2].id).to.be.equal('14');
	});

	it('should add messages to latest message set', () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[generateMsg({ id: '12' }), generateMsg({ id: '13' }), generateMsg({ id: '14' })],
			false,
			false,
			true,
			'latest',
		);

		expect(state.messages.length).to.be.equal(3);
		expect(state.messages[0].id).to.be.equal('12');
		expect(state.messages[1].id).to.be.equal('13');
		expect(state.messages[2].id).to.be.equal('14');
		expect(state.latestMessages.length).to.be.equal(3);
		expect(state.latestMessages[0].id).to.be.equal('12');
		expect(state.latestMessages[1].id).to.be.equal('13');
		expect(state.latestMessages[2].id).to.be.equal('14');
	});

	it(`should add messages to latest message set when it's not currently active`, () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[generateMsg({ id: '12' }), generateMsg({ id: '13' }), generateMsg({ id: '14' })],
			false,
			false,
			true,
			'latest',
		);
		state.addMessagesSorted([generateMsg({ id: '0' }), generateMsg({ id: '1' })], false, false, true, 'new');
		state.messageSets[0].isCurrent = false;
		state.messageSets[1].isCurrent = true;
		state.addMessagesSorted([generateMsg({ id: '15' })], false, false, true, 'latest');

		expect(state.latestMessages.length).to.be.equal(4);
		expect(state.latestMessages[3].id).to.be.equal('15');
	});

	it(`shouldn't create new message set for thread replies`, () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[generateMsg({ parent_id: '12' }), generateMsg({ parent_id: '12' }), generateMsg({ parent_id: '12' })],
			false,
			false,
			true,
			'new',
		);

		expect(state.messageSets.length).to.be.equal(1);
	});

	it(`should update message in non-active message set`, () => {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '12' }), generateMsg({ id: '13' }), generateMsg({ id: '14' })]);
		state.addMessagesSorted(
			[generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' })],
			false,
			false,
			true,
			'new',
		);
		state.addMessagesSorted(
			[generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z', text: 'Updated text' })],
			false,
			false,
			false,
		);

		expect(state.messages.length).to.be.equal(3);
		expect(state.messageSets[1].messages.length).to.be.equal(1);
		expect(state.messageSets[1].messages[0].text).to.be.equal('Updated text');
	});

	it(`should update message in active message set`, () => {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '12', date: '2020-01-01T00:00:00.000Z' }),
			generateMsg({ id: '13', date: '2020-01-01T00:00:10.000Z' }),
			generateMsg({ id: '14', date: '2020-01-01T00:00:11.000Z' }),
		]);
		state.addMessagesSorted(
			[generateMsg({ id: '13', date: '2020-01-01T00:00:10.000Z', text: 'Updated text' })],
			false,
			false,
			false,
		);

		expect(state.messages.length).to.be.equal(3);
		expect(state.messages[1].text).to.be.equal('Updated text');
		expect(state.messageSets.length).to.be.equal(1);
	});

	it(`should update message in latest message set`, () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[
				generateMsg({ id: '12', date: '2020-01-01T00:00:00.000Z' }),
				generateMsg({ id: '13', date: '2020-01-01T00:00:10.000Z' }),
				generateMsg({ id: '14', date: '2020-01-01T00:00:11.000Z' }),
			],
			false,
			false,
			true,
			'latest',
		);
		state.addMessagesSorted(
			[generateMsg({ id: '13', date: '2020-01-01T00:00:10.000Z', text: 'Updated text' })],
			false,
			false,
			false,
		);

		expect(state.latestMessages.length).to.be.equal(3);
		expect(state.latestMessages[1].text).to.be.equal('Updated text');
	});

	it(`should do nothing if message is not available locally`, () => {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '12' }), generateMsg({ id: '13' }), generateMsg({ id: '14' })]);
		state.addMessagesSorted([generateMsg({ id: '5' })], false, false, true, 'new');
		state.addMessagesSorted([generateMsg({ id: '1' }), generateMsg({ id: '2' })], false, false, true, 'new');
		state.addMessagesSorted([generateMsg({ id: '8' })], false, false, false);

		expect(state.latestMessages.length).to.be.equal(3);
		expect(state.messages.length).to.be.equal(3);
		expect(state.messageSets[1].messages.length).to.be.equal(1);
		expect(state.messageSets[2].messages.length).to.be.equal(2);
	});

	it('updates last_message_at correctly', async function () {
		const state = new ChannelState();
		expect(state.last_message_at).to.be.null;
		state.addMessagesSorted([generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' })]);
		expect(state.last_message_at.getTime()).to.be.equal(new Date('2020-01-01T00:00:00.000Z').getTime());
		state.addMessagesSorted([generateMsg({ id: '1', date: '2019-01-01T00:00:00.000Z' })]);
		expect(state.last_message_at.getTime()).to.be.equal(new Date('2020-01-01T00:00:00.000Z').getTime());

		state.addMessagesSorted([generateMsg({ id: '2', date: '2020-01-01T00:00:00.001Z' })]);
		expect(state.last_message_at.getTime()).to.be.equal(new Date('2020-01-01T00:00:00.001Z').getTime());
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

	describe('merges overlapping message sets', () => {
		it('when new messages overlap with latest messages', () => {
			const state = new ChannelState();
			const overlap = [
				generateMsg({ id: '11', date: '2020-01-01T00:00:10.001Z' }),
				generateMsg({ id: '12', date: '2020-01-01T00:00:21.002Z' }),
				generateMsg({ id: '13', date: '2020-01-01T00:00:24.003Z' }),
			];
			const messages = [
				...overlap,
				generateMsg({ id: '14', date: '2020-01-01T00:00:33.000Z' }),
				generateMsg({ id: '15', date: '2020-01-01T00:00:43.000Z' }),
			];
			state.addMessagesSorted(messages);
			const newMessages = [generateMsg({ id: '10', date: '2020-01-01T00:00:03.000Z' }), ...overlap];
			state.addMessagesSorted(newMessages, false, true, true, 'new');

			expect(state.messages.length).to.be.equal(6);
			expect(state.messages[0].id).to.be.equal('10');
			expect(state.messages[1].id).to.be.equal('11');
			expect(state.messages[2].id).to.be.equal('12');
			expect(state.messages[3].id).to.be.equal('13');
			expect(state.messages[4].id).to.be.equal('14');
			expect(state.messages[5].id).to.be.equal('15');
			expect(state.messageSets.length).to.be.equal(1);
			expect(state.messages).to.be.equal(state.latestMessages);
		});

		it('when new messages overlap with current messages, but not with latest messages', () => {
			const state = new ChannelState();
			const overlap = [generateMsg({ id: '11', date: '2020-01-01T00:00:10.001Z' })];
			const latestMessages = [generateMsg({ id: '20', date: '2020-01-01T00:10:10.001Z' })];
			state.addMessagesSorted(latestMessages);
			const currentMessages = [generateMsg({ id: '10', date: '2020-01-01T00:00:03.001Z' }), ...overlap];
			state.addMessagesSorted(currentMessages, false, true, true, 'new');
			state.messageSets[0].isCurrent = false;
			state.messageSets[1].isCurrent = true;
			const newMessages = [...overlap, generateMsg({ id: '12', date: '2020-01-01T00:00:11.001Z' })];
			state.addMessagesSorted(newMessages, false, true, true, 'new');

			expect(state.latestMessages.length).to.be.equal(1);
			expect(state.latestMessages[0].id).to.be.equal('20');
			expect(state.messages.length).to.be.equal(3);
			expect(state.messages[0].id).to.be.equal('10');
			expect(state.messages[1].id).to.be.equal('11');
			expect(state.messages[2].id).to.be.equal('12');
			expect(state.messageSets.length).to.be.equal(2);
		});

		it('when new messages overlap with messages, but not current or latest messages', () => {
			const state = new ChannelState();
			const overlap = [generateMsg({ id: '11', date: '2020-01-01T00:00:10.001Z' })];
			const latestMessages = [generateMsg({ id: '20', date: '2020-01-01T00:10:10.001Z' })];
			state.addMessagesSorted(latestMessages);
			const currentMessages = [generateMsg({ id: '8', date: '2020-01-01T00:00:03.001Z' })];
			state.addMessagesSorted(currentMessages, false, true, true, 'new');
			state.messageSets[0].isCurrent = false;
			state.messageSets[1].isCurrent = true;
			const otherMessages = [generateMsg({ id: '10', date: '2020-01-01T00:00:09.001Z' }), ...overlap];
			state.addMessagesSorted(otherMessages, false, true, true, 'new');
			const newMessages = [...overlap, generateMsg({ id: '12', date: '2020-01-01T00:00:11.001Z' })];
			state.addMessagesSorted(newMessages, false, true, true, 'new');

			expect(state.latestMessages.length).to.be.equal(1);
			expect(state.latestMessages[0].id).to.be.equal('20');
			expect(state.messages.length).to.be.equal(1);
			expect(state.messages[0].id).to.be.equal('8');
			expect(state.messageSets.length).to.be.equal(3);
			expect(state.messageSets[0].messages).to.be.equal(state.latestMessages);
			expect(state.messageSets[1].messages).to.be.equal(state.messages);
			expect(state.messageSets[2].messages.length).to.be.equal(3);
			expect(state.messageSets[2].messages[0].id).to.be.equal('10');
			expect(state.messageSets[2].messages[1].id).to.be.equal('11');
			expect(state.messageSets[2].messages[2].id).to.be.equal('12');
		});

		it('when current messages overlap with latest', () => {
			const state = new ChannelState();
			const overlap = [generateMsg({ id: '11', date: '2020-01-01T00:00:10.001Z' })];
			const latestMessages = [...overlap, generateMsg({ id: '12', date: '2020-01-01T00:01:10.001Z' })];
			state.addMessagesSorted(latestMessages);
			const currentMessages = [generateMsg({ id: '8', date: '2020-01-01T00:00:03.001Z' })];
			state.addMessagesSorted(currentMessages, false, true, true, 'new');
			state.messageSets[0].isCurrent = false;
			state.messageSets[1].isCurrent = true;
			const newMessages = [
				generateMsg({ id: '9', date: '2020-01-01T00:00:04.001Z' }),
				generateMsg({ id: '10', date: '2020-01-01T00:00:07.001Z' }),
				...overlap,
			];
			state.addMessagesSorted(newMessages, false, true, true, 'current');

			expect(state.messages.length).to.be.equal(5);
			expect(state.messages[0].id).to.be.equal('8');
			expect(state.messages[1].id).to.be.equal('9');
			expect(state.messages[2].id).to.be.equal('10');
			expect(state.messages[3].id).to.be.equal('11');
			expect(state.messages[4].id).to.be.equal('12');
			expect(state.latestMessages).to.be.equal(state.messages);
		});

		it('when new messages overlap with multiple message sets', () => {
			const state = new ChannelState();
			const overlap1 = [generateMsg({ id: '11', date: '2020-01-01T00:00:10.001Z' })];
			const overlap2 = [generateMsg({ id: '13', date: '2020-01-01T00:01:10.001Z' })];
			const latestMessages = [...overlap2, generateMsg({ id: '14', date: '2020-01-01T00:01:15.001Z' })];
			state.addMessagesSorted(latestMessages);
			const currentMessages = [generateMsg({ id: '10', date: '2020-01-01T00:00:03.001Z' }), ...overlap1];
			state.addMessagesSorted(currentMessages, false, true, true, 'new');
			state.messageSets[0].isCurrent = false;
			state.messageSets[1].isCurrent = true;
			const newMessages = [...overlap1, generateMsg({ id: '12', date: '2020-01-01T00:00:14.001Z' }), ...overlap2];
			state.addMessagesSorted(newMessages, false, true, true, 'new');

			expect(state.messages.length).to.be.equal(5);
			expect(state.messages[0].id).to.be.equal('10');
			expect(state.messages[1].id).to.be.equal('11');
			expect(state.messages[2].id).to.be.equal('12');
			expect(state.messages[3].id).to.be.equal('13');
			expect(state.messages[4].id).to.be.equal('14');
			expect(state.messages).to.be.equal(state.latestMessages);
			expect(state.messageSets.length).to.be.equal(1);
		});
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
		chatClient.post = () => getOrCreateChannelApi(mockedChannelResponse).response.data;
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

describe('latestMessages', () => {
	it('should return latest messages - if they are the current message set', () => {
		const state = new ChannelState();
		const messages = [generateMsg({ id: '1' }), generateMsg({ id: '2' }), generateMsg({ id: '3' })];
		state.addMessagesSorted(messages);

		expect(state.latestMessages.length).to.be.equal(messages.length);
		expect(state.latestMessages[0].id).to.be.equal(messages[0].id);
		expect(state.latestMessages[1].id).to.be.equal(messages[1].id);
		expect(state.latestMessages[2].id).to.be.equal(messages[2].id);
	});

	it('should return latest messages - if they are not the current message set', () => {
		const state = new ChannelState();
		const latestMessages = [generateMsg({ id: '1' }), generateMsg({ id: '2' }), generateMsg({ id: '3' })];
		state.addMessagesSorted(latestMessages);
		const newMessages = [generateMsg({ id: '0' })];
		state.addMessagesSorted(newMessages, false, true, true, 'new');
		state.messageSets[0].isCurrent = false;
		state.messageSets[1].isCurrent = true;

		expect(state.latestMessages.length).to.be.equal(latestMessages.length);
		expect(state.latestMessages[0].id).to.be.equal(latestMessages[0].id);
		expect(state.latestMessages[1].id).to.be.equal(latestMessages[1].id);
		expect(state.latestMessages[2].id).to.be.equal(latestMessages[2].id);
	});

	it('should return latest messages - if they are not the current message set and new messages received', () => {
		const state = new ChannelState();
		const latestMessages = [generateMsg({ id: '1' }), generateMsg({ id: '2' }), generateMsg({ id: '3' })];
		state.addMessagesSorted(latestMessages);
		const newMessages = [generateMsg({ id: '0' })];
		state.addMessagesSorted(newMessages, false, true, true, 'new');
		state.messageSets[0].isCurrent = false;
		state.messageSets[1].isCurrent = true;
		const latestMessage = generateMsg({ id: '4' });
		state.addMessagesSorted([latestMessage], false, true, true, 'latest');

		expect(state.latestMessages.length).to.be.equal(latestMessages.length + 1);
		expect(state.latestMessages[0].id).to.be.equal(latestMessages[0].id);
		expect(state.latestMessages[1].id).to.be.equal(latestMessages[1].id);
		expect(state.latestMessages[2].id).to.be.equal(latestMessages[2].id);
		expect(state.latestMessages[3].id).to.be.equal(latestMessage.id);
	});
});

describe('loadMessageIntoState', () => {
	it('should do nothing if message is available locally in the current set', async () => {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '8' })], false, true, true, 'latest');
		state.addMessagesSorted([generateMsg({ id: '5' })], false, true, true, 'new');
		await state.loadMessageIntoState('8');

		expect(state.messageSets[0].isCurrent).to.be.equal(true);
	});

	it('should switch message sets if message is available locally, but in a different set', async () => {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '8' })], false, true, true, 'latest');
		state.addMessagesSorted([generateMsg({ id: '5' })], false, true, true, 'new');
		await state.loadMessageIntoState('5');

		expect(state.messageSets[0].isCurrent).to.be.equal(false);
		expect(state.messageSets[1].isCurrent).to.be.equal(true);
	});

	it('should switch to latest message set', async () => {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '8' })], false, true, true, 'latest');
		state.addMessagesSorted([generateMsg({ id: '5' })], false, true, true, 'new');
		state.messageSets[0].isCurrent = false;
		state.messageSets[1].isCurrent = true;
		await state.loadMessageIntoState('latest');

		expect(state.messageSets[0].isCurrent).to.be.equal(true);
	});

	it('should load message from backend and switch to the new message set', async () => {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '5' }), generateMsg({ id: '6' })]);
		const newMessages = [generateMsg({ id: '8' })];
		state._channel = {
			query: () => {
				state.addMessagesSorted(newMessages, false, true, true, 'new');
			},
		};
		await state.loadMessageIntoState('8');

		expect(state.messages.length).to.be.equal(1);
		expect(state.messages[0].id).to.be.equal('8');
	});

	describe('if message is a thread reply', () => {
		it('should do nothing if parent message and reply are available locally in the current set', async () => {
			const state = new ChannelState();
			const parentMessage = generateMsg({ id: '5' });
			const reply = generateMsg({ id: '8', parent_id: '5' });
			state.addMessagesSorted([parentMessage]);
			state.addMessagesSorted([reply]);

			await state.loadMessageIntoState('8', '5');

			expect(state.messages[0].id).to.be.equal(parentMessage.id);
			expect(state.threads[parentMessage.id][0].id).to.be.equal(reply.id);
		});

		it('should change message set if parent message and reply are available locally', async () => {
			const state = new ChannelState();
			const parentMessage = generateMsg({ id: '5' });
			const reply = generateMsg({ id: '8', parent_id: '5' });
			state.addMessagesSorted([parentMessage]);
			state.addMessagesSorted([reply]);
			const otherMessages = [generateMsg(), generateMsg()];
			state.addMessagesSorted(otherMessages, false, true, true, 'new');
			state.messageSets[0].isCurrent = false;
			state.messageSets[1].isCurrent = true;

			await state.loadMessageIntoState('8', '5');

			expect(state.messages[0].id).to.be.equal(parentMessage.id);
			expect(state.threads[parentMessage.id][0].id).to.be.equal(reply.id);
		});

		it(`should load replies if parent message is available locally, but reply isn't`, async () => {
			const state = new ChannelState();
			const parentMessage = generateMsg({ id: '5' });
			const reply = generateMsg({ id: '8', parent_id: '5' });
			state._channel = {
				getReplies: () => state.addMessagesSorted([reply], false, false, true, 'current'),
			};
			state.addMessagesSorted([parentMessage]);

			await state.loadMessageIntoState('8', '5');

			expect(state.messages[0].id).to.be.equal(parentMessage.id);
			expect(state.threads[parentMessage.id][0].id).to.be.equal(reply.id);
		});

		it('should load parent message and reply from backend, and switch to new message set', async () => {
			const state = new ChannelState();
			const parentMessage = generateMsg({ id: '5' });
			const reply = generateMsg({ id: '8', parent_id: '5' });
			state._channel = {
				getReplies: () => state.addMessagesSorted([reply], false, false, true, 'current'),
				query: () => state.addMessagesSorted([parentMessage], false, true, true, 'new'),
			};

			await state.loadMessageIntoState('8', '5');

			expect(state.messages[0].id).to.be.equal(parentMessage.id);
			expect(state.threads[parentMessage.id][0].id).to.be.equal(reply.id);
		});
	});
});
