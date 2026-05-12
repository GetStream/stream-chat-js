# Webhooks

Stream chat can deliver real-time events to your backend over HTTP webhooks
or via SQS / SNS firehose. HTTP webhook payloads are signed with
HMAC-SHA256 using your app's API secret so you can verify they actually
came from Stream. SQS / SNS deliveries ride AWS-internal transports
(IAM-authenticated queues, AWS-signed SNS notifications) and are not
HMAC-signed by Stream — the AWS transport itself is the auth layer.

The SDK exposes three transport-specific helpers:

- `verifyAndParseWebhook` — gunzips, verifies the `X-Signature` header,
  and returns the parsed `Event` for HTTP webhooks.
- `parseSqs` — base64-decodes (and gunzips, if needed) an SQS message
  body and returns the parsed `Event`. No HMAC step.
- `parseSns` — same as `parseSqs`, but also unwraps the SNS HTTP
  notification envelope when given the full envelope JSON. No HMAC step.

Each helper exists both as a method on `StreamChat` and as a standalone
function (useful in serverless handlers where you don't keep a client
around).

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
and returns the typed `Event`. Every failure mode (signature mismatch,
malformed gzip, malformed base64 on the SQS/SNS variants, invalid JSON)
is surfaced through a single unified error class - `InvalidWebhookError` -
so a single `catch` arm covers all of them. Use `err.message` (or the
exported `InvalidWebhookErrorMessages` constants) when you need to
distinguish between failure modes.

```js
const { StreamChat, InvalidWebhookError } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

// Use `express.raw` so `req.body` stays as a Buffer.
app.post('/webhooks/stream', express.raw({ type: '*/*' }), (req, res) => {
  try {
    const event = client.verifyAndParseWebhook(req.body, req.headers['x-signature']);
    // ...handle the event (event.type, event.message, etc.)
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof InvalidWebhookError) {
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
the message.

Stream does not include an `X-Signature` on SQS or SNS deliveries — those
rely on the AWS transport's own authentication (IAM-authenticated queues
for SQS, AWS-signed SNS notifications). `parseSqs` and `parseSns` are
decode-and-parse helpers; there is no HMAC step. The HTTP webhook path
(`verifyAndParseWebhook`) keeps signature verification because that's the
only surface where `X-Signature` actually arrives.

Use `parseSqs` for SQS messages. It base64-decodes the body, gunzips when
the decoded bytes start with the gzip magic, and returns the parsed
`Event`.

```js
const { StreamChat, InvalidWebhookError } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

async function handleSqsMessage(message) {
  try {
    const event = client.parseSqs(message.Body);
    // ...handle the event
  } catch (err) {
    if (err instanceof InvalidWebhookError) {
      // drop the message or move it to a dead-letter queue
      return;
    }
    throw err;
  }
}
```

For SNS, pass either the full notification envelope JSON or the
pre-extracted `Message` field to `parseSns`:

```js
const { StreamChat, InvalidWebhookError } = require('stream-chat');

const client = new StreamChat('api_key', 'api_secret');

async function handleSnsNotification(envelopeBody) {
  // `envelopeBody` is the JSON SNS posts to your HTTPS endpoint, or the
  // record you pull off SQS-via-SNS.
  const event = client.parseSns(envelopeBody);
  // ...handle the event
}
```

`parseSqs` and `parseSns` are also exported as standalone, stateless
functions:

```js
const { parseSqs, parseSns } = require('stream-chat');

const event = parseSqs(messageBody);
```

## Lower-level building blocks

If you need finer control (for example, to verify a signature without
parsing the JSON, or to inflate a payload yourself), the SDK also exports:

- `gunzipPayload(body)` — returns the raw body as a `Buffer`, gunzipping
  it when the first two bytes match the gzip magic. Plain bodies pass
  through unchanged.
- `decodeSqsPayload(body)` / `decodeSnsPayload(body)` — base64-decodes
  the SQS/SNS body and then gunzips if needed. Throws
  `InvalidWebhookError` on malformed base64.
- `parseEvent(payload)` — `JSON.parse` plus the `Event` type cast.
- `verifySignature(body, signature, secret)` — constant-time HMAC-SHA256
  comparison. The signature must be computed over the uncompressed,
  base64-decoded JSON.

## API reference

| Method                                                       | Returns   | Throws                                                                              |
| ------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------- |
| `client.verifyWebhook(body, sig)`                            | `boolean` | never                                                                               |
| `client.verifyAndParseWebhook(rawBody, sig)`                 | `Event`   | `InvalidWebhookError` for signature mismatch, missing secret, or bad gzip envelope  |
| `client.parseSqs(messageBody)`                               | `Event`   | `InvalidWebhookError` for bad base64 / gzip or invalid JSON                         |
| `client.parseSns(notificationBody)`                          | `Event`   | `InvalidWebhookError` for bad base64 / gzip or invalid JSON                         |
| `verifyAndParseWebhook(rawBody, sig, secret)` _(standalone)_ | `Event`   | `InvalidWebhookError` for signature mismatch or bad gzip envelope                   |
| `parseSqs(messageBody)` _(standalone)_                       | `Event`   | `InvalidWebhookError` for bad base64 / gzip or invalid JSON                         |
| `parseSns(notificationBody)` _(standalone)_                  | `Event`   | `InvalidWebhookError` for bad base64 / gzip or invalid JSON                         |
| `verifySignature(body, sig, secret)`                         | `boolean` | never                                                                               |
| `gunzipPayload(body)`                                        | `Buffer`  | `InvalidWebhookError` when the body starts with the gzip magic but fails to inflate |
| `decodeSqsPayload(body)` / `decodeSnsPayload(body)`          | `Buffer`  | `InvalidWebhookError` for malformed base64 or bad gzip bytes                        |
| `parseEvent(payload)`                                        | `Event`   | `InvalidWebhookError` when the payload is not valid JSON                            |

`parseSqs` and `parseSns` take a single argument (the message body or SNS
envelope / pre-extracted message). They never accept a signature: Stream
does not ship an `X-Signature` on SQS or SNS deliveries — those rely on
the AWS transport's own authentication (IAM-authenticated queues,
AWS-signed SNS notifications). The HTTP webhook path
(`verifyAndParseWebhook`) keeps signature verification because that's the
only surface where `X-Signature` actually arrives.

`InvalidWebhookError` (and the `InvalidWebhookErrorMessages` constants) is
exported from the package root and from `stream-chat/dist/types/signing`.
Every webhook verification + parsing path in this SDK terminates at this
single error class, so a single `catch` arm is enough to convert auth and
format failures into a `401` / `403` response (HTTP) or a drop /
dead-letter decision (SQS / SNS). Filter on `err.message` when you need
mode-specific behaviour:

```js
const { InvalidWebhookError, InvalidWebhookErrorMessages } = require('stream-chat');

try {
  const event = client.verifyAndParseWebhook(req.body, req.headers['x-signature']);
} catch (err) {
  if (err instanceof InvalidWebhookError) {
    if (err.message === InvalidWebhookErrorMessages.signatureMismatch) {
      return res.sendStatus(401);
    }
    return res.sendStatus(400);
  }
  throw err;
}
```
