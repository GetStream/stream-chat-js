import chai from 'chai';
import http from 'http';
import { createUserToken, getTestClient, sleep } from './utils';
import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;

const excuses = [
	'I flushed my keys down the toilet, will WFH.',
	'I am ill. Will WFH',
	'My leg fell off in a freak incident in the Red Light District, WFH today.',
	'WFH today guys, not feeling very well!',
	'No Excuse. WFH.',
	'Tooth hurts. WFH today.',
	'Coronavirus. Will WFH.',
];

const excuseCmd = (request) => {
	const action = request.form_data ? request.form_data['excuse_action'] : undefined;

	// default action / shuffle
	if (action === undefined || action === 'shuffle') {
		request.message.type = 'ephemeral';

		let excuse;
		while (request.message.excuse === excuse) {
			excuse = excuses[Math.floor(excuses.length * Math.random())];
		}
		request.message.excuse = excuse;
		request.message.attachments = [
			{
				text: excuse,
				type: 'text',
				actions: [
					{
						name: 'excuse_action',
						text: 'Send',
						style: 'primary',
						type: 'button',
						value: 'send',
					},
					{
						name: 'excuse_action',
						text: 'Shuffle',
						style: 'default',
						type: 'button',
						value: 'shuffle',
					},
					{
						name: 'excuse_action',
						text: 'Cancel',
						style: 'default',
						type: 'button',
						value: 'cancel',
					},
				],
			},
		];

		if (request.message.args === 'mml') {
			request.message.mml = `
				<mml name="excuse">
					<text>${excuse}</text>
					<button style="primary" name="excuse_action" value="send">send</button>
					<button style="primary" name="excuse_action" value="shuffle">shuffle</button>
					<button style="primary" name="excuse_action" value="cancel">cancel</button>
				</mml>`;
		}
	}

	// send
	if (action === 'send') {
		request.message.type = 'regular';
		request.message.text = request.message.excuse;
		request.message.mml = '';
		request.message.attachments = null;
	}

	// cancel
	if (action === 'cancel') {
		request.message = null;
	}
};

