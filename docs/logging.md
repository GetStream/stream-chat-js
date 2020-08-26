# Logging

You can use our logger functionality for the purpose of debugging.

## Non-server client

```js
const client = new StreamChat('api_key', {
  logger: (logLevel, message, extraData) => {
    console.log(message); // or any logging tool that you are using e.g. reactotron
  },
});
```

## Server side client

```js
const client = new StreamChat(
  'api_key',
  'secret'
  {
    logger: (logLevel, message, extraData) => {
      console.log(message);
    }
  }
)
```

extraData contains tags array attached to log message. Tags can have one/many of following values:

1. api
2. api_request
3. api_response
4. client
5. channel
6. connection
7. event

It may also contains some extra data, some examples have been mentioned below:

1.

```
{
  "tags": ["api", "api_request", "client"],
  "url": "https://chat-us-east-1.stream-io-api.com/channels",
  "payload": { /** payload */ },
  "config": { /** conig object */ }
}
```

2.

```
{
  "tags": ["api", "api_response", "client"],
  "url": "https://chat-us-east-1.stream-io-api.com/channels",
  "response": { /** object */ }
}
```

3.

```
{
  "tags": ["api", "api_response", "client"],
  "url": "https://chat-us-east-1.stream-io-api.com/channels",
  "error": { /** error object */ }
}
```

4.

```
{
  "tags": ["event", "client"],
  "event": { /** event object */ }
}
```

5.

```
{
  "tags": ["channel"],
  "channel": { /** channel object */ }
}
```
