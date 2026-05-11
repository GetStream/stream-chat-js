# Webhooks

Stream chat can deliver real-time events to your backend over HTTP webhooks
or via SQS / SNS firehose. Every payload is signed with HMAC-SHA256 using
your app's API secret so you can verify it actually came from Stream.

The SDK exposes three transport-specific helpers — `verifyAndParseWebhook`,
`verifyAndParseSqs`, and `verifyAndParseSns` — that decode the envelope
(when needed), verify the signature, and return the parsed `Event` in one
call. Each helper exists both as a method on `StreamChat` (uses
`client.secret`) and as a standalone function (takes the secret explicitly,
useful in serverless handlers where you don't keep a client around).

## Verifying an HTTP webhook (legacy boolean helper)

The classic `verifyWebhook` helper takes the raw HTTP request body plus the
`x-signature` header and returns a boolean. Use it when you already parse
the JSON yourself and just want to confirm the request is authentic.

```js
const { StreamChat } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

app.post('/webhooks/stream', express.raw({ type: '*/*' }), (req, res) => {
  const valid = client.verifyWebhook(req.body, req.headers['x-signature']);
  if (!valid) return res.sendStatus(401);
  const event = JSON.parse(req.body.toString('utf8'));
  // ...handle the event
  res.sendStatus(200);
});
```

## Compressed webhook bodies

GZIP compression can be enabled for hooks payloads from the Dashboard.
Enabling compression reduces the payload size significantly (often 70–90%
smaller) reducing your bandwidth usage on Stream. The computation overhead
introduced by the decompression step is usually negligible and offset by
the much smaller payload.

When payload compression is enabled, webhook HTTP requests will include the
`Content-Encoding: gzip` header and the request body will be compressed
with GZIP. Some HTTP servers and middleware (Rails, Django, Laravel, Spring
Boot, ASP.NET) handle this transparently and strip the header before your
handler runs — in that case the body you see is already raw JSON.

The SDK detects compression from the **first two bytes of the body**
(`1f 8b`, the gzip magic per RFC 1952) rather than the `Content-Encoding`
header, so the same handler stays correct whether or not your framework
auto-decompresses the request.

Before enabling compression, make sure that:

- Your backend integration is using a recent version of our official SDKs
  with compression support
- If you don't use an official SDK, make sure that your code supports
  receiving compressed payloads
- The payload signature check is done on the **uncompressed** payload

## `verifyAndParseWebhook`

`verifyAndParseWebhook` is the recommended helper for HTTP webhooks. It
gunzips the body when needed, verifies the HMAC signature, parses the JSON,
and returns the typed `Event`. It throws `WebhookSignatureError` when the
signature does not match or the gzip envelope is malformed.

```js
const { StreamChat, WebhookSignatureError } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

// Use `express.raw` so `req.body` stays as a Buffer.
app.post('/webhooks/stream', express.raw({ type: '*/*' }), (req, res) => {
  try {
    const event = client.verifyAndParseWebhook(req.body, req.headers['x-signature']);
    // ...handle the event (event.type, event.message, etc.)
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return res.sendStatus(401);
    }
    throw err;
  }
});
```

The same helper is also exported as a standalone, stateless function that
takes the secret explicitly:

```js
const { verifyAndParseWebhook } = require('stream-chat');

const event = verifyAndParseWebhook(rawBody, signature, apiSecret);
```

## SQS / SNS firehose delivery

Stream can also fan webhook events out through Amazon SQS or SNS. Both
transports require valid UTF-8 message bodies, so the JSON (or its gzipped
bytes when compression is enabled) is base64-encoded before being placed in
the message. The HMAC signature is still computed over the innermost
(uncompressed, base64-decoded) JSON, so the verification rule is identical
to the HTTP path — only the envelope changes.

Use `verifyAndParseSqs` for SQS messages. It base64-decodes the body,
gunzips when the decoded bytes start with the gzip magic, verifies the
signature from the `x-signature` message attribute, and returns the parsed
`Event`.

```js
const { StreamChat, WebhookSignatureError } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

async function handleSqsMessage(message) {
  // SQS attaches `x-signature` as a message attribute when Stream
  // publishes the event.
  const signature = message.MessageAttributes['x-signature'].StringValue;

  try {
    const event = client.verifyAndParseSqs(message.Body, signature);
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

For SNS, unwrap the SNS notification envelope first and pass the inner
`Message` field to `verifyAndParseSns`:

```js
const { StreamChat, WebhookSignatureError } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

async function handleSnsNotification(notification) {
  // `notification` is the JSON SNS posts to your HTTPS endpoint or the
  // record you pull off SQS-via-SNS. `MessageAttributes` carries the
  // same `x-signature` Stream computes over the uncompressed JSON.
  const signature =
    notification.MessageAttributes['x-signature'].Value ??
    notification.MessageAttributes['x-signature'].StringValue;

  const event = client.verifyAndParseSns(notification.Message, signature);
  // ...handle the event
}
```

`verifyAndParseSqs` and `verifyAndParseSns` are also exported as
standalone, stateless functions:

```js
const { verifyAndParseSqs, verifyAndParseSns } = require('stream-chat');

const event = verifyAndParseSqs(messageBody, signature, apiSecret);
```

## Lower-level building blocks

If you need finer control (for example, to verify a signature without
parsing the JSON, or to inflate a payload yourself), the SDK also exports:

- `gunzipPayload(body)` — returns the raw body as a `Buffer`, gunzipping
  it when the first two bytes match the gzip magic. Plain bodies pass
  through unchanged.
- `decodeSqsPayload(body)` / `decodeSnsPayload(body)` — base64-decodes
  the SQS/SNS body and then gunzips if needed. Throws
  `WebhookSignatureError` on malformed base64.
- `parseEvent(payload)` — `JSON.parse` plus the `Event` type cast.
- `verifySignature(body, signature, secret)` — constant-time HMAC-SHA256
  comparison. The signature must be computed over the uncompressed,
  base64-decoded JSON.

## API reference

| Method                                                       | Returns   | Throws                                                                                |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------- |
| `client.verifyWebhook(body, sig)`                            | `boolean` | never                                                                                 |
| `client.verifyAndParseWebhook(rawBody, sig)`                 | `Event`   | `WebhookSignatureError` for signature mismatch, missing secret, or bad gzip envelope  |
| `client.verifyAndParseSqs(messageBody, sig)`                 | `Event`   | `WebhookSignatureError` for signature mismatch, missing secret, or bad base64 / gzip  |
| `client.verifyAndParseSns(message, sig)`                     | `Event`   | `WebhookSignatureError` for signature mismatch, missing secret, or bad base64 / gzip  |
| `verifyAndParseWebhook(rawBody, sig, secret)` _(standalone)_ | `Event`   | `WebhookSignatureError` for signature mismatch or bad gzip envelope                   |
| `verifyAndParseSqs(messageBody, sig, secret)` _(standalone)_ | `Event`   | `WebhookSignatureError` for signature mismatch or bad base64 / gzip                   |
| `verifyAndParseSns(message, sig, secret)` _(standalone)_     | `Event`   | `WebhookSignatureError` for signature mismatch or bad base64 / gzip                   |
| `verifySignature(body, sig, secret)`                         | `boolean` | never                                                                                 |
| `gunzipPayload(body)`                                        | `Buffer`  | `WebhookSignatureError` when the body starts with the gzip magic but fails to inflate |
| `decodeSqsPayload(body)` / `decodeSnsPayload(body)`          | `Buffer`  | `WebhookSignatureError` for malformed base64 or bad gzip bytes                        |
| `parseEvent(payload)`                                        | `Event`   | `SyntaxError` when the payload is not valid JSON                                      |

`WebhookSignatureError` is exported from the package root and from
`stream-chat/dist/types/signing`. Catch it to convert auth failures into a
`401`/`403` response (HTTP) or a drop / dead-letter decision (SQS / SNS).
