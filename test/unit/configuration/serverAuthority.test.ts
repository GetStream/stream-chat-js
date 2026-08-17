import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChannel } from '../test-utils/generateChannel';
import { getClientWithUser } from '../test-utils/getClient';
import { mockChannelQueryResponse } from '../test-utils/mockChannelQueryResponse';
import { mergeServerRestrictions } from '../../../src/configuration/serverAuthority';
import type { StreamChat } from '../../../src/client';

/**
 * The invariant: **client configuration can only narrow what the server grants, never widen it.**
 *
 * It used to hold only at construction. `deriveConfig` applied the restrictions, but every
 * *later* route — a declarative slice registered once the composer exists, or a setup function — landed in
 * `updateConfig`, which merged without re-asserting them. So a running app could widen past the server and
 * end up offering a feature the API rejects. Each route is pinned separately below, because they reach the
 * config through different code and only one of them was ever covered.
 */
describe('the server has the last word, on every route', () => {
  let client: StreamChat;
  let channelResponse: ReturnType<typeof generateChannel>['channel'];

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
    channelResponse = generateChannel({
      channel: { config: { shared_locations: false } },
    }).channel;
    client._addChannelConfig(channelResponse);
  });

  const openRegisteredComposer = () => {
    const composer = client.channel('messaging', channelResponse.id).messageComposer;
    // The composer only wires its configuration once subscriptions are registered — before that, the
    // constructor's derivation is the only thing that has run.
    composer.registerSubscriptions();
    return composer;
  };

  it('keeps a server-disabled feature off at construction', () => {
    expect(openRegisteredComposer().config.location.enabled).toBe(false);
  });

  it('keeps it off when declarative configuration arrives afterwards', () => {
    const composer = openRegisteredComposer();

    client.config.set({ messageComposer: { location: { enabled: true } } });

    expect(composer.config.location.enabled).toBe(false);
  });

  it('keeps it off when a setup function tries to enable it', () => {
    const composer = openRegisteredComposer();

    client.config.setSetupFunction('messageComposer', ({ composer: c }) => {
      c.updateConfig({ location: { enabled: true } });
    });

    expect(composer.config.location.enabled).toBe(false);
  });

  it('keeps it off for a direct imperative call', () => {
    const composer = openRegisteredComposer();

    composer.updateConfig({ location: { enabled: true } });

    expect(composer.config.location.enabled).toBe(false);
  });

  it('does not invent restrictions the server has not stated', () => {
    // No `shared_locations` in the channel config at all — the client's own value must stand.
    const other = generateChannel({ channel: { config: {} } }).channel;
    client._addChannelConfig(other);
    const composer = client.channel('messaging', other.id).messageComposer;
    composer.registerSubscriptions();

    composer.updateConfig({ location: { enabled: true } });

    expect(composer.config.location.enabled).toBe(true);
  });

  it('leaves unrelated fields alone while narrowing', () => {
    const composer = openRegisteredComposer();

    composer.updateConfig({
      location: { enabled: true },
      text: { publishTypingEvents: false },
    });

    expect(composer.config.location.enabled).toBe(false);
    expect(composer.config.text.publishTypingEvents).toBe(false);
  });
});

/**
 * The same invariant at the level of the rule itself.
 *
 * The two-rule merge was extracted from `MessageComposer` (**DEC-37**) so the policy has one home and a
 * name, findable by whoever writes the next entity with server-gated configuration. The composer tests
 * above prove it holds for the one entity using it today; these prove the rule in isolation, including the
 * cases no current entity exercises — a composer's restrictions carry a single boolean, so nothing else
 * would notice if the scalar or nesting behaviour changed.
 */
