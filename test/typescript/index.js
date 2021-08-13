// Its a simple node script which uses our js client to make various API calls.
// The responses received from those calls are written to a typescript file and compared against there corresponding
// APIResponse types, specified in declaration file - types/stream-chat/index.d.ts
const fs = require('fs');
const rg = require('./response-generators/index');

let countExecutables = 0;

const T =
	'{ attachmentType: {}; channelType: { description?: string; image?: string }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { song?: string }; }';

const executables = [
	{
		f: rg.acceptInvite,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; image?: string }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { song?: string }; }>['acceptInvite']>>",
	},
	{
		f: rg.addDevice,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['addDevice']>>",
	},
	{
		f: rg.addMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['addMembers']>>",
	},
	{
		f: rg.addModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['addModerators']>>",
	},
	{
		f: rg.banUsers,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['banUser']>>",
	},
	{
		f: rg.channelSearch,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['search']>>",
	},
	{
		f: rg.connect,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['connect']>>",
	},
	{
		f: rg.connectAnonymousUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['connectAnonymousUser']>>",
	},
	{
		f: rg.connectUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['connectUser']>>",
	},
	{
		f: rg.create,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['create']>>",
	},
	{
		f: rg.createBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['createBlockList']>>",
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
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; image?: string }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: { song?: string }; }>['createCommand']>>",
	},
	{
		f: rg.createPermission,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['createPermission']>>",
	},
	{
		f: rg.deactivateUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['deactivateUser']>>",
	},
	{
		f: rg.deleteBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['deleteBlockList']>>",
	},
	{
		f: rg.deleteChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['delete']>>",
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
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['deleteCommand']>>",
	},
	{
		f: rg.deleteFile,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['deleteFile']>>",
	},
	{
		f: rg.deleteImage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['deleteImage']>>",
	},
	{
		f: rg.deleteMessage,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['deleteMessage']>>",
	},
	{
		f: rg.deletePermission,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['deletePermission']>>",
	},
	{
		f: rg.deleteReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['deleteReaction']>>",
	},
	{
		f: rg.deleteUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['deleteUser']>>",
	},
	{
		f: rg.demoteModerators,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['demoteModerators']>>",
	},
	{
		f: rg.disconnect,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['disconnect']>>",
	},
	{
		f: rg.exportUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['exportUser']>>",
	},
	{
		f: rg.flagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { image: string, status: string }; }>['flagMessage']>>",
	},
	{
		f: rg.flagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { image: string, status: string }; }>['flagUser']>>",
	},
	{
		f: rg.getAppSettings,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['getAppSettings']>>",
	},
	{
		f: rg.getBlockList,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['getBlockList']>>",
	},
	{
		f: rg.getChannelType,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['getChannelType']>>",
	},
	{
		f: rg.getCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['getCommand']>>",
	},
	{
		f: rg.getConfig,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['getConfig']>>",
	},
	{
		f: rg.getDevices,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['getDevices']>>",
	},
	{
		f: rg.getMessage,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['getMessage']>>",
	},
	{
		f: rg.getMessagesById,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['getMessagesById']>>",
	},
	{
		f: rg.getMessageWithReply,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { testString?: string; }; }>['getMessage']>>",
	},
	{
		f: rg.getPermission,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['getPermission']>>",
	},
	{
		f: rg.getReactions,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['getReactions']>>",
	},
	{
		f: rg.getReplies,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { instrument?: string; }; }>['getReplies']>>",
	},
	{
		f: rg.hide,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['hide']>>",
	},
	{
		f: rg.inviteMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['inviteMembers']>>",
	},
	{
		f: rg.keystroke,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['keystroke']>>",
	},
	{
		f: rg.lastMessage,
		imports: ['Channel', 'FormatMessageResponse', 'Unpacked'],
		type:
			"Omit<FormatMessageResponse<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string } | undefined",
	},
	{
		f: rg.listBlockLists,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['listBlockLists']>>",
	},
	{
		f: rg.listChannelTypes,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['listChannelTypes']>>",
	},
	{
		f: rg.listCommands,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['listCommands']>>",
	},
	{
		f: rg.listPermissions,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['listPermissions']>>",
	},
	{
		f: rg.markAllRead,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['markAllRead']>>",
	},
	{
		f: rg.markRead,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['markRead']>>",
	},
	{
		f: rg.mute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['mute']>>",
	},
	{
		f: rg.muteStatus,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['muteStatus']>>",
	},
	{
		f: rg.muteUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['muteUser']>>",
	},
	{
		f: rg.partialUpdateUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { gender: string; unique: string; }; }>['partialUpdateUser']>>",
	},
	{
		f: rg.partialUpdateUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { gender: string; unique: string; work?: string; }; }>['partialUpdateUsers']>>",
	},
	{
		f: rg.query,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['query']>>",
	},
	// TODO: Add this back in when queryBannedUsers is deployed to all shards for testing
	// {
	// 	f: rg.queryBannedUsers,
	// 	imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['queryBannedUsers']>>",
	// },
	{
		f: rg.queryMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['queryMembers']>>",
	},
	{
		f: rg.queryUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { nickname?: string; }; }>['queryUsers']>>",
	},
	{
		f: rg.reactivateUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['reactivateUser']>>",
	},
	{
		f: rg.rejectInvite,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; image?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { song?: string; }; }>['rejectInvite']>>",
	},
	{
		f: rg.removeMembers,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['removeMembers']>>",
	},
	{
		f: rg.removeShadowBan,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['removeShadowBan']>>",
	},
	{
		f: rg.sendAction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { testString?: string; }; }>['sendAction']>>",
	},
	{
		f: rg.sendFile,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['sendFile']>>",
	},
	{
		f: rg.sendImage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['sendImage']>>",
	},
	{
		f: rg.sendMessage,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { testString?: string; }; }>['sendMessage']>>",
	},
	{
		f: rg.sendMessageReadEvent,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['sendEvent']>>",
	},
	{
		f: rg.sendReaction,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['sendReaction']>>",
	},
	{
		f: rg.setGuestUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['setGuestUser']>>",
	},
	{
		f: rg.shadowBan,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['shadowBan']>>",
	},
	{
		f: rg.show,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['show']>>",
	},
	{
		f: rg.stopTyping,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['stopTyping']>>",
	},
	{
		f: rg.stopWatching,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['stopWatching']>>",
	},
	{
		f: rg.sync,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['sync']>>",
	},
	{
		f: rg.syncTeam,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['sync']>>",
	},
	// Need translation on the account to run this test
	// {
	// 	f: rg.translateMessage,
	// 	imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
	// 	type:
	// 		"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['translateMessage']>>",
	// },
	{
		f: rg.truncateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['truncate']>>",
	},
	{
		f: rg.unbanUsers,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['unbanUser']>>",
	},
	{
		f: rg.unflagMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { image: string, status: string; }; }>['unflagMessage']>>",
	},
	{
		f: rg.unflagUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { image: string, status: string; }; }>['unflagUser']>>",
	},
	{
		f: rg.unmute,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['unmute']>>",
	},
	{
		f: rg.unmuteUser,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['unmuteUser']>>",
	},
	{
		f: rg.updateAppSettings,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['updateAppSettings']>>",
	},
	{
		f: rg.updateBlockList,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['updateBlockList']>>",
	},
	{
		f: rg.updateChannel,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['update']>>",
	},
	{
		f: rg.updateChannelFromOriginal,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; smallTitle: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['update']>>",
	},
	{
		f: rg.updateChannelType,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['updateChannelType']>>",
	},
	{
		f: rg.updateCommand,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: { description?: string; }; commandType: 'testCreateCommand' | 'testCreateCommand_set' | 'testDeleteCommand' | 'testDeleteCommand_set' | 'testGetCommand' | 'testGetCommand_set' | 'testListCommand' | 'testListCommand_set' | 'testUpdateCommand' | 'testUpdateCommand_set' | 'testUpdateCommand_set_two' | 'ticket' | ''; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['updateCommand']>>",
	},
	{
		f: rg.updateMessage,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { testString?: string; }; }>['updateMessage']>>",
	},
	{
		f: rg.updatePermission,
		imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['updatePermission']>>",
	},
	{
		f: rg.upsertUsers,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { unique: string; }; }>['upsertUsers']>>",
	},
	{
		f: rg.upsertUser,
		imports: ['StreamChat', 'Unpacked'],
		type:
			"Unpacked<ReturnType<StreamChat<{ attachmentType: {}; channelType: {}; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: { nickname: string; }; }>['upsertUser']>>",
	},
	{
		f: rg.watch,
		imports: ['Channel', 'Unpacked'],
		type:
			"Unpacked<ReturnType<Channel<{ attachmentType: {}; channelType: { description?: string; }; commandType: string & {}; eventType: {}; messageType: {}; reactionType: {}; userType: {}; }>['watch']>>",
	},

	// Currently roles do not return
	// {
	// 	f: rg.createRole,
	// 	imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['createRole']>>",
	// },
	// {
	// 	f: rg.deleteRole,
	// 	imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['deleteRole']>>",
	// },
	// {
	// 	f: rg.listRoles,
	// 	imports: ['StreamChat', 'StreamChatDefaultGenerics', 'Unpacked'],
	// 	type: "Unpacked<ReturnType<StreamChat<StreamChatDefaultGenerics>['listRoles']>>",
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
