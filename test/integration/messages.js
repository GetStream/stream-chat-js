import { v4 as uuidv4 } from 'uuid';

import {
	expectHTTPErrorCode,
	getServerTestClient,
	getTestClientForUser,
	sleep,
} from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;

chai.use(chaiAsPromised);

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

const Promise = require('bluebird');
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

// setupTestChannel sets up all possible client and channel objects for given channel type
// set createOnServerSide=true to execute channel creation from the server side
async function setupTestChannel(type, createOnServerSide, custom = {}) {
	const ownerID = uuidv4();
	const memberID = uuidv4();
	const modID = uuidv4();
	const userID = uuidv4();
	const ownerClient = await getTestClientForUser(ownerID);
	const memberClient = await getTestClientForUser(memberID);
	const modClient = await getTestClientForUser(modID);
	const userClient = await getTestClientForUser(userID);
	const serverSideClient = getServerTestClient();
	const ownerChannel = ownerClient.channel(type, uuidv4(), {
		...custom,
		members: [ownerID, modID, memberID],
	});
	const memberChannel = memberClient.channel(ownerChannel.type, ownerChannel.id);
	const modChannel = modClient.channel(ownerChannel.type, ownerChannel.id);
	const serverSideChannel = serverSideClient.channel(
		ownerChannel.type,
		ownerChannel.id,
		{ created_by_id: ownerID },
	);
	const userChannel = userClient.channel(ownerChannel.type, ownerChannel.id);
	if (createOnServerSide) {
		await serverSideChannel.create();
	} else {
		await ownerChannel.create();
	}
	await serverSideChannel.addModerators([modID]);
	return {
		owner: {
			id: ownerID,
			client: ownerClient,
			channel: ownerChannel,
		},
		member: {
			id: memberID,
			client: memberClient,
			channel: memberChannel,
		},
		mod: {
			id: modID,
			client: modClient,
			channel: modChannel,
		},
		user: {
			id: userID,
			client: await userClient,
			channel: userChannel,
		},
		serverSide: {
			client: serverSideClient,
			channel: serverSideChannel,
		},
	};
}

function testMessagePinPermissions(type, createOnServerSide, matrix) {
	let chat;
	before(async () => {
		chat = await setupTestChannel(type, createOnServerSide);
	});
	Object.entries(matrix).forEach((entry) => {
		const [role, allowed] = entry;
		if (allowed) {
			it(role + ' is allowed to pin a message', async () => {
				await chat[role].channel.sendMessage({
					text: 'Pinned message',
					pinned: true,
				});
			});
		} else {
			it(role + ' is not allowed to pin a message', async () => {
				await expectHTTPErrorCode(
					403,
					chat[role].channel.sendMessage({
						text: 'Pinned message',
						pinned: true,
					}),
				);
			});
		}
	});
}

