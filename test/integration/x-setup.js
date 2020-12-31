import { Permission, AnyResource, AnyRole, Allow } from '../../src';
import { getTestClient } from './utils';
import { v4 as uuidv4 } from 'uuid';

async function setupEverythingDisabledChannel(serverAuthClient) {
	try {
		await serverAuthClient.getChannelType('everythingDisabled');
	} catch (e) {
		await serverAuthClient.createChannelType({
			name: 'everythingDisabled',
			commands: ['all'],
			max_message_length: 10,
			typing_events: false,
			read_events: false,
			connect_events: false,
			search: false,
			reactions: false,
			replies: false,
			mutes: false,
			uploads: false,
			permissions: [
				new Permission(uuidv4(), 20, AnyResource, AnyRole, false, Allow),
			],
			roles: {
				admin: [
					'Create Channel',
					'Read Any Channel',
					'Create Message',
					'Update Any Message',
				],
			},
		});
	}
}

async function setupMessagingChannelType(serverAuthClient) {
	await serverAuthClient.updateChannelType('messaging', {
		commands: ['giphy', 'mute', 'unmute'],
	});
}

// this horrible hack is to make sure that global setup and teardown are executed
// even when .only or --grep are used

let runBefore = false;

beforeEach(async () => {
	if (runBefore === true) return;
	const serverAuthClient = getTestClient(true);
	await setupEverythingDisabledChannel(serverAuthClient);
	await setupMessagingChannelType(serverAuthClient);
	runBefore = true;
});
