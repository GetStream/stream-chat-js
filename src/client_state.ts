import Immutable from 'seamless-immutable';
import type { User } from '../types/types';

/**
 * ClientState - A container class for the client state.
 */
export class ClientState<UserType> {
	users: Immutable.ImmutableObject<{ [key: string]: Immutable.Immutable<User<UserType>> }>
	userChannelReferences: { [key: string]: { [key: string]: boolean }}
	constructor() {
		// show the status for a certain user...
		// ie online, offline etc
		this.users = Immutable<{ [key: string]: Immutable.Immutable<User<UserType>> }>({});
		// store which channels contain references to the specified user...
		this.userChannelReferences = {};
	}

	updateUsers(users: User<UserType>[]) {
		for (const user of users) {
			this.updateUser(user);
		}
	}

	updateUser(user?: User<UserType>) {
		if (user != null) {
			this.users = this.users.set(user.id, Immutable(user));
		}
	}

	updateUserReference(user: User<UserType>, channelID: string) {
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
