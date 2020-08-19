import uuidv4 from 'uuid/v4';
import { getTestClient, getTestClientForUser } from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { sleep } from '../src/utils';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe.only('channel slow mode', function() {
	const moderator = 'mod-' + uuidv4();
	const admin = 'admin-' + uuidv4();
	const member = 'member' + uuidv4();
	let ssClient;
	let modClient;
	let adminClient;
	let memberClient;
	let channel;
	before(async function() {
		ssClient = await getTestClient(true);
		await ssClient.upsertUsers([
			{ id: admin, role: 'admin' },
			{ id: member },
			{ id: moderator },
		]);
		modClient = await getTestClientForUser(moderator);
		memberClient = await getTestClientForUser(member);
		adminClient = await getTestClientForUser(admin);
		channel = ssClient.channel('messaging', uuidv4(), {
			members: [member, moderator],
			created_by_id: admin,
		});
		await channel.create();
		await channel.addModerators([moderator]);
	});

	it('enable slow mode', async function() {
		const resp = await channel.enableSlowMode(1);
		expect(resp.channel.slow_mode_interval).to.be.equal(1);
	});

	it('an error must be returned for regular users when sending messages under coolDown period', async function() {
		const ch = memberClient.channel('messaging', channel.id);
		let resp = await ch.sendMessage({ text: 'hi' });
		expect(resp.message).to.not.be.undefined;

		// second message should return an error (under cooldown period)
		await expect(ch.sendMessage({ text: 'hi' })).to.be.rejectedWith(
			'StreamChat error code 17: SendMessage failed with error: "sending messages under cool down period is not allowed"',
		);
		// wait for cool down to complete
		await sleep(1000);

		resp = await ch.sendMessage({ text: 'hi' });
		expect(resp.message).to.not.be.undefined;
	});

	it('cool down doesnt apply to moderators', async function() {
		// send messages with moderator
		const modChannel = modClient.channel('messaging', channel.id);
		for (let i = 0; i < 5; i++) {
			const resp = await modChannel.sendMessage({ text: 'hi' });
			expect(resp.message).to.not.be.undefined;
		}
	});

	it('cool down doesnt apply to admin', async function() {
		// send messages with admin
		const adminChannel = adminClient.channel('messaging', channel.id);
		for (let i = 0; i < 5; i++) {
			const resp = await adminChannel.sendMessage({ text: 'hi' });
			expect(resp.message).to.not.be.undefined;
		}
	});

	it('cool down doesnt apply to server side auth', async function() {
		// send messages with server side auth
		for (let i = 0; i < 5; i++) {
			const resp = await channel.sendMessage({ text: 'hi', user_id: admin });
			expect(resp.message).to.not.be.undefined;
		}
	});
});
