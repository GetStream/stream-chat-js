import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';

import { ChannelState, StreamChat, Channel } from '../../src';
import { generateUUIDv4 as uuidv4 } from '../../src/utils';

import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import { MockOfflineDB } from './offline-support/MockOfflineDB';

const toISOString = (timestampMs) => new Date(timestampMs).toISOString();

describe('ChannelState addMessagesSorted', function () {
	let state;
	let client;

	beforeEach(async () => {
		client = new StreamChat();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);
		const channel = new Channel(client, 'type', 'id', {});
		client._addChannelConfig({ cid: channel.cid, config: {} });
		state = new ChannelState(channel);
	});

	it('updates last_message_at correctly', async function () {
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
		state.addPinnedMessages(msgs);
		expect(state.pinnedMessages.length).to.be.equal(3);
		expect(state.pinnedMessages[0].id).to.be.equal('1');
		expect(state.pinnedMessages[1].id).to.be.equal('3');
		expect(state.pinnedMessages[2].id).to.be.equal('2');
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
		state.addMessageSorted(parentMessage);
		state.addMessageSorted(threadReplyPreview);
		const thread = state.threads[parentMessage.id];

		expect(thread.length).to.be.equal(1);
		expect(thread[0].id).to.be.equal(threadReplyPreview.id);
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
	let state;

	beforeEach(() => {
		const client = new StreamChat();
		client.userID = 'userId';
		const channel = new Channel(client, 'type', 'id', {});
		client._addChannelConfig({ cid: channel.cid, config: {} });
		state = new ChannelState(channel);
	});

	it('should remove content of pinned messages from given user, when hardDelete is true', () => {
		const user1 = generateUser();
		const user2 = generateUser();

		const m1u1 = generateMsg({
			user: user1,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.001Z'),
		});
		const m2u1 = generateMsg({
			user: user1,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.002Z'),
		});
		const m1u2 = generateMsg({
			user: user2,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.003Z'),
		});
		const m2u2 = generateMsg({
			user: user2,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.004Z'),
		});

		state.addPinnedMessages([m1u1, m2u1, m1u2, m2u2]);

		expect(state.pinnedMessages).to.have.length(4);

		state.deleteUserMessages(user1, true);

		const byId = (id) => state.pinnedMessages.find((m) => m.id === id);

		expect(state.pinnedMessages).to.have.length(4);

		expect(byId(m1u1.id).type).to.be.equal('deleted');
		expect(byId(m1u1.id).text).to.be.equal(undefined);
		expect(byId(m1u1.id).html).to.be.equal(undefined);

		expect(byId(m2u1.id).type).to.be.equal('deleted');
		expect(byId(m2u1.id).text).to.be.equal(undefined);
		expect(byId(m2u1.id).html).to.be.equal(undefined);

		expect(byId(m1u2.id).type).to.be.equal('regular');
		expect(byId(m1u2.id).text).to.be.equal(m1u2.text);
		expect(byId(m1u2.id).html).to.be.equal(m1u2.html);

		expect(byId(m2u2.id).type).to.be.equal('regular');
		expect(byId(m2u2.id).text).to.be.equal(m2u2.text);
		expect(byId(m2u2.id).html).to.be.equal(m2u2.html);
	});
	it('should mark pinned messages from given user as deleted, when hardDelete is false', () => {
		const user1 = generateUser();
		const user2 = generateUser();

		const m1u1 = generateMsg({
			user: user1,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.001Z'),
		});
		const m2u1 = generateMsg({
			user: user1,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.002Z'),
		});
		const m1u2 = generateMsg({
			user: user2,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.003Z'),
		});
		const m2u2 = generateMsg({
			user: user2,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.004Z'),
		});

		state.addPinnedMessages([m1u1, m2u1, m1u2, m2u2]);
		expect(state.pinnedMessages).to.have.length(4);

		state.deleteUserMessages(user1);

		const byId = (id) => state.pinnedMessages.find((m) => m.id === id);

		expect(state.pinnedMessages).to.have.length(4);

		expect(byId(m1u1.id).type).to.be.equal('deleted');
		expect(byId(m1u1.id).text).to.be.equal(m1u1.text);
		expect(byId(m1u1.id).html).to.be.equal(m1u1.html);

		expect(byId(m2u1.id).type).to.be.equal('deleted');
		expect(byId(m2u1.id).text).to.be.equal(m2u1.text);
		expect(byId(m2u1.id).html).to.be.equal(m2u1.html);

		expect(byId(m1u2.id).type).to.be.equal('regular');
		expect(byId(m1u2.id).text).to.be.equal(m1u2.text);
		expect(byId(m1u2.id).html).to.be.equal(m1u2.html);

		expect(byId(m2u2.id).type).to.be.equal('regular');
		expect(byId(m2u2.id).text).to.be.equal(m2u2.text);
		expect(byId(m2u2.id).html).to.be.equal(m2u2.html);
	});
});

// Regression tests for GetStream/stream-chat-js#1736:
// deleteUserMessages crashed with "Cannot read property 'cid' of undefined" when
// hard-deleting a message that quotes another message from the same user. The first
// branch replaced messages[i] with the stripped hard-delete placeholder (no
// quoted_message field); the second branch then read messages[i].quoted_message as
// undefined and passed it into toDeletedMessage, which dereferences message.cid.
describe('deleteUserMessages — quoted_message regression (#1736)', () => {
	let state;

	beforeEach(() => {
		const client = new StreamChat();
		client.userID = 'userId';
		const channel = new Channel(client, 'type', 'id', {});
		client._addChannelConfig({ cid: channel.cid, config: {} });
		state = new ChannelState(channel);
	});

	it('does not throw when hard-deleting a thread reply that quotes another same-user reply', () => {
		const user1 = generateUser();
		const parent = generateMsg({ user: user1, id: 'parent-id' });
		const reply1 = generateMsg({
			user: user1,
			parent_id: parent.id,
			date: '2020-01-01T00:00:01.000Z',
		});
		const reply2 = generateMsg({
			user: user1,
			parent_id: parent.id,
			date: '2020-01-01T00:00:02.000Z',
			quoted_message: reply1,
			quoted_message_id: reply1.id,
		});

		state.addMessagesSorted([parent, reply1, reply2]);
		expect(state.threads[parent.id]).to.have.length(2);

		expect(() => state.deleteUserMessages(user1, true)).not.to.throw();

		const thread = state.threads[parent.id];
		expect(thread).to.have.length(2);
		expect(thread[0].type).to.be.equal('deleted');
		expect(thread[1].type).to.be.equal('deleted');
		expect(thread[1].quoted_message).to.be.equal(undefined);
	});

	it('does not throw when hard-deleting a pinned message that quotes another same-user pinned message', () => {
		const user1 = generateUser();
		const m1 = generateMsg({
			user: user1,
			pinned: true,
			pinned_at: new Date('2022-01-01T00:00:00.001Z'),
		});
		const m2 = generateMsg({
			user: user1,
			pinned: true,
			pinned_at: new Date('2022-01-01T00:00:00.002Z'),
			quoted_message: m1,
			quoted_message_id: m1.id,
		});

		state.addMessagesSorted([m1, m2]);
		state.addPinnedMessages([m1, m2]);
		expect(state.pinnedMessages).to.have.length(2);

		expect(() => state.deleteUserMessages(user1, true)).not.to.throw();

		expect(state.pinnedMessages).to.have.length(2);
		state.pinnedMessages.forEach((message) => {
			expect(message.type).to.be.equal('deleted');
		});
		const pinnedQuoter = state.pinnedMessages.find((m) => m.id === m2.id);
		expect(pinnedQuoter.quoted_message).to.be.equal(undefined);
	});

	it('soft-deletes a thread reply that quotes another same-user reply and marks the quoted_message as deleted', () => {
		const user1 = generateUser();
		const parent = generateMsg({ user: user1, id: 'parent-id' });
		const reply1 = generateMsg({
			user: user1,
			parent_id: parent.id,
			date: '2020-01-01T00:00:01.000Z',
		});
		const reply2 = generateMsg({
			user: user1,
			parent_id: parent.id,
			date: '2020-01-01T00:00:02.000Z',
			quoted_message: reply1,
			quoted_message_id: reply1.id,
		});

		state.addMessagesSorted([parent, reply1, reply2]);

		expect(() => state.deleteUserMessages(user1, false)).not.to.throw();

		const thread = state.threads[parent.id];
		expect(thread[0].type).to.be.equal('deleted');
		expect(thread[1].type).to.be.equal('deleted');
		// Soft-delete preserves message content via the spread path.
		expect(thread[1].text).to.be.equal(reply2.text);
		// quoted_message reference is replaced with a deleted placeholder.
		expect(thread[1].quoted_message).to.not.be.equal(undefined);
		expect(thread[1].quoted_message.id).to.be.equal(reply1.id);
		expect(thread[1].quoted_message.type).to.be.equal('deleted');
	});

	it('continues processing later thread replies after encountering a self-quote on hard-delete', () => {
		const user1 = generateUser();
		const user2 = generateUser();
		const parent = generateMsg({ user: user1, id: 'parent-id' });
		const rA = generateMsg({
			user: user2,
			parent_id: parent.id,
			date: '2020-01-01T00:00:01.000Z',
		});
		const r1 = generateMsg({
			user: user1,
			parent_id: parent.id,
			date: '2020-01-01T00:00:02.000Z',
		});
		const r2 = generateMsg({
			user: user1,
			parent_id: parent.id,
			date: '2020-01-01T00:00:03.000Z',
			quoted_message: r1,
			quoted_message_id: r1.id,
		});
		const rB = generateMsg({
			user: user1,
			parent_id: parent.id,
			date: '2020-01-01T00:00:04.000Z',
		});
		const rC = generateMsg({
			user: user2,
			parent_id: parent.id,
			date: '2020-01-01T00:00:05.000Z',
		});

		state.addMessagesSorted([parent, rA, r1, r2, rB, rC]);

		expect(() => state.deleteUserMessages(user1, true)).not.to.throw();

		const thread = state.threads[parent.id];
		const byId = (id) => thread.find((m) => m.id === id);
		expect(byId(rA.id).type).to.be.equal('regular');
		expect(byId(r1.id).type).to.be.equal('deleted');
		expect(byId(r2.id).type).to.be.equal('deleted');
		// rB sits after the self-quote pair — previously the throw aborted the loop here.
		expect(byId(rB.id).type).to.be.equal('deleted');
		expect(byId(rC.id).type).to.be.equal('regular');
	});
});

describe('updateUserMessages', () => {
	let state;

	beforeEach(() => {
		const client = new StreamChat();
		client.userID = 'userId';
		const channel = new Channel(client, 'type', 'id', {});
		client._addChannelConfig({ cid: channel.cid, config: {} });
		state = new ChannelState(channel);
	});

	it('should update user property of pinned messages from given user', () => {
		let user1 = generateUser();
		const user2 = generateUser();

		const m1u1 = generateMsg({
			user: user1,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.001Z'),
		});
		const m2u1 = generateMsg({
			user: user1,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.002Z'),
		});
		const m1u2 = generateMsg({
			user: user2,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.003Z'),
		});
		const m2u2 = generateMsg({
			user: user2,
			pinned: true,
			pinned_at: new Date('2020-01-01T00:00:00.004Z'),
		});

		state.addPinnedMessages([m1u1, m2u1, m1u2, m2u2]);

		expect(state.pinnedMessages).to.have.length(4);

		const user1NewName = uuidv4();
		user1 = {
			...user1,
			name: user1NewName,
		};

		state.updateUserMessages(user1);

		const byId = (id) => state.pinnedMessages.find((m) => m.id === id);

		expect(state.pinnedMessages).to.have.length(4);

		expect(byId(m1u1.id).user.name).to.be.equal(user1NewName);
		expect(byId(m2u1.id).user.name).to.be.equal(user1NewName);

		expect(byId(m1u2.id).user.name).to.be.equal(user2.name);
		expect(byId(m2u2.id).user.name).to.be.equal(user2.name);
	});
});

describe('ChannelState members store', () => {
	it('initializes members store with an empty members map', () => {
		const state = new ChannelState();

		expect(state.members).to.eql({});
		expect(state.member_count).to.equal(0);
		expect(state.membersStore.getLatestValue()).to.eql({ members: {}, memberCount: 0 });
	});

	it('keeps members getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();
		const members = {
			alice: { user: { id: 'alice' }, user_id: 'alice' },
		};

		state.members = members;

		expect(state.members).to.equal(members);
		expect(state.membersStore.getLatestValue()).to.eql({
			memberCount: 0,
			members,
		});
	});

	it('keeps member_count getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();

		state.member_count = 42;

		expect(state.member_count).to.equal(42);
		expect(state.membersStore.getLatestValue()).to.eql({
			memberCount: 42,
			members: {},
		});
	});
});

