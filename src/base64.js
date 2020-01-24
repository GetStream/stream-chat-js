const base64 = require('base64-js');

// source - https://github.com/beatgammit/base64-js/blob/master/test/convert.js#L72
const map = (arr, callback) => {
	const res = [];
	let kValue, mappedValue;

	for (let k = 0, len = arr.length; k < len; k++) {
		if (typeof arr === 'string' && !!arr.charAt(k)) {
			kValue = arr.charAt(k);
			mappedValue = callback(kValue, k, arr);
			res[k] = mappedValue;
		} else if (typeof arr !== 'string' && k in arr) {
			kValue = arr[k];
			mappedValue = callback(kValue, k, arr);
			res[k] = mappedValue;
		}
	}
	return res;
};

export function encodeBase64(data) {
	return base64.fromByteArray(
		map(data, function(char) {
			return char.charCodeAt(0);
		}),
	);
}

// base-64 decoder throws exception if encoded string is not padded by '=' to make string length
// in multiples of 4. So gonna use our own method for this purpose to keep backwards compatibility
// https://github.com/beatgammit/base64-js/blob/master/index.js#L26
export function decodeBase64(s) {
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
