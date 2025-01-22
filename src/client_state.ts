import { UserResponse, ExtendableGenerics, DefaultGenerics } from './types';
import { StreamChat } from './client';

/**
 * ClientState - A container class for the client state.
 */
export class ClientState<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  private client: StreamChat<StreamChatGenerics>;
  users: {
    [key: string]: UserResponse<StreamChatGenerics>;
  };
  userChannelReferences: { [key: string]: { [key: string]: boolean } };
  constructor({ client }: { client: StreamChat<StreamChatGenerics> }) {
    // show the status for a certain user...
    // ie online, offline etc
    this.client = client;
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
    if (user != null && this.client._cacheEnabled()) {
      this.users[user.id] = user;
    }
  }

  updateUserReference(user: UserResponse<StreamChatGenerics>, channelID: string) {
    if (user == null || !this.client._cacheEnabled()) {
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