describe('ChannelState member count bridge', () => {
	it('initializes membersStore memberCount from channel.data.member_count', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', { member_count: 3 });
		const state = channel.state;

		expect(state.member_count).to.equal(3);
		expect(state.membersStore.getLatestValue()).to.eql({
			memberCount: 3,
			members: {},
		});
		expect(channel.data?.member_count).to.equal(3);
	});

	it('syncs memberCount when channel.data is replaced', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', { member_count: 1 });
		const state = channel.state;

		channel.data = { ...channel.data, member_count: 7 };
		state.syncMemberCountFromChannelData(channel.data);

		expect(state.member_count).to.equal(7);
		expect(state.membersStore.getLatestValue()).to.eql({
			memberCount: 7,
			members: {},
		});
		expect(channel.data?.member_count).to.equal(7);
	});

	it('keeps backward-compatible channel.data.member_count assignments in sync', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {});
		const state = channel.state;

		channel.data.member_count = 5;

		expect(state.member_count).to.equal(5);
		expect(state.membersStore.getLatestValue()).to.eql({
			memberCount: 5,
			members: {},
		});
		expect(channel.data.member_count).to.equal(5);
	});
});

describe('ChannelState read store', () => {
	it('initializes read store with an empty read map', () => {
		const state = new ChannelState();

		expect(state.read).to.eql({});
		expect(state.readStore.getLatestValue()).to.eql({ read: {} });
	});

	it('keeps read getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();
		const read = {
			alice: {
				last_read: new Date('2026-02-28T00:00:00.000Z'),
				unread_messages: 3,
				user: { id: 'alice' },
			},
		};

		state.read = read;

		expect(state.read).to.equal(read);
		expect(state.readStore.getLatestValue()).to.eql({ read });
	});
});

