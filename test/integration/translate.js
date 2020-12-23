import { getTestClient, getTestClientForUser } from './utils';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Message translation endpoint', function () {
	let client;
	const messageId = uuidv4();
	const user = uuidv4();

	before(async () => {
		client = await getTestClientForUser(user);
		const channel = client.channel('messaging', uuidv4(), {
			created_by_id: user,
			members: [user],
		});
		await channel.create();
		await channel.sendMessage({
			id: messageId,
			text: 'Hello, I would like to have more information about your product.',
		});
	});

	after(async () => {});

	it('translate to klingon does not work', async () => {
		const p = client.translateMessage(messageId, 'klingon');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: TranslateMessage failed with error: "language must be one of [af sq am ar az bn bs bg zh zh-TW hr cs da fa-AF nl en et fi fr fr-CA ka de el ha he hi hu id it ja ko lv ms no fa ps pl pt ro ru sr sk sl so es es-MX sw sv tl ta th tr uk ur vi]',
		);
	});

	let frTranslation;
	it('translate to french', async () => {
		const response = await client.translateMessage(messageId, 'fr');
		expect(response.message.i18n.language).to.eql('en');
		expect(response.message.i18n.fr_text).to.not.eql('');
		expect(response.message.i18n.fr_text).to.not.eql(response.message.text);
		frTranslation = response.message.i18n.fr_text;
	});

	it('translate to french again', async () => {
		const response = await client.translateMessage(messageId, 'fr');
		expect(response.message.i18n.language).to.eql('en');
		expect(response.message.i18n.fr_text).to.not.be.empty;
		expect(response.message.i18n.fr_text).to.not.eql(response.message.text);
		frTranslation = response.message.i18n.fr_text;
	});

	it('translate to italian', async () => {
		const response = await client.translateMessage(messageId, 'it');
		expect(response.message.i18n.language).to.eql('en');
		expect(response.message.i18n.fr_text).to.eql(frTranslation);
		expect(response.message.i18n.it_text).to.not.eql('');
		expect(response.message.i18n.it_text).to.not.eql(response.message.text);
	});

	it('should send a message.updated event to other users', async () => {
		const chanId = uuidv4();
		const client1 = await getTestClientForUser(uuidv4());
		const client2 = await getTestClientForUser(uuidv4());
		const channel = client1.channel('messaging', chanId, {
			created_by_id: client1.health.me.id,
			members: [client1.health.me.id, client2.health.me.id],
		});

		await channel.query();

		const chan2 = client2.channel('messaging', chanId);
		await chan2.watch();

		const p = new Promise((resolve) => {
			chan2.on('message.updated', (event) => {
				resolve(event);
			});
		});

		const response = await channel.sendMessage({
			id: uuidv4(),
			text: 'so how are you doing?',
		});

		await client1.translateMessage(response.message.id, 'it');

		const event = await p;
		expect(event.message.i18n.en_text).to.eql('so how are you doing?');
		expect(event.message.i18n.it_text).to.eql('Allora, come stai?');
	});
});

describe('Auto translation settings', function () {
	const serverSideClient = getTestClient(true);
	const user = uuidv4();
	const channelId = uuidv4();

	it('can be changed server-side for the app', async () => {
		await serverSideClient.updateAppSettings({ auto_translation_enabled: true });
		const response = await serverSideClient.getAppSettings();
		expect(response.app.auto_translation_enabled).to.eql(true);
	});

	it('can be enabled server-side for one channel', async () => {
		const channel = serverSideClient.channel('messaging', channelId, {
			auto_translation_enabled: true,
			created_by_id: user,
		});
		const response = await channel.create();
		expect(response.channel.auto_translation_enabled).to.eql(true);
	});

	it('can be disabled server-side for one channel', async () => {
		const channel = serverSideClient.channel('messaging', channelId);
		const response = await channel.update({ auto_translation_enabled: false });
		expect(response.channel.auto_translation_enabled).to.be.undefined;
	});

	it('cannot be enabled client-side for one channel', async () => {
		const client = await getTestClientForUser(user);
		const channel = client.channel('messaging', channelId);
		const p = channel.update({ auto_translation_enabled: true });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 5: UpdateChannel failed with error: "changing automatic translation can only be done server-side',
		);
	});

	it('cannot create channels with auto translation enabled', async () => {
		const client = await getTestClientForUser(user);
		const channel = client.channel('messaging', uuidv4(), {
			auto_translation_enabled: true,
		});
		const p = channel.create();
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 5: GetOrCreateChannel failed with error: "channels with automatic translation can only be created server-side',
		);
	});
});

describe('Auto translation usage', function () {
	const serverSideClient = getTestClient(true);
	const channelId = uuidv4();
	let frenchClient;
	let englishClient;
	const frenchUser = { id: uuidv4() };
	const englishUser = { id: uuidv4() };
	let messageId;

	before(async () => {
		await serverSideClient.updateAppSettings({ auto_translation_enabled: true });
		frenchClient = await getTestClientForUser(frenchUser.id, null, {
			language: 'fr',
		});
		englishClient = await getTestClientForUser(englishUser.id, null, {
			language: 'en',
		});

		const channel = serverSideClient.channel('messaging', channelId, {
			auto_translation_enabled: true,
			members: [frenchUser.id, englishUser.id],
			created_by: { language: 'fr', ...frenchUser },
		});

		await channel.create();
	});

	it('add a message in english and expect it back in french', async () => {
		const chan = englishClient.channel('messaging', channelId);
		await chan.query();
		const response = await chan.sendMessage({
			text: 'hey man, how are you doing today?',
		});
		expect(response.message.i18n.fr_text).to.not.eql('');
	});

	it('add a message in french and expect it back in english', async () => {
		const chan = frenchClient.channel('messaging', channelId);
		await chan.query();
		const response = await chan.sendMessage({
			text: 'Je ne parle pas (beaucoup de) français',
		});
		expect(response.message.i18n.en_text).to.not.eql('');
		messageId = response.message.id;
	});

	it('update the message and expect new translation to be there', async () => {
		const response = await frenchClient.updateMessage({
			id: messageId,
			text: 'Je parle français',
		});
		expect(response.message.i18n.en_text).to.eql('I speak French');
		expect(response.message.i18n.fr_text).to.eql('Je parle français');
	});

	it('cannot write i18n directly', async () => {
		const chan = englishClient.channel('messaging', channelId);
		const p = chan.sendMessage({
			text: 'hey man, how are you doing today?',
			i18n: { hey: 123 },
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: SendMessage failed with error: "message.i18n is a reserved field',
		);
		const p2 = englishClient.updateMessage({
			id: messageId,
			text: 'Je parle français',
			i18n: { hey: 123 },
		});
		await expect(p2).to.be.rejectedWith(
			'StreamChat error code 4: UpdateMessage failed with error: "message.i18n is a reserved field',
		);
	});
});
