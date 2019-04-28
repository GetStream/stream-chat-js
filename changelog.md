## April 28th 2019 - 0.9.2

- Improved user presence support. If listening to user presence, channel.state.members and channel.state.watchers
  are now automatically updated with the user's online/offline presence.

## April 24th 2019 - 0.9.1

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