describe('mergeServerRestrictions', () => {
  it('lets the server turn a feature off', () => {
    expect(
      mergeServerRestrictions(
        { location: { enabled: true } },
        { location: { enabled: false } },
      ),
    ).toEqual({ location: { enabled: false } });
  });

  it('keeps a client-disabled feature off even when the server allows it', () => {
    // Rule 1. Asking for less than you are granted is always legitimate, so `enabled: false` on the
    // requested side is not something the server gets to overturn.
    expect(
      mergeServerRestrictions(
        { location: { enabled: false } },
        { location: { enabled: true } },
      ),
    ).toEqual({ location: { enabled: false } });
  });

  it('applies rule 1 to every boolean, not only to `enabled`', () => {
    // Rule 1 used to be keyed on `key === 'enabled'`, which was correct only because `location.enabled` was
    // the sole boolean restriction. Any other gate — `text.publishTypingEvents` for `typing_events`, say —
    // would have fallen through to rule 2, and a client's deliberate opt-out would have been overwritten by
    // a permissive server. That is the widening DV-16 was about, arriving one field at a time.
    expect(
      mergeServerRestrictions(
        { trackUploadProgress: false },
        { trackUploadProgress: true },
      ),
    ).toEqual({ trackUploadProgress: false });
  });

  it('still lets the server turn a boolean off that the client asked to have on', () => {
    // The other direction of rule 1, and the half that makes it a restriction rather than a client veto.
    expect(
      mergeServerRestrictions(
        { location: { enabled: true } },
        { location: { enabled: false } },
      ),
    ).toEqual({ location: { enabled: false } });
  });

  it('lands a server subtree where the request has nothing', () => {
    // `null` is not an interior, so the leaf rules would answer with the absent request and drop the
    // server's subtree. It has to be descended into instead.
    expect(
      mergeServerRestrictions(
        { location: null } as never,
        {
          location: { enabled: false },
        } as never,
      ),
    ).toEqual({ location: { enabled: false } });
  });

  it('lets the server replace non-boolean scalars', () => {
    expect(
      mergeServerRestrictions(
        { maxLengthOnSend: 5000, name: 'client' },
        { maxLengthOnSend: 120, name: 'server' },
      ),
    ).toEqual({ maxLengthOnSend: 120, name: 'server' });
  });

  it('leaves a field the restrictions do not mention alone', () => {
    // The restrictions are a *partial* configuration. Treating an absent field as a server "no" would turn
    // a silent server into a total lockdown.
    expect(
      mergeServerRestrictions(
        { location: { enabled: true, minShareDurationMs: 60_000 } },
        { location: { enabled: true } },
      ),
    ).toEqual({ location: { enabled: true, minShareDurationMs: 60_000 } });
  });

  it('treats an undefined restriction as "the server did not say"', () => {
    // What `channel.getConfig()?.shared_locations` returns before the channel config is known. Reading it
    // as `false` would disable a feature the server never objected to.
    //
    // Note where this guarantee comes from: `mergeWith` already keeps the target when the source value is
    // `undefined`, with no customizer involved. Pinned here anyway, because the behaviour matters to
    // callers whatever produces it — but it is *not* evidence that the scalar check below works, which is
    // what the next test is for.
    expect(
      mergeServerRestrictions(
        { location: { enabled: true } },
        { location: { enabled: undefined } },
      ),
    ).toEqual({ location: { enabled: true } });
  });

  it('does not let a non-scalar restriction replace a scalar value', () => {
    // The actual job of the "is it a scalar?" check in rule 2, and the only case that distinguishes it from
    // no check at all. A restrictions object is typed `DeepPartial<TConfig>`, so a structure where a scalar
    // belongs is already a type error — but the check is what stops it becoming a *silent* one at runtime,
    // substituting a container for the flag a caller asked about.
    expect(
      mergeServerRestrictions({ location: { enabled: true } }, {
        location: { enabled: ['nonsense'] },
      } as never),
    ).toEqual({ location: { enabled: true } });
  });

  it('decides leaf by leaf rather than replacing whole objects', () => {
    // Objects are handed back to the deep merge. If they were not, a restriction naming one leaf would
    // wipe out its siblings.
    expect(
      mergeServerRestrictions(
        {
          location: { enabled: true, minShareDurationMs: 60_000 },
          text: { enabled: true },
        },
        { location: { enabled: false } },
      ),
    ).toEqual({
      location: { enabled: false, minShareDurationMs: 60_000 },
      text: { enabled: true },
    });
  });
});

/**
 * The same invariant read in the other direction: **a client may always ask for less than the server
 * grants, and the server changing its mind must still land.**
 *
 * Both halves are pinned here because they used to be mutually exclusive (**DV-18**). Restrictions were
 * applied to the previously *published* configuration, where a `false` the server wrote is
 * indistinguishable from a `false` the client asked for — so `Channel.query` either recorded the server's
 * permission as a client request (losing an integrator's opt-out) or made the server's `false` permanent
 * (losing a later permissive answer). A fix for one broke the other, and each is a single test.
 *
 * They coexist now because restrictions are re-applied to the *requested* configuration rather than
 * accumulated into the result, which makes the operation idempotent — see `MessageComposer.requestedConfig`.
 */
