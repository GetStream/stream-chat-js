Sometimes you want to have more control over what users are allowed to post and either discard or edit their messages when they do not meet your content guidelines.

This webhook gets called before the message reaches the API and therefore before it is saved to the channel and observable by other users. This allows you to intercept a message and make sure that inappropriate content will never be displayed to other users.

## Configuration

To enable the Before Message Send webhook, configure the `before_message_send_hook_url` in your app settings:

```js
await client.updateAppSettings({
  before_message_send_hook_url:
    "https://example.com/webhooks/stream/before-message-send",
});
```

## Use-cases

You can use this webhook to enforce any of these rules:

- Scrub PII from messages (ie. social security numbers, credit cards, etc.)

- Restrict contact information sharing (ie. discard phone numbers, emails)

- Validate messages do not include complex words that are best matched using a regular expression (regex)

## Request format

Your endpoint will receive a POST request with a JSON encoded body containing the message, user, and channel objects:

```json
{
  "message": {
    "id": "",
    "text": "hello, here's my CC information 1234 1234 1234 1234",
    "html": "",
    "type": "regular",
    "attachments": [],
    "latest_reactions": [],
    "own_reactions": [],
    "reaction_counts": null,
    "reaction_scores": null,
    "reply_count": 0,
    "mentioned_users": [],
    "silent": false
  },
  "user": {
    "id": "17f8ab2c-c7e7-4564-922b-e5450dbe4fe7",
    "role": "user",
    "banned": false,
    "online": false
  },
  "channel": {
    "cid": "messaging:fun-01dce6d9-c6c8-4b59-8e3c-c31631e1f7c8",
    "id": "fun-01dce6d9-c6c8-4b59-8e3c-c31631e1f7c8",
    "type": "messaging",
    "last_message_at": "2020-06-18T14:10:30.823058Z",
    "created_at": "2020-06-18T14:10:29.457799Z",
    "updated_at": "2020-06-18T14:10:29.457799Z",
    "frozen": false,
    "config": {
      "created_at": "2020-06-18T14:10:29.494022Z",
      "updated_at": "2020-06-18T14:10:29.504722Z",
      "name": "messaging",
      "typing_events": true,
      "read_events": true,
      "connect_events": true,
      "search": true,
      "reactions": true,
      "replies": true,
      "mutes": true,
      "uploads": true,
      "url_enrichment": true,
      "message_retention": "infinite",
      "max_message_length": 5000,
      "automod": "disabled",
      "automod_behavior": "flag",
      "commands": []
    }
  },
  "request_info": {
    "type": "client",
    "ip": "86.84.2.2",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
    "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1"
  }
}
```

### Request info

The `request_info` object holds information about the client that performed the request. You can use this as an additional signal for what to do with the message. For example, you may block the message from being sent based on IP.

When configuring the SDK, you may also set an additional `x-stream-ext` header to be sent with each request. The value of this header is passed along as an `ext` field in the `request_info` . You can use this to pass along information that may be useful, such as device information. Refer to the SDK-specific docs on how to set this header.

```json
"request_info": {
 "type": "client",
 "ip": "86.84.2.2",
 "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/117.0",
 "sdk": "stream-chat-react-10.11.0-stream-chat-javascript-client-browser-8.12.1",
 "ext": "device-id=123"
}
```

For example, in Javascript, you can set the value like this:

```js
client = new StreamChat(apiKey, {
  axiosRequestConfig: {
    headers: {
      "x-stream-ext": "device-id=123",
    },
  },
});
```

The format of the `ext` header is up to you and you may leave it blank if you don't need it. The value is passed as-is, so you can use a simple value, comma-separated key-values, or more structured data, such as JSON. Binary data must be encoded as a string, for example using base64 or hex encoding.

### Response format

If you intend to make any change to the message, you should return a JSON encoded response with the same message structure. Please note that not all message fields can be changed, the full list of fields that can be modified is available in the [rewriting messages](/chat/docs/node/before_message_send_webhook/#rewriting-messages/) section.

### Discarding messages

Your endpoint can decide to reject the message and return a user message. To do that the endpoint must return a regular message with type set to error. Please note that the HTTP response code should be still 200.

```json
{
  "message": {
    "type": "error",
    "text": "this message did not meet our content guidelines"
  }
}
```

### Rewriting messages

You can also decide to modify the message, in this case, you should return the updated version of the message and it will overwrite the user input.

```json
{
  "message": {
    "text": "hello, here's my CC information    "
  }
}
```

## Rewritable message fields

Not all message fields can be rewritten by your hook handler, fields such as created_at or updated_at, for instance, are reserved and can only be set by Stream Chat APIs. Any non-custom field that is not listed here will be ignored and not updated on the final message.

1. text

2. i18n

3. show_in_channel

4. silent

5. type

6. attachments

7. _any custom field_

## Performance considerations

Your webhook endpoint will be part of the send message transaction, so you should avoid performing any remote calls or potentially slow operations while processing the request. Stream Chat will give your endpoint 1 second of time to reply. If your endpoint is not available (ie. returns a response with status codes 4xx or 5xx) or takes too long, Stream Chat will continue with the execution and save the message as usual.

To make sure that an outage on the hook does not impact your application, Stream will pause your webhook once it is considered unreachable and it will automatically resume once the webhook is found to be healthy again.

### Example implementation

An example of how to configure this webhook can be found in [this repo](https://github.com/GetStream/messagehook).
