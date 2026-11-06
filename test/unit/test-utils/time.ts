import { dateToNs, msToNs, nowNs } from '../../../src/utils/time';

/**
 * Normalizes whatever a test hands a generator into the unix-**nanosecond** number the API puts on
 * the wire.
 *
 * Fixtures have to model the wire — a generator that emits `Date` objects cannot catch the bugs this
 * unit exists to prevent — but a test is far more readable written against a date literal. So the
 * generators accept `Date`, an ISO string, or a raw wire number, and convert here.
 *
 * A bare `number` is taken to be nanoseconds already, matching the SDK's unit everywhere else. Pass
 * a `Date` or an ISO string if you mean wall-clock time.
 */
export const convertDateToTimestamp = (value?: Date | number | string): number => {
  if (value === undefined) return nowNs();
  if (value instanceof Date) return dateToNs(value);
  if (typeof value === 'number') return value;
  return msToNs(Date.parse(value));
};
