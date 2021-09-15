import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { ClientState } from '../../src/client_state';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('ClientState', () => {
	let state;
	beforeEach(() => {
		state = new ClientState();
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

	it('getStateData should return correct data', () => {
		state.userChannelReferences = {
			user1: { ch1: true, ch2: true },
			user2: { ch1: true, ch3: true },
			user3: { ch1: true, ch4: true },
		};

		// it should return whatever the user object is so no need to mock the exact user object
		state.users = {
			user1: { key: 'value' },
		};

		const stateData = state.getStateData();

		expect(state.users).to.be.deep.equal(stateData.users);
		expect(state.userChannelReferences).to.be.deep.equal(
			stateData.userChannelReferences,
		);
	});

	it('reInitializeWithState should initialize with correct data', () => {
		const stateData = {
			users: {
				user1: { key: 'value' },
			},
			userChannelReferences: {
				user1: { ch1: true, ch2: true },
				user2: { ch1: true, ch3: true },
				user3: { ch1: true, ch4: true },
			},
		};

		state.reInitializeWithState(stateData);

		expect(state.users).to.be.deep.equal(stateData.users);
		expect(state.userChannelReferences).to.be.deep.equal(
			stateData.userChannelReferences,
		);
	});
});
