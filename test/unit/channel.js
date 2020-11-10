import chai from 'chai';
import { Channel } from '../../src/channel';
import { generateMsg } from './utils';

const expect = chai.expect;

describe('Channel count unread', function () {
	const user = { id: 'user' };
	const lastRead = new Date('2020-01-01T00:00:00');

	const channel = new Channel({}, 'messaging', 'id');
	channel.lastRead = () => lastRead;
	channel.getClient = () => ({
		user,
		userID: 'user',
		userMuteStatus: (targetId) => targetId.startsWith('mute'),
	});

	const ignoredMessages = [
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
	channel.state.addMessagesSorted(ignoredMessages);

	it('_countMessageAsUnread should return false shadowed or silent messages', function () {
		expect(channel._countMessageAsUnread({ shadowed: true })).not.to.be.ok;
		expect(channel._countMessageAsUnread({ silent: true })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return false for current user messages', function () {
		expect(channel._countMessageAsUnread({ user })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return false for muted user', function () {
		expect(channel._countMessageAsUnread({ user: { id: 'mute1' } })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return true for unmuted user', function () {
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
		channel.state.addMessagesSorted([
			generateMsg({ date: '2021-01-01T00:00:00' }),
			generateMsg({ date: '2022-01-01T00:00:00' }),
		]);
		expect(channel.countUnread(lastRead)).to.be.equal(2);
	});

	it('countUnreadMentions should return correct count', function () {
		expect(channel.countUnreadMentions()).to.be.equal(0);
		channel.state.addMessageSorted(
			generateMsg({
				date: '2021-01-01T00:00:00',
				mentioned_users: [user, { id: 'random' }],
			}),
			generateMsg({
				date: '2022-01-01T00:00:00',
				mentioned_users: [{ id: 'random' }],
			}),
		);
		expect(channel.countUnreadMentions()).to.be.equal(1);
	});
});
