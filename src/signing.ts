import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import zlib from 'zlib';
import { decodeBase64, encodeBase64 } from './base64';
import type { UR } from './types';

/**
 * Creates the JWT token that can be used for a UserSession
 * @method JWTUserToken
 * @memberof signing
 * @private
 * @param {Secret} apiSecret - API Secret key
 * @param {string} userId - The user_id key in the JWT payload
 * @param {UR} [extraData] - Extra that should be part of the JWT token
 * @param {SignOptions} [jwtOptions] - Options that can be past to jwt.sign
 * @return {string} JWT Token
 */
export function JWTUserToken(
  apiSecret: jwt.Secret,
  userId: string,
  extraData: UR = {},
  jwtOptions: jwt.SignOptions = {},
) {
  if (typeof userId !== 'string') {
    throw new TypeError('userId should be a string');
  }

  const payload: { user_id: string } & UR = {
    user_id: userId,
    ...extraData,
  };

  // make sure we return a clear error when jwt is shimmed (ie. browser build)
  if (jwt == null || jwt.sign == null) {
    throw Error(
      `Unable to find jwt crypto, if you are getting this error is probably because you are trying to generate tokens on browser or React Native (or other environment where crypto functions are not available). Please Note: token should only be generated server-side.`,
    );
  }

  const opts: jwt.SignOptions = Object.assign(
    { algorithm: 'HS256', noTimestamp: true },
    jwtOptions,
  );

  if (payload.iat) {
    opts.noTimestamp = false;
  }
  return jwt.sign(payload, apiSecret, opts);
}

export function JWTServerToken(apiSecret: jwt.Secret, jwtOptions: jwt.SignOptions = {}) {
  const payload = {
    server: true,
  };

  const opts: jwt.SignOptions = Object.assign(
    { algorithm: 'HS256', noTimestamp: true },
    jwtOptions,
  );
  return jwt.sign(payload, apiSecret, opts);
}

export function UserFromToken(token: string) {
  const fragments = token.split('.');
  if (fragments.length !== 3) {
    return '';
  }
  const b64Payload = fragments[1];
  const payload = decodeBase64(b64Payload);
  const data = JSON.parse(payload);
  return data.user_id as string;
}

/**
 *
 * @param {string} userId the id of the user
 * @return {string}
 */
export function DevToken(userId: string) {
  return [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', //{"alg": "HS256", "typ": "JWT"}
    encodeBase64(JSON.stringify({ user_id: userId })),
    'devtoken', // hardcoded signature
  ].join('.');
}

/**
 *
 * @param {string | Buffer} body the signed message
 * @param {string} secret the shared secret used to generate the signature (Stream API secret)
 * @param {string} signature the signature to validate
 * @return {boolean}
 */
export function CheckSignature(body: string | Buffer, secret: string, signature: string) {
  const key = Buffer.from(secret, 'utf8');
  const hash = crypto.createHmac('sha256', key).update(body).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Thrown by `verifyAndDecodeWebhookBody` (and the corresponding
 * `StreamChat.verifyAndDecodeWebhook` wrapper) when the supplied
 * `x-signature` does not match the HMAC of the uncompressed payload, or when
 * a `payload_encoding` wrapper such as base64 is malformed.
 */
export class WebhookSignatureError extends Error {
  public name = 'WebhookSignatureError';

  constructor(message = 'invalid webhook signature') {
    super(message);
  }
}

const PAYLOAD_ENCODING_BASE64 = new Set(['base64', 'b64']);
const CONTENT_ENCODING_GZIP = 'gzip';

const normalizeEncoding = (value?: string | null): string =>
  value == null ? '' : value.trim().toLowerCase();

/**
 * Reverses the encoding wrappers Stream applies to outbound webhook / SQS /
 * SNS payloads, returning the raw JSON Buffer the server signed.
 *
 * Decoding order matches the server's encoding order: first the transport
 * envelope (`payload_encoding`, e.g. base64 for SQS / SNS firehose), then the
 * compression layer (`Content-Encoding`, e.g. gzip).
 *
 * `null`, `undefined`, or empty strings for either argument are treated as a
 * no-op so existing HTTP webhook integrations behave identically to today.
 *
 * @param rawBody Raw transport bytes (HTTP request body, SQS `Body`, SNS
 *   `Message`).
 * @param contentEncoding `'gzip'` when payload compression is enabled,
 *   otherwise `null` / `undefined`.
 * @param payloadEncoding `'base64'` (or alias `'b64'`) for SQS / SNS firehose
 *   delivery, otherwise `null` / `undefined`.
 *
 * @throws {WebhookSignatureError} When `payloadEncoding` is `'base64'` but the
 *   input bytes are not valid canonical base64.
 * @throws {Error} When the body cannot be gunzipped, or when an unsupported
 *   encoding name is supplied.
 */
export function decompressWebhookBody(
  rawBody: string | Buffer,
  contentEncoding?: string | null,
  payloadEncoding?: string | null,
): Buffer {
  let working: Buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

  const payloadEnc = normalizeEncoding(payloadEncoding);
  if (payloadEnc) {
    if (PAYLOAD_ENCODING_BASE64.has(payloadEnc)) {
      const inputStr = working.toString('ascii');
      // Reject anything that isn't canonical base64 up front. Node's base64
      // decoder is permissive (silently strips characters outside the
      // alphabet, accepts both standard and URL-safe variants), so we have
      // to be strict here to avoid silently corrupting the body before the
      // signature check runs.
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(inputStr) || inputStr.length % 4 !== 0) {
        throw new WebhookSignatureError(
          'invalid webhook payload_encoding: malformed base64 input',
        );
      }
      const decoded = Buffer.from(inputStr, 'base64');
      if (decoded.toString('base64').length !== inputStr.length) {
        throw new WebhookSignatureError(
          'invalid webhook payload_encoding: malformed base64 input',
        );
      }
      working = decoded;
    } else {
      throw new Error(
        `unsupported webhook payload_encoding: ${payloadEncoding}. This SDK only supports base64.`,
      );
    }
  }

  const contentEnc = normalizeEncoding(contentEncoding);
  if (contentEnc) {
    if (contentEnc === CONTENT_ENCODING_GZIP) {
      try {
        working = zlib.gunzipSync(working);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(`failed to decompress webhook body: ${cause}`);
      }
    } else {
      throw new Error(
        `unsupported webhook Content-Encoding: ${contentEncoding}. This SDK only supports gzip; set webhook_compression_algorithm to "gzip" on the app config.`,
      );
    }
  }

  return working;
}

/**
 * Decompresses (when needed) and verifies the HMAC signature of an outbound
 * Stream webhook payload, returning the uncompressed JSON Buffer.
 *
 * The signature is always computed over the innermost (uncompressed,
 * base64-decoded) JSON, so the verification rule is invariant across HTTP
 * webhooks and SQS / SNS firehose delivery.
 *
 * @throws {WebhookSignatureError} When the signature does not match, or when
 *   the `payload_encoding` envelope is malformed.
 * @throws {Error} When the body cannot be gunzipped, or when an unsupported
 *   encoding name is supplied.
 */
export function verifyAndDecodeWebhookBody(
  rawBody: string | Buffer,
  xSignature: string,
  secret: string,
  contentEncoding?: string | null,
  payloadEncoding?: string | null,
): Buffer {
  const decoded = decompressWebhookBody(rawBody, contentEncoding, payloadEncoding);
  if (!CheckSignature(decoded, secret, xSignature)) {
    throw new WebhookSignatureError();
  }
  return decoded;
}
