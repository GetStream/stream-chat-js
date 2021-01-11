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
			"Unpacked<ReturnType<Channel<{}, { description?: string; image?: string }, string & {}, {}, {}, {}, { song?: string }>['acceptInvite']>>",
	},
	{
		f: rg.addDevice,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['addDevice']>>",
	},
	{
		f: rg.getDevices,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['getDevices']>>",
	},
	{
		f: rg.addMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['addMembers']>>",
	},
	{
		f: rg.addModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['addModerators']>>",
	},
	{
		f: rg.banUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['banUser']>>",
	},
	{
		f: rg.shadowBan,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['shadowBan']>>",
	},
	{
		f: rg.channelSearch,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['search']>>",
	},
	{
		f: rg.connect,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['connect']>>",
	},
	{
		f: rg.create,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['create']>>",
	},
	{
		f: rg.createBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { description?: string }, string & {}, {}, {}, {}, {}>['createBlockList']>>",
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
			"Unpacked<ReturnType<StreamChat<{}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | '', {}, {}, {}, {} >['createCommand']>>",
	},
	{
		f: rg.createPermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['createPermission']>>",
	},
	{
		f: rg.deactivateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['deactivateUser']>>",
	},
	{
		f: rg.deleteBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { description?: string }, string & {}, {}, {}, {}, {}>['deleteBlockList']>>",
	},
	{
		f: rg.deleteChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['delete']>>",
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
			"Unpacked<ReturnType<StreamChat<{}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | '', {}, {}, {}, {}>['deleteCommand']>>",
	},
	{
		f: rg.deleteFile,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['deleteFile']>>",
	},
	{
		f: rg.deleteImage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['deleteImage']>>",
	},
	{
		f: rg.deleteMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['deleteMessage']>>",
	},
	{
		f: rg.deletePermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['deletePermission']>>",
	},
	{
		f: rg.deleteReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['deleteReaction']>>",
	},
	{
		f: rg.deleteUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['deleteUser']>>",
	},
	{
		f: rg.demoteModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['demoteModerators']>>",
	},
	{
		f: rg.disconnect,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['disconnect']>>",
	},
	{
		f: rg.exportUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['exportUser']>>",
	},
	{
		f: rg.flagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { image: string, status: string }>['flagMessage']>>",
	},
	{
		f: rg.flagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { image: string, status: string }>['flagUser']>>",
	},
	{
		f: rg.getAppSettings,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['getAppSettings']>>",
	},
	{
		f: rg.getBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['getBlockList']>>",
	},
	{
		f: rg.getChannelType,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['getChannelType']>>",
	},
	{
		f: rg.getCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | '', {}, {}, {}, {}>['getCommand']>>",
	},
	{
		f: rg.getConfig,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['getConfig']>>",
	},
	{
		f: rg.getMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['getMessage']>>",
	},
	{
		f: rg.getMessagesById,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['getMessagesById']>>",
	},
	{
		f: rg.getMessageWithReply,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { testString?: string }>['getMessage']>>",
	},
	{
		f: rg.getPermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['getPermission']>>",
	},
	{
		f: rg.getReactions,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['getReactions']>>",
	},
	{
		f: rg.getReplies,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ description?: string }, {}, string & {}, {}, {}, {}, { instrument?: string }>['getReplies']>>",
	},
	{
		f: rg.hide,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['hide']>>",
	},
	{
		f: rg.inviteMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['inviteMembers']>>",
	},
	{
		f: rg.keystroke,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['keystroke']>>",
	},
	{
		f: rg.lastMessage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Omit<ReturnType<ImmutableObject<Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['lastMessage']>>>['asMutable']>, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }",
	},
	{
		f: rg.listBlockLists,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['listBlockLists']>>",
	},
	{
		f: rg.listChannelTypes,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['listChannelTypes']>>",
	},
	{
		f: rg.listCommands,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | '', {}, {}, {}, {}>['listCommands']>>",
	},
	{
		f: rg.listPermissions,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['listPermissions']>>",
	},
	{
		f: rg.markAllRead,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['markAllRead']>>",
	},
	{
		f: rg.markRead,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['markRead']>>",
	},
	{
		f: rg.mute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['mute']>>",
	},
	{
		f: rg.muteStatus,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['muteStatus']>>",
	},
	{
		f: rg.muteUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['muteUser']>>",
	},
	{
		f: rg.partialUpdateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { gender: string; unique: string }>['partialUpdateUser']>>",
	},
	{
		f: rg.partialUpdateUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { gender: string; unique: string; work?: string }>['partialUpdateUsers']>>",
	},
	{
		f: rg.query,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['query']>>",
	},
	{
		f: rg.queryMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['queryMembers']>>",
	},
	{
		f: rg.queryUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { nickname?: string }>['queryUsers']>>",
	},
	{
		f: rg.reactivateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['reactivateUser']>>",
	},
	{
		f: rg.rejectInvite,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string; image?: string }, string & {}, {}, {}, {}, { song?: string }>['rejectInvite']>>",
	},
	{
		f: rg.removeMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['removeMembers']>>",
	},
	{
		f: rg.removeShadowBan,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['removeShadowBan']>>",
	},
	{
		f: rg.sendAction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, { testString?: string }>['sendAction']>>",
	},
	{
		f: rg.sendFile,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['sendFile']>>",
	},
	{
		f: rg.sendImage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['sendImage']>>",
	},
	{
		f: rg.sendMessage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, { testString?: string }>['sendMessage']>>",
	},
	{
		f: rg.sendMessageReadEvent,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['sendEvent']>>",
	},
	{
		f: rg.sendReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['sendReaction']>>",
	},
	{
		f: rg.setAnonymousUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['setAnonymousUser']>>",
	},
	{
		f: rg.setGuestUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['setGuestUser']>>",
	},
	{
		f: rg.setUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['setUser']>>",
	},
	{
		f: rg.show,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['show']>>",
	},
	{
		f: rg.stopTyping,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['stopTyping']>>",
	},
	{
		f: rg.stopWatching,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['stopWatching']>>",
	},
	{
		f: rg.sync,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { description?: string }, string & {}, {}, {}, {}, {}>['sync']>>",
	},
	// Need translation on the account to run this test
	// {
	// 	f: rg.translateMessage,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['translateMessage']>>",
	// },
	{
		f: rg.truncateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['truncate']>>",
	},
	{
		f: rg.unbanUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['unbanUser']>>",
	},
	{
		f: rg.unflagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { image: string, status: string }>['unflagMessage']>>",
	},
	{
		f: rg.unflagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { image: string, status: string }>['unflagUser']>>",
	},
	{
		f: rg.unmute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['unmute']>>",
	},
	{
		f: rg.unmuteUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['unmuteUser']>>",
	},
	{
		f: rg.updateAppSettings,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['updateAppSettings']>>",
	},
	{
		f: rg.updateBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, { description: string }, string & {}, {}, {}, {}, {}>['updateBlockList']>>",
	},
	{
		f: rg.updateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description: string }, string & {}, {}, {}, {}, {}>['update']>>",
	},
	{
		f: rg.updateChannelFromOriginal,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description: string; smallTitle: string }, string & {}, {}, {}, {}, {}>['update']>>",
	},
	{
		f: rg.updateChannelType,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['updateChannelType']>>",
	},
	{
		f: rg.updateCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | '', {}, {}, {}, {}>['updateCommand']>>",
	},
	{
		f: rg.updateMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { testString?: string }>['updateMessage']>>",
	},
	{
		f: rg.updatePermission,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['updatePermission']>>",
	},
	{
		f: rg.updateUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { unique: string }>['updateUsers']>>",
	},
	{
		f: rg.upsertUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, { nickname: string }>['upsertUser']>>",
	},
	{
		f: rg.watch,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{}, { description?: string }, string & {}, {}, {}, {}, {}>['watch']>>",
	},

	// Currently roles do not return
	// {
	// 	f: rg.createRole,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['createRole']>>",
	// },
	// {
	// 	f: rg.deleteRole,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['deleteRole']>>",
	// },
	// {
	// 	f: rg.listRoles,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{}, {}, string & {}, {}, {}, {}, {}>['listRoles']>>",
	// },
];

let tsFileName;
const run = async () => {
	let imports = '';
	const types = [];

	executables.forEach((i) => {
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

	imports = `import { ImmutableObject } from 'seamless-immutable';\n\nimport { ${imports} } from '../..';`;
	tsFileName = `${__dirname}/data.ts`;
	fs.writeFile(tsFileName, `${imports} \n\n`, function (err) {
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
			function (err) {
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
		console.log(`❌ ${func.name} failed with error: `, error);
		process.exit(1);
	}
};

function checkIfComplete() {
	if (countExecutables === executables.length) {
		console.log();
		process.exit();
	}
}

run();
