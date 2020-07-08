import {
  StreamChat,
  Event,
  Deny,
  AnyRole,
  Allow,
  AnyResource,
  Permission,
  MaxPriority,
} from 'stream-chat';
const apiKey = 'apiKey';

// $ExpectType StreamChat
const client = new StreamChat(apiKey, null, {
  timeout: 3000,
  logger: (logLevel: string, msg: string, extraData: {}) => {},
});

const clientWithoutSecret = new StreamChat(apiKey, {
  timeout: 3000,
  logger: (logLevel: string, msg: string, extraData: {}) => {},
});

const devToken = client.devToken('joshua'); // $ExpectType string
client.createToken('james', 3600); // $ExpectType string
client.getAuthType(); // $ExpectType string

client.setBaseURL('https://chat-us-east-1.stream-io-api.com/'); // $ExpectType void
client.updateAppSettings({}); // $ExpectType Promise<object>
client.getAppSettings(); // $ExpectType Promise<object>
client.disconnect(); // $ExpectType Promise<void>
const updateRequest = {
  id: 'vishal',
  set: {
    name: 'Awesome',
  },
  unset: ['example'],
};

client.partialUpdateUser(updateRequest); // $ExpectType Promise<UpdateUsersAPIResponse>
client.partialUpdateUsers([updateRequest]); // $ExpectType Promise<UpdateUsersAPIResponse>

const eventHandler = (event: Event) => {};
client.on(eventHandler);
client.off(eventHandler);
client.on('message.new', eventHandler);
client.off('message.new', eventHandler);

client.setUser({ id: 'john', phone: 2 }, devToken); // $ExpectType Promise<ConnectAPIResponse>
client.setUser({ id: 'john', phone: 2 }, async () => 'token'); // $ExpectType Promise<ConnectAPIResponse>
client.setAnonymousUser(); // $ExpectType Promise<void>
client.setGuestUser({ id: 'steven' }); // $ExpectType Promise<void>

client.get('https://chat-us-east-1.stream-io-api.com/', { id: 2 }); // $ExpectType Promise<APIResponse>
client.put('https://chat-us-east-1.stream-io-api.com/', { id: 2 }); // $ExpectType Promise<APIRespone>
client.post('https://chat-us-east-1.stream-io-api.com/', { id: 2 }); // $ExpectType Promise<APIResponse>
client.delete('https://chat-us-east-1.stream-io-api.com/', { id: 2 }); // $ExpectType Promise<APIResponse>

client.sendFile('aa', 'bb', 'text.jpg', 'image/jpg', { id: 'james' }); // $ExpectType Promise<FileUploadAPIResponse>

const event = {
  cid: 'channelid',
  type: 'user.updated',
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
client.dispatchEvent(event); // $ExpectType void
client.handleEvent(event); // $ExpectType void
client.recoverState(); // $ExpectType Promise<void>

const channels = client.queryChannels({}, {}, {});
channels.then(response => {
  response[0].type; // $ExpectType string
  response[0].cid; // $ExpectType string
});

const channel = client.channel('messaging', 'channelName', { color: 'green' }); // $ExpectType Channel
const channelState = channel.state; // $ExpectType ChannelState
channelState.members.someUser12433222; // $ExpectType ImmutableObject<ChannelMemberResponse>
channelState.members.someUser124332221; // $ExpectType ImmutableObject<ChannelMemberResponse>

channelState.read.someUserId.user; // $ExpectType ImmutableObject<UserResponse>
channelState.typing.someUserId; // $ExpectType ImmutableObject<Event<"typing.start">>
const acceptInvite = channel.acceptInvite({}); // $ExpectType Promise<AcceptInviteAPIResponse>
acceptInvite.then(value => {
  const resp = value; // $ExpectType AcceptInviteAPIResponse
  return resp;
});

channel.on(eventHandler);
channel.off(eventHandler);
channel.on('message.new', eventHandler);
channel.off('message.new', eventHandler);

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
  const permissions = response.permissions;
  const permissionName: string = permissions[0].name;
  const permissionRoles: string[] = permissions[0].roles;
});
