## May 15, 2020 - 1.10.1

- Reverting uuid version change from 1.10.0 due to incompatibility with react-native [issue](https://github.com/uuidjs/uuid#getrandomvalues-not-supported)

## May 15, 2020 - 1.10.0

- Token refresh functionality [#327](https://github.com/GetStream/stream-chat-js/pull/327)
- Bump uuid version to `8.0.0` [d1957d9](https://github.com/GetStream/stream-chat-js/commit/d1957d97c10f459b0ba8131e1c187cecf19ae17e)
- Updated typescript for multitenant feature [6160aa6](https://github.com/GetStream/stream-chat-js/commit/6160aa6ddb45aca46633818967495253343fb359)
- Updated flag function signatures to allow server side flagging/unflagging [05c2281](https://github.com/GetStream/stream-chat-js/commit/05c22811780f801255e94a4180c1613438af6319)
- Disabled presence by default for queryUsers endpoint [26616f5](https://github.com/GetStream/stream-chat-js/commit/26616f5b353b6f0cc8ea7dd87cf2d32e7058672e)

## May 13, 2020 - 1.9.0

- Multi-tenant feature
- Ws Disconnect improvements - forcefully assume closed after 1 sec
- Silent message feature

## April 29, 2020 - 1.8.0
- **Breaking:** updated typescript namespace to avoid conflict with getstream package
  - Fixes: GetStream/stream-js#258

## April 20, 2020 - 1.7.4

- Fixed types for verifyWebhook function

## April 15, 2020 - 1.7.3

- Adding missing event types in typescript file - [8ed49dd](https://github.com/GetStream/stream-chat-js/commit/8ed49ddf6af9d0325af920c985d1092758d6215a)

## April 9, 2020 - 1.7.2

- Fixing typescript for StreamChat, Channel and ChannelState classes [2c78981](https://github.com/GetStream/stream-chat-js/commit/2c789815c1c4ae59121cc2109f4109b1d871cdce)

## April 7, 2020 - 1.7.1

- Fixing typescript for getConfig function in Channel class [5bf2d7e](https://github.com/GetStream/stream-chat-js/commit/5bf2d7e8b6f1434a857dd8367b5a11c4fc839c37)

## April 3, 2020 - 1.7.0

## April 7, 2020 - 1.7.1

- Add types for channel.getConfig()

## April 2, 2020 - 1.6.2

- Adding (missing) following permission constants in typescript file [5b08dec](https://github.com/GetStream/stream-chat-js/commit/5b08dec04e623e940fb5cdffaa2e1ed9410731ae#diff-5b99411a607296a74a128d9535a49dbe)
  - Allow
  - Deny
  - AnyResource
  - AnyRole
  - MaxPriority
  - MinPriority

- Moving following dependencies from devDependencies to dependencies to avoid ts errors regarding missing types [5b08dec](https://github.com/GetStream/stream-chat-js/commit/5b08dec04e623e940fb5cdffaa2e1ed9410731ae#diff-b9cfc7f2cdf78a7f4b91a753d10865a2)

  - @types/seamless-immutable
  - @types/ws

## March 27, 2020 - 1.6.1

- Reverting [c5413c0](https://github.com/GetStream/stream-chat-js/commit/c5413c07e6743e056b04ade7ccacebeb0f2b1b4f)
  
  Commit description: Avoid duplication of reaction, by adding check for existing reaction
  
  Reason:
    1. latest_reactions only contain 10 reactions. So the added check is not sufficient.
    2. It will need handle remove reactions as well.
    3. own_reactions doesn't contain user object always. So that use case will need handling as well.

## March 27, 2020 - 1.6.0

- Deprecating updateUser and updateUsers api from StreamChat client.
- Introducing alias for updateUser and updateUsers api
  - updateUser --> upsertUser
  - updateUsers --> upsertUsers
- Fixing typescript for StreamChat constructor [583b528](https://github.com/GetStream/stream-chat-js/commit/583b528f40dfaa74fec6819c5cb57ec4a592350e)
- Fixing typescript for event subscribers [a0c2ef0](https://github.com/GetStream/stream-chat-js/commit/a0c2ef0f4c7e88d58ac1e7e32d7b82f9f90b1d06)
- Added typescript for getMessage and getMessagesById endpoint [a0c2ef0](https://github.com/GetStream/stream-chat-js/commit/a0c2ef0f4c7e88d58ac1e7e32d7b82f9f90b1d06)
- Avoid duplication of reaction, by adding check for existing reaction [c5413c0](https://github.com/GetStream/stream-chat-js/commit/c5413c07e6743e056b04ade7ccacebeb0f2b1b4f)

## March 20, 2020 - 1.5.1

- Fixing `removeMessage` function in ChannelState to handle thread message - [e67a432](https://github.com/GetStream/stream-chat-js/commit/13bdeb75d60370e00abac3e0bc57d81733d40b8e)
- Fixing typescript file for channel mutes - [c7fefa8](https://github.com/GetStream/stream-chat-js/commit/c7fefa8c836658b305dd567b0b6479672bcc745a)

## March 19, 2020 - 1.5.0

- Support for channel mutes

## March 10, 2020 - 1.4.0

- Support filtering by messages custom fields  - [#264](https://github.com/GetStream/stream-chat-js/pull/264)

## March 3, 2020 - 1.3.4

- Increment wsID when ws connection is disconnected manually, to ensure any of the callbacks (onclose, onerror etc) are obsolete - [792de5b](https://github.com/GetStream/stream-chat-js/commit/792de5ba178d00dd94fb8e41abdaadf45d7d436f)

## February 17, 2020 - 1.3.3

- Fixing broken browser bundle - fixes [#259](https://github.com/GetStream/stream-chat-js/issues/259)
- Allowing `.off` (event listener removal) on uninitialized channels - [985155f](https://github.com/GetStream/stream-chat-js/commit/985155fe91a571522a78936803a802e6c5cbe3e9)

## February 10, 2020 - 1.3.2

- Fixing client.disconnect and connection.disconnect to always return promise - [600da6c](https://github.com/GetStream/stream-chat-js/commit/600da6cfcbfbf347916934b51e5b9c185a18df40)
- Fixing type definitions for Reaction object - [08c802e](https://github.com/GetStream/stream-chat-js/commit/08c802e0e12848b9d99067465b470cae60f11c00)
- Fixing type definitions for channel method on client - [f2d99b8](https://github.com/GetStream/stream-chat-js/commit/f2d99b8067bee8b7818b5f8e8e83f8c1d0e7c63c)

## February 5, 2020 - 1.3.1

- Adding some more logs for ws connection callback handlers such as onclose, onmessage, onerror - [b54fa53](https://github.com/GetStream/stream-chat-js/commit/b54fa5392a727b48a1552e03911c0fb1b35f7a03)

## January 25, 2020 - 1.3.0

- Added tests for channels operator $in with custom fields - [1896d98](https://github.com/GetStream/stream-chat-js/commit/1896d98a98968a920b3c1539e50649fa7a33462f)
- Fixed types (in typescript declaration file) for sendReaction function in channel - [e0aa1fa](https://github.com/GetStream/stream-chat-js/commit/e0aa1fa90e8bcc4fde595ea06ef04feea866da8b)
- Fixed types (in typescript declaration file) for sendFile and sendImage functions - [346048f](https://github.com/GetStream/stream-chat-js/commit/346048fa274bf7289f0bb56541e45764f27136ee)
- Added `getMessagesById` endpoint for channel - [cdc2a8e](https://github.com/GetStream/stream-chat-js/commit/cdc2a8ec503bf72a5da6ac3b0d988875926e0bbe)

## January 14, 2020 - 1.2.3

- Updated devtoken methode (for compatibility with RN). Switching to [base64-js](https://www.npmjs.com/package/base64-js) - [96c338e](https://github.com/GetStream/stream-chat-js/commit/96c338e5725a47d5c3bb6081a93107595b646ede)
- Fixed types (in typescript declaration file) for setUser function of client - [6139e4e](https://github.com/GetStream/stream-chat-js/commit/6139e4ecf51fe357c4262404f7df0fc20b4b6cba)
- Fixed and updated types for partialUpdateUser function - [201257d](https://github.com/GetStream/stream-chat-js/commit/201257ddad75588731380ec97f578e43f4ee0a82)

## December 16, 2019 - 1.2.2

- Handling `channel.hidden` event

## December 3, 2019 - 1.2.1

- Handling `channel.truncated` event
- Support for system message for addMember/removeMember functionality
- Throw clear errors when trying to build tokens without secret

## October 25, 2019 - 1.2.0

- Improve client.channel signature, support short-hand with only type and object as well as null or undefined ID (instead of only "")

## October 25, 2019 - 1.1.5

- Add support for member invites after channel creation.

## October 15, 2019 - 1.1.6

- Fixing types for client and connection in typescript declaration file.

## October 10, 2019 - 1.1.5

- Fix for issue [#133](https://github.com/GetStream/stream-chat-js/issues/133) - Updating user object in client, when `user.updated` is received corresponding to user of client
- Adding types for ChannelData object
- Fixing tests

## October 07, 2019 - 1.1.4

## October 07, 2019 - 1.1.3

- File upload issue fix - Allowing File object as valid uri in sendFile function in client.

## September 30, 2019 - 1.1.2

- Moving @types to devDependencies

## September 27, 2019 - 1.1.1

- Syncing and improving the typescript declaration file

## September 23, 2019 - 1.1.0

- Added `channel.hide` and `channel.show`

## September 12, 2019 - 1.0.5

- Improving event handling in js client. Earlier, event listeners on client were executed before channel could handle the event and update the state. This has been fixed by handling event completely on client and channel level first before executing any of the listeners on client or channel.

## July 31, 2019 - 1.0.4

- Added error logs for errors in API calls

## July 23, 2019 - 1.0.3

- Support \$exists operator for queryChannels/queryUsers

## July 22, 2019 - 1.0.2

- Support hard delete messages for server side auth

## July 19, 2019 - 1.0.1

- Fixing broken types in ts declaration file : [264ee9a87d6591d39f20b99d1d87381532b9957b](https://github.com/GetStream/stream-chat-js/commit/264ee9a87d6591d39f20b99d1d87381532b9957b)

## July 18 2019 - 1.0.0

- This library is stable and used in production already, bump to 1.0.0

## July 18 2019 - 0.13.8

- Avoid memory leaks server-side when client is created many times

## July 11 2019 - 0.13.7

- Track client version with WS
- Add configurable logging
- Bugfix: reconnection and threads' replies are now handled correctly
- Bugfix: replies pagination now works with both ASC and DESC ordering

## June 27 2019 - 0.13.6

- Improve reconnection mechanism

## June 20th 2019 - 0.13.5

- Added populated `channel.data` when calling `channel.watch()`

## April 29th 2019 - 0.12.0

- Improved channel.unreadCount

## April 28th 2019 - 0.10.1

- Improved user presence support. If listening to user presence, channel.state.members and channel.state.watchers
  are now automatically updated with the user's online/offline presence.

## April 27th 2019 - 0.10.0

- add channel.countUnreadMentions
- improve client.disconnect
- add userID param to add reactions server-side

## April 24th 2019 - 0.9.1

- add babel runtime to dependencies

## April 24th 2019 - 0.9.0

- GDPR endpoints: deleteUser, exportUser and deactivateUser

## April 24th 2019 - 0.8.0

- markRead now supports sending a message_id to mark the channel read up to (and including) that specific message
- added markAllRead client method
- countUnread can be called without any parameters now client-side and it will default to current user's read state

## April 9th 2019 - 0.7.2

- queryChannels used to return the list of members twice, this has now been resolved. However if you were using the duplicate list of members in channel.members you'll want to update to Object.values(channel.state.members)

## April 2nd 2019 - 0.5.0

- event.own_user renamed to event.me
- user.status.changed renamed to user.presence.changed
- connectResponse.unread renamed to connectResponse.unread_count
- channelState.online renamed to channelState.watcher_count
