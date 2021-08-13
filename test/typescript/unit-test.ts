// basic sanity check
import {
  StreamChat,
  Event,
  Deny,
  AnyRole,
  Allow,
  AnyResource,
  Permission,
  MaxPriority,
  APIResponse,
  AppSettingsAPIResponse,
  UserResponse,
  SendFileAPIResponse,
  UnknownType,
  Channel,
  EventTypes,
  ChannelState,
  ChannelMemberResponse,
  UpdateChannelAPIResponse,
  PartialUserUpdate,
  PermissionObject,
  ConnectAPIResponse,
} from '../../dist/types';
const apiKey = 'apiKey';

type UserType = {
  id: string;
  example?: number;
  name?: string;
  phone?: number;
};

type ChannelType = {
  color: string;
};
type AttachmentType = UnknownType;
type EventType = UnknownType;
type MessageType = UnknownType;
type ReactionType = UnknownType;
type CommandType = string & {};

export type StreamTypes = {
  attachmentType: AttachmentType;
  channelType: ChannelType;
  commandType: CommandType;
  eventType: EventType;
  messageType: MessageType;
  reactionType: ReactionType;
  userType: UserType;
};

let voidReturn: void | { unsubscribe: () => void };
let voidPromise: Promise<void>;

const client: StreamChat<StreamTypes> = new StreamChat<StreamTypes>(apiKey, undefined, {
  timeout: 3000,
  logger: (logLevel: string, msg: string, extraData?: Record<string, unknown>) => {},
});

const clientWithoutSecret: StreamChat<{
  attachmentType: {};
  channelType: ChannelType;
  commandType: string & {};
  eventType: {};
  messageType: {};
  reactionType: {};
  userType: UserType;
}> = new StreamChat<{
  attachmentType: {};
  channelType: ChannelType;
  commandType: string & {};
  eventType: {};
  messageType: {};
  reactionType: {};
  userType: UserType;
}>(apiKey, {
  timeout: 3000,
  logger: (logLevel: string, msg: string, extraData?: Record<string, unknown>) => {},
});

const singletonClient = StreamChat.getInstance<StreamTypes>(apiKey);

const singletonClient1: StreamChat<{
  attachmentType: {};
  channelType: ChannelType;
  commandType: string & {};
  eventType: {};
  messageType: {};
  reactionType: {};
  userType: UserType;
}> = StreamChat.getInstance<{
  attachmentType: {};
  channelType: ChannelType;
  commandType: string & {};
  eventType: {};
  messageType: {};
  reactionType: {};
  userType: UserType;
}>(apiKey);

const singletonClient2: StreamChat<{
  attachmentType: {};
  channelType: ChannelType;
  commandType: string & {};
  eventType: {};
  messageType: {};
  reactionType: {};
  userType: {};
}> = StreamChat.getInstance<{
  attachmentType: {};
  channelType: ChannelType;
  commandType: string & {};
  eventType: {};
  messageType: {};
  reactionType: {};
  userType: {};
}>(apiKey, '', {});

const devToken: string = client.devToken('joshua');
const token: string = client.createToken('james', 3600);
const authType: string = client.getAuthType();

voidReturn = client.setBaseURL('https://chat-us-east-1.stream-io-api.com/');
const settingsPromise: Promise<APIResponse> = client.updateAppSettings({});
const appPromise: Promise<AppSettingsAPIResponse> = client.getAppSettings();
voidPromise = client.disconnectUser();

const updateRequest: PartialUserUpdate<StreamTypes> = {
  id: 'vishal',
  set: {
    name: 'Awesome',
  },
  unset: ['example'],
};

const updateUser: Promise<{
  users: { [key: string]: UserResponse<StreamTypes> };
}> = client.partialUpdateUser(updateRequest);
const updateUsers: Promise<{
  users: { [key: string]: UserResponse<StreamTypes> };
}> = client.partialUpdateUsers([updateRequest]);

const updateUsersWithSingletonClient: Promise<{
  users: { [key: string]: UserResponse<StreamTypes> };
}> = singletonClient.partialUpdateUsers([updateRequest]);

const eventHandler = (event: Event) => {};
voidReturn = client.on(eventHandler);
voidReturn = client.off(eventHandler);
voidReturn = client.on('message.new', eventHandler);
voidReturn = client.off('message.new', eventHandler);

let userReturn: ConnectAPIResponse<StreamTypes>;
userReturn = client.connectUser({ id: 'john', phone: 2 }, devToken);
userReturn = client.connectUser({ id: 'john', phone: 2 }, async () => 'token');
userReturn = client.setUser({ id: 'john', phone: 2 }, devToken);
userReturn = client.setUser({ id: 'john', phone: 2 }, async () => 'token');

userReturn = client.connectAnonymousUser();
userReturn = client.setAnonymousUser();
userReturn = client.setGuestUser({ id: 'steven' });

