import { getTestClient, getTestClientForUser } from './utils';
import {
	Permission,
	Deny,
	BuiltinRoles,
	BuiltinPermissions,
	Allow,
} from '../../src/permissions';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import chai from 'chai';

const assert = chai.assert;

class Context {
	constructor(channelType) {
		this.authClient = getTestClient(true);
		this.channelType = channelType;
		this.channelId = uuidv4();
		this.adminUser = { id: `admin-${uuidv4()}`, role: 'admin' };
		this.guestUser = { id: `guest-${uuidv4()}`, role: 'guest' };
		this.user = { id: `user-${uuidv4()}`, role: 'user' };
		this.moderator = { id: `moderator-${uuidv4()}`, role: 'user' };
		this.messageOwner = { id: `message-owner-${uuidv4()}` };
		this.channelOwner = { id: `channel-owner-${uuidv4()}` };
		this.channelMember = { id: `channel-member-${uuidv4()}`, role: 'user' };
		this.scapegoatUser = { id: `sg-${uuidv4()}` };
	}

	async setup() {
		await this.authClient.upsertUser(this.adminUser);
		await this.authClient.upsertUser(this.moderator);
		await this.authClient.upsertUser(this.guestUser);
		await this.authClient.upsertUser(this.channelMember);
		await this.authClient.upsertUser(this.channelOwner);
		await this.authClient.upsertUser(this.messageOwner);
		await this.authClient.upsertUser(this.scapegoatUser);

		this.channel = this.authClient.channel(this.channelType, this.channelId, {
			created_by: this.channelOwner,
		});
		await this.channel.create();
		await this.channel.addMembers([this.channelMember.id]);
		await this.channel.addModerators([this.moderator.id]);
	}
}

const messageWithLink = {
	text: 'here a cool link https://www.youtube.com/watch?v=kx_G2a2hL6U',
};

const simpleMessage = { text: 'hello world!' };

function setupUser(ctx, user, done, test) {
	const client = getTestClient(false);
	const token = ctx.authClient.createToken(user.id);
	return client
		.connectUser(user, token)
		.then(() => {
			test(client);
		})
		.catch((e) => {
			console.log(e);
			done('failed to connectUser');
		});
}

function createChannel(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, `${uuidv4()}`, {});
			responseTest(channel.watch(), done);
		});
	};
}

function readChannel(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, ctx.channelId, {});
			responseTest(channel.watch(), done);
		});
	};
}

function addChannelMembers(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, ctx.channelId, {});
			responseTest(channel.addMembers([ctx.scapegoatUser.id]), done);
		});
	};
}

function removeChannelMembers(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, ctx.channelId, {});
			responseTest(channel.removeMembers([ctx.scapegoatUser.id]), done);
		});
	};
}

function updateChannel(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, ctx.channelId, {});
			responseTest(
				channel.update({ color: 'blue' }, { text: 'got new color!' }),
				done,
			);
		});
	};
}

function createMessage(ctx, user, message, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, ctx.channelId, {});
			responseTest(channel.sendMessage(message), done);
		});
	};
}

async function createMessageFrozen(ctx, user, shouldFail) {
	const userClient = await getTestClientForUser(user.id);
	const userChannel = userClient.channel(ctx.channelType, ctx.channelId, {});
	const res = await userChannel.sendMessage(simpleMessage);

	if (shouldFail) {
		assert.equal(
			res.message.text,
			'Sorry, this channel has been frozen by the admin',
		);
	} else {
		assert.notEqual(res.message, undefined);
		assert.notEqual(res.message.id, undefined);
		assert.isNotEmpty(res.message.id);
	}
}

async function createDeleteReactionFrozen(ctx, user, shouldFail) {
	const userClient = await getTestClientForUser(user.id);
	const userChannel = userClient.channel(ctx.channelType, ctx.channelId, {});
	await userChannel.watch();
	const res = await userChannel.sendMessage(simpleMessage);
	if (shouldFail) {
		assert.equal(
			res.message.text,
			'Sorry, this channel has been frozen by the admin',
		);
	} else {
		assert.notEqual(res.message, undefined);
		assert.notEqual(res.message.id, undefined);
		assert.isNotEmpty(res.message.id);
	}

	try {
		await userChannel.sendReaction(res.message.id, { type: 'love' });
		await userChannel.deleteReaction(res.message.id, 'love');
	} catch (e) {
		if (!shouldFail) {
			assert.fail('send reaction or delete reaction failed: ', e);
		}
	}
}

async function removeUseFrozenChannelPermissions(ctx) {
	const { permissions } = await ctx.authClient.getChannelType(ctx.channelType);
	await ctx.authClient.updateChannelType(ctx.channelType, {
		permissions: permissions.filter(
			(v) => v.name !== BuiltinPermissions.UseFrozenChannel,
		),
	});
}

async function addUseFrozenChannelPermissions(ctx) {
	const permission = new Permission(
		BuiltinPermissions.UseFrozenChannel,
		910,
		['UseFrozenChannel'],
		[BuiltinRoles.Admin],
		false,
		Allow,
	);

	const { permissions } = await ctx.authClient.getChannelType(ctx.channelType);
	permissions.push(permission);
	await ctx.authClient.updateChannelType(ctx.channelType, { permissions });
}