describe('custom command hook', () => {
	const localHost = process.env.STREAM_LOCAL_TEST_HOST ? '0.0.0.0' : '127.0.0.1';
	const hookHost = process.env.STREAM_LOCAL_TEST_HOST ? 'chat-qa' : '127.0.0.1';
	const serverAuth = getTestClient(true);
	const userAuth = getTestClient(false);
	const guyon = { id: `guyon-${uuidv4()}` };
	userAuth.setUser(guyon, createUserToken(guyon.id));

	let server;
	let handler = (data) => JSON.stringify(data.message);
	let chan;
	const channelID = `custom-commands-${uuidv4()}`;
	const channelTypeID = `channel-type-${uuidv4()}`;

	let responseCode = 200;

	const setHandler = (h) => {
		handler = h;
	};

	beforeEach(() => {
		responseCode = 200;
		setHandler((m) => {
			JSON.stringify(m);
		});
	});

	before(async () => {
		server = http.createServer(function (req, res) {
			let body = '';
			let signature = '';

			req.on('data', (chunk) => {
				body += chunk.toString(); // convert Buffer to string
			});

			req.on('end', async () => {
				signature = req.headers['x-signature'];
				expect(serverAuth.verifyWebhook(body, signature)).to.eq(true);
				res.writeHead(responseCode, { 'Content-Type': 'application/json' });
				const data = await handler(JSON.parse(body));
				res.end(data);
			});
		});

		await server.listen(4324, localHost);
		await sleep(100);

		await serverAuth.updateAppSettings({
			custom_action_handler_url: 'http://' + hookHost + ':4324',
		});

		await serverAuth.createChannelType({
			name: channelTypeID,
			commands: ['mml-examples', 'excuse'],
		});
		chan = userAuth.channel(channelTypeID, channelID);
		await chan.watch();
	});

	after(async () => {
		await serverAuth.updateAppSettings({
			custom_action_handler_url: '',
		});
		await serverAuth.getAppSettings();
		server.close();
	});

	describe('"Excuse" custom command', () => {
		it('should return an excuse and message actions', async () => {
			let called = false;
			setHandler((message) => {
				called = true;
				excuseCmd(message);
				return JSON.stringify(message);
			});
			const p = chan.sendMessage({ text: '/excuse me' });
			const response = await p;
			expect(response.message.type).to.equal('ephemeral');
			expect(called).to.eql(true);
			expect(response.message.user.id).to.eql(guyon.id);
			expect(excuses.indexOf(response.message.excuse)).to.gte(0);
			expect(response.message.attachments.length).to.eql(1);
			expect(response.message.attachments[0].actions.length).to.eql(3);
		});

		it('shuffle action should return a different excuse', async () => {
			let called = false;
			setHandler((message) => {
				called = true;
				excuseCmd(message);
				return JSON.stringify(message);
			});
			const p = chan.sendMessage({ text: '/excuse me' });
			let response = await p;

			expect(called).to.eql(true);

			const messageID = response.message.id;
			const firstExcuse = response.message.attachments[0].text;

			response = await chan.sendAction(messageID, {
				excuse_action: 'shuffle',
			});

			expect(response.message.type).to.equal('ephemeral');
			expect(response.message.attachments[0].text).to.not.equal(firstExcuse);
		});

		it('send action should finalize excuse', async () => {
			let called = false;
			setHandler((message) => {
				called = true;
				excuseCmd(message);
				return JSON.stringify(message);
			});
			const p = chan.sendMessage({ text: '/excuse me' });
			let response = await p;

			expect(called).to.eql(true);

			const messageID = response.message.id;
			const firstExcuse = response.message.attachments[0].text;

			response = await chan.sendAction(messageID, {
				excuse_action: 'send',
			});

			expect(response.message.text).to.equal(firstExcuse);
			expect(response.message.type).to.equal('regular');
		});

		it('cancel action should delete the message', async () => {
			let called = false;
			setHandler((message) => {
				called = true;
				excuseCmd(message);
				return JSON.stringify(message);
			});
			const p = chan.sendMessage({ text: '/excuse me' });
			let response = await p;

			expect(called).to.eql(true);

			const messageID = response.message.id;
			const firstExcuse = response.message.attachments[0].text;

			response = await chan.sendAction(messageID, {
				excuse_action: 'cancel',
			});

			expect(response.message).to.equal(null);
		});
	});

	describe('"Excuse" custom command with MML interactions', () => {
		it('should return an excuse and message actions', async () => {
			let called = false;
			setHandler((message) => {
				called = true;
				excuseCmd(message);
				return JSON.stringify(message);
			});
			const p = chan.sendMessage({ text: '/excuse mml' });
			const response = await p;

			expect(response.message.type).to.equal('ephemeral');
			expect(called).to.eql(true);
			expect(response.message.user.id).to.eql(guyon.id);
			expect(excuses.indexOf(response.message.excuse)).to.gte(0);
			expect(response.message.attachments.length).to.eql(1);
			expect(response.message.attachments[0].actions.length).to.eql(3);

			expect(response.message.mml).to.contain('<mml name="excuse">');
			expect(response.message.mml).to.contain(
				`<text>${response.message.excuse}</text>`,
			);
			expect(response.message.mml).to.contain(
				'<button style="primary" name="excuse_action" value="send">send</button>',
			);
			expect(response.message.mml).to.contain(
				'<button style="primary" name="excuse_action" value="shuffle">shuffle</button>',
			);
			expect(response.message.mml).to.contain(
				'<button style="primary" name="excuse_action" value="cancel">cancel</button>',
			);
			expect(response.message.mml).to.contain('</mml>');
		});

		it('shuffle action should return a different excuse', async () => {
			let called = false;
			setHandler((message) => {
				called = true;
				excuseCmd(message);
				return JSON.stringify(message);
			});
			const p = chan.sendMessage({ text: '/excuse mml' });
			let response = await p;

			expect(called).to.eql(true);

			const messageID = response.message.id;
			const firstExcuse = response.message.attachments[0].text;

			response = await chan.sendAction(messageID, {
				excuse_action: 'shuffle',
			});

			expect(response.message.type).to.equal('ephemeral');
			expect(response.message.attachments[0].text).to.not.equal(firstExcuse);

			expect(response.message.mml).to.contain('<mml name="excuse">');
			expect(response.message.mml).to.contain(
				`<text>${response.message.excuse}</text>`,
			);
			expect(response.message.mml).to.contain(
				'<button style="primary" name="excuse_action" value="send">send</button>',
			);
			expect(response.message.mml).to.contain(
				'<button style="primary" name="excuse_action" value="shuffle">shuffle</button>',
			);
			expect(response.message.mml).to.contain(
				'<button style="primary" name="excuse_action" value="cancel">cancel</button>',
			);
			expect(response.message.mml).to.contain('</mml>');
		});

		it('send action should finalize excuse', async () => {
			let called = false;
			setHandler((message) => {
				called = true;
				excuseCmd(message);
				return JSON.stringify(message);
			});
			const p = chan.sendMessage({ text: '/excuse mml' });
			let response = await p;

			expect(called).to.eql(true);

			const messageID = response.message.id;
			const firstExcuse = response.message.attachments[0].text;

			response = await chan.sendAction(messageID, {
				excuse_action: 'send',
			});

			expect(response.message.text).to.equal(firstExcuse);
			expect(response.message.type).to.equal('regular');
			expect(response.message.mml).to.equal(undefined);
		});

		it('cancel action should delete the message', async () => {
			let called = false;
			setHandler((message) => {
				called = true;
				excuseCmd(message);
				return JSON.stringify(message);
			});
			const p = chan.sendMessage({ text: '/excuse mml' });
			let response = await p;

			expect(called).to.eql(true);

			const messageID = response.message.id;
			const firstExcuse = response.message.attachments[0].text;

			response = await chan.sendAction(messageID, {
				excuse_action: 'cancel',
			});

			expect(response.message).to.equal(null);
		});
	});

	describe('"mml" custom command examples', () => {
		it('should return a simple hi! text element', async () => {
			const p = chan.sendMessage({ text: '/mml-examples hi' });
			const response = await p;
			expect(response.message.mml).to.contain(`<text>Hi!</text>`);
		});

		it('should show & process an email form element', async () => {
			let called = false;
			setHandler((request) => {
				called = true;
				const email = request.form_data.email;
				request.message.text = `Thanks for registering '${email}'`;
				return JSON.stringify(request);
			});

			const p = chan.sendMessage({ text: '/mml-examples email' });
			const response = await p;
			expect(response.message.mml).to.contain(`<input type="text" name="email" />`);

			const messageID = response.message.id;
			const actionData = await chan.sendAction(messageID, {
				mml_name: 'email_form',
				action: 'submit',
				email: 'guyon@getstream.io',
			});

			expect(actionData.message.text).to.equal(
				"Thanks for registering 'guyon@getstream.io'",
			);
		});

		it('should show & process a multi-step interaction', async () => {
			let called = false;
			const state = {};
			setHandler((request) => {
				called = true;
				const action = request.form_data.action;
				switch (action) {
					case 'start':
						request.message.mml = `<mml name="multi_step_form"><text>Please enter your name</text><input type="text" name="name" /><button style="primary" name="action" value="next">next</button></mml>`;
						break;
					case 'next':
						state['name'] = request.form_data.name;
						request.message.mml = `<mml name="multi_step_form"><text>Please enter your email</text><input type="text" name="email" /><button style="primary" name="action" value="finish">finish</button></mml>`;
						break;
					case 'finish':
						state['email'] = request.form_data.email;
						request.message.mml = `<mml name="multi_step_form"><text>Thanks for participating ${state['name']} (${state['email']})</text></mml>`;
						break;
				}
				return JSON.stringify(request);
			});

			const p = chan.sendMessage({ text: '/mml-examples multi_step' });
			const response = await p;
			expect(response.message.mml).to.contain(
				`<button style="primary" name="action" value="start">Start</button>`,
			);

			const messageID = response.message.id;
			const step1Data = await chan.sendAction(messageID, {
				mml_name: 'multi_step_form',
				action: 'start',
			});

			expect(step1Data.message.mml).to.equal(
				'<mml name="multi_step_form"><text>Please enter your name</text><input type="text" name="name" /><button style="primary" name="action" value="next">next</button></mml>',
			);

			const step2Data = await chan.sendAction(messageID, {
				mml_name: 'multi_step_form',
				name: 'Guyon',
				action: 'next',
			});
			expect(step2Data.message.mml).to.equal(
				'<mml name="multi_step_form"><text>Please enter your email</text><input type="text" name="email" /><button style="primary" name="action" value="finish">finish</button></mml>',
			);

			const step3Data = await chan.sendAction(messageID, {
				mml_name: 'multi_step_form',
				email: 'guyon@getstream.io',
				action: 'finish',
			});
			expect(step3Data.message.mml).to.equal(
				'<mml name="multi_step_form"><text>Thanks for participating Guyon (guyon@getstream.io)</text></mml>',
			);
		});
	});
});
