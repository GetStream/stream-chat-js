import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
export function JWTUserToken(apiSecret, userId, extraData = {}, jwtOptions = {}) {
	if (typeof userId !== 'string') {
		throw new TypeError('userId should be a string');
	}

	const payload = {
		user_id: userId,
		...extraData,
	};

	// make sure we return a clear error when jwt is shimmed (ie. browser build)
	if (jwt == null || jwt.sign == null) {
		throw Error(
			`Unable to find jwt crypto, if you are getting this error is probably because you are trying to generate tokens on browser or React Native (or other environment where crypto functions are not available). Please Note: token should only be generated server-side.`,
		);
	}

	const opts = Object.assign({ algorithm: 'HS256', noTimestamp: true }, jwtOptions);
	return jwt.sign(payload, apiSecret, opts);
}

export function JWTServerToken(apiSecret, jwtOptions = {}) {
	const payload = {
		server: true,
	};

	const opts = Object.assign({ algorithm: 'HS256', noTimestamp: true }, jwtOptions);
	return jwt.sign(payload, apiSecret, opts);
}

function decodeBase64(s) {
	const e = {},
		w = String.fromCharCode,
		L = s.length;
	let i,
		b = 0,
		c,
		x,
		l = 0,
		a,
		r = '';
	const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	for (i = 0; i < 64; i++) {
		e[A.charAt(i)] = i;
	}
	for (x = 0; x < L; x++) {
		c = e[s.charAt(x)];
		b = (b << 6) + c;
		l += 6;
		while (l >= 8) {
			((a = (b >>> (l -= 8)) & 0xff) || x < L - 2) && (r += w(a));
		}
	}
	return r;
}

/**
 * @return {string}
 */
export function UserFromToken(token) {
	const fragments = token.split('.');
	if (fragments.length !== 3) {
		return '';
	}
	const b64Payload = fragments[1];
	const payload = decodeBase64(b64Payload);
	const data = JSON.parse(payload);
	return data.user_id;
}

function encodeBase64(s) {
	if (typeof window !== 'undefined' && window.btoa) {
		return window.btoa(s);
	} else {
		return Buffer.from(s.toString(), 'binary').toString('base64');
	}
}

/**
 *
 * @param userId {string} the id of the user
 * @return {string}
 */
export function DevToken(userId) {
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
export function CheckSignature(body, secret, signature) {
	const key = Buffer.from(secret, 'ascii');
	const hash = crypto
		.createHmac('sha256', key)
		.update(body)
		.digest('hex');
	return hash === signature;
}
