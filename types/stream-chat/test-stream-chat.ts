import { StreamChat, Member } from 'stream-chat';
import { ImmutableObject, Immutable } from 'seamless-immutable';

const apiKey = 'apiKey';
const apiSecret = 'apiSecret';
// prettier-ignore
const client = new StreamChat(apiKey, null, { timeout: 3000, logger: (logLevel: string, msg: string, extraData: {}) => {}}); // $ExpectType StreamChat

const devToken = client.devToken('joshua'); // $ExpectType string
const userToken = client.createToken('james', 3600); // $ExpectType string
const authType = client.getAuthType(); // $ExpectType string

client.setBaseURL('https://chat-us-east-1.stream-io-api.com/'); // $ExpectType void
client.updateAppSettings({}); // $ExpectType Promise<object>
const currentSettings = client.getAppSettings(); // $ExpectType Promise<object>
client.disconnect(); // $ExpectType Promise<void>

client.setUser({ id: 'john', phone: 2 }, devToken); // $ExpectType Promise<void>
client.setAnonymousUser(); // $ExpectType Promise<void>
client.setGuestUser({ id: 'steven' }); // $ExpectType Promise<void>

client.get('https://chat-us-east-1.stream-io-api.com/', { id: 2 }); // $ExpectType Promise<APIResponse>
client.put('https://chat-us-east-1.stream-io-api.com/', { id: 2 }); // $ExpectType Promise<APIRespone>
client.post('https://chat-us-east-1.stream-io-api.com/', { id: 2 }); // $ExpectType Promise<APIResponse>
client.delete('https://chat-us-east-1.stream-io-api.com/', { id: 2 }); // $ExpectType Promise<APIResponse>

client.sendFile('aa', 'bb', 'text.jpg', 'image/jpg', 'james'); // $ExpectType Promise<APIResponse>

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
  },
  member: { id: 'john' },
  user: { id: 'john' },
  unread_count: 3,
  online: true,
};
client.dispatchEvent(event); // $ExpectType void
client.handleEvent(event); // $ExpectType void
client.recoverState(); // $ExpectType Promise<void>

const channel = client.channel('messaging', 'channelName', { color: 'green' }); // $ExpectType Channel
const channelState = channel.state; // $ExpectType ChannelState
const member = channelState.members.someUser; // $ExpectType ImmutableObject<Member>
const response = channelState.read.someUserId.user; // $ExpectType ImmutableObject<UserResponse>
const typingEvent = channelState.typing.someId; // $ExpectType ImmutableObject<TypingStartEvent>
