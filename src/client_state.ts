import type { OwnUserResponse, UserResponse } from './types';
import type { StreamChat } from './client';

export class ClientState {
  private client: StreamChat;
  users: {
    [key: string]: UserResponse | OwnUserResponse;
  };
  /** User ID -> cids of the channels that reference the user. */
  userChannelReferences: { [key: string]: { [key: string]: boolean } };
  constructor({ client }: { client: StreamChat }) {
    this.client = client;
    this.users = {};
    this.userChannelReferences = {};
  }

  updateUsers(users: UserResponse[]) {
    for (const user of users) {
      this.updateUser(user);
    }
  }

  updateUser(user?: UserResponse | OwnUserResponse) {
    if (user != null) {
      this.users[user.id] = user;
    }
  }

  updateUserReference(user: UserResponse, channelID: string) {
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
