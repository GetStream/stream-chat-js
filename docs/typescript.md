# Typescript (v2.x.x)

The StreamChat client is setup to allow extension of the base types through use of generics when instantiated. The default instantiation has all generics set to `Record<string, unknown>`.

```typescript
StreamChat<{
  attachmentType: AttachmentType;
  channelType: ChannelType;
  commandType: CommandType;
  eventType: EventType;
  messageType: MessageType;
  reactionType: ReactionType;
  userType: UserType;
}>
```

Custom types provided when initializing the client will carry through to all client returns and provide intellisense to queries.

**NOTE:** If you utilize the `setAnonymousUser` function you must account for this in your user types.

```typescript
import { StreamChat } from 'stream-chat';
// or if you are on commonjs
const StreamChat = require('stream-chat').StreamChat;

type ChatChannel = { image: string; category?: string };
type ChatUser1 = { nickname: string; age: number; admin?: boolean };
type ChatUser2 = { nickname: string; avatar?: string };
type UserMessage = { country?: string };
type AdminMessage = { priorityLevel: number };
type ChatAttachment = { originalURL?: string };
type CustomReaction = { size?: number };
type ChatEvent = { quitChannel?: boolean };
type CustomCommands = 'giphy';

type StreamType = {
  attachmentType: ChatAttachment;
  channelType: ChatChannel;
  commandType: CustomCommands;
  eventType: ChatEvent;
  messageType: UserMessage | AdminMessage;
  reactionType: CustomReaction;
  userType: ChatUser1 | ChatUser2;
};

// Instantiate a new client (server side)
// you can also use `new StreamChat<T,T,...>()`
const client = StreamChat.getInstance<StreamType>('YOUR_API_KEY', 'API_KEY_SECRET');

/**
 * Instantiate a new client (client side)
 * Unused generics default to Record<string, unknown>
 * with the exception of Command which defaults to string & {}
 */
const client = StreamChat.getInstance<StreamType>('YOUR_API_KEY');
```

Query operations will return results that utilize the custom types added via generics. In addition the query filters are type checked and provide intellisense using both the key and type of the parameter to ensure accurate use.

```typescript
// Valid queries
// users: { duration: string; users: UserResponse<ChatUser1 | ChatUser2>[]; }
const users = await client.queryUsers({ id: '1080' });
const users = await client.queryUsers({ nickname: 'streamUser' });
const users = await client.queryUsers({ nickname: { $eq: 'streamUser' } });

// Invalid queries
const users = await client.queryUsers({ nickname: { $contains: ['stream'] } }); // $contains is only an operator on arrays
const users = await client.queryUsers({ nickname: 1080 }); // nickname must be a string
const users = await client.queryUsers({ name: { $eq: 1080 } }); // name must be a string
```

**Note:** If you have differing union types like `ChatUser1 | ChatUser2` or `UserMessage | AdminMessage` you can use [type guards](https://www.typescriptlang.org/docs/handbook/advanced-types.html#type-guards-and-differentiating-types) to maintain type safety when dealing with the results of queries.

```typescript
function isChatUser1(user: ChatUser1 | ChatUser2): user is ChatUser1 {
  return (user as ChatUser1).age !== undefined;
}

function isAdminMessage(msg: UserMessage | AdminMessage): msg is AdminMessage {
  return (msg as AdminMessage).priorityLevel !== undefined;
}
```

Intellisense, type checking, and return types are provided for all queries.

```typescript
const channel = client.channel('messaging', 'TestChannel');
await channel.create();

// Valid queries
// messages: SearchAPIResponse<ChatAttachment, ChatChannel, CommandTypes, UserMessage | AdminMessage, CustomReaction, ChatUser1 | ChatUser2>
const messages = await channel.search({ country: 'NL' });
const messages = await channel.search({ priorityLevel: { $gt: 5 } });
const messages = await channel.search({
  $and: [{ priorityLevel: { $gt: 5 } }, { deleted_at: { $exists: false } }],
});

// Invalid queries
const messages = await channel.search({ country: { $eq: 5 } }); // country must be a string
const messages = await channel.search({
  $or: [{ id: '2' }, { reaction_counts: { $eq: 'hello' } }],
}); // reaction_counts must be a number
```

Custom types are carried into all creation functions as well.

```typescript
// Valid
client.connectUser({ id: 'testId', nickname: 'testUser', age: 3 }, 'TestToken');
client.connectUser({ id: 'testId', nickname: 'testUser', avatar: 'testAvatar' }, 'TestToken');

// Invalid
client.connectUser({ id: 'testId' }, 'TestToken'); // Type ChatUser1 | ChatUser2 requires nickname for both types
client.connectUser({ id: 'testId', nickname: true }, 'TestToken'); // nickname must be a string
client.connectUser({ id: 'testId', nickname: 'testUser', country: 'NL' }, 'TestToken'); // country does not exist on type ChatUser1 | ChatUser2
```

## More

- [Logging](./logging.md)
- [User Token](./userToken.md)
