import Immutable from 'seamless-immutable';

/**
 * ClientState - A container class for the client state.
 */
export class ClientState {
	constructor() {
		// show the status for a certain user...
		// ie online, offline etc
		this.users = Immutable({});
	}

	updateUser(user) {
		if (user != null) {
			this.users = this.users.set(user.id, Immutable(user));
		}
	}
}
