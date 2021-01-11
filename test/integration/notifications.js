import chai from 'chai';
const expect = chai.expect;
import {
	getTestClient,
	getTestClientForUser,
	createUserToken,
	sleep,
	createUsers,
	createEventWaiter,
} from './utils';
import { v4 as uuidv4 } from 'uuid';

describe('Notifications - members not watching', function () {
	const serverSideClient = getTestClient(true);
	const thierryID = `thierry-${uuidv4()}`;
	const tommasoID = `tommaso-${uuidv4()}`;
	let thierryClient, tommasoClient;
	let thierryChannel, tommasoChannel;
	const cid = `c-${uuidv4()}`;
	const message = { text: 'nice little chat API' };
	const events = [];

	before(async () => {
		thierryClient = await getTestClientForUser(thierryID);
		tommasoClient = await getTestClientForUser(tommasoID);
	});

	it('thierry is added to a new channel', async function () {
		const memberNewReceived = new Promise((resolve) => {
			thierryClient.on('notification.added_to_channel', (e) => {
				expect(e.channel).to.be.an('object');
				expect(e.channel.cid).to.eq(`messaging:${cid}`);
				resolve();
			});
		});

		await serverSideClient
			.channel('messaging', cid, {
				created_by: { id: tommasoID },
				members: [thierryID, tommasoID],
			})
			.create();

		await memberNewReceived;
	});

	it('tommaso sends a message on the new channel', async function () {
		tommasoChannel = tommasoClient.channel('messaging', cid);
		await tommasoChannel.watch();

		const messageNewReceived = new Promise((resolve) => {
			thierryClient.on('notification.message_new', (e) => {
				expect(e.cid).to.eq(`messaging:${cid}`);
				expect(e.channel).to.be.an('object');
				expect(e.message).to.be.an('object');
				expect(e.message.user).to.be.an('object');
				expect(e.message.user.id).to.eq(tommasoID);
				expect(e.total_unread_count).to.eq(1);
				expect(e.unread_count).to.eq(1);
				expect(e.unread_channels).to.eq(1);
				resolve();
			});
		});

		await tommasoChannel.sendMessage(message);
		await messageNewReceived;
	});

	it('thierry watches the new channel', async function () {
		thierryChannel = thierryClient.channel('messaging', cid);
		await thierryChannel.watch();
	});

	it('thierry does not get a notification message this time', async function () {
		await sleep(1000);
		expect(events).to.have.length(0);
	});

	it('tommaso sends another message', async function () {
		await tommasoChannel.sendMessage(message);
	});

	it('thierry marks the channel as read', async function () {
		thierryClient.on('notification.mark_read', (e) => {
			events.push(e);
		});
		await thierryChannel.markRead();
	});

	it('thierry gets a notification message with the unread count', async function () {
		await sleep(1000);
		expect(events).to.have.length(1);
		expect(events[0].type).to.eq('notification.mark_read');
		expect(events[0].unread_count).to.eq(0);
		expect(events[0].total_unread_count).to.eq(0);
		events.pop();
	});
});

