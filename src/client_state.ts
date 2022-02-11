import { UserResponse, ExtendableGenerics, DefaultGenerics } from './types';

/**
 * ClientState - A container class for the client state.
 */
export class ClientState<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  users: {
    [key: string]: UserResponse<StreamChatGenerics>;
  };
  userChannelReferences: { [key: string]: { [key: string]: boolean } };
  constructor() {
    // show the status for a certain user...
    // ie online, offline etc
    this.users = {};
    // store which channels contain references to the specified user...
    this.userChannelReferences = {};
  }

  updateUsers(users: UserResponse<StreamChatGenerics>[]) {
    for (const user of users) {
      this.updateUser(user);
    }
  }

  updateUser(user?: UserResponse<StreamChatGenerics>) {
    if (user != null) {
      this.users[user.id] = user;
    }
  }

  updateUserReference(user: UserResponse<StreamChatGenerics>, channelID: string) {
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
}
