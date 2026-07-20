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
