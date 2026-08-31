/**
 * Unit conversions between the API's timestamps and JavaScript's.
 *
 * **The invariant this module exists to hold:** a timestamp is a unix-**nanosecond** `number` —
 * that is what the API puts on the wire and what every server-sent date field on a generated
 * response or event type carries. A duration, interval or delay stays in **milliseconds**, because
 * that is what `setTimeout` and every "time left" value the SDK exposes speak.
 *
 * Two consequences make the helpers below mandatory rather than convenient:
 *
 * - `new Date(ns)` is **out of range**. `Date` tops out around 8.64e15 ms while a current
 *   nanosecond timestamp is ~1.79e18, so the constructor yields `Invalid Date` and
 *   `.toISOString()` on it throws `RangeError`. Neither is a type error, so nothing warns you.
 * - Date libraries read a bare number as milliseconds. `dayjs(ns)` renders a date roughly 50,000
 *   years out, silently.
 *
 * Outgoing **request** date fields are unaffected: they are still typed `Date`, because
 * `JSON.stringify` emits RFC3339 for a `Date` and that is the format the request spec declares.
 * Use {@link nsToDate} when handing a server-sent timestamp back to the API.
 *
 * Precision note: nanosecond epoch values exceed `Number.MAX_SAFE_INTEGER` (~9.01e15), so they are
 * quantised to roughly 256 ns steps. Ordering is unaffected; exact equality against a value that
 * has round-tripped through JSON is not guaranteed.
 */

/** Nanoseconds per millisecond — the only magic number in this module. */
export const NS_PER_MS = 1e6;

/** A wire timestamp as epoch milliseconds, for arithmetic against `Date.now()` or a `Date`. */
export const nsToMs = (ns: number): number => Math.floor(ns / NS_PER_MS);

/** Epoch milliseconds as a wire timestamp. */
export const msToNs = (ms: number): number => ms * NS_PER_MS;

/**
 * The local clock as a wire-comparable timestamp, for optimistic writes into API-shaped objects.
 *
 * Millisecond resolution, so two writes within the same millisecond produce equal timestamps.
 * Callers that order by timestamp must tie-break on something else — `findIndexInSortedArray`
 * does so via `selectKey`, and `MessageReceiptsTracker` compares message ids.
 */
export const nowNs = (): number => msToNs(Date.now());

/** A wire timestamp as a `Date`, for request payloads and date libraries. */
export const nsToDate = (ns: number): Date => new Date(nsToMs(ns));

/** A `Date` as a wire timestamp. */
export const dateToNs = (date: Date): number => msToNs(date.getTime());

/**
 * A server-sent timestamp as a `Date`, or `undefined` when there is none.
 *
 * The guarded companion to {@link nsToDate}, for the boundary where a wire timestamp becomes
 * something a date library or a UI prop consumes. Use {@link nsToDate} when the value is known to
 * be present; use this when it comes straight off a response, an event or persisted state.
 *
 * The guard is the whole point, and it covers two cases that are silent rather than loud:
 *
 * - **Absent.** Many timestamps are optional in practice even where the generated type marks them
 *   required. `nsToDate(undefined as never)` yields an `Invalid Date`, and `.toISOString()` on one
 *   throws `RangeError: Invalid time value` — typically mid-render, in a component that had no
 *   reason to expect it.
 * - **Not finite.** A malformed payload or a hand-built fixture can produce `NaN`, which reaches
 *   the same `RangeError` by a different route.
 *
 * Returning `undefined` rather than throwing lets a caller fall back to whatever it already does
 * for a missing timestamp, which is usually to render nothing.
 */
export const convertTimestampToDate = (timestamp?: number | null): Date | undefined => {
  if (timestamp == null || !Number.isFinite(timestamp)) return undefined;
  return nsToDate(timestamp);
};
