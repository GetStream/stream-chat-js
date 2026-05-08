import crypto from 'crypto';
import zlib from 'zlib';

import { describe, it, expect, beforeEach } from 'vitest';

import { StreamChat } from '../../src/client';
import {
  decodeSnsPayload,
  decodeSqsPayload,
  parseEvent,
  ungzipPayload,
  verifyAndParseSns,
  verifyAndParseSqs,
  verifyAndParseWebhook,
  verifySignature,
  WebhookSignatureError,
} from '../../src/signing';

const JSON_BODY = '{"type":"message.new","message":{"text":"the quick brown fox"}}';
const API_SECRET = 'tsec2';

const sign = (body: Buffer | string) =>
  crypto.createHmac('sha256', Buffer.from(API_SECRET, 'utf8')).update(body).digest('hex');

const gzip = (body: Buffer | string) =>
  zlib.gzipSync(Buffer.isBuffer(body) ? body : Buffer.from(body));

const base64 = (body: Buffer | string) =>
  (Buffer.isBuffer(body) ? body : Buffer.from(body)).toString('base64');

describe('Webhook verification + parsing', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api_key', API_SECRET);
  });

  describe('verifyWebhook (legacy boolean helper, unchanged)', () => {
    it('validates a plain JSON body with its HMAC signature', () => {
      expect(client.verifyWebhook(JSON_BODY, sign(JSON_BODY))).toBe(true);
    });

    it('rejects when signature is wrong', () => {
      expect(client.verifyWebhook(JSON_BODY, 'deadbeef')).toBe(false);
    });
  });

  describe('verifySignature', () => {
    it('returns true for matching HMAC', () => {
      expect(verifySignature(JSON_BODY, sign(JSON_BODY), API_SECRET)).toBe(true);
    });

    it('returns false for mismatched signature', () => {
      expect(verifySignature(JSON_BODY, '0'.repeat(64), API_SECRET)).toBe(false);
    });

    it('returns false for wrong secret', () => {
      const sig = crypto.createHmac('sha256', 'other').update(JSON_BODY).digest('hex');
      expect(verifySignature(JSON_BODY, sig, API_SECRET)).toBe(false);
    });

    it('rejects signatures computed over compressed bytes', () => {
      const compressed = gzip(JSON_BODY);
      expect(verifySignature(JSON_BODY, sign(compressed), API_SECRET)).toBe(false);
    });
  });

  describe('ungzipPayload', () => {
    it('passes through plain bytes unchanged', () => {
      const out = ungzipPayload(JSON_BODY);
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('passes through Buffer input unchanged', () => {
      const out = ungzipPayload(Buffer.from(JSON_BODY));
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('inflates gzip-magic bytes', () => {
      const out = ungzipPayload(gzip(JSON_BODY));
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('returns Buffer in all cases', () => {
      expect(Buffer.isBuffer(ungzipPayload(JSON_BODY))).toBe(true);
      expect(Buffer.isBuffer(ungzipPayload(gzip(JSON_BODY)))).toBe(true);
    });

    it('handles empty input', () => {
      expect(ungzipPayload(Buffer.alloc(0)).length).toBe(0);
    });

    it('throws WebhookSignatureError on truncated gzip with magic', () => {
      const bad = Buffer.concat([
        Buffer.from([0x1f, 0x8b, 0x08]),
        Buffer.from([0, 0, 0]),
      ]);
      expect(() => ungzipPayload(bad)).toThrow(WebhookSignatureError);
    });
  });

  describe('decodeSqsPayload', () => {
    it('decodes base64 only (no compression)', () => {
      expect(decodeSqsPayload(base64(JSON_BODY)).toString('utf8')).toBe(JSON_BODY);
    });

    it('decodes base64 + gzip', () => {
      expect(decodeSqsPayload(base64(gzip(JSON_BODY))).toString('utf8')).toBe(JSON_BODY);
    });

    it('throws WebhookSignatureError on malformed base64', () => {
      expect(() => decodeSqsPayload('!!!not-base64!!!')).toThrow(WebhookSignatureError);
    });
  });

  describe('decodeSnsPayload', () => {
    it('aliases decodeSqsPayload', () => {
      const wrapped = base64(gzip(JSON_BODY));
      expect(decodeSnsPayload(wrapped).equals(decodeSqsPayload(wrapped))).toBe(true);
    });

    it('round-trips base64 + gzip', () => {
      expect(decodeSnsPayload(base64(gzip(JSON_BODY))).toString('utf8')).toBe(JSON_BODY);
    });
  });

  describe('parseEvent', () => {
    it('parses Buffer payload into a typed event', () => {
      const ev = parseEvent(Buffer.from(JSON_BODY));
      expect(ev.type).toBe('message.new');
      expect(ev.message?.text).toBe('the quick brown fox');
    });

    it('parses string payload', () => {
      const ev = parseEvent(JSON_BODY);
      expect(ev.type).toBe('message.new');
    });

    it('still parses unknown event types at runtime', () => {
      const ev = parseEvent('{"type":"a.future.event","custom":42}');
      expect(ev.type).toBe('a.future.event');
    });

    it('throws on malformed JSON', () => {
      expect(() => parseEvent('not json')).toThrow(SyntaxError);
    });
  });

  describe('verifyAndParseWebhook', () => {
    it('parses a plain HTTP webhook with a valid signature', () => {
      const ev = client.verifyAndParseWebhook(JSON_BODY, sign(JSON_BODY));
      expect(ev.type).toBe('message.new');
      expect(ev.message?.text).toBe('the quick brown fox');
    });

    it('parses a gzip-compressed HTTP webhook', () => {
      const ev = client.verifyAndParseWebhook(gzip(JSON_BODY), sign(JSON_BODY));
      expect(ev.type).toBe('message.new');
    });

    it('throws WebhookSignatureError on signature mismatch', () => {
      expect(() => client.verifyAndParseWebhook(JSON_BODY, 'deadbeef')).toThrow(
        WebhookSignatureError,
      );
    });

    it('rejects a gzip body when the signature was computed over compressed bytes', () => {
      const compressed = gzip(JSON_BODY);
      expect(() => client.verifyAndParseWebhook(compressed, sign(compressed))).toThrow(
        WebhookSignatureError,
      );
    });

    it('throws WebhookSignatureError when the client has no API secret', () => {
      const secretless = new StreamChat('api_key');
      expect(() => secretless.verifyAndParseWebhook(JSON_BODY, 'sig')).toThrow(
        WebhookSignatureError,
      );
    });

    it('also works as a package-level function', () => {
      const ev = verifyAndParseWebhook(JSON_BODY, sign(JSON_BODY), API_SECRET);
      expect(ev.type).toBe('message.new');
    });
  });

  describe('verifyAndParseSqs', () => {
    it('parses a base64-only SQS body', () => {
      const ev = client.verifyAndParseSqs(base64(JSON_BODY), sign(JSON_BODY));
      expect(ev.type).toBe('message.new');
    });

    it('parses a base64 + gzip SQS body', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const ev = client.verifyAndParseSqs(wrapped, sign(JSON_BODY));
      expect(ev.type).toBe('message.new');
    });

    it('rejects a wrapped body when the signature was computed over the wrapper', () => {
      const wrapped = base64(gzip(JSON_BODY));
      expect(() => client.verifyAndParseSqs(wrapped, sign(wrapped))).toThrow(
        WebhookSignatureError,
      );
    });

    it('also works as a package-level function', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const ev = verifyAndParseSqs(wrapped, sign(JSON_BODY), API_SECRET);
      expect(ev.type).toBe('message.new');
    });

    it('surfaces malformed base64 as WebhookSignatureError', () => {
      expect(() => client.verifyAndParseSqs('!!!not-base64!!!', 'sig')).toThrow(
        WebhookSignatureError,
      );
    });
  });

  describe('verifyAndParseSns', () => {
    it('parses a base64 + gzip SNS message', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const ev = client.verifyAndParseSns(wrapped, sign(JSON_BODY));
      expect(ev.type).toBe('message.new');
    });

    it('produces the same event as verifyAndParseSqs', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const sig = sign(JSON_BODY);
      expect(client.verifyAndParseSns(wrapped, sig)).toEqual(
        client.verifyAndParseSqs(wrapped, sig),
      );
    });

    it('also works as a package-level function', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const ev = verifyAndParseSns(wrapped, sign(JSON_BODY), API_SECRET);
      expect(ev.type).toBe('message.new');
    });
  });
});