function deleteMessage(ctx, user, responseTest) {
	return function (done) {
		ctx.channel
			.sendMessage({ text: 'server-side message!', user: ctx.messageOwner })
			.then((data) => {
				const messageId = data.message.id;
				setupUser(ctx, user, done, (client) => {
					responseTest(client.deleteMessage(messageId), done);
				});
			})
			.catch((e) => {
				console.log(e);
				done('failed to post test message');
			});
	};
}

function updateMessage(ctx, user, responseTest) {
	return function (done) {
		ctx.channel
			.sendMessage({ text: 'server-side message!', user: ctx.messageOwner })
			.then((data) => {
				const messageId = data.message.id;
				setupUser(ctx, user, done, (client) => {
					responseTest(
						client.updateMessage({ id: messageId, text: 'updated message' }),
						done,
					);
				});
			})
			.catch((e) => {
				console.log(e);
				done('failed to post test message');
			});
	};
}

function banUser(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			responseTest(client.banUser(ctx.scapegoatUser.id), done);
		});
	};
}

function changeRole(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const newUser = Object.assign({}, user, {
				role: user.role !== 'user' ? 'user' : 'admin',
			});
			responseTest(client.upsertUser(newUser), done);
		});
	};
}

function changeOwnUser(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const newUser = Object.assign({}, user, { changed: true });
			responseTest(client.upsertUser(newUser), done);
		});
	};
}

function changeOtherUser(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const newUser = Object.assign({}, ctx.scapegoatUser, {
				name: 'new-name',
			});
			responseTest(client.upsertUser(newUser), done);
		});
	};
}

function upload(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, ctx.channelId, {});
			const file = fs.createReadStream('./helloworld.txt');
			responseTest(channel.sendFile(file, 'hello_world.txt'), done);
		});
	};
}

function deleteUpload(ctx, user, responseTest) {
	return function (done) {
		const file = fs.createReadStream('./helloworld.txt');
		ctx.channel
			.sendFile(file, 'hello_world.txt', null, ctx.messageOwner)
			.then((response) => {
				setupUser(ctx, user, done, (client) => {
					const channel = client.channel(ctx.channelType, ctx.channelId, {});
					responseTest(channel.deleteFile(response.file), done);
				});
			})
			.catch((e) => {
				console.log(e);
				done('upload failed');
			});
	};
}

function addChannelModerator(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, ctx.channelId, {});
			responseTest(channel.addModerators([ctx.scapegoatUser.id]), done);
		});
	};
}

function demoteChannelModerator(ctx, user, responseTest) {
	return function (done) {
		setupUser(ctx, user, done, (client) => {
			const channel = client.channel(ctx.channelType, ctx.channelId, {});
			responseTest(channel.demoteModerators([ctx.scapegoatUser.id]), done);
		});
	};
}

function allowed(r, done) {
	r.then(() => done()).catch((e) => {
		console.log(e);
		done('failed');
	});
}

function notAllowed(r, done) {
	r.then(() => done('should fail')).catch((e) => {
		e.status === 403 ? done() : done(`status code is not 400 but ${e.status}`);
	});
}

function roleAllowed(roleName, test) {
	it(`${roleName} is allowed`, (done) => test(done));
}

function roleNotAllowed(roleName, test) {
	it(`${roleName} is not allowed`, (done) => test(done));
}

