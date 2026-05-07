import crypto from 'crypto';
import zlib from 'zlib';

import { describe, it, expect, beforeEach } from 'vitest';

import { StreamChat } from '../../src/client';
import { WebhookSignatureError } from '../../src/signing';

const JSON_BODY = '{"type":"message.new","message":{"text":"the quick brown fox"}}';
const API_SECRET = 'tsec2';

const sign = (body: Buffer | string) =>
  crypto.createHmac('sha256', Buffer.from(API_SECRET, 'utf8')).update(body).digest('hex');

const gzip = (body: Buffer | string) =>
  zlib.gzipSync(Buffer.isBuffer(body) ? body : Buffer.from(body));

const base64 = (body: Buffer | string) =>
  (Buffer.isBuffer(body) ? body : Buffer.from(body)).toString('base64');

describe('Webhook decompression and verification', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api_key', API_SECRET);
  });

  describe('verifyWebhook (existing helper, unchanged)', () => {
    it('still validates a plain JSON body with its HMAC signature', () => {
      const signature = sign(JSON_BODY);
      expect(client.verifyWebhook(JSON_BODY, signature)).toBe(true);
    });

    it('rejects when signature is wrong', () => {
      expect(client.verifyWebhook(JSON_BODY, 'deadbeef')).toBe(false);
    });
  });

  describe('decompressWebhookBody', () => {
    it('returns the input unchanged when both encodings are null', () => {
      const out = client.decompressWebhookBody(JSON_BODY, null, null);
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('returns the input unchanged when both encodings are undefined', () => {
      const out = client.decompressWebhookBody(JSON_BODY);
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('returns the input unchanged when both encodings are empty strings', () => {
      const out = client.decompressWebhookBody(JSON_BODY, '', '');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('returns the input unchanged when given a Buffer with no encodings', () => {
      const out = client.decompressWebhookBody(Buffer.from(JSON_BODY));
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('round-trips a gzip-compressed payload (Buffer input)', () => {
      const compressed = gzip(JSON_BODY);
      const out = client.decompressWebhookBody(compressed, 'gzip');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('round-trips a base64-wrapped payload from a string input', () => {
      const wrapped = base64(JSON_BODY);
      const out = client.decompressWebhookBody(wrapped, null, 'base64');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('round-trips a base64-wrapped payload from a Buffer input', () => {
      const wrapped = Buffer.from(base64(JSON_BODY), 'ascii');
      const out = client.decompressWebhookBody(wrapped, null, 'base64');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('round-trips a base64+gzip payload (SQS / SNS shape)', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const out = client.decompressWebhookBody(wrapped, 'gzip', 'base64');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('treats encoding names case-insensitively (GZIP)', () => {
      const compressed = gzip(JSON_BODY);
      const out = client.decompressWebhookBody(compressed, 'GZIP');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('treats encoding names case-insensitively (BASE64)', () => {
      const wrapped = base64(JSON_BODY);
      const out = client.decompressWebhookBody(wrapped, null, 'BASE64');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('accepts the b64 alias for base64', () => {
      const wrapped = base64(JSON_BODY);
      const out = client.decompressWebhookBody(wrapped, null, 'b64');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it.each(['br', 'brotli', 'zstd', 'deflate', 'compress', 'lz4'])(
      'rejects unsupported contentEncoding %s',
      (encoding) => {
        expect(() => client.decompressWebhookBody(JSON_BODY, encoding)).toThrow(
          /unsupported webhook Content-Encoding/,
        );
      },
    );

    it.each(['hex', 'url', 'binary'])(
      'rejects unsupported payloadEncoding %s',
      (encoding) => {
        expect(() => client.decompressWebhookBody(JSON_BODY, null, encoding)).toThrow(
          /unsupported webhook payload_encoding/,
        );
      },
    );

    it('throws when gzip bytes are invalid', () => {
      expect(() =>
        client.decompressWebhookBody(Buffer.from('not actually gzip'), 'gzip'),
      ).toThrow(/failed to decompress webhook body/);
    });

    it('throws WebhookSignatureError when base64 input is malformed', () => {
      expect(() =>
        client.decompressWebhookBody('not*valid*base64', null, 'base64'),
      ).toThrow(WebhookSignatureError);
    });
  });

  describe('verifyAndDecodeWebhook', () => {
    it('returns the body for a plain HTTP webhook with a valid signature', () => {
      const signature = sign(JSON_BODY);
      const out = client.verifyAndDecodeWebhook(JSON_BODY, signature);
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('returns the body for a gzip-compressed HTTP webhook', () => {
      const compressed = gzip(JSON_BODY);
      const signature = sign(JSON_BODY);
      const out = client.verifyAndDecodeWebhook(compressed, signature, 'gzip');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('returns the body for a base64+gzip SQS / SNS payload', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const signature = sign(JSON_BODY);
      const out = client.verifyAndDecodeWebhook(wrapped, signature, 'gzip', 'base64');
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('throws WebhookSignatureError on signature mismatch', () => {
      expect(() => client.verifyAndDecodeWebhook(JSON_BODY, 'deadbeef')).toThrow(
        WebhookSignatureError,
      );
    });

    it('rejects a gzip body when the signature was computed over the compressed bytes', () => {
      const compressed = gzip(JSON_BODY);
      const wrongSignature = sign(compressed);
      expect(() =>
        client.verifyAndDecodeWebhook(compressed, wrongSignature, 'gzip'),
      ).toThrow(WebhookSignatureError);
    });

    it('rejects a base64+gzip body when the signature was computed over the wrapped bytes', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const wrongSignature = sign(wrapped);
      expect(() =>
        client.verifyAndDecodeWebhook(wrapped, wrongSignature, 'gzip', 'base64'),
      ).toThrow(WebhookSignatureError);
    });

    it('throws WebhookSignatureError when the client has no API secret', () => {
      const secretlessClient = new StreamChat('api_key');
      expect(() => secretlessClient.verifyAndDecodeWebhook(JSON_BODY, 'sig')).toThrow(
        WebhookSignatureError,
      );
    });
  });
});
