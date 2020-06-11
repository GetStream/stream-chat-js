# Stream Chat JS

[![Actions Status](https://github.com/GetStream/stream-chat-js/workflows/build/badge.svg)](https://github.com/GetStream/stream-chat-js/actions)

[![NPM](https://nodei.co/npm/stream-chat.png)](https://www.npmjs.com/package/stream-chat)

stream-chat-js is the official JavaScript client for Stream Chat, a service for building chat applications.

You can sign up for a Stream account at https://getstream.io/chat/get_started/.

### Installation

#### Install with NPM

```bash
npm install stream-chat
```

#### Install with Yarn

```bash
yarn add stream-chat
```

#### Using JS deliver

```html
<script src="https://cdn.jsdelivr.net/npm/stream-chat"></script>
```

### API Documentation

Documentation for this JavaScript client are available at the [Stream website](https://getstream.io/chat/docs/?language=js)

### More

- [Logging](docs/logging.md)
- [User Token](docs/userToken.md)

### Publishing a new version

Note that you need 2FA enabled on NPM, publishing with Yarn gives error, use NPM directly for this:

```
npm version bug
npm publish
```

### Contributing

We welcome code changes that improve this library or fix a problem, please make sure to follow all best practices and add tests if applicable before submitting a Pull Request on Github. We are very happy to merge your code in the official repository. Make sure to sign our [Contributor License Agreement (CLA)](https://docs.google.com/forms/d/e/1FAIpQLScFKsKkAJI7mhCr7K9rEIOpqIDThrWxuvxnwUq2XkHyG154vQ/viewform) first. See our license file for more details.
