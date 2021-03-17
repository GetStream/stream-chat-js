# CHANGELOG

## March 17, 2021 - 3.6.2

- Added extra check in `client.updateMessage` to make sure we don't send `mentions_users` as array of user objects. If yes, then convert it
  to array of userIds (which is what API expects) [#647](https://github.com/GetStream/stream-chat-js/pull/647)

## March 16, 2021 - 3.6.1

- `message.__html` type is deprecated in favor of `message.html` [#646](https://github.com/GetStream/stream-chat-js/pull/646)
- `message.__html` is ignored `updateMessage` function [#645](https://github.com/GetStream/stream-chat-js/pull/645)

## March 15, 2021 - 3.6.0

- Add support to set `baseURL` from `options` [#644](https://github.com/GetStream/stream-chat-js/pull/644)
  - `StreamChat.getInstance('key', { baseURL })`

## March 11, 2021 - 3.5.1

Remove call to `channel._disconnect` from client.closeConnection. For end user this will fix the issue - `You can't use a channel after client.disconnect() was called` [#639](https://github.com/GetStream/stream-chat-js/pull/639)

## March 10, 2021 - 3.5.0

- Deprecated `client.disconnect`. A new method has been introduced as alias - `client.disconnectUser`
- Introduced following two methods on client:

  - client.openConnection - establish a ws connection on current client.
  - client.closeConnection - close the ws connection on current client, doesn't remove user

- Moved call to `setHealth(true)`, (which marks the connection as healthy) to only after you receive first event on websocket.
  Please check the description of PR [#626](https://github.com/GetStream/stream-chat-js/pull/626) for details.

## March 9, 2021 - 3.4.0

QueryMembers - Added support for pagination by user_id [0c41232](https://github.com/GetStream/stream-chat-js/commit/0c412321bc4de81b123574041e0abadf89f235df)

## March 9, 2021 - 3.3.0

### Feature

- Added the `Client.getRateLimits` function to retrieve rate limit quotas and usage, with the option to filter per platform and endpoint [#631](https://github.com/GetStream/stream-chat-js/pull/631)
- Support reactions sync for pinned messages in channel state [#629](https://github.com/GetStream/stream-chat-js/pull/629)

## March 8, 2021 - 3.2.0

### Feature

- Added the `Client.queryBannedUsers` function to query banned users with optional filters [#625](https://github.com/GetStream/stream-chat-js/pull/625)

## March 5, 2021 - 3.1.4

### Fix

- Clear (set to false) `isUpToDate` flag, when channel watcher is disconnected [#624](https://github.com/GetStream/stream-chat-js/pull/624)

## March 2, 2021 - 3.1.3

### Chore

- Change stream client header from `x-stream-client` to `X-Stream-Client` [#622](https://github.com/GetStream/stream-chat-js/pull/622)

## February 26, 2021 - 3.1.2

### Fix

- Fixed regression introduced in 3.1.0 causing `ChannelState.messages` not to update on incoming reaction events [#621](https://github.com/GetStream/stream-chat-js/pull/621)

## February 23, 2021 - 3.1.1

### Fix

- Channel state message list mutation [#619](https://github.com/GetStream/stream-chat-js/pull/619)

## February 17, 2021 - 3.1.0

### Feature

- `sendMessage` accepts a `skip_push` flag to skip sending push notifications [#608](https://github.com/GetStream/stream-chat-js/pull/608)

### Fix

- Sync `own_reactions` in the events [#606](https://github.com/GetStream/stream-chat-js/pull/606)
- Missing user_id in channel instantion by members [#610](https://github.com/GetStream/stream-chat-js/pull/610)

## February 11, 2021 - 3.0.1

- Add back some deprecated functions for convenience [#615](https://github.com/GetStream/stream-chat-js/pull/615)

## February 10, 2021 - 3.0.0

### BREAKING CHANGES

- Removed `seamless-immutable` library completely for client/channel state management in favor of pure JS objects [#602](https://github.com/GetStream/stream-chat-js/pull/602). This will likely require some changes to frontend usage of these states with spread operators for deeply nested data updates
- Changed channel state `messageToImmutable` function to `formatMessage` [#602](https://github.com/GetStream/stream-chat-js/pull/602)

- `channel.sendReaction(messageID: string, reaction: Reaction, user_id?: string, enforce_unique?: boolean)` is changed to `channel.sendReaction(messageID: string, reaction: Reaction, options?: { enforce_unique?: boolean })`. the removed `user_id` parameter should be added to `reaction`.
- `client.setUser()` function is removed in favor of `client.connectUser()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)
- `client.setAnonymousUser()` function is removed in favor of `client.connectAnonymousUser()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)
- `client.updateUser()` function is removed in favor of `client.upsertUser()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)
- `client.updateUsers()` function is removed in favor of `client.upsertUsers()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)
- `client._userAgent()` function is removed in favor of `client.getUserAgent()` [#612](https://github.com/GetStream/stream-chat-js/pull/612)

### Fix

- Added types for auto translations [#602](https://github.com/GetStream/stream-chat-js/pull/602)
- Added missing options for gdpr endpoints [#609](https://github.com/GetStream/stream-chat-js/pull/609)

### Chore

- Upgrade Dependencies [#613](https://github.com/GetStream/stream-chat-js/pull/613)

## January 28, 2021 - 2.12.0

### Feature

- New `StreamClient.getInstance` function to be use instead of `new StreamClient()` [#599](https://github.com/GetStream/stream-chat-js/pull/599)
- Types for file and image upload app configuration [#582](https://github.com/GetStream/stream-chat-js/pull/582)

### Fix

- Allow consecutive calls with warning to `client.connectUser` for the same user [#600](https://github.com/GetStream/stream-chat-js/pull/600)

## January 21, 2021 - 2.11.5

### Fix

- Skip sorting channel members while instantiating a channel without id [#591](https://github.com/GetStream/stream-chat-js/pull/591)

## January 20, 2021 - 2.11.4

- Ensure uniqe channel per cid on client's activeChannel state [#586](https://github.com/GetStream/stream-chat-js/pull/586)

## January 18, 2021 - 2.11.3

- Added types for query by date parameters - [b249e0b](https://github.com/GetStream/stream-chat-js/commit/b249e0b02da9b6e1c3984586b7ab823de072dd4b)
- Added missing type definitions around channel config - [9c3067f](https://github.com/GetStream/stream-chat-js/commit/9c3067f70efa9cad12233d10818b623efc00e1f6)

## January 11, 2021 - 2.11.2

- Add thread_participants to MessageResponse and correct pinned types [8e357a8](https://github.com/GetStream/stream-chat-js/commit/9d10998cc56c807e34e3131eccd8bf561c1ce822)

## January 4, 2021 - 2.11.1

- Updated/fixed types on event object regarding unread counts. [36e2297](https://github.com/GetStream/stream-chat-js/commit/36e2297526682276c4e597fd171c27d115ba0bb6)

## December 31, 2020 - 2.11.0

- Added support for quoted messages [#561](https://github.com/GetStream/stream-chat-js/pull/561/files)
- Added support for `enforce_unique` param on send reaction api. When true, previous reaction (if any) from user will be replaced with new reaction. [27ddd4f](https://github.com/GetStream/stream-chat-js/commit/27ddd4f63a71daab2ca1c55f193719c9780047b4)
- Added event handler for event `reaction.updated` [27ddd4f](https://github.com/GetStream/stream-chat-js/commit/27ddd4f63a71daab2ca1c55f193719c9780047b4)
- Added new flag on channel state `isUpToDate` (please check description for details) [588c0e9](https://github.com/GetStream/stream-chat-js/commit/588c0e91c92ca1f031cd11a030de0364ac04c59e)
- Fixed types for `client.user` [d855779](https://github.com/GetStream/stream-chat-js/commit/d855779c700104ebaaa7b907d45d2fa722ae0718)

## December 21, 2020 - 2.10.0

### Feature

- New `channel.updatePartial()` function can be used to set and unset specific fields when it is necessary to retain additional custom data fields on Channel #550
- `client.testPushSettings()` accepts `skipDevices` boolean attribute which skip config/device checks and sending to real devices #548
- `channel.sendReaction()` accepts `enforce_unique` attribute to overwrite existing reactions if any #527

### Fix

- deprecate `setUser` and `setAnonymousUser` in favor of `connectUser` and `connectAnonymousUser` #529
- Update channel read state when a new message is sent #536
- Removed unused `user_details` field from `query_channels` #545

- `MessageResponse` type #551
- `AppSettings` type #541

## December 7, 2020 - 2.9.0

- Adding `recoverStateOnReconnect` option - [#534](https://github.com/GetStream/stream-chat-js/pull/534)
- Adding `UpdatedMessage` typescript type

## November 27, 2020 - 2.8.4

### Fix

- Reset `unreadCount` when channel gets truncated [#521](https://github.com/GetStream/stream-js/pull/521)

## November 25, 2020 - 2.8.3

### Fix

- add `custom_event` to channel types [#520](https://github.com/GetStream/stream-js/pull/520)

## November 25, 2020 - 2.8.2

### Fix

- Replace uuid with simple random generator [#518](https://github.com/GetStream/stream-js/pull/518)

## November 20, 2020 - 2.8.1

### Fix

- Duplicate message from current user [#509](https://github.com/GetStream/stream-js/pull/509)
- Sort direction array for queries [#501](https://github.com/GetStream/stream-js/pull/501)
- Add `enforce_unique_usernames` to `AppSettingsAPIResponse` type [#511](https://github.com/GetStream/stream-js/pull/511)

## November 17, 2020 - 2.8.0

### Feature

- Channel Export [#504](https://github.com/GetStream/stream-js/pull/504)
- New event `notification.invite_rejected` [#467](https://github.com/GetStream/stream-js/pull/467)
- Channel stopTyping accepts optional `parent_id` for typing in threads `notification.invite_rejected` [#505](https://github.com/GetStream/stream-js/pull/505)

### Fix

- Mute users no longer counted in channel unread [#498](https://github.com/GetStream/stream-js/pull/498)
- `AppSettingsAPIResponse` type includes `image_moderation_enabled` [#497](https://github.com/GetStream/stream-js/pull/497)
- User ban function signature updated [#502](https://github.com/GetStream/stream-js/pull/502): `client.banUser('user1', {user_id: 'user2'})` is replaced with `client.banUser('user1', {banned_by_id: 'user2'})`

## November 06, 2020 - 2.7.4

### Feature

- Ban user by ip [#485](https://github.com/GetStream/stream-js/pull/485)

## November 03, 2020 - 2.7.3

### Fix

- Browser file upload incorrect file name [#487](https://github.com/GetStream/stream-js/pull/487)

## October 30, 2020 - 2.7.2

### Fix

- Improve types of `sendMessage()`, `updateMessage()`, `ChannelFilters` and `AppSettingsAPIResponse` [#480](https://github.com/GetStream/stream-chat-js/pull/480) [#483](https://github.com/GetStream/stream-chat-js/pull/483)

## October 26, 2020 - 2.7.1

### Feature

- New functions to shadow ban a user from one or all channels [#447](https://github.com/GetStream/stream-chat-js/pull/447)

```js
// global shadow ban on all channels
client.shadowBan(target_user_id);
client.removeShadowBan(target_user_id);

// channel speceifc shadow ban
channel.shadowBan(target_user_id);
channel.removeShadowBan(target_user_id);
```

### Fix

- Ignore shadowed messages in the unread count [#475](https://github.com/GetStream/stream-chat-js/pull/475)
- Remove duplicated \_initializeState call [#473](https://github.com/GetStream/stream-chat-js/pull/473)

### Chore

- Upgrade dependencies [#477](https://github.com/GetStream/stream-chat-js/pull/477)

## October 20, 2020 - 2.7.0

### Fix

- `channel.addMessageSorted` performance has been improved. It now accepts an extra parameter `timestampChanged: boolean` which needs to be set for updating a message in the state with the same `id` and different `created_at` [#470](https://github.com/GetStream/stream-chat-js/pull/470/)

## October 12, 2020 - 2.6.0

### Feature

- Typing events for thread #445 [#445](https://github.com/GetStream/stream-chat-js/pull/445/)
- Hard deleted messages are removed from `channel.state.messages` [#454](https://github.com/GetStream/stream-chat-js/pull/454/)
- Simplify and document flag/unflag functions for server side usage [#462](https://github.com/GetStream/stream-chat-js/pull/462/)

### Fix

- BlockList types [#455](https://github.com/GetStream/stream-chat-js/pull/455/)
- `Channel.countUnread()` returns correct unread [#452](https://github.com/GetStream/stream-chat-js/pull/452/)
- `type` key-value pair added to image uploads to fix React Native Android image upload failures [#464](https://github.com/GetStream/stream-chat-js/pull/464/)

## October 1, 2020 - 2.5.0

### Feature

- Add permission for using frozen channels `UseFrozenChannel` [#444](https://github.com/GetStream/stream-chat-js/pull/444/)
- `SendFile` accepts buffer and other types of streams [#448](https://github.com/GetStream/stream-chat-js/pull/448/)

### Fix

- Discard reservered fields from `channel.update()` [#439](https://github.com/GetStream/stream-chat-js/pull/439/)
- Custom Command handler in `AppSettingsAPIResponse` renamed to `custom_action_handler_url` from `custom_command_url` [#409](https://github.com/GetStream/stream-chat-js/pull/409/)
- Regenerate yarn.lock file [#449](https://github.com/GetStream/stream-chat-js/pull/449/)
- `SendFile` properly check for `File` instances [#448](https://github.com/GetStream/stream-chat-js/pull/448)

## September 17, 2020 - 2.4.0

### Feature

- BlockLists [#437](https://github.com/GetStream/stream-chat-js/pull/437/). Refer to docs on how to use this new feature [docs](https://getstream.io/chat/docs/block_lists/?language=js)

### Fix

- `Channel.keystroke` not firing for the first typing event [#440](https://github.com/GetStream/stream-chat-js/pull/440/)

## September 17, 2020 - 2.3.1

- Added backward compatible types and move type definitions for production out of dev dependencies [#432](https://github.com/GetStream/stream-chat-js/pull/432/)

## September 16, 2020 - 2.3.0

- Changed ordering of Typescript generics from usage preference based to alphabetical for consistency throughout the project [#425](https://github.com/GetStream/stream-chat-js/pull/425/files)

## September 10, 2020 - 2.2.2

- Fixing possible race condition between warmUp options request and first queryChannels call. [372b22c](https://github.com/GetStream/stream-chat-js/commit/372b22cffb90fcc4e5470af7d64524ff0d6457dc)

## September 10, 2020 - 2.2.1

- Fixing typescript for `filters` param in queryChannels endpoint [5e840ba](https://github.com/GetStream/stream-chat-js/commit/5e840ba79b9e9f34f987b459d86986cc661d20ca)

## September 10, 2020 - 2.2.0

- Add `warmUp` option for StreamChat constructor, to improve the network latency on api calls [74a9121](https://github.com/GetStream/stream-chat-js/commit/74a91214f69f0ccedadd39095640ac0f7237dcf5)

## September 7, 2020 - 2.1.3

- Move @types dependencies to devDependencies [#418](https://github.com/GetStream/stream-chat-js/pull/418)

## September 4, 2020 - 2.1.2

- Fix connection recovery of client [#414](https://github.com/GetStream/stream-chat-js/pull/414)
- Removed unused recovery option from queryChannels api payload [#414](https://github.com/GetStream/stream-chat-js/pull/414)

## August 31, 2020 - 2.1.1

- Typescript related fixes [4e538e6](https://github.com/GetStream/stream-chat-js/commit/4e538e66fc68e99331f3c2a83365df26f9789c93)
  - Add null checks for tests and correct types to reflect null returns on reactions
  - Change updateMessage to use Message instead of MessageResponse

## August 27, 2020 - 2.1.0

- Added endpoints to enable and disable slow mode [06fe1b2](https://github.com/GetStream/stream-chat-js/commit/06fe1b2d8a73b06d15578e32887d4fdf3c520d61)

  - enableSlowMode
  - disableSlowMode

- Added endpoints for custom commands [f79baa3](https://github.com/GetStream/stream-chat-js/commit/f79baa32c1512281f2bc7b4307910b7c16d2d2b9)

  - createCommand
  - getCommand
  - updateCommand
  - deleteCommand
  - listCommand

- Typescript related fixes [5f2ae83](https://github.com/GetStream/stream-chat-js/commit/5f2ae838aa567a40d6778f01e9e3dbcbf5ebe09c)
  - added generic type `CommandType`
  - Fixing backward compatibility related issues

## August 26, 2020 - 2.0.0

- Library has been migrated to full typescript.
- No breaking changes regarding underlying javascript api.
- The `Event` type no longer takes a string generic that maps to the `type` property of the response. Event now takes multiple high level generics instantiated along with the client and the property `type` on the response is on of the string union `EventTypes`.

## August 11, 2020 - 1.14.1

- Add support for channel.visible event [991c87b](https://github.com/GetStream/stream-chat-js/commit/991c87b094afa23bdae9973aa264e0789a3c12e0)
- Added setter for userAgent [5d87550](https://github.com/GetStream/stream-chat-js/commit/5d87550f5097c9cbea687d598e3c947a56368cca)

## July 24, 2020 - 1.14.0

- Added timeout for muteUser client method [6f44677](https://github.com/GetStream/stream-chat-js/commit/6f446772f42f5a475dcfd4e28d4a8d9c949513b3)

## July 16, 2020 - 1.13.2

- Removing cross-fetch from rollup externals [c7dafb0](https://github.com/GetStream/stream-chat-js/commit/c7dafb0f83bd24a02a03f52add7c27b6ccdb683b)

## July 16, 2020 - 1.13.1

- Changing ws issue logs to warn level [1836606](https://github.com/GetStream/stream-chat-js/commit/1836606acca3690f0223f4434006be8f4c1bc5d1)

## July 8, 2020 - 1.13.0

- Add size comparison action [#361](https://github.com/GetStream/stream-chat-js/pull/361)
- Drop cross-fetch and use Axios for uploads, use local instance of Axios [#365](https://github.com/GetStream/stream-chat-js/pull/365)
- Drop support for node v11, v13 [#372](https://github.com/GetStream/stream-chat-js/pull/372)

## June 24, 2020 - 1.12.1

- Fixing typescript for channel.getCommands [52e562a](https://github.com/GetStream/stream-chat-js/commit/52e562af1922e5d4e56ab3ba312fe70bf7b562e1)

## June 23, 2020 - 1.12.0

- Adding sync endpoint for offline support [eb4793f](https://github.com/GetStream/stream-chat-js/commit/eb4793ff9bce1f4b2f698efe853e43772f9e6a7d#diff-cf27c1d543e886c89cd9ac8b8aeaf05bR1451)
- Fixing typescript for translateMessage endpoint [c9aea32](https://github.com/GetStream/stream-chat-js/commit/c9aea320626d66c29f7424da351c6b965e65675e)

## June 16, 2020 - 1.11.4

- Fixing request retry logic upon token expiry [ab20729](https://github.com/GetStream/stream-chat-js/commit/ab20729dbff05f4e6270d98f736acb2deafae7a5)

## June 12, 2020 - 1.11.3

- Fixing types for setUser function on client [36d04ec](https://github.com/GetStream/stream-chat-js/commit/36d04ec110d687760af8876a296897516c624739)
- Added `translateMessage` function/endpoint to client [c5e1462](https://github.com/GetStream/stream-chat-js/commit/c5e1462aa94a4855900679d656373daefc3019b2)

## June 8, 2020 - 1.11.2

- Improved channel.config types in typescript file [5524675](https://github.com/GetStream/stream-chat-js/commit/5524675656ad0b4483a5b4ed9047fa8b384a5423)
- Added support for `user.deleted` event [b3c328a](https://github.com/GetStream/stream-chat-js/commit/b3c328aa15af4db8bdd07d57effbd21fbd6ae600)

## May 29, 2020 - 1.11.1

- Fixing issue with connection recovery and queryChannels api call [#340](https://github.com/GetStream/stream-chat-js/pull/340)

## May 28, 2020 - 1.11.0

- Introducing queryMembers endpoint [#321](https://github.com/GetStream/stream-chat-js/pull/321)

## May 28, 2020 - 1.10.3

- Fixed typescript issues [a9fa49c](https://github.com/GetStream/stream-chat-js/commit/a9fa49c94fe3a730e91b5c3d199f658b6f69c834)

## May 19, 2020 - 1.10.2

- Fixing read status issue [3289ae2](https://github.com/GetStream/stream-chat-js/commit/3289ae28c6400290719c4f82ce6a7651f6f7f732)

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

- Support filtering by messages custom fields - [#264](https://github.com/GetStream/stream-chat-js/pull/264)

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

- Added tests for channels operator \$in with custom fields - [1896d98](https://github.com/GetStream/stream-chat-js/commit/1896d98a98968a920b3c1539e50649fa7a33462f)
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

## November 28, 2019 - 1.2.0

## November 22, 2019 - 1.1.8

- Improve client.channel signature, support short-hand with only type and object as well as null or undefined ID (instead of only "")

## October 25, 2019 - 1.1.7

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
