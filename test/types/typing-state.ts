/**
 * Compile-time contract for `channel.state.typing`. Type-checked, never executed.
 *
 * Only `typing.start` events are stored there, so a typing indicator reads `user` (and `parent_id`)
 * off an entry without narrowing the `Event` union first.
 */
import type { Channel, ChannelStateData, EventPayload } from 'stream-chat';

declare const channel: Channel;

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>(value: T) => value;

type TypingStart = EventPayload<'typing.start'>;

assertType<Equals<typeof channel.state.typing, Record<string, TypingStart>>>(true);
assertType<Equals<ChannelStateData['typing'], Record<string, TypingStart>>>(true);

export const typingUserId = Object.values(channel.state.typing)[0].user?.id;
export const typingParentIds = Object.values(channel.state.typing).map(
  (event) => event.parent_id,
);
channel.state.subscribeWithSelector(
  ({ typing }) => ({ typing }),
  ({ typing }) => Object.values(typing).map((event) => event.user?.name),
);

declare const typingStop: EventPayload<'typing.stop'>;
// @ts-expect-error -- `typing.stop` removes the entry, it is never stored
channel.state.setTypingEvent('alice', typingStop);
