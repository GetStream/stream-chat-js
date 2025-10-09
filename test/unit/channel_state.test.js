import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';

import { ChannelState, StreamChat, Channel } from '../../src';
import { DEFAULT_MESSAGE_SET_PAGINATION } from '../../src/constants';
import { generateUUIDv4 as uuidv4 } from '../../src/utils';

import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';

const toISOString = (timestampMs) => new Date(timestampMs).toISOString();

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

	it('should add messages to new message set', () => {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '12', date: toISOString(100) }),
			generateMsg({ id: '13', date: toISOString(200) }),
			generateMsg({ id: '14', date: toISOString(300) }),
		]);
		state.addMessagesSorted(
			[
				generateMsg({ id: '0', date: toISOString(1000) }),
				generateMsg({ id: '1', date: toISOString(1100) }),
			],
			false,
			false,
			true,
			'new',
		);

		expect(state.messages.length).to.be.equal(3);
		expect(state.messages[0].id).to.be.equal('12');
		expect(state.messages[1].id).to.be.equal('13');
		expect(state.messages[2].id).to.be.equal('14');
		// set with ids 0,1 is added at the beginning as the newest set is inserted earlier
		expect(state.messageSets[0].messages.map((m) => m.id)).toStrictEqual(['0', '1']);
		expect(state.messageSets[1].messages.map((m) => m.id)).toStrictEqual([
			'12',
			'13',
			'14',
		]);
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

	it('adds message page sorted', () => {
		const state = new ChannelState();

		// load first page
		state.addMessagesSorted(
			[
				generateMsg({ id: '12', date: toISOString(1200) }),
				generateMsg({ id: '13', date: toISOString(1300) }),
				generateMsg({ id: '14', date: toISOString(1400) }),
			],
			false,
			false,
			true,
			'latest',
		);

		// jump to a start
		state.addMessagesSorted(
			[
				generateMsg({ id: '1', date: toISOString(100) }),
				generateMsg({ id: '2', date: toISOString(200) }),
			],
			false,
			false,
			true,
			'new',
		);
		state.messageSets[0].isCurrent = false;
		state.messageSets[1].isCurrent = true;
		// jump to a end

		state.addMessagesSorted(
			[generateMsg({ id: '10', date: toISOString(1000) })],
			false,
			false,
			true,
			'new',
		);

		state.addMessagesSorted(
			[
				generateMsg({ id: '8', date: toISOString(800) }),
				generateMsg({ id: '9', date: toISOString(900) }),
			],
			false,
			false,
			true,
			'new',
		);

		state.addMessagesSorted(
			[
				generateMsg({ id: '4', date: toISOString(400) }),
				generateMsg({ id: '5', date: toISOString(500) }),
				generateMsg({ id: '6', date: toISOString(600) }),
			],
			false,
			false,
			true,
			'new',
		);

		state.addMessagesSorted(
			[generateMsg({ id: '1500', date: toISOString(1500) })],
			false,
			false,
			true,
			'new',
		);

		const toTimestamp = (msg) => new Date(msg.created_at).getTime();
		expect(state.messageSets.length).to.eql(6);
		expect(state.messageSets[0].messages.map(toTimestamp)).toStrictEqual([1500]);
		expect(state.messageSets[1].messages.map(toTimestamp)).toStrictEqual([
			1200, 1300, 1400,
		]);
		expect(state.messageSets[2].messages.map(toTimestamp)).toStrictEqual([1000]);
		expect(state.messageSets[3].messages.map(toTimestamp)).toStrictEqual([800, 900]);
		expect(state.messageSets[4].messages.map(toTimestamp)).toStrictEqual([400, 500, 600]);
		expect(state.messageSets[5].messages.map(toTimestamp)).toStrictEqual([100, 200]);
	});

	it('inputs messages pertaining to different sets into corresponding message set and breaks the state', () => {
		const state = new ChannelState();

		// load first page
		state.addMessagesSorted(
			[
				generateMsg({ id: '12', date: toISOString(1200) }),
				generateMsg({ id: '14', date: toISOString(1400) }),
			],
			false,
			false,
			true,
			'latest',
		);

		state.addMessagesSorted(
			[
				generateMsg({ id: '6', date: toISOString(600) }),
				generateMsg({ id: '8', date: toISOString(800) }),
			],
			false,
			false,
			true,
			'new',
		);

		state.addMessagesSorted(
			[
				generateMsg({ id: '1', date: toISOString(100) }),
				generateMsg({ id: '3', date: toISOString(300) }),
			],
			false,
			false,
			true,
			'new',
		);

		state.addMessagesSorted(
			[
				generateMsg({ id: '7', date: 700 }),
				generateMsg({ id: '2', date: 200 }),
				generateMsg({ id: '13', date: toISOString(1300) }),
			],
			false,
			false,
			true,
			'new',
		);

		const toTimestamp = (msg) => new Date(msg.created_at).getTime();
		expect(state.messageSets.length).to.eql(4);
		expect(state.messageSets[0].messages.map(toTimestamp)).toStrictEqual([1200, 1400]);
		expect(state.messageSets[1].messages.map(toTimestamp)).toStrictEqual([
			200, 700, 1300,
		]);
		expect(state.messageSets[2].messages.map(toTimestamp)).toStrictEqual([600, 800]);
		expect(state.messageSets[3].messages.map(toTimestamp)).toStrictEqual([100, 300]);
	});

	it(`should add messages to latest message set when it's not currently active`, () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[
				generateMsg({ id: '12', date: toISOString(1200) }),
				generateMsg({ id: '13', date: toISOString(1300) }),
				generateMsg({ id: '14', date: toISOString(1400) }),
			],
			false,
			false,
			true,
			'latest',
		);
		state.addMessagesSorted(
			[
				generateMsg({ id: '1', date: toISOString(100) }),
				generateMsg({ id: '2', date: toISOString(200) }),
			],
			false,
			false,
			true,
			'new',
		);
		state.messageSets[0].isCurrent = false;
		state.messageSets[1].isCurrent = true;
		state.addMessagesSorted(
			[generateMsg({ id: '15', date: toISOString(1500) })],
			false,
			false,
			true,
			'latest',
		);

		expect(state.latestMessages.map((m) => m.id)).toStrictEqual(['12', '13', '14', '15']);
	});

	it('adjusts the latest set flag according to actual message creation date', () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[
				generateMsg({ id: '1', date: toISOString(100) }),
				generateMsg({ id: '2', date: toISOString(200) }),
			],
			false,
			false,
			true,
			'latest',
		);
		expect(state.latestMessages.map((m) => m.id)).toStrictEqual(['1', '2']);

		state.addMessagesSorted(
			[
				generateMsg({ id: '12', date: toISOString(1200) }),
				generateMsg({ id: '13', date: toISOString(1300) }),
				generateMsg({ id: '14', date: toISOString(1400) }),
			],
			false,
			false,
			true,
			'new',
		);
		expect(state.latestMessages.map((m) => m.id)).toStrictEqual(['12', '13', '14']);
		expect(state.messageSets.filter((s) => s.isLatest).length).toBe(1);
	});

	it("the messageSetToAddToIfDoesNotExist: 'latest' should be ignored if the messages do not belong to the latest set based on their creation timestamp", () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[
				generateMsg({ id: '12', date: toISOString(1200) }),
				generateMsg({ id: '13', date: toISOString(1300) }),
				generateMsg({ id: '14', date: toISOString(1400) }),
			],
			false,
			false,
			true,
			'latest',
		);
		state.addMessagesSorted(
			[
				generateMsg({ id: '1', date: toISOString(100) }),
				generateMsg({ id: '2', date: toISOString(200) }),
			],
			false,
			false,
			true,
			'new',
		);
		expect(state.messageSets[0].isCurrent).toBeTruthy();
		expect(state.messageSets[1].isCurrent).toBeFalsy();

		state.addMessagesSorted(
			[generateMsg({ id: '15', date: toISOString(150) })],
			false,
			false,
			true,
			'latest',
		);

		expect(state.messageSets[0].messages.map((m) => m.id)).toStrictEqual([
			'12',
			'13',
			'14',
		]);
		expect(state.latestMessages.map((m) => m.id)).toStrictEqual(['12', '13', '14']);
		expect(state.messageSets[1].messages.map((m) => m.id)).toStrictEqual([
			'1',
			'15',
			'2',
		]);
	});

	it(`shouldn't create new message set for thread replies`, () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[
				generateMsg({ parent_id: '12' }),
				generateMsg({ parent_id: '12' }),
				generateMsg({ parent_id: '12' }),
			],
			false,
			false,
			true,
			'new',
		);

		expect(state.messageSets.length).to.be.equal(1);
	});

	it(`should update message in non-active message set`, () => {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '12' }),
			generateMsg({ id: '13' }),
			generateMsg({ id: '14' }),
		]);
		state.addMessagesSorted(
			[generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' })],
			false,
			false,
			true,
			'new',
		);
		state.addMessagesSorted(
			[
				generateMsg({
					id: '0',
					date: '2020-01-01T00:00:00.000Z',
					text: 'Updated text',
				}),
			],
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
			[
				generateMsg({
					id: '13',
					date: '2020-01-01T00:00:10.000Z',
					text: 'Updated text',
				}),
			],
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
			[
				generateMsg({
					id: '13',
					date: '2020-01-01T00:00:10.000Z',
					text: 'Updated text',
				}),
			],
			false,
			false,
			false,
		);

		expect(state.latestMessages.length).to.be.equal(3);
		expect(state.latestMessages[1].text).to.be.equal('Updated text');
	});

	it(`should do nothing if message is not available locally`, () => {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '12', date: toISOString(1200) }),
			generateMsg({ id: '13', date: toISOString(1300) }),
			generateMsg({ id: '14', date: toISOString(1400) }),
		]);
		state.addMessagesSorted(
			[generateMsg({ id: '5', date: toISOString(500) })],
			false,
			false,
			true,
			'new',
		);
		state.addMessagesSorted(
			[
				generateMsg({ id: '1', date: toISOString(100) }),
				generateMsg({ id: '2', date: toISOString(200) }),
			],
			false,
			false,
			true,
			'new',
		);
		state.addMessagesSorted(
			[generateMsg({ id: '8', date: toISOString(800) })],
			false,
			false,
			false,
		);

		expect(state.latestMessages.length).to.be.equal(3);
		expect(state.messages.length).to.be.equal(3);
		expect(state.messageSets[1].messages.length).to.be.equal(1);
		expect(state.messageSets[2].messages.length).to.be.equal(2);
	});

	it('updates last_message_at correctly', async function () {
		const state = new ChannelState();
		expect(state.last_message_at).to.be.null;
		state.addMessagesSorted([generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' })]);
		expect(state.last_message_at.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.000Z').getTime(),
		);
		state.addMessagesSorted([generateMsg({ id: '1', date: '2019-01-01T00:00:00.000Z' })]);
		expect(state.last_message_at.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.000Z').getTime(),
		);

		state.addMessagesSorted([generateMsg({ id: '2', date: '2020-01-01T00:00:00.001Z' })]);
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

	it('should add message preview', async function () {
		// these message previews are used UI SDKs
		const messagePreview = generateMsg({
			id: '1',
			date: new Date('2020-01-01T00:00:00.001Z'),
		});
		const state = new ChannelState();
		state.addMessageSorted(messagePreview);

		expect(state.messages[0].id).to.be.equal('1');
	});

	it('should add thread reply preview', async function () {
		// these message previews are used by UI SDKs
		const parentMessage = generateMsg({
			id: 'parent_id',
			date: '2020-01-01T00:00:00.001Z',
		});
		const threadReplyPreview = generateMsg({
			id: '2',
			date: new Date('2020-01-01T00:00:00.001Z'),
			parent_id: 'parent_id',
		});
		const state = new ChannelState();
		state.addMessageSorted(parentMessage);
		state.addMessageSorted(threadReplyPreview);
		const thread = state.threads[parentMessage.id];

		expect(thread.length).to.be.equal(1);
		expect(thread[0].id).to.be.equal(threadReplyPreview.id);
	});

	describe('merges overlapping message sets', () => {
		it('when new messages overlap with latest messages', () => {
			const state = new ChannelState();
			const overlap = [
				generateMsg({ id: '11', date: toISOString(1100) }),
				generateMsg({ id: '12', date: toISOString(1200) }),
				generateMsg({ id: '13', date: toISOString(1300) }),
			];
			const messages = [
				...overlap,
				generateMsg({ id: '14', date: toISOString(1400) }),
				generateMsg({ id: '15', date: toISOString(1500) }),
			];
			state.addMessagesSorted(messages);
			const newMessages = [
				generateMsg({ id: '10', date: toISOString(1000) }),
				...overlap,
			];
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
			const latestMessages = [
				generateMsg({ id: '20', date: '2020-01-01T00:10:10.001Z' }),
			];
			state.addMessagesSorted(latestMessages);
			const currentMessages = [
				generateMsg({ id: '10', date: '2020-01-01T00:00:03.001Z' }),
				...overlap,
			];
			state.addMessagesSorted(currentMessages, false, true, true, 'new');
			state.messageSets[0].isCurrent = false;
			state.messageSets[1].isCurrent = true;
			const newMessages = [
				...overlap,
				generateMsg({ id: '12', date: '2020-01-01T00:00:11.001Z' }),
			];
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
			const overlap = [generateMsg({ id: '11', date: toISOString(1100) })];
			const latestMessages = [generateMsg({ id: '20', date: toISOString(2000) })];
			state.addMessagesSorted(latestMessages);
			const currentMessages = [generateMsg({ id: '8', date: toISOString(800) })];
			state.addMessagesSorted(currentMessages, false, true, true, 'new');
			state.messageSets[0].isCurrent = false;
			state.messageSets[1].isCurrent = true;
			const otherMessages = [
				generateMsg({ id: '10', date: toISOString(1000) }),
				...overlap,
			];
			state.addMessagesSorted(otherMessages, false, true, true, 'new');
			const newMessages = [
				...overlap,
				generateMsg({ id: '12', date: toISOString(1200) }),
			];
			state.addMessagesSorted(newMessages, false, true, true, 'new');

			expect(state.messageSets.length).to.be.equal(3);
			expect(state.latestMessages.map(({ id }) => id)).toStrictEqual(['20']);
			expect(state.messages.map(({ id }) => id)).toStrictEqual(['8']);
			expect(state.messageSets.map((s) => s.messages.map(({ id }) => id))).toStrictEqual([
				['20'],
				['10', '11', '12'],
				['8'],
			]);
		});

		it('when current messages overlap with latest', () => {
			const state = new ChannelState();
			const overlap = [generateMsg({ id: '11', date: '2020-01-01T00:00:10.001Z' })];
			const latestMessages = [
				...overlap,
				generateMsg({ id: '12', date: '2020-01-01T00:01:10.001Z' }),
			];
			state.addMessagesSorted(latestMessages);
			const currentMessages = [
				generateMsg({ id: '8', date: '2020-01-01T00:00:03.001Z' }),
			];
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
			const latestMessages = [
				...overlap2,
				generateMsg({ id: '14', date: '2020-01-01T00:01:15.001Z' }),
			];
			state.addMessagesSorted(latestMessages);
			const currentMessages = [
				generateMsg({ id: '10', date: '2020-01-01T00:00:03.001Z' }),
				...overlap1,
			];
			state.addMessagesSorted(currentMessages, false, true, true, 'new');
			state.messageSets[0].isCurrent = false;
			state.messageSets[0].pagination = { hasPrev: true, hasNext: false };
			state.messageSets[1].isCurrent = true;
			state.messageSets[1].pagination = { hasPrev: false, hasNext: true };
			const newMessages = [
				...overlap1,
				generateMsg({ id: '12', date: '2020-01-01T00:00:14.001Z' }),
				...overlap2,
			];
			state.addMessagesSorted(newMessages, false, true, true, 'new');

			expect(state.messages.length).to.be.equal(5);
			expect(state.messages[0].id).to.be.equal('10');
			expect(state.messages[1].id).to.be.equal('11');
			expect(state.messages[2].id).to.be.equal('12');
			expect(state.messages[3].id).to.be.equal('13');
			expect(state.messages[4].id).to.be.equal('14');
			expect(state.messages).to.be.equal(state.latestMessages);
			expect(state.messageSets.length).to.be.equal(1);
			expect(state.messageSets[0].pagination).to.be.eql({
				hasPrev: false,
				hasNext: false,
			});
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

	describe('_addReactionToState', () => {
		let addOwnReactionToMessageSpy;
		let reaction;
		let userID;
		let baseMessage;

		beforeEach(() => {
			userID = state._channel.getClient().userID;
			baseMessage = {
				id: 'msg-1',
				own_reactions: [],
				latest_reactions: [],
				reaction_groups: {},
			};

			reaction = {
				message_id: baseMessage.id,
				type: 'like',
				user_id: userID,
				score: 2,
				created_at: new Date(),
			};

			addOwnReactionToMessageSpy = vi.spyOn(state, '_addOwnReactionToMessage');
		});

		afterEach(() => {
			vi.resetAllMocks();
		});

		it('should create a new reaction group if none exist', () => {
			const messageFromState = { ...baseMessage, reaction_groups: undefined };
			const result = state._addReactionToState(messageFromState, reaction);

			expect(result.reaction_groups).to.deep.equal({
				like: {
					count: 1,
					sum_scores: 2,
					first_reaction_at: reaction.created_at,
					last_reaction_at: reaction.created_at,
				},
			});
		});

		it('should update existing reaction group', () => {
			const existing = {
				count: 1,
				sum_scores: 1,
				first_reaction_at: new Date(Date.now() - 5000),
				last_reaction_at: new Date(Date.now() - 5000),
			};
			const messageFromState = {
				...baseMessage,
				reaction_groups: { like: { ...existing } },
			};

			const result = state._addReactionToState(messageFromState, reaction);

			expect(result.reaction_groups.like.count).to.equal(2);
			expect(result.reaction_groups.like.sum_scores).to.equal(3);
			expect(result.reaction_groups.like.last_reaction_at).to.equal(reaction.created_at);
		});

		it('should remove previous own reactions from reaction_groups if enforce_unique is true', () => {
			const oldReactions = [
				{
					type: 'clap',
					user_id: userID,
					score: 1,
				},
				{
					type: 'wow',
					user_id: userID,
					score: 2,
				},
			];

			const messageFromState = {
				...baseMessage,
				own_reactions: oldReactions,
				reaction_groups: {
					clap: {
						count: 1,
						sum_scores: 1,
					},
					wow: {
						count: 1,
						sum_scores: 2,
					},
				},
			};

			const result = state._addReactionToState(messageFromState, reaction, true);

			expect(result.reaction_groups.clap).to.be.undefined;
			expect(result.reaction_groups.wow).to.be.undefined;
			expect(result.reaction_groups.like.count).to.equal(1);
		});

		it('should preserve other users’ reactions when enforce_unique is true', () => {
			const newOwnReaction = {
				...reaction,
				type: 'wow',
			};
			const messageFromState = {
				...baseMessage,
				own_reactions: [
					{ type: 'like', user_id: userID, score: 1 },
					{ type: 'clap', user_id: userID, score: 1 },
				],
				latest_reactions: [
					{ type: 'like', user_id: userID, score: 1 },
					{ type: 'clap', user_id: userID, score: 1 },
					{ type: 'clap', user_id: 'other-user', score: 1 },
				],
				reaction_groups: {
					like: { count: 1, sum_scores: 1 },
					clap: { count: 2, sum_scores: 2 },
				},
			};

			const result = state._addReactionToState(messageFromState, newOwnReaction, true);

			Object.keys(result.reaction_groups).forEach((key) => {
				delete result.reaction_groups[key].first_reaction_at;
				delete result.reaction_groups[key].last_reaction_at;
			});

			expect(result.reaction_groups).to.deep.equal({
				clap: {
					count: 1,
					sum_scores: 1,
				},
				wow: {
					count: 1,
					sum_scores: 2,
				},
			});
			expect(result.latest_reactions).to.deep.equal([
				{ type: 'clap', user_id: 'other-user', score: 1 },
				newOwnReaction,
			]);
			expect(result.own_reactions).to.deep.equal([newOwnReaction]);
		});

		it('should correctly update own_reactions with the new reaction', () => {
			const oldOwnReactions = [{ type: 'clap', user_id: userID, score: 1 }];
			const messageFromState = {
				...baseMessage,
				own_reactions: oldOwnReactions,
				reaction_groups: {
					clap: { count: 1, sum_scores: 1 },
				},
			};
			const result1 = state._addReactionToState(messageFromState, reaction);

			expect(addOwnReactionToMessageSpy).toHaveBeenCalledTimes(1);
			expect(result1.own_reactions).to.deep.equal([...oldOwnReactions, reaction]);

			vi.clearAllMocks();

			const newerReaction = { ...reaction, type: 'wow' };
			const result2 = state._addReactionToState(result1, newerReaction, true);

			expect(addOwnReactionToMessageSpy).toHaveBeenCalledTimes(1);
			expect(result2.own_reactions).to.deep.equal([newerReaction]);
		});

		it('should overwrite own reaction in latest_reactions if enforce_unique is true', () => {
			const oldReaction = {
				type: 'clap',
				user_id: userID,
			};

			const messageFromState = {
				...baseMessage,
				latest_reactions: [oldReaction],
			};

			const result = state._addReactionToState(messageFromState, reaction, true);

			expect(result.latest_reactions).to.deep.equal([reaction]);
		});

		it('should append to latest_reactions if enforce_unique is false', () => {
			const messageFromState = {
				...baseMessage,
				latest_reactions: [],
			};

			const result = state._addReactionToState(messageFromState, reaction, false);

			expect(result.latest_reactions.length).to.equal(1);
			expect(result.latest_reactions[0]).to.deep.equal(reaction);
		});

		it('should handle empty own_reactions and latest_reactions gracefully', () => {
			const messageFromState = {
				...baseMessage,
				own_reactions: undefined,
				latest_reactions: undefined,
			};

			const result = state._addReactionToState(messageFromState, reaction, true);

			expect(result.own_reactions).to.deep.equal([reaction]);
			expect(result.latest_reactions).to.deep.equal([reaction]);
		});
	});

	describe('_removeReactionFromState', () => {
		let reaction;
		let userID;
		let baseMessage;

		beforeEach(() => {
			userID = state._channel.getClient().userID;

			baseMessage = {
				id: 'messageFromState-1',
				own_reactions: [
					{ type: 'like', user_id: userID, score: 2 },
					{ type: 'clap', user_id: userID, score: 1 },
				],
				latest_reactions: [
					{ type: 'like', user_id: userID, score: 2 },
					{ type: 'clap', user_id: userID, score: 1 },
					{ type: 'wow', user_id: 'other-user', score: 1 },
				],
				reaction_groups: {
					like: {
						count: 1,
						sum_scores: 2,
					},
					clap: {
						count: 1,
						sum_scores: 1,
					},
					wow: {
						count: 1,
						sum_scores: 1,
					},
				},
			};

			reaction = {
				type: 'like',
				user_id: userID,
				score: 2,
			};
		});

		afterEach(() => {
			vi.resetAllMocks();
		});

		it('should remove the reaction from own_reactions', () => {
			const result = state._removeReactionFromState({ ...baseMessage }, reaction);
			expect(result.own_reactions.some((r) => r.type === 'like')).to.be.false;
		});

		it('should decrement the count and sum_scores in the reaction group', () => {
			const result = state._removeReactionFromState({ ...baseMessage }, reaction);
			expect(result.reaction_groups.like).to.be.undefined;
		});

		it('should remove the reaction from latest_reactions for the same user', () => {
			const result = state._removeReactionFromState({ ...baseMessage }, reaction);
			expect(
				result.latest_reactions.some((r) => r.type === 'like' && r.user_id === userID),
			).to.be.false;
		});

		it('should preserve other users’ reactions in latest_reactions', () => {
			const reactionToRemove = {
				type: 'wow',
				user_id: userID,
			};
			const result = state._removeReactionFromState({ ...baseMessage }, reactionToRemove);
			expect(
				result.latest_reactions.some(
					(r) => r.user_id === 'other-user' && r.type === 'wow',
				),
			).to.be.true;
		});

		it('should handle when reaction_groups count becomes 0 by deleting the group', () => {
			const reactionToRemove = {
				type: 'clap',
				user_id: userID,
				score: 1,
			};
			const result = state._removeReactionFromState({ ...baseMessage }, reactionToRemove);
			expect(result.reaction_groups.clap).to.be.undefined;
		});

		it('should handle when own_reactions is undefined', () => {
			const messageFromState = {
				...baseMessage,
				own_reactions: undefined,
			};
			const result = state._removeReactionFromState(messageFromState, reaction);
			expect(result.own_reactions).to.be.undefined;
		});

		it('should handle when latest_reactions is undefined', () => {
			const messageFromState = {
				...baseMessage,
				latest_reactions: undefined,
			};
			const result = state._removeReactionFromState(messageFromState, reaction);
			expect(result.latest_reactions).to.be.undefined;
		});

		it('should not crash if reaction group does not exist', () => {
			const messageFromState = {
				...baseMessage,
				reaction_groups: {
					wow: {
						count: 1,
						sum_scores: 1,
					},
				},
			};
			const result = state._removeReactionFromState(messageFromState, reaction);
			expect(result.reaction_groups.wow).to.exist;
		});
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
			received_at: toISOString(Date.now() - 10000),
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
		const messages = [
			generateMsg({ id: '1' }),
			generateMsg({ id: '2' }),
			generateMsg({ id: '3' }),
		];
		state.addMessagesSorted(messages);

		expect(state.latestMessages.length).to.be.equal(messages.length);
		expect(state.latestMessages[0].id).to.be.equal(messages[0].id);
		expect(state.latestMessages[1].id).to.be.equal(messages[1].id);
		expect(state.latestMessages[2].id).to.be.equal(messages[2].id);
	});

	it('should return latest messages - if they are not the current message set', () => {
		const state = new ChannelState();
		const latestMessages = [
			generateMsg({ id: '2', date: toISOString(200) }),
			generateMsg({ id: '3', date: toISOString(300) }),
			generateMsg({ id: '4', date: toISOString(400) }),
		];
		state.addMessagesSorted(latestMessages);
		const newMessages = [generateMsg({ id: '1', date: toISOString(100) })];
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
		const latestMessages = [
			generateMsg({ id: '2', date: toISOString(200) }),
			generateMsg({ id: '3', date: toISOString(300) }),
			generateMsg({ id: '4', date: toISOString(400) }),
		];
		state.addMessagesSorted(latestMessages);
		const newMessages = [generateMsg({ id: '1', date: toISOString(100) })];
		state.addMessagesSorted(newMessages, false, true, true, 'new');
		state.messageSets[0].isCurrent = false;
		state.messageSets[1].isCurrent = true;
		const latestMessage = generateMsg({ id: '5', date: toISOString(500) });
		state.addMessagesSorted([latestMessage], false, true, true, 'latest');

		expect(state.latestMessages.length).to.be.equal(latestMessages.length + 1);
		expect(state.latestMessages[0].id).to.be.equal(latestMessages[0].id);
		expect(state.latestMessages[1].id).to.be.equal(latestMessages[1].id);
		expect(state.latestMessages[2].id).to.be.equal(latestMessages[2].id);
		expect(state.latestMessages[3].id).to.be.equal(latestMessage.id);
	});
});

describe('messagePagination', () => {
	it('is initiated with defaults', () => {
		const state = new ChannelState();
		expect(state.messageSets[0].pagination).to.eql(DEFAULT_MESSAGE_SET_PAGINATION);
	});
	it('is retrieved as default if not set', () => {
		const state = new ChannelState();
		state.messageSets[0].pagination = undefined;
		expect(state.messageSets[0].pagination).to.be.undefined;
		expect(state.messagePagination).to.eql(DEFAULT_MESSAGE_SET_PAGINATION);
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
		state.addMessagesSorted(
			[generateMsg({ id: '8', date: toISOString(800) })],
			false,
			true,
			true,
			'latest',
		);
		state.addMessagesSorted(
			[generateMsg({ id: '5', date: toISOString(500) })],
			false,
			true,
			true,
			'new',
		);
		await state.loadMessageIntoState('5');

		expect(state.messageSets[0].isCurrent).to.be.equal(false);
		expect(state.messageSets[1].isCurrent).to.be.equal(true);
	});

	it('should switch to latest message set', async () => {
		const state = new ChannelState();
		state.addMessagesSorted(
			[generateMsg({ id: '8', date: toISOString(800) })],
			false,
			true,
			true,
			'latest',
		);
		state.addMessagesSorted(
			[generateMsg({ id: '5', date: toISOString(500) })],
			false,
			true,
			true,
			'new',
		);
		state.messageSets[0].isCurrent = false;
		state.messageSets[1].isCurrent = true;
		await state.loadMessageIntoState('latest');

		expect(state.messageSets[0].isCurrent).to.be.equal(true);
	});

	it('should load message from backend and switch to the new message set', async () => {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '5', date: toISOString(500) }),
			generateMsg({ id: '6', date: toISOString(600) }),
		]);
		const newMessages = [generateMsg({ id: '8', date: toISOString(800) })];
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
			const parentMessage = generateMsg({ id: '5', date: toISOString(500) });
			const reply = generateMsg({ id: '8', date: toISOString(800), parent_id: '5' });
			state.addMessagesSorted([parentMessage]);
			state.addMessagesSorted([reply]);

			await state.loadMessageIntoState('8', '5');

			expect(state.messages[0].id).to.be.equal(parentMessage.id);
			expect(state.threads[parentMessage.id][0].id).to.be.equal(reply.id);
		});

		it('should change message set if parent message and reply are available locally', async () => {
			const state = new ChannelState();
			const parentMessage = generateMsg({ id: '5', date: toISOString(500) });
			const reply = generateMsg({ id: '8', date: toISOString(800), parent_id: '5' });
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
			const parentMessage = generateMsg({ id: '5', date: toISOString(500) });
			const reply = generateMsg({ id: '8', date: toISOString(800), parent_id: '5' });
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

describe('findMessage', () => {
	it('message is in current message set', async () => {
		const state = new ChannelState();
		const messageId = '8';
		state.addMessagesSorted(
			[generateMsg({ id: messageId })],
			false,
			true,
			true,
			'latest',
		);
		state.addMessagesSorted([generateMsg({ id: '5' })], false, true, true, 'new');

		expect(state.findMessage(messageId).id).to.eql(messageId);
	});

	it('message is in a different set', async () => {
		const state = new ChannelState();
		const messageId = '5';
		state.addMessagesSorted([generateMsg({ id: '8' })], false, true, true, 'latest');
		state.addMessagesSorted([generateMsg({ id: messageId })], false, true, true, 'new');
		await state.loadMessageIntoState('5');

		expect(state.findMessage(messageId).id).to.eql(messageId);
	});

	it('message not found', async () => {
		const state = new ChannelState();
		state.addMessagesSorted([generateMsg({ id: '5' }), generateMsg({ id: '6' })]);

		expect(state.findMessage('12')).to.eql(undefined);
	});

	describe('if message is a thread reply', () => {
		it('message found', async () => {
			const messageId = '8';
			const parentMessageId = '5';
			const state = new ChannelState();
			const parentMessage = generateMsg({ id: parentMessageId });
			const reply = generateMsg({ id: messageId, parent_id: parentMessageId });
			state.addMessagesSorted([parentMessage]);
			state.addMessagesSorted([reply]);

			expect(state.findMessage(messageId, parentMessageId).id).to.eql(messageId);
		});

		it('message not found', async () => {
			const messageId = '8';
			const parentMessageId = '5';
			const state = new ChannelState();
			const parentMessage = generateMsg({ id: parentMessageId });
			const reply = generateMsg({ id: messageId, parent_id: parentMessageId });
			state.addMessagesSorted([parentMessage]);
			state.addMessagesSorted([reply]);

			expect(state.findMessage(messageId, `not${parentMessageId}`)).to.eql(undefined);
		});
	});
});

describe('find message by timestamp', () => {
	it('finds the message with matching timestamp', () => {
		const state = new ChannelState();
		const expectedFoundMsg = generateMsg({
			id: '2',
			created_at: toISOString(200),
		});
		state.addMessagesSorted([
			generateMsg({ id: '12', created_at: toISOString(1200) }),
			generateMsg({ id: '13', created_at: toISOString(1300) }),
			generateMsg({ id: '14', created_at: toISOString(1400) }),
		]);
		state.addMessagesSorted(
			[
				generateMsg({ id: '1', created_at: toISOString(100) }),
				expectedFoundMsg,
				generateMsg({ id: '3', created_at: toISOString(300) }),
				generateMsg({ id: '4', created_at: toISOString(400) }),
			],
			false,
			false,
			true,
			'new',
		);
		state.addMessagesSorted(
			[
				generateMsg({ id: '6', created_at: toISOString(600) }),
				generateMsg({ id: '7', created_at: toISOString(700) }),
			],
			false,
			false,
			true,
			'new',
		);

		const foundMessage = state.findMessageByTimestamp(
			new Date(expectedFoundMsg.created_at).getTime(),
		);
		expect(foundMessage.id).toBe(expectedFoundMsg.id);
	});

	it('finds the first message if multiple messages with the same timestamp', () => {
		const state = new ChannelState();
		const expectedFoundMessage = generateMsg({
			id: '2',
			created_at: toISOString(200),
		});
		const msgWithSameTimestamp = { ...expectedFoundMessage, id: '3' };
		state.addMessagesSorted([
			generateMsg({ id: '12', created_at: toISOString(1200) }),
			generateMsg({ id: '13', created_at: toISOString(1300) }),
			generateMsg({ id: '14', created_at: toISOString(1400) }),
		]);
		state.addMessagesSorted(
			[
				generateMsg({ id: '1', created_at: toISOString(100) }),
				expectedFoundMessage,
				msgWithSameTimestamp,
				generateMsg({ id: '3.5', created_at: toISOString(300) }),
				generateMsg({ id: '4', created_at: toISOString(400) }),
			],
			false,
			false,
			true,
			'new',
		);
		state.addMessagesSorted(
			[
				generateMsg({ id: '6', created_at: toISOString(600) }),
				generateMsg({ id: '7', created_at: toISOString(700) }),
			],
			false,
			false,
			true,
			'new',
		);

		const foundMessage = state.findMessageByTimestamp(
			new Date(msgWithSameTimestamp.created_at).getTime(),
		);
		expect(foundMessage.id).toBe(expectedFoundMessage.id);
	});

	it('returns null if the message is not found', () => {
		const state = new ChannelState();
		state.addMessagesSorted([
			generateMsg({ id: '12', created_at: toISOString(1200) }),
			generateMsg({ id: '13', created_at: toISOString(1300) }),
			generateMsg({ id: '14', created_at: toISOString(1400) }),
		]);
		const foundMessage = state.findMessageByTimestamp(200);
		expect(foundMessage).toBeNull();
	});
});
