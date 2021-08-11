import { UnknownType, UserResponse } from './types';

/**
 * ClientState - A container class for the client state.
 */

export type ClientStateData<UserType = UnknownType> = {
  userChannelReferences: { [key: string]: { [key: string]: boolean } };
  users: {
    [key: string]: UserResponse<UserType>;
  };
};

export class ClientState<UserType = UnknownType> {
  users: {
    [key: string]: UserResponse<UserType>;
  };
  userChannelReferences: { [key: string]: { [key: string]: boolean } };
  constructor() {
    // show the status for a certain user...
    // ie online, offline etc
    this.users = {};
    // store which channels contain references to the specified user...
    this.userChannelReferences = {};
  }

  updateUsers(users: UserResponse<UserType>[]) {
    for (const user of users) {
      this.updateUser(user);
    }
  }

  updateUser(user?: UserResponse<UserType>) {
    if (user != null) {
      this.users[user.id] = user;
    }
  }

  updateUserReference(user: UserResponse<UserType>, channelID: string) {
    if (user == null) {
      return;
    }
    this.updateUser(user);
    if (!this.userChannelReferences[user.id]) {
      this.userChannelReferences[user.id] = {};
    }
    this.userChannelReferences[user.id][channelID] = true;
  }

  deleteAllChannelReference(channelID: string) {
    for (const userID in this.userChannelReferences) {
      delete this.userChannelReferences[userID][channelID];
    }
  }

  getStateData() {
    return {
      users: this.users,
      userChannelReferences: this.userChannelReferences,
    };
  }

  reInitializeWithState(clientState: ClientStateData<UserType>) {
    this.users = clientState.users;
    this.userChannelReferences = clientState.userChannelReferences;
  }
}
