/**
 * Compile-time contract for `on()` / `off()` on the client and on a channel. Type-checked, never
 * executed.
 *
 * Every `@ts-expect-error` is an assertion: when the line below it stops being an error, tsc fails on
 * the unused directive. `friendship_request` is the custom event declared in `custom-events.ts`; the
 * `CustomEventTypes` augmentation there is global to this program.
 */
import type { Channel, Event, EventHandler, EventPayload, StreamChat } from 'stream-chat';

declare const client: StreamChat;
declare const channel: Channel;

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>(value: T) => value;

// --- 'all' and the callback-only form receive every event ----------------------------------------

client.on('all', (event) => assertType<Equals<typeof event, Event>>(true));
channel.on('all', (event) => assertType<Equals<typeof event, Event>>(true));
client.on((event) => assertType<Equals<typeof event, Event>>(true));
channel.on((event) => assertType<Equals<typeof event, Event>>(true));
assertType<Equals<Parameters<EventHandler>[0], Event>>(true);

// --- A named type narrows to its members ---------------------------------------------------------

client.on('message.new', (event) =>
  assertType<Equals<typeof event, EventPayload<'message.new'>>>(true),
);
channel.on('typing.start', (event) =>
  assertType<Equals<typeof event, EventPayload<'typing.start'>>>(true),
);
client.on('connection.recovered', (event) =>
  assertType<Equals<typeof event, EventPayload<'connection.recovered'>>>(true),
);
client.on('friendship_request', (event) => event.custom.text);

// --- Undeclared names are rejected ---------------------------------------------------------------

// @ts-expect-error -- removed in v10, never dispatched
client.on('connection.changed', () => undefined);
// @ts-expect-error -- a typo is not an event type
channel.on('message.nwe', () => undefined);
// @ts-expect-error -- a custom event has to be declared through `CustomEventTypes`
client.on('undeclared_custom', () => undefined);

// --- off() takes the handler that was registered -------------------------------------------------

const onMessageNew: EventHandler<'message.new'> = (event) => event.message;
client.on('message.new', onMessageNew);
client.off('message.new', onMessageNew);
channel.on('message.new', onMessageNew);
channel.off('message.new', onMessageNew);
// @ts-expect-error -- registered for a different type
client.off('message.updated', onMessageNew);
// @ts-expect-error -- removed in v10, never dispatched
client.off('connection.changed', () => undefined);
