import chai from 'chai';
import { createUserToken, getTestClient, setupWebhook } from './utils';
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

describe('Custom Commands Webhook', () => {
	const serverClient = getTestClient(true);
	const userClient = getTestClient(false);
	const guyon = { id: `guyon-${uuidv4()}` };
	userClient.connectUser(guyon, createUserToken(guyon.id));

	let chan, webhook;
	const channelID = `custom-commands-${uuidv4()}`;
	const channelTypeID = `channel-type-${uuidv4()}`;

	before(async () => {
		webhook = await setupWebhook(serverClient, 'custom_action_handler_url');
		await serverClient.createChannelType({
			name: channelTypeID,
			commands: ['mml-examples', 'excuse'],
		});
		chan = userClient.channel(channelTypeID, channelID);
		await chan.watch();
	});

	afterEach(() => {
		webhook.reset();
	});

	after(async () => {
		await webhook.tearDown();
	});

	describe('"Excuse" custom command', () => {
		beforeEach(() => {
			webhook.response = (request) => {
				excuseCmd(request);
				return request;
			};
		});
		describe('Text response', () => {
			it('should return an excuse and message actions', async () => {
				const { message } = await chan.sendMessage({ text: '/excuse me' });
				expect(message.type).to.equal('ephemeral');
				expect(webhook.requested).to.eql(true);
				expect(message.user.id).to.eql(guyon.id);
				expect(excuses.indexOf(message.excuse)).to.gte(0);
				expect(message.attachments.length).to.eql(1);
				expect(message.attachments[0].actions.length).to.eql(3);
			});

			it('shuffle action should return a different excuse', async () => {
				const { message } = await chan.sendMessage({ text: '/excuse me' });
				expect(webhook.requested).to.eql(true);
				const response = await chan.sendAction(message.id, {
					excuse_action: 'shuffle',
				});
				expect(response.message.type).to.equal('ephemeral');
				expect(response.message.attachments[0].text).to.not.equal(
					message.attachments[0].text,
				);
			});

			it('send action should finalize excuse', async () => {
				const { message } = await chan.sendMessage({ text: '/excuse me' });
				expect(webhook.requested).to.eql(true);
				const response = await chan.sendAction(message.id, {
					excuse_action: 'send',
				});
				expect(response.message.text).to.equal(message.attachments[0].text);
				expect(response.message.type).to.equal('regular');
			});

			it('cancel action should delete the message', async () => {
				const { message } = await chan.sendMessage({ text: '/excuse me' });
				expect(webhook.requested).to.eql(true);
				const response = await chan.sendAction(message.id, {
					excuse_action: 'cancel',
				});
				expect(response.message).to.equal(null);
			});
		});
		describe('MML interactions', () => {
			it('should return an excuse and message actions', async () => {
				const { message } = await chan.sendMessage({ text: '/excuse mml' });

				expect(message.type).to.equal('ephemeral');
				expect(webhook.requested).to.eql(true);
				expect(message.user.id).to.eql(guyon.id);
				expect(excuses.indexOf(message.excuse)).to.gte(0);
				expect(message.attachments.length).to.eql(1);
				expect(message.attachments[0].actions.length).to.eql(3);

				expect(message.mml).to.contain('<mml name="excuse">');
				expect(message.mml).to.contain(`<text>${message.excuse}</text>`);
				expect(message.mml).to.contain(
					'<button style="primary" name="excuse_action" value="send">send</button>',
				);
				expect(message.mml).to.contain(
					'<button style="primary" name="excuse_action" value="shuffle">shuffle</button>',
				);
				expect(message.mml).to.contain(
					'<button style="primary" name="excuse_action" value="cancel">cancel</button>',
				);
				expect(message.mml).to.contain('</mml>');
			});

			it('shuffle action should return a different excuse', async () => {
				const { message } = await chan.sendMessage({ text: '/excuse mml' });
				expect(webhook.requested).to.eql(true);
				const response = await chan.sendAction(message.id, {
					excuse_action: 'shuffle',
				});
				expect(response.message.type).to.equal('ephemeral');
				expect(response.message.attachments[0].text).to.not.equal(
					message.attachments[0].text,
				);

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
				const { message } = await chan.sendMessage({ text: '/excuse mml' });
				expect(webhook.requested).to.eql(true);
				const response = await chan.sendAction(message.id, {
					excuse_action: 'send',
				});
				expect(response.message.text).to.equal(message.attachments[0].text);
				expect(response.message.type).to.equal('regular');
				expect(response.message.mml).to.equal(undefined);
			});

			it('cancel action should delete the message', async () => {
				const { message } = await chan.sendMessage({ text: '/excuse mml' });
				expect(webhook.requested).to.eql(true);
				const response = await chan.sendAction(message.id, {
					excuse_action: 'cancel',
				});
				expect(response.message).to.equal(null);
			});
		});
	});

	describe('"mml" custom command examples', () => {
		it('should return a simple hi! text element', async () => {
			const { message } = await chan.sendMessage({ text: '/mml-examples hi' });
			expect(message.mml).to.contain(`<text>Hi!</text>`);
		});

		it('should show & process an email form element', async () => {
			webhook.response = (request) => {
				const email = request.form_data.email;
				request.message.text = `Thanks for registering '${email}'`;
				return request;
			};
			const { message } = await chan.sendMessage({ text: '/mml-examples email' });
			expect(message.mml).to.contain(`<input type="text" name="email" />`);
			const actionData = await chan.sendAction(message.id, {
				mml_name: 'email_form',
				action: 'submit',
				email: 'guyon@getstream.io',
			});

			expect(actionData.message.text).to.equal(
				"Thanks for registering 'guyon@getstream.io'",
			);
		});

		it('should show & process a multi-step interaction', async () => {
			const state = {};
			webhook.response = (request) => {
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
				return request;
			};

			const { message } = await chan.sendMessage({
				text: '/mml-examples multi_step',
			});
			expect(message.mml).to.contain(
				`<button style="primary" name="action" value="start">Start</button>`,
			);

			const step1Data = await chan.sendAction(message.id, {
				mml_name: 'multi_step_form',
				action: 'start',
			});

			expect(step1Data.message.mml).to.equal(
				'<mml name="multi_step_form"><text>Please enter your name</text><input type="text" name="name" /><button style="primary" name="action" value="next">next</button></mml>',
			);

			const step2Data = await chan.sendAction(message.id, {
				mml_name: 'multi_step_form',
				name: 'Guyon',
				action: 'next',
			});
			expect(step2Data.message.mml).to.equal(
				'<mml name="multi_step_form"><text>Please enter your email</text><input type="text" name="email" /><button style="primary" name="action" value="finish">finish</button></mml>',
			);

			const step3Data = await chan.sendAction(message.id, {
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
