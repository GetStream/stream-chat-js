import { fromByteArray } from 'base64-js';

function isString<T>(arrayOrString: string | T[]): arrayOrString is string {
  return typeof (arrayOrString as string) === 'string';
}

type MapGenericCallback<T, U> = (value: T, index: number, array: T[]) => U;
type MapStringCallback<U> = (value: string, index: number, string: string) => U;

function isMapStringCallback<T, U>(
  arrayOrString: string | T[],
  callback: MapGenericCallback<T, U> | MapStringCallback<U>,
): callback is MapStringCallback<U> {
  return !!callback && isString(arrayOrString);
}

// source - https://github.com/beatgammit/base64-js/blob/master/test/convert.js#L72
function map<T, U>(array: T[], callback: MapGenericCallback<T, U>): U[];
function map<U>(string: string, callback: MapStringCallback<U>): U[];
function map<T, U>(
  arrayOrString: string | T[],
  callback: MapGenericCallback<T, U> | MapStringCallback<U>,
): U[] {
  const res = [];

  if (isString(arrayOrString) && isMapStringCallback(arrayOrString, callback)) {
    for (let k = 0, len = arrayOrString.length; k < len; k++) {
      if (arrayOrString.charAt(k)) {
        const kValue = arrayOrString.charAt(k);
        const mappedValue = callback(kValue, k, arrayOrString);
        res[k] = mappedValue;
      }
    }
  } else if (!isString(arrayOrString) && !isMapStringCallback(arrayOrString, callback)) {
    for (let k = 0, len = arrayOrString.length; k < len; k++) {
      if (k in arrayOrString) {
        const kValue = arrayOrString[k];
        const mappedValue = callback(kValue, k, arrayOrString);
        res[k] = mappedValue;
      }
    }
  }

  return res;
}

export const encodeBase64 = (data: string): string =>
  fromByteArray(new Uint8Array(map(data, (char) => char.charCodeAt(0))));

// base-64 decoder throws exception if encoded string is not padded by '=' to make string length
// in multiples of 4. So gonna use our own method for this purpose to keep backwards compatibility
// https://github.com/beatgammit/base64-js/blob/master/index.js#L26
export const decodeBase64 = (s: string): string => {
  const e = {} as { [key: string]: number },
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
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      ((a = (b >>> (l -= 8)) & 0xff) || x < L - 2) && (r += w(a));
    }
  }
  return r;
};