describe('Notifications - doing stuff on different tabs', function () {
	const serverSideClient = getTestClient(true);
	const message = { text: 'nice little chat API' };
	const thierryID = `thierry-${uuidv4()}`;
	const tommasoID = `tommaso-${uuidv4()}`;
	let tab1Client, tab2Client;
	const cid = `c-${uuidv4()}`;
	const tab1Events = [];
	const tab2Events = [];

	before(async () => {
		await getTestClientForUser(tommasoID);
	});

	it('tab1: init client for thierry', async function () {
		tab1Client = await getTestClientForUser(thierryID);
		tab1Client.on('message.new', (e) => {
			tab1Events.push(e);
		});
		tab1Client.on('notification.message_new', (e) => {
			tab1Events.push(e);
		});
	});

	it('tab2: init client for thierry', async function () {
		tab2Client = await getTestClientForUser(thierryID);
		tab2Client.on('message.new', (e) => {
			tab2Events.push(e);
		});
		tab2Client.on('notification.message_new', (e) => {
			tab2Events.push(e);
		});
	});

	it('create a new channel with thierry and tommaso', async function () {
		const tab1NotificationReceived = new Promise((resolve) => {
			tab1Client.on('notification.added_to_channel', () => {
				resolve();
			});
		});

		const channel = serverSideClient.channel('messaging', cid, {
			created_by: { id: tommasoID },
		});

		await channel.create();
		await channel.addMembers([thierryID, tommasoID]);
		await tab1Client.channel('messaging', cid).watch();
		await tab1NotificationReceived;
	});

	it('tommaso sends a message on the new channel', async function () {
		const tommasoClient = await getTestClientForUser(tommasoID);
		const tommasoChannel = tommasoClient.channel('messaging', cid);
		await tommasoChannel.watch();
		await tommasoChannel.sendMessage(message);

		expect(tommasoChannel.countUnread()).to.eq(0);
	});

	it('tab1: should have a message.new event only', async function () {
		await sleep(1000);
		expect(tab1Events).to.have.length(1);
		expect(tab1Events[0].cid).to.eq(`messaging:${cid}`);
		expect(tab1Events[0].type).to.eq('message.new');
		expect(tab1Events[0].unread_count).to.eq(1);
		expect(tab1Events[0].total_unread_count).to.eq(1);
	});

	it('tab2: should have a notification.message_new event only', async function () {
		await sleep(1000);
		expect(tab2Events).to.have.length(1);
		expect(tab2Events[0].cid).to.eq(`messaging:${cid}`);
		expect(tab2Events[0].type).to.eq('notification.message_new');
	});
});

describe('Mark all read server-side', function () {
	const serverSideClient = getTestClient(true);
	const cids = [uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4()];
	const thierryID = `thierry-${uuidv4()}`;
	const tommasoID = `tommaso-${uuidv4()}`;

	before(async () => {
		await serverSideClient.upsertUser({ id: tommasoID });
		await serverSideClient.upsertUser({ id: thierryID });

		for (let i = 0; i < 5; i++) {
			await serverSideClient
				.channel('messaging', cids[i], {
					created_by: { id: tommasoID },
				})
				.create();
			await serverSideClient
				.channel('livestream', cids[i], {
					created_by: { id: tommasoID },
				})
				.create();
		}
	});

	it('add thierry to all channels', async function () {
		await sleep(1000);
		const p = [];
		for (let i = 0; i < 5; i++) {
			p.push(
				serverSideClient.channel('messaging', cids[i]).addMembers([thierryID]),
			);
			p.push(
				serverSideClient.channel('livestream', cids[i]).addMembers([thierryID]),
			);
		}
		await Promise.all(p);
		await sleep(1000);
	});

	it('add 1 message to 5 messaging channels', async function () {
		const p = [];
		for (let i = 0; i < 5; i++) {
			p.push(
				serverSideClient
					.channel('messaging', cids[i])
					.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
			);
		}
		await Promise.all(p);
	});

	it('thierry connects and receives unread_count=5', async function () {
		const thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.total_unread_count).to.eq(5);
		expect(response.me.unread_count).to.eq(5);
		await thierryClient.disconnect(5000);
	});

	it('thierry checks unread counts via query channel', async function () {
		const thierryClient = getTestClient(false);
		await thierryClient.connectUser({ id: thierryID }, createUserToken(thierryID));
		const channelStates = await thierryClient.queryChannels(
			{ type: 'messaging', members: { $in: [thierryID] } },
			{ last_message_at: 1 },
			{ watch: false },
		);
		expect(channelStates).to.have.length(5);
		expect(channelStates[0].countUnread()).to.eq(1);
		expect(channelStates[1].countUnread()).to.eq(1);
		expect(channelStates[2].countUnread()).to.eq(1);
		expect(channelStates[3].countUnread()).to.eq(1);
		expect(channelStates[4].countUnread()).to.eq(1);
	});

	it('server marks all as read', async function () {
		await serverSideClient.markAllRead({ user: { id: thierryID } });
	});

	it('thierry connects and receives unread_count=0', async function () {
		const thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.total_unread_count).to.eq(0);
		expect(response.me.unread_count).to.eq(0);
		expect(response.me.unread_channels).to.eq(0);
		await thierryClient.disconnect(5000);
	});

	it('thierry checks unread counts via query channel', async function () {
		const thierryClient = getTestClient(false);
		await thierryClient.connectUser({ id: thierryID }, createUserToken(thierryID));
		const channelStates = await thierryClient.queryChannels(
			{ type: 'messaging', members: { $in: [thierryID] } },
			{ last_message_at: 1 },
			{ watch: false },
		);
		expect(channelStates).to.have.length(5);
		expect(channelStates[0].countUnread()).to.eq(0);
		expect(channelStates[1].countUnread()).to.eq(0);
		expect(channelStates[2].countUnread()).to.eq(0);
		expect(channelStates[3].countUnread()).to.eq(0);
		expect(channelStates[4].countUnread()).to.eq(0);
	});
});

