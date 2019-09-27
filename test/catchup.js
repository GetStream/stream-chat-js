import { getTestClientForUser } from './utils';
import uuidv4 from 'uuid/v4';
import chai from 'chai';
const expect = chai.expect;

describe.only('session continuation', function() {
	const maxBatchSize = 40;
	const channelId = uuidv4();
	const messages = [];
	const userID = uuidv4();
	before(async function() {
		let client = await getTestClientForUser(userID);
		const channel = client.channel('messaging', channelId);
		await channel.create();
		for (let i = 0; i < maxBatchSize + 1; i++) {
			messages.push((await channel.sendMessage({ text: 'hi ' + i })).message);
		}
	});

	it('replay all the messages', async function() {
		let client = await getTestClientForUser(userID);
		const channel = client.channel('messaging', channelId);

		await channel.sync(function(msgs) {
			channel.state.addMessagesSorted(msgs);
			return true; //continue
		});
		expect(channel.state.messages.length).to.be.equal(41);
	});

	it('replay messages after message 40', async function() {
		let client = await getTestClientForUser(userID);
		const channel = client.channel('messaging', channelId);

		await channel.sync(function(msgs) {
			channel.state.addMessagesSorted(msgs);
			return true; //continue
		}, messages[39].created_at);
		expect(channel.state.messages.length).to.be.equal(1);
	});
});