describe('narrowing and recovery, together', () => {
  const queryWith = async (
    client: StreamChat,
    sharedLocations: boolean,
    channelId?: string,
  ) => {
    const generated = generateChannel({
      channel: {
        config: { shared_locations: sharedLocations },
        ...(channelId ? { id: channelId } : {}),
      },
    });
    const channel = client.channel('messaging', channelId ?? generated.channel.id);

    vi.spyOn(client.api, 'sendRequest').mockResolvedValue({
      body: {
        ...mockChannelQueryResponse,
        channel: {
          ...mockChannelQueryResponse.channel,
          ...generated.channel,
          config: {
            ...mockChannelQueryResponse.channel.config,
            shared_locations: sharedLocations,
          },
        },
      },
      metadata: {},
    } as never);

    await channel.query();
    return channel;
  };

  it('keeps a declarative opt-out through a query that reports the feature as allowed', async () => {
    const client = getClientWithUser({ id: 'declarative-optout' });
    client.config.set({ messageComposer: { location: { enabled: false } } });

    // Deliberately a composer with **no** registered subscriptions: that is the case `Channel.query` exists
    // to cover, and the one whose fix regressed the other direction.
    const channel = await queryWith(client, true);

    expect(channel.messageComposer.config.location.enabled).toBe(false);
  });

  it('keeps an imperative opt-out through the same query', async () => {
    const client = getClientWithUser({ id: 'imperative-optout' });
    const channel = client.channel('messaging', 'imperative-channel');
    // An imperative request is as much a request as a declarative one, and used to be the more fragile of
    // the two: it lived only in the published configuration, so anything that re-resolved discarded it.
    channel.messageComposer.updateConfig({ location: { enabled: false } });

    await queryWith(client, true, 'imperative-channel');

    expect(channel.messageComposer.config.location.enabled).toBe(false);
  });

  it('lets a server that stops restricting the feature restore what was asked for', async () => {
    const client = getClientWithUser({ id: 'recovery' });
    const channel = client.channel('messaging', 'recovery-channel');

    vi.spyOn(client.api, 'sendRequest')
      .mockResolvedValueOnce({
        body: {
          ...mockChannelQueryResponse,
          channel: {
            ...mockChannelQueryResponse.channel,
            id: 'recovery-channel',
            config: {
              ...mockChannelQueryResponse.channel.config,
              shared_locations: false,
            },
          },
        },
        metadata: {},
      } as never)
      .mockResolvedValueOnce({
        body: {
          ...mockChannelQueryResponse,
          channel: {
            ...mockChannelQueryResponse.channel,
            id: 'recovery-channel',
            config: {
              ...mockChannelQueryResponse.channel.config,
              shared_locations: true,
            },
          },
        },
        metadata: {},
      } as never);

    await channel.query();
    expect(channel.messageComposer.config.location.enabled).toBe(false);

    // Nothing on the client ever asked for `false`, so the default request stands once the server allows it.
    await channel.query();
    expect(channel.messageComposer.config.location.enabled).toBe(true);
  });

  it('still lets the server turn the feature off', async () => {
    const client = getClientWithUser({ id: 'narrowing-server' });
    const channel = await queryWith(client, false);

    expect(channel.messageComposer.config.location.enabled).toBe(false);
  });
});

/**
 * The third rule: a numeric ceiling narrows, it does not replace.
 *
 * Kept apart from {@link ServerRestrictions} deliberately (**FU-34**). Routing `max_message_length` through
 * the restriction rules would have *widened* a composer that asked for something stricter — rule 2 replaces
 * the requested scalar with the server's, so a deliberate limit of 200 against a server maximum of 5000
 * would have become 5000. Putting a ceiling in the wrong bucket is a silent bug, not a type error, so both
 * directions are pinned.
 */
describe('mergeServerRestrictions — upper bounds', () => {
  it('lowers a request that exceeds the ceiling', () => {
    expect(
      mergeServerRestrictions({ maxLengthOnSend: 10_000 }, {}, { maxLengthOnSend: 5000 }),
    ).toEqual({ maxLengthOnSend: 5000 });
  });

  it('keeps a request that is already stricter', () => {
    // The case the restriction rules would have got wrong.
    expect(
      mergeServerRestrictions({ maxLengthOnSend: 200 }, {}, { maxLengthOnSend: 5000 }),
    ).toEqual({ maxLengthOnSend: 200 });
  });

  it('applies in full when nothing was requested', () => {
    // The default, and the reason to read the server maximum at all: "no limit" means the server's limit.
    //
    // As with the scalar check above, note what does the work: for `undefined` the deep merge already takes
    // the source value, so this passes with or without the explicit branch. The next test is the one that
    // covers the branch.
    expect(
      mergeServerRestrictions(
        { maxLengthOnSend: undefined } as { maxLengthOnSend?: number },
        {},
        { maxLengthOnSend: 5000 },
      ),
    ).toEqual({ maxLengthOnSend: 5000 });
  });

  it('prefers the ceiling over a requested value that is not a number at all', () => {
    // Only reachable from JavaScript, or through a cast — but the choice matters: keeping the nonsense would
    // drop the ceiling silently, leaving the composer effectively unlimited for the field it was meant to cap.
    expect(
      mergeServerRestrictions({ maxLengthOnSend: 'lots' } as never, {}, {
        maxLengthOnSend: 5000,
      } as never),
    ).toEqual({ maxLengthOnSend: 5000 });
  });

  it('leaves the request alone when the server states no ceiling', () => {
    expect(
      mergeServerRestrictions(
        { maxLengthOnSend: 200 },
        {},
        { maxLengthOnSend: undefined },
      ),
    ).toEqual({ maxLengthOnSend: 200 });
  });

  it('narrows leaf by leaf, without disturbing siblings', () => {
    expect(
      mergeServerRestrictions(
        { text: { enabled: true, maxLengthOnSend: 10_000 } },
        {},
        { text: { maxLengthOnSend: 5000 } },
      ),
    ).toEqual({ text: { enabled: true, maxLengthOnSend: 5000 } });
  });

  it('applies both rule sets together, each to its own field', () => {
    expect(
      mergeServerRestrictions(
        { location: { enabled: true }, text: { maxLengthOnSend: 10_000 } },
        { location: { enabled: false } },
        { text: { maxLengthOnSend: 5000 } },
      ),
    ).toEqual({ location: { enabled: false }, text: { maxLengthOnSend: 5000 } });
  });
});

