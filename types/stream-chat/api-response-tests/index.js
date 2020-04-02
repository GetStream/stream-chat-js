// Its a simple node script which uses our js client to make various API calls.
// The responses received from those calls are written to a typescript file and compared against there corresponding
// APIResponse types, specified in declaration file - types/stream-chat/index.d.ts
const fs = require('fs');
const rg = require('./response-generators/index');

let countExecutables = 0;

const executables = [
	{ f: rg.setUser, type: 'ConnectAPIResponse' },
	{ f: rg.channelSearch, type: 'SearchAPIResponse' },
	{ f: rg.updateUsers, type: 'UpdateUsersAPIResponse' },
	{ f: rg.partialUpdateUser, type: 'UpdateUsersAPIResponse' },
	{ f: rg.partialUpdateUsers, type: 'UpdateUsersAPIResponse' },
	{ f: rg.banUsers, type: 'BanUserAPIResponse' },
	{ f: rg.unbanUsers, type: 'UnbanUserAPIResponse' },
	{ f: rg.muteUser, type: 'MuteAPIResponse' },
	{ f: rg.unmuteUser, type: 'UnmuteAPIResponse' },
	{ f: rg.flagUser, type: 'FlagAPIResponse' },
	{ f: rg.unflagUser, type: 'UnflagAPIResponse' },
	{ f: rg.flagMessage, type: 'FlagAPIResponse' },
	{ f: rg.unflagMessage, type: 'UnflagAPIResponse' },
	{ f: rg.createChannelType, type: 'CreateChannelTypeAPIResponse' },
	{ f: rg.getChannelType, type: 'GetChannelTypeAPIResponse' },
	{ f: rg.listChannelTypes, type: 'ListChannelTypesAPIResponse' },
	// TODO: Fix the error which results from deleteChannelType api call:
	// `deleteChannelType failed with error:  { Error: StreamChat error code 16: DeleteChannelType failed with error: "bc0b09df-2cfd-4e80-93e7-1f0091e6a435 is not a defined channel type"`
	// because of which build failure occurs.
	// { f: rg.deleteChannelType, type: 'DeleteChannelTypeAPIResponse' },
	{ f: rg.sendMessage, type: 'SendMessageAPIResponse' },
	{ f: rg.updateMessage, type: 'UpdateMessageAPIResponse' },
	{ f: rg.deleteMessage, type: 'DeleteMessageAPIResponse' },
	{ f: rg.getMessage, type: 'GetMessageAPIResponse' },
	{ f: rg.getMessagesById, type: 'GetMultipleMessagesAPIResponse' },
	{
		f: rg.sendMessageReadEvent,
		type: 'SendEventAPIResponse<MessageReadEvent>',
		imports: ['MessageReadEvent', 'SendEventAPIResponse'],
	},
	{ f: rg.sendReaction, type: 'SendReactionAPIResponse' },
	{ f: rg.deleteReaction, type: 'DeleteReactionAPIResponce' },
	{ f: rg.getReactions, type: 'GetReactionsAPIResponse' },
	{ f: rg.updateChannel, type: 'UpdateChannelAPIResponse' },
	{ f: rg.deleteChannel, type: 'DeleteChannelAPIResponse' },
	{ f: rg.acceptInvite, type: 'AcceptInviteAPIResponse' },
	{ f: rg.rejectInvite, type: 'RejectInviteAPIResponse' },
	{ f: rg.addMembers, type: 'AddMembersAPIResponse' },
	{ f: rg.removeMembers, type: 'RemoveMembersAPIResponse' },
	{ f: rg.sendAction, type: 'SendMessageAPIResponse' },
	{ f: rg.keystroke, type: 'undefined', imports: [] },
	{ f: rg.stopTyping, type: 'undefined', imports: [] },
	{ f: rg.markRead, type: 'MarkReadAPIResponse' },
	{ f: rg.query, type: 'ChannelAPIResponse' },
	{ f: rg.watch, type: 'ChannelAPIResponse' },
	{ f: rg.create, type: 'ChannelAPIResponse' },
	{ f: rg.stopWatching, type: 'StopWatchingAPIResponse' },
	{ f: rg.getReplies, type: 'GetRepliesAPIResponse' },
];

let imports = '';

executables.forEach(i => {
	let modulesToImport = '';

	if (i.imports) {
		modulesToImport = i.imports.length > 0 ? i.imports.join(', ') : '';
	} else {
		modulesToImport = i.type;
	}

	if (imports === '') {
		imports = `${i.type}`;
		return;
	}

	if (imports.indexOf(` ${i.type}`) > -1 || modulesToImport === '') {
		return;
	}

	imports = `${imports}, ${modulesToImport}`;
});

imports = `import { ${imports} } from '../index';`;
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
