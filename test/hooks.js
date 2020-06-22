import chai from 'chai';
import http from 'http';
import { getTestClient, sleep } from './utils';
import uuidv4 from 'uuid/v4';

const expect = chai.expect;

describe('before message send hook', () => {
	const client = getTestClient(true);
	let server;
	let handler = data => {
		return JSON.stringify(data.message);
	};
	let chan;
	const channelID = `fun-${uuidv4()}`;
	const tommasoID = `tommaso-${uuidv4()}`;
	let responseCode = 200;

	const setHandler = h => {
		handler = h;
	};

	beforeEach(() => {
		responseCode = 200;
		setHandler(m => {
			JSON.stringify(m);
		});
	});

	before(async () => {
		server = http.createServer(function(req, res) {
			let body = '';
			let signature = '';

			req.on('data', chunk => {
				body += chunk.toString(); // convert Buffer to string
			});

			req.on('end', async () => {
				signature = req.headers['x-signature'];
				expect(client.verifyWebhook(body, signature)).to.eq(true);
				res.writeHead(responseCode, { 'Content-Type': 'application/json' });
				const data = await handler(JSON.parse(body));
				res.end(data);
			});
		});

		await server.listen(4323, '127.0.0.1');
		await sleep(100);
		chan = client.channel('messaging', channelID, { created_by: { id: tommasoID } });
		await chan.create();
	});

	after(async () => {
		await client.updateAppSettings({
			before_message_send_hook_url: '',
		});
		await client.getAppSettings();
	});

	it('when not enabled hook is not called', async () => {
		let called = false;
		await client.updateAppSettings({ before_message_send_hook_url: '' });
		setHandler(message => {
			called = true;
			expect(message.channel.id).to.equal(channelID);
			return JSON.stringify(message);
		});
		await chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } });
		expect(called).to.eql(false);
	});

	it('enable hook', async () => {
		await client.updateAppSettings({
			before_message_send_hook_url: 'http://127.0.0.1:4323',
		});
		const response = await client.getAppSettings();
		expect(response.app.before_message_send_hook_url).to.eql('http://127.0.0.1:4323');
	});

	it('return nothing should be OK', async () => {
		let called = false;
		setHandler(message => {
			called = true;
			expect(message.channel.id).to.equal(channelID);
			return JSON.stringify(message);
		});
		const p = chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } });
		const response = await p;
		expect(response.message.user.id).to.eql(tommasoID);
		expect(called).to.eql(true);
	});

	let messageId;

	it('return nothing should be OK', async () => {
		let called = false;
		setHandler(() => {
			called = true;
			return JSON.stringify('');
		});
		const p = chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } });
		const response = await p;
		expect(response.message.user.id).to.eql(tommasoID);
		expect(called).to.eql(true);
		messageId = response.message.id;
	});

	it('should be called when updating a message too', async () => {
		let called = false;
		setHandler(() => {
			called = true;
			return JSON.stringify('');
		});
		const p = client.updateMessage({ id: messageId, text: uuidv4() }, tommasoID);
		const response = await p;
		expect(response.message.user.id).to.eql(tommasoID);
		expect(called).to.eql(true);
	});

	it('rewrite from update', async () => {
		setHandler(data => {
			data.message.text = 'bad bad bad';
			return JSON.stringify(data);
		});
		const p = client.updateMessage({ id: messageId, text: uuidv4() }, tommasoID);
		const response = await p;
		expect(response.message.text).to.eql('bad bad bad');
	});

	it('return an error from update', async () => {
		setHandler(data => {
			data.message.type = 'error';
			return JSON.stringify(data);
		});
		const p = client.updateMessage({ id: messageId, text: uuidv4() }, tommasoID);
		const response = await p;
		expect(response.message.type).to.eql('error');
	});

	it('add a custom field should work', async () => {
		setHandler(data => {
			data.message.myCustomThingie = 42;
			return JSON.stringify(data);
		});
		const p = chan.sendMessage({
			text: "hello, here's my CC information 1234 1234 1234 1234",
			user: { id: tommasoID },
		});
		const response = await p;
		expect(response.message.user.id).to.eql(tommasoID);
		expect(response.message.myCustomThingie).to.eql(42);
	});

	it('rewriting text should work', async () => {
		setHandler(data => {
			data.message.text = 'this is the text now...';
			return JSON.stringify(data);
		});
		const p = chan.sendMessage({ text: uuidv4(), user: { id: tommasoID } });
		const response = await p;
		expect(response.message.user.id).to.eql(tommasoID);
		expect(response.message.text).to.eql('this is the text now...');
	});

	it('return an error', async () => {
		setHandler(data => {
			data.message.type = 'error';
			return JSON.stringify(data);
		});
		const p = chan.sendMessage({ text: 'super bad!', user: { id: tommasoID } });
		const response = await p;
		expect(response.message.user.id).to.eql(tommasoID);
		expect(response.message.type).to.eql('error');
	});

	it('errors are not stored', async () => {
		const response = await chan.query();
		expect(response.messages[response.messages.length - 1].text).to.not.eql(
			'super bad!',
		);
	});

	it('should let the message go when handler fails with 5xx', async () => {
		responseCode = 502;
		const p = chan.sendMessage({ text: 'super duper bad!', user: { id: tommasoID } });
		const response = await p;
		expect(response.message.user.id).to.eql(tommasoID);
		expect(response.message.type).to.eql('regular');
	});

	it('should let the message go on timeout', async () => {
		setHandler(async data => {
			await sleep(1501);
			data.message.type = 'error';
			return JSON.stringify(data);
		});
		const p = chan.sendMessage({ text: 'super duper bad!', user: { id: tommasoID } });
		const response = await p;
		expect(response.message.user.id).to.eql(tommasoID);
		expect(response.message.type).to.eql('regular');
	});
});
