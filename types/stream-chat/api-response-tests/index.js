// Its a simple node script which uses our js client to make various API calls.
// The responses received from those calls are written to a typescript file and compared against there corresponding
// APIResponse types, specified in declaration file - types/stream-chat/index.d.ts
const fs = require('fs');
const rg = require('./response-generators/index');

let countExecutables = 0;

const executables = [
	{
		f: rg.setUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['setUser']>>",
	},
	{
		f: rg.channelSearch,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['search']>>",
	}, // TODO: REPLY EMPTY????
	{
		f: rg.updateUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { unique: string }, {}, {}, {}, {}>['updateUsers']>>",
	},
	{
		f: rg.partialUpdateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { gender: string; unique: string }, {}, {}, {}, {}>['partialUpdateUser']>>",
	},
	{
		f: rg.partialUpdateUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { gender: string; unique: string; work?: string }, {}, {}, {}, {}>['partialUpdateUsers']>>",
	},
	{
		f: rg.banUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['banUser']>>",
	},
	{
		f: rg.deleteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deleteUser']>>",
	},
	{
		f: rg.reactivateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['reactivateUser']>>",
	},
	{
		f: rg.deactivateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deactivateUser']>>",
	},
	{
		f: rg.exportUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['exportUser']>>",
	},
	{
		f: rg.unbanUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['unbanUser']>>",
	},
	{
		f: rg.muteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['muteUser']>>",
	},
	{
		f: rg.unmuteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['unmuteUser']>>",
	},
	{
		f: rg.flagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { image: string, status: string }, {}, {}, {}, {}>['flagUser']>>",
	},
	{
		f: rg.unflagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { image: string, status: string }, {}, {}, {}, {}>['unflagUser']>>",
	},
	{
		f: rg.flagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { image: string, status: string }, {}, {}, {}, {}>['flagMessage']>>",
	},
	{
		f: rg.unflagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { image: string, status: string }, {}, {}, {}, {}>['unflagMessage']>>",
	},
	// createChannelType has a limit. So only run this when needed.
	// {
	// 	f: rg.createChannelType,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['createChannelType']>>",
	// },
	{
		f: rg.getChannelType,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['getChannelType']>>",
	},
	{
		f: rg.listChannelTypes,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['listChannelTypes']>>",
	},
	// TODO: Fix the error which results from deleteChannelType api call:
	// `deleteChannelType failed with error:  { Error: StreamChat error code 16: DeleteChannelType failed with error: "bc0b09df-2cfd-4e80-93e7-1f0091e6a435 is not a defined channel type"`
	// because of which build failure occurs.
	// {
	// 	f: rg.deleteChannelType,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['deleteChannelType']>>",
	// },
	{
		f: rg.sendMessage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['sendMessage']>>",
	},
	{
		f: rg.updateMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['updateMessage']>>",
	},
	{
		f: rg.deleteMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deleteMessage']>>",
	},
	{
		f: rg.getMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['getMessage']>>",
	},
	{
		f: rg.getMessagesById,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['getMessagesById']>>",
	},
	{
		f: rg.sendMessageReadEvent,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['sendEvent']>>",
	},
	{
		f: rg.sendReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['sendReaction']>>",
	},
	{
		f: rg.deleteReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['deleteReaction']>>",
	},
	{
		f: rg.getReactions,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['getReactions']>>",
	},
	{
		f: rg.updateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ description?: string }, { description?: string }, {}, {}, {}, {}>['update']>>",
	},
	{
		f: rg.deleteChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['delete']>>",
	},
	{
		f: rg.truncateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['truncate']>>",
	},
	{
		f: rg.acceptInvite,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string; image?: string }, {}, {}, {}, {}>['acceptInvite']>>",
	},
	{
		f: rg.rejectInvite,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string; image?: string }, {}, {}, {}, {}>['rejectInvite']>>",
	},
	{
		f: rg.addMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['addMembers']>>",
	},
	{
		f: rg.removeMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['removeMembers']>>",
	},
	{
		f: rg.sendAction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['sendAction']>>",
	},
	{
		f: rg.keystroke,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['keystroke']>>",
	},
	{
		f: rg.stopTyping,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['stopTyping']>>",
	},
	{
		f: rg.markRead,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['markRead']>>",
	},
	{
		f: rg.query,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['query']>>",
	},
	{
		f: rg.watch,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['watch']>>",
	},
	{
		f: rg.create,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['create']>>",
	},
	{
		f: rg.stopWatching,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['stopWatching']>>",
	},
	{
		f: rg.getReplies,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ description?: string }, {}, {}, {}, {}, { instrument?: string }>['getReplies']>>",
	},
	{
		f: rg.getAppSettings,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['getAppSettings']>>",
	},
	{
		f: rg.setAnonymousUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['setAnonymousUser']>>",
	},
	{
		f: rg.setGuestUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['setGuestUser']>>",
	},
	{
		f: rg.sendFile,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['sendFile']>>",
	},
	{
		f: rg.sendImage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['sendImage']>>",
	},
	{
		f: rg.connect,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['connect']>>",
	},
	{
		f: rg.disconnect,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['disconnect']>>",
	},
	{
		f: rg.queryUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { nickname?: string }, {}, {}, {}, {}>['queryUsers']>>",
	},
	{
		f: rg.addDevice,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['addDevice']>>",
	},
	{
		f: rg.getDevices,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['getDevices']>>",
	},
	{
		f: rg.upsertUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { nickname: string }, {}, {}, {}, {}>['upsertUser']>>",
	},
	{
		f: rg.markAllRead,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['markAllRead']>>",
	},
	{
		f: rg.updateChannelType,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['updateChannelType']>>",
	},
	// Need translation on the account to run this test
	// {
	// 	f: rg.translateMessage,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['translateMessage']>>",
	// },
	{
		f: rg.createPermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['createPermission']>>",
	},
	{
		f: rg.getPermission,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['getPermission']>>",
	},
	{
		f: rg.updatePermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['updatePermission']>>",
	},
	{
		f: rg.deletePermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deletePermission']>>",
	},
	{
		f: rg.listPermissions,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['listPermissions']>>",
	},
	// Currently roles do not return
	// {
	// 	f: rg.createRole,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['createRole']>>",
	// },
	// {
	// 	f: rg.listRoles,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['listRoles']>>",
	// },
	// {
	// 	f: rg.deleteRole,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deleteRole']>>",
	// },
	{
		f: rg.sync,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['sync']>>",
	},
	{
		f: rg.getConfig,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['getConfig']>>",
	},
	{
		f: rg.inviteMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['inviteMembers']>>",
	},
	{
		f: rg.deleteFile,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['deleteFile']>>",
	},
	{
		f: rg.deleteImage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['deleteImage']>>",
	},
	{
		f: rg.queryMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['queryMembers']>>",
	},
	{
		f: rg.addModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['addModerators']>>",
	},
	{
		f: rg.demoteModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['demoteModerators']>>",
	},
	{
		f: rg.mute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['mute']>>",
	},
	{
		f: rg.unmute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['unmute']>>",
	},
	{
		f: rg.lastMessage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Omit<ReturnType<Immutable<Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['lastMessage']>>['asMutable']>>, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }",
	},
	{
		f: rg.muteStatus,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['muteStatus']>>",
	},
	{
		f: rg.hide,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['hide']>>",
	},
	{
		f: rg.show,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['show']>>",
	},
];

