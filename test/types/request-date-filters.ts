/**
 * Compile-time contract for the `created_at_*` filters of the ban and member queries. Type-checked,
 * never executed.
 *
 * They are request fields, sent as JSON, so they take a `Date` (serialized as RFC3339) or an RFC3339
 * string like every other request date. The API rejects a nanosecond number there
 * ("Time.UnmarshalJSON: input is not a JSON string"), so a `TimestampNS` must not compile. Every
 * `@ts-expect-error` is an assertion: when the line below it stops being an error, tsc fails on the
 * unused directive.
 */
import type { Channel, StreamChat } from 'stream-chat';
import { msToNs } from 'stream-chat';

declare const client: StreamChat;
declare const channel: Channel;

const since = new Date('2025-01-01T00:00:00.000Z');

client.queryBannedUsers({
  payload: { filter_conditions: {}, created_at_after: since },
});
client.queryBannedUsers({
  payload: { filter_conditions: {}, created_at_before_or_equal: '2025-01-01T00:00:00Z' },
});
client.queryFutureChannelBans({
  payload: { created_at_after_or_equal: since, created_at_before: since },
});
channel.queryMembers({ payload: { created_at_after: since } });
channel.queryMembers({ payload: { created_at_before: '2025-01-01T00:00:00Z' } });

client.queryBannedUsers({
  // @ts-expect-error -- a nanosecond timestamp is rejected by the API
  payload: { filter_conditions: {}, created_at_after: msToNs(Date.now()) },
});
// @ts-expect-error -- a nanosecond timestamp is rejected by the API
channel.queryMembers({ payload: { created_at_before: msToNs(Date.now()) } });
