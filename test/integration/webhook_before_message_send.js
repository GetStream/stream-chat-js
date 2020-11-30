import chai from 'chai';
import { getTestClient, setupWebhook } from './utils';
import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;

describe('Before Message Send Webhook', function () {
	const tommasoID = `tommaso-${uuidv4()}`;
	const channelID = `fun-${uuidv4()}`;
	const client = getTestClient(true);

	let chan, tearDownWebhook;

	const webhook = {
		requested: false,
		fail: false,
		request: {},
		response: null,
		reset() {
			this.requested = false;
			this.message = null;
			this.fail = false;
			this.response = null;
		},
		onRequest(request, body, res) {
			this.requested = true;
			this.request = JSON.parse(body);
			if (this.fail) {
				res.writeHead(500);
				res.end();
				return;
			}
			let response;
			if (this.response != null) {
				response = this.response(this.request);
			} else {
				response = this.request;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		},
	};

	before(async () => {
		chan = client.channel('messaging', channelID, { created_by: { id: tommasoID } });
		tearDownWebhook = await setupWebhook(
			client,
			'before_message_send_hook_url',
			(req, body, resp) => {
				webhook.onRequest(req, body, resp);
			},
		);
		await Promise.all([client.upsertUser({ id: tommasoID }), chan.create()]);
	});

	after(async () => {
		await tearDownWebhook();
	});

	afterEach(() => {
		webhook.reset();
	});

	it('Webhook gets called', async () => {
		const resp = await chan.sendMessage({
			text: 'sample_text',
			user: { id: tommasoID },
		});
		expect(webhook.requested).to.eq(true);
		expect(webhook.request.message.text).to.eq('sample_text');
		expect(resp.message.webhook_id).not.to.be.null;
		expect(resp.message.webhook_failed).to.be.false;
	});

	it('Webhook changes text', async () => {
		webhook.response = () => ({
			message: {
				text: 'hello',
			},
		});
		const resp = await chan.sendMessage({ text: 'hi', user: { id: tommasoID } });
		expect(webhook.requested).to.eq(true);
		expect(webhook.request.message.text).to.eq('hi');
		expect(resp.message.text).to.eq('hello');
	});

	it('Webhook fails', async () => {
		webhook.fail = true;
		const resp = await chan.sendMessage({ text: 'hi', user: { id: tommasoID } });
		expect(webhook.requested).to.eq(true);
		expect(webhook.request.message.text).to.eq('hi');
		expect(resp.message.text).to.eq('hi');
		expect(resp.message.webhook_failed).to.be.true;

		const { results } = await chan.search({
			webhook_failed: {
				$eq: true,
			},
		});
		expect(results[0].message.id).to.eq(resp.message.id);
	});
});
