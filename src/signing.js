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

/**
 * Credit: https://github.com/mathiasbynens/base64
 *
 * `encode` is designed to be fully compatible with `btoa` as described in the
 * HTML Standard: http://whatwg.org/html/webappapis.html#dom-windowbase64-btoa
 *
 * @param {*} input
 *
 * @return {string}
 */
function encodeBase64(input) {
	input = String(input);
	const TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	if (/[^\0-\xFF]/.test(input)) {
		// Note: no need to special-case astral symbols here, as surrogates are
		// matched, and the input is supposed to only contain ASCII anyway.
		throw Error(
			'The string to be encoded contains characters outside of the ' +
				'Latin1 range.',
		);
	}
	const padding = input.length % 3;
	const outputArray = [];
	let position = -1;
	let a;
	let b;
	let c;
	let buffer;
	// Make sure any padding is handled outside of the loop.
	const length = input.length - padding;

	while (++position < length) {
		// Read three bytes, i.e. 24 bits.
		a = input.charCodeAt(position) << 16;
		b = input.charCodeAt(++position) << 8;
		c = input.charCodeAt(++position);
		buffer = a + b + c;
		// Turn the 24 bits into four chunks of 6 bits each, and append the
		// matching character for each of them to the output.
		outputArray.push(
			TABLE.charAt((buffer >> 18) & 0x3f) +
				TABLE.charAt((buffer >> 12) & 0x3f) +
				TABLE.charAt((buffer >> 6) & 0x3f) +
				TABLE.charAt(buffer & 0x3f),
		);
	}

	if (padding === 2) {
		a = input.charCodeAt(position) << 8;
		b = input.charCodeAt(++position);
		buffer = a + b;
		outputArray.push(
			TABLE.charAt(buffer >> 10) +
				TABLE.charAt((buffer >> 4) & 0x3f) +
				TABLE.charAt((buffer << 2) & 0x3f) +
				'=',
		);
	} else if (padding === 1) {
		buffer = input.charCodeAt(position);
		outputArray.push(
			TABLE.charAt(buffer >> 2) + TABLE.charAt((buffer << 4) & 0x3f) + '==',
		);
	}

	return outputArray.join('');
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
