import crypto from 'crypto';
import zlib from 'zlib';

import { describe, it, expect, beforeEach } from 'vitest';

import { StreamChat } from '../../src/client';
import {
  decodeSnsPayload,
  decodeSqsPayload,
  parseEvent,
  gunzipPayload,
  verifyAndParseSns,
  verifyAndParseSqs,
  verifyAndParseWebhook,
  verifySignature,
  InvalidWebhookError,
  InvalidWebhookErrorMessages,
} from '../../src/signing';

const JSON_BODY = '{"type":"message.new","message":{"text":"the quick brown fox"}}';
const API_SECRET = 'tsec2';

const sign = (body: Buffer | string) =>
  crypto.createHmac('sha256', Buffer.from(API_SECRET, 'utf8')).update(body).digest('hex');

const gzip = (body: Buffer | string) =>
  zlib.gzipSync(Buffer.isBuffer(body) ? body : Buffer.from(body));

const base64 = (body: Buffer | string) =>
  (Buffer.isBuffer(body) ? body : Buffer.from(body)).toString('base64');

const snsEnvelope = (innerMessage: string) =>
  JSON.stringify({
    Type: 'Notification',
    MessageId: '22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324',
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:stream-webhooks',
    Message: innerMessage,
    Timestamp: '2026-05-11T10:00:00.000Z',
    SignatureVersion: '1',
    MessageAttributes: {
      'X-Signature': { Type: 'String', Value: '<signature placeholder>' },
    },
  });

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

  describe('InvalidWebhookErrorMessages', () => {
    it('exposes the cross-SDK failure-mode messages', () => {
      expect(InvalidWebhookErrorMessages).toEqual({
        signatureMismatch: 'signature mismatch',
        invalidBase64: 'invalid base64 encoding',
        gzipFailed: 'gzip decompression failed',
        invalidJson: 'invalid JSON payload',
      });
    });
  });

  describe('gunzipPayload', () => {
    it('passes through plain bytes unchanged', () => {
      const out = gunzipPayload(JSON_BODY);
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('passes through Buffer input unchanged', () => {
      const out = gunzipPayload(Buffer.from(JSON_BODY));
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('inflates gzip-magic bytes', () => {
      const out = gunzipPayload(gzip(JSON_BODY));
      expect(out.toString('utf8')).toBe(JSON_BODY);
    });

    it('returns Buffer in all cases', () => {
      expect(Buffer.isBuffer(gunzipPayload(JSON_BODY))).toBe(true);
      expect(Buffer.isBuffer(gunzipPayload(gzip(JSON_BODY)))).toBe(true);
    });

    it('handles empty input', () => {
      expect(gunzipPayload(Buffer.alloc(0)).length).toBe(0);
    });

    it('throws InvalidWebhookError on truncated gzip with magic', () => {
      const bad = Buffer.concat([
        Buffer.from([0x1f, 0x8b, 0x08]),
        Buffer.from([0, 0, 0]),
      ]);
      expect(() => gunzipPayload(bad)).toThrow(InvalidWebhookError);
      expect(() => gunzipPayload(bad)).toThrow(/gzip decompression failed/);
    });

    it('preserves the underlying zlib error as `cause` on truncated gzip', () => {
      const bad = Buffer.concat([
        Buffer.from([0x1f, 0x8b, 0x08]),
        Buffer.from([0, 0, 0]),
      ]);
      try {
        gunzipPayload(bad);
        throw new Error('expected gunzipPayload to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidWebhookError);
        expect((err as InvalidWebhookError).cause).toBeInstanceOf(Error);
      }
    });

    it("decompresses Tommaso's helloworld gzip fixture", () => {
      const fixture = Buffer.from('H4sIAGrYAWoAA8tIzcnJL88vykkBAK0g6/kKAAAA', 'base64');
      expect(gunzipPayload(fixture).equals(Buffer.from('helloworld'))).toBe(true);
    });
  });

  describe('decodeSqsPayload', () => {
    it('decodes base64 only (no compression)', () => {
      expect(decodeSqsPayload(base64(JSON_BODY)).toString('utf8')).toBe(JSON_BODY);
    });

    it('decodes base64 + gzip', () => {
      expect(decodeSqsPayload(base64(gzip(JSON_BODY))).toString('utf8')).toBe(JSON_BODY);
    });

    it('throws InvalidWebhookError on malformed base64', () => {
      expect(() => decodeSqsPayload('!!!not-base64!!!')).toThrow(InvalidWebhookError);
      expect(() => decodeSqsPayload('!!!not-base64!!!')).toThrow(
        /invalid base64 encoding/,
      );
    });

    it("decodes Tommaso's plain base64 helloworld fixture", () => {
      expect(decodeSqsPayload('aGVsbG93b3JsZA==').equals(Buffer.from('helloworld'))).toBe(
        true,
      );
    });

    it("decodes Tommaso's base64+gzip helloworld fixture", () => {
      expect(
        decodeSqsPayload('H4sIAGrYAWoAA8tIzcnJL88vykkBAK0g6/kKAAAA').equals(
          Buffer.from('helloworld'),
        ),
      ).toBe(true);
    });
  });

  describe('decodeSnsPayload', () => {
    it('treats a pre-extracted Message identically to decodeSqsPayload', () => {
      const wrapped = base64(gzip(JSON_BODY));
      expect(decodeSnsPayload(wrapped).equals(decodeSqsPayload(wrapped))).toBe(true);
    });

    it('round-trips base64 + gzip (pre-extracted Message)', () => {
      expect(decodeSnsPayload(base64(gzip(JSON_BODY))).toString('utf8')).toBe(JSON_BODY);
    });

    it('unwraps a full SNS HTTP notification envelope', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const envelope = snsEnvelope(wrapped);
      expect(decodeSnsPayload(envelope).toString('utf8')).toBe(JSON_BODY);
    });

    it('handles whitespace before the envelope JSON', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const envelope = `\n  ${snsEnvelope(wrapped)}`;
      expect(decodeSnsPayload(envelope).toString('utf8')).toBe(JSON_BODY);
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

    it('throws InvalidWebhookError on malformed JSON', () => {
      expect(() => parseEvent('not json')).toThrow(InvalidWebhookError);
      expect(() => parseEvent('not json')).toThrow(/invalid JSON payload/);
    });

    it('preserves the underlying SyntaxError as `cause` on malformed JSON', () => {
      try {
        parseEvent('not json');
        throw new Error('expected parseEvent to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidWebhookError);
        expect((err as InvalidWebhookError).cause).toBeInstanceOf(SyntaxError);
      }
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

    it('throws InvalidWebhookError with "signature mismatch" on signature mismatch', () => {
      expect(() => client.verifyAndParseWebhook(JSON_BODY, 'deadbeef')).toThrow(
        InvalidWebhookError,
      );
      expect(() => client.verifyAndParseWebhook(JSON_BODY, 'deadbeef')).toThrow(
        /signature mismatch/,
      );
    });

    it('rejects a gzip body when the signature was computed over compressed bytes', () => {
      const compressed = gzip(JSON_BODY);
      expect(() => client.verifyAndParseWebhook(compressed, sign(compressed))).toThrow(
        InvalidWebhookError,
      );
    });

    it('throws InvalidWebhookError when the client has no API secret', () => {
      const secretless = new StreamChat('api_key');
      expect(() => secretless.verifyAndParseWebhook(JSON_BODY, 'sig')).toThrow(
        InvalidWebhookError,
      );
    });

    it('throws InvalidWebhookError with "gzip decompression failed" on truncated gzip', () => {
      const bad = Buffer.concat([
        Buffer.from([0x1f, 0x8b, 0x08]),
        Buffer.from([0, 0, 0]),
      ]);
      expect(() => client.verifyAndParseWebhook(bad, 'sig')).toThrow(InvalidWebhookError);
      expect(() => client.verifyAndParseWebhook(bad, 'sig')).toThrow(
        /gzip decompression failed/,
      );
    });

    it('throws InvalidWebhookError with "invalid JSON payload" on non-JSON after verification', () => {
      const nonJson = 'not a json document';
      const sig = sign(nonJson);
      expect(() => client.verifyAndParseWebhook(nonJson, sig)).toThrow(
        InvalidWebhookError,
      );
      expect(() => client.verifyAndParseWebhook(nonJson, sig)).toThrow(
        /invalid JSON payload/,
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
        InvalidWebhookError,
      );
    });

    it('also works as a package-level function', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const ev = verifyAndParseSqs(wrapped, sign(JSON_BODY), API_SECRET);
      expect(ev.type).toBe('message.new');
    });

    it('throws InvalidWebhookError with "invalid base64 encoding" on malformed SQS body', () => {
      expect(() => client.verifyAndParseSqs('!!!not-base64!!!', 'sig')).toThrow(
        InvalidWebhookError,
      );
      expect(() => client.verifyAndParseSqs('!!!not-base64!!!', 'sig')).toThrow(
        /invalid base64 encoding/,
      );
    });
  });

  describe('verifyAndParseSns', () => {
    it('parses a pre-extracted base64 + gzip SNS message', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const ev = client.verifyAndParseSns(wrapped, sign(JSON_BODY));
      expect(ev.type).toBe('message.new');
    });

    it('produces the same event as verifyAndParseSqs (pre-extracted Message)', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const sig = sign(JSON_BODY);
      expect(client.verifyAndParseSns(wrapped, sig)).toEqual(
        client.verifyAndParseSqs(wrapped, sig),
      );
    });

    it('parses a full SNS HTTP notification envelope', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const envelope = snsEnvelope(wrapped);
      const ev = client.verifyAndParseSns(envelope, sign(JSON_BODY));
      expect(ev.type).toBe('message.new');
    });

    it('rejects signature computed over the envelope JSON, not the payload', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const envelope = snsEnvelope(wrapped);
      expect(() => client.verifyAndParseSns(envelope, sign(envelope))).toThrow(
        InvalidWebhookError,
      );
    });

    it('also works as a package-level function', () => {
      const wrapped = base64(gzip(JSON_BODY));
      const ev = verifyAndParseSns(wrapped, sign(JSON_BODY), API_SECRET);
      expect(ev.type).toBe('message.new');
    });
  });

  describe('SQS / SNS verification is optional (CHA-3071)', () => {
    it('verifyAndParseSqs(body) parses a plain JSON body without verification', () => {
      const ev = verifyAndParseSqs(base64(JSON_BODY));
      expect(ev.type).toBe('message.new');
      expect(ev.message?.text).toBe('the quick brown fox');
    });

    it('verifyAndParseSqs(body) parses a base64-only body without verification', () => {
      const ev = verifyAndParseSqs(base64(JSON_BODY));
      expect(ev.type).toBe('message.new');
    });

    it('verifyAndParseSqs(body) parses a base64 + gzip body without verification', () => {
      const ev = verifyAndParseSqs(base64(gzip(JSON_BODY)));
      expect(ev.type).toBe('message.new');
    });

    it('verifyAndParseSns(envelope) parses a full SNS envelope without verification', () => {
      const envelope = snsEnvelope(base64(gzip(JSON_BODY)));
      const ev = verifyAndParseSns(envelope);
      expect(ev.type).toBe('message.new');
    });

    it('verifyAndParseSns(message) parses a pre-extracted SNS message without verification', () => {
      const ev = verifyAndParseSns(base64(gzip(JSON_BODY)));
      expect(ev.type).toBe('message.new');
    });

    it('instance method without secret + no signature succeeds (no verification)', () => {
      const secretless = new StreamChat('api_key');
      const ev = secretless.verifyAndParseSqs(base64(gzip(JSON_BODY)));
      expect(ev.type).toBe('message.new');
      const ev2 = secretless.verifyAndParseSns(snsEnvelope(base64(gzip(JSON_BODY))));
      expect(ev2.type).toBe('message.new');
    });

    it('instance method without secret + signature still throws', () => {
      const secretless = new StreamChat('api_key');
      expect(() =>
        secretless.verifyAndParseSqs(base64(JSON_BODY), sign(JSON_BODY)),
      ).toThrow(InvalidWebhookError);
      expect(() =>
        secretless.verifyAndParseSns(base64(JSON_BODY), sign(JSON_BODY)),
      ).toThrow(InvalidWebhookError);
    });

    it('verifyAndParseSqs(body, signature) without secret throws InvalidWebhookError', () => {
      expect(() => verifyAndParseSqs(base64(JSON_BODY), sign(JSON_BODY))).toThrow(
        InvalidWebhookError,
      );
      expect(() => verifyAndParseSqs(base64(JSON_BODY), sign(JSON_BODY))).toThrow(
        /signature and secret must both be provided/,
      );
    });

    it('verifyAndParseSqs(body, undefined, secret) without signature throws InvalidWebhookError', () => {
      expect(() => verifyAndParseSqs(base64(JSON_BODY), undefined, API_SECRET)).toThrow(
        InvalidWebhookError,
      );
      expect(() => verifyAndParseSqs(base64(JSON_BODY), undefined, API_SECRET)).toThrow(
        /signature and secret must both be provided/,
      );
    });

    it('verifyAndParseSns(body, signature) without secret throws InvalidWebhookError', () => {
      expect(() => verifyAndParseSns(base64(JSON_BODY), sign(JSON_BODY))).toThrow(
        InvalidWebhookError,
      );
      expect(() => verifyAndParseSns(base64(JSON_BODY), sign(JSON_BODY))).toThrow(
        /signature and secret must both be provided/,
      );
    });

    it('still enforces signature when both signature and secret are provided', () => {
      expect(() => verifyAndParseSqs(base64(JSON_BODY), 'deadbeef', API_SECRET)).toThrow(
        /signature mismatch/,
      );
      expect(() => verifyAndParseSns(base64(JSON_BODY), 'deadbeef', API_SECRET)).toThrow(
        /signature mismatch/,
      );
    });

    it('still surfaces malformed-envelope errors when verification is skipped', () => {
      expect(() => verifyAndParseSqs('!!!not-base64!!!')).toThrow(InvalidWebhookError);
      expect(() => verifyAndParseSqs('!!!not-base64!!!')).toThrow(
        /invalid base64 encoding/,
      );
    });
  });
});
