import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { ClientState } from '../../src/client_state';
import { StreamChat } from '../../src';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('ClientState', () => {
	let state;
	let client;
	beforeEach(() => {
		client = new StreamChat('apiKey');
		state = new ClientState({ client });
	});

	it('deleteChannelAllUsers', () => {
		state.userChannelReferences = {
			user1: { ch1: true, ch2: true, ch3: true },
			user2: { ch1: true, ch2: true, ch4: true },
			user3: { ch1: true, ch4: true },
		};

		state.deleteAllChannelReference('ch2');

		expect(state.userChannelReferences).to.deep.equal({
			user1: { ch1: true, ch3: true },
			user2: { ch1: true, ch4: true },
			user3: { ch1: true, ch4: true },
		});
	});

	it('should not populate client.state if caching is disabled', () => {
		client._cacheEnabled = () => false;
		const newUser = { id: 'user-1' };
		const channelId = 'channel-1';

		state.updateUser(newUser);
		state.updateUserReference(newUser, channelId);

		expect(state.users).to.deep.equal({});
		expect(state.userChannelReferences).to.deep.equal({});
	});
});
