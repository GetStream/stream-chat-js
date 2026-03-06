For the average Stream integration, the development work focuses on code that executes in the client. The React, React Native, Swift, Kotlin or Flutter SDKs connect to the chat API directly from the client. However, some tasks must be executed from the server for safety.

- [Generating user tokens](/chat/docs/node/#generating-user-tokens/)

- [Syncing users](/chat/docs/node/#syncing-users/)

The chat API has some features that client side code *can*manage in specific cases but usually shouldn't. While these features _can_ be initiated with client side code. We recommend managing them server side instead unless you are certain that you need to manage them from the client side for your specific use case.

- [Syncing channels](/chat/docs/node/#syncing-channels/)

- [Adding & Removing members & moderators](/chat/docs/node/)

- [Sending messages](/chat/docs/node/)

- [Changing App Settings](/chat/docs/node/app_setting_overview/)

The backend has full access to the chat API.

This quick start covers the basics of a backend integration. If we don't have an SDK for your favorite language be sure to review the [REST documentation](https://getstream.github.io/protocol/).

### Generating user tokens

The backend creates a token for a user. You hand that token to the client side during login or registration. This token allows the client side to connect to the chat API for that user. Stream's permission system does the heavy work of determining which actions are valid for the user, so the backend just needs enough logic to provide a token to give the client side access to a specific user.

The following code shows how to instantiate a client and create a token for a user on the server:

```js
// yarn add stream-chat
import { StreamChat } from "stream-chat";
// if you're using common js
const StreamChat = require("stream-chat").StreamChat;

// instantiate your stream client using the API key and secret
// the secret is only used server side and gives you full access to the API
const serverClient = StreamChat.getInstance(
  "{{ api_key }}",
  "{{ api_secret }}",
);
// you can still use new StreamChat('api_key', 'api_secret');

// generate a token for the user with id 'john'
const token = serverClient.createToken("john");
// next, hand this token to the client in your in your login or registration response
```

You can also generate tokens that expire after a certain time. The tokens & authentication section explains this in detail.

### Syncing users

When a user starts a chat conversation with another user both users need to be present in Stream's user storage. So you'll want to make sure that users are synced in advance. The update users endpoint allows you to update 100 users at once, an example is shown below:

```js
const response = await client.upsertUsers([
  {
    id: userID,
    role: "admin",
    mycustomfield: "123",
  },
]);
```

Note that user roles can only be changed server side. The role you assign to a user impacts their permissions and which actions they can take on a channel.

### Syncing Channels

You can create channels client side, but for many applications you'll want to restrict the creation of channels to the backend. Especially if a chat is related to a certain object in your database. One example is building a livestream chat like Twitch. You'll want to create a channel for each Stream and set the channel creator to the owner of the Stream. The example below shows how to create a channel and update it:

```js
const channel = client.channel(type, id, {
  created_by_id: "4645",
});
await channel.create();
// create the channel and set created_by to user id 4645
const update = await channel.update({
  name: "myspecialchannel",
  image: "imageurl",
  mycustomfield: "123",
});
```

You can also add a message on the channel when updating it. It's quite common for chat apps to show messages like: "Jack invited John to the channel", or "Kate changed the color of the channel to green".

### Adding Members or Moderators

The backend SDKs also make it easy to add or remove members from a channel. The example below shows how to add and remove members:

```js
await channel.addMembers(["thierry", "josh"]);
await channel.removeMembers(["tommaso"]);

await channel.addModerators(["thierry"]);
await channel.demoteModerators(["thierry"]);
```

### Sending Messages

It's quite common that certain actions in your application trigger a message to be sent. If a new user joins an app some chat apps will notify you that your contact joined the app. The example below shows how to send a message from the backend. It's the same syntax as you use client side, but specifying which user is sending the message is required:

```js
const toBeSent = {
  text: "@Josh I told them I was pesca-pescatarian. Which is one who eats solely fish who eat other fish.",
  attachments: [
    {
      type: "image",
      asset_url: "https://bit.ly/2K74TaG",
      thumb_url: "https://bit.ly/2Uumxti",
      myCustomField: 123,
    },
  ],
  mentioned_users: [josh.id],
  anotherCustomField: 234,
};
const message = await channel.sendMessage({ ...toBeSent, user_id: "john" });
message = {
  text: "@Josh I told them I was pesca-pescatarian. Which is one who eats solely fish who eat other fish.",
  attachments: [
    {
      type: "image",
      asset_url: "https://bit.ly/2K74TaG",
      thumb_url: "https://bit.ly/2Uumxti",
      myCustomField: 123,
    },
  ],
  mentioned_users: [josh["id"]],
  anotherCustomField: 234,
};
```

### Changing Application Settings

Some application settings should only be changed using the back end for security reasons:

- [Webhook Configuration](/chat/docs/node/webhooks_overview/)

- [SQS Configuration](/chat/docs/node/sqs/#configure-programmatically/)

### API Changes

A **breaking change** is a change that may require you to make changes to your application in order to avoid disruption to your integration. Stream will never introduce a breaking change without notifying its customers and giving them plenty of time to make the appropriate changes on their end. The following are a few examples of changes we consider breaking:

- Changes to existing permission definitions.

- Removal of an allowed parameter, request field or response field.

- Addition of a required parameter or request field without default values.

- Changes to the intended functionality of an endpoint. _For example, if a DELETE request previously used to soft delete the resource but now hard deletes the resource._

- Introduction of a new validation.

A **non-breaking change** is a change that you can adapt to at your own discretion and pace without disruption. Ensure that your application is designed to be able to handle the following types of non-breaking changes without prior notice from Stream:

- Addition of new endpoints.

- Addition of new methods to existing endpoints.

- Addition of new fields in the following scenarios:

- New fields in responses.

- New optional request fields or parameters.

- New required request fields that have default values.

- Addition of a new value returned for an existing text field.

- Changes to the order of fields returned within a response.

- Addition of an optional request header.

- Removal of redundant request header.

- Changes to the length of data returned within a field.

- Changes to the overall response size.

- Changes to error messages. We do not recommend parsing error messages to perform business logic. Instead, you should only rely on HTTP response codes and error codes.

- Fixes to HTTP response codes and error codes from incorrect code to correct code.

- Prefix your custom data properties, we could introduce new features that might clash with custom property names you are using, by prefixing them you avoid this problem.
