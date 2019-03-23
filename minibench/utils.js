import { StreamChat } from '../src';
import { createUserToken } from '../test/utils';
import faker from 'faker';

var userClients = {};

const apiKey = process.env.CHAT_API_KEY;
const apiSecret = process.env.CHAT_API_SECRET;
var serverClient;

export function chunkArray(myArray, chunk_size) {
	let index = 0;
	let arrayLength = myArray.length;
	let tempArray = [];

	for (index = 0; index < arrayLength; index += chunk_size) {
		const myChunk = myArray.slice(index, index + chunk_size);
		// Do something if you want with the group
		tempArray.push(myChunk);
	}

	return tempArray;
}

export function getServerClient() {
	if (!serverClient) {
		serverClient = new StreamChat(apiKey, apiSecret, { timeout: 30000 });
	}
	return serverClient;
}

export async function getUserClient(userID) {
	let client = userClients[userID];
	if (!client) {
		client = new StreamChat(apiKey, { timeout: 30000 });
		const data = faker.helpers.userCard();
		await client.setUser({ id: userID, ...data }, createUserToken(userID));

		userClients[userID] = client;
	}
	return userClients[userID];
}

export function getRandomUserID(max) {
	return Math.floor(Math.random() * Math.floor(max));
}

export function shuffle(a) {
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export function randomMessageText() {
	var text = '';
	var possible = 'ABCDEF    GHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (var i = 0; i < 10; i++)
		text += possible.charAt(Math.floor(Math.random() * possible.length));

	return text;
}