/**
 * The same rule reaching the composer, which is what **FU-34** was actually about: `max_message_length` was
 * a real server field that nothing in `src/` read, so a composer with no limit of its own accepted text the
 * send endpoint would reject.
 */
describe("the channel type's max_message_length caps the composer", () => {
  const composerOn = (client: StreamChat, channelId: string) =>
    client.channel('messaging', channelId).messageComposer;

  it('supplies the limit when the composer asked for none', () => {
    const client = getClientWithUser({ id: 'capped' });
    const response = generateChannel({
      channel: { config: { max_message_length: 400 } },
    }).channel;
    client._addChannelConfig(response);

    expect(composerOn(client, response.id).config.text.maxLengthOnSend).toBe(400);
    expect(composerOn(client, response.id).config.text.maxLengthOnEdit).toBe(400);
  });

  it('keeps a stricter limit the integrator asked for', () => {
    const client = getClientWithUser({ id: 'stricter' });
    client.config.set({ messageComposer: { text: { maxLengthOnSend: 100 } } });
    const response = generateChannel({
      channel: { config: { max_message_length: 400 } },
    }).channel;
    client._addChannelConfig(response);

    expect(composerOn(client, response.id).config.text.maxLengthOnSend).toBe(100);
  });

  it('lowers a limit the integrator set above the server maximum', () => {
    const client = getClientWithUser({ id: 'looser' });
    client.config.set({ messageComposer: { text: { maxLengthOnSend: 9000 } } });
    const response = generateChannel({
      channel: { config: { max_message_length: 400 } },
    }).channel;
    client._addChannelConfig(response);

    expect(composerOn(client, response.id).config.text.maxLengthOnSend).toBe(400);
  });

  it('leaves the composer unlimited when the channel type states no maximum', () => {
    const client = getClientWithUser({ id: 'uncapped' });
    const response = generateChannel().channel;
    delete (response.config as { max_message_length?: number }).max_message_length;
    client._addChannelConfig(response);

    expect(composerOn(client, response.id).config.text.maxLengthOnSend).toBeUndefined();
  });
});

/**
 * `ChannelResponse.config` is optional — the `notification.message_new` payload is one route that can omit
 * it — and `_addChannelConfig` stored whatever it was handed. Keyed by cid that voided one channel's
 * config; keyed by **type** (DEC-26) it voids every channel of the type, and since the composer reads
 * `getConfig()` for `shared_locations` and `max_message_length`, the result is a restriction silently
 * lifted rather than a cache miss.
 */
describe('an absent server config cannot un-learn a known one', () => {
  it('ignores a response with no config instead of storing undefined', () => {
    const client = getClientWithUser({ id: 'unlearn' });
    const response = generateChannel({
      channel: { config: { max_message_length: 400, shared_locations: false } },
    }).channel;
    client._addChannelConfig(response);

    client._addChannelConfig({ type: response.type, config: undefined });

    expect(client.channelConfigsByType[response.type]).toEqual(response.config);
  });

  it('keeps the server restriction in force on a live composer', () => {
    const client = getClientWithUser({ id: 'unlearn-composer' });
    const response = generateChannel({
      channel: { config: { max_message_length: 400, shared_locations: false } },
    }).channel;
    client._addChannelConfig(response);
    const composer = client.channel('messaging', response.id).messageComposer;
    composer.registerSubscriptions();
    composer.updateConfig({ location: { enabled: true } });
    // the probe can see the bug: the restriction is in force before the empty response arrives
    expect(composer.config.location.enabled).toBe(false);

    client._addChannelConfig({ type: response.type, config: undefined });

    expect(composer.config.location.enabled).toBe(false);
    expect(composer.config.text.maxLengthOnSend).toBe(400);
  });
});
