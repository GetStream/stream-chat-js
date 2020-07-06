import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { encodeBase64, decodeBase64 } from './base64';

/**
 * Creates the JWT token that can be used for a UserSession
 * @method JWTUserSessionToken
 * @memberof signing
 * @private
 * @param {string} apiSecret - API Secret key
 * @param {string} userId - The user_id key in the JWT payload
 * @param {object} [extraData] - Extra that should be part of the JWT token
 * @param {object} [jwtOptions] - Options that can be past to jwt.sign
 * @return {string} JWT Token
 */
export function JWTUserToken(
  apiSecret: Secret,
  userId: string,
  extraData: Record<string, unknown> = {},
  jwtOptions: SignOptions = {},
): string {
  if (typeof userId !== 'string') {
    throw new TypeError('userId should be a string');
  }

  const payload: { user_id: string } & Record<string, unknown> = {
    user_id: userId,
    ...extraData,
  };

  // make sure we return a clear error when jwt is shimmed (ie. browser build)
  if (jwt == null || jwt.sign == null) {
    throw Error(
      `Unable to find jwt crypto, if you are getting this error is probably because you are trying to generate tokens on browser or React Native (or other environment where crypto functions are not available). Please Note: token should only be generated server-side.`,
    );
  }

  const opts: SignOptions = Object.assign(
    { algorithm: 'HS256', noTimestamp: true },
    jwtOptions,
  );
  return jwt.sign(payload, apiSecret, opts);
}

export function JWTServerToken(apiSecret: Secret, jwtOptions: SignOptions = {}): string {
  const payload = {
    server: true,
  };

  const opts: SignOptions = Object.assign(
    { algorithm: 'HS256', noTimestamp: true },
    jwtOptions,
  );
  return jwt.sign(payload, apiSecret, opts);
}

/**
 * @return {string}
 */
export function UserFromToken(token: string): string {
  const fragments = token.split('.');
  if (fragments.length !== 3) {
    return '';
  }
  const b64Payload = fragments[1];
  const payload = decodeBase64(b64Payload);
  const data = JSON.parse(payload);
  return data.user_id;
}

/**
 *
 * @param userId {string} the id of the user
 * @return {string}
 */
export function DevToken(userId: string): string {
  return [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', //{"alg": "HS256", "typ": "JWT"}
    encodeBase64(JSON.stringify({ user_id: userId })),
    'devtoken', // hardcoded signature
  ].join('.');
}

/**
 *
 * @param body {string} the signed message
 * @param secret {string} the shared secret used to generate the signature (Stream API secret)
 * @param signature {string} the signature to validate
 * @return {boolean}
 */
export function CheckSignature(body: string, secret: string, signature: string): boolean {
  const key = Buffer.from(secret, 'ascii');
  const hash = crypto
    .createHmac('sha256', key)
    .update(body)
    .digest('hex');
  return hash === signature;
}
