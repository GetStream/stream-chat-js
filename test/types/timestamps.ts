/**
 * Compile-time contract for server-sent timestamps (`TimestampNS`). Type-checked, never executed.
 *
 * Every `@ts-expect-error` is an assertion: when the line below it stops being an error, tsc fails on
 * the unused directive. The plain lines assert the opposite — that the sanctioned paths still compile.
 *
 * `stream-chat` is imported by its own package name, so the same file is checked twice:
 * - `tsconfig.types-test.json` maps it to `src/` (`yarn types`). The `DateConstructor` guard only
 *   enters that program through `src/index.ts`'s re-export, so this also pins that line.
 * - `tsconfig.types-test.dist.json` resolves it through `package.json` `exports`, i.e. the built
 *   `dist/types` a consumer installs (`yarn build`). That is what proves the guard actually ships.
 */
import type { MessageResponse, StreamChat, TimestampNS } from 'stream-chat';
import {
  asTimestampNS,
  convertTimestampToDate,
  dateToNs,
  msToNs,
  nowNs,
  nsToDate,
  nsToMs,
} from 'stream-chat';

declare const message: MessageResponse;
declare const client: StreamChat;
declare const untyped: any;

// --- The `new Date` guard ------------------------------------------------------------------------

// @ts-expect-error -- a nanosecond value is out of `Date`'s range
export const assignedToDate: Date = new Date(message.created_at);
// @ts-expect-error -- the error surfaces at the first use of the result
new Date(message.created_at).toISOString();

export const fromMilliseconds: Date = new Date(Date.now());
export const fromConverted: Date = new Date(nsToMs(message.created_at));
// `any` must fall through to the lib overload, or every `JSON.parse` path would break.
export const fromAny: Date = new Date(untyped);

// --- Helpers take and return the brand -----------------------------------------------------------

// @ts-expect-error -- epoch milliseconds are not a wire timestamp
nsToDate(Date.now());
// @ts-expect-error -- epoch milliseconds are not a wire timestamp
convertTimestampToDate(Date.now());

export const converted: Date = nsToDate(message.created_at);
export const guarded: Date | undefined = convertTimestampToDate(message.pinned_at);
// `nsToMs` also converts durations, which carry no brand.
export const durationMs: number = nsToMs(message.updated_at - message.created_at);

// --- Minting ---------------------------------------------------------------------------------------

// @ts-expect-error -- a plain number is not assignable to a timestamp field
export const unbranded: MessageResponse['created_at'] = Date.now();

export const minted: TimestampNS[] = [
  nowNs(),
  msToNs(Date.now()),
  dateToNs(new Date()),
  asTimestampNS(0),
];

// --- `pinMessage`: a `number` is a relative offset in seconds ----------------------------------------

// @ts-expect-error -- a server timestamp would be read as ~1.79e18 seconds from now
client.pinMessage(message.id, message.pin_expires);
// @ts-expect-error -- same for `pinnedAt`
client.pinMessage(message.id, null, message.pinned_at);

client.pinMessage(message.id);
client.pinMessage(message, null);
client.pinMessage(message.id, 60);
client.pinMessage(message.id, null, -60);
client.pinMessage(message.id, nsToDate(message.created_at), '2026-01-01T00:00:00Z');
client.pinMessage(message.id, untyped, untyped);
