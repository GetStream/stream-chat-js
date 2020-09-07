// Its a simple node script which uses our js client to make various API calls.
// The responses received from those calls are written to a typescript file and compared against there corresponding
// APIResponse types, specified in declaration file - types/stream-chat/index.d.ts
const fs = require('fs');
const rg = require('./response-generators/index');

let countExecutables = 0;

const executables = [
	{
		f: rg.acceptInvite,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string; image?: string }, {}, {}, {}, { song?: string }>['acceptInvite']>>",
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
		f: rg.addMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['addMembers']>>",
	},
	{
		f: rg.addModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['addModerators']>>",
	},
	{
		f: rg.banUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['banUser']>>",
	},
	{
		f: rg.channelSearch,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['search']>>",
	},
	{
		f: rg.connect,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['connect']>>",
	},
	{
		f: rg.create,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['create']>>",
	},
	// createChannelType has a limit. So only run this when needed.
	// {
	// 	f: rg.createChannelType,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['createChannelType']>>",
	// },
	{
		f: rg.createCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' >['createCommand']>>",
	},
	{
		f: rg.createPermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['createPermission']>>",
	},
	{
		f: rg.deactivateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deactivateUser']>>",
	},
	{
		f: rg.deleteChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['delete']>>",
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
		f: rg.deleteCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' >['deleteCommand']>>",
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
		f: rg.deleteMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deleteMessage']>>",
	},
	{
		f: rg.deletePermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deletePermission']>>",
	},
	{
		f: rg.deleteReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['deleteReaction']>>",
	},
	{
		f: rg.deleteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deleteUser']>>",
	},
	{
		f: rg.demoteModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['demoteModerators']>>",
	},
	{
		f: rg.disconnect,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['disconnect']>>",
	},
	{
		f: rg.exportUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['exportUser']>>",
	},
	{
		f: rg.flagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { image: string, status: string }, {}, {}, {}, {}>['flagMessage']>>",
	},
	{
		f: rg.flagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { image: string, status: string }, {}, {}, {}, {}>['flagUser']>>",
	},
	{
		f: rg.getAppSettings,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['getAppSettings']>>",
	},
	{
		f: rg.getChannelType,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['getChannelType']>>",
	},
	{
		f: rg.getCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' >['getCommand']>>",
	},
	{
		f: rg.getConfig,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['getConfig']>>",
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
		f: rg.getPermission,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['getPermission']>>",
	},
	{
		f: rg.getReactions,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['getReactions']>>",
	},
	{
		f: rg.getReplies,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ description?: string }, {}, {}, {}, {}, { instrument?: string }>['getReplies']>>",
	},
	{
		f: rg.hide,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['hide']>>",
	},
	{
		f: rg.inviteMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['inviteMembers']>>",
	},
	{
		f: rg.keystroke,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['keystroke']>>",
	},
	{
		f: rg.lastMessage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Omit<ReturnType<ImmutableObject<Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['lastMessage']>>>['asMutable']>, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }",
	},
	{
		f: rg.listChannelTypes,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['listChannelTypes']>>",
	},
	{
		f: rg.listCommands,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' >['listCommands']>>",
	},
	{
		f: rg.listPermissions,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['listPermissions']>>",
	},
	{
		f: rg.markAllRead,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['markAllRead']>>",
	},
	{
		f: rg.markRead,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['markRead']>>",
	},
	{
		f: rg.mute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['mute']>>",
	},
	{
		f: rg.muteStatus,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['muteStatus']>>",
	},
	{
		f: rg.muteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['muteUser']>>",
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
		f: rg.query,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['query']>>",
	},
	{
		f: rg.queryMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['queryMembers']>>",
	},
	{
		f: rg.queryUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { nickname?: string }, {}, {}, {}, {}>['queryUsers']>>",
	},
	{
		f: rg.reactivateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['reactivateUser']>>",
	},
	{
		f: rg.rejectInvite,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string; image?: string }, {}, {}, {}, { song?: string }>['rejectInvite']>>",
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
		f: rg.sendMessage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['sendMessage']>>",
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
		f: rg.setUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['setUser']>>",
	},
	{
		f: rg.show,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['show']>>",
	},
	{
		f: rg.stopTyping,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['stopTyping']>>",
	},
	{
		f: rg.stopWatching,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['stopWatching']>>",
	},
	{
		f: rg.sync,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ description?: string }, {}, {}, {}, {}, {}>['sync']>>",
	},
	// Need translation on the account to run this test
	// {
	// 	f: rg.translateMessage,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['translateMessage']>>",
	// },
	{
		f: rg.truncateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['truncate']>>",
	},
	{
		f: rg.unbanUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['unbanUser']>>",
	},
	{
		f: rg.unflagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { image: string, status: string }, {}, {}, {}, {}>['unflagMessage']>>",
	},
	{
		f: rg.unflagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { image: string, status: string }, {}, {}, {}, {}>['unflagUser']>>",
	},
	{
		f: rg.unmute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['unmute']>>",
	},
	{
		f: rg.unmuteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['unmuteUser']>>",
	},
	{
		f: rg.updateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ description?: string }, { description?: string }, {}, {}, {}, {}>['update']>>",
	},
	{
		f: rg.updateChannelType,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['updateChannelType']>>",
	},
	{
		f: rg.updateCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' >['updateCommand']>>",
	},
	{
		f: rg.updateMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['updateMessage']>>",
	},
	{
		f: rg.updatePermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['updatePermission']>>",
	},
	{
		f: rg.updateUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { unique: string }, {}, {}, {}, {}>['updateUsers']>>",
	},
	{
		f: rg.upsertUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { nickname: string }, {}, {}, {}, {}>['upsertUser']>>",
	},
	{
		f: rg.watch,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, {}, {}, {}, {}>['watch']>>",
	},

	// Currently roles do not return
	// {
	// 	f: rg.createRole,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['createRole']>>",
	// },
	// {
	// 	f: rg.deleteRole,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['deleteRole']>>",
	// },
	// {
	// 	f: rg.listRoles,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, {}, {}, {}, {}>['listRoles']>>",
	// },
];

let tsFileName;
const run = async () => {
	let imports = '';
	const types = [];

	executables.forEach(i => {
		if (i.imports) {
			types.push(...i.imports);
		} else {
			types.push(i.type);
		}
	});
	const uniqueTypes = types.filter(
		(value, index, self) => self.indexOf(value) === index,
	);
	imports = uniqueTypes.join(', ');

	imports = `import { ImmutableObject } from 'seamless-immutable';\n\nimport { ${imports} } from '..';`;
	tsFileName = `${__dirname}/data.ts`;
	fs.writeFile(tsFileName, `${imports} \n\n`, function(err) {
		if (err) {
			return console.log(err);
		}

		console.log('✅ Imports statement set!');
	});

	for (let i = 0; i < executables.length; i++) {
		const executable = executables[i];
		await executeAndWrite(executable.f, executable.name, executable.type);
	}
};

const executeAndWrite = async (func, name, type) => {
	try {
		const response = await func();
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

		return;
	} catch (error) {
		console.log(`${func.name} failed with error: `, error);
	}
};

function checkIfComplete() {
	if (countExecutables === executables.length) {
		console.log();
		process.exit();
	}
}

run();
