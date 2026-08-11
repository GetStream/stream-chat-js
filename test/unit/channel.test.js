import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateMsg } from './test-utils/generateMessage';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';
import sinon from 'sinon';
import { mockChannelQueryResponse } from './test-utils/mockChannelQueryResponse';

import { ChannelState, StreamChat } from '../../src';
import { DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE } from '../../src/constants';
import { MockOfflineDB } from './offline-support/MockOfflineDB';
import { formatMessage, generateUUIDv4 as uuidv4 } from '../../src/utils';

import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';

// Seed the channel's messagePaginator "latest" (head) window from raw generated messages.
// The unread/last-message readers now source from `messagePaginator.headItems`/`headmostItem`,
// so tests populate the paginator (formatted) rather than the legacy `state.addMessagesSorted`.
const seedLatestWindow = (channel, messages) =>
	channel.messagePaginator.ingestPage({
		page: messages.map((m) => formatMessage(m)),
		isHead: true,
		isTail: true,
		setActive: true,
	});

describe('Channel count unread', function () {
	let lastRead;
	let ignoredMessages;
	let user;
	let channel;
	let client;
	beforeEach(() => {
		user = { id: 'user' };
		lastRead = new Date('2020-01-01T00:00:00');
		const channelResponse = generateChannel();

		client = new StreamChat('apiKey');
		client.user = user;
		client.user = { id: 'user' };
		client.userMuteStatus = (targetId) => targetId.startsWith('mute');

		channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
		channel.initialized = true;
		channel.lastRead = () => lastRead;
		channel.data.own_capabilities = ['read-events'];

		ignoredMessages = [
			generateMsg({ date: '2018-01-01T00:00:00', mentioned_users: [user] }),
			generateMsg({ date: '2019-01-01T00:00:00' }),
			generateMsg({ date: '2020-01-01T00:00:00' }),
			generateMsg({
				date: '2023-01-01T00:00:00',
				shadowed: true,
				mentioned_users: [user],
			}),
			generateMsg({
				date: '2024-01-01T00:00:00',
				silent: true,
				mentioned_users: [user],
			}),
			generateMsg({
				date: '2025-01-01T00:00:00',
				user: { id: 'mute1' },
				mentioned_users: [user],
			}),
		];
	});

	it('_countMessageAsUnread should return false shadowed or silent messages', function () {
		expect(channel._countMessageAsUnread({ shadowed: true })).not.to.be.ok;
		expect(channel._countMessageAsUnread({ silent: true })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return false for current user messages', function () {
		expect(channel._countMessageAsUnread({ user })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return true for system messages', function () {
		expect(channel._countMessageAsUnread({ type: 'system' })).to.be.true;
	});

	it('_countMessageAsUnread should return false for muted user', function () {
		expect(channel._countMessageAsUnread({ user: { id: 'mute1' } })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return false for channel with read_events off', function () {
		const channel = client.channel('messaging', {
			members: ['tommaso'],
			own_capabilities: [],
		});
		expect(channel._countMessageAsUnread({ user: { id: 'random' } })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return true for unmuted user', function () {
		expect(channel._countMessageAsUnread({ user: { id: 'unmute' } })).to.be.ok;
	});

	it('_countMessageAsUnread should return false for muted channel', function () {
		client.mutedChannels = [{ user, channel }];
		expect(channel._countMessageAsUnread({ user: { id: 'unmute' } })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return true for unmuted channel', function () {
		client.mutedChannels = [];
		expect(channel._countMessageAsUnread({ user: { id: 'unmute' } })).to.be.ok;
	});

	it('_countMessageAsUnread should return true for other messages', function () {
		expect(
			channel._countMessageAsUnread({
				shadowed: false,
				silent: false,
				user: { id: 'random' },
			}),
		).to.be.ok;
	});

	it('countUnread should return state.unreadCount without lastRead', function () {
		expect(channel.countUnread()).to.be.equal(channel.state.unreadCount);
		channel.state.unreadCount = 10;
		expect(channel.countUnread()).to.be.equal(10);
		channel.state.unreadCount = 0;
	});

	it('countUnread should return correct count', function () {
		expect(channel.countUnread(lastRead)).to.be.equal(0);
		// ignoredMessages (shadowed/silent/muted/at-or-before lastRead) must not be counted
		seedLatestWindow(channel, [
			...ignoredMessages,
			generateMsg({ date: '2021-01-01T00:00:00' }),
			generateMsg({ date: '2022-01-01T00:00:00' }),
		]);
		expect(channel.countUnread(lastRead)).to.be.equal(2);
	});

	it('countUnread should read the latest window, not the active one', () => {
		expect(channel.countUnread(lastRead)).to.be.equal(0);
		// latest (head) window
		channel.messagePaginator.ingestPage({
			page: [
				...ignoredMessages,
				generateMsg({ date: '2026-01-01T00:00:00' }),
				generateMsg({ date: '2026-02-01T00:00:00' }),
			].map((m) => formatMessage(m)),
			isHead: true,
			setActive: false,
		});
		// a separate, older window becomes the active (current) one
		channel.messagePaginator.ingestPage({
			page: [formatMessage(generateMsg({ date: '2006-01-01T00:00:00' }))],
			setActive: true,
		});

		expect(channel.countUnread(lastRead)).to.be.equal(2);
	});

	it('countUnreadMentions should return correct count', function () {
		expect(channel.countUnreadMentions()).to.be.equal(0);
		seedLatestWindow(channel, [
			...ignoredMessages,
			generateMsg({
				date: '2021-01-01T00:00:00',
				mentioned_users: [user, { id: 'random' }],
			}),
			generateMsg({
				date: '2022-01-01T00:00:00',
				mentioned_users: [{ id: 'random' }],
			}),
		]);
		expect(channel.countUnreadMentions()).to.be.equal(1);
	});

	it('countUnreadMentions should read the latest window, not the active one', () => {
		expect(channel.countUnreadMentions()).to.be.equal(0);
		// latest (head) window contains the mention
		channel.messagePaginator.ingestPage({
			page: [
				...ignoredMessages,
				generateMsg({
					date: '2021-01-01T00:00:00',
					mentioned_users: [user, { id: 'random' }],
				}),
				generateMsg({ date: '2022-01-01T00:00:00' }),
			].map((m) => formatMessage(m)),
			isHead: true,
			setActive: false,
		});
		// a separate, older window becomes the active (current) one
		channel.messagePaginator.ingestPage({
			page: [formatMessage(generateMsg({ date: '2010-01-01T00:00:00' }))],
			setActive: true,
		});

		expect(channel.countUnreadMentions()).to.be.equal(1);
	});

	describe('channel.lastRead', () => {
		let channelResponse;
		beforeEach(() => {
			channelResponse = generateChannel();
			channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
			channel.initialized = true;
		});

		it('should return null if no last read message', () => {
			expect(channel.lastRead()).to.eq(null);
		});

		it('should return last read message date', () => {
			const last_read = new Date();
			const messages = [generateMsg()];
			channel.state.read[user.id] = {
				last_read,
				last_read_message_id: messages[0].id,
				user: user,
				unread_messages: 0,
			};
			expect(channel.lastRead()).to.eq(last_read);
		});

		it('should return undefined if client user is not set (server-side client)', () => {
			// client.channel() now requires a connected user, so create the channel with the user
			// set, then clear it to model a client with no connected user (userId undefined).
			channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
			channel.initialized = true;
			client.user = undefined;
			expect(channel.lastRead()).to.be.undefined;
		});
	});
});

describe('Channel isViewingLive (unread bump gating)', function () {
	const user = { id: 'user' };
	const otherUser = { id: 'other-user' };

	const setupChannel = () => {
		const client = new StreamChat('apiKey');
		client.user = user;
		client.user = { id: user.id };
		client.userMuteStatus = () => false;
		const channel = client.channel('messaging', 'live-mode-id');
		channel.initialized = true;
		channel.data = { ...channel.data, own_capabilities: ['read-events'] };
		channel.state.unreadCount = 0;
		return { channel };
	};

	const dispatchNewMessageFromOther = (channel) =>
		channel._handleChannelEvent({
			type: 'message.new',
			user: otherUser,
			message: generateMsg({ user: otherUser }),
		});

	it('does not bump the unread count or snapshot on a new message while viewing live', () => {
		const { channel } = setupChannel();
		channel.messagePaginator.setViewingLive(true);

		dispatchNewMessageFromOther(channel);

		expect(channel.countUnread()).to.be.equal(0);
		expect(
			channel.messagePaginator.unreadStateSnapshot.getLatestValue().unreadCount,
		).to.be.equal(0);
	});

	it('bumps the unread count and snapshot on a new message when not viewing live', () => {
		const { channel } = setupChannel();
		// isViewingLive defaults to false

		dispatchNewMessageFromOther(channel);

		expect(channel.countUnread()).to.be.equal(1);
		expect(
			channel.messagePaginator.unreadStateSnapshot.getLatestValue().unreadCount,
		).to.be.equal(1);
	});

	it('setViewingLive no-ops when the value is unchanged', () => {
		const { channel } = setupChannel();
		let emissions = 0;
		channel.messagePaginator.liveViewState.subscribe(() => (emissions += 1));
		emissions = 0; // ignore the immediate subscribe callback

		channel.messagePaginator.setViewingLive(false); // already false
		expect(emissions).to.be.equal(0);

		channel.messagePaginator.setViewingLive(true);
		expect(emissions).to.be.equal(1);
	});
});

describe('Channel localized unread count (isLocalUnreadCountEnabled)', function () {
	const user = { id: 'user' };
	const otherUser = { id: 'other-user' };

	// own_capabilities without 'read-events' models a channel with read events disabled (livestream).
	const setupChannel = ({ isLocalUnreadCountEnabled }) => {
		const client = new StreamChat('apiKey', { isLocalUnreadCountEnabled });
		client.user = user;
		client.user = { id: user.id };
		client.userMuteStatus = () => false;
		const channel = client.channel('messaging', 'live-id');
		channel.initialized = true;
		channel.data = { ...channel.data, own_capabilities: [] };
		return { client, channel };
	};

	it('_countMessageAsUnread returns true with read events off when the flag is set', function () {
		const { channel } = setupChannel({ isLocalUnreadCountEnabled: true });
		expect(channel._countMessageAsUnread({ user: otherUser })).to.be.ok;
	});

	it('_countMessageAsUnread returns false with read events off when the flag is not set', function () {
		const { channel } = setupChannel({ isLocalUnreadCountEnabled: false });
		expect(channel._countMessageAsUnread({ user: otherUser })).not.to.be.ok;
	});

	it('message.new increments the unread count with read events off when the flag is set', function () {
		const { channel } = setupChannel({ isLocalUnreadCountEnabled: true });
		channel.state.unreadCount = 0;

		channel._handleChannelEvent({
			type: 'message.new',
			user: otherUser,
			message: generateMsg({ user: otherUser }),
		});
		expect(channel.countUnread()).to.be.equal(1);

		channel._handleChannelEvent({
			type: 'message.new',
			user: otherUser,
			message: generateMsg({ user: otherUser }),
		});
		expect(channel.countUnread()).to.be.equal(2);
	});

	it('message.new does not increment the unread count with read events off when the flag is not set', function () {
		const { channel } = setupChannel({ isLocalUnreadCountEnabled: false });
		channel.state.unreadCount = 0;

		channel._handleChannelEvent({
			type: 'message.new',
			user: otherUser,
			message: generateMsg({ user: otherUser }),
		});
		expect(channel.countUnread()).to.be.equal(0);
	});

	it('markReadLocally resets the count and emits a message.read-shaped message.read_locally event', function () {
		const { client, channel } = setupChannel({ isLocalUnreadCountEnabled: true });
		// markReadLocally is purely local; assert it performs no HTTP request via the api seam.
		const sendRequest = vi
			.spyOn(client.api, 'sendRequest')
			.mockResolvedValue({ body: {}, metadata: {} });
		const lastMsg = generateMsg({ user: otherUser });
		seedLatestWindow(channel, [lastMsg]);
		channel.state.unreadCount = 5;
		channel.state.read[user.id] = {
			last_read: new Date('2020-01-01T00:00:00'),
			unread_messages: 5,
			user,
		};

		const onLocalRead = vi.fn();
		channel.on('message.read_locally', onLocalRead);

		const returned = channel.markReadLocally();

		expect(channel.countUnread()).to.be.equal(0);
		expect(channel.state.read[user.id].unread_messages).to.be.equal(0);
		expect(channel.state.read[user.id].last_read_message_id).to.be.equal(lastMsg.id);
		expect(sendRequest.mock.calls.length).to.be.equal(0);

		expect(onLocalRead.mock.calls.length).to.be.equal(1);
		const event = onLocalRead.mock.calls[0][0];
		expect(event.type).to.be.equal('message.read_locally');
		expect(event.cid).to.be.equal(channel.cid);
		expect(event.channel_id).to.be.equal(channel.id);
		expect(event.channel_type).to.be.equal(channel.type);
		expect(event.user.id).to.be.equal(user.id);
		expect(event.last_read_message_id).to.be.equal(lastMsg.id);
		// markReadLocally now builds the event with a Date `created_at` (not an ISO string).
		expect(event.created_at).to.be.instanceof(Date);

		// markReadLocally returns the same dispatched event so callers (e.g. the RN SDK) can sync
		// their own unread UI from that read info instead of re-deriving it.
		expect(returned).to.equal(event);
		expect(returned.last_read_message_id).to.be.equal(lastMsg.id);
		expect(returned.created_at).to.be.instanceof(Date);
	});

	it('markReadLocally returns undefined and dispatches nothing when there is no connected user', function () {
		const { client, channel } = setupChannel({ isLocalUnreadCountEnabled: true });
		client.user = undefined;
		const onLocalRead = vi.fn();
		channel.on('message.read_locally', onLocalRead);

		const returned = channel.markReadLocally();

		expect(returned).to.be.undefined;
		expect(onLocalRead.mock.calls.length).to.be.equal(0);
	});

	it('markReadLocally resets the count and creates the own read row when none exists yet (fresh livestream)', function () {
		const { client, channel } = setupChannel({ isLocalUnreadCountEnabled: true });
		const sendRequest = vi
			.spyOn(client.api, 'sendRequest')
			.mockResolvedValue({ body: {}, metadata: {} });
		const lastMsg = generateMsg({ user: otherUser });
		seedLatestWindow(channel, [lastMsg]);
		channel.state.unreadCount = 3;
		delete channel.state.read[user.id];

		channel.markReadLocally();

		expect(channel.countUnread()).to.be.equal(0);
		expect(channel.state.read[user.id]).to.be.ok;
		expect(channel.state.read[user.id].unread_messages).to.be.equal(0);
		expect(channel.state.read[user.id].last_read_message_id).to.be.equal(lastMsg.id);
		expect(sendRequest.mock.calls.length).to.be.equal(0);
	});
});

describe('Channel _handleChannelEvent', function () {
	const user = { id: 'user' };
	const otherUser = { id: 'other-user' };
	let client;
	let channel;

	beforeEach(() => {
		client = new StreamChat('apiKey');
		client.user = user;
		client.user = { id: user.id };
		client.userMuteStatus = (targetId) => targetId.startsWith('mute');
		channel = client.channel('messaging', 'id');
		channel.data.own_capabilities = ['read-events'];
		channel.initialized = true;
	});

	const makePinned = (id, dateISO, overrides = {}) =>
		generateMsg({
			id,
			cid: channel.cid,
			pinned: true,
			pinned_at: dateISO,
			date: dateISO,
			...overrides,
		});

	const seedPinned = (messages) =>
		channel.pinnedMessagesPaginator.ingestPage({
			page: messages.map(formatMessage),
			isHead: true,
			isTail: true,
			setActive: true,
		});

	const pinnedIds = () => channel.pinnedMessagesPaginator.items?.map((m) => m.id) ?? [];

	describe('member.added / member.updated / member.removed', () => {
		it('member.updated/member.added are being handled properly (ChannelState.membership & ChannelState.members)', () => {
			expect(channel.state.members).to.be.empty;
			expect(channel.state.membership).to.be.empty;

			const currentMember = generateMember({
				user,
				pinned_at: new Date().toISOString(),
				archived_at: new Date().toISOString(),
			});

			const otherMember = generateMember({
				user: { id: 'user-other' },
			});

			channel._handleChannelEvent({
				type: 'member.added',
				user,
				member: currentMember,
			});

			expect(channel.state.members).to.have.property(user.id);
			expect(channel.state.members[user.id]).to.deep.equal(currentMember);
			expect(channel.state.membership).to.deep.equal(currentMember);

			channel._handleChannelEvent({
				type: 'member.added',
				user,
				member: otherMember,
			});

			expect(channel.state.members).to.have.keys([user.id, otherMember.user.id]);
			expect(channel.state.members[otherMember.user.id]).to.deep.equal(otherMember);
			expect(channel.state.members[user.id]).to.deep.equal(currentMember);
			expect(channel.state.membership).to.deep.equal(currentMember);

			const currentMemberUpdated = generateMember({
				user,
				pinned_at: null,
				archived_at: null,
			});

			channel._handleChannelEvent({
				type: 'member.updated',
				user,
				member: currentMemberUpdated,
			});

			expect(channel.state.membership).to.not.have.keys(['pinned_at', 'archived_at']);
			expect(channel.state.membership).to.equal(channel.state.members[user.id]);
		});

		it('does not change channel.data.member_count on member.added or member.removed', () => {
			channel.data = { member_count: 5 };

			const newMember = generateMember({ user: { id: 'user-new' } });

			channel._handleChannelEvent({
				type: 'member.added',
				user: newMember.user,
				member: newMember,
			});

			expect(channel.data.member_count).to.equal(5);

			channel._handleChannelEvent({
				type: 'member.removed',
				user: newMember.user,
				member: newMember,
			});

			expect(channel.data.member_count).to.equal(5);
		});
	});

	describe('message.new', () => {
		it('message.new does not reset the unreadCount for current user messages', function () {
			channel.state.unreadCount = 100;
			channel._handleChannelEvent({
				type: 'message.new',
				user,
				message: generateMsg(),
			});

			expect(channel.state.unreadCount).to.be.equal(100);
		});

		it('message.new does not reset the unreadCount for own thread replies', function () {
			channel.state.unreadCount = 100;
			channel._handleChannelEvent({
				type: 'message.new',
				user,
				message: generateMsg({
					parent_id: 'parentId',
					type: 'reply',
					user,
				}),
			});

			expect(channel.state.unreadCount).to.be.equal(100);
		});

		it('message.new does not reset the unreadCount for others thread replies', function () {
			channel.state.unreadCount = 100;
			channel._handleChannelEvent({
				type: 'message.new',
				user: { id: 'id' },
				message: generateMsg({
					parent_id: 'parentId',
					type: 'reply',
					user: { id: 'id' },
				}),
			});

			expect(channel.state.unreadCount).to.be.equal(100);
		});

		it('message.new ingests message into messagePaginator even for own messages', function () {
			const message = generateMsg({ id: 'own-message-id', user });

			channel._handleChannelEvent({
				type: 'message.new',
				user,
				message,
			});

			expect(channel.messagePaginator.getItem(message.id)?.id).to.equal(message.id);
		});

		it('message.new ignores thread replies in messagePaginator', function () {
			const message = generateMsg({
				id: 'thread-reply-message-id',
				parent_id: 'parent-message-id',
				user: { id: 'another-user' },
			});

			channel._handleChannelEvent({
				type: 'message.new',
				user: message.user,
				message,
			});

			expect(channel.messagePaginator.getItem(message.id)).to.be.undefined;
		});

		it('message.new increment unreadCount properly', function () {
			channel.state.unreadCount = 20;
			channel._handleChannelEvent({
				type: 'message.new',
				user: { id: 'id' },
				message: generateMsg({ user: { id: 'id' } }),
			});
			expect(channel.state.unreadCount).to.be.equal(21);
			channel._handleChannelEvent({
				type: 'message.new',
				user: { id: 'id2' },
				message: generateMsg({ user: { id: 'id2' } }),
			});
			expect(channel.state.unreadCount).to.be.equal(22);
		});

		it('message.new skip increment for silent/shadowed/muted messages', function () {
			channel.state.unreadCount = 30;
			channel._handleChannelEvent({
				type: 'message.new',
				user: { id: 'id' },
				message: generateMsg({ silent: true }),
			});
			expect(channel.state.unreadCount).to.be.equal(30);
			channel._handleChannelEvent({
				type: 'message.new',
				user: { id: 'id2' },
				message: generateMsg({ shadowed: true }),
			});
			expect(channel.state.unreadCount).to.be.equal(30);
			channel._handleChannelEvent({
				type: 'message.new',
				user: { id: 'mute1' },
				message: generateMsg({ user: { id: 'mute1' } }),
			});
			expect(channel.state.unreadCount).to.be.equal(30);
		});

		it('should include unread_messages for message events from another user', () => {
			channel.state.read['id'] = {
				unread_messages: 2,
			};

			const message = generateMsg();

			const events = [
				'message.read',
				'message.deleted',
				'message.new',
				'message.updated',
				'member.added',
				'member.updated',
				'member.removed',
			];

			for (const event of events) {
				channel.state.read['id'].unread_messages = 2;
				channel._handleChannelEvent({
					type: event,
					user: { id: 'id' },
					message,
				});
				expect(
					channel.state.read['id'].unread_messages,
					`${event} should not be undefined`,
				).not.to.be.undefined;
			}
		});

		it('should include unread_messages for message events from the current user', () => {
			channel.state.read[client.user.id] = {
				unread_messages: 2,
			};

			const message = generateMsg({ user: { id: client.userID } });

			const events = [
				'message.read',
				'message.deleted',
				'message.new',
				'message.updated',
				'member.added',
				'member.updated',
				'member.removed',
			];

			for (const event of events) {
				channel.state.read['id'] = {
					unread_messages: 2,
				};

				channel._handleChannelEvent({
					type: event,
					user: { id: client.user.id },
					message,
				});
				expect(
					channel.state.read[client.user.id].unread_messages,
					`${event} should not be undefined`,
				).not.to.be.undefined;
			}
		});

		// Also covers the message.updated unpin path: a pinned message unpinned via
		// message.updated is removed from the pinnedMessagesPaginator.
		it('feeds the pinnedMessagesPaginator on pin and unpin events', () => {
			const existing = generateMsg({
				id: 'pinned-existing',
				cid: channel.cid,
				pinned: true,
				pinned_at: new Date('2020-01-01T00:00:00.001Z').toISOString(),
			});
			channel.pinnedMessagesPaginator.ingestPage({
				page: [formatMessage(existing)],
				isHead: true,
				isTail: true,
				setActive: true,
			});
			expect(channel.pinnedMessagesPaginator.items?.map((m) => m.id)).to.eql([
				'pinned-existing',
			]);

			// A newly pinned message arrives → auto-added.
			const newlyPinned = generateMsg({
				id: 'pinned-new',
				cid: channel.cid,
				pinned: true,
				pinned_at: new Date('2020-01-01T00:00:00.002Z').toISOString(),
			});
			channel._handleChannelEvent({ type: 'message.new', message: newlyPinned, user });
			expect(channel.pinnedMessagesPaginator.items?.map((m) => m.id)).to.include(
				'pinned-new',
			);

			// The existing message is unpinned via message.updated → auto-removed.
			channel._handleChannelEvent({
				type: 'message.updated',
				message: { ...existing, pinned: false, pinned_at: null },
			});
			expect(channel.pinnedMessagesPaginator.items?.map((m) => m.id)).to.not.include(
				'pinned-existing',
			);
		});
	});

	describe('message.updated', () => {
		it('message.updated syncs reply metadata into messagePaginator', function () {
			const parentMessage = generateMsg({
				id: 'parent-message-id',
				reply_count: 1,
				thread_participants: [{ id: 'user-1' }],
			});

			channel.messagePaginator.ingestItem(parentMessage);

			channel._handleChannelEvent({
				type: 'message.updated',
				message: {
					...parentMessage,
					reply_count: 29,
					thread_participants: [{ id: 'user-1' }, { id: 'user-2' }],
				},
			});

			const parentFromPaginator = channel.messagePaginator.getItem(parentMessage.id);
			expect(parentFromPaginator?.reply_count).to.be.equal(29);
			expect(parentFromPaginator?.thread_participants).to.have.length(2);
		});

		it('message.updated ignores thread replies in messagePaginator', function () {
			const parentMessage = generateMsg({ id: 'thread-parent-id' });
			const threadReply = generateMsg({
				id: 'thread-reply-id',
				parent_id: parentMessage.id,
				text: 'before update',
			});

			channel.messagePaginator.ingestItem(parentMessage);
			channel._handleChannelEvent({
				type: 'message.updated',
				message: { ...threadReply, text: 'after update' },
			});

			expect(channel.messagePaginator.getItem(threadReply.id)).to.be.undefined;
		});

		it('message.updated syncs quoted_message references in messagePaginator', function () {
			const quotedMessage = generateMsg({
				id: 'quoted-message-id',
				text: 'before update',
			});
			const quoteCarrier = generateMsg({
				id: 'quote-carrier-id',
				quoted_message_id: quotedMessage.id,
				quoted_message: quotedMessage,
			});

			channel.messagePaginator.setItems({
				valueOrFactory: [quotedMessage, quoteCarrier],
				isFirstPage: true,
				isLastPage: true,
			});

			channel._handleChannelEvent({
				type: 'message.updated',
				message: {
					...quotedMessage,
					text: 'after update',
				},
			});

			expect(
				channel.messagePaginator.getItem(quoteCarrier.id)?.quoted_message?.text,
			).to.equal('after update');
		});

		// Also covers message.deleted (both event payloads are enriched with own_reactions).
		it('should extend "message.updated" and "message.deleted" event payloads with "own_reactions"', () => {
			const own_reactions = [
				{
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					type: 'wow',
				},
			];
			// Thread-reply own_reactions preservation is owned by the Thread object (covered in
			// threads.test.ts); at the channel level only the paginator-backed message list is enriched.
			const message = generateMsg({ own_reactions });
			seedLatestWindow(channel, [message]);

			['message.updated', 'message.deleted'].forEach((eventType) => {
				let receivedEvent;
				channel.on(eventType, (e) => (receivedEvent = e));

				const event = {
					type: eventType,
					// own_reactions is always [] in WS events
					message: { ...message, own_reactions: [] },
				};
				channel._handleChannelEvent(event);
				channel._callChannelListeners(event);

				const stored = channel.messagePaginator.getItem(message.id);
				expect(stored.own_reactions.length).to.equal(own_reactions.length);
				expect(receivedEvent.message.own_reactions.length).to.equal(own_reactions.length);
			});
		});

		// Also covers message.deleted (quoted_message references update on both events).
		it('should update quoted_message references on "message.updated" and "message.deleted" event', () => {
			// Thread-reply quoted-message updates are owned by the Thread object (Thread.messagePaginator
			// .reflectQuotedMessageUpdate); this exercises the channel's paginator-backed message list.
			const originalText = 'XX';
			const updatedText = 'YY';
			const quoted_message = generateMsg({
				date: new Date(2).toISOString(),
				id: 'quoted-message',
				text: originalText,
			});
			const quotingMessage = generateMsg({
				date: new Date(3).toISOString(),
				id: 'quoting-message',
				quoted_message,
				quoted_message_id: quoted_message.id,
			});
			const updatedQuotedMessage = { ...quoted_message, text: updatedText };
			['message.updated', 'message.deleted'].forEach((eventType) => {
				seedLatestWindow(channel, [quoted_message, quotingMessage]);
				const event = { type: eventType, message: updatedQuotedMessage };
				channel._handleChannelEvent(event);
				const stored = channel.messagePaginator.getItem(quotingMessage.id);
				expect(stored.quoted_message.text).to.equal(updatedQuotedMessage.text);
				channel.messagePaginator.clearStateAndCache();
			});
		});
	});

	describe('message.undeleted', () => {
		it('message.undeleted ignores thread replies in messagePaginator', function () {
			const parentMessage = generateMsg({ id: 'thread-parent-id-2' });
			const threadReply = generateMsg({
				id: 'thread-reply-id-2',
				parent_id: parentMessage.id,
				text: 'undeleted reply',
			});

			channel.messagePaginator.ingestItem(parentMessage);
			channel._handleChannelEvent({
				type: 'message.undeleted',
				message: threadReply,
			});

			expect(channel.messagePaginator.getItem(threadReply.id)).to.be.undefined;
		});

		it('message.undeleted syncs quoted_message references in messagePaginator', function () {
			const quotedMessage = generateMsg({
				id: 'quoted-message-id-undeleted',
				type: 'deleted',
				text: 'before undelete',
			});
			const quoteCarrier = generateMsg({
				id: 'quote-carrier-id-undeleted',
				quoted_message_id: quotedMessage.id,
				quoted_message: quotedMessage,
			});

			channel.messagePaginator.setItems({
				valueOrFactory: [quotedMessage, quoteCarrier],
				isFirstPage: true,
				isLastPage: true,
			});

			channel._handleChannelEvent({
				type: 'message.undeleted',
				message: {
					...quotedMessage,
					type: 'regular',
					text: 'after undelete',
				},
			});

			expect(
				channel.messagePaginator.getItem(quoteCarrier.id)?.quoted_message?.text,
			).to.equal('after undelete');
			expect(
				channel.messagePaginator.getItem(quoteCarrier.id)?.quoted_message?.type,
			).to.equal('regular');
		});
	});

	describe('channel.truncated', () => {
		it('message.truncate removes all messages if "truncated_at" is "now"', function () {
			const messages = [
				{ created_at: '2021-01-01T00:01:00' },
				{ created_at: '2021-01-01T00:02:00' },
				{ created_at: '2021-01-01T00:03:00' },
			].map(generateMsg);

			seedLatestWindow(channel, messages);
			expect(channel.messagePaginator.headItems.length).to.be.equal(3);

			channel._handleChannelEvent({
				type: 'channel.truncated',
				user: { id: 'id' },
				channel: {
					truncated_at: new Date().toISOString(),
				},
			});

			expect(channel.messagePaginator.headItems.length).to.be.equal(0);
		});

		it('message.truncate clears messagePaginator unread snapshot', function () {
			const cachedMessage = generateMsg({
				date: '2020-01-01T00:00:00.000Z',
				id: 'truncate-cached-message-id',
			});
			channel.messagePaginator.setItems({
				valueOrFactory: [cachedMessage],
				isFirstPage: true,
				isLastPage: true,
			});
			channel.messagePaginator.setUnreadSnapshot({
				firstUnreadMessageId: 'm-1',
				lastReadAt: new Date('2021-01-01T00:00:00.000Z'),
				lastReadMessageId: 'm-0',
				unreadCount: 7,
			});

			channel._handleChannelEvent({
				type: 'channel.truncated',
				user: { id: 'id' },
				channel: {
					truncated_at: new Date().toISOString(),
				},
			});

			expect(channel.messagePaginator.unreadStateSnapshot.getLatestValue()).toEqual({
				firstUnreadMessageId: null,
				lastReadAt: null,
				lastReadMessageId: null,
				unreadCount: 0,
			});
			// Partial truncate (truncated_at in the past) prunes the older-than-cutoff message; the
			// emptied active window resolves to an empty item list.
			expect(channel.messagePaginator.items ?? []).toEqual([]);
			expect(channel.messagePaginator.getItem(cachedMessage.id)).toBeUndefined();
		});

		it('message.truncate removes messages up to specified date', function () {
			const messages = [
				{ created_at: '2021-01-01T00:01:00' },
				{ created_at: '2021-01-01T00:02:00' },
				{ created_at: '2021-01-01T00:03:00' },
			].map(generateMsg);

			seedLatestWindow(channel, messages);
			expect(channel.messagePaginator.headItems.length).to.be.equal(3);

			channel._handleChannelEvent({
				type: 'channel.truncated',
				user: { id: 'id' },
				channel: {
					truncated_at: messages[1].created_at,
				},
			});

			expect(channel.messagePaginator.headItems.length).to.be.equal(2);
		});

		it('prunes pinned messages older than the cutoff on a partial channel.truncated', () => {
			seedPinned([
				makePinned('old', '2020-01-01T00:00:00.000Z'),
				makePinned('new', '2020-03-01T00:00:00.000Z'),
			]);
			expect(pinnedIds()).to.eql(['old', 'new']);

			channel._handleChannelEvent({
				type: 'channel.truncated',
				channel: { truncated_at: '2020-02-01T00:00:00.000Z' },
			});

			expect(pinnedIds()).to.eql(['new']);
		});

		it('clears pinned messages on a full channel.truncated', () => {
			seedPinned([makePinned('p', '2020-01-01T00:00:00.000Z')]);

			channel._handleChannelEvent({ type: 'channel.truncated', channel: {} });

			expect(pinnedIds()).to.eql([]);
		});
	});

	describe('message.deleted', () => {
		it('message.delete removes quoted messages references', function () {
			const originalMessage = generateMsg({ silent: true });
			channel._handleChannelEvent({
				type: 'message.new',
				user: { id: 'id' },
				message: originalMessage,
			});

			const quotingMessage = generateMsg({
				silent: true,
				quoted_message: originalMessage,
				quoted_message_id: originalMessage.id,
			});

			channel._handleChannelEvent({
				type: 'message.new',
				user: { id: 'id2' },
				message: quotingMessage,
			});

			channel._handleChannelEvent({
				type: 'message.deleted',
				user: { id: 'id' },
				message: { ...originalMessage, deleted_at: new Date().toISOString() },
			});

			expect(
				channel.messagePaginator.getItem(quotingMessage.id).quoted_message.deleted_at,
			).to.be.ok;
		});

		it('message.deleted hard delete removes message from messagePaginator', function () {
			const message = generateMsg({ id: 'hard-delete-message-id', silent: true });
			channel.messagePaginator.ingestItem(message);
			expect(channel.messagePaginator.getItem(message.id)?.id).to.equal(message.id);

			channel._handleChannelEvent({
				type: 'message.deleted',
				user: { id: 'id' },
				hard_delete: true,
				message,
			});

			expect(
				channel.messagePaginator.items?.find((m) => m.id === message.id),
			).toBeUndefined();
		});

		it('message.deleted soft delete updates message in messagePaginator', function () {
			const message = generateMsg({
				id: 'soft-delete-message-id',
				text: 'before delete',
			});
			channel.messagePaginator.ingestItem(message);

			const deletedAt = new Date().toISOString();
			channel._handleChannelEvent({
				type: 'message.deleted',
				user: { id: 'id' },
				message: { ...message, deleted_at: deletedAt },
			});

			const itemFromPaginator = channel.messagePaginator.getItem(message.id);
			expect(itemFromPaginator?.deleted_at?.toISOString()).to.equal(deletedAt);
		});

		it('message.deleted (soft) ignores thread replies in messagePaginator', function () {
			const parentMessage = generateMsg({ id: 'thread-parent-id-on-delete' });
			const threadReply = generateMsg({
				id: 'thread-reply-id-on-delete',
				parent_id: parentMessage.id,
			});

			channel.messagePaginator.ingestItem(parentMessage);
			channel._handleChannelEvent({
				type: 'message.deleted',
				user: { id: 'id' },
				message: { ...threadReply, deleted_at: new Date().toISOString() },
			});

			// A pure thread reply must never leak a "deleted" placeholder into the channel list.
			expect(channel.messagePaginator.getItem(threadReply.id)).to.be.undefined;
		});

		it('message.deleted (hard) ignores thread replies in messagePaginator', function () {
			const parentMessage = generateMsg({ id: 'thread-parent-id-on-hard-delete' });
			const threadReply = generateMsg({
				id: 'thread-reply-id-on-hard-delete',
				parent_id: parentMessage.id,
			});

			channel.messagePaginator.ingestItem(parentMessage);
			channel._handleChannelEvent({
				type: 'message.deleted',
				user: { id: 'id' },
				hard_delete: true,
				message: threadReply,
			});

			expect(channel.messagePaginator.getItem(parentMessage.id)?.id).to.equal(
				parentMessage.id,
			);
			expect(channel.messagePaginator.getItem(threadReply.id)).to.be.undefined;
		});

		it('message.deleted syncs quoted_message references in messagePaginator', function () {
			const quotedMessage = generateMsg({
				id: 'quoted-message-id-on-delete',
				text: 'before delete',
			});
			const quoteCarrier = generateMsg({
				id: 'quote-carrier-id-on-delete',
				quoted_message_id: quotedMessage.id,
				quoted_message: quotedMessage,
			});

			channel.messagePaginator.setItems({
				valueOrFactory: [quotedMessage, quoteCarrier],
				isFirstPage: true,
				isLastPage: true,
			});

			channel._handleChannelEvent({
				type: 'message.deleted',
				user: { id: 'id' },
				message: {
					...quotedMessage,
					type: 'deleted',
					text: 'after delete',
					deleted_at: new Date().toISOString(),
				},
			});

			expect(
				channel.messagePaginator.getItem(quoteCarrier.id)?.quoted_message?.type,
			).to.equal('deleted');
		});

		it('removes a pinned message on hard delete', () => {
			const msg = makePinned('p', '2020-01-01T00:00:00.000Z');
			seedPinned([msg]);

			channel._handleChannelEvent({
				type: 'message.deleted',
				message: msg,
				hard_delete: true,
			});

			expect(pinnedIds()).to.not.include('p');
		});
	});

	describe('reaction.new', () => {
		it('reaction.new ingests message into messagePaginator for non-thread messages', function () {
			const message = generateMsg({ id: 'reaction-channel-message-id' });

			channel._handleChannelEvent({
				type: 'reaction.new',
				message,
				reaction: {
					type: 'love',
					user_id: 'user-1',
					message_id: message.id,
					created_at: new Date().toISOString(),
				},
			});

			expect(channel.messagePaginator.getItem(message.id)?.id).to.equal(message.id);
		});

		it('reaction.new ignores thread replies in messagePaginator', function () {
			const message = generateMsg({
				id: 'reaction-thread-message-id',
				parent_id: 'thread-parent-id',
			});

			channel._handleChannelEvent({
				type: 'reaction.new',
				message,
				reaction: {
					type: 'love',
					user_id: 'user-1',
					message_id: message.id,
					created_at: new Date().toISOString(),
				},
			});

			expect(channel.messagePaginator.getItem(message.id)).to.be.undefined;
		});

		it('reflects a reaction on a pinned message', () => {
			const msg = makePinned('p', '2020-01-01T00:00:00.000Z', { own_reactions: [] });
			seedPinned([msg]);

			channel._handleChannelEvent({
				type: 'reaction.new',
				message: { ...msg, own_reactions: [] },
				reaction: {
					type: 'like',
					user_id: user.id,
					message_id: 'p',
					created_at: new Date().toISOString(),
				},
			});

			const item = channel.pinnedMessagesPaginator.getItem('p');
			expect(item?.own_reactions?.some((r) => r.type === 'like')).to.be.true;
		});
	});

	describe('reaction.deleted', () => {
		// The parametrized cases also cover reaction.updated.
		['reaction.deleted', 'reaction.updated'].forEach((eventType) => {
			it(`${eventType} ingests message into messagePaginator for non-thread messages`, function () {
				const message = generateMsg({ id: `${eventType}-channel-message-id` });

				channel._handleChannelEvent({
					type: eventType,
					message,
					reaction: {
						type: 'love',
						user_id: 'user-1',
						message_id: message.id,
						created_at: new Date().toISOString(),
					},
				});

				expect(channel.messagePaginator.getItem(message.id)?.id).to.equal(message.id);
			});

			it(`${eventType} ignores thread replies in messagePaginator`, function () {
				const message = generateMsg({
					id: `${eventType}-thread-message-id`,
					parent_id: 'thread-parent-id',
				});

				channel._handleChannelEvent({
					type: eventType,
					message,
					reaction: {
						type: 'love',
						user_id: 'user-1',
						message_id: message.id,
						created_at: new Date().toISOString(),
					},
				});

				expect(channel.messagePaginator.getItem(message.id)).to.be.undefined;
			});
		});
	});

	describe('user.messages.deleted', () => {
		const bannedUser = { id: 'banned-user' };
		const otherUser = { id: 'other-user' };

		it('updates messagePaginator items on soft delete', () => {
			const deletedAt = new Date('2025-02-01T14:01:30.000Z');
			const bannedMessage = generateMsg({ id: 'mp-soft-banned', user: bannedUser });
			const quoteCarrier = generateMsg({
				id: 'mp-soft-quote-carrier',
				quoted_message: bannedMessage,
				quoted_message_id: bannedMessage.id,
				user: otherUser,
			});
			channel.messagePaginator.setItems({
				valueOrFactory: [bannedMessage, quoteCarrier],
				isFirstPage: true,
				isLastPage: true,
			});

			channel._handleChannelEvent({
				type: 'user.messages.deleted',
				cid: channel.cid,
				channel_type: channel.type,
				channel_id: channel.id,
				user: bannedUser,
				soft_delete: true,
				created_at: deletedAt.toISOString(),
			});

			const deletedFromPaginator = channel.messagePaginator.getItem(bannedMessage.id);
			expect(deletedFromPaginator?.type).to.equal('deleted');
			expect(deletedFromPaginator?.deleted_at?.toISOString()).to.equal(
				deletedAt.toISOString(),
			);

			const quoteCarrierFromPaginator = channel.messagePaginator.getItem(quoteCarrier.id);
			expect(quoteCarrierFromPaginator?.quoted_message?.type).to.equal('deleted');
			expect(
				quoteCarrierFromPaginator?.quoted_message?.deleted_at?.toISOString(),
			).to.equal(deletedAt.toISOString());
		});

		it('updates messagePaginator items on hard delete', () => {
			const deletedAt = new Date('2025-02-01T14:01:30.000Z');
			const bannedMessage = generateMsg({ id: 'mp-hard-banned', user: bannedUser });
			const quoteCarrier = generateMsg({
				id: 'mp-hard-quote-carrier',
				quoted_message: bannedMessage,
				quoted_message_id: bannedMessage.id,
				user: otherUser,
			});
			channel.messagePaginator.setItems({
				valueOrFactory: [bannedMessage, quoteCarrier],
				isFirstPage: true,
				isLastPage: true,
			});

			channel._handleChannelEvent({
				type: 'user.messages.deleted',
				cid: channel.cid,
				channel_type: channel.type,
				channel_id: channel.id,
				user: bannedUser,
				hard_delete: true,
				created_at: deletedAt.toISOString(),
			});

			expect(
				channel.messagePaginator.items?.find((m) => m.id === bannedMessage.id),
			).toBeUndefined();
			const quoteCarrierFromPaginator = channel.messagePaginator.getItem(quoteCarrier.id);
			expect(quoteCarrierFromPaginator?.quoted_message?.type).to.equal('deleted');
			expect(
				quoteCarrierFromPaginator?.quoted_message?.deleted_at?.toISOString(),
			).to.equal(deletedAt.toISOString());
		});

		// Pinned-message deletion for a banned user (moved from the pinnedMessagesPaginator suite).
		it("marks a banned user's pinned messages deleted on user.messages.deleted (soft)", () => {
			seedPinned([makePinned('p', '2020-01-01T00:00:00.000Z', { user: bannedUser })]);

			channel._handleChannelEvent({
				type: 'user.messages.deleted',
				user: bannedUser,
				soft_delete: true,
				created_at: '2025-01-01T00:00:00.000Z',
			});

			expect(channel.pinnedMessagesPaginator.getItem('p')?.type).to.equal('deleted');
		});

		it("removes a banned user's pinned messages on user.messages.deleted (hard)", () => {
			seedPinned([
				makePinned('p', '2020-01-01T00:00:00.000Z', { user: bannedUser }),
				makePinned('other', '2020-01-02T00:00:00.000Z', { user: otherUser }),
			]);

			channel._handleChannelEvent({
				type: 'user.messages.deleted',
				user: bannedUser,
				hard_delete: true,
				created_at: '2025-01-01T00:00:00.000Z',
			});

			expect(channel.pinnedMessagesPaginator.items?.map((m) => m.id)).to.eql(['other']);
		});
	});

	// Regression coverage for GetStream/stream-chat-js#1736 at the per-channel event entry point
	// (channel.ts → _handleChannelEvent → messagePaginator.applyMessageDeletionForUser). Mirrors
	// the global-event regression suite in client.test.js but exercises the channel-scoped
	// user.messages.deleted event (one carrying a cid).
	describe('user.messages.deleted — quoted_message regression (#1736)', () => {
		const bannedUser = { id: 'banned-user' };

		it('does not throw on channel-scoped hard-delete when channel contains a same-user self-quote', () => {
			const m1 = generateMsg({
				created_at: '2020-01-01T00:00:01.000Z',
				user: bannedUser,
			});
			const m2 = generateMsg({
				created_at: '2020-01-01T00:00:02.000Z',
				user: bannedUser,
				quoted_message: m1,
				quoted_message_id: m1.id,
			});
			channel.messagePaginator.setItems({
				valueOrFactory: [m1, m2],
				isFirstPage: true,
				isLastPage: true,
			});

			const event = {
				type: 'user.messages.deleted',
				cid: channel.cid,
				channel_type: channel.type,
				channel_id: channel.id,
				user: bannedUser,
				hard_delete: true,
				created_at: '2025-02-01T14:01:30.000Z',
			};

			expect(() => channel._handleChannelEvent(event)).not.to.throw();

			// Both messages belong to the banned user, so a hard delete drops both from the
			// active window. The point of the regression is that the self-quote (m2 → m1) does
			// not throw while doing so.
			const items = channel.messagePaginator.items ?? [];
			expect(items.find((m) => m.id === m1.id)).to.equal(undefined);
			expect(items.find((m) => m.id === m2.id)).to.equal(undefined);
		});
	});

	describe('notification.mark_unread', () => {
		let initialCountUnread;
		let initialReadState;
		let notificationMarkUnreadEvent;
		beforeEach(() => {
			initialCountUnread = 0;
			initialReadState = {
				last_read: new Date().toISOString(),
				last_read_message_id: '6',
				user,
				unread_messages: initialCountUnread,
				last_delivered_at: new Date(1000).toISOString(),
				last_delivered_message_id: 'delivered-msg-id',
			};
			notificationMarkUnreadEvent = {
				type: 'notification.mark_unread',
				created_at: new Date().toISOString(),
				cid: channel.cid,
				channel_id: channel.id,
				channel_type: channel.type,
				channel: null,
				user,
				first_unread_message_id: '2',
				last_read_at: new Date(
					new Date(initialReadState.last_read).getTime() - 1000,
				).toISOString(),
				last_read_message_id: '1',
				unread_messages: 5,
				unread_count: 6,
				total_unread_count: 6,
				unread_channels: 2,
			};
		});

		it('should update channel read state produced for current user', () => {
			channel.state.unreadCount = initialCountUnread;
			channel.state.read[user.id] = initialReadState;
			const event = notificationMarkUnreadEvent;

			channel._handleChannelEvent(event);

			expect(channel.state.unreadCount).to.be.equal(event.unread_messages);
			expect(new Date(channel.state.read[user.id].last_read).getTime()).to.be.equal(
				new Date(event.last_read_at).getTime(),
			);
			expect(channel.state.read[user.id].last_read_message_id).to.be.equal(
				event.last_read_message_id,
			);
			expect(channel.state.read[user.id].unread_messages).to.be.equal(
				event.unread_messages,
			);
			expect(channel.state.read[user.id].last_delivered_at).toBe(
				initialReadState.last_delivered_at,
			);
			expect(channel.state.read[user.id].last_delivered_message_id).toBe(
				initialReadState.last_delivered_message_id,
			);
			expect(
				channel.messageReceiptsTracker.getUserProgress(user.id)?.lastReadRef.msgId,
			).toBe(event.last_read_message_id);
			expect(channel.messagePaginator.unreadStateSnapshot.getLatestValue()).toEqual({
				firstUnreadMessageId: event.first_unread_message_id,
				lastReadAt: new Date(event.last_read_at),
				lastReadMessageId: event.last_read_message_id,
				unreadCount: event.unread_messages,
			});
		});

		it('should reconcile tracker with metadata patch for notification.mark_unread', () => {
			channel.state.read[user.id] = initialReadState;
			const reconcileSpy = vi.spyOn(
				channel.messageReceiptsTracker,
				'reconcileFromReadStore',
			);

			channel._handleChannelEvent(notificationMarkUnreadEvent);

			expect(reconcileSpy).toHaveBeenCalledTimes(1);
			expect(reconcileSpy.mock.calls[0][0].meta).toEqual({
				changedUserIds: [user.id],
			});
		});

		it('should not update channel read state produced for another user or user is missing', () => {
			channel.state.unreadCount = initialCountUnread;
			channel.state.read[user.id] = initialReadState;
			const { user: excludedUser, ...eventMissingUser } = notificationMarkUnreadEvent;
			const eventWithAnotherUser = {
				...notificationMarkUnreadEvent,
				user: { id: 'another-user' },
			};

			[eventWithAnotherUser, eventMissingUser].forEach((event) => {
				channel._handleChannelEvent(event);

				expect(channel.state.unreadCount).to.be.equal(initialCountUnread);
				expect(new Date(channel.state.read[user.id].last_read).getTime()).to.be.equal(
					new Date(initialReadState.last_read).getTime(),
				);
				expect(channel.state.read[user.id].last_read_message_id).to.be.equal(
					initialReadState.last_read_message_id,
				);
				expect(channel.state.read[user.id].unread_messages).to.be.equal(
					initialReadState.unread_messages,
				);
			});
		});
	});

	describe('message.read', () => {
		let initialCountUnread;
		let initialReadState;
		let messageReadEvent;

		beforeEach(() => {
			initialCountUnread = 100;
			initialReadState = {
				last_read: new Date(1500).toISOString(),
				last_read_message_id: '6',
				first_unread_message_id: 'first-unread-msg-id',
				user,
				unread_messages: initialCountUnread,
				last_delivered_at: new Date(1000).toISOString(),
				last_delivered_message_id: 'delivered-msg-id',
			};
			messageReadEvent = {
				type: 'message.read',
				created_at: new Date(2000).toISOString(),
				cid: channel.cid,
				channel_member_count: 100,
				channel_type: channel.type,
				channel_id: channel.id,
				user,
				last_read_message_id: '6b1006ad-7a6d-49d1-82d9-5ee5e8167e49',
			};
		});

		it('should update channel read state produced for current user', () => {
			channel.state.unreadCount = initialCountUnread;
			channel.state.read[user.id] = initialReadState;
			const event = messageReadEvent;

			channel._handleChannelEvent(event);

			expect(channel.state.unreadCount).toBe(0);
			expect(new Date(channel.state.read[user.id].last_read).getTime()).toBe(
				new Date(messageReadEvent.created_at).getTime(),
			);
			expect(channel.state.read[user.id].last_read_message_id).toBe(
				event.last_read_message_id,
			);
			expect(channel.state.read[user.id].first_unread_message_id).toBeUndefined();
			expect(channel.state.read[user.id].unread_messages).toBe(0);
			expect(new Date(channel.state.read[user.id].last_delivered_at).getTime()).toBe(
				new Date(messageReadEvent.created_at).getTime(),
			);
			expect(channel.state.read[user.id].last_delivered_message_id).toBe(
				event.last_read_message_id,
			);
			expect(
				channel.messageReceiptsTracker.getUserProgress(user.id)?.lastReadRef.msgId,
			).toBe(event.last_read_message_id);
		});

		it('should update channel read state produced for another user', () => {
			const anotherUser = { id: 'another-user' };
			channel.state.unreadCount = initialCountUnread;
			channel.state.read[anotherUser.id] = initialReadState;
			const event = { ...messageReadEvent, user: anotherUser };

			channel._handleChannelEvent(event);

			expect(channel.state.unreadCount).toBe(initialCountUnread);
			expect(new Date(channel.state.read[anotherUser.id].last_read).getTime()).toBe(
				new Date(messageReadEvent.created_at).getTime(),
			);
			expect(channel.state.read[anotherUser.id].last_read_message_id).toBe(
				event.last_read_message_id,
			);
			expect(channel.state.read[anotherUser.id].first_unread_message_id).toBeUndefined();
			expect(channel.state.read[anotherUser.id].unread_messages).toBe(0);
			expect(
				new Date(channel.state.read[anotherUser.id].last_delivered_at).getTime(),
			).toBe(new Date(messageReadEvent.created_at).getTime());
			expect(channel.state.read[anotherUser.id].last_delivered_message_id).toBe(
				event.last_read_message_id,
			);
		});

		it('should emit readStore subscription updates for single-user message.read events', () => {
			channel.state.read[user.id] = initialReadState;
			const changes = [];
			const unsubscribe = channel.state.readStore.subscribe((next, prev) => {
				if (!prev) return;
				changes.push({
					next: next.read[user.id],
					prev: prev.read[user.id],
				});
			});

			channel._handleChannelEvent(messageReadEvent);
			unsubscribe();

			expect(changes).to.have.length(1);
			expect(changes[0].next).to.not.equal(changes[0].prev);
			expect(new Date(changes[0].next.last_read).getTime()).toBe(
				new Date(messageReadEvent.created_at).getTime(),
			);
		});
	});

	describe('message.delivered', () => {
		let initialCountUnread;
		let initialReadState;
		let messageDeliveredEvent;

		beforeEach(() => {
			initialCountUnread = 100;
			initialReadState = {
				last_read: new Date(1500).toISOString(),
				last_read_message_id: '6',
				user,
				unread_messages: initialCountUnread,
				last_delivered_at: new Date(1000).toISOString(),
				last_delivered_message_id: 'delivered-msg-id',
			};
			messageDeliveredEvent = {
				type: 'message.delivered',
				created_at: new Date(2000).toISOString(),
				cid: channel.cid,
				channel_member_count: 100,
				channel_type: channel.type,
				channel_id: channel.id,
				user,
				last_delivered_message_id: 'fd403be5-9207-48db-8bd7-13bd65ffbea6',
				last_delivered_at: new Date(2000).toISOString(),
			};
		});

		it('should update channel read state produced for current user', () => {
			channel.state.unreadCount = initialCountUnread;
			channel.state.read[user.id] = initialReadState;

			channel._handleChannelEvent(messageDeliveredEvent);

			expect(channel.state.unreadCount).toBe(initialReadState.unread_messages);
			expect(new Date(channel.state.read[user.id].last_read).getTime()).toBe(
				new Date(initialReadState.last_read).getTime(),
			);
			expect(channel.state.read[user.id].last_read_message_id).toBe(
				initialReadState.last_read_message_id,
			);
			expect(channel.state.read[user.id].unread_messages).toBe(
				initialReadState.unread_messages,
			);
			expect(new Date(channel.state.read[user.id].last_delivered_at).getTime()).toBe(
				new Date(messageDeliveredEvent.last_delivered_at).getTime(),
			);
			expect(channel.state.read[user.id].last_delivered_message_id).toBe(
				messageDeliveredEvent.last_delivered_message_id,
			);
		});

		it('should not move canonical delivered state backwards on out-of-order events', () => {
			channel.state.read[user.id] = {
				...initialReadState,
				last_delivered_at: new Date(3000).toISOString(),
				last_delivered_message_id: 'newer-message-id',
			};
			const olderDeliveryEvent = {
				...messageDeliveredEvent,
				created_at: new Date(2000).toISOString(),
				last_delivered_at: new Date(2000).toISOString(),
				last_delivered_message_id: 'older-message-id',
			};

			channel._handleChannelEvent(olderDeliveryEvent);

			expect(new Date(channel.state.read[user.id].last_delivered_at).getTime()).toBe(
				new Date(3000).getTime(),
			);
			expect(channel.state.read[user.id].last_delivered_message_id).toBe(
				'newer-message-id',
			);
		});

		it('should update channel read state produced for another user', () => {
			const anotherUser = { id: 'another-user' };
			channel.state.unreadCount = initialCountUnread;
			channel.state.read[anotherUser.id] = initialReadState;
			const event = { ...messageDeliveredEvent, user: anotherUser };

			channel._handleChannelEvent(event);

			expect(channel.state.unreadCount).toBe(initialCountUnread);
			expect(new Date(channel.state.read[anotherUser.id].last_read).getTime()).toBe(
				new Date(initialReadState.last_read).getTime(),
			);
			expect(channel.state.read[anotherUser.id].last_read_message_id).toBe(
				initialReadState.last_read_message_id,
			);
			expect(channel.state.read[anotherUser.id].unread_messages).toBe(
				initialReadState.unread_messages,
			);
			expect(
				new Date(channel.state.read[anotherUser.id].last_delivered_at).getTime(),
			).toBe(new Date(event.last_delivered_at).getTime());
			expect(channel.state.read[anotherUser.id].last_delivered_message_id).toBe(
				event.last_delivered_message_id,
			);
		});

		it('prevents reporting delivery just reported', () => {
			// enable delivery events
			client._addChannelConfig({
				cid: channel.cid,
				config: { ...channel.getConfig(), delivery_events: true },
			});
			channel.state.read[user.id] = initialReadState;

			channel._handleChannelEvent({
				type: 'message.new',
				user: otherUser,
				message: generateMsg({
					cid: channel.cid,
					id: messageDeliveredEvent.last_delivered_message_id,
					date: messageDeliveredEvent.last_delivered_at,
				}),
			});
			expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(1);
			expect(
				client.messageDeliveryReporter.deliveryReportCandidates.get(channel.cid),
			).toBe(messageDeliveredEvent.last_delivered_message_id);

			channel._handleChannelEvent(messageDeliveredEvent);
			expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(0);
		});

		it('keeps reporting delivery if having newer deliveries', () => {
			// enable delivery events
			client._addChannelConfig({
				cid: channel.cid,
				config: { ...channel.getConfig(), delivery_events: true },
			});
			channel.state.read[user.id] = initialReadState;
			const newerMessage = generateMsg({
				cid: channel.cid,
				id: 'some-other-id',
				date: new Date(3000).toISOString(),
			});
			channel._handleChannelEvent({
				type: 'message.new',
				user: otherUser,
				message: newerMessage,
			});

			expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(1);
			expect(
				client.messageDeliveryReporter.deliveryReportCandidates.get(channel.cid),
			).toBe(newerMessage.id);

			// event refers to a message delivered 1000ms earlier than newerMessage - still want to report the newerMessage
			channel._handleChannelEvent(messageDeliveredEvent);
			expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(1);
			expect(
				client.messageDeliveryReporter.deliveryReportCandidates.get(channel.cid),
			).toBe(newerMessage.id);
		});

		it("does not sync the delivery buffer upon other user's delivery confirmation", () => {
			// enable delivery events
			client._addChannelConfig({
				cid: channel.cid,
				config: { ...channel.getConfig(), delivery_events: true },
			});
			channel.state.read[user.id] = initialReadState;

			channel._handleChannelEvent({
				type: 'message.new',
				user: otherUser,
				message: generateMsg({
					cid: channel.cid,
					id: messageDeliveredEvent.last_delivered_message_id,
					date: messageDeliveredEvent.last_delivered_at,
				}),
			});
			expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(1);
			expect(
				client.messageDeliveryReporter.deliveryReportCandidates.get(channel.cid),
			).toBe(messageDeliveredEvent.last_delivered_message_id);

			channel._handleChannelEvent({ ...messageDeliveredEvent, user: otherUser });
			expect(client.messageDeliveryReporter.deliveryReportCandidates.size).toBe(1);
			// the originally planned message id is kept to be reported
			expect(
				client.messageDeliveryReporter.deliveryReportCandidates.get(channel.cid),
			).toBe(messageDeliveredEvent.last_delivered_message_id);
		});

		it('does not override the delivery information in the read status', () => {});
	});

	describe('channel.visible', () => {
		it('should mark channel visible on channel.visible event', () => {
			const channelVisibleEvent = {
				channel: {
					blocked: false,
				},
				type: 'channel.visible',
				cid: 'messaging:id',
				channel_id: 'id',
				channel_type: 'messaging',
				user: {
					id: 'admin',
					role: 'admin',
					created_at: '2022-03-08T09:46:56.840739Z',
					updated_at: '2022-03-15T08:30:09.796926Z',
					last_active: '2023-05-24T09:20:31.041292724Z',
					banned: false,
					online: true,
				},
				created_at: '2023-05-24T09:20:43.986615426Z',
			};
			channel.data.hidden = true;
			channel.data.blocked = true;

			channel._handleChannelEvent(channelVisibleEvent);
			expect(channel.data.hidden).eq(false);
			expect(channel.data.blocked).eq(false);
		});

		it('should treat blocked separately from hidden on channel.visible event', () => {
			const channelVisibleEvent = {
				channel: {
					blocked: true,
				},
				type: 'channel.visible',
				cid: 'messaging:id',
				channel_id: 'id',
				channel_type: 'messaging',
				user: {
					id: 'admin',
					role: 'admin',
					created_at: '2022-03-08T09:46:56.840739Z',
					updated_at: '2022-03-15T08:30:09.796926Z',
					last_active: '2023-05-24T09:20:31.041292724Z',
					banned: false,
					online: true,
				},
				created_at: '2023-05-24T09:20:43.986615426Z',
			};
			channel.data.hidden = true;
			channel.data.blocked = true;

			channel._handleChannelEvent(channelVisibleEvent);
			expect(channel.data.hidden).eq(false);
			expect(channel.data.blocked).eq(true);
		});
	});

	describe('channel.hidden', () => {
		it('should mark channel hidden on channel.hidden event', () => {
			const channelVisibleEvent = {
				channel: {
					blocked: true,
				},
				type: 'channel.hidden',
			};
			channel.data.hidden = false;
			channel.data.blocked = false;

			channel._handleChannelEvent(channelVisibleEvent);
			expect(channel.data.hidden).eq(true);
			expect(channel.data.blocked).eq(true);
		});

		it('should treat blocked separately from hidden on channel.hidden event', () => {
			const channelVisibleEvent = {
				channel: {
					blocked: false,
				},
				type: 'channel.hidden',
			};
			channel.data.hidden = false;
			channel.data.blocked = false;

			channel._handleChannelEvent(channelVisibleEvent);
			expect(channel.data.hidden).eq(true);
			expect(channel.data.blocked).eq(false);
		});
	});

	describe('channel.updated', () => {
		it('should update the frozen flag and reload channel state when frozen changes', () => {
			const event = {
				channel: { frozen: true },
				type: 'channel.updated',
			};
			channel.data.frozen = false;
			const channelQuerySpy = vi.spyOn(channel, 'query');

			channel._handleChannelEvent(event);
			expect(channel.data.frozen).eq(true);
			expect(channelQuerySpy).toHaveBeenCalledTimes(1);

			channel._handleChannelEvent(event);
			expect(channelQuerySpy).toHaveBeenCalledTimes(1);

			// Make sure that we don't wipe out any data
		});

		it('channel.updated updates member_count from the event channel data', () => {
			channel.data = { member_count: 5 };

			channel._handleChannelEvent({
				type: 'channel.updated',
				channel: { member_count: 10 },
			});

			expect(channel.data.member_count).to.equal(10);
		});

		it('preserves member_count on channel.updated when event payload omits member_count', () => {
			channel.data.member_count = 3;
			channel.data.frozen = false;
			channel._handleChannelEvent({
				channel: { frozen: false },
				type: 'channel.updated',
			});

			expect(channel.data.member_count).to.equal(3);
			expect(channel.state.member_count).to.equal(3);
		});

		it(`should make sure that state reload doesn't wipe out existing data`, async () => {
			sinon
				.stub(client.api, 'sendRequest')
				.resolves({ body: mockChannelQueryResponse, metadata: {} });

			channel.state.members = {
				user: { id: 'user' },
			};
			channel.state.watchers = {
				user: { id: 'user' },
			};
			channel.state.read = {
				user: { id: 'user' },
			};
			seedLatestWindow(channel, [generateMsg()]);
			channel.state.watcher_count = 5;

			await channel.query();

			expect(Object.keys(channel.state.members).length).to.be.eq(1);
			expect(Object.keys(channel.state.watchers).length).to.be.eq(1);
			expect(Object.keys(channel.state.read).length).to.be.eq(1);
			expect(channel.messagePaginator.headItems.length).to.be.eq(1);
			expect(channel.state.watcher_count).to.be.eq(5);
		});

		// capabilities.changed is emitted from the channel.updated / query path.
		it('should dispatch "capabilities.changed" event', async () => {
			const response = mockChannelQueryResponse;
			channel.data.own_capabilities = response.channel.own_capabilities.slice(0, 1);
			const sendRequestStub = sinon
				.stub(client.api, 'sendRequest')
				.resolves({ body: response, metadata: {} });
			const spy = sinon.spy();
			channel.on('capabilities.changed', spy);

			await channel.query();

			expect(spy.calledOnce).to.be.true;

			const arg = spy.firstCall.args[0];
			// We don't care about received_at in the assertion
			delete arg.received_at;
			sinon.assert.match(arg, {
				type: 'capabilities.changed',
				cid: channel.cid,
				own_capabilities: response.channel.own_capabilities,
			});

			channel.data.own_capabilities = response.channel.own_capabilities;
			sendRequestStub.resolves({ body: response, metadata: {} });
			spy.resetHistory();

			await channel.query();

			expect(spy.notCalled).to.be.true;
		});
	});

	describe('user.banned / user.unbanned', () => {
		it('should update channel member ban state on user.banned and user.unbanned events', () => {
			const user = { id: 'user_id' };
			const shadowBanEvent = {
				type: 'user.banned',
				shadow: true,
				user,
			};
			const shadowUnbanEvent = {
				type: 'user.unbanned',
				shadow: true,
				user,
			};
			const banEvent = {
				type: 'user.banned',
				user,
			};
			const unbanEvent = {
				type: 'user.unbanned',
				user,
			};

			[
				[
					shadowBanEvent,
					banEvent,
					{ shadow_banned: true, banned: false },
					{ shadow_banned: false, banned: true },
				],
				[
					shadowBanEvent,
					shadowUnbanEvent,
					{ shadow_banned: true, banned: false },
					{ shadow_banned: false, banned: false },
				],
				[
					shadowBanEvent,
					unbanEvent,
					{ shadow_banned: true, banned: false },
					{ shadow_banned: false, banned: false },
				],
				[
					banEvent,
					shadowBanEvent,
					{ shadow_banned: false, banned: true },
					{ shadow_banned: true, banned: false },
				],
				[
					banEvent,
					shadowUnbanEvent,
					{ shadow_banned: false, banned: true },
					{ shadow_banned: false, banned: false },
				],
				[
					banEvent,
					unbanEvent,
					{ shadow_banned: false, banned: true },
					{ shadow_banned: false, banned: false },
				],
			].forEach(([firstEvent, secondEvent, expectAfterFirst, expectAfterSecond]) => {
				channel._handleChannelEvent(firstEvent);
				expect(channel.state.members[user.id].banned).eq(expectAfterFirst.banned);
				expect(channel.state.members[user.id].shadow_banned).eq(
					expectAfterFirst.shadow_banned,
				);
				channel._handleChannelEvent(secondEvent);
				expect(channel.state.members[user.id].banned).eq(expectAfterSecond.banned);
				expect(channel.state.members[user.id].shadow_banned).eq(
					expectAfterSecond.shadow_banned,
				);
			});
		});
	});
});

describe('Uninitialized Channel', () => {
	const user = { id: 'user' };
	const otherUser = { id: 'other-user' };
	let client;
	let channel;

	beforeEach(() => {
		client = new StreamChat('apiKey');
		client.user = user;
		client.user = { id: user.id };
		client.userMuteStatus = (targetId) => targetId.startsWith('mute');
		channel = client.channel('messaging', 'id');
		channel.initialized = false;
		channel.offlineMode = false;
	});

	it('returns 0 mentions in unread messages', () => {
		expect(channel.countUnreadMentions()).to.eq(0);
	});

	it('reports no lastRead data', () => {
		expect(channel.lastRead()).to.eq(null);
	});

	// Regression coverage for https://github.com/GetStream/stream-chat-js/issues/1732
	// `client.channel(type, id)` registers the channel in `activeChannels` with
	// `initialized = false`. Before the fix, a `message.new` arriving in that
	// window went dispatchEvent → _handleChannelEvent → _countMessageAsUnread →
	// muteStatus() → _checkInitialized() and threw, aborting the rest of the
	// dispatch cycle (client listeners, channel listeners, offlineDb).
	describe('regression #1732: dispatchEvent on an uninitialized channel', () => {
		const buildMessageNewEvent = () => ({
			type: 'message.new',
			cid: channel.cid,
			channel_type: channel.type,
			channel_id: channel.id,
			user: otherUser,
			message: generateMsg({ user: otherUser }),
			created_at: new Date().toISOString(),
		});

		it('does not throw and still updates channel state on message.new', () => {
			expect(() => client.dispatchEvent(buildMessageNewEvent())).not.to.throw();
			expect(channel.state.unreadCount).to.equal(1);
		});

		it('does not throw for channels left uninitialized by query({ watch: false })', () => {
			// Production path called out in the issue: screens that fetch via
			// `query({ watch: false, state: false })` leave the channel in
			// activeChannels with initialized=false indefinitely. We simulate
			// that final state — `initialized` is never flipped to true.
			expect(channel.initialized).to.be.false;
			expect(() => client.dispatchEvent(buildMessageNewEvent())).not.to.throw();
		});

		it('still invokes client and channel listeners (dispatch cycle is not aborted)', () => {
			const clientListener = vi.fn();
			const channelListener = vi.fn();
			client.on('message.new', clientListener);
			channel.on('message.new', channelListener);

			client.dispatchEvent(buildMessageNewEvent());

			expect(clientListener).toHaveBeenCalledOnce();
			expect(channelListener).toHaveBeenCalledOnce();
		});

		it('respects client mute state via _countMessageAsUnread without throwing', () => {
			expect(() => channel._countMessageAsUnread({ user: otherUser })).not.to.throw();
			expect(channel._countMessageAsUnread({ user: otherUser })).to.be.true;

			client.mutedChannels = [{ user, channel }];
			expect(channel._countMessageAsUnread({ user: otherUser })).to.be.false;
		});

		it('public muteStatus() still throws (intentional API contract)', () => {
			expect(() => channel.muteStatus()).to.throw(/hasn't been initialized/);
		});
	});
});

describe('Channels - Constructor', function () {
	const client = new StreamChat('key', 'secret');
	// client.channel() now requires a connected user (userId derives from client.user).
	client.user = { id: 'thierry' };

	it('canonical form', function () {
		const channel = client.channel('messaging', '123', { cool: true });
		expect(channel.cid).to.eql('messaging:123');
		expect(channel.id).to.eql('123');
		expect(channel.data.cool).to.eql(true);
	});

	it('custom data merges to the right with current data', function () {
		let channel = client.channel('messaging', 'brand_new_123', { cool: true });
		expect(channel.cid).to.eql('messaging:brand_new_123');
		expect(channel.id).to.eql('brand_new_123');
		expect(channel.data.cool).to.eql(true);
		// Re-fetching a cached channel now merges only the reserved `custom` payload onto existing
		// data (getChannelById), leaving previously-set top-level data untouched.
		channel = client.channel('messaging', 'brand_new_123', {
			custom: { custom_cool: true },
		});
		expect(channel.data.cool).to.eql(true);
		expect(channel.data.custom.custom_cool).to.eql(true);
	});

	it('default options', function () {
		const channel = client.channel('messaging', '123');
		expect(channel.cid).to.eql('messaging:123');
		expect(channel.id).to.eql('123');
	});

	it('null ID no options', function () {
		const channel = client.channel('messaging', null);
		expect(channel.id).to.eq(undefined);
	});

	it('undefined ID no options', function () {
		const channel = client.channel('messaging', undefined);
		expect(channel.id).to.eql(undefined);
		// own_capabilities stays undefined ("not yet loaded") until the channel is
		// hydrated; the reactive getter is still defined (hence enumerable).
		expect(channel.data.own_capabilities).to.be.undefined;
		expect(Object.keys(channel.data)).to.eql(['own_capabilities']);
	});

	it('short version with options', function () {
		const channel = client.channel('messaging', { members: ['tommaso', 'thierry'] });
		expect(channel.data.members).to.eql(['tommaso', 'thierry']);
		expect(channel.id).to.eql(undefined);
	});

	it('null ID with options', function () {
		const channel = client.channel('messaging', null, {
			members: ['tommaso', 'thierry'],
		});
		expect(channel.data.members).to.eql(['tommaso', 'thierry']);
		expect(channel.id).to.eql(undefined);
	});

	it('empty ID  with options', function () {
		const channel = client.channel('messaging', '', {
			members: ['tommaso', 'thierry'],
		});
		expect(channel.data.members).to.eql(['tommaso', 'thierry']);
		expect(channel.id).to.eql(undefined);
	});

	it('empty ID  with options', function () {
		const channel = client.channel('messaging', undefined, {
			members: ['tommaso', 'thierry'],
		});
		expect(channel.data.members).to.eql(['tommaso', 'thierry']);
		expect(channel.id).to.eql(undefined);
	});
});

describe('Ensure single channel per cid on client activeChannels state', () => {
	const clientVish = new StreamChat('', '');
	const user = { id: 'user' };
	const channelType = 'messaging';

	clientVish.connectUser = () => {
		clientVish.user = user;
		clientVish.user = { id: user.id };
		clientVish.wsPromise = Promise.resolve();
	};

	clientVish.connectUser();

	it('channel created using id - case 1', async () => {
		clientVish.activeChannels = {};

		const channelVishId = uuidv4();
		const mockedChannelResponse = generateChannel({
			channel: {
				id: channelVishId,
			},
		});

		// to mock the channel.watch call
		clientVish.api.sendRequest = () =>
			Promise.resolve({
				body: getOrCreateChannelApi(mockedChannelResponse).response.data,
				metadata: {},
			});
		const channelVish_copy1 = clientVish.channel('messaging', channelVishId);

		const cid = `${channelType}:${channelVishId}`;

		expect(Object.keys(clientVish.activeChannels)).to.contain(cid);
		expect(clientVish.activeChannels[cid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();
		const channelVish_copy2 = clientVish.channel('messaging', channelVishId);
		await channelVish_copy2.watch();
		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});
	it('channel created using id - case 2', async () => {
		clientVish.activeChannels = {};

		const channelVishId = uuidv4();
		const mockedChannelResponse = generateChannel({
			channel: {
				id: channelVishId,
			},
		});

		// to mock the channel.watch call
		clientVish.api.sendRequest = () =>
			Promise.resolve({
				body: getOrCreateChannelApi(mockedChannelResponse).response.data,
				metadata: {},
			});

		const channelVish_copy1 = clientVish.channel('messaging', channelVishId);

		const cid = `${channelType}:${channelVishId}`;

		expect(Object.keys(clientVish.activeChannels)).to.contain(cid);
		expect(clientVish.activeChannels[cid]).to.contain(channelVish_copy1);

		const channelVish_copy2 = clientVish.channel('messaging', channelVishId);

		expect(Object.keys(clientVish.activeChannels)).to.contain(cid);
		expect(clientVish.activeChannels[cid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();
		await channelVish_copy2.watch();

		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using member list - case 1', async () => {
		clientVish.activeChannels = {};

		// Mock channel.watch call.
		const userVish = generateUser();
		const userAmin = generateUser();
		const memberVish = generateMember({ user: userVish });
		const memberAmin = generateMember({ user: userAmin });
		const mockedChannelResponse = generateChannel({
			members: [memberVish, memberAmin],
		});
		clientVish.api.sendRequest = () =>
			Promise.resolve({
				body: getOrCreateChannelApi(mockedChannelResponse).response.data,
				metadata: {},
			});

		// Lets start testing
		const channelVish_copy1 = clientVish.channel('messaging', {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();

		// tempCid should be replaced with actual cid at this point.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);
		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy1.cid);
		expect(clientVish.activeChannels[channelVish_copy1.cid]).to.contain(
			channelVish_copy1,
		);

		const channelVish_copy2 = clientVish.channel('messaging', {
			members: [userVish.id, userAmin.id],
		});

		// Should not populate tmpCid again.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);

		await channelVish_copy2.watch();
		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using member list - case 2', async () => {
		clientVish.activeChannels = {};

		const userVish = generateUser();
		const userAmin = generateUser();

		const memberVish = generateMember({ user: userVish });
		const memberAmin = generateMember({ user: userAmin });

		// Case 1 =======================>
		const mockedChannelResponse = generateChannel({
			members: [memberVish, memberAmin],
		});

		// to mock the channel.watch call
		clientVish.api.sendRequest = () =>
			Promise.resolve({
				body: getOrCreateChannelApi(mockedChannelResponse).response.data,
				metadata: {},
			});

		// Case 1 =======================>
		const channelVish_copy1 = clientVish.channel('messaging', {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		const channelVish_copy2 = clientVish.channel('messaging', {
			members: [userVish.id, userAmin.id],
		});

		// activeChannels still should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy2);

		await channelVish_copy1.watch();
		await channelVish_copy2.watch();

		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using member list - case 3', async () => {
		clientVish.activeChannels = {};

		// Mock channel.watch call.
		const userVish = generateUser();
		const userAmin = generateUser();
		const memberVish = generateMember({ user: userVish });
		const memberAmin = generateMember({ user: userAmin });
		const mockedChannelResponse = generateChannel({
			members: [memberVish, memberAmin],
		});
		clientVish.api.sendRequest = () =>
			Promise.resolve({
				body: getOrCreateChannelApi(mockedChannelResponse).response.data,
				metadata: {},
			});

		// Lets start testing
		const channelVish_copy1 = clientVish.channel('messaging', undefined, {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();

		// tempCid should be replaced with actual cid at this point.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);
		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy1.cid);
		expect(clientVish.activeChannels[channelVish_copy1.cid]).to.contain(
			channelVish_copy1,
		);

		const channelVish_copy2 = clientVish.channel('messaging', undefined, {
			members: [userVish.id, userAmin.id],
		});

		// Should not populate tmpCid again.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);

		await channelVish_copy2.watch();
		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using member list - case 4', async () => {
		clientVish.activeChannels = {};

		const userVish = generateUser();
		const userAmin = generateUser();

		const memberVish = generateMember({ user: userVish });
		const memberAmin = generateMember({ user: userAmin });

		// Case 1 =======================>
		const mockedChannelResponse = generateChannel({
			members: [memberVish, memberAmin],
		});

		// to mock the channel.watch call
		clientVish.api.sendRequest = () =>
			Promise.resolve({
				body: getOrCreateChannelApi(mockedChannelResponse).response.data,
				metadata: {},
			});

		// Case 1 =======================>
		const channelVish_copy1 = clientVish.channel('messaging', undefined, {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		const channelVish_copy2 = clientVish.channel('messaging', undefined, {
			members: [userVish.id, userAmin.id],
		});

		// activeChannels still should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy2);

		await channelVish_copy1.watch();
		await channelVish_copy2.watch();

		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using type only', async () => {
		clientVish.activeChannels = {};

		const userVish = generateUser();
		const userAmin = generateUser();

		const memberVish = generateMember({ user: userVish });
		const memberAmin = generateMember({ user: userAmin });

		// Case 1 =======================>
		const mockedChannelResponse = generateChannel({
			members: [memberVish, memberAmin],
		});

		// to mock the channel.watch call
		clientVish.api.sendRequest = () =>
			Promise.resolve({
				body: getOrCreateChannelApi(mockedChannelResponse).response.data,
				metadata: {},
			});

		// Case 1 =======================>
		const channelVish_copy1 = clientVish.channel('messaging', undefined, {
			custom: 'X',
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).not.to.contain(tmpCid);

		const channelVish_copy2 = clientVish.channel('messaging', undefined, {
			custom: 'X',
		});

		// activeChannels still should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).not.to.contain(tmpCid);

		expect(Object.keys(clientVish.activeChannels)).not.to.contain(channelVish_copy1.cid);
		expect(Object.keys(clientVish.activeChannels)).not.to.contain(channelVish_copy2.cid);

		await channelVish_copy1.watch();
		await channelVish_copy2.watch();

		expect(channelVish_copy1).not.to.be.equal(channelVish_copy2);

		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy1.cid);
		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy2.cid);
		expect(clientVish.activeChannels[channelVish_copy1.cid]).not.to.contain(
			channelVish_copy2,
		);
	});
});

describe('event subscription and unsubscription', () => {
	it('channel.on should return unsubscribe handler', async () => {
		const client = await getClientWithUser();
		const channel = client.channel('messaging', uuidv4());

		const { unsubscribe: unsubscribe1 } = channel.on('message.new', () => {});
		const { unsubscribe: unsubscribe2 } = channel.on(() => {});

		// channel.listeners is now a Map<key, Set<handler>>; unsubscribing the last handler for a
		// key deletes the key entirely.
		expect(channel.listeners.size).to.be.equal(2);

		unsubscribe1();
		expect(channel.listeners.get('message.new')?.size ?? 0).to.be.equal(0);
		unsubscribe2();
		expect(channel.listeners.get('all')?.size ?? 0).to.be.equal(0);
	});
});
describe('Channel search', async () => {
	const client = await getClientWithUser();
	const channel = client.channel('messaging', uuidv4());

	// search now takes a single request object `{ payload }` and forwards the payload straight to
	// the generated ChatApi.search (GET /search) via client.api.sendRequest. Sort normalization is
	// no longer done inside search, so the caller passes the already-shaped `{ field, direction }`.
	it('search with sorting by defined field', async () => {
		const sendRequest = vi
			.spyOn(client.api, 'sendRequest')
			.mockResolvedValue({ body: {}, metadata: {} });
		const payload = { query: 'query', sort: [{ field: 'updated_at', direction: -1 }] };
		await channel.search({ payload });
		expect(sendRequest).toHaveBeenCalledWith('GET', '/api/v2/chat/search', undefined, {
			payload,
		});
	});
	it('search with sorting by custom field', async () => {
		const sendRequest = vi
			.spyOn(client.api, 'sendRequest')
			.mockResolvedValue({ body: {}, metadata: {} });
		const payload = { query: 'query', sort: [{ field: 'custom_field', direction: -1 }] };
		await channel.search({ payload });
		expect(sendRequest).toHaveBeenCalledWith('GET', '/api/v2/chat/search', undefined, {
			payload,
		});
	});
	it('sorting and offset works', async () => {
		vi.spyOn(client.api, 'sendRequest').mockResolvedValue({ body: {}, metadata: {} });
		await expect(
			channel.search({
				payload: {
					query: 'query',
					offset: 1,
					sort: [{ field: 'custom_field', direction: -1 }],
				},
			}),
		).resolves.toBeDefined();
	});
	it('next and offset fails', async () => {
		await expect(
			channel.search({ payload: { query: 'query', offset: 1, next: 'next' } }),
		).rejects.toThrow();
	});
});

describe('Channel lastMessage', async () => {
	let channel;
	let client;
	beforeEach(async () => {
		client = await getClientWithUser();
		channel = client.channel('messaging', uuidv4());
		client._addChannelConfig({ cid: channel.cid, config: {} });
	});

	it('should return last message - messages are in order', () => {
		channel.state = new ChannelState(channel);
		const latestMessageDate = '2018-01-01T00:13:24';
		seedLatestWindow(channel, [
			generateMsg({ date: '2018-01-01T00:00:00' }),
			generateMsg({ date: '2018-01-01T00:02:00' }),
			generateMsg({ date: latestMessageDate }),
		]);

		expect(channel.messagePaginator.headmostItem.created_at.getTime()).to.be.equal(
			new Date(latestMessageDate).getTime(),
		);
	});

	it('should return last message - messages are out of order', () => {
		channel.state = new ChannelState(channel);
		const latestMessageDate = '2018-01-01T00:13:24';
		seedLatestWindow(channel, [
			generateMsg({ date: latestMessageDate }),
			generateMsg({ date: '2018-01-01T00:02:00' }),
			generateMsg({ date: '2018-01-01T00:00:00' }),
		]);

		expect(channel.messagePaginator.headmostItem.created_at.getTime()).to.be.equal(
			new Date(latestMessageDate).getTime(),
		);
	});

	it('should return last message - state has more message sets loaded', () => {
		channel.state = new ChannelState(channel);
		const latestMessageDate = '2018-01-01T00:13:24';
		const latestMessages = [
			generateMsg({ date: latestMessageDate }),
			generateMsg({ date: '2018-01-01T00:02:00' }),
			generateMsg({ date: '2018-01-01T00:00:00' }),
		];
		const otherMessages = [
			generateMsg({ date: '2017-11-21T00:05:33' }),
			generateMsg({ date: '2017-11-21T00:05:35' }),
		];
		// latest (head) window + a separate, older window
		seedLatestWindow(channel, latestMessages);
		channel.messagePaginator.ingestPage({
			page: otherMessages.map((m) => formatMessage(m)),
			setActive: false,
		});

		expect(channel.messagePaginator.headmostItem.created_at.getTime()).to.be.equal(
			new Date(latestMessageDate).getTime(),
		);
	});

	it('should return last message - system message is ignored when skip_last_msg_update_for_system_msgs: true', () => {
		client._addChannelConfig({
			cid: channel.cid,
			config: { skip_last_msg_update_for_system_msgs: true },
		});
		channel.state = new ChannelState(channel);
		const latestMessages = [
			generateMsg({ date: '2018-01-01T00:13:24', type: 'system' }),
			generateMsg({ date: '2018-01-01T00:02:00' }),
			generateMsg({ date: '2018-01-01T00:00:00' }),
		];
		// ingestion advances the tracked latest, skipping the newest (system) message per config.
		seedLatestWindow(channel, latestMessages);

		expect(channel.messagePaginator.lastMessageAt.getTime()).toBe(
			new Date(latestMessages[1].created_at).getTime(),
		);
	});
});

describe('Channel last_message_at', () => {
	let channel;
	let client;
	beforeEach(async () => {
		client = await getClientWithUser();
		channel = client.channel('messaging', uuidv4());
		client._addChannelConfig({ cid: channel.cid, config: {} });
		channel.state = new ChannelState(channel);
	});

	const track = (msg) => channel.messagePaginator.trackLastMessage(formatMessage(msg));

	it('advances monotonically as messages are tracked', () => {
		expect(channel.messagePaginator.lastMessageAt).to.be.null;
		track(generateMsg({ id: '0', date: '2020-01-01T00:00:00.000Z' }));
		expect(channel.messagePaginator.lastMessageAt.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.000Z').getTime(),
		);
		track(generateMsg({ id: '1', date: '2019-01-01T00:00:00.000Z' }));
		expect(channel.messagePaginator.lastMessageAt.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.000Z').getTime(),
		);

		track(generateMsg({ id: '2', date: '2020-01-01T00:00:00.001Z' }));
		expect(channel.messagePaginator.lastMessageAt.getTime()).to.be.equal(
			new Date('2020-01-01T00:00:00.001Z').getTime(),
		);
	});

	it('is not advanced by a thread-only reply', () => {
		track(
			generateMsg({ id: 'reply', date: '2020-01-01T00:00:00.000Z', parent_id: 'parent' }),
		);

		expect(channel.messagePaginator.lastMessageAt).to.be.null;
	});

	it('is null when nothing has been tracked or seeded', () => {
		expect(channel.messagePaginator.lastMessageAt).to.be.null;
	});

	it('is seeded from the server-provided last_message_at', () => {
		// A channel surfaced by the channel-list query: lastMessageAt is seeded from the server
		// aggregate so it sorts correctly even before its message paginator loads a page.
		channel.messagePaginator.seedLastMessageAt('2023-05-03T11:12:53.993Z');
		expect(channel.messagePaginator.lastMessageAt.getTime()).to.be.equal(
			new Date('2023-05-03T11:12:53.993Z').getTime(),
		);
	});

	it('advances past the seeded value when a newer message is tracked (monotonic max)', () => {
		channel.messagePaginator.seedLastMessageAt('2020-01-01T00:00:00.000Z');
		track(generateMsg({ id: '0', date: '2021-06-01T00:00:00.000Z' }));
		expect(channel.messagePaginator.lastMessageAt.getTime()).to.be.equal(
			new Date('2021-06-01T00:00:00.000Z').getTime(),
		);
	});
});

describe('Channel _initializeState', () => {
	it('should not keep members that have unwatched since last watch', async () => {
		const client = await getClientWithUser();
		const channel = client.channel('messaging', uuidv4());

		const firstState = {
			members: [
				{
					user: {
						id: 'alice',
					},
				},
				{
					user: {
						id: 'bob',
					},
				},
			],
		};

		channel._initializeState(firstState);

		expect(Object.keys(channel.state.members)).deep.to.be.equal(['alice', 'bob']);

		const secondState = {
			members: [
				{
					user: {
						id: 'alice',
					},
				},
			],
		};

		channel._initializeState(secondState);

		expect(Object.keys(channel.state.members)).deep.to.be.equal(['alice']);
	});

	it('should merge read state without overwriting existing users', async () => {
		const client = await getClientWithUser();
		const channel = client.channel('messaging', uuidv4());
		const existingUser = { id: 'existing-user' };
		const newUser = { id: 'new-user' };
		channel.messageReceiptsTracker.setPendingReadStoreReconcileMeta({
			changedUserIds: [existingUser.id],
		});
		channel.state.read = {
			[existingUser.id]: {
				last_read: new Date('2026-01-01T00:00:00.000Z'),
				unread_messages: 1,
				user: existingUser,
			},
		};

		channel._initializeState({
			read: [
				{
					last_delivered_at: new Date('2026-01-02T00:00:00.000Z').toISOString(),
					last_delivered_message_id: 'delivered-message-id',
					last_read: new Date('2026-01-02T00:00:00.000Z').toISOString(),
					last_read_message_id: 'read-message-id',
					unread_messages: 0,
					user: newUser,
				},
			],
		});

		expect(channel.state.read[existingUser.id]).toBeDefined();
		expect(channel.state.read[newUser.id]).toBeDefined();
		expect(channel.state.read[newUser.id].last_read_message_id).toBe('read-message-id');
		expect(channel.messageReceiptsTracker.getUserProgress(existingUser.id)).toBeTruthy();
		expect(channel.messageReceiptsTracker.getUserProgress(newUser.id)).toBeTruthy();
	});
});

describe('Channel.query', async () => {
	it('should not populate client.activeChannels if caching is disabled', async () => {
		const client = await getClientWithUser();
		client._cacheEnabled = () => false;
		const channel = client.channel('messaging', uuidv4());
		const mockedChannelQueryResponse = {
			...mockChannelQueryResponse,
			messages: Array.from(
				{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE },
				(_, i) =>
					generateMsg({ created_at: new Date(1700000000000 + i * 1000).toISOString() }),
			),
		};
		const stub = sinon
			.stub(client.api, 'sendRequest')
			.resolves({ body: mockedChannelQueryResponse, metadata: {} });
		await channel.query();
		expect(Object.keys(client.activeChannels).length).to.be.equal(0);
		stub.restore();
	});

	it('seeds the message paginator with the full latest page on query', async () => {
		const client = await getClientWithUser();
		const channel = client.channel('messaging', uuidv4());
		const mockedChannelQueryResponse = {
			...mockChannelQueryResponse,
			messages: Array.from(
				{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE },
				generateMsg,
			),
		};
		const stub = sinon
			.stub(client.api, 'sendRequest')
			.resolves({ body: mockedChannelQueryResponse, metadata: {} });
		await channel.query({}, 'latest');
		// A latest-page query seeds the message paginator with the returned page.
		expect(channel.messagePaginator.items).to.have.length(
			DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE,
		);
		expect(channel.messagePaginator.headmostItem).to.not.equal(undefined);
		stub.restore();
	});

	it('seeds the message paginator with a partial latest page on query', async () => {
		const client = await getClientWithUser();
		const channel = client.channel('messaging', uuidv4());
		const mockedChannelQueryResponse = {
			...mockChannelQueryResponse,
			messages: Array.from(
				{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE - 1 },
				generateMsg,
			),
		};
		const stub = sinon
			.stub(client.api, 'sendRequest')
			.resolves({ body: mockedChannelQueryResponse, metadata: {} });
		await channel.query({}, 'latest');
		expect(channel.messagePaginator.items).to.have.length(
			DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE - 1,
		);
		stub.restore();
	});

	it(`update the messageComposer config`, async () => {
		const client = await getClientWithUser();
		const channel = client.channel('messaging', uuidv4());
		expect(channel.messageComposer.config.location.enabled).toBe(true);

		const sendRequestStub = sinon.stub(client.api, 'sendRequest');
		sendRequestStub.onFirstCall().resolves({
			body: {
				...mockChannelQueryResponse,
				channel: {
					...mockChannelQueryResponse.channel,
					config: { ...mockChannelQueryResponse.channel.config, shared_locations: false },
				},
			},
			metadata: {},
		});

		sendRequestStub.onSecondCall().resolves({
			body: {
				...mockChannelQueryResponse,
				channel: {
					...mockChannelQueryResponse.channel,
					config: { ...mockChannelQueryResponse.channel.config, shared_locations: true },
				},
			},
			metadata: {},
		});

		await channel.query();
		expect(channel.messageComposer.config.location.enabled).toBe(false);

		await channel.query();
		expect(channel.messageComposer.config.location.enabled).toBe(true);
	});
});

describe('send reaction flow', () => {
	const messageId = 'msg-456';
	const reaction = { type: 'love' };
	const options = { enforce_unique: true, skip_push: true };
	// Reactions are now sent as a single request object: sendReaction({ id, reaction, ...flags }).
	const request = { id: messageId, reaction, ...options };

	let client;
	let channel;
	let queueTaskSpy;

	beforeEach(async () => {
		client = await getClientWithUser();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		channel = client.channel('messaging', 'test');

		queueTaskSpy = vi.spyOn(client.offlineDb, 'queueTask').mockResolvedValue({});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	// NOTE: the 'Message id is missing' / 'Reaction object is missing' validation was dropped in
	// the OpenAPI-client migration; sendReaction / _sendReaction no longer throw on missing fields.

	describe('sendReaction', () => {
		beforeEach(() => {
			vi.spyOn(channel, '_sendReaction').mockResolvedValue({});
		});

		afterEach(() => {
			vi.resetAllMocks();
		});

		it('queues task if offlineDb exists', async () => {
			await channel.sendReaction(request);

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);

			const taskArg = queueTaskSpy.mock.calls[0][0];
			expect(taskArg).to.deep.equal({
				task: {
					channelId: 'test',
					channelType: 'messaging',
					messageId,
					payload: [request],
					type: 'send-reaction',
				},
			});

			expect(channel._sendReaction).not.toHaveBeenCalled();
		});

		it('falls back to _sendReaction if offlineDb throws', async () => {
			client.offlineDb.queueTask.mockRejectedValue(new Error('Offline failure'));

			await channel.sendReaction(request);

			expect(channel._sendReaction).toHaveBeenCalledTimes(1);
			expect(channel._sendReaction).toHaveBeenCalledWith(request);
		});

		it('falls back to _sendReaction if offlineDb is undefined', async () => {
			client.offlineDb = undefined;

			await channel.sendReaction(request);

			expect(channel._sendReaction).toHaveBeenCalledTimes(1);
			expect(channel._sendReaction).toHaveBeenCalledWith(request);
		});
	});

	describe('_sendReaction', () => {
		it('sends the reaction to the correct endpoint with reaction and options', async () => {
			const sendRequestSpy = vi
				.spyOn(client.api, 'sendRequest')
				.mockResolvedValue({ body: {}, metadata: {} });

			await channel._sendReaction(request);

			expect(sendRequestSpy).toHaveBeenCalledTimes(1);
			expect(sendRequestSpy).toHaveBeenCalledWith(
				'POST',
				'/api/v2/chat/messages/{id}/reaction',
				{ id: messageId },
				undefined,
				{ reaction, enforce_unique: true, skip_push: true },
				'application/json',
			);
		});

		it('returns the response from the underlying call', async () => {
			vi.spyOn(client.api, 'sendRequest').mockResolvedValue({
				body: { message: { id: messageId } },
				metadata: {},
			});

			const result = await channel._sendReaction(request);

			expect(result.message).toMatchObject({ id: messageId });
		});
	});
});

describe('delete reaction flow', () => {
	const messageId = 'msg-123';
	const reactionType = 'love';
	const user_id = 'user-abc';

	// Reactions are now deleted with a single request object: deleteReaction({ id, type, user_id? }).
	const request = { id: messageId, type: reactionType };

	let client;
	let channel;
	let queueTaskSpy;
	let deleteReactionSpy;

	beforeEach(async () => {
		client = await getClientWithUser({ id: user_id });
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		channel = client.channel('messaging', 'test');
		// trick the channel into being initialized
		channel.initialized = true;

		// Add a fake message to the paginator for reaction-deletion optimistic update in the db
		// (channel.deleteReaction now resolves the message via messagePaginator.getItem).
		channel.messagePaginator.ingestItem({ id: messageId });

		queueTaskSpy = vi.spyOn(client.offlineDb, 'queueTask').mockResolvedValue({});
		deleteReactionSpy = vi.spyOn(client.offlineDb, 'deleteReaction').mockResolvedValue();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	// NOTE: the 'Deleting a reaction requires specifying both the message and reaction type'
	// validation was dropped in the OpenAPI-client migration; the throw tests were removed.

	describe('deleteReaction', () => {
		beforeEach(() => {
			vi.spyOn(channel, '_deleteReaction').mockResolvedValue({});
		});

		afterEach(() => {
			vi.resetAllMocks();
		});

		it('queues task if offlineDb exists', async () => {
			await channel.deleteReaction(request);

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);

			// The optimistic reaction-row removal is handled by the local-update layer
			// (`applyReactionLocally`); `deleteReaction` itself only queues the replay task.
			expect(deleteReactionSpy).not.toHaveBeenCalled();

			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					channelId: 'test',
					channelType: 'messaging',
					messageId,
					payload: [request],
					type: 'delete-reaction',
				},
			});

			expect(channel._deleteReaction).not.toHaveBeenCalled();
		});

		it('skips calling offlineDb.deleteReaction if the message does not exist in the state, but still queues the task', async () => {
			const unknownRequest = { id: 'some-unknown-message-id', type: reactionType };
			await channel.deleteReaction(unknownRequest);

			expect(deleteReactionSpy).not.toHaveBeenCalled();
			expect(queueTaskSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					channelId: 'test',
					channelType: 'messaging',
					messageId: unknownRequest.id,
					payload: [unknownRequest],
					type: 'delete-reaction',
				},
			});
			expect(channel._deleteReaction).not.toHaveBeenCalled();
		});

		it('falls back to _deleteReaction if offlineDb throws', async () => {
			queueTaskSpy.mockRejectedValue(new Error('Offline failure'));

			await channel.deleteReaction(request);

			expect(channel._deleteReaction).toHaveBeenCalledTimes(1);
			expect(channel._deleteReaction).toHaveBeenCalledWith(request);
		});

		it('falls back to _deleteReaction if offlineDb is undefined', async () => {
			client.offlineDb = undefined;

			await channel.deleteReaction(request);

			expect(channel._deleteReaction).toHaveBeenCalledTimes(1);
			expect(channel._deleteReaction).toHaveBeenCalledWith(request);
		});
	});

	describe('_deleteReaction', () => {
		it('calls sendRequest with user_id when provided', async () => {
			const sendRequestSpy = vi
				.spyOn(client.api, 'sendRequest')
				.mockResolvedValue({ body: {}, metadata: {} });

			await channel._deleteReaction({ ...request, user_id });

			expect(sendRequestSpy).toHaveBeenCalledTimes(1);
			expect(sendRequestSpy).toHaveBeenCalledWith(
				'DELETE',
				'/api/v2/chat/messages/{id}/reaction/{type}',
				{ id: messageId, type: reactionType },
				{ user_id },
			);
		});

		it('calls sendRequest with undefined user_id if user_id is not provided', async () => {
			const sendRequestSpy = vi
				.spyOn(client.api, 'sendRequest')
				.mockResolvedValue({ body: {}, metadata: {} });

			await channel._deleteReaction(request);

			expect(sendRequestSpy).toHaveBeenCalledTimes(1);
			expect(sendRequestSpy).toHaveBeenCalledWith(
				'DELETE',
				'/api/v2/chat/messages/{id}/reaction/{type}',
				{ id: messageId, type: reactionType },
				{ user_id: undefined },
			);
		});

		it('returns the response from the underlying call', async () => {
			vi.spyOn(client.api, 'sendRequest').mockResolvedValue({
				body: { message: { id: messageId } },
				metadata: {},
			});

			const result = await channel._deleteReaction(request);

			expect(result.message).toMatchObject({ id: messageId });
		});
	});
});

describe('message sending flow', () => {
	let client;
	let channel;
	let queueTaskSpy;

	const message = {
		id: 'msg-123',
		text: 'Hello world',
		user: { id: 'user-abc' },
	};

	// Messages are now sent as a single request object: sendMessage({ message, ...flags }).
	const request = { message, skip_push: true };

	beforeEach(async () => {
		client = await getClientWithUser({ id: 'user-abc' });
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		channel = client.channel('messaging', 'test');

		queueTaskSpy = vi.spyOn(client.offlineDb, 'queueTask').mockResolvedValue({});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('sendMessage', () => {
		beforeEach(() => {
			vi.spyOn(channel, '_sendMessage').mockResolvedValue({});
		});

		afterEach(() => {
			vi.resetAllMocks();
		});

		it('queues task if offlineDb exists and message has ID', async () => {
			const result = await channel.sendMessage(request);

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					channelId: 'test',
					channelType: 'messaging',
					messageId: 'msg-123',
					payload: [request],
					type: 'send-message',
				},
			});

			expect(result).toEqual({});
			expect(channel._sendMessage).not.toHaveBeenCalled();
		});

		it('falls back to _sendMessage if offlineDb is missing', async () => {
			client.offlineDb = undefined;

			const result = await channel.sendMessage(request);

			expect(channel._sendMessage).toHaveBeenCalledTimes(1);
			expect(channel._sendMessage).toHaveBeenCalledWith(request);
			expect(result).toEqual({});
		});

		it('falls back to _sendMessage if message.id is missing', async () => {
			const noIdRequest = { message: { ...message, id: undefined }, skip_push: true };

			await channel.sendMessage(noIdRequest);

			expect(channel._sendMessage).toHaveBeenCalledWith(noIdRequest);
		});

		it('falls back to _sendMessage if offlineDb throws', async () => {
			queueTaskSpy.mockRejectedValue(new Error('Queue failed'));

			const result = await channel.sendMessage(request);

			expect(channel._sendMessage).toHaveBeenCalledWith(request);
			expect(result).toEqual({});
		});
	});

	describe('_sendMessage', () => {
		it('sends the message to the correct endpoint with options', async () => {
			const sendRequestSpy = vi
				.spyOn(client.api, 'sendRequest')
				.mockResolvedValue({ body: {}, metadata: {} });

			await channel._sendMessage(request);

			expect(sendRequestSpy).toHaveBeenCalledTimes(1);
			expect(sendRequestSpy).toHaveBeenCalledWith(
				'POST',
				'/api/v2/chat/channels/{type}/{id}/message',
				{ type: 'messaging', id: 'test' },
				undefined,
				{
					message,
					keep_channel_hidden: undefined,
					skip_enrich_url: undefined,
					skip_push: true,
				},
				'application/json',
			);
		});

		it('works without options', async () => {
			const sendRequestSpy = vi
				.spyOn(client.api, 'sendRequest')
				.mockResolvedValue({ body: {}, metadata: {} });

			await channel._sendMessage({ message });

			expect(sendRequestSpy).toHaveBeenCalledWith(
				'POST',
				'/api/v2/chat/channels/{type}/{id}/message',
				{ type: 'messaging', id: 'test' },
				undefined,
				{
					message,
					keep_channel_hidden: undefined,
					skip_enrich_url: undefined,
					skip_push: undefined,
				},
				'application/json',
			);
		});
	});
});

describe('share location', () => {
	const userId = 'user-id';
	const staticLocation = {
		created_by_device_id: 'created_by_device_id',
		latitude: 1,
		longitude: 2,
		message_id: 'staticLocation_message_id',
	};
	const liveLocation = {
		created_by_device_id: 'created_by_device_id',
		end_at: 'end_at',
		latitude: 1,
		longitude: 2,
		message_id: 'liveLocation_message_id',
	};

	const setup = async () => {
		const client = await getClientWithUser({ id: 'user-abc' });
		const channel = client.channel('messaging', 'test');
		const sendMessageSpy = vi.spyOn(channel, 'sendMessage').mockResolvedValue({});
		const dispatchEventSpy = vi.spyOn(client, 'dispatchEvent').mockResolvedValue({});
		// stopLiveLocationSharing now goes through the generated client.updateLiveLocation.
		const updateLiveLocationSpy = vi
			.spyOn(client, 'updateLiveLocation')
			.mockResolvedValue({});
		return {
			channel,
			client,
			dispatchEventSpy,
			sendMessageSpy,
			updateLiveLocationSpy,
		};
	};

	it('forwards the location object', async () => {
		const { channel, sendMessageSpy } = await setup();

		// sendSharedLocation now forwards a single-object sendMessage request wrapping the location.
		await channel.sendSharedLocation(staticLocation);
		expect(sendMessageSpy).toHaveBeenCalledWith({
			message: { id: staticLocation.message_id, shared_location: staticLocation },
		});

		await channel.sendSharedLocation(liveLocation);
		expect(sendMessageSpy).toHaveBeenCalledWith({
			message: { id: liveLocation.message_id, shared_location: liveLocation },
		});
	});

	it('does not inject a user into the request payload', async () => {
		// The `userId`/`user` injection was dropped in the OpenAPI-client migration:
		// sendSharedLocation takes only the location and forwards no user object.
		const { channel, sendMessageSpy } = await setup();

		await channel.sendSharedLocation(staticLocation, userId);
		const sentArg = sendMessageSpy.mock.calls[0][0];
		expect(sentArg).to.deep.equal({
			message: { id: staticLocation.message_id, shared_location: staticLocation },
		});
		expect(sentArg.message.user).to.be.undefined;
	});
	it('emits live_location_sharing.started local event', async () => {
		const { channel, dispatchEventSpy, sendMessageSpy } = await setup();

		sendMessageSpy.mockResolvedValueOnce({ message: { id: staticLocation.message_id } });
		await channel.sendSharedLocation(staticLocation);
		expect(dispatchEventSpy).not.toHaveBeenCalled();

		sendMessageSpy.mockResolvedValueOnce({ message: { id: liveLocation.message_id } });
		await channel.sendSharedLocation(liveLocation);
		expect(dispatchEventSpy).toHaveBeenCalledWith({
			message: { id: liveLocation.message_id },
			type: 'live_location_sharing.started',
		});
	});

	it('stops live location sharing', async () => {
		const { channel, dispatchEventSpy, updateLiveLocationSpy } = await setup();

		updateLiveLocationSpy.mockResolvedValueOnce(staticLocation);
		await channel.stopLiveLocationSharing(staticLocation);
		expect(dispatchEventSpy).toHaveBeenCalledWith({
			live_location: expect.objectContaining(staticLocation),
			type: 'live_location_sharing.stopped',
		});

		updateLiveLocationSpy.mockResolvedValueOnce(liveLocation);
		await channel.stopLiveLocationSharing(liveLocation);
		expect(dispatchEventSpy).toHaveBeenCalledWith({
			live_location: expect.objectContaining(liveLocation),
			type: 'live_location_sharing.stopped',
		});
	});
});

describe('Channel.query — initial page size', () => {
	let client;
	let channel;

	beforeEach(() => {
		client = new StreamChat('apiKey');
		client.user = { id: 'user' };
		const channelResponse = generateChannel();
		channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
		channel.initialized = true;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('honors the paginator pageSize for the INITIAL open, not the server default', async () => {
		channel.messagePaginator.pageSize = 25;
		const getOrCreate = vi
			.spyOn(channel, 'getOrCreate')
			.mockResolvedValue(
				generateChannel({ channel: { id: channel.id, type: channel.type } }),
			);

		await channel.query({}, 'latest');

		// The initial open asks the server for exactly pageSize messages (not its larger default).
		expect(getOrCreate).toHaveBeenCalledWith(
			expect.objectContaining({ messages: { limit: 25 } }),
		);
	});

	it('respects an explicit messages.limit (reconnect sizes it to the loaded window)', async () => {
		channel.messagePaginator.pageSize = 25;
		const getOrCreate = vi
			.spyOn(channel, 'getOrCreate')
			.mockResolvedValue(
				generateChannel({ channel: { id: channel.id, type: channel.type } }),
			);

		// e.g. channel.reload → watch({ messages: { limit: items.length } }) — passed through as-is.
		await channel.query({ messages: { limit: 80 } }, 'latest');

		expect(getOrCreate).toHaveBeenCalledWith(
			expect.objectContaining({ messages: { limit: 80 } }),
		);
	});
});

describe('Channel.reload', () => {
	let client;
	let channel;

	const at = (minute) => new Date(Date.UTC(2020, 0, 1, 0, minute, 0));
	// Messages need the channel cid so the main-list paginator's ingestItem filter ({ cid }) accepts them.
	const msg = (id, minute, overrides = {}) =>
		generateMsg({ id, cid: channel.cid, date: at(minute), ...overrides });

	beforeEach(() => {
		client = new StreamChat('apiKey');
		client.user = { id: 'user' };
		const channelResponse = generateChannel();
		channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
		channel.initialized = true;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('reconciles a message hard-deleted while offline and keeps one that arrived during the fetch', async () => {
		// m3 (newest loaded) is the one hard-deleted while offline.
		seedLatestWindow(channel, [msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
		expect(channel.messagePaginator.items.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

		// The fold + reconcile now lives in query() → seedFirstPageSync (shared with the channel-list
		// re-hydrate and React's recoverState); reload() is just watch() with the full-window limit.
		// query() snapshots the loaded ids BEFORE this fetch, so a brand-new message that lands via WS
		// DURING it (below) — absent from the server page — must survive. This exercises the whole
		// snapshot-before-await + reconcile chain end to end, not the paginator in isolation.
		vi.spyOn(channel, 'getOrCreate').mockImplementation(async () => {
			channel.messagePaginator.ingestItem(formatMessage(msg('m4', 4)));
			return generateChannel({
				channel: { id: channel.id, type: channel.type },
				messages: [msg('m1', 1), msg('m2', 2)],
			});
		});

		await channel.reload();

		// m3 (in the pre-fetch snapshot, absent from the page) removed; m4 (arrived after) kept.
		expect(channel.messagePaginator.items.map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);
	});

	it('requests the full loaded window (items.length), not the channel-list page size', async () => {
		seedLatestWindow(channel, [msg('m1', 1), msg('m2', 2), msg('m3', 3)]);
		const watchSpy = vi
			.spyOn(channel, 'watch')
			.mockResolvedValue({ messages: [msg('m1', 1), msg('m2', 2), msg('m3', 3)] });

		await channel.reload();

		expect(watchSpy).toHaveBeenCalledWith({ messages: { limit: 3 } });
	});

	it('preserves a failed (unsent) message that a disjoint rebuild would otherwise drop', async () => {
		seedLatestWindow(channel, [
			msg('m1', 1),
			msg('failed', 2, { status: 'failed' }),
			msg('m3', 3),
		]);
		// A page that shares no id with the loaded window is disjoint, so the fold rebuilds and discards
		// local-only messages — reload must re-ingest the failed one so it is not lost.
		vi.spyOn(channel, 'getOrCreate').mockImplementation(async () =>
			generateChannel({
				channel: { id: channel.id, type: channel.type },
				messages: [msg('n8', 8), msg('n9', 9)],
			}),
		);

		await channel.reload();

		expect(channel.messagePaginator.getItem('failed')).toBeDefined();
	});

	it('ignores a re-entrant reload while one is already in flight', async () => {
		seedLatestWindow(channel, [msg('m1', 1)]);
		let resolveWatch;
		const watchSpy = vi.spyOn(channel, 'watch').mockReturnValue(
			new Promise((resolve) => {
				resolveWatch = () => resolve({ messages: [msg('m1', 1)] });
			}),
		);

		const inFlight = channel.reload();
		await channel.reload(); // guarded — returns immediately, must not call watch again
		resolveWatch();
		await inFlight;

		expect(watchSpy).toHaveBeenCalledTimes(1);
	});
});
