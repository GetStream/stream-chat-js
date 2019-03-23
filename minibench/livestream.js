import { StreamChat, logChatPromiseExecution } from '../src';
import {
	getUserClient,
	getRandomUserID,
	shuffle,
	randomMessageText,
	getServerClient,
	chunkArray,
} from './utils';
import uuidv4 from 'uuid/v4';
import { createUserToken } from '../test/utils';

/*
 * Livestream is different from messaging
 * - 1 channel
 * - many reads
 * - lot of writes (but much less than reads)
 */

var n = 1000;
var c = 20;
var userCount = 5000;
var writeChance = 0.2;
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
	for (let group of chunkArray(userObjects, 100)) {
		await getServerClient().updateUsers(group);
	}

	const userID = `user-${benchID}-0`;
	const client = await getUserClient(userID);

	const channel = client.channel(channelType, `spacexlaunch-${benchID}`);
	await channel.create();
	return [benchID, channel];
}

async function runInner(benchID, channelID) {
	console.log('channelid', channelID);
	const userID = getRandomUserID(userCount);
	const me = `user-${benchID}-${userID}`;
	const userClient = await getUserClient(me);
	const channel = userClient.channel(channelType, channelID);
	// many people are lurking...
	const state = channel.watch();

	// only some of them send messages
	if (Math.random() <= writeChance) {
		console.log('writing a message');
		await channel.sendMessage({ text: randomMessageText() });
	}
}

async function runBench(benchID, channel) {
	console.log('starting to run the bench.... ', benchID);

	for (let t = 0; t < n; t++) {
		const promises = [];
		for (let c2 = 0; c2 < c; c2++) {
			promises.push(runInner(benchID, channel.id));
		}
		// await all at the same time
		await Promise.all(promises);
		console.log(`tick ${t} finished`);
	}
}

async function runTest() {
	const [benchID, channel] = await prepareBench();
	await runBench(benchID, channel);
	console.log(benchID);
}

runTest()
	.then()
	.catch(e => {
		console.log('e', e);
	});
