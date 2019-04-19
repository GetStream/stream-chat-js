import chai from 'chai';
import http from 'http';
import { getTestClient, getTestClientForUser, sleep } from './utils';
import uuidv4 from 'uuid/v4';
import { CheckSignature } from '../src/signing';

const expect = chai.expect;

describe('Webhooks', function() {
	let server;
	let lastMessage;
	let lastMessagePromise;
	let messages;
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;
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

		server.listen(4322, '127.0.0.1');
		await client.updateUser({ id: thierryID });
		await client.updateUser({ id: tommasoID });
		await client.updateAppSettings({
			webhook_url: 'http://127.0.0.1:4322/',
		});
		await sleep(1000);
	});

	beforeEach(function() {
		lastMessage = null;
		messages = [];
	});

	after(() => {
		client.updateAppSettings({
			webhook_url: '',
		});
		server.close();
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
		await Promise.all([chan.addMembers([tommasoID]), lastMessagePromise]);
		await Promise.all([
			chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } }),
			lastMessagePromise,
		]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('message.new');
		expect(lastMessage.members).to.not.be.null;
		expect(lastMessage.members).to.be.an('array');
		expect(lastMessage.members).to.have.length(1);
		expect(lastMessage.members[0]).to.be.an('object');
		expect(lastMessage.members[0].user).to.be.an('object');
		expect(lastMessage.members[0].user.unread_count).to.eq(1);
		expect(lastMessage.members[0].user.total_unread_count).to.eq(1);
		expect(lastMessage.members[0].user.id).to.eq(tommasoID);
		expect(lastMessage.members[0].user.online).to.eq(false);
	});

	let messageResponse;

	it('online status and unread_count should update', async function() {
		const tommasoClient = await getTestClientForUser(tommasoID);
		const tommasoChannel = tommasoClient.channel(chan.type, chan.id);
		await tommasoChannel.watch();
		await tommasoChannel.markRead();
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
	});

	it('unread_count and channel_unread_count should not be the same', async function() {
		const serverSideClient = getTestClient(true);
		const cid = uuidv4();
		const chan2 = serverSideClient.channel('messaging', cid, {
			created_by: { id: tommasoID },
			members: [tommasoID],
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

	it('member.added', async function() {
		await Promise.all([chan.addMembers([thierryID]), lastMessagePromise]);
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
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(1);
		expect(lastMessage.type).to.eq('member.removed');
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

	it('channel.deleted', async function() {
		await Promise.all([chan.delete(), lastMessagePromise]);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('channel.deleted');
	});
});
