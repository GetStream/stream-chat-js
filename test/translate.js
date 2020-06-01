import { getTestClient, createUserToken, getTestClientForUser } from './utils';
import uuidv4 from 'uuid/v4';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Message translation endpoint', function() {
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
		expect(response.message.i18n.fr_text).to.eql(frTranslation);
		expect(response.message.i18n.fr_text).to.not.eql(response.message.text);
	});

	it('translate to italian', async () => {
		const response = await client.translateMessage(messageId, 'it');
		expect(response.message.i18n.language).to.eql('en');
		expect(response.message.i18n.fr_text).to.eql(frTranslation);
		expect(response.message.i18n.it_text).to.not.eql('');
		expect(response.message.i18n.it_text).to.not.eql(response.message.text);
	});
});

describe('Auto translation settings', function() {
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
