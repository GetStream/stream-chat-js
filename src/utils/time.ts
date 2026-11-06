/**
 * Conversions between wire timestamps (`TimestampNS`, unix nanoseconds) and JavaScript's
 * milliseconds and `Date`. Durations, intervals and delays stay in milliseconds. See `TimestampNS`
 * for why a timestamp must not be handed to `Date` or a date library directly. To hand a server-sent
 * timestamp back to the API use {@link nsToDate}: filters such as the `created_at_*` ones of the
 * member and ban queries take a `Date`, never nanoseconds.
 */

import type { TimestampNS } from '../gen/models';

export const NS_PER_MS = 1e6;

/**
 * Brands a number that is already in nanoseconds (a DB row, persisted JSON, a fixture). It does not
 * convert: for milliseconds or a `Date` use {@link msToNs} or {@link dateToNs}.
 */
export const asTimestampNS = (ns: number): TimestampNS => ns as TimestampNS;

/** Nanoseconds as milliseconds. Takes a plain `number` so it also converts nanosecond durations. */
export const nsToMs = (ns: number): number => Math.floor(ns / NS_PER_MS);

/**
 * Converts milliseconds to a wire timestamp.
 *
 * @param ms - Unix milliseconds.
 * @returns The same instant in unix nanoseconds.
 */
export const msToNs = (ms: number): TimestampNS => asTimestampNS(ms * NS_PER_MS);

/**
 * The local clock as a wire timestamp. Millisecond resolution: writes within the same millisecond
 * get equal timestamps, so callers that order by timestamp need a tie-break.
 */
export const nowNs = (): TimestampNS => msToNs(Date.now());

/** A wire timestamp as a `Date`, at millisecond precision. */
export const nsToDate = (ns: TimestampNS): Date => new Date(nsToMs(ns));

/** A wire timestamp as an RFC3339 string keeping nanosecond precision, which `Date` cannot. */
export const nsToRfc3339 = (ns: TimestampNS): string => {
  const ms = nsToMs(ns);
  const subMs = String(ns - ms * NS_PER_MS).padStart(6, '0');
  return new Date(ms).toISOString().replace(/\.(\d{3})Z$/, `.$1${subMs}Z`);
};

/**
 * Converts a `Date` to a wire timestamp, at millisecond resolution.
 *
 * @param date - The date to convert.
 * @returns The same instant in unix nanoseconds.
 */
export const dateToNs = (date: Date): TimestampNS => msToNs(date.getTime());

/**
 * Like {@link nsToDate}, but `undefined` for an absent or non-finite timestamp, which would
 * otherwise yield an Invalid Date (its `.toISOString()` throws). Timestamps can be missing in
 * practice even where the generated type marks them required.
 */
export const convertTimestampToDate = (
  timestamp?: TimestampNS | null,
): Date | undefined => {
  if (timestamp == null || !Number.isFinite(timestamp)) return undefined;
  return nsToDate(timestamp);
};
