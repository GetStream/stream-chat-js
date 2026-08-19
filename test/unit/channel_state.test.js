import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';

import { ChannelState, StreamChat, Channel } from '../../src';
import { generateUUIDv4 as uuidv4 } from '../../src/utils';

import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';

const toISOString = (timestampMs) => new Date(timestampMs).toISOString();

describe('ChannelState clean', () => {
	let client;
	let channel;
	beforeEach(() => {
		client = new StreamChat();
		client.user = { id: 'observer' };
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

describe('ChannelState members store', () => {
	it('initializes members store with an empty members map', () => {
		const state = new ChannelState();

		expect(state.members).to.eql({});
		expect(state.member_count).to.equal(0);
		expect(state.getLatestValue()).to.deep.include({
			members: {},
			memberCount: 0,
		});
	});

	it('keeps members getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();
		const members = {
			alice: { user: { id: 'alice' }, user_id: 'alice' },
		};

		state.members = members;

		expect(state.members).to.equal(members);
		expect(state.getLatestValue()).to.deep.include({
			memberCount: 0,
			members,
		});
	});

	it('keeps member_count getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();

		state.member_count = 42;

		expect(state.member_count).to.equal(42);
		expect(state.getLatestValue()).to.deep.include({
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
		expect(state.getLatestValue()).to.deep.include({
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
		state.syncStateFromChannelData(channel.data);

		expect(state.member_count).to.equal(7);
		expect(state.getLatestValue()).to.deep.include({
			memberCount: 7,
			members: {},
		});
		expect(channel.data?.member_count).to.equal(7);
	});

	it('keeps the last known member_count when a data update omits it (sticky fallback)', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', { member_count: 4 });
		const state = channel.state;

		const previousData = channel.data;
		channel.data = { name: 'renamed' };
		state.syncStateFromChannelData(channel.data, previousData);

		expect(state.member_count).to.equal(4);
		expect(state.getLatestValue()).to.deep.include({
			memberCount: 4,
			members: {},
		});
		// sticky value is written back onto the raw data so raw readers stay consistent
		expect(channel.data.member_count).to.equal(4);
	});
});

describe('ChannelState memberCount subscribers', () => {
	it('does NOT re-notify memberCount subscribers on a members-only update', () => {
		const client = new StreamChat();
		const state = new Channel(client, 'type', 'd', { member_count: 2 }).state;
		const seen = [];
		state.subscribeWithSelector(
			(s) => ({ memberCount: s.memberCount }),
			({ memberCount }) => seen.push(memberCount),
		);
		seen.length = 0; // drop the initial subscribe emission

		// a members map churn (presence/watchers/etc.) must not re-notify memberCount subscribers —
		// this is what lets a consumer derive e.g. "is this a 1:1 channel" without paying for it
		state.members = { alice: { user: { id: 'alice' } }, bob: { user: { id: 'bob' } } };

		expect(seen).to.have.length(0);
		expect(state.member_count).to.equal(2);
	});
});

describe('ChannelState read store', () => {
	it('initializes read store with an empty read map', () => {
		const state = new ChannelState();

		expect(state.read).to.eql({});
		expect(state.getLatestValue()).to.deep.include({ read: {} });
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
		expect(state.getLatestValue()).to.deep.include({ read });
	});
});

describe('ChannelState unreadCount', () => {
	let client;
	let channel;

	beforeEach(() => {
		client = new StreamChat('apiKey');
		client.user = { id: 'me' };
		channel = new Channel(client, 'messaging', 'unread-count-id', {});
	});

	it('derives the own count from the read state instead of storing it separately', () => {
		expect(channel.state.unreadCount).to.equal(0);

		channel.state.read = {
			me: { last_read: new Date(0), unread_messages: 7, user: { id: 'me' } },
			alice: { last_read: new Date(0), unread_messages: 3, user: { id: 'alice' } },
		};

		expect(channel.state.unreadCount).to.equal(7);
		expect(channel.countUnread()).to.equal(7);
	});

	it('is 0 while the current user has no read row', () => {
		channel.state.read = {
			alice: { last_read: new Date(0), unread_messages: 3, user: { id: 'alice' } },
		};

		expect(channel.state.unreadCount).to.equal(0);
	});

	it('is 0 without a connected user, and does not throw on a disconnected channel', () => {
		client.user = undefined;
		expect(channel.state.unreadCount).to.equal(0);

		client.user = { id: 'me' };
		channel.state.read = {
			me: { last_read: new Date(0), unread_messages: 4, user: { id: 'me' } },
		};
		channel.disconnected = true;

		expect(() => channel.state.unreadCount).not.to.throw();
		expect(channel.state.unreadCount).to.equal(4);
	});
});

describe('ChannelState watcher count store', () => {
	it('initializes watcher count store with zero', () => {
		const state = new ChannelState();

		expect(state.watcher_count).to.equal(0);
		expect(state.getLatestValue()).to.deep.include({
			watcherCount: 0,
			watchers: {},
		});
	});

	it('keeps watcher_count getter/setter backward compatible while syncing the store', () => {
		const state = new ChannelState();

		state.watcher_count = 42;

		expect(state.watcher_count).to.equal(42);
		expect(state.getLatestValue()).to.deep.include({
			watcherCount: 42,
			watchers: {},
		});
	});
});

describe('ChannelState watchers store', () => {
	it('initializes watchers store with an empty watchers map', () => {
		const state = new ChannelState();

		expect(state.watchers).to.eql({});
		expect(state.getLatestValue()).to.deep.include({
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
		expect(state.getLatestValue()).to.deep.include({
			watcherCount: 0,
			watchers,
		});
	});
});

describe('ChannelState typing store', () => {
	it('initializes typing store with an empty typing map', () => {
		const state = new ChannelState();

		expect(state.typing).to.eql({});
		expect(state.getLatestValue()).to.deep.include({ typing: {} });
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
		expect(state.getLatestValue().typing).to.have.property('alice');
		expect(channel.messageComposer.textComposer.typing).to.have.property('alice');

		state.removeTypingEvent('alice');

		expect(state.typing).to.not.have.property('alice');
		expect(state.getLatestValue().typing).to.not.have.property('alice');
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

		expect(state.getLatestValue()).to.deep.include({
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
		state.syncStateFromChannelData(channel.data);

		expect(state.getLatestValue()).to.deep.include({
			ownCapabilities: ['pin-message'],
		});
		expect(channel.data?.own_capabilities).to.eql(['pin-message']);
	});

	it('keeps the last known own_capabilities when a data update omits them (sticky fallback)', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {
			own_capabilities: ['send-message'],
		});
		const state = channel.state;

		const previousData = channel.data;
		channel.data = { name: 'renamed' };
		state.syncStateFromChannelData(channel.data, previousData);

		expect(state.getLatestValue()).to.deep.include({
			ownCapabilities: ['send-message'],
		});
		// sticky value is written back onto the raw data so channelHasReadEvents stays consistent
		expect(channel.data.own_capabilities).to.eql(['send-message']);
	});

	it('leaves own_capabilities undefined until known (#1732)', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {});

		// unknown on the raw data, but the store slice defaults to an empty array
		expect(channel.data.own_capabilities).to.be.undefined;
		expect(channel.state.getLatestValue().ownCapabilities).to.eql([]);
	});

	it('exposes member_count / own_capabilities as plain value properties (no accessors)', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {
			hidden: false,
			member_count: 3,
			own_capabilities: ['send-message'],
		});

		for (const key of ['own_capabilities', 'hidden', 'member_count']) {
			const descriptor = Object.getOwnPropertyDescriptor(channel.data, key);
			expect(descriptor).toBeDefined();
			expect('value' in descriptor).toBe(true);
			expect('get' in descriptor).toBe(false);
			expect('set' in descriptor).toBe(false);
		}
	});

	it('does not overwrite non-capability fields when channel.data is replaced', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', {
			hidden: false,
			member_count: 3,
			own_capabilities: ['send-message'],
		});
		const state = channel.state;

		const previousData = channel.data;
		channel.data = {
			...channel.data,
			hidden: true,
			member_count: 5,
			own_capabilities: ['pin-message'],
		};
		state.syncStateFromChannelData(channel.data, previousData);

		expect(channel.data.hidden).to.equal(true);
		expect(channel.data.member_count).to.equal(5);
		expect(state.member_count).to.equal(5);
		expect(state.getLatestValue()).to.deep.include({
			ownCapabilities: ['pin-message'],
		});
	});
});

