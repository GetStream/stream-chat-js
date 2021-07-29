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
});
