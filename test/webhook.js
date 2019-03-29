import chai from 'chai';
import http from 'http';
import { getTestClient, getTestClientForUser, sleep } from './utils';
import uuidv4 from 'uuid/v4';
import { CheckSignature } from '../src/signing';

const expect = chai.expect;

describe('Webhooks', function() {
	let server;
	let lastMessage;
	let messages;
	let tommasoID = `tommaso-${uuidv4()}`;
	let thierryID = `thierry-${uuidv4()}`;
	let channelID = `fun-${uuidv4()}`;
	const client = getTestClient(true);
	let chan;

	before(() => {
		chan = client.channel('messaging', channelID, { created_by: { id: tommasoID } });

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
			});

			res.writeHead(200, { 'Content-Type': 'text/plain' });
		});

		server.listen(43210);
		client.updateUser({ id: thierryID });
		return client.updateUser({ id: tommasoID }).then(() => {
			client.updateAppSettings({
				webhook_url: 'http://localhost:43210/',
			});
		});
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
		await chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } });
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('message.new');
	});

	it('should receive new message event with members included', async function() {
		await chan.addMembers([tommasoID]);
		await chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } });
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('message.new');
		expect(lastMessage.members).to.not.be.null;
		expect(lastMessage.members).to.be.an('array');
		expect(lastMessage.members).to.have.length(1);
		expect(lastMessage.members[0]).to.be.an('object');
		expect(lastMessage.members[0].user).to.be.an('object');
		expect(lastMessage.members[0].user.unread_count).to.eq(1);
		expect(lastMessage.members[0].user.id).to.eq(tommasoID);
		expect(lastMessage.members[0].user.online).to.eq(false);
	});

	let messageResponse;

	it('online status and unread_count should update', async function() {
		let tommasoClient = await getTestClientForUser(tommasoID);
		let tommasoChannel = tommasoClient.channel(chan.type, chan.id);
		await tommasoChannel.watch();
		await tommasoChannel.markRead();
		messageResponse = await chan.sendMessage({
			text: uuidv4(),
			user: { id: tommasoID },
		});
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.members[0].user).to.be.an('object');
		expect(lastMessage.members[0].user.online).to.eq(true);
		expect(lastMessage.members[0].user.unread_count).to.eq(1);
	});

	it('message.update', async function() {
		await client.updateMessage(
			{
				...messageResponse.message,
				text: 'new stuff',
			},
			tommasoID,
		);
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.type).to.eq('message.updated');
		expect(lastMessage.user.id).to.eq(tommasoID);
		expect(lastMessage.message).to.be.an('object');
		expect(lastMessage.message.text).to.eq('new stuff');
	});

	it('message.reaction when reaction is added', async function() {
		await chan.sendReaction(messageResponse.message.id, {
			type: 'lol',
			user: { id: tommasoID },
		});
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.type).to.eq('message.reaction');
		expect(lastMessage.message.reaction_counts).to.eql({ lol: 1 });
	});

	it('message.reaction when reaction is removed', async function() {
		let tommasoClient = await getTestClientForUser(tommasoID);
		let tommasoChannel = tommasoClient.channel(chan.type, chan.id);
		await tommasoChannel.watch();
		await tommasoChannel.deleteReaction(messageResponse.message.id, 'lol');
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.user).to.be.an('object');
		expect(lastMessage.type).to.eq('message.reaction');
		expect(lastMessage.message.reaction_counts).to.eql({});
	});

	it('message.deleted', async function() {
		await client.deleteMessage(messageResponse.message.id);
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('message.deleted');
		expect(lastMessage.message.user).to.be.an('object');
		expect(lastMessage.message.user.id).to.eq(tommasoID);
	});

	it('member.added', async function() {
		await chan.addMembers([thierryID]);
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('member.added');
	});

	it('member.updated', async function() {
		await chan.addModerators([thierryID]);
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(1);
		expect(lastMessage.type).to.eq('member.updated');
	});

	it('member.removed', async function() {
		await chan.removeMembers([thierryID]);
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(1);
		expect(lastMessage.type).to.eq('member.removed');
	});

	it('channel.updated without message', async function() {
		await chan.update({ awesome: 'yes' });
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(1);
		expect(lastMessage.type).to.eq('channel.updated');
		expect(lastMessage.channel.awesome).to.eq('yes');
	});

	it('channel.updated with a message', async function() {
		await chan.update(
			{ awesome: 'yes yes' },
			{ text: uuidv4(), custom_stuff: 'bananas', user: { id: tommasoID } },
		);
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(messages).to.have.length(1);
		expect(lastMessage.type).to.eq('channel.updated');
		expect(lastMessage.channel.awesome).to.eq('yes yes');
		expect(lastMessage.message).to.not.be.null;
		expect(lastMessage.message.custom_stuff).to.eq('bananas');
	});

	it('channel.deleted', async function() {
		await chan.delete();
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.type).to.eq('channel.deleted');
	});
});
