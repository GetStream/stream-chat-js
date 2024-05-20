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
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; image?: string }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { song?: string }; pollType: {}; pollOptionType: {}; }>['acceptInvite']>>",
	},
	{
		f: rg.addDevice,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['addDevice']>>",
	},
	{
		f: rg.addMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['addMembers']>>",
	},
	{
		f: rg.addModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['addModerators']>>",
	},
	{
		f: rg.banUsers,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['banUser']>>",
	},
	{
		f: rg.channelSearch,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['search']>>",
	},
	// TODO: Fix the issue "WS failed with code 5 and reason - anon auth token must have user_id claim equal to '!anon'"
	// {
	// 	f: rg.connect,
	// 	imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['connect']>>",
	// },
	// {
	// 	f: rg.connectAnonymousUser,
	// 	imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['connectAnonymousUser']>>",
	// },
	{
		f: rg.connectUser,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['connectUser']>>",
	},
	{
		f: rg.create,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['create']>>",
	},
	{
		f: rg.createBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['createBlockList']>>",
	},
	// createChannelType has a limit. So only run this when needed.
	// {
	// 	f: rg.createChannelType,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['createChannelType']>>",
	// },
	{
		f: rg.createCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; image?: string }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: { song?: string }; pollType: {}; pollOptionType: {}; }>['createCommand']>>",
	},
	{
		f: rg.createPermission,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['createPermission']>>",
	},
	{
		f: rg.deactivateUser,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['deactivateUser']>>",
	},
	{
		f: rg.deleteBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['deleteBlockList']>>",
	},
	{
		f: rg.deleteChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['delete']>>",
	},
	// TODO: Fix the error which results from deleteChannelType api call:
	// `deleteChannelType failed with error:  { Error: StreamChat error code 16: DeleteChannelType failed with error: "bc0b09df-2cfd-4e80-93e7-1f0091e6a435 is not a defined channel type"`
	// because of which build failure occurs.
	// {
	// 	f: rg.deleteChannelType,
	// 	imports: ['StreamChat', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['deleteChannelType']>>",
	// },
	{
		f: rg.deleteCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['deleteCommand']>>",
	},
	{
		f: rg.deleteFile,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['deleteFile']>>",
	},
	{
		f: rg.deleteImage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['deleteImage']>>",
	},
	{
		f: rg.deleteMessage,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['deleteMessage']>>",
	},
	{
		f: rg.deletePermission,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['deletePermission']>>",
	},
	{
		f: rg.deleteReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['deleteReaction']>>",
	},
	{
		f: rg.deleteUser,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['deleteUser']>>",
	},
	{
		f: rg.demoteModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['demoteModerators']>>",
	},
	// {
	// 	f: rg.disconnect,
	// 	imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['disconnect']>>",
	// },
	{
		f: rg.exportUser,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['exportUser']>>",
	},
	{
		f: rg.flagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { image: string, status: string }; pollType: {}; pollOptionType: {}; }>['flagMessage']>>",
	},
	{
		f: rg.flagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { image: string, status: string }; pollType: {}; pollOptionType: {}; }>['flagUser']>>",
	},
	{
		f: rg.getAppSettings,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['getAppSettings']>>",
	},
	{
		f: rg.getBlockList,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['getBlockList']>>",
	},
	{
		f: rg.getChannelType,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['getChannelType']>>",
	},
	{
		f: rg.getCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['getCommand']>>",
	},
	{
		f: rg.getConfig,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['getConfig']>>",
	},
	{
		f: rg.getDevices,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['getDevices']>>",
	},
	{
		f: rg.getMessage,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['getMessage']>>",
	},
	{
		f: rg.getMessagesById,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['getMessagesById']>>",
	},
	{
		f: rg.getMessageWithReply,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { testString?: string; }; pollType: {}; pollOptionType: {}; }>['getMessage']>>",
	},
	{
		f: rg.getPermission,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['getPermission']>>",
	},
	{
		f: rg.getReactions,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['getReactions']>>",
	},
	{
		f: rg.getReplies,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { instrument?: string; }; pollType: {}; pollOptionType: {}; }>['getReplies']>>",
	},
	{
		f: rg.hide,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['hide']>>",
	},
	{
		f: rg.inviteMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['inviteMembers']>>",
	},
	{
		f: rg.keystroke,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['keystroke']>>",
	},
	{
		f: rg.lastMessage,
		imports: ['Channel', 'FormatMessageResponse', 'Unpacked'],
		type:
			"Omit<FormatMessageResponse<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string } | undefined",
	},
	{
		f: rg.listBlockLists,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['listBlockLists']>>",
	},
	{
		f: rg.listChannelTypes,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['listChannelTypes']>>",
	},
	{
		f: rg.listCommands,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['listCommands']>>",
	},
	{
		f: rg.listPermissions,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['listPermissions']>>",
	},
	{
		f: rg.markAllRead,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['markAllRead']>>",
	},
	{
		f: rg.markRead,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['markRead']>>",
	},
	{
		f: rg.mute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['mute']>>",
	},
	{
		f: rg.muteStatus,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['muteStatus']>>",
	},
	{
		f: rg.muteUser,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['muteUser']>>",
	},
	{
		f: rg.partialUpdateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { gender: string; unique: string; }; pollType: {}; pollOptionType: {}; }>['partialUpdateUser']>>",
	},
	{
		f: rg.partialUpdateUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { gender: string; unique: string; work?: string; }; pollType: {}; pollOptionType: {}; }>['partialUpdateUsers']>>",
	},
	{
		f: rg.query,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['query']>>",
	},
	// TODO: Add this back in when queryBannedUsers is deployed to all shards for testing
	// {
	// 	f: rg.queryBannedUsers,
	// 	imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat<DefaultGenerics>['queryBannedUsers']>>",
	// },
	{
		f: rg.queryMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['queryMembers']>>",
	},
	{
		f: rg.queryUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { nickname?: string; }; pollType: {}; pollOptionType: {}; }>['queryUsers']>>",
	},
	{
		f: rg.reactivateUser,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['reactivateUser']>>",
	},
	{
		f: rg.rejectInvite,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; image?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { song?: string; }; pollType: {}; pollOptionType: {}; }>['rejectInvite']>>",
	},
	{
		f: rg.removeMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['removeMembers']>>",
	},
	{
		f: rg.removeShadowBan,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['removeShadowBan']>>",
	},
	{
		f: rg.sendAction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { testString?: string; }; pollType: {}; pollOptionType: {}; }>['sendAction']>>",
	},
	{
		f: rg.sendFile,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['sendFile']>>",
	},
	{
		f: rg.sendImage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['sendImage']>>",
	},
	{
		f: rg.sendMessage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { testString?: string; }; pollType: {}; pollOptionType: {}; }>['sendMessage']>>",
	},
	{
		f: rg.sendMessageReadEvent,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['sendEvent']>>",
	},
	{
		f: rg.sendReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['sendReaction']>>",
	},
	{
		f: rg.setGuestUser,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['setGuestUser']>>",
	},
	{
		f: rg.shadowBan,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['shadowBan']>>",
	},
	{
		f: rg.show,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['show']>>",
	},
	{
		f: rg.stopTyping,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['stopTyping']>>",
	},
	{
		f: rg.stopWatching,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['stopWatching']>>",
	},
	{
		f: rg.sync,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['sync']>>",
	},
	{
		f: rg.syncTeam,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['sync']>>",
	},
	// Need translation on the account to run this test
	// {
	// 	f: rg.translateMessage,
	// 	imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat<DefaultGenerics>['translateMessage']>>",
	// },
	{
		f: rg.truncateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['truncate']>>",
	},
	{
		f: rg.unbanUsers,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['unbanUser']>>",
	},
	{
		f: rg.unmute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['unmute']>>",
	},
	{
		f: rg.unmuteUser,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['unmuteUser']>>",
	},
	{
		f: rg.updateAppSettings,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['updateAppSettings']>>",
	},
	{
		f: rg.updateBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['updateBlockList']>>",
	},
	{
		f: rg.updateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['update']>>",
	},
	{
		f: rg.updateChannelFromOriginal,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; smallTitle: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['update']>>",
	},
	{
		f: rg.updateChannelType,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['updateChannelType']>>",
	},
	{
		f: rg.updateCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['updateCommand']>>",
	},
	{
		f: rg.updateMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { testString?: string; }; pollType: {}; pollOptionType: {}; }>['updateMessage']>>",
	},
	{
		f: rg.updatePermission,
		imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['updatePermission']>>",
	},
	{
		f: rg.upsertUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { unique: string; }; pollType: {}; pollOptionType: {}; }>['upsertUsers']>>",
	},
	{
		f: rg.upsertUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { nickname: string; }; pollType: {}; pollOptionType: {}; }>['upsertUser']>>",
	},
	{
		f: rg.watch,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; pollType: {}; pollOptionType: {}; }>['watch']>>",
	},

	// Currently roles do not return
	// {
	// 	f: rg.createRole,
	// 	imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['createRole']>>",
	// },
	// {
	// 	f: rg.deleteRole,
	// 	imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['deleteRole']>>",
	// },
	// {
	// 	f: rg.listRoles,
	// 	imports: ['StreamChat', 'DefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<DefaultGenerics>['listRoles']>>",
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
