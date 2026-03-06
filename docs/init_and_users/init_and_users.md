The code below creates a chat client instance for interacting with Stream APIs. A singleton client instance means the Chat client is created once and reused throughout your app, ensuring consistent state, avoiding duplicate connections, and simplifying resource management.

```js
import { StreamChat } from "stream-chat";

// client-side you initialize the Chat client with your API key
const chatClient = StreamChat.getInstance("{{ api_key }}", {
  timeout: 6000,
});
```

## Connecting Users

Once the client is initialized, your app authenticates the user and establishes a Websocket connection by calling `connectUser`. This function uses your token provider function to request a token from your server.

The `connectUser` function acts as an upsert for the user object and is a primary method for creating users client-side.

Before attempting subsequent API requests to Stream, it is important that the `connectUser` function fully resolves.

```js
await chatClient.connectUser(
  {
    id: "john",
    name: "John Doe",
    image: "https://getstream.io/random_svg/?name=John",
  },
  tokenProvider,
);
```

### Connect User Parameters

| name      | type            | description                                                                                                                                                                                                                          | default | optional |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------- |
| user      | object          | The user object. Must have an id field. **User Ids can only contain characters a-z, 0-9, and special characters @ \_ and -** It can have as many custom fields as you want, as long as the total size of the object is less than 5KB |         |          |
| userToken | string/function | The Token Provider function or authentication token. See [Tokens & Authentication](/chat/docs/node/tokens_and_authentication/) for details                                                                                    | default |          |

## Disconnecting Users

The client-side SDKs handle WebSocket disconnection logic, but if a manual disconnect is required in your application, there are the following options:

```js
await chatClient.disconnectUser();
```

## XHR Fallback

Most browsers support WebSocket connections as an efficient mode of real-time data transfer. However, sometimes the connection cannot be established due to network or a corporate firewall. In such cases, the client will establish or switch to XHR fallback mechanisms and gently poll our service to keep the client up-to-date.

The fallback mechanism can be enabled with the flag `enableWSFallback`

```js
const chatClient = StreamChat.getInstance(‘apiKey’, { enableWSFallBack: true });
```

## Privacy Settings

Additionally, when connecting the user, you can include the `privacy_settings` as part of the user object.

```js
await chatClient.connectUser(
  {
    id: "john",
    name: "John Doe",
    image: "https://getstream.io/random_svg/?name=John",
    privacy_settings: {
      typing_indicators: {
        enabled: false,
      },
      read_receipts: {
        enabled: false,
      },
    },
  },
  "{{ chat_user_token }}",
);
```

| name              | type   | description                                                                                                                                                                                                         | default       | optional |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- |
| typing_indicators | object | if **enabled** is set to **false** , then **typing.start** and **typing.stop** events will be ignored for this user and these events will not be sent to others                                                     | enabled: true | ✓        |
| read_receipts     | object | If **enabled** is set to **false** , then the **read_state** of this user will not be exposed to others. Additionally, **read_state** related events will not be delivered to others when this user reads messages. | enabled: true | ✓        |
