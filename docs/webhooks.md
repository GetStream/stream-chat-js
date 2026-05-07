# Webhooks

Stream chat can deliver real-time events to your backend over HTTP webhooks
or via SQS / SNS firehose. Every payload is signed with HMAC-SHA256 using
your app's API secret so you can verify it actually came from Stream.

## Verifying a webhook signature

The classic helper takes the raw HTTP request body plus the `x-signature`
header and returns a boolean. Use it when you receive an uncompressed JSON
payload over HTTP and just want to confirm it is authentic.

```js
const { StreamChat } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

// Express example
app.post('/webhooks/stream', express.raw({ type: '*/*' }), (req, res) => {
  const valid = client.verifyWebhook(req.body, req.headers['x-signature']);
  if (!valid) return res.sendStatus(401);
  // req.body is a Buffer holding the raw JSON
  const event = JSON.parse(req.body.toString('utf8'));
  // ...handle the event
  res.sendStatus(200);
});
```

## Compressed webhook bodies

GZIP compression can be enabled for hooks payloads from the Dashboard.
Enabling compression reduces the payload size significantly (often 70–90%
smaller) reducing your bandwidth usage on Stream. The computation overhead
introduced by the decompression step is usually negligible and offset by the
much smaller payload.

When payload compression is enabled, webhook HTTP requests will include the
`Content-Encoding: gzip` header and the request body will be compressed with
GZIP. Some HTTP servers and middleware (Rails, Django, Laravel, Spring Boot,
ASP.NET) handle this transparently and strip the header before your handler
runs — in that case the body you see is already raw JSON.

Before enabling compression, make sure that:

- Your backend integration is using a recent version of our official SDKs
  with compression support
- If you don't use an official SDK, make sure that your code supports
  receiving compressed payloads
- The payload signature check is done on the **uncompressed** payload

### `verifyAndDecodeWebhook`

`verifyAndDecodeWebhook` is the recommended helper for compressed webhooks.
It handles the decode and the signature check in one step, returns the
uncompressed JSON Buffer the server signed, and throws
`WebhookSignatureError` when the signature does not match. A `null`,
`undefined`, or empty `contentEncoding` is treated as "no compression", so
the helper works for both legacy plain webhooks and new compressed ones.

```js
const { StreamChat, WebhookSignatureError } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

// Express example. Use `express.raw` so `req.body` stays as a Buffer.
app.post('/webhooks/stream', express.raw({ type: '*/*' }), (req, res) => {
  try {
    const decoded = client.verifyAndDecodeWebhook(
      req.body,
      req.headers['x-signature'],
      req.headers['content-encoding'], // e.g. 'gzip' or undefined
    );
    const event = JSON.parse(decoded.toString('utf8'));
    // ...handle the event
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return res.sendStatus(401);
    }
    throw err;
  }
});
```

If you only want to decompress without verifying (for example when a
trusted upstream proxy has already verified the signature), use
`decompressWebhookBody`:

```js
const buf = client.decompressWebhookBody(req.body, req.headers['content-encoding']);
const event = JSON.parse(buf.toString('utf8'));
```

## SQS / SNS firehose delivery

Stream can also fan webhook events out through Amazon SQS or SNS. Both
transports require valid UTF-8 message bodies, so when compression is
enabled the GZIP bytes are wrapped in base64 before being placed in the
message. The HMAC signature is still computed over the innermost
(uncompressed, base64-decoded) JSON, so the verification rule is identical
to the HTTP path — pass `payloadEncoding: 'base64'` to undo the wrapping.

```js
const { StreamChat, WebhookSignatureError } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

async function handleSqsMessage(message) {
  // SQS attaches both metadata fields as message attributes when Stream
  // publishes them. Adapt the field names to whichever transport you use.
  const xSignature = message.MessageAttributes['x-signature'].StringValue;
  const contentEncoding =
    message.MessageAttributes['content-encoding']?.StringValue ?? null;

  try {
    const decoded = client.verifyAndDecodeWebhook(
      message.Body,
      xSignature,
      contentEncoding,
      'base64',
    );
    const event = JSON.parse(decoded.toString('utf8'));
    // ...handle the event
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      // drop the message or move it to a dead-letter queue
      return;
    }
    throw err;
  }
}
```

For SNS you would unwrap the SNS envelope first and then pass the inner
`Message` field as `rawBody` with `payloadEncoding: 'base64'`.

## API reference

| Method                                                                         | Returns   | Throws                                                                                                                 |
| ------------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `client.verifyWebhook(body, sig)`                                              | `boolean` | never                                                                                                                  |
| `client.decompressWebhookBody(body, contentEncoding?, payloadEncoding?)`       | `Buffer`  | `WebhookSignatureError` for malformed base64; `Error` for unsupported encodings or bad gzip bytes                      |
| `client.verifyAndDecodeWebhook(body, sig, contentEncoding?, payloadEncoding?)` | `Buffer`  | `WebhookSignatureError` for signature mismatch / malformed base64; `Error` for unsupported encodings or bad gzip bytes |

The only `contentEncoding` value supported by Stream today is `gzip`. The
only `payloadEncoding` value supported is `base64` (alias `b64`). Encoding
names are matched case-insensitively. `null`, `undefined`, or empty strings
mean "no encoding applied".
