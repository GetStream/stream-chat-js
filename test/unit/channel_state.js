import Immutable from 'seamless-immutable';
import chai from 'chai';
import { ChannelState } from '../../src/channel_state';
import { generateMsg } from './test-utils';

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
		state.addMessagesSorted([{ ...state.messages[0].asMutable(), text: 'update' }]);

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

		state.addMessagesSorted([{ ...state.messages[1].asMutable(), text: 'update' }]);

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

		state.addMessagesSorted([{ ...state.messages[0].asMutable(), text: 'update 0' }]);
		expect(state.messages).to.have.length(4);
		expect(state.messages[0].text).to.be.equal('update 0');

		state.addMessagesSorted([{ ...state.messages[2].asMutable(), text: 'update 2' }]);
		expect(state.messages).to.have.length(4);
		expect(state.messages[2].text).to.be.equal('update 2');

		state.addMessagesSorted([{ ...state.messages[3].asMutable(), text: 'update 3' }]);
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
				...state.messages[0].asMutable(),
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
					...state.messages[3].asMutable(),
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
				...state.messages[0].asMutable(),
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

	it('should return Immutable', async function () {
		const state = new ChannelState();
		expect(Immutable.isImmutable(state.messages)).to.be.true;
		state.addMessagesSorted([
			generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }),
		]);
		expect(Immutable.isImmutable(state.messages)).to.be.true;
		expect(Immutable.isImmutable(state.messages[0])).to.be.true;

		state.addMessagesSorted([
			generateMsg({ id: '1', date: '2020-01-01T00:00:00.001Z', parent_id: '0' }),
		]);
		expect(Immutable.isImmutable(state.messages)).to.be.true;
		expect(state.messages).to.have.length(1);
		expect(state.threads['0']).to.have.length(1);
		expect(Immutable.isImmutable(state.threads)).to.be.true;
		expect(Immutable.isImmutable(state.threads['0'])).to.be.true;
		expect(Immutable.isImmutable(state.threads['0'][0])).to.be.true;
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
});
