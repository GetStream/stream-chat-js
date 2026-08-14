# Webhooks

**`stream-chat` no longer has a webhook surface.** As of v10 the SDK is
client-side only, and webhook verification needs the API secret that a
client-side SDK must never hold. Every helper this page used to document —
`client.verifyWebhook`, `client.verifyAndParseWebhook`, `client.parseSqs`,
`client.parseSns`, and the standalone `verifySignature`, `CheckSignature`,
`verifyAndParseWebhook`, `parseSqs`, `parseSns`, `gunzipPayload`,
`decodeSqsPayload`, `decodeSnsPayload`, `parseEvent`, `InvalidWebhookError`,
`InvalidWebhookErrorMessages` — has been removed, together with the
`jsonwebtoken` / `zlib` / `crypto` code paths that backed them.

Handle webhooks with the server SDK instead:
[`@stream-io/node-sdk`](https://github.com/GetStream/stream-node). It keeps
the v9 names on the client and reads the secret from construction, so the
handler body barely changes:

```js
const { StreamClient } = require('@stream-io/node-sdk');

const client = new StreamClient(process.env.STREAM_KEY, process.env.STREAM_SECRET);

// Use express.raw so req.body stays a Buffer — the HMAC is computed over
// the uncompressed JSON bytes Stream signed.
app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  try {
    const event = client.verifyAndParseWebhook(req.body, req.headers['x-signature']);
    handle(event);
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(400);
  }
});
```

`client.verifyWebhook`, `client.parseSqs`, and `client.parseSns` are
available on the same client with their v9 shapes, and
`InvalidWebhookError` is re-exported for `instanceof` checks.

Migration details, including the full v9 → node-sdk mapping table:
[`v9-to-v10-migration-guide-server-side.md`](../v9-to-v10-migration-guide-server-side.md#webhook--sns--sqs).

Product documentation for configuring webhooks, SQS, and SNS:
<https://getstream.io/chat/docs/javascript/webhooks_overview/>.
