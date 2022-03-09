# Official JavaScript SDK for [Stream Chat](https://getstream.io/chat/)

[![NPM](https://img.shields.io/npm/v/stream-chat.svg)](https://www.npmjs.com/package/stream-chat)

<p align="center">
    <img src="./assets/logo.svg" width="50%" height="50%">
</p>
<p align="center">
    Official JavaScript API client for Stream Chat, a service for building chat applications.
    <br />
    <a href="https://getstream.io/chat/docs/"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/GetStream/stream-chat-js/issues">Report Bug</a>
    ·
    <a href="https://github.com/GetStream/stream-chat-js/issues">Request Feature</a>
</p>

## 📝 About Stream

You can sign up for a Stream account at our [Get Started](https://getstream.io/chat/get_started/) page.

This library can be used by both frontend and backend applications. For frontend, we have frameworks that are based on this library such as the [Flutter](https://github.com/GetStream/stream-chat-flutter), [React](https://github.com/GetStream/stream-chat-react) and [Angular](https://github.com/GetStream/stream-chat-angular) SDKs. For more information, check out our [docs](https://getstream.io/chat/docs/).

## ⚙️ Installation

### NPM

```bash
npm install stream-chat
```

### Yarn

```bash
yarn add stream-chat
```

### JS deliver

```html
<script src="https://cdn.jsdelivr.net/npm/stream-chat"></script>
```

## ✨ Getting started

The StreamChat client is setup to allow extension of the base types through use of generics when instantiated. The default instantiation has all generics set to `Record<string, unknown>`.

```typescript
import { StreamChat } from 'stream-chat';
// Or if you are on commonjs
const StreamChat = require('stream-chat').StreamChat;

const client = StreamChat.getInstance('YOUR_API_KEY', 'API_KEY_SECRET');

const channel = client.channel('messaging', 'TestChannel');
await channel.create();
```

Or you can customize the generics:

```typescript
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

const client = StreamChat.getInstance<StreamType>('YOUR_API_KEY', 'API_KEY_SECRET');

// Create channel
const channel = client.channel('messaging', 'TestChannel');
await channel.create();

// Create user
await client.upsertUser({
  id: 'vishal-1',
  name: 'Vishal',
});

// Send message
const { message } = await channel.sendMessage({ text: `Test message` });

// Send reaction
await channel.sendReaction(message.id, { type: 'love', user: { id: 'vishal-1' } });
```

Custom types provided when initializing the client will carry through to all client returns and provide intellisense to queries.

## 📚 More code examples

Head over to [docs/typescript.md](./docs/typescript.md) for more examples.

## ✍️ Contributing

We welcome code changes that improve this library or fix a problem, please make sure to follow all best practices and add tests if applicable before submitting a Pull Request on Github. We are very happy to merge your code in the official repository. Make sure to sign our [Contributor License Agreement (CLA)](https://docs.google.com/forms/d/e/1FAIpQLScFKsKkAJI7mhCr7K9rEIOpqIDThrWxuvxnwUq2XkHyG154vQ/viewform) first. See our [license file](./LICENSE) for more details.

Head over to [CONTRIBUTING.md](./CONTRIBUTING.md) for some development tips.

## 🧑‍💻 We are hiring!

We've recently closed a [$38 million Series B funding round](https://techcrunch.com/2021/03/04/stream-raises-38m-as-its-chat-and-activity-feed-apis-power-communications-for-1b-users/) and we keep actively growing.
Our APIs are used by more than a billion end-users, and you'll have a chance to make a huge impact on the product within a team of the strongest engineers all over the world.

Check out our current openings and apply via [Stream's website](https://getstream.io/team/#jobs).