describe('ChannelState watcher count store', () => {
	it('initializes watcher count store with zero', () => {
		const state = new ChannelState();

		expect(state.watcher_count).to.equal(0);
		expect(state.watcherStore.getLatestValue()).to.eql({
			watcherCount: 0,
			watchers: {},
		});
	});

	it('keeps watcher_count getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();

		state.watcher_count = 42;

		expect(state.watcher_count).to.equal(42);
		expect(state.watcherStore.getLatestValue()).to.eql({
			watcherCount: 42,
			watchers: {},
		});
	});
});

describe('ChannelState watchers store', () => {
	it('initializes watchers store with an empty watchers map', () => {
		const state = new ChannelState();

		expect(state.watchers).to.eql({});
		expect(state.watcherStore.getLatestValue()).to.eql({
			watcherCount: 0,
			watchers: {},
		});
	});

	it('keeps watchers getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();
		const watchers = {
			alice: { id: 'alice' },
		};

		state.watchers = watchers;

		expect(state.watchers).to.equal(watchers);
		expect(state.watcherStore.getLatestValue()).to.eql({
			watcherCount: 0,
			watchers,
		});
	});
});

describe('ChannelState muted users store', () => {
	it('initializes muted users store with an empty list', () => {
		const state = new ChannelState();

		expect(state.mutedUsers).to.eql([]);
		expect(state.mutedUsersStore.getLatestValue()).to.eql({ mutedUsers: [] });
	});

	it('keeps mutedUsers getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();
		const mutedUsers = [{ id: 'alice' }];

		state.mutedUsers = mutedUsers;

		expect(state.mutedUsers).to.equal(mutedUsers);
		expect(state.mutedUsersStore.getLatestValue()).to.eql({ mutedUsers });
	});
});

