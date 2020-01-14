import { StreamChat } from 'stream-chat';

const apiKey = 'apiKey';

// $ExpectType StreamChat
const client = new StreamChat(apiKey, null, {
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

client.setUser({ id: 'john', phone: 2 }, devToken); // $ExpectType Promise<ConnectAPIResponse>
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
  member: { id: 'john' },
  user: { id: 'john' },
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
// const typingEvent = channelState.typing.someId; // $ExpectType string
const acceptInvite = channel.acceptInvite({}); // $ExpectType Promise<AcceptInviteAPIResponse>
acceptInvite.then(value => {
  value; // $ExpectType AcceptInviteAPIResponse
});
