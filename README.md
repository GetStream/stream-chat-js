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

This library can be used by both frontend and backend applications. For frontend, we have frameworks that are based on this library such as the [Flutter](https://github.com/GetStream/stream-chat-flutter), [React](https://github.com/GetStream/stream-chat-react) and [Angular](https://github.com/GetStream/stream-chat-angular) SDKs. For more information, check out our [documentation](https://getstream.io/chat/docs/).

## ⚙️ Installation

### NPM

```bash
npm install stream-chat
```

### Yarn

```bash
yarn add stream-chat
```

## ✨ Getting Started

```ts
import { StreamChat } from 'stream-chat';
// or if you are using CommonJS
const { StreamChat } = require('stream-chat');

const client = new StreamChat('API_KEY', 'API_SECRET', {
  disableCache: true, // recommended option for server-side use
  // ...other options like `baseURL`...
});

// create a user
await client.upsertUser({
  id: 'vishal-1',
  name: 'Vishal',
});

// create a channel
const channel = client.channel('messaging', 'test-channel', {
  created_by_id: 'vishal-1',
});
await channel.create();

// send message
const { message } = await channel.sendMessage({ text: 'This is a test message' });

// send reaction
await channel.sendReaction(message.id, { type: 'love', user: { id: 'vishal-1' } });
```

The `StreamChat` client is set up to allow extension of the base types through use of module augmentation, custom types will carry through to all client returns and provide code-completion to queries (if supported). To extend Stream's entities with custom data you'll have to create a declaration file and make sure it's loaded by TypeScript, [see the list of extendable interfaces](https://github.com/GetStream/stream-chat-js/blob/master/src/custom_types.ts) and the example bellow using two of the most common ones:

```ts
// stream-custom-data.d.ts

import 'stream-chat';

declare module 'stream-chat' {
  interface CustomMessageData {
    custom_property?: number;
  }
  interface CustomUserData {
    profile_picture?: string;
  }
}

// index.ts

// property `profile_picture` is code-completed and expects type `string | undefined`
await client.partialUpdateUser({
  id: 'vishal-1',
  set: { profile_picture: 'https://random.picture/1.jpg' },
});

// property `custom_property` is code-completed and expects type `number | undefined`
const { message } = await channel.sendMessage({
  text: 'This is another test message',
  custom_property: 255,
});

message.custom_property; // in the response object as well
```

> [!WARNING]  
> Generics mechanism has been removed in version `9.0.0` in favour of the module augmentation, please see [the release guide](https://getstream.io/chat/docs/node/upgrade-stream-chat-to-v9) on how to migrate.

## 🔗 (Optional) Development Setup in Combination With Our SDKs

### Connect to [Stream Chat React Native SDK](https://github.com/GetStream/stream-chat-react-native)

Run in the root of this repository:

```sh
yarn link
```

Run in the root of one of the example applications (SampleApp/TypeScriptMessaging) in the `stream-chat-react-native` repository:

```sh
yarn link stream-chat
yarn start
```

Open `metro.config.js` file and set value for `watchFolders` as:

```js
const streamChatRoot = '<PATH TO YOUR PROJECT>/stream-chat-js'

module.exports = {
  // the rest of the metro configuration goes here
  ...
  watchFolders: [projectRoot].concat(alternateRoots).concat([streamChatRoot]),
  resolver: {
    // the other resolver configurations go here
    ...
    extraNodeModules: {
      // the other extra node modules go here
      ...
      'stream-chat': streamChatRoot
    }
  }
};
```

Make sure to replace `<PATH TO YOUR PROJECT>` with the correct path for the `stream-chat-js` folder as per your directory structure.

Run in the root of this repository:

```sh
yarn start
```

## 📚 More Code Examples

Read up more on [Logging](./docs/logging.md) and [User Token](./docs/userToken.md) or visit our [documentation](https://getstream.io/chat/docs/) for more examples.

## ✍️ Contributing

We welcome code changes that improve this library or fix a problem, please make sure to follow all best practices and add tests if applicable before submitting a Pull Request on Github. We are very happy to merge your code in the official repository. Make sure to sign our [Contributor License Agreement (CLA)](https://docs.google.com/forms/d/e/1FAIpQLScFKsKkAJI7mhCr7K9rEIOpqIDThrWxuvxnwUq2XkHyG154vQ/viewform) first. See our [license file](./LICENSE) for more details.

Head over to [CONTRIBUTING.md](./CONTRIBUTING.md) for some development tips.

## 🧑‍💻 We Are Hiring!

We've recently closed a [$38 million Series B funding round](https://techcrunch.com/2021/03/04/stream-raises-38m-as-its-chat-and-activity-feed-apis-power-communications-for-1b-users/) and we keep actively growing.
Our APIs are used by more than a billion end-users, and you'll have a chance to make a huge impact on the product within a team of the strongest engineers all over the world.

Check out our current openings and apply via [Stream's website](https://getstream.io/team/#jobs).