describe('ChannelState typing store', () => {
	it('initializes typing store with an empty typing map', () => {
		const state = new ChannelState();

		expect(state.typing).to.eql({});
		expect(state.typingStore.getLatestValue()).to.eql({ typing: {} });
	});

	it('keeps typing store and textComposer typing in sync via setTypingEvent/removeTypingEvent', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {});
		const state = channel.state;
		const typingStartEvent = {
			type: 'typing.start',
			user: { id: 'alice' },
		};

		state.setTypingEvent('alice', typingStartEvent);

		expect(state.typing).to.have.property('alice');
		expect(state.typingStore.getLatestValue().typing).to.have.property('alice');
		expect(channel.messageComposer.textComposer.typing).to.have.property('alice');

		state.removeTypingEvent('alice');

		expect(state.typing).to.not.have.property('alice');
		expect(state.typingStore.getLatestValue().typing).to.not.have.property('alice');
		expect(channel.messageComposer.textComposer.typing).to.not.have.property('alice');
	});
});

describe('ChannelState own capabilities store', () => {
	it('does not redefine channel.data as an accessor property', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {
			own_capabilities: ['send-message'],
		});
		const descriptor = Object.getOwnPropertyDescriptor(channel, 'data');

		expect(descriptor).toBeDefined();
		expect('value' in descriptor).toBe(true);
		expect('get' in descriptor).toBe(false);
		expect('set' in descriptor).toBe(false);
	});

	it('initializes ownCapabilitiesStore from channel.data.own_capabilities', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {
			own_capabilities: ['send-message', 'upload-file'],
		});
		const state = channel.state;

		expect(state.ownCapabilitiesStore.getLatestValue()).to.eql({
			ownCapabilities: ['send-message', 'upload-file'],
		});
		expect(channel.data?.own_capabilities).to.eql(['send-message', 'upload-file']);
	});

	it('syncs ownCapabilitiesStore when channel.data is replaced', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {
			own_capabilities: ['send-message'],
		});
		const state = channel.state;

		channel.data = {
			...channel.data,
			own_capabilities: ['pin-message'],
		};
		state.syncOwnCapabilitiesFromChannelData(channel.data);

		expect(state.ownCapabilitiesStore.getLatestValue()).to.eql({
			ownCapabilities: ['pin-message'],
		});
		expect(channel.data?.own_capabilities).to.eql(['pin-message']);
	});

	it('keeps backward-compatible channel.data.own_capabilities assignments in sync', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {});
		const state = channel.state;

		channel.data.own_capabilities = ['delete-message'];

		expect(state.ownCapabilitiesStore.getLatestValue()).to.eql({
			ownCapabilities: ['delete-message'],
		});
		expect(channel.data.own_capabilities).to.eql(['delete-message']);
	});

	it('only wraps own_capabilities and keeps other channel.data fields as value properties', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {
			hidden: false,
			member_count: 3,
			own_capabilities: ['send-message'],
		});

		const ownCapabilitiesDescriptor = Object.getOwnPropertyDescriptor(
			channel.data,
			'own_capabilities',
		);
		const hiddenDescriptor = Object.getOwnPropertyDescriptor(channel.data, 'hidden');
		const memberCountDescriptor = Object.getOwnPropertyDescriptor(
			channel.data,
			'member_count',
		);

		expect(ownCapabilitiesDescriptor).toBeDefined();
		expect('get' in ownCapabilitiesDescriptor).toBe(true);
		expect('set' in ownCapabilitiesDescriptor).toBe(true);
		expect(hiddenDescriptor).toBeDefined();
		expect('value' in hiddenDescriptor).toBe(true);
		expect('get' in hiddenDescriptor).toBe(false);
		expect('set' in hiddenDescriptor).toBe(false);
		expect(memberCountDescriptor).toBeDefined();
		expect('get' in memberCountDescriptor).toBe(true);
		expect('set' in memberCountDescriptor).toBe(true);
	});

	it('does not overwrite non-capability fields when own_capabilities is updated', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {
			hidden: false,
			member_count: 3,
			own_capabilities: ['send-message'],
		});
		const state = channel.state;

		channel.data.hidden = true;
		channel.data.member_count = 5;
		channel.data.own_capabilities = ['pin-message'];

		expect(channel.data.hidden).to.equal(true);
		expect(channel.data.member_count).to.equal(5);
		expect(state.member_count).to.equal(5);
		expect(state.ownCapabilitiesStore.getLatestValue()).to.eql({
			ownCapabilities: ['pin-message'],
		});
	});
});

