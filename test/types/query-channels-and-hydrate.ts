/**
 * Compile-time contract for the `queryChannelsAndHydrate` overloads. Type-checked, never executed.
 *
 * The full-response overload must only match when `withResponse: true` is passed explicitly: the
 * runtime returns `Channel[]` otherwise, so a call without `stateOptions` must not type as the
 * response (it did in 10.0.0-rc.22, where that overload's `stateOptions` was optional).
 */
import type { Channel, QueryChannelsResponseWithChannels, StreamChat } from 'stream-chat';

declare const client: StreamChat;

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>(value: T) => value;

type NoArgs = Awaited<ReturnType<typeof queryNoArgs>>;
const queryNoArgs = () => client.queryChannelsAndHydrate();
assertType<Equals<NoArgs, Channel[]>>(true);

type RequestOnly = Awaited<ReturnType<typeof queryRequestOnly>>;
const queryRequestOnly = () =>
  client.queryChannelsAndHydrate({ filter_conditions: { type: 'messaging' } });
assertType<Equals<RequestOnly, Channel[]>>(true);

type WithoutResponse = Awaited<ReturnType<typeof queryWithoutResponse>>;
const queryWithoutResponse = () =>
  client.queryChannelsAndHydrate({ filter_conditions: {} }, { withResponse: false });
assertType<Equals<WithoutResponse, Channel[]>>(true);

type WithResponse = Awaited<ReturnType<typeof queryWithResponse>>;
const queryWithResponse = () =>
  client.queryChannelsAndHydrate({ filter_conditions: {} }, { withResponse: true });
assertType<Equals<WithResponse, QueryChannelsResponseWithChannels>>(true);

type WithResponseNoRequest = Awaited<ReturnType<typeof queryWithResponseNoRequest>>;
const queryWithResponseNoRequest = () =>
  client.queryChannelsAndHydrate(undefined, { withResponse: true });
assertType<Equals<WithResponseNoRequest, QueryChannelsResponseWithChannels>>(true);

// @ts-expect-error -- the full response is only returned when `withResponse: true` is passed
export const notTheResponse: QueryChannelsResponseWithChannels = await queryRequestOnly();
