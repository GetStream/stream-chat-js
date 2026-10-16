/**
 * Compile-time contract for custom event types declared through `CustomEventTypes` augmentation.
 * Type-checked, never executed.
 *
 * The augmentation is global to the program, so it also proves that `src/` still compiles once an
 * app declares a custom event type (a bare `keyof CustomEventTypes` in the `Event` union used to
 * break every `event.<field>` read in the SDK).
 */
import type { Event, EventPayload, StreamChat } from 'stream-chat';

declare module 'stream-chat' {
  interface CustomEventTypes {
    friendship_request: true;
  }
  interface CustomEventData {
    text?: string;
  }
}

declare const client: StreamChat;
declare const event: Event;

export const eventType: string = event.type;

client.on('friendship_request', (e) => {
  const text: string | undefined = e.custom.text;
  return text;
});

export const payload: EventPayload<'friendship_request'>['custom']['text'] = 'hi';

// @ts-expect-error -- an undeclared custom field is rejected
export const unknownField = ({} as EventPayload<'friendship_request'>).custom.unknown;