type X = { x: string };
let clientRes: Promise<X>;
clientRes = client.get<X>('https://chat-us-east-1.stream-io-api.com/', { id: 2 });
clientRes = client.put<X>('https://chat-us-east-1.stream-io-api.com/', { id: 2 });
clientRes = client.post<X>('https://chat-us-east-1.stream-io-api.com/', { id: 2 });
clientRes = client.patch<X>('https://chat-us-east-1.stream-io-api.com/', { id: 2 });
clientRes = client.delete<X>('https://chat-us-east-1.stream-io-api.com/', { id: 2 });

const file: Promise<SendFileAPIResponse> = client.sendFile(
  'aa',
  'bb',
  'text.jpg',
  'image/jpg',
  { id: 'james' },
);

const type: EventTypes = 'user.updated';
const event: Event<StreamTypes> = {
  type,
  cid: 'channelid',
  message: {
    id: 'id',
    text: 'Heloo',
    type: 'system',
    updated_at: '',
    created_at: '',
    html: 'Hello',
  },
  reaction: {
    type: 'like',
    message_id: '',
    user: {
      id: 'john',
    },
    created_at: '',
    updated_at: '',
    score: 10,
  },
  member: { user_id: 'john' },
  user: { id: 'john', online: true },
  unread_count: 3,
  online: true,
};
voidReturn = client.dispatchEvent(event);
voidPromise = client.recoverState();

const channels: Promise<Channel<StreamTypes>[]> = client.queryChannels({}, {}, {});
channels.then((response) => {
  const type: string = response[0].type;
  const cid: string = response[0].cid;
});

const channel: Channel<StreamTypes> = client.channel('messaging', 'channelName', {
  color: 'green',
});
const channelState: ChannelState<StreamTypes> = channel.state;
const chUser1: ChannelMemberResponse<StreamTypes> = channelState.members.someUser12433222;
const chUser2: ChannelMemberResponse<StreamTypes> =
  channelState.members.someUser124332221;

const chUser3: UserResponse<StreamTypes> = channelState.read.someUserId.user;
const typing: Event<StreamTypes> = channelState.typing['someUserId'];

const acceptInvite: Promise<UpdateChannelAPIResponse<StreamTypes>> = channel.acceptInvite(
  {},
);

voidReturn = channel.on(eventHandler);
voidReturn = channel.off(eventHandler);
voidReturn = channel.on('message.new', eventHandler);
voidReturn = channel.off('message.new', eventHandler);

channel.sendMessage({ text: 'text' }); // send a msg without id

const permissions = [
  new Permission(
    'Admin users can perform any action',
    MaxPriority,
    AnyResource,
    AnyRole,
    false,
    Allow,
  ),
  new Permission(
    'Anonymous users are not allowed',
    500,
    AnyResource,
    ['anonymous'],
    false,
    Deny,
  ),
  new Permission(
    'Users can modify their own messages',
    400,
    AnyResource,
    ['user'],
    true,
    Allow,
  ),
  new Permission('Users can create channels', 300, AnyResource, ['user'], false, Allow),
  new Permission(
    'Channel Members',
    200,
    ['ReadChannel', 'CreateMessage'],
    ['channel_member'],
    false,
    Allow,
  ),
  new Permission('Discard all', 100, AnyResource, AnyRole, false, Deny),
];

client.updateChannelType('messaging', { permissions }).then((response) => {
  const permissions: PermissionObject[] = response.permissions || [];
  const permissionName: string = permissions[0].name || '';
  const permissionRoles: string[] = permissions[0].roles || [];
});

client.queryChannels({
  members: {
    $in: ['vishal'],
  },
  cid: {
    $in: ['messaging:channelid'],
  },
  name: {
    $autocomplete: 'chan',
  },
});

const testChannelUpdate = channel.update({
  ...channel._data,
  name: 'helloWorld',
  color: 'yellow',
});

const testChannelUpdate2 = channel.update({
  ...channel.data,
  name: 'helloWorld2',
  color: 'yellow',
});

// Good
const testChannel1 = client.channel('hello', { color: 'red' });
const testChannel2 = client.channel('hello2', 'myId', { color: 'green' });
const testChannel3 = client.channel('hello3');
const testChannel4 = client.channel('hello4', undefined, { color: 'red ' });
// Bad
// const testChannel5 = client.channel('hello3', { color: 'newColor' }, { color: 'green' });

// TODO: Fix this
// channel.queryMembers({
//   $or: [
//     { name: { $autocomplete: 'Rob' } }, // rob, rob2
//     { banned: true }, // banned
//     { is_moderator: true }, // mod
//     {
//       // invited
//       $and: [
//         { name: { $q: 'Mar' } },
//         { invite: 'accepted' },
//         {
//           $or: [
//             { name: { $autocomplete: 'mar' } },
//             { invite: 'rejected' },
//           ],
//         },
//       ],
//     },
//     {
//       // no match
//       $nor: [
//         {
//           $and: [{ name: { $q: 'Car' } }, { invite: 'accepted' }],
//         },
//       ],
//     },
//   ],
// });
