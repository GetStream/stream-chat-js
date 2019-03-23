import { StreamChat, logChatPromiseExecution } from '../src';
import {
	getUserClient,
	getRandomUserID,
	shuffle,
	randomMessageText,
	chunkArray,
	getServerClient,
} from './utils';
import uuidv4 from 'uuid/v4';
import { createUserToken } from '../test/utils';

/*
 * The messaging use case features the following load properties:
 * - many small channels
 * - high number of calls to queryChannels
 */

var n = 1000;
var c = 50;
var userCount = 50;
var channelCount = 200;
var channelType = 'livestream';

async function prepareBench() {
	// 300 conversations.. random set of 3 out of a 1000 users per channel
	// uuids so there is never any overlap

	const benchID = uuidv4();
	console.log('preparing benchmark with id', benchID);

	const users = [];
	const userObjects = [];
	for (let u = 0; u < userCount; u++) {
		users.push(`user-${benchID}-${u}`);
		userObjects.push({ id: `user-${benchID}-${u}` });
	}
	const user0 = `user-${benchID}-0`;
	const client = await getUserClient(user0);
	for (let group of chunkArray(userObjects, 100)) {
		await getServerClient().updateUsers(group);
	}
	const promises = [];
	for (let c = 0; c < channelCount; c++) {
		const members = [];
		const randomUsers = shuffle(users).slice(0, 5);
		console.log('creating with members', randomUsers, c);
		const channel = client.channel(channelType, `conversation-${benchID}-${c}`, {
			members: randomUsers,
		});
		await channel.create();
	}
	return benchID;
}

async function runInner(benchID) {
	const userID = getRandomUserID(userCount);
	const me = `user-${benchID}-${userID}`;
	const userClient = await getUserClient(me);
	const channels = await userClient.queryChannels(
		{ members: { $in: [me] } },
		{ last_message_at: -1 },
	);
	console.log(`found ${channels.length} channels searching for ${me}`);
	for (let channel of channels.slice(0, 5)) {
		await channels[0].sendMessage({ text: randomMessageText() });
	}
}

async function runBench(benchID) {
	console.log('starting to run the bench.... ', benchID);

	for (let t = 0; t < n; t++) {
		const promises = [];
		for (let c2 = 0; c2 < c; c2++) {
			promises.push(runInner(benchID));
		}
		// await all at the same time
		await Promise.all(promises);
		console.log(`tick ${t} finished`);
	}
}

async function runTest() {
	const benchID = await prepareBench();
	await runBench(benchID);
	console.log('done');
}

runTest()
	.then()
	.catch(e => {
		console.log('e', e);
	});