describe('Messaging permissions', function () {
	const ctx = new Context('messaging');

	before(async () => {
		await ctx.setup();
	});

	describe('Create channel', function () {
		roleAllowed(ctx.adminUser.role, createChannel(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, createChannel(ctx, ctx.moderator, allowed));
		roleAllowed(ctx.user.role, createChannel(ctx, ctx.user, allowed));
		roleNotAllowed(ctx.guestUser.role, createChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Read channel', function () {
		roleAllowed(ctx.adminUser.role, readChannel(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, readChannel(ctx, ctx.moderator, allowed));
		roleAllowed('Channel member', readChannel(ctx, ctx.channelMember, allowed));
		roleAllowed('Channel owner', readChannel(ctx, ctx.channelOwner, allowed));
		roleNotAllowed(ctx.user.role, readChannel(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, readChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Add channel members', function () {
		roleAllowed(ctx.adminUser.role, addChannelMembers(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, addChannelMembers(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			addChannelMembers(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Channel owner', addChannelMembers(ctx, ctx.channelOwner, allowed));
		roleNotAllowed(ctx.user.role, addChannelMembers(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			addChannelMembers(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Remove channel members', function () {
		roleAllowed(
			ctx.adminUser.role,
			removeChannelMembers(ctx, ctx.adminUser, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			removeChannelMembers(ctx, ctx.moderator, allowed),
		);
		roleNotAllowed(
			'Channel member',
			removeChannelMembers(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed(
			'Channel owner',
			removeChannelMembers(ctx, ctx.channelOwner, allowed),
		);
		roleNotAllowed(ctx.user.role, removeChannelMembers(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			removeChannelMembers(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Update channel', function () {
		roleAllowed(ctx.adminUser.role, updateChannel(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, updateChannel(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			updateChannel(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Channel owner', updateChannel(ctx, ctx.channelOwner, allowed));
		roleNotAllowed(ctx.user.role, updateChannel(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, updateChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Create message', function () {
		roleAllowed(
			ctx.adminUser.role,
			createMessage(ctx, ctx.adminUser, simpleMessage, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			createMessage(ctx, ctx.moderator, simpleMessage, allowed),
		);
		roleAllowed(
			'Channel member',
			createMessage(ctx, ctx.channelMember, simpleMessage, allowed),
		);
		roleAllowed(
			'Channel owner',
			createMessage(ctx, ctx.channelOwner, simpleMessage, allowed),
		);
		roleNotAllowed(
			ctx.user.role,
			createMessage(ctx, ctx.user, simpleMessage, notAllowed),
		);
		roleNotAllowed(
			ctx.guestUser.role,
			createMessage(ctx, ctx.guestUser, simpleMessage, notAllowed),
		);
	});

	describe('Use frozen channel', function () {
		before(async () => {
			const channel = ctx.authClient.channel(ctx.channelType, ctx.channelId, {});
			await channel.update({ frozen: true });
			await removeUseFrozenChannelPermissions(ctx);
		});

		after(async () => {
			const channel = ctx.authClient.channel(ctx.channelType, ctx.channelId, {});
			await channel.update({ frozen: false });
			await removeUseFrozenChannelPermissions(ctx);
		});

		it("admins can't send messages to a frozen channel", async () => {
			await createMessageFrozen(ctx, ctx.adminUser, true);
		});

		it("admins can't create / delete reply to messages in a frozen channel", async () => {
			await createDeleteReactionFrozen(ctx, ctx.adminUser, true);
		});

		describe('after admins get the UseFrozenChannelPermission', () => {
			before(async () => {
				await addUseFrozenChannelPermissions(ctx);
			});

			it('admins can create a message', async () => {
				await createMessageFrozen(ctx, ctx.adminUser, false);
			});

			it('admins can create / delete reactions', async () => {
				await createDeleteReactionFrozen(ctx, ctx.adminUser, false);
			});
		});
	});

	describe('Delete message', function () {
		roleAllowed(ctx.adminUser.role, deleteMessage(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, deleteMessage(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			deleteMessage(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', deleteMessage(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, deleteMessage(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, deleteMessage(ctx, ctx.guestUser, notAllowed));
	});

	describe('Update message', function () {
		roleAllowed(ctx.adminUser.role, updateMessage(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, updateMessage(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			updateMessage(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', updateMessage(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, updateMessage(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, updateMessage(ctx, ctx.guestUser, notAllowed));
	});

	describe('Ban user', function () {
		roleAllowed(ctx.adminUser.role, banUser(ctx, ctx.adminUser, notAllowed));
		roleAllowed(ctx.moderator.role, banUser(ctx, ctx.moderator, notAllowed));
		roleNotAllowed('Channel member', banUser(ctx, ctx.channelMember, notAllowed));
		roleNotAllowed(ctx.user.role, banUser(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, banUser(ctx, ctx.guestUser, notAllowed));
	});

	describe('Edit user role', function () {
		roleNotAllowed(ctx.adminUser.role, changeRole(ctx, ctx.adminUser, notAllowed));
		roleNotAllowed(ctx.moderator.role, changeRole(ctx, ctx.moderator, notAllowed));
		roleNotAllowed(ctx.user.role, changeRole(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, changeRole(ctx, ctx.guestUser, notAllowed));
	});

	describe('Edit channel member role', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			addChannelModerator(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			addChannelModerator(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			addChannelModerator(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, addChannelModerator(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			addChannelModerator(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Demote channel moderator', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			demoteChannelModerator(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			demoteChannelModerator(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			demoteChannelModerator(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, demoteChannelModerator(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			demoteChannelModerator(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Edit own user', function () {
		roleAllowed(ctx.adminUser.role, changeOwnUser(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, changeOwnUser(ctx, ctx.moderator, allowed));
		roleAllowed(ctx.user.role, changeOwnUser(ctx, ctx.user, allowed));
		roleAllowed(ctx.guestUser.role, changeOwnUser(ctx, ctx.guestUser, allowed));
	});

	describe('Edit another user', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			changeOtherUser(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			changeOtherUser(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(ctx.user.role, changeOtherUser(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			changeOtherUser(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Upload attachment', function () {
		roleAllowed(ctx.adminUser.role, upload(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, upload(ctx, ctx.moderator, allowed));
		roleAllowed('Channel member', upload(ctx, ctx.channelMember, allowed));
		roleNotAllowed(ctx.user.role, upload(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, upload(ctx, ctx.guestUser, notAllowed));
	});

	describe('Delete attachment', function () {
		roleAllowed(ctx.adminUser.role, deleteUpload(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, deleteUpload(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			deleteUpload(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', deleteUpload(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, deleteUpload(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, deleteUpload(ctx, ctx.guestUser, notAllowed));
	});

	describe('Use commands', function () {});

	describe('Add links', function () {
		roleAllowed(
			ctx.adminUser.role,
			createMessage(ctx, ctx.adminUser, messageWithLink, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			createMessage(ctx, ctx.moderator, messageWithLink, allowed),
		);
		roleAllowed(
			'Channel member',
			createMessage(ctx, ctx.channelMember, messageWithLink, allowed),
		);
		roleAllowed(
			'Channel owner',
			createMessage(ctx, ctx.channelOwner, messageWithLink, allowed),
		);
		roleNotAllowed(
			ctx.user.role,
			createMessage(ctx, ctx.user, messageWithLink, notAllowed),
		);
		roleNotAllowed(
			ctx.guestUser.role,
			createMessage(ctx, ctx.guestUser, messageWithLink, notAllowed),
		);
	});
});

describe('Live stream', function () {
	const ctx = new Context('livestream');

	before(async () => {
		await ctx.setup();
	});

	describe('Create channel', function () {
		roleAllowed(ctx.adminUser.role, createChannel(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, createChannel(ctx, ctx.moderator, allowed));
		roleAllowed(ctx.user.role, createChannel(ctx, ctx.user, allowed));
		roleNotAllowed(ctx.guestUser.role, createChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Read channel', function () {
		roleAllowed(ctx.adminUser.role, readChannel(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, readChannel(ctx, ctx.moderator, allowed));
		roleAllowed('Channel member', readChannel(ctx, ctx.channelMember, allowed));
		roleAllowed('Channel owner', readChannel(ctx, ctx.channelOwner, allowed));
		roleAllowed(ctx.user.role, readChannel(ctx, ctx.user, allowed));
		roleAllowed(ctx.guestUser.role, readChannel(ctx, ctx.guestUser, allowed));
	});

	describe('Add channel members', function () {
		roleAllowed(ctx.adminUser.role, addChannelMembers(ctx, ctx.adminUser, allowed));
		roleNotAllowed(
			ctx.moderator.role,
			addChannelMembers(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel member',
			addChannelMembers(ctx, ctx.channelMember, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			addChannelMembers(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, addChannelMembers(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			addChannelMembers(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Remove channel members', function () {
		roleAllowed(
			ctx.adminUser.role,
			removeChannelMembers(ctx, ctx.adminUser, allowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			removeChannelMembers(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel member',
			removeChannelMembers(ctx, ctx.channelMember, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			removeChannelMembers(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, removeChannelMembers(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			removeChannelMembers(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Update channel', function () {
		roleAllowed(ctx.adminUser.role, updateChannel(ctx, ctx.adminUser, allowed));
		roleNotAllowed(ctx.moderator.role, updateChannel(ctx, ctx.moderator, notAllowed));
		roleNotAllowed(
			'Channel member',
			updateChannel(ctx, ctx.channelMember, notAllowed),
		);
		roleNotAllowed('Channel owner', updateChannel(ctx, ctx.channelOwner, notAllowed));
		roleNotAllowed(ctx.user.role, updateChannel(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, updateChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Create message', function () {
		roleAllowed(
			ctx.adminUser.role,
			createMessage(ctx, ctx.adminUser, simpleMessage, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			createMessage(ctx, ctx.moderator, simpleMessage, allowed),
		);
		roleAllowed(
			'Channel member',
			createMessage(ctx, ctx.channelMember, simpleMessage, allowed),
		);
		roleAllowed(
			'Channel owner',
			createMessage(ctx, ctx.channelOwner, simpleMessage, allowed),
		);
		roleAllowed(ctx.user.role, createMessage(ctx, ctx.user, simpleMessage, allowed));
		roleNotAllowed(
			ctx.guestUser.role,
			createMessage(ctx, ctx.guestUser, simpleMessage, notAllowed),
		);
	});

	describe('Use frozen channel', function () {
		before(async () => {
			const channel = ctx.authClient.channel(ctx.channelType, ctx.channelId, {});
			await channel.update({ frozen: true });
			await removeUseFrozenChannelPermissions(ctx);
		});

		after(async () => {
			const channel = ctx.authClient.channel(ctx.channelType, ctx.channelId, {});
			await channel.update({ frozen: false });
			await removeUseFrozenChannelPermissions(ctx);
		});

		it("admins can't send messages to a frozen channel", async () => {
			await createMessageFrozen(ctx, ctx.adminUser, true);
		});

		it("admins can't create / delete reply to messages in a frozen channel", async () => {
			await createDeleteReactionFrozen(ctx, ctx.adminUser, true);
		});

		describe('after admins get the UseFrozenChannelPermission', () => {
			before(async () => {
				await addUseFrozenChannelPermissions(ctx);
			});

			it('admins can create a message', async () => {
				await createMessageFrozen(ctx, ctx.adminUser, false);
			});

			it('admins can create / delete reactions', async () => {
				await createDeleteReactionFrozen(ctx, ctx.adminUser, false);
			});
		});
	});

	describe('Delete message', function () {
		roleAllowed(ctx.adminUser.role, deleteMessage(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, deleteMessage(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			deleteMessage(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', deleteMessage(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, deleteMessage(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, deleteMessage(ctx, ctx.guestUser, notAllowed));
	});

	describe('Update message', function () {
		roleAllowed(ctx.adminUser.role, updateMessage(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, updateMessage(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			updateMessage(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', updateMessage(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, updateMessage(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, updateMessage(ctx, ctx.guestUser, notAllowed));
	});

	describe('Ban user', function () {
		roleAllowed(ctx.adminUser.role, banUser(ctx, ctx.adminUser, notAllowed));
		roleAllowed(ctx.moderator.role, banUser(ctx, ctx.moderator, notAllowed));
		roleNotAllowed('Channel member', banUser(ctx, ctx.channelMember, notAllowed));
		roleNotAllowed(ctx.user.role, banUser(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, banUser(ctx, ctx.guestUser, notAllowed));
	});

	describe('Edit user role', function () {
		roleNotAllowed(ctx.adminUser.role, changeRole(ctx, ctx.adminUser, notAllowed));
		roleNotAllowed(ctx.moderator.role, changeRole(ctx, ctx.moderator, notAllowed));
		roleNotAllowed(ctx.user.role, changeRole(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, changeRole(ctx, ctx.guestUser, notAllowed));
	});

	describe('Edit channel member role', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			addChannelModerator(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			addChannelModerator(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			addChannelModerator(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, addChannelModerator(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			addChannelModerator(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Demote channel moderator', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			demoteChannelModerator(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			demoteChannelModerator(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			demoteChannelModerator(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, demoteChannelModerator(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			demoteChannelModerator(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Edit own user', function () {
		roleAllowed(ctx.adminUser.role, changeOwnUser(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, changeOwnUser(ctx, ctx.moderator, allowed));
		roleAllowed(ctx.user.role, changeOwnUser(ctx, ctx.user, allowed));
		roleAllowed(ctx.guestUser.role, changeOwnUser(ctx, ctx.guestUser, allowed));
	});

	describe('Edit another user', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			changeOtherUser(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			changeOtherUser(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(ctx.user.role, changeOtherUser(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			changeOtherUser(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Upload attachment', function () {
		roleAllowed(ctx.adminUser.role, upload(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, upload(ctx, ctx.moderator, allowed));
		roleAllowed('Channel member', upload(ctx, ctx.channelMember, allowed));
		roleAllowed(ctx.user.role, upload(ctx, ctx.user, allowed));
		roleNotAllowed(ctx.guestUser.role, upload(ctx, ctx.guestUser, notAllowed));
	});

	describe('Delete attachment', function () {});

	describe('Use commands', function () {});

	describe('Add links', function () {
		roleAllowed(
			ctx.adminUser.role,
			createMessage(ctx, ctx.adminUser, messageWithLink, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			createMessage(ctx, ctx.moderator, messageWithLink, allowed),
		);
		roleAllowed(
			'Channel member',
			createMessage(ctx, ctx.channelMember, messageWithLink, allowed),
		);
		roleAllowed(
			'Channel owner',
			createMessage(ctx, ctx.channelOwner, messageWithLink, allowed),
		);
		roleAllowed(
			ctx.user.role,
			createMessage(ctx, ctx.user, messageWithLink, allowed),
		);
		roleNotAllowed(
			ctx.guestUser.role,
			createMessage(ctx, ctx.guestUser, messageWithLink, notAllowed),
		);
	});
});

describe('Gaming', function () {
	const ctx = new Context('gaming');

	before(async () => {
		await ctx.setup();
	});

	describe('Create channel', function () {
		roleAllowed(ctx.adminUser.role, createChannel(ctx, ctx.adminUser, allowed));
		roleNotAllowed(ctx.moderator.role, createChannel(ctx, ctx.moderator, notAllowed));
		roleNotAllowed(ctx.user.role, createChannel(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, createChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Read channel', function () {
		roleAllowed(ctx.adminUser.role, readChannel(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, readChannel(ctx, ctx.moderator, allowed));
		roleAllowed('Channel member', readChannel(ctx, ctx.channelMember, allowed));
		roleAllowed('Channel owner', readChannel(ctx, ctx.channelOwner, allowed));
		roleNotAllowed(ctx.user.role, readChannel(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, readChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Add channel members', function () {
		roleAllowed(ctx.adminUser.role, addChannelMembers(ctx, ctx.adminUser, allowed));
		roleNotAllowed(
			ctx.moderator.role,
			addChannelMembers(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel member',
			addChannelMembers(ctx, ctx.channelMember, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			addChannelMembers(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, addChannelMembers(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			addChannelMembers(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Remove channel members', function () {
		roleAllowed(
			ctx.adminUser.role,
			removeChannelMembers(ctx, ctx.adminUser, allowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			removeChannelMembers(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel member',
			removeChannelMembers(ctx, ctx.channelMember, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			removeChannelMembers(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, removeChannelMembers(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			removeChannelMembers(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Update channel', function () {
		roleAllowed(ctx.adminUser.role, updateChannel(ctx, ctx.adminUser, allowed));
		roleNotAllowed(ctx.moderator.role, updateChannel(ctx, ctx.moderator, notAllowed));
		roleNotAllowed(
			'Channel member',
			updateChannel(ctx, ctx.channelMember, notAllowed),
		);
		roleNotAllowed('Channel owner', updateChannel(ctx, ctx.channelOwner, notAllowed));
		roleNotAllowed(ctx.user.role, updateChannel(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, updateChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Create message', function () {
		roleAllowed(
			ctx.adminUser.role,
			createMessage(ctx, ctx.adminUser, simpleMessage, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			createMessage(ctx, ctx.moderator, simpleMessage, allowed),
		);
		roleAllowed(
			'Channel member',
			createMessage(ctx, ctx.channelMember, simpleMessage, allowed),
		);
		roleAllowed(
			'Channel owner',
			createMessage(ctx, ctx.channelOwner, simpleMessage, allowed),
		);
		roleNotAllowed(
			ctx.user.role,
			createMessage(ctx, ctx.user, simpleMessage, notAllowed),
		);
		roleNotAllowed(
			ctx.guestUser.role,
			createMessage(ctx, ctx.guestUser, simpleMessage, notAllowed),
		);
	});

	describe('Use frozen channel', function () {
		before(async () => {
			const channel = ctx.authClient.channel(ctx.channelType, ctx.channelId, {});
			await channel.update({ frozen: true });
			await removeUseFrozenChannelPermissions(ctx);
		});

		after(async () => {
			const channel = ctx.authClient.channel(ctx.channelType, ctx.channelId, {});
			await channel.update({ frozen: false });
			await removeUseFrozenChannelPermissions(ctx);
		});

		it("admins can't send messages to a frozen channel", async () => {
			await createMessageFrozen(ctx, ctx.adminUser, true);
		});

		it("admins can't create / delete reply to messages in a frozen channel", async () => {
			await createDeleteReactionFrozen(ctx, ctx.adminUser, true);
		});

		describe('after admins get the UseFrozenChannelPermission', () => {
			before(async () => {
				await addUseFrozenChannelPermissions(ctx);
			});

			it('admins can create a message', async () => {
				await createMessageFrozen(ctx, ctx.adminUser, false);
			});

			it('admins can create / delete reactions', async () => {
				await createDeleteReactionFrozen(ctx, ctx.adminUser, false);
			});
		});
	});

	describe('Delete message', function () {
		roleAllowed(ctx.adminUser.role, deleteMessage(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, deleteMessage(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			deleteMessage(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', deleteMessage(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, deleteMessage(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, deleteMessage(ctx, ctx.guestUser, notAllowed));
	});

	describe('Update message', function () {
		roleAllowed(ctx.adminUser.role, updateMessage(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, updateMessage(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			updateMessage(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', updateMessage(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, updateMessage(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, updateMessage(ctx, ctx.guestUser, notAllowed));
	});

	describe('Ban user', function () {
		roleAllowed(ctx.adminUser.role, banUser(ctx, ctx.adminUser, notAllowed));
		roleAllowed(ctx.moderator.role, banUser(ctx, ctx.moderator, notAllowed));
		roleNotAllowed('Channel member', banUser(ctx, ctx.channelMember, notAllowed));
		roleNotAllowed(ctx.user.role, banUser(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, banUser(ctx, ctx.guestUser, notAllowed));
	});

	describe('Edit channel member role', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			addChannelModerator(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			addChannelModerator(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			addChannelModerator(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, addChannelModerator(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			addChannelModerator(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Demote channel moderator', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			demoteChannelModerator(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			demoteChannelModerator(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			demoteChannelModerator(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, demoteChannelModerator(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			demoteChannelModerator(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Edit user role', function () {
		roleNotAllowed(ctx.adminUser.role, changeRole(ctx, ctx.adminUser, notAllowed));
		roleNotAllowed(ctx.moderator.role, changeRole(ctx, ctx.moderator, notAllowed));
		roleNotAllowed(ctx.user.role, changeRole(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, changeRole(ctx, ctx.guestUser, notAllowed));
	});

	describe('Edit own user', function () {
		roleAllowed(ctx.adminUser.role, changeOwnUser(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, changeOwnUser(ctx, ctx.moderator, allowed));
		roleAllowed(ctx.user.role, changeOwnUser(ctx, ctx.user, allowed));
		roleAllowed(ctx.guestUser.role, changeOwnUser(ctx, ctx.guestUser, allowed));
	});

	describe('Edit another user', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			changeOtherUser(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			changeOtherUser(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(ctx.user.role, changeOtherUser(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			changeOtherUser(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Upload attachment', function () {
		roleAllowed(ctx.adminUser.role, upload(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, upload(ctx, ctx.moderator, allowed));
		roleAllowed('Channel member', upload(ctx, ctx.channelMember, allowed));
		roleNotAllowed(ctx.user.role, upload(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, upload(ctx, ctx.guestUser, notAllowed));
	});

	describe('Delete attachment', function () {});

	describe('Use commands', function () {});

	describe('Add links', function () {
		roleAllowed(
			ctx.adminUser.role,
			createMessage(ctx, ctx.adminUser, messageWithLink, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			createMessage(ctx, ctx.moderator, messageWithLink, allowed),
		);
		roleAllowed(
			'Channel member',
			createMessage(ctx, ctx.channelMember, messageWithLink, allowed),
		);
		roleAllowed(
			'Channel owner',
			createMessage(ctx, ctx.channelOwner, messageWithLink, allowed),
		);
		roleNotAllowed(
			ctx.user.role,
			createMessage(ctx, ctx.user, messageWithLink, notAllowed),
		);
		roleNotAllowed(
			ctx.guestUser.role,
			createMessage(ctx, ctx.guestUser, messageWithLink, notAllowed),
		);
	});
});

describe('Commerce permissions', function () {
	const ctx = new Context('commerce');

	before(async () => {
		await ctx.setup();
	});

	describe('Create channel', function () {
		roleAllowed(ctx.adminUser.role, createChannel(ctx, ctx.adminUser, allowed));
		roleNotAllowed(ctx.moderator.role, createChannel(ctx, ctx.moderator, notAllowed));
		roleNotAllowed(ctx.user.role, createChannel(ctx, ctx.user, notAllowed));
		roleAllowed(ctx.guestUser.role, createChannel(ctx, ctx.guestUser, allowed));
	});

	describe('Read channel', function () {
		roleAllowed(ctx.adminUser.role, readChannel(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, readChannel(ctx, ctx.moderator, allowed));
		roleAllowed('Channel member', readChannel(ctx, ctx.channelMember, allowed));
		roleAllowed('Channel owner', readChannel(ctx, ctx.channelOwner, allowed));
		roleNotAllowed(ctx.user.role, readChannel(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, readChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Add channel members', function () {
		roleAllowed(ctx.adminUser.role, addChannelMembers(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, addChannelMembers(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			addChannelMembers(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Channel owner', addChannelMembers(ctx, ctx.channelOwner, allowed));
		roleNotAllowed(ctx.user.role, addChannelMembers(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			addChannelMembers(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Remove channel members', function () {
		roleAllowed(
			ctx.adminUser.role,
			removeChannelMembers(ctx, ctx.adminUser, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			removeChannelMembers(ctx, ctx.moderator, allowed),
		);
		roleNotAllowed(
			'Channel member',
			removeChannelMembers(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed(
			'Channel owner',
			removeChannelMembers(ctx, ctx.channelOwner, allowed),
		);
		roleNotAllowed(ctx.user.role, removeChannelMembers(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			removeChannelMembers(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Update channel', function () {
		roleAllowed(ctx.adminUser.role, updateChannel(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, updateChannel(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			updateChannel(ctx, ctx.channelMember, notAllowed),
		);
		roleNotAllowed('Channel owner', updateChannel(ctx, ctx.channelOwner, notAllowed));
		roleNotAllowed(ctx.user.role, updateChannel(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, updateChannel(ctx, ctx.guestUser, notAllowed));
	});

	describe('Create message', function () {
		roleAllowed(
			ctx.adminUser.role,
			createMessage(ctx, ctx.adminUser, simpleMessage, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			createMessage(ctx, ctx.moderator, simpleMessage, allowed),
		);
		roleAllowed(
			'Channel member',
			createMessage(ctx, ctx.channelMember, simpleMessage, allowed),
		);
		roleAllowed(
			'Channel owner',
			createMessage(ctx, ctx.channelOwner, simpleMessage, allowed),
		);
		roleNotAllowed(
			ctx.user.role,
			createMessage(ctx, ctx.user, simpleMessage, notAllowed),
		);
		roleNotAllowed(
			ctx.guestUser.role,
			createMessage(ctx, ctx.guestUser, simpleMessage, notAllowed),
		);
	});

	describe('Use frozen channel', function () {
		before(async () => {
			const channel = ctx.authClient.channel(ctx.channelType, ctx.channelId, {});
			await channel.update({ frozen: true });
			await removeUseFrozenChannelPermissions(ctx);
		});

		after(async () => {
			const channel = ctx.authClient.channel(ctx.channelType, ctx.channelId, {});
			await channel.update({ frozen: false });
			await removeUseFrozenChannelPermissions(ctx);
		});

		it("admins can't send messages to a frozen channel", async () => {
			await createMessageFrozen(ctx, ctx.adminUser, true);
		});

		it("admins can't create / delete reply to messages in a frozen channel", async () => {
			await createDeleteReactionFrozen(ctx, ctx.adminUser, true);
		});

		describe('after admins get the UseFrozenChannelPermission', () => {
			before(async () => {
				await addUseFrozenChannelPermissions(ctx);
			});

			it('admins can create a message', async () => {
				await createMessageFrozen(ctx, ctx.adminUser, false);
			});

			it('admins can create / delete reactions', async () => {
				await createDeleteReactionFrozen(ctx, ctx.adminUser, false);
			});
		});
	});

	describe('Delete message', function () {
		roleAllowed(ctx.adminUser.role, deleteMessage(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, deleteMessage(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			deleteMessage(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', deleteMessage(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, deleteMessage(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, deleteMessage(ctx, ctx.guestUser, notAllowed));
	});

	describe('Update message', function () {
		roleAllowed(ctx.adminUser.role, updateMessage(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, updateMessage(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			updateMessage(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', updateMessage(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, updateMessage(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, updateMessage(ctx, ctx.guestUser, notAllowed));
	});

	describe('Ban user', function () {
		roleAllowed(ctx.adminUser.role, banUser(ctx, ctx.adminUser, notAllowed));
		roleAllowed(ctx.moderator.role, banUser(ctx, ctx.moderator, notAllowed));
		roleNotAllowed('Channel member', banUser(ctx, ctx.channelMember, notAllowed));
		roleNotAllowed(ctx.user.role, banUser(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, banUser(ctx, ctx.guestUser, notAllowed));
	});

	describe('Edit user role', function () {
		roleNotAllowed(ctx.adminUser.role, changeRole(ctx, ctx.adminUser, notAllowed));
		roleNotAllowed(ctx.moderator.role, changeRole(ctx, ctx.moderator, notAllowed));
		roleNotAllowed(ctx.user.role, changeRole(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, changeRole(ctx, ctx.guestUser, notAllowed));
	});

	describe('Edit channel member role', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			addChannelModerator(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			addChannelModerator(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			addChannelModerator(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, addChannelModerator(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			addChannelModerator(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Demote channel moderator', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			demoteChannelModerator(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			demoteChannelModerator(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(
			'Channel owner',
			demoteChannelModerator(ctx, ctx.channelOwner, notAllowed),
		);
		roleNotAllowed(ctx.user.role, demoteChannelModerator(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			demoteChannelModerator(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Edit own user', function () {
		roleAllowed(ctx.adminUser.role, changeOwnUser(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, changeOwnUser(ctx, ctx.moderator, allowed));
		roleAllowed(ctx.user.role, changeOwnUser(ctx, ctx.user, allowed));
		roleAllowed(ctx.guestUser.role, changeOwnUser(ctx, ctx.guestUser, allowed));
	});

	describe('Edit another user', function () {
		roleNotAllowed(
			ctx.adminUser.role,
			changeOtherUser(ctx, ctx.adminUser, notAllowed),
		);
		roleNotAllowed(
			ctx.moderator.role,
			changeOtherUser(ctx, ctx.moderator, notAllowed),
		);
		roleNotAllowed(ctx.user.role, changeOtherUser(ctx, ctx.user, notAllowed));
		roleNotAllowed(
			ctx.guestUser.role,
			changeOtherUser(ctx, ctx.guestUser, notAllowed),
		);
	});

	describe('Upload attachment', function () {
		roleAllowed(ctx.adminUser.role, upload(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, upload(ctx, ctx.moderator, allowed));
		roleAllowed('Channel member', upload(ctx, ctx.channelMember, allowed));
		roleNotAllowed(ctx.user.role, upload(ctx, ctx.user, notAllowed));
		roleAllowed(ctx.guestUser.role, upload(ctx, ctx.guestUser, allowed));
	});

	describe('Delete attachment', function () {
		roleAllowed(ctx.adminUser.role, deleteUpload(ctx, ctx.adminUser, allowed));
		roleAllowed(ctx.moderator.role, deleteUpload(ctx, ctx.moderator, allowed));
		roleNotAllowed(
			'Channel member',
			deleteUpload(ctx, ctx.channelMember, notAllowed),
		);
		roleAllowed('Message owner', deleteUpload(ctx, ctx.messageOwner, allowed));
		roleNotAllowed(ctx.user.role, deleteUpload(ctx, ctx.user, notAllowed));
		roleNotAllowed(ctx.guestUser.role, deleteUpload(ctx, ctx.guestUser, notAllowed));
	});

	describe('Use commands', function () {});

	describe('Add links', function () {
		roleAllowed(
			ctx.adminUser.role,
			createMessage(ctx, ctx.adminUser, messageWithLink, allowed),
		);
		roleAllowed(
			ctx.moderator.role,
			createMessage(ctx, ctx.moderator, messageWithLink, allowed),
		);
		roleAllowed(
			'Channel member',
			createMessage(ctx, ctx.channelMember, messageWithLink, allowed),
		);
		roleAllowed(
			'Channel owner',
			createMessage(ctx, ctx.channelOwner, messageWithLink, allowed),
		);
		roleNotAllowed(
			ctx.user.role,
			createMessage(ctx, ctx.user, messageWithLink, notAllowed),
		);
		roleNotAllowed(
			ctx.guestUser.role,
			createMessage(ctx, ctx.guestUser, messageWithLink, notAllowed),
		);
	});
});

describe('Team', function () {});
