import uuidv4 from 'uuid/v4';
import { getTestClient, getTestClientForUser, createUserToken } from './utils';
import chai from 'chai';
const expect = chai.expect;

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

Promise = require('bluebird'); // eslint-disable-line no-global-assign
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

describe('Channels - Create', function() {
	const johnID = `john-${uuidv4()}`;

	it('john creates a channel with members', async function() {
		const c = await getTestClientForUser(johnID);
		const channelId = uuidv4();
		const johnChannel = c.channel('messaging', channelId, {
			color: 'green',
			members: [johnID],
		});
		const response = await johnChannel.create();
		expect(response.channel.color).to.equal('green');
		const cid = `messaging:${channelId}`;
		expect(response.channel.cid).to.equal(cid);
		expect(response.channel.members).to.equal(undefined);
		expect(response.members.length).to.equal(1);

		const queryResponse = await c.queryChannels({ cid }, undefined, {
			state: true,
			presence: true,
		});
	});
});

describe('Channels - members', function() {
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;

	const channelGroup = 'messaging';
	const channelId = `test-channels-${uuidv4()}`;
	const tommasoToken = createUserToken(tommasoID);
	const thierryToken = createUserToken(thierryID);

	const tommasoClient = getTestClient();
	const thierryClient = getTestClient();

	let tommasoChannel, thierryChannel;
	const message = { text: 'nice little chat API' };

	const tommasoChannelEventQueue = [];
	const thierryChannelEventQueue = [];

	let tommasoMessageID;

	before(async () => {
		await tommasoClient.setUser({ id: tommasoID }, tommasoToken);
		await thierryClient.setUser({ id: thierryID }, thierryToken);
	});

	it('tommaso creates a new channel', async function() {
		tommasoChannel = tommasoClient.channel(channelGroup, channelId);
		await tommasoChannel.watch();
		tommasoChannel.on(event => {
			tommasoChannelEventQueue.push(event);
		});
	});

	it(`tommaso tries to create a channel that's too large`, function(done) {
		const chan = tommasoClient.channel(channelGroup, `big-boy-${uuidv4()}`, {
			stuff: 'x'.repeat(6 * 1024),
		});
		chan.create()
			.then(function() {
				done('should fail');
			})
			.catch(function() {
				done();
			});
	});

	it(`tommaso tries to create a channel with a reserved character`, async function() {
		const chan = tommasoClient.channel(channelGroup, `!${channelId}`);
		let failed = true;
		try {
			await chan.watch();
			failed = false;
		} catch (e) {
			// failure is expected
		}
		if (!failed) {
			expect.fail('should have failed');
		}
	});

	it('thierry tries to join the channel', function(done) {
		thierryChannel = thierryClient.channel(channelGroup, channelId);
		thierryChannel
			.watch()
			.then(function() {
				done('should fail');
			})
			.catch(function() {
				done();
			});
	});

	it('tommaso adds thierry as channel member', async function() {
		await tommasoChannel.addMembers([thierryID]);
	});

	it('thierry tries to join the channel', async function() {
		thierryChannel = thierryClient.channel(channelGroup, channelId);
		await thierryChannel.watch();
		thierryChannel.on(event => {
			thierryChannelEventQueue.push(event);
		});
	});

	it('tommaso gets an event about Thierry joining', function(done) {
		setTimeout(() => {
			let event = tommasoChannelEventQueue.pop();
			expect(event.type).to.eql('user.watching.start');
			expect(event.user.id).to.eql(thierryID);

			event = tommasoChannelEventQueue.pop();

			expect(event.type).to.eql('channel.updated');
			event = tommasoChannelEventQueue.pop();
			expect(event.type).to.eql('member.added');
			done();
		}, 1000);
	});

	it('tommaso posts a message', async function() {
		await tommasoChannel.sendMessage(message);
	});

	it('thierry gets the new message from tommaso', function(done) {
		setTimeout(() => {
			const event = thierryChannelEventQueue.pop();
			expect(event.type).to.eql('message.new');
			tommasoMessageID = event.message.id;
			done();
		}, 1000);
	});

	it('thierry tries to update the channel description', function(done) {
		thierryChannel
			.update({ description: 'taking over this channel now!' })
			.then(() => done('should fail'))
			.catch(() => done());
	});

	it('tommaso updates the channel description', async function() {
		await tommasoChannel.update({ description: 'taking over this channel now!' });
	});

	it('tommaso updates his own message', async function() {
		await tommasoClient.updateMessage({
			id: tommasoMessageID,
			text: 'I mean, awesome chat',
		});
	});

	it('thierry tries to update tommaso message', function(done) {
		thierryClient
			.updateMessage({ id: tommasoMessageID, text: 'I mean, awesome chat' })
			.then(() => done('should fail'))
			.catch(() => done());
	});

	it('thierry mutes himself', async function() {
		const response = await thierryChannel.sendMessage({
			text: `/mute @${thierryID}`,
		});
		expect(response.message.type).to.eql('error');
	});

	it('thierry gets promoted', async function() {
		await getTestClient(true).updateUser({ id: thierryID, role: 'admin' });
	});
});