describe('ChannelState unified store', () => {
	it('publishes all slices through one StateStore and preserves siblings on single-key writes', () => {
		const state = new ChannelState();
		const members = { alice: { user: { id: 'alice' }, user_id: 'alice' } };
		const read = {
			alice: { last_read: new Date(0), unread_messages: 2, user: { id: 'alice' } },
		};
		const watchers = { bob: { id: 'bob' } };

		state.members = members;
		state.read = read;
		state.watchers = watchers;
		state.watcher_count = 3;
		state.member_count = 5;
		state.typing = { carol: { type: 'typing.start', user: { id: 'carol' } } };

		// Every slice must survive: the setters go through partialNext, so a single-key write
		// is a shallow merge — NOT a full replace that would wipe siblings. (Teeth-check: if any
		// setter used `.next({ slice })` these references would be lost and this test would fail.)
		const snapshot = state.getLatestValue();
		expect(snapshot.members).to.equal(members);
		expect(snapshot.read).to.equal(read);
		expect(snapshot.watchers).to.equal(watchers);
		expect(snapshot.watcherCount).to.equal(3);
		expect(snapshot.memberCount).to.equal(5);
		expect(snapshot.typing).to.have.property('carol');
	});

	it('is subscribable directly via subscribeWithSelector (useStateStore(channel.state, …))', () => {
		const state = new ChannelState();
		const seen = [];
		const unsubscribe = state.subscribeWithSelector(
			(next) => ({ read: next.read }),
			({ read }) => {
				seen.push(read);
			},
		);

		const read = {
			alice: { last_read: new Date(0), unread_messages: 1, user: { id: 'alice' } },
		};
		state.read = read;
		// a non-read write must NOT emit to a read selector
		state.watcher_count = 9;
		unsubscribe();

		// initial emit + the read change; the watcher_count write is filtered out by the selector
		expect(seen).to.have.length(2);
		expect(seen[1]).to.equal(read);
	});

	it('publishes channel.data reactively so name/image/frozen changes are subscribable', () => {
		const client = new StreamChat();
		const channel = new Channel(client, 'type', 'id', { name: 'orig' });
		const state = channel.state;

		expect(state.getLatestValue().data).to.deep.include({ name: 'orig' });

		const names = [];
		const unsubscribe = state.subscribeWithSelector(
			(next) => ({ name: next.data?.name }),
			({ name }) => {
				names.push(name);
			},
		);

		const previousData = channel.data;
		channel.data = { ...channel.data, name: 'renamed' };
		state.syncStateFromChannelData(channel.data, previousData);
		unsubscribe();

		expect(names).to.eql(['orig', 'renamed']);
	});

	it('proxies the lifecycle flags (initialized/offlineMode/disconnected) through the store', () => {
		const client = new StreamChat();
		client.user = { id: 'me' };
		const channel = new Channel(client, 'messaging', 'lifecycle', {});
		client.activeChannels[channel.cid] = channel;

		expect(channel.initialized).to.equal(false);
		expect(channel.offlineMode).to.equal(false);
		expect(channel.disconnected).to.equal(false);
		expect(channel.state.getLatestValue()).to.deep.include({
			initialized: false,
			offlineMode: false,
			disconnected: false,
		});

		const seen = [];
		const unsubscribe = channel.state.subscribeWithSelector(
			(s) => ({ initialized: s.initialized }),
			({ initialized }) => {
				seen.push(initialized);
			},
		);

		// writing the getter/setter goes through the store, so subscribers are notified
		channel.initialized = true;
		unsubscribe();

		expect(channel.initialized).to.equal(true);
		expect(channel.state.getLatestValue().initialized).to.equal(true);
		expect(seen).to.eql([false, true]);
	});
});
