import chai from 'chai';
import http from 'http';
import { getTestClient, getTestClientForUser, sleep } from './utils';
import uuidv4 from 'uuid/v4';

const expect = chai.expect;

describe('Webhooks', function() {
	let server;
	let lastMessage;
	let lastMessagePromise;
	let messages = [];
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;
	const jaapID = `jaap-${uuidv4()}`;
	const channelID = `fun-${uuidv4()}`;
	const client = getTestClient(true);
	let chan;

	before(async () => {
		chan = client.channel('messaging', channelID, { created_by: { id: tommasoID } });

		let resolver;
		const createNewPromise = () => {
			lastMessagePromise = new Promise(resolve => {
				resolver = resolve;
			});
		};
		createNewPromise();

		server = http.createServer(function(req, res) {
			let body = '';
			let signature = '';

			req.on('data', chunk => {
				body += chunk.toString(); // convert Buffer to string
			});

			req.on('end', () => {
				lastMessage = JSON.parse(body);
				messages.push(lastMessage);
				res.end('ok');
				signature = req.headers['x-signature'];
				// make sure the request signature is correct
				expect(client.verifyWebhook(body, signature)).to.eq(true);
				const oldResolver = resolver;
				createNewPromise();
				oldResolver();
			});

			res.writeHead(200, { 'Content-Type': 'text/plain' });
		});

		await server.listen(4322, '127.0.0.1');
		await client.updateAppSettings({
			webhook_url: 'http://127.0.0.1:4322/',
		});
		await sleep(100);
		await client.updateUser({ id: thierryID });
		await client.updateUser({ id: tommasoID });
		await client.updateUser({ id: jaapID });
	});

	beforeEach(function() {
		lastMessage = null;
		messages = [];
	});

	after(async () => {
		await client.updateAppSettings({
			webhook_url: '',
		});
		await server.close();
	});

	it('should receive new message event', async function() {
		await chan.create();
		await Promise.all([
			chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('message.new');
	});

	it('should receive new message event with members included', async function() {
		await Promise.all([chan.addMembers([thierryID]), lastMessagePromise]);
		await Promise.all([chan.addMembers([tommasoID]), lastMessagePromise]);
		await Promise.all([
			chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('message.new');
		expect(lastMessage.members).to.not.be.null;
		expect(lastMessage.members).to.be.an('array');
		expect(lastMessage.members).to.have.length(2);
		expect(lastMessage.members[0]).to.be.an('object');
		expect(lastMessage.members[0].user).to.be.an('object');
		expect(lastMessage.members[0].user.unread_count).to.eq(1);
		expect(lastMessage.members[0].user.total_unread_count).to.eq(1);
		expect(lastMessage.members[0].user.unread_channels).to.eq(1);
		expect(lastMessage.members[0].user.id).to.eq(thierryID);
		expect(lastMessage.members[0].user.online).to.eq(false);
		// tommaso gets the same count since he created the msg
		expect(lastMessage.members[1]).to.be.an('object');
		expect(lastMessage.members[1].user).to.be.an('object');
		expect(lastMessage.members[1].user.unread_count).to.eq(0);
		expect(lastMessage.members[1].user.total_unread_count).to.eq(0);
		expect(lastMessage.members[1].user.unread_channels).to.eq(0);
		expect(lastMessage.members[1].user.id).to.eq(tommasoID);
		expect(lastMessage.members[1].user.online).to.eq(false);
	});

	let messageResponse;

	it('thierry marks the channel as read', async function() {
		const thierryClient = await getTestClientForUser(thierryID);
		const thierryChannel = thierryClient.channel(chan.type, chan.id);
		await thierryChannel.watch();
		await Promise.all([thierryChannel.markRead(), lastMessagePromise]);
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.user.channel_unread_count).to.eq(0);
		expect(lastMessage.user.channel_last_read_at).to.be.a('string');
		const parsedDate = new Date(lastMessage.user.channel_last_read_at);
		expect(parsedDate.toString()).to.not.eq('Invalid Date');
		expect(lastMessage.user.total_unread_count).to.eq(0);
		expect(lastMessage.user.total_unread_count).to.eq(0);
		expect(lastMessage.user.unread_channels).to.eq(0);
		expect(lastMessage.user.unread_count).to.eq(0);
	});

	it('online status and unread_count should update', async function() {
		messageResponse = (await Promise.all([
			chan.sendMessage({
				text: uuidv4(),
				user: { id: tommasoID },
			}),
			lastMessagePromise,
		]))[0];
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.members[0].user).to.be.an('object');
		expect(lastMessage.members[0].user.online).to.eq(true);
		expect(lastMessage.members[0].user.unread_count).to.eq(1);
		expect(lastMessage.members[0].user.channel_unread_count).to.eq(1);
		expect(lastMessage.members[0].user.total_unread_count).to.eq(1);
		expect(lastMessage.members[0].user.unread_channels).to.eq(1);
		expect(lastMessage.members[0].user.channel_last_read_at).to.not.be.null;

		expect(lastMessage.members[1].user).to.be.an('object');
		expect(lastMessage.members[1].user.online).to.eq(false);
		expect(lastMessage.members[1].user.unread_count).to.eq(0);
		expect(lastMessage.members[1].user.channel_unread_count).to.eq(0);
		expect(lastMessage.members[1].user.total_unread_count).to.eq(0);
		expect(lastMessage.members[1].user.unread_channels).to.eq(0);
		expect(lastMessage.members[1].user.channel_last_read_at).to.not.be.null;
		const lastRead = new Date(lastMessage.members[0].user.channel_last_read_at);
		expect(lastRead.toString()).to.not.be.eq('Invalid Date');
	});

	it('unread_count and channel_unread_count should not be the same', async function() {
		const serverSideClient = getTestClient(true);
		const cid = uuidv4();
		const chan2 = serverSideClient.channel('messaging', cid, {
			created_by: { id: tommasoID },
			members: [thierryID, tommasoID],
		});
		await chan2.create();
		await Promise.all([
			chan2.sendMessage({
				text: uuidv4(),
				user: { id: tommasoID },
			}),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.members[0].user).to.be.an('object');
		expect(lastMessage.members[0].user.online).to.eq(true);
		expect(lastMessage.members[0].user.unread_count).to.eq(2);
		expect(lastMessage.members[0].user.channel_unread_count).to.eq(1);
		expect(lastMessage.members[0].user.total_unread_count).to.eq(2);
		expect(lastMessage.members[0].user.unread_channels).to.eq(2);
	});

	it('message.update', async function() {
		await Promise.all([
			client.updateMessage(
				{
					...messageResponse.message,
					text: 'new stuff',
				},
				tommasoID,
			),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.type).to.eq('message.updated');
		expect(lastMessage.user.id).to.eq(tommasoID);
		expect(lastMessage.message).to.be.an('object');
		expect(lastMessage.message.text).to.eq('new stuff');
	});

	it('reaction.new when reaction is added', async function() {
		await Promise.all([
			chan.sendReaction(messageResponse.message.id, {
				type: 'lol',
				user: { id: tommasoID },
			}),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.type).to.eq('reaction.new');
		expect(lastMessage.message.reaction_counts).to.eql({ lol: 1 });
	});

	it('reaction.deleted when reaction is removed', async function() {
		const tommasoClient = await getTestClientForUser(tommasoID);
		const tommasoChannel = tommasoClient.channel(chan.type, chan.id);
		await tommasoChannel.watch();
		await Promise.all([
			tommasoChannel.deleteReaction(messageResponse.message.id, 'lol'),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.type).to.eq('reaction.deleted');
		expect(lastMessage.message.reaction_counts).to.eql({});
	});

	it('message.deleted', async function() {
		await Promise.all([
			client.deleteMessage(messageResponse.message.id),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('message.deleted');
		expect(lastMessage.message.user).to.be.an('object');
		expect(lastMessage.message.user.id).to.eq(tommasoID);
	});

	it('user.updated', async function() {
		await Promise.all([
			client.updateUser({ id: thierryID, awesome: true }),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('user.updated');
	});

	it('member.added', async function() {
		await Promise.all([chan.addMembers([jaapID]), lastMessagePromise]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('member.added');
	});

	it('member.updated', async function() {
		await Promise.all([chan.addModerators([thierryID]), lastMessagePromise]);
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(1);
		expect(lastMessage.type).to.eq('member.updated');
	});

	it('member.removed', async function() {
		await Promise.all([chan.removeMembers([thierryID]), lastMessagePromise]);
		await Promise.all([chan.removeMembers([tommasoID]), lastMessagePromise]);
		await Promise.all([chan.removeMembers([jaapID]), lastMessagePromise]);
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(3);
		expect(lastMessage.type).to.eq('member.removed');
		expect(lastMessage.user).to.be.an('object');
	});

	it('thierry should not be in the member list anymore', async function() {
		messageResponse = (await Promise.all([
			chan.sendMessage({
				text: uuidv4(),
				user: { id: tommasoID },
			}),
			lastMessagePromise,
		]))[0];
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.members).to.be.undefined;
	});

	it('channel.updated without message', async function() {
		await Promise.all([chan.update({ awesome: 'yes' }), lastMessagePromise]);
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(1);
		expect(lastMessage.type).to.eq('channel.updated');
		expect(lastMessage.channel.awesome).to.eq('yes');
	});

	it('channel.updated with a message', async function() {
		await Promise.all([
			chan.update(
				{ awesome: 'yes yes' },
				{ text: uuidv4(), custom_stuff: 'bananas', user: { id: tommasoID } },
			),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(1);
		expect(lastMessage.type).to.eq('channel.updated');
		expect(lastMessage.channel.awesome).to.eq('yes yes');
		expect(lastMessage.message).to.not.be.null;
		expect(lastMessage.message.custom_stuff).to.eq('bananas');
	});

	it('moderation mute', async function() {
		await Promise.all([client.muteUser(tommasoID, jaapID), lastMessagePromise]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('user.muted');
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.user.id).to.eq(jaapID);
		expect(lastMessage.target_user).to.be.an('object');
		expect(lastMessage.target_user.id).to.eq(tommasoID);
	});

	it('slash mute', async function() {
		const text = `/mute ${tommasoID}`;
		await Promise.all([
			chan.sendMessage({ text, user_id: jaapID }),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('user.muted');
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.user.id).to.eq(jaapID);
		expect(lastMessage.target_user).to.be.an('object');
		expect(lastMessage.target_user.id).to.eq(tommasoID);
	});

	it('moderation unmute', async function() {
		await Promise.all([client.unmuteUser(tommasoID, jaapID), lastMessagePromise]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('user.unmuted');
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.user.id).to.eq(jaapID);
		expect(lastMessage.target_user).to.be.an('object');
		expect(lastMessage.target_user.id).to.eq(tommasoID);
	});

	it('slash unmute', async function() {
		let text = `/mute ${thierryID}`;
		await chan.sendMessage({ text, user_id: jaapID });
		text = `/unmute ${thierryID}`;
		await Promise.all([
			chan.sendMessage({ text, user_id: jaapID }),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('user.unmuted');
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.user.id).to.eq(jaapID);
		expect(lastMessage.target_user).to.be.an('object');
		expect(lastMessage.target_user.id).to.eq(thierryID);
	});

	it('channel.deleted', async function() {
		await Promise.all([chan.delete(), lastMessagePromise]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('channel.deleted');
	});
});