describe('Mark all read', function () {
	const serverSideClient = getTestClient(true);
	const cids = [uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4()];
	const thierryID = `thierry-${uuidv4()}`;
	const tommasoID = `tommaso-${uuidv4()}`;

	before(async () => {
		await serverSideClient.upsertUser({ id: tommasoID });
		await serverSideClient.upsertUser({ id: thierryID });

		for (let i = 0; i < 5; i++) {
			await serverSideClient
				.channel('messaging', cids[i], {
					created_by: { id: tommasoID },
				})
				.create();
			await serverSideClient
				.channel('livestream', cids[i], {
					created_by: { id: tommasoID },
				})
				.create();
		}
	});

	it('add thierry to all channels', async function () {
		await sleep(1000);
		const p = [];
		for (let i = 0; i < 5; i++) {
			p.push(
				serverSideClient.channel('messaging', cids[i]).addMembers([thierryID]),
			);
			p.push(
				serverSideClient.channel('livestream', cids[i]).addMembers([thierryID]),
			);
		}
		await Promise.all(p);
		await sleep(1000);
	});

	it('add 1 message to 5 messaging channels', async function () {
		const p = [];
		for (let i = 0; i < 5; i++) {
			p.push(
				serverSideClient
					.channel('messaging', cids[i])
					.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
			);
		}
		await Promise.all(p);
	});

	it('thierry connects and receives unread_count=5', async function () {
		const thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.total_unread_count).to.eq(5);
		expect(response.me.unread_count).to.eq(5);
		expect(response.me.unread_channels).to.eq(5);
		await thierryClient.disconnect(5000);
	});

	it('thierry checks unread counts via query channel', async function () {
		const thierryClient = getTestClient(false);
		await thierryClient.connectUser({ id: thierryID }, createUserToken(thierryID));
		const channelStates = await thierryClient.queryChannels(
			{ type: 'messaging', members: { $in: [thierryID] } },
			{ last_message_at: 1 },
			{ watch: false },
		);
		expect(channelStates).to.have.length(5);
		expect(channelStates[0].countUnread()).to.eq(1);
		expect(channelStates[1].countUnread()).to.eq(1);
		expect(channelStates[2].countUnread()).to.eq(1);
		expect(channelStates[3].countUnread()).to.eq(1);
		expect(channelStates[4].countUnread()).to.eq(1);
	});

	it('thierry marks all as read', async function () {
		const thierryClient = getTestClient(false);
		await thierryClient.connectUser({ id: thierryID }, createUserToken(thierryID));
		await thierryClient.markAllRead();
		await thierryClient.disconnect(5000);
	});

	it('thierry connects and receives unread_count=0', async function () {
		const thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.total_unread_count).to.eq(0);
		expect(response.me.unread_count).to.eq(0);
		await thierryClient.disconnect(5000);
	});

	it('thierry checks unread counts via query channel', async function () {
		const thierryClient = getTestClient(false);
		await thierryClient.connectUser({ id: thierryID }, createUserToken(thierryID));
		const channelStates = await thierryClient.queryChannels(
			{ type: 'messaging', members: { $in: [thierryID] } },
			{ last_message_at: 1 },
			{ watch: false },
		);
		expect(channelStates).to.have.length(5);
		expect(channelStates[0].countUnread()).to.eq(0);
		expect(channelStates[1].countUnread()).to.eq(0);
		expect(channelStates[2].countUnread()).to.eq(0);
		expect(channelStates[3].countUnread()).to.eq(0);
		expect(channelStates[4].countUnread()).to.eq(0);
	});
});