describe('findMessage', () => {
	let state;

	beforeEach(() => {
		const client = new StreamChat();
		client.userID = 'userId';
		const channel = new Channel(client, 'type', 'id', {});
		client._addChannelConfig({ cid: channel.cid, config: {} });
		state = new ChannelState(channel);
	});

	it('message not found', async () => {
		state.addMessagesSorted([generateMsg({ id: '5' }), generateMsg({ id: '6' })]);

		expect(state.findMessage('12')).to.eql(undefined);
	});

	describe('if message is a thread reply', () => {
		it('message found', async () => {
			const messageId = '8';
			const parentMessageId = '5';
			const parentMessage = generateMsg({ id: parentMessageId });
			const reply = generateMsg({ id: messageId, parent_id: parentMessageId });
			state.addMessagesSorted([parentMessage]);
			state.addMessagesSorted([reply]);

			expect(state.findMessage(messageId, parentMessageId).id).to.eql(messageId);
		});

		it('message not found', async () => {
			const messageId = '8';
			const parentMessageId = '5';
			const parentMessage = generateMsg({ id: parentMessageId });
			const reply = generateMsg({ id: messageId, parent_id: parentMessageId });
			state.addMessagesSorted([parentMessage]);
			state.addMessagesSorted([reply]);

			expect(state.findMessage(messageId, `not${parentMessageId}`)).to.eql(undefined);
		});
	});
});
