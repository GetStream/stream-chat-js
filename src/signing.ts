import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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