let imports = '';
const types = [];

executables.forEach(i => {
	if (i.imports) {
		types.push(...i.imports);
	} else {
		types.push(i.type);
	}
});
const uniqueTypes = types.filter((value, index, self) => self.indexOf(value) === index);
imports = uniqueTypes.join(', ');

imports = `import { Immutable } from 'seamless-immutable';\n\nimport { ${imports} } from '../../src/index';`;
const tsFileName = `${__dirname}/data.ts`;
fs.writeFile(tsFileName, `${imports} \n\n`, function(err) {
	if (err) {
		return console.log(err);
	}

	console.log('✅ Imports statement set!');
});

executables.forEach(i => {
	executeAndWrite(i.f, i.name, i.type);
});

function executeAndWrite(func, name, type) {
	func().then(
		response => {
			fs.appendFile(
				tsFileName,
				`export const ${func.name}Response: ${type} = ${JSON.stringify(
					response,
				)}; \n`,
				function(err) {
					if (err) {
						return console.log(err);
					}

					console.log(`✅ ${func.name}`);
					countExecutables++;
					checkIfComplete();
				},
			);
		},
		error => {
			console.log(`${func.name} failed with error: `, error);
		},
	);
}

function checkIfComplete() {
	if (countExecutables === executables.length) {
		console.log();
		process.exit();
	}
}