describe('pinned messages', () => {
	context('general use cases', () => {
		let chat;
		before(async () => {
			chat = await setupTestChannel('messaging', false);
		});
		it('send pinned message', async () => {
			await chat.owner.channel.sendMessage({
				text: 'Regular message 1',
				pinned: false,
			});
			const { message } = await chat.owner.channel.sendMessage({
				text: 'Pinned message 1',
				pinned: true,
			});
			expect(message.pinned).to.be.equal(true);
			expect(message.pinned_at).to.be.not.empty;
			expect(message.pinned_by.id).to.be.equal(chat.owner.id);

			const { results } = await chat.owner.channel.search({ pinned: true });
			expect(results.length).to.be.equal(1);
			expect(results[0].message.id).to.be.equal(message.id);
		});

		it('pin message', async () => {
			const { message } = await chat.owner.channel.sendMessage({
				text: 'Regular message 2',
			});
			expect(message.pinned).to.be.equal(false);
			const { message: updatedMessage } = await chat.owner.client.pinMessage(
				message,
			);
			expect(updatedMessage.pinned).to.be.equal(true);
			expect(updatedMessage.pin_expires).to.be.equal(null);
			expect(updatedMessage.text).to.be.equal('Regular message 2');
		});

		it('unpin message', async () => {
			const { message } = await chat.owner.channel.sendMessage({
				text: 'Pinned message 2',
				pinned: true,
			});
			expect(message.pinned).to.be.equal(true);
			const { message: updatedMessage } = await chat.owner.client.unpinMessage(
				message,
			);
			expect(updatedMessage.pinned).to.be.equal(false);
			expect(updatedMessage.pin_expires).to.be.equal(null);
			expect(updatedMessage.text).to.be.equal('Pinned message 2');
		});

		it('pin message with expiration date', async () => {
			const expires = new Date();
			expires.setSeconds(expires.getSeconds() + 1);
			const { message } = await chat.owner.channel.sendMessage({
				text: 'Bla bla bla',
			});
			expect(message.pinned).to.be.equal(false);
			const { message: updatedMessage } = await chat.owner.client.pinMessage(
				message,
				expires,
			);
			expect(updatedMessage.pinned).to.be.equal(true);
			expect(updatedMessage.pin_expires).not.to.be.equal(undefined);
			const { message: updatedMessage1 } = await chat.owner.client.getMessage(
				message.id,
			);
			expect(updatedMessage1.pinned).to.be.equal(true);
			await sleep(1500);
			const { message: updatedMessage2 } = await chat.owner.client.getMessage(
				message.id,
			);
			expect(updatedMessage2.pinned).to.be.equal(false);
		});

		it('pin message with expiration date as string', async () => {
			const expires = new Date();
			expires.setSeconds(expires.getSeconds() + 1);
			const { message } = await chat.owner.channel.sendMessage({
				text: 'Bla bla bla',
			});
			expect(message.pinned).to.be.equal(false);
			const { message: updatedMessage } = await chat.owner.client.pinMessage(
				message,
				expires.toISOString(),
			);
			expect(updatedMessage.pinned).to.be.equal(true);
			expect(updatedMessage.pin_expires).not.to.be.equal(null);
			const { message: updatedMessage1 } = await chat.owner.client.getMessage(
				message.id,
			);
			expect(updatedMessage1.pinned).to.be.equal(true);
			await sleep(1500);
			const { message: updatedMessage2 } = await chat.owner.client.getMessage(
				message.id,
			);
			expect(updatedMessage2.pinned).to.be.equal(false);
		});

		it('pin message with timeout', async () => {
			const { message } = await chat.owner.channel.sendMessage({
				text: 'Bla bla bla',
			});
			expect(message.pinned).to.be.equal(false);
			const { message: updatedMessage } = await chat.owner.client.pinMessage(
				message,
				1,
			);
			expect(updatedMessage.pinned).to.be.equal(true);
			expect(updatedMessage.pin_expires).not.to.be.equal(null);
			const { message: updatedMessage1 } = await chat.owner.client.getMessage(
				message.id,
			);
			expect(updatedMessage1.pinned).to.be.equal(true);
			await sleep(1500);
			const { message: updatedMessage2 } = await chat.owner.client.getMessage(
				message.id,
			);
			expect(updatedMessage2.pinned).to.be.equal(false);
		});

		it('pin message with invalid timeout', async () => {
			const { message } = await chat.owner.channel.sendMessage({
				text: 'Bla bla bla',
			});
			expect(message.pinned).to.be.equal(false);
			await expectHTTPErrorCode(400, chat.owner.client.pinMessage(message, 0));
		});

		it('change pinned message expiration', async () => {
			const { message } = await chat.owner.channel.sendMessage({
				text: 'Bla bla bla',
				pinned: true,
			});
			expect(message.pinned).to.be.equal(true);
			expect(message.pin_expires).to.be.equal(null);
			const { message: updatedMessage1 } = await chat.owner.client.pinMessage(
				message,
				60,
			);
			expect(updatedMessage1.pinned).to.be.equal(true);
			expect(updatedMessage1.pin_expires).not.to.be.equal(null);
			const { message: updatedMessage2 } = await chat.owner.client.pinMessage(
				message,
			);
			expect(updatedMessage2.pinned).to.be.equal(true);
			expect(updatedMessage2.pin_expires).to.be.equal(null);
		});

		it('pin and unpin message server side', async () => {
			const { message } = await chat.serverSide.channel.sendMessage({
				user_id: chat.owner.id,
				text: 'Pinned message 5',
				pinned: true,
			});
			expect(message.pinned).to.be.equal(true);
			const {
				message: updatedMessage1,
			} = await chat.serverSide.client.unpinMessage({
				...message,
				user_id: chat.owner.id,
			});
			expect(updatedMessage1.pinned).to.be.equal(false);
			expect(updatedMessage1.text).to.be.equal('Pinned message 5');
			const { message: updatedMessage2 } = await chat.serverSide.client.pinMessage({
				...updatedMessage1,
				user_id: chat.owner.id,
			});
			expect(updatedMessage2.pinned).to.be.equal(true);
		});
	});
	context('livestream permissions', () => {
		testMessagePinPermissions('livestream', false, {
			owner: true,
			mod: true,
			member: false,
			user: false,
		});
	});
	context('messaging permissions', () => {
		testMessagePinPermissions('messaging', false, {
			owner: true,
			mod: true,
			member: true,
			user: false,
		});
	});
	context('team permissions', () => {
		testMessagePinPermissions('team', false, {
			owner: true,
			mod: true,
			member: true,
			user: false,
		});
	});
	context('commerce permissions', () => {
		testMessagePinPermissions('commerce', true, {
			owner: true,
			mod: true,
			member: false,
			user: false,
		});
	});
	context('gaming permissions', () => {
		testMessagePinPermissions('gaming', true, {
			owner: false,
			mod: true,
			member: false,
			user: false,
		});
	});
});