describe('Unread on connect', function () {
	const serverSideClient = getTestClient(true);
	const cids = [uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4()];
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;
	let thierryClient;

	before(async () => {
		await serverSideClient.upsertUser({ id: tommasoID });
		await serverSideClient.upsertUser({ id: thierryID });

		for (let i = 0; i < 5; i++) {
			await serverSideClient
				.channel('messaging', cids[i], {
					created_by: { id: tommasoID },
				})
				.create();
			await serverSideClient
				.channel('livestream', cids[i], {
					created_by: { id: tommasoID },
				})
				.create();
		}
	});

	it('add 1 message to 5 messaging channels', async function () {
		const p = [];
		for (let i = 0; i < 5; i++) {
			p.push(
				serverSideClient
					.channel('messaging', cids[i])
					.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
			);
		}
		await Promise.all(p);
	});

	it('add thierry to all channels', async function () {
		await sleep(1000);
		const p = [];
		for (let i = 0; i < 5; i++) {
			p.push(
				serverSideClient.channel('messaging', cids[i]).addMembers([thierryID]),
			);
			p.push(
				serverSideClient.channel('livestream', cids[i]).addMembers([thierryID]),
			);
		}
		await Promise.all(p);
		await sleep(1000);
	});

	it('add 1 message to 5 messaging channels', async function () {
		for (let i = 0; i < 5; i++) {
			await serverSideClient
				.channel('messaging', cids[i])
				.sendMessage({ text: uuidv4(), user: { id: tommasoID } });
		}
	});

	it('add 1 message to 5 livestream channels', async function () {
		for (let i = 0; i < 5; i++) {
			await serverSideClient
				.channel('livestream', cids[i])
				.sendMessage({ text: uuidv4(), user: { id: tommasoID } });
		}
	});

	it('thierry connects and receives unread_count=5', async function () {
		thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.total_unread_count).to.eq(5);
		expect(response.me.unread_count).to.eq(5);
	});

	it('thierry marks one messaging channel as read', async function () {
		const chan = thierryClient.channel('messaging', cids[1]);
		await chan.watch();
		expect(chan.state.read).to.be.an('object');
		expect(chan.state.read[thierryID]).to.be.an('object');
		expect(chan.state.read[thierryID].user).to.be.an('object');
		const previousLastRead = chan.state.read[thierryID].last_read;
		let resp = chan.countUnread();
		expect(resp).to.eq(1);

		const waiter = createEventWaiter(chan, [
			'notification.mark_read',
			'message.read',
		]);
		chan.markRead();
		await waiter;

		resp = chan.countUnread();
		expect(resp).to.eq(0);
		expect(chan.state.read).to.be.an('object');
		expect(chan.state.read[thierryID]).to.be.an('object');
		expect(chan.state.read[thierryID].user).to.be.an('object');
		expect(chan.state.read[thierryID].last_read).to.be.greaterThan(previousLastRead);
	});

	it('thierry re-connects and receive unread_count=4', async function () {
		thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.unread_count).to.eq(4);
		expect(response.me.total_unread_count).to.eq(4);
	});

	it('thierry checks unread counts via query channel', async function () {
		thierryClient = getTestClient(false);
		await thierryClient.connectUser({ id: thierryID }, createUserToken(thierryID));
		const channelStates = await thierryClient.queryChannels(
			{ type: 'messaging', members: { $in: [thierryID] } },
			{ last_message_at: 1 },
			{ watch: false },
		);
		expect(channelStates).to.have.length(5);
		expect(channelStates[0].countUnread()).to.eq(1);
		expect(channelStates[1].countUnread()).to.eq(0);
		expect(channelStates[2].countUnread()).to.eq(1);
		expect(channelStates[3].countUnread()).to.eq(1);
		expect(channelStates[4].countUnread()).to.eq(1);
	});

	it('insert 100 messages to messaging:chatty', async function () {
		for (let j = 0; j < 10; j++) {
			const p = [];
			for (let i = 0; i < 10; i++) {
				p.push(
					serverSideClient
						.channel('messaging', cids[2])
						.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
				);
			}
			await Promise.all(p);
		}
	});

	it('thierry re-connects and receives unread_count=104', async function () {
		thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.unread_count).to.eq(104);
		expect(response.me.total_unread_count).to.eq(104);
	});

	it('thierry marks messaging:chatty as read', async function () {
		const chan = thierryClient.channel('messaging', cids[2]);
		await chan.watch();
		const receivedEvent = new Promise((resolve) => {
			const subscription = thierryClient.on('notification.mark_read', (e) => {
				expect(e.unread_count).to.eq(3);
				expect(e.total_unread_count).to.eq(3);
				subscription.unsubscribe();
				resolve();
			});
		});
		await chan.markRead();
		await receivedEvent;
	});

	it('thierry re-connects and receives unread_count=3', async function () {
		thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.unread_count).to.eq(3);
		expect(response.me.total_unread_count).to.eq(3);
	});

	it('thierry is removed from the channel and gets notified about it', async function () {
		const readChangeReceived = new Promise((resolve) => {
			const subscription = thierryClient.on('notification.mark_read', (e) => {
				expect(e.unread_count).to.eq(2);
				expect(e.total_unread_count).to.eq(2);
				subscription.unsubscribe();
				resolve();
			});
		});

		const memberDeletedReceived = new Promise((resolve) => {
			thierryClient.on('notification.removed_from_channel', (e) => {
				expect(e.channel).to.be.an('object');
				expect(e.channel.cid).to.eq(`messaging:${cids[0]}`);
				resolve();
			});
		});

		await serverSideClient
			.channel('messaging', cids[0])
			.removeMembers([thierryID, tommasoID]);
		await memberDeletedReceived;
		await readChangeReceived;
	});

	it('thierry re-connects and receives unread_count=2', async function () {
		thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.unread_count).to.eq(2);
		expect(response.me.total_unread_count).to.eq(2);
	});

	it('one channel is deleted', async function () {
		await serverSideClient.channel('messaging', cids[4]).delete();
	});

	it('thierry re-connects and receives unread_count=1', async function () {
		thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.unread_count).to.eq(1);
		expect(response.me.total_unread_count).to.eq(1);
	});

	it('channel gets truncated', async function () {
		await serverSideClient.channel('messaging', cids[3]).truncate();
	});

	it('thierry re-connects and receives unread_count=0', async function () {
		thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.unread_count).to.eq(0);
		expect(response.me.total_unread_count).to.eq(0);
	});

	it('thierry re-connects and receives unread_count=0', async function () {
		const chan = thierryClient.channel('messaging', cids[3]);
		await chan.watch();
		expect(chan.countUnread()).to.eq(0);
	});

	it('tommaso likes one message', async function () {
		const chan = serverSideClient.channel('messaging', cids[2]);
		const r = await chan.query();
		await chan.sendReaction(chan.state.messages[0].id, { type: 'love' }, tommasoID);
	});

	it('thierry re-connects and receives unread_count=0', async function () {
		thierryClient = getTestClient(false);
		const response = await thierryClient.connectUser(
			{ id: thierryID },
			createUserToken(thierryID),
		);
		expect(response.me.unread_count).to.eq(0);
		expect(response.me.total_unread_count).to.eq(0);
		const chan = thierryClient.channel('messaging', cids[2]);
		await chan.watch();
		expect(chan.countUnread()).to.eq(0);
	});
});

describe('replies shouldnt increment unread counts', function () {
	const user1 = uuidv4();
	const user2 = uuidv4();
	const channelID = uuidv4();
	let client1;
	let channel;
	before(async function () {
		await createUsers([user1, user2]);
		client1 = await getTestClientForUser(user1);
		channel = client1.channel('messaging', channelID, { members: [user1, user2] });
		await channel.create();
	});

	it('send a message and add a reply', async function () {
		const resp = await channel.sendMessage({ text: 'hi' });
		await channel.sendMessage({ text: 'reply', parent_id: resp.message.id });
	});

	it('unread counts should be 1', async function () {
		const client = await getTestClientForUser(user2);
		expect(client.health.me.unread_count).to.be.equal(1);
		expect(client.health.me.total_unread_count).to.be.equal(1);
		expect(client.health.me.unread_channels).to.be.equal(1);
	});
});
