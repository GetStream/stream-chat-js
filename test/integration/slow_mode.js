import { v4 as uuidv4 } from 'uuid';
import { getTestClient, getTestClientForUser } from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { sleep } from '../../src/utils';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('channel slow mode', function () {
	const moderator = 'mod-' + uuidv4();
	const admin = 'admin-' + uuidv4();
	const member = 'member' + uuidv4();
	let ssClient;
	let moderatorClient;
	let adminClient;
	let memberClient;
	let channel;
	before(async function () {
		ssClient = getTestClient(true);
		await ssClient.upsertUsers([
			{ id: admin, role: 'admin' },
			{ id: member },
			{ id: moderator },
		]);
		moderatorClient = await getTestClientForUser(moderator);
		memberClient = await getTestClientForUser(member);
		adminClient = await getTestClientForUser(admin);
		channel = ssClient.channel('messaging', uuidv4(), {
			members: [member, moderator],
			created_by_id: admin,
		});
		await channel.create();
		await channel.addModerators([moderator]);
	});

	it('server side auth clients should be able to change cooldown', async function () {
		const resp = await channel.enableSlowMode(3);
		expect(resp.channel.cooldown).to.be.equal(3);
	});

	it('moderator users should be able to change cooldown', async function () {
		const resp = await moderatorClient
			.channel('messaging', channel.id)
			.enableSlowMode(2);
		expect(resp.channel.cooldown).to.be.equal(2);
	});

	it('admin users should be able to change cooldown', async function () {
		const resp = await adminClient.channel('messaging', channel.id).enableSlowMode(1);
		expect(resp.channel.cooldown).to.be.equal(1);
	});

	it('regular members cannot change cooldown', async function () {
		const p = memberClient.channel('messaging', channel.id).enableSlowMode(1);
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 17: UpdateChannel failed with error: "cooldown settings can only be updated by channel moderator or admin"',
		);
	});

	it('an error must be returned for regular users when sending messages under coolDown period', async function () {
		const ch = memberClient.channel('messaging', channel.id);
		await ch.query();
		let resp = await ch.sendMessage({ text: 'hi' });
		expect(resp.message).to.not.be.undefined;

		// second message should return an error (under cooldown period)
		await expect(ch.sendMessage({ text: 'hi' })).to.be.rejectedWith(
			`StreamChat error code 60: SendMessage failed with error: "user ${member} is not allowed to send messages on channel ${ch.cid} under cool down period(1s)"`,
		);
		// wait for cool down to complete
		await sleep(1000);

		resp = await ch.sendMessage({ text: 'hi' });
		expect(resp.message).to.not.be.undefined;
	});

	it('cool down doesnt apply to moderators', async function () {
		// send messages with moderator
		const modChannel = moderatorClient.channel('messaging', channel.id);
		for (let i = 0; i < 5; i++) {
			const resp = await modChannel.sendMessage({ text: 'hi' });
			expect(resp.message).to.not.be.undefined;
		}
	});

	it('cool down doesnt apply to admin users', async function () {
		// send messages with admin
		const adminChannel = adminClient.channel('messaging', channel.id);
		for (let i = 0; i < 5; i++) {
			const resp = await adminChannel.sendMessage({ text: 'hi' });
			expect(resp.message).to.not.be.undefined;
		}
	});

	it('cool down doesnt apply to server side auth', async function () {
		// send messages with server side auth
		for (let i = 0; i < 5; i++) {
			const resp = await channel.sendMessage({ text: 'hi', user_id: admin });
			expect(resp.message).to.not.be.undefined;
		}
	});

	it('disable slow mode', async function () {
		const resp = await channel.disableSlowMode();
		expect(resp.channel.cooldown).to.be.undefined;
	});

	it('creating a channel with custom field cooldown should fail', async function () {
		const ch = ssClient.channel('messaging', uuidv4(), {
			members: [member, moderator],
			created_by_id: admin,
			cooldown: 2,
		});
		await expect(ch.create()).to.be.rejectedWith(
			'StreamChat error code 4: GetOrCreateChannel failed with error: "data.cooldown is a reserved field"',
		);
	});

	it('update the channel with custom field cooldown return an error', async function () {
		await expect(channel.update({ cooldown: 1 })).to.be.rejectedWith(
			'StreamChat error code 4: UpdateChannel failed with error: "data.cooldown is a reserved field"',
		);
	});
});
