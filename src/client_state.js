import Immutable from 'seamless-immutable';

/**
 * ClientState - A container class for the client state.
 */
export class ClientState {
	constructor() {
		// show the status for a certain user...
		// ie online, offline etc
		this.users = Immutable({});
		// store which channels contain references to the specified user...
		this.userChannelReferences = {};
	}

	updateUsers(users) {
		for (const user of users) {
			this.updateUser(user);
		}
	}

	updateUser(user) {
		if (user != null) {
			this.users = this.users.set(user.id, Immutable(user));
		}
	}

	updateUserReference(user, channelID) {
		if (user == null) {
			return;
		}
		this.updateUser(user);
		if (!this.userChannelReferences[user.id]) {
			this.userChannelReferences[user.id] = {};
		}
		this.userChannelReferences[user.id][channelID] = true;
	}
}
