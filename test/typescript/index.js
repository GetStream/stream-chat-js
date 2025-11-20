// Its a simple node script which uses our js client to make various API calls.
// The responses received from those calls are written to a typescript file and compared against there corresponding
// APIResponse types, specified in declaration file - types/stream-chat/index.d.ts.
const fs = require('fs');
const rg = require('./response-generators/index');

let countExecutables = 0;

const executables = [
	{
		f: rg.acceptInvite,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['acceptInvite']>>",
	},
	{
		f: rg.addDevice,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['addDevice']>>",
	},
	{
		f: rg.addMembers,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['addMembers']>>",
	},
	{
		f: rg.addFilterTags,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['addFilterTags']>>",
	},
	{
		f: rg.addModerators,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['addModerators']>>",
	},
	{
		f: rg.banUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['banUser']>>",
	},
	{
		f: rg.channelSearch,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['search']>>",
	},
	// TODO: Fix the issue "WS failed with code 5 and reason - anon auth token must have user_id claim equal to '!anon'"
	// {
	// 	f: rg.connect,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['connect']>>",
	// },
	// {
	// 	f: rg.connectAnonymousUser,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['connectAnonymousUser']>>",
	// },
	{
		f: rg.connectUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['connectUser']>>",
	},
	{
		f: rg.create,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['create']>>",
	},
	{
		f: rg.createBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['createBlockList']>>",
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
		type: "Unpacked<ReturnType<StreamChat['createCommand']>>",
	},
	{
		f: rg.createPermission,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['createPermission']>>",
	},
	{
		f: rg.deactivateUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['deactivateUser']>>",
	},
	{
		f: rg.deleteBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['deleteBlockList']>>",
	},
	{
		f: rg.deleteChannel,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['delete']>>",
	},
	// TODO: Fix the error which results from deleteChannelType api call:Add commentMore actions
	// `deleteChannelType failed with error:  { Error: StreamChat error code 16: DeleteChannelType failed with error: "bc0b09df-2cfd-4e80-93e7-1f0091e6a435 is not a defined channel type"`
	// because of which build failure occurs.
	// {
	// 	f: rg.deleteChannelType,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['deleteChannelType']>>",
	{
		f: rg.deleteCommand,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['deleteCommand']>>",
	},
	{
		f: rg.deleteFile,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['deleteFile']>>",
	},
	{
		f: rg.deleteImage,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['deleteImage']>>",
	},
	{
		f: rg.deleteMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['deleteMessage']>>",
	},
	{
		f: rg.deletePermission,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['deletePermission']>>",
	},
	{
		f: rg.deleteReaction,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['deleteReaction']>>",
	},
	{
		f: rg.deleteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['deleteUser']>>",
	},
	{
		f: rg.demoteModerators,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['demoteModerators']>>",
	},
	// {
	// 	f: rg.disconnect,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['disconnect']>>",
	// },
	{
		f: rg.exportUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['exportUser']>>",
	},
	{
		f: rg.flagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['flagMessage']>>",
	},
	{
		f: rg.flagUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['flagUser']>>",
	},
	{
		f: rg.getAppSettings,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['getAppSettings']>>",
	},
	{
		f: rg.getBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['getBlockList']>>",
	},
	{
		f: rg.getChannelType,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['getChannelType']>>",
	},
	{
		f: rg.getCommand,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['getCommand']>>",
	},
	{
		f: rg.getConfig,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['getConfig']>>",
	},
	{
		f: rg.getDevices,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['getDevices']>>",
	},
	{
		f: rg.getMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['getMessage']>>",
	},
	{
		f: rg.getMessagesById,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['getMessagesById']>>",
	},
	{
		f: rg.getMessageWithReply,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['getMessage']>>",
	},
	{
		f: rg.getPermission,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['getPermission']>>",
	},
	{
		f: rg.getReactions,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['getReactions']>>",
	},
	{
		f: rg.getReplies,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['getReplies']>>",
	},
	{
		f: rg.hide,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['hide']>>",
	},
	{
		f: rg.inviteMembers,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['inviteMembers']>>",
	},
	{
		f: rg.keystroke,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['keystroke']>>",
	},
	{
		f: rg.lastMessage,
		imports: ['Channel', 'FormatMessageResponse', 'Unpacked'],
		type: "Omit<FormatMessageResponse, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string } | undefined",
	},
	{
		f: rg.listBlockLists,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['listBlockLists']>>",
	},
	{
		f: rg.listChannelTypes,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['listChannelTypes']>>",
	},
	{
		f: rg.listCommands,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['listCommands']>>",
	},
	{
		f: rg.listPermissions,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['listPermissions']>>",
	},
	{
		f: rg.markAllRead,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['markAllRead']>>",
	},
	{
		f: rg.markRead,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['markRead']>>",
	},
	{
		f: rg.mute,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['mute']>>",
	},
	{
		f: rg.muteStatus,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['muteStatus']>>",
	},
	{
		f: rg.muteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['muteUser']>>",
	},
	{
		f: rg.partialUpdateUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['partialUpdateUser']>>",
	},
	{
		f: rg.partialUpdateUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['partialUpdateUsers']>>",
	},
	{
		f: rg.query,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['query']>>",
	},
	// TODO: Add this back in when queryBannedUsers is deployed to all shards for testing
	// {
	// 	f: rg.queryBannedUsers,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat['queryBannedUsers']>>",
	// },
	{
		f: rg.queryMembers,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['queryMembers']>>",
	},
	{
		f: rg.queryUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['queryUsers']>>",
	},
	{
		f: rg.reactivateUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['reactivateUser']>>",
	},
	{
		f: rg.rejectInvite,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['rejectInvite']>>",
	},
	{
		f: rg.removeMembers,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['removeMembers']>>",
	},
	{
		f: rg.removeFilterTags,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['removeFilterTags']>>",
	},
	{
		f: rg.removeShadowBan,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['removeShadowBan']>>",
	},
	{
		f: rg.sendAction,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['sendAction']>>",
	},
	{
		f: rg.sendFile,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['sendFile']>>",
	},
	{
		f: rg.sendImage,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['sendImage']>>",
	},
	{
		f: rg.sendMessage,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['sendMessage']>>",
	},
	{
		f: rg.sendMessageReadEvent,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['sendEvent']>>",
	},
	{
		f: rg.sendReaction,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['sendReaction']>>",
	},
	{
		f: rg.setGuestUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['setGuestUser']>>",
	},
	{
		f: rg.shadowBan,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['shadowBan']>>",
	},
	{
		f: rg.show,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['show']>>",
	},
	{
		f: rg.stopTyping,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['stopTyping']>>",
	},
	{
		f: rg.stopWatching,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['stopWatching']>>",
	},
	{
		f: rg.sync,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['sync']>>",
	},
	{
		f: rg.syncTeam,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['sync']>>",
	},
	// Need translation on the account to run this test
	// {
	// 	f: rg.translateMessage,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat['translateMessage']>>",
	// },
	{
		f: rg.truncateChannel,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['truncate']>>",
	},
	{
		f: rg.unbanUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['unbanUser']>>",
	},
	{
		f: rg.unmute,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['unmute']>>",
	},
	{
		f: rg.unmuteUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['unmuteUser']>>",
	},
	{
		f: rg.updateAppSettings,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['updateAppSettings']>>",
	},
	{
		f: rg.updateBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['updateBlockList']>>",
	},
	{
		f: rg.updateChannel,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['update']>>",
	},
	{
		f: rg.updateChannelFromOriginal,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['update']>>",
	},
	{
		f: rg.updateChannelType,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['updateChannelType']>>",
	},
	{
		f: rg.updateCommand,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['updateCommand']>>",
	},
	{
		f: rg.updateMessage,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['updateMessage']>>",
	},
	{
		f: rg.updatePermission,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['updatePermission']>>",
	},
	{
		f: rg.upsertUsers,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['upsertUsers']>>",
	},
	{
		f: rg.upsertUser,
		imports: ['StreamChat', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat['upsertUser']>>",
	},
	{
		f: rg.watch,
		imports: ['Channel', 'Unpacked'],
		type: "Unpacked<ReturnType<Channel['watch']>>",
	},

	// Currently roles do not return
	// {
	// 	f: rg.createRole,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['createRole']>>",
	// },
	// {
	// 	f: rg.deleteRole,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['deleteRole']>>",
	// },
	// {
	// 	f: rg.listRoles,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat['listRoles']>>",
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
	const uniqueTypes = types.filter((value, index, self) => self.indexOf(value) === index);
	imports = uniqueTypes.join(', ');

	imports = `import { ${imports} } from '../..';`;

	// Module augmentation to add custom properties used in tests
	const moduleAugmentation = `
// Module augmentation to add custom properties for testing
declare module '../..' {
  interface CustomUserData {
    testString?: string;
    instrument?: string;
    song?: string;
    gender?: string;
    unique?: string;
    work?: string;
    status?: string;
    image?: string;
    devices?: unknown[];
    invisible?: boolean;
    last_engaged_at?: string;
    mutes?: unknown[];
    channel_mutes?: unknown[];
    unread_count?: number;
    total_unread_count?: number;
    unread_channels?: number;
  }
  interface CustomChannelData {
    description?: string;
    image?: string;
    smallTitle?: string;
    shared_locations?: boolean;
  }
  interface CustomCommandData {
    testCreateCommand?: unknown;
    testCreateCommand_set?: unknown;
    testDeleteCommand?: unknown;
    testDeleteCommand_set?: unknown;
    testGetCommand?: unknown;
    testGetCommand_set?: unknown;
    testListCommand?: unknown;
    testListCommand_set?: unknown;
    testUpdateCommand?: unknown;
    testUpdateCommand_set?: unknown;
    testUpdateCommand_set_two?: unknown;
  }
}`;

	tsFileName = `${__dirname}/data.ts`;
	fs.writeFile(tsFileName, `${imports} \n${moduleAugmentation}\n\n`, function (err) {
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
			`export const ${func.name}Response: ${type} = ${JSON.stringify(response)}; \n`,
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
