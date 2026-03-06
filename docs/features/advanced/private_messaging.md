Restricted message delivery is a feature that allows sending a message in channel to one or more specific users, thereby limiting visibility to other users in that channel.
If you want to inform 1 specific user in a channel with a system message for example, then restricted message delivery is perfectly feature for it.

> [!NOTE]
> This feature is only available on Stream's Enterprise pricing plans. Request the Stream team to enable this feature for your app by [contacting support](https://getstream.io/contact/support/).


## Sending a message with restricted visibility

In order to send a message with restricted visibility the user needs to have the `CreateRestrictedVisibilityMessage` permission.
A message with restricted visibility is send by adding a list of users to the `restricted_visibility` property. Please note that updating the list of users who can see the message is not possible after the message has been send.

```js
// Get a channel
const channel = client.Channel("messaging", "ride-08467339");

// Send a message only visible to Jane
const message = await channel.sendMessage({
  text: "Hi Jane, your driver John will be at your location in 1 minute",
  type: "system",
  restricted_visibility: ["Jane"],
});
```

## Possible use cases

### Taxi app (like Uber) use case

In a taxi app where both the driver and the passenger share a channel, you could provide either of them with additional updates.

- Alert the driver that the passenger is close by.
- Alert the passenger of where the driver is.

### Moderation use case

- The system may wish to send a message to only a single user to alert them that there may be fraudulent activity from the another user in the channel.
- Show a blocked user a message to let them know they have been suspended.

### Marketplace use case

- Show alternative listings to a potential buyer, thereby improving customer engagement.
- Show a message the product is reserved for the user.

## Additional information

### Visibility to other users

By default a restricted visibility message is only visible to the sender of the message and the users in the `restricted_visibility` list. If you want other users to be able to view those messages as well, you can give those users the `ReadRestrictedVisibilityMessage` permission. By default this permission is only granted to `admin` roles.

### Pinning a restricted visibility message

Pinning a restricted visibility message to a channel is not allowed, simply because pinning a message is meant to bring attention to that message, that is not possible with a message that is only visible to a subset of users.

### Unread counts

If a restricted visibility message is send to a channel and the user cannot see that message then the unread count will not be increased for that user. The unread count will be increased for users who can see the message.

### Truncating and updating channels

When truncating or updating a channel, the user can choose to send a system message in the same request. However, this message cannot contain a list of restricted visibility users. The reason being is both operations send an event to all channel members. This event includes the optional message. All channel members need to be notified about the channel update or truncation, it is not possible to send a message with restricted visbility.
If you want to send a message with restricted visibility, then the update or truncate the channel first, after that you can send a message with restricted visibility to the channel.
