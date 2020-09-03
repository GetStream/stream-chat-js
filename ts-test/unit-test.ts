// basic sanity check
import Immutable from 'seamless-immutable';

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
  ConnectionOpen,
  SendFileAPIResponse,
  UnknownType,
  Channel,
  EventTypes,
  ChannelState,
  ChannelMemberResponse,
  UpdateChannelAPIResponse,
  PartialUserUpdate,
  PermissionObject,
} from '..';
const apiKey = 'apiKey';

type UserType = {
  id: string;
  name?: string;
  example?: number;
  phone?: number;
};

type ChannelType = {
  color: string;
};

type AttachmentType = UnknownType;
type EventType = UnknownType;
type MessageType = UnknownType;
type ReactionType = UnknownType;

let voidReturn: void | { unsubscribe: () => void };
let voidPromise: Promise<void>;

const client: StreamChat<
  ChannelType,
  UserType,
  MessageType,
  AttachmentType,
  ReactionType,
  EventType
> = new StreamChat<
  ChannelType,
  UserType,
  MessageType,
  AttachmentType,
  ReactionType,
  EventType
>(apiKey, undefined, {
  timeout: 3000,
  logger: (logLevel: string, msg: string, extraData?: Record<string, unknown>) => {},
});

const clientWithoutSecret: StreamChat<ChannelType, UserType> = new StreamChat<
  ChannelType,
  UserType
>(apiKey, {
  timeout: 3000,
  logger: (logLevel: string, msg: string, extraData?: Record<string, unknown>) => {},
});

const devToken: string = client.devToken('joshua');
const token: string = client.createToken('james', 3600);
const authType: string = client.getAuthType();

voidReturn = client.setBaseURL('https://chat-us-east-1.stream-io-api.com/');
const settingsPromise: Promise<APIResponse> = client.updateAppSettings({});
const appPromise: Promise<AppSettingsAPIResponse> = client.getAppSettings();
voidPromise = client.disconnect();

const updateRequest: PartialUserUpdate<UserType> = {
  id: 'vishal',
  set: {
    name: 'Awesome',
  },
  unset: ['example'],
};

const updateUser: Promise<{
  users: { [key: string]: UserResponse<UserType> };
}> = client.partialUpdateUser(updateRequest);
const updateUsers: Promise<{
  users: { [key: string]: UserResponse<UserType> };
}> = client.partialUpdateUsers([updateRequest]);

const eventHandler = (event: Event) => {};
voidReturn = client.on(eventHandler);
voidReturn = client.off(eventHandler);
voidReturn = client.on('message.new', eventHandler);
voidReturn = client.off('message.new', eventHandler);

let userReturn: Promise<void | ConnectionOpen<ChannelType, UserType>>;
userReturn = client.setUser({ id: 'john', phone: 2 }, devToken);
userReturn = client.setUser({ id: 'john', phone: 2 }, async () => 'token');

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
const event = {
  type,
  cid: 'channelid',
  message: {
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

const channels: Promise<Channel<
  AttachmentType,
  ChannelType,
  EventType,
  MessageType,
  ReactionType,
  UserType
>[]> = client.queryChannels({}, {}, {});
channels.then(response => {
  const type: string = response[0].type;
  const cid: string = response[0].cid;
});

const channel: Channel<
  AttachmentType,
  ChannelType,
  EventType,
  MessageType,
  ReactionType,
  UserType
> = client.channel('messaging', 'channelName', { color: 'green' });
const channelState: ChannelState<
  AttachmentType,
  ChannelType,
  EventType,
  MessageType,
  ReactionType,
  UserType
> = channel.state;
const chUser1: Immutable.ImmutableObject<ChannelMemberResponse<UserType>> =
  channelState.members.someUser12433222;
const chUser2: Immutable.ImmutableObject<ChannelMemberResponse<UserType>> =
  channelState.members.someUser124332221;

const chUser3: Immutable.ImmutableObject<UserResponse<UserType>> =
  channelState.read.someUserId.user;
const typing: Immutable.ImmutableObject<Event<
  EventType,
  AttachmentType,
  ChannelType,
  MessageType,
  ReactionType,
  UserType
>> = channelState.typing['someUserId'];

const acceptInvite: Promise<UpdateChannelAPIResponse<
  ChannelType,
  AttachmentType,
  MessageType,
  ReactionType,
  UserType
>> = channel.acceptInvite({});

voidReturn = channel.on(eventHandler);
voidReturn = channel.off(eventHandler);
voidReturn = channel.on('message.new', eventHandler);
voidReturn = channel.off('message.new', eventHandler);

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

client.updateChannelType('messaging', { permissions }).then(response => {
  const permissions: PermissionObject[] = response.permissions || [];
  const permissionName: string = permissions[0].name || '';
  const permissionRoles: string[] = permissions[0].roles || [];
});
