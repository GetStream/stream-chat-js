import chai from 'chai';
import { getTestClient, setupWebhook, sleep } from './utils';
import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;

describe('Before Message Send Webhook', function () {
	const tommasoID = `tommaso-${uuidv4()}`;
	const channelID = `fun-${uuidv4()}`;
	const client = getTestClient(true);

	let chan, webhook;

	before(async () => {
		chan = client.channel('messaging', channelID, { created_by: { id: tommasoID } });
		webhook = await setupWebhook(client, 'before_message_send_hook_url');
		await Promise.all([client.upsertUser({ id: tommasoID }), chan.create()]);
	});

	after(async () => {
		await webhook.tearDown();
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

	it("Webhook doesn't get called when it's disabled", async () => {
		await webhook.tearDown();
		const { message } = await chan.sendMessage({
			text: uuidv4(),
			user: { id: tommasoID },
		});
		expect(webhook.requested).to.eql(false);
		expect(message.webhook_id).to.be.empty;
		expect(message.webhook_failed).to.eql(false);
		webhook = await setupWebhook(client, 'before_message_send_hook_url');
	});

	it('It is OK to return the original message as a response', async () => {
		const { message } = await chan.sendMessage({
			text: uuidv4(),
			user: { id: tommasoID },
		});
		expect(message.user.id).to.eql(tommasoID);
		expect(webhook.requested).to.eql(true);
		expect(message.webhook_failed).to.eql(false);
	});

	it('Returning empty body should fail the webhook', async () => {
		webhook.response = () => '';
		const { message } = await chan.sendMessage({
			text: uuidv4(),
			user: { id: tommasoID },
		});
		expect(message.user.id).to.eql(tommasoID);
		expect(webhook.requested).to.eql(true);
		expect(message.webhook_failed).to.eql(true);
	});

	it('Webhook gets a call when updating a message too', async () => {
		const created = await chan.sendMessage({
			text: uuidv4(),
			user: { id: tommasoID },
		});
		webhook.reset();
		webhook.response = (data) => {
			data.message.text = 'bad bad bad';
			return data;
		};
		const { message } = await client.updateMessage(
			{ id: created.message.id, text: uuidv4() },
			tommasoID,
		);
		expect(message.user.id).to.eql(tommasoID);
		expect(message.text).to.eql('bad bad bad');
		expect(webhook.requested).to.eql(true);
		expect(message.webhook_failed).to.eql(false);
	});

	it('Webhook changes type to ERROR on update', async () => {
		const created = await chan.sendMessage({
			text: uuidv4(),
			user: { id: tommasoID },
		});
		webhook.reset();
		webhook.response = (data) => {
			data.message.type = 'error';
			return data;
		};
		const { message } = await client.updateMessage(
			{ id: created.message.id, text: uuidv4() },
			tommasoID,
		);
		expect(message.user.id).to.eql(tommasoID);
		expect(message.type).to.eql('error');
		expect(webhook.requested).to.eql(true);
		expect(message.webhook_failed).to.eql(false);
	});

	it('Webhooks adds custom field', async () => {
		webhook.response = (data) => {
			data.message.myCustomThingie = 42;
			return data;
		};
		const { message } = await chan.sendMessage({
			text: "hello, here's my CC information 1234 1234 1234 1234",
			user: { id: tommasoID },
		});
		expect(message.user.id).to.eql(tommasoID);
		expect(message.myCustomThingie).to.eql(42);
		expect(message.webhook_failed).to.eql(false);
	});

	it('Webhook changes type to error on create', async () => {
		webhook.response = (data) => {
			data.message.type = 'error';
			return data;
		};
		const { message } = await chan.sendMessage({
			text: 'super bad!',
			user: { id: tommasoID },
		});
		expect(message.user.id).to.eql(tommasoID);
		expect(message.type).to.eql('error');
		expect(message.webhook_failed).to.eql(false);
	});

	it('Errored messages do not exist', async () => {
		const response = await chan.query();
		expect(response.messages[response.messages.length - 1].text).to.not.eql(
			'super bad!',
		);
	});

	it('Webhook fails with a timeout', async () => {
		webhook.response = async (data) => {
			await sleep(1501);
			data.message.type = 'error';
			return data;
		};
		const { message } = await chan.sendMessage({
			text: 'super duper bad!',
			user: { id: tommasoID },
		});
		expect(message.user.id).to.eql(tommasoID);
		expect(message.type).to.eql('regular');
		expect(message.webhook_failed).to.eql(true);
	});
});
