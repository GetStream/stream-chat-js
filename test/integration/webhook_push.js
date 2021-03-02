import chai from 'chai';
import {
	createUserToken,
	getTestClient,
	getTestClientForUser,
	setupWebhook,
} from './utils';
import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;

describe('Push Webhook', function () {
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;
	const horatiuID = `horatiu-${uuidv4()}`;
	const jaapID = `jaap-${uuidv4()}`;
	const channelID = `fun-${uuidv4()}`;
	const client = getTestClient(true);

	let chan, webhook, messageResponse;

	const promises = {
		events: {},
		resolvers: {},
		counters: {},
		eventReceived(newEvent) {
			const type = newEvent.type;
			const events = this.events[type];

			if (events === undefined) {
				return;
			}

			events.push(newEvent);

			if (events.length >= this.counters[type]) {
				this.resolvers[type](events);
			}
		},
		waitForEvents(type, count = 1) {
			this.events[type] = [];
			this.counters[type] = count;
			this.resolvers[type] = () => {};
			return new Promise((resolve) => {
				this.resolvers[type] = resolve;
			});
		},
	};

	before(async () => {
		chan = client.channel('messaging', channelID, { created_by: { id: tommasoID } });
		webhook = await setupWebhook(client, 'webhook_url', (request, body, response) => {
			// make sure the request signature is correct
			expect(client.verifyWebhook(body, request.headers['x-signature'])).to.eq(
				true,
			);
			promises.eventReceived(JSON.parse(body));
			response.writeHead(201);
		});

		await Promise.all([
			client.upsertUser({ id: thierryID }),
			client.upsertUser({ id: tommasoID }),
			client.upsertUser({ id: horatiuID }),
			client.upsertUser({ id: jaapID }),
			chan.create(),
		]);
	});

	afterEach(() => {
		webhook.reset();
	});

	after(async () => {
		await webhook.tearDown();
	});

	it('should receive new message event', async function () {
		await chan.create();
		const [events] = await Promise.all([
			promises.waitForEvents('message.new'),
			chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('message.new');
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
	});

	it('should receive message flagged/unflagged event', async function () {
		await chan.create();

		// send a message
		let sendMessageResp;
		let [events] = await Promise.all([
			promises.waitForEvents('message.new'),
			(sendMessageResp = await chan.sendMessage({
				text: 'flag candidate',
				user: { id: tommasoID },
			})),
		]);
		const msgNewEvent = events.pop();
		expect(msgNewEvent).to.not.be.null;
		expect(msgNewEvent.type).to.eq('message.new');
		expect(msgNewEvent.channel_type).to.eq(chan.type);
		expect(msgNewEvent.channel_id).to.eq(chan.id);

		// expect message.flagged event
		[events] = await Promise.all([
			promises.waitForEvents('message.flagged'),
			client.flagMessage(sendMessageResp.message.id, { user_id: tommasoID }),
		]);
		const userFlaggedEvent = events.pop();
		expect(userFlaggedEvent).to.not.be.null;
		expect(userFlaggedEvent.type).to.eq('message.flagged');
		expect(userFlaggedEvent.channel_type).to.eq(chan.type);
		expect(userFlaggedEvent.channel_id).to.eq(chan.id);
		expect(userFlaggedEvent.message.id).to.eq(sendMessageResp.message.id);
		expect(userFlaggedEvent.total_flags).to.eq(1);

		// expect message.unflagged event
		[events] = await Promise.all([
			promises.waitForEvents('message.unflagged'),
			client.unflagMessage(sendMessageResp.message.id, { user_id: tommasoID }),
		]);
		const userUnFlaggedEvent = events.pop();
		expect(userUnFlaggedEvent).to.not.be.null;
		expect(userUnFlaggedEvent.type).to.eq('message.unflagged');
		expect(userUnFlaggedEvent.channel_type).to.eq(chan.type);
		expect(userUnFlaggedEvent.channel_id).to.eq(chan.id);
		expect(userUnFlaggedEvent.message.id).to.eq(sendMessageResp.message.id);
		expect(userUnFlaggedEvent.total_flags).to.eq(0);
	});

	it('should receive user flagged/unflagged event', async function () {
		await chan.create();

		// expect user.flagged event
		let [events] = await Promise.all([
			promises.waitForEvents('user.flagged'),
			client.flagUser(tommasoID, { user_id: tommasoID }),
		]);
		const userFlaggedEvent = events.pop();
		expect(userFlaggedEvent).to.not.be.null;
		expect(userFlaggedEvent.type).to.eq('user.flagged');
		expect(userFlaggedEvent.total_flags).to.eq(1);

		// expect user.unflagged event
		[events] = await Promise.all([
			promises.waitForEvents('user.unflagged'),
			client.unflagUser(tommasoID, { user_id: tommasoID }),
		]);
		const userUnFlaggedEvent = events.pop();
		expect(userUnFlaggedEvent).to.not.be.null;
		expect(userUnFlaggedEvent.type).to.eq('user.unflagged');
		expect(userUnFlaggedEvent.total_flags).to.eq(0);
	});

	it('should receive new message event with members included', async function () {
		await chan.addMembers([thierryID, tommasoID]);
		const [events] = await Promise.all([
			promises.waitForEvents('message.new'),
			chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('message.new');
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.members).to.not.be.null;
		expect(event.members).to.be.an('array');
		expect(event.members).to.have.length(2);

		const thierry = event.members.find((mem) => mem.user.id === thierryID);
		const tommaso = event.members.find((mem) => mem.user.id === tommasoID);
		expect(thierry).to.not.be.undefined;
		expect(tommaso).to.not.be.undefined;
		expect(thierry.user.unread_count).to.eq(1);
		expect(thierry.user.total_unread_count).to.eq(1);
		expect(thierry.user.unread_channels).to.eq(1);
		expect(thierry.user.online).to.eq(false);
		// tommaso gets the same count since he created the msg
		expect(tommaso.user.unread_count).to.eq(0);
		expect(tommaso.user.total_unread_count).to.eq(0);
		expect(tommaso.user.unread_channels).to.eq(0);
		expect(tommaso.user.online).to.eq(false);
	});

	it('should receive new message event with thread participants', async function () {
		await chan.addMembers([horatiuID]);

		const eventsPromise = promises.waitForEvents('message.new', 3);

		const parent = await chan.sendMessage({
			text: uuidv4(),
			user: { id: tommasoID },
		});

		await chan.sendMessage({
			text: uuidv4(),
			user: { id: thierryID },
			parent_id: parent.message.id,
		});

		await chan.sendMessage({
			text: uuidv4(),
			user: { id: horatiuID },
			parent_id: parent.message.id,
		});

		const events = await eventsPromise;

		expect(events[0].thread_participants).to.be.undefined; // no thread participant for parent
		expect(events[1].thread_participants.map((u) => u.id)).to.have.members([
			thierryID,
			tommasoID,
		]);
		expect(events[2].thread_participants.map((u) => u.id)).to.have.members([
			thierryID,
			tommasoID,
			horatiuID,
		]);
	});

	it('thierry marks the channel as read', async function () {
		const thierryClient = await getTestClientForUser(thierryID);
		const thierryChannel = thierryClient.channel(chan.type, chan.id);
		await thierryChannel.watch();
		const [events] = await Promise.all([
			promises.waitForEvents('message.read'),
			thierryChannel.markRead(),
		]);
		const event = events[0];
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.user).to.be.an('object');
		expect(event.user.channel_unread_count).to.eq(0);
		expect(event.user.channel_last_read_at).to.be.a('string');
		const parsedDate = new Date(event.user.channel_last_read_at);
		expect(parsedDate.toString()).to.not.eq('Invalid Date');
		expect(event.user.total_unread_count).to.eq(0);
		expect(event.user.total_unread_count).to.eq(0);
		expect(event.user.unread_channels).to.eq(0);
		expect(event.user.unread_count).to.eq(0);
	});

	it('online status and unread_count should update', async function () {
		const [events, response] = await Promise.all([
			promises.waitForEvents('message.new'),
			chan.sendMessage({
				text: uuidv4(),
				user: { id: tommasoID },
			}),
		]);
		const event = events[0];
		messageResponse = response;

		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.members).to.have.lengthOf(3);

		const thierry = event.members.find((mem) => mem.user.id === thierryID);
		const tommaso = event.members.find((mem) => mem.user.id === tommasoID);
		expect(thierry).to.not.be.undefined;
		expect(tommaso).to.not.be.undefined;
		expect(thierry.user.online).to.eq(true);
		expect(thierry.user.unread_count).to.eq(1);
		expect(thierry.user.channel_unread_count).to.eq(1);
		expect(thierry.user.total_unread_count).to.eq(1);
		expect(thierry.user.unread_channels).to.eq(1);
		expect(thierry.user.channel_last_read_at).to.not.be.null;
		const lastRead = new Date(thierry.user.channel_last_read_at);
		expect(lastRead.toString()).to.not.be.eq('Invalid Date');
		expect(tommaso.user.online).to.eq(false);
		expect(tommaso.user.unread_count).to.eq(0);
		expect(tommaso.user.channel_unread_count).to.eq(0);
		expect(tommaso.user.total_unread_count).to.eq(0);
		expect(tommaso.user.unread_channels).to.eq(0);
		expect(tommaso.user.channel_last_read_at).to.not.be.null;
	});

	it('unread_count and channel_unread_count should not be the same', async function () {
		const serverSideClient = getTestClient(true);
		const cid = uuidv4();
		const chan2 = serverSideClient.channel('messaging', cid, {
			created_by: { id: tommasoID },
			members: [thierryID, tommasoID],
		});
		await chan2.create();
		const [events] = await Promise.all([
			promises.waitForEvents('message.new'),
			chan2.sendMessage({
				text: uuidv4(),
				user: { id: tommasoID },
			}),
		]);

		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan2.type);
		expect(event.channel_id).to.eq(chan2.id);
		expect(event.members).to.have.lengthOf(2);
		const thierry = event.members.find((mem) => mem.user.id === thierryID);
		expect(thierry).to.not.be.undefined;
		expect(thierry.user.online).to.eq(true);
		expect(thierry.user.unread_count).to.eq(2);
		expect(thierry.user.channel_unread_count).to.eq(1);
		expect(thierry.user.total_unread_count).to.eq(2);
		expect(thierry.user.unread_channels).to.eq(2);
	});

	it('message.update', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('message.updated'),
			client.updateMessage(
				{
					...messageResponse.message,
					text: 'new stuff',
				},
				tommasoID,
			),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.user).to.be.an('object');
		expect(event.type).to.eq('message.updated');
		expect(event.user.id).to.eq(tommasoID);
		expect(event.message).to.be.an('object');
		expect(event.message.text).to.eq('new stuff');
	});

	it('reaction.new when reaction is added', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('reaction.new'),
			chan.sendReaction(messageResponse.message.id, {
				type: 'lol',
				user: { id: tommasoID },
			}),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.user).to.be.an('object');
		expect(event.type).to.eq('reaction.new');
		expect(event.message.reaction_counts).to.eql({ lol: 1 });
	});

	it('reaction.updated when a reaction is updated', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('reaction.updated'),
			chan.sendReaction(messageResponse.message.id, {
				type: 'lol',
				user: { id: tommasoID },
				score: 5,
			}),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.user).to.be.an('object');
		expect(event.type).to.eq('reaction.updated');
		expect(event.message.reaction_scores).to.eql({ lol: 5 });
		expect(event.message.reaction_counts).to.eql({ lol: 1 });
	});

	it('reaction.deleted when reaction is removed', async function () {
		const tommasoClient = await getTestClientForUser(tommasoID);
		const tommasoChannel = tommasoClient.channel(chan.type, chan.id);
		await tommasoChannel.watch();
		const [events] = await Promise.all([
			promises.waitForEvents('reaction.deleted'),
			tommasoChannel.deleteReaction(messageResponse.message.id, 'lol'),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.user).to.be.an('object');
		expect(event.type).to.eq('reaction.deleted');
		expect(event.message.reaction_counts).to.eql({});
	});

	it('message.deleted', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('message.deleted'),
			client.deleteMessage(messageResponse.message.id),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.type).to.eq('message.deleted');
		expect(event.message.user).to.be.an('object');
		expect(event.message.user.id).to.eq(tommasoID);
	});

	it('user.updated', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('user.updated'),
			client.upsertUser({ id: thierryID, awesome: true }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.updated');
		expect(event.user.id).to.eq(thierryID);
	});

	it('member.added', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('member.added'),
			chan.addMembers([jaapID]),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('member.added');
		expect(event.user.id).to.eq(jaapID);
	});

	it('member.updated', async function () {
		await Promise.all([
			promises.waitForEvents('member.updated'),
			chan.addModerators([thierryID]),
		]);
	});

	it('member.removed', async function () {
		await Promise.all([
			promises.waitForEvents('member.removed', 4),
			chan.removeMembers([thierryID]),
			chan.removeMembers([tommasoID]),
			chan.removeMembers([jaapID]),
			chan.removeMembers([horatiuID]),
		]);
	});

	it('thierry should not be in the member list anymore', async function () {
		const [events, response] = await Promise.all([
			promises.waitForEvents('message.new'),
			chan.sendMessage({
				text: uuidv4(),
				user: { id: tommasoID },
			}),
		]);
		messageResponse = response;
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.members).to.be.undefined;
	});

	it('channel.updated without message', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('channel.updated'),
			chan.update({ awesome: 'yes' }),
		]);

		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.type).to.eq('channel.updated');
		expect(event.channel.awesome).to.eq('yes');
	});

	it('channel.updated with a message', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('channel.updated'),
			chan.update(
				{ awesome: 'yes yes' },
				{ text: uuidv4(), custom_stuff: 'bananas', user: { id: tommasoID } },
			),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.channel_type).to.eq(chan.type);
		expect(event.channel_id).to.eq(chan.id);
		expect(event.type).to.eq('channel.updated');
		expect(event.channel.awesome).to.eq('yes yes');
		expect(event.message).to.not.be.null;
		expect(event.message.custom_stuff).to.eq('bananas');
	});

	it('channel.created', async function () {
		const chan2 = client.channel('messaging', uuidv4(), {
			created_by: { id: tommasoID },
		});
		const [events] = await Promise.all([
			promises.waitForEvents('channel.created'),
			chan2.create(),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('channel.created');
		expect(event.channel_type).to.eq(chan2.type);
		expect(event.channel_id).to.eq(chan2.id);
	});

	it('moderation mute', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('user.muted'),
			client.muteUser(tommasoID, jaapID),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.muted');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.eq(jaapID);
		expect(event.target_user).to.be.an('object');
		expect(event.target_user.id).to.eq(tommasoID);
	});

	it('slash mute', async function () {
		const text = `/mute ${tommasoID}`;
		const [events] = await Promise.all([
			promises.waitForEvents('user.muted'),
			chan.sendMessage({ text, user_id: jaapID }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.muted');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.eq(jaapID);
		expect(event.target_user).to.be.an('object');
		expect(event.target_user.id).to.eq(tommasoID);
	});

	it('moderation unmute', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('user.unmuted'),
			client.unmuteUser(tommasoID, jaapID),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.unmuted');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.eq(jaapID);
		expect(event.target_user).to.be.an('object');
		expect(event.target_user.id).to.eq(tommasoID);
	});

	it('channel mute', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('channel.muted'),
			chan.mute({ user_id: jaapID }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('channel.muted');
		expect(event.mute).to.be.an('object');
		expect(event.mute.channel.cid).to.eq(chan.cid);
		expect(event.mute.user.id).to.eq(jaapID);
	});

	it('channel unmute', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('channel.unmuted'),
			chan.unmute({ user_id: jaapID }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('channel.unmuted');
		expect(event.mute).to.be.an('object');
		expect(event.mute.channel.cid).to.eq(chan.cid);
		expect(event.mute.user.id).to.eq(jaapID);
	});

	it('slash unmute', async function () {
		let text = `/mute ${thierryID}`;
		await chan.sendMessage({ text, user_id: jaapID });
		text = `/unmute ${thierryID}`;
		const [events] = await Promise.all([
			promises.waitForEvents('user.unmuted'),
			chan.sendMessage({ text, user_id: jaapID }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.unmuted');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.eq(jaapID);
		expect(event.target_user).to.be.an('object');
		expect(event.target_user.id).to.eq(thierryID);
	});

	it('message is flagged', async function () {
		const messageResponse = await chan.sendMessage({
			text: 'hello world',
			user_id: jaapID,
		});
		const [events] = await Promise.all([
			promises.waitForEvents('message.flagged'),
			client.flagMessage(messageResponse.message.id, { user_id: thierryID }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('message.flagged');
		expect(event.message).to.be.an('object');
		expect(event.cid).to.eq(chan.cid);
		expect(event.message.user.id).to.eq(jaapID);
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.eq(thierryID);
	});

	it('message is unflagged', async function () {
		const messageResponse = await chan.sendMessage({
			text: 'hello world',
			user_id: jaapID,
		});
		await Promise.all([
			promises.waitForEvents('message.flagged'),
			client.flagMessage(messageResponse.message.id, { user_id: thierryID }),
		]);
		const [events] = await Promise.all([
			promises.waitForEvents('message.unflagged'),
			client.unflagMessage(messageResponse.message.id, {
				user_id: thierryID,
				reason: 'the cat in the hat',
			}),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('message.unflagged');
		expect(event.message).to.be.an('object');
		expect(event.cid).to.eq(chan.cid);
		expect(event.message.user.id).to.eq(jaapID);
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.eq(thierryID);
	});

	it('user is deactivated ("user.deactivated")', async function () {
		const newUserID = uuidv4();
		await client.upsertUser({ id: newUserID });

		const [events] = await Promise.all([
			promises.waitForEvents('user.deactivated'),
			client.deactivateUser(newUserID, {
				reason: 'the cat in the hat',
				created_by_id: thierryID,
			}),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.deactivated');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.be.eq(newUserID);
		expect(event.created_by.id).to.be.eq(thierryID);
	});

	it('user is reactivated ("user.reactivated")', async function () {
		const newUserID = uuidv4();
		await client.upsertUser({ id: newUserID });
		await client.deactivateUser(newUserID, {
			reason: 'the cat in the hat',
		});

		const [events] = await Promise.all([
			promises.waitForEvents('user.reactivated'),
			client.reactivateUser(newUserID, {
				created_by_id: thierryID,
			}),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.reactivated');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.be.eq(newUserID);
		expect(event.created_by.id).to.be.eq(thierryID);
	});

	it('user created using connectUser trigger webhook event', async function () {
		const client = getTestClient(false);
		const newUserID = uuidv4();
		client.connectUser({ id: newUserID }, createUserToken(newUserID));

		const [events] = await Promise.all([promises.waitForEvents('user.updated')]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.user.id).to.be.eq(newUserID);
	});

	it('user updated using connectUser trigger webhook event', async function () {
		const client = getTestClient(false);
		client.connectUser({ id: tommasoID, cto: true }, createUserToken(tommasoID));

		const [events] = await Promise.all([promises.waitForEvents('user.updated')]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.user.id).to.be.eq(tommasoID);
		expect(event.user.cto).to.be.eq(true);
	});

	it('user is deleted ("user.deleted")', async function () {
		// Create a user to delete
		const newUserID = uuidv4();
		await client.upsertUser({ id: newUserID });

		// Delete the user
		const [events] = await Promise.all([
			promises.waitForEvents('user.deleted'),
			client.deleteUser(newUserID, {}),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.deleted');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.be.eq(newUserID);
	});

	it('user is banned ("user.banned")', async function () {
		// Create a user to ban
		const newUserID = uuidv4();
		await client.upsertUser({ id: newUserID });

		// Ban the user
		const [events] = await Promise.all([
			promises.waitForEvents('user.banned'),
			client.banUser(newUserID, {
				reason: 'testy mctestify',
				banned_by_id: thierryID,
				timeout: 120,
			}),
		]);

		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.banned');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.be.eq(newUserID);
		expect(event.reason).to.be.eq('testy mctestify');
		expect(event.expiration).to.not.be.null;
		expect(event.created_by.id).to.be.eq(thierryID);
		expect(event.created_by.id).to.be.eq(thierryID);
		expect(event.total_bans).to.be.eq(1);
	});

	it('user is banned from channel ("user.banned")', async function () {
		// Create a user to ban
		const newUserID = uuidv4();
		await client.upsertUser({ id: newUserID });
		await chan.addMembers([newUserID]);

		// Ban the user
		const [events] = await Promise.all([
			promises.waitForEvents('user.banned'),
			chan.banUser(newUserID, {
				reason: 'testy mctestify',
				banned_by_id: thierryID,
			}),
		]);

		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.banned');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.be.eq(newUserID);
		expect(event.reason).to.be.eq('testy mctestify');
		expect(event.created_by.id).to.be.eq(thierryID);
		expect(event.channel_id).to.be.eq(chan.id);
		expect(event.total_bans).to.be.eq(1);
	});

	it('user is unbanned ("user.unbanned")', async function () {
		// Create a user to ban/unban
		const newUserID = uuidv4();
		await client.upsertUser({ id: newUserID });
		await client.banUser(newUserID, {
			reason: 'testy mctestify',
			banned_by_id: thierryID,
		});

		// Unban the user
		const [events] = await Promise.all([
			promises.waitForEvents('user.unbanned'),
			client.unbanUser(newUserID),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('user.unbanned');
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.be.eq(newUserID);
	});

	it('channel.truncate webhook fires', async function () {
		const [events] = await Promise.all([
			promises.waitForEvents('channel.truncated'),
			chan.truncate(),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('channel.truncated');
		expect(event.channel).to.be.an('object');
	});

	it('channel.deleted', async function () {
		await Promise.all([promises.waitForEvents('channel.deleted'), chan.delete()]);
	});

	it('message is flagged', async function () {
		await chan.create();
		const messageResponse = await chan.sendMessage({
			text: 'hello world',
			user_id: jaapID,
		});
		const [events] = await Promise.all([
			promises.waitForEvents('message.flagged'),
			client.flagMessage(messageResponse.message.id, { user_id: thierryID }),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('message.flagged');
		expect(event.message).to.be.an('object');
		expect(event.cid).to.eq(chan.cid);
		expect(event.message.user.id).to.eq(jaapID);
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.eq(thierryID);
	});

	it('message is unflagged', async function () {
		const messageResponse = await chan.sendMessage({
			text: 'hello world',
			user_id: jaapID,
		});
		await Promise.all([
			promises.waitForEvents('message.flagged'),
			client.flagMessage(messageResponse.message.id, { user_id: thierryID }),
		]);
		const [events] = await Promise.all([
			promises.waitForEvents('message.unflagged'),
			client.unflagMessage(messageResponse.message.id, {
				user_id: thierryID,
				reason: 'the cat in the hat',
			}),
		]);
		const event = events[0];
		expect(event).to.not.be.null;
		expect(event.type).to.eq('message.unflagged');
		expect(event.message).to.be.an('object');
		expect(event.cid).to.eq(chan.cid);
		expect(event.message.user.id).to.eq(jaapID);
		expect(event.user).to.be.an('object');
		expect(event.user.id).to.eq(thierryID);
	});
});
