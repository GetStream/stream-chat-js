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
