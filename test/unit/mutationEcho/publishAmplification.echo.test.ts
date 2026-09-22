import { describe, expect, it } from 'vitest';
import { formatMessage, Thread } from '../../../src';
import { generateChannel } from '../test-utils/generateChannel';
import { generateMsg } from '../test-utils/generateMessage';
import { getClientWithUser } from '../test-utils/getClient';
import { recordPublishes } from '../test-utils/publishAmplification';
import { convertDateToTimestamp } from '../test-utils/time';
import type { LocalMessage, MessageResponse } from '../../../src/types';

/**
 * **What the pairing ledger is worth, measured.**
 *
 * The sibling suite (`test/unit/publishAmplification.baseline.test.ts`) measures ONE inbound event.
 * This measures a **round trip** — optimistic write, HTTP response, WS echo — which is the only place
 * the ledger can show up, because the redundancy it removes is between the response and the event,
 * not inside either.
 *
 * Two rules the numbers here depend on:
 *
 * 1. **Every scenario runs twice over identical inputs**, once with `mutationEcho.enabled` and once
 *    without, and both numbers are asserted. A single number cannot distinguish "the ledger saved a
 *    publish" from "this path never published twice to begin with" — and during the original
 *    investigation exactly that produced two confidently wrong results.
 * 2. **The two phases are counted separately.** All of the saving is in the WS phase; folding them
 *    into one total would hide which half moved, and would let a regression in the HTTP phase pay for
 *    an improvement in the other.
 *
 * Environment: **unthrottled**, since Vitest disables state throttling
 * (`src/pagination/paginators/stateThrottling.ts`). These are the un-coalesced counts; a real client
 * rides a 500ms throttle on the message list and shows fewer. The two are never comparable.
 */
describe('mutation echo — publishes across a full request round trip', () => {
  const PARENT_ID = 'parent-1';
  const ME = 'me';

  const at = (day: number) =>
    convertDateToTimestamp(`2020-01-${String(day).padStart(2, '0')}T00:00:00.000Z`);

  /**
   * A channel whose main list, pinned list and — when asked — an open thread all hold the same
   * messages. `withThread` is a parameter rather than always-on because the two topologies answer
   * different questions: without it, what one collection saves; with it, whether the saving survives
   * the fan-out between three.
   */
  const linked = ({
    enabled,
    withThread = false,
  }: {
    enabled: boolean;
    withThread?: boolean;
  }) => {
    const client = getClientWithUser({ id: ME });
    client.mutationEcho.updateConfig({ enabled });

    const { channel: channelResponse } = generateChannel();
    const channel = client.channel(channelResponse.type, channelResponse.id);
    channel.initialized = true;
    (client as unknown as { activeChannels: Record<string, unknown> }).activeChannels[
      channel.cid
    ] = channel;

    const held: Record<string, unknown> = {
      cid: channel.cid,
      pinned: true,
      pinned_at: 1,
      user: { id: ME },
    };
    if (withThread) {
      held.parent_id = PARENT_ID;
      held.show_in_channel = true;
    }

    const page = ['seed1', 'seed2', 'seed3'].map((id, i) =>
      formatMessage(
        generateMsg({ ...held, created_at: at(i + 1), id }) as MessageResponse,
      ),
    );
    for (const paginator of [channel.messagePaginator, channel.pinnedMessagesPaginator]) {
      paginator.ingestPage({ isHead: true, isTail: true, page, setActive: true });
    }

    const labelled: Record<string, Parameters<typeof recordPublishes>[0][string]> = {
      main: channel.messagePaginator,
      pinned: channel.pinnedMessagesPaginator,
    };

    let thread: Thread | undefined;
    if (withThread) {
      thread = new Thread({
        channel,
        client,
        parentMessage: generateMsg({ cid: channel.cid, id: PARENT_ID }) as never,
      });
      thread.messagePaginator.ingestPage({
        isHead: true,
        isTail: true,
        page,
        setActive: true,
      });
      client.threads.state.next((current) => ({
        ...current,
        threads: [thread as Thread, ...current.threads],
      }));
      thread.registerSubscriptions();
      labelled.thread = thread.messagePaginator;
    }

    return { channel, client, held, recorder: recordPublishes(labelled), thread };
  };

  type Ctx = ReturnType<typeof linked>;
  type Phase = [label: string, run: () => Promise<void> | void];

  /** Runs each phase in order and reports the counts it alone produced. */
  const byPhase = async (ctx: Ctx, phases: Phase[]) => {
    const counts: Record<string, Record<string, number>> = {};
    ctx.recorder.reset();
    for (const [label, run] of phases) {
      await run();
      counts[label] = ctx.recorder.stateCounts();
      ctx.recorder.reset();
    }
    ctx.recorder.stop();
    return counts;
  };

  const both = async (
    scenario: (ctx: Ctx) => Phase[],
    { withThread = false }: { withThread?: boolean } = {},
  ) => {
    const run = async (enabled: boolean) => {
      const ctx = linked({ enabled, withThread });
      return byPhase(ctx, scenario(ctx));
    };
    return { off: await run(false), on: await run(true) };
  };

  const echo = (
    ctx: Ctx,
    type: string,
    message: MessageResponse,
    extra: Record<string, unknown> = {},
  ) =>
    ctx.client.dispatchEvent({
      cid: ctx.channel.cid,
      message,
      type,
      user: { id: ME },
      ...extra,
    } as never);

  /**
   * The message every "content only" scenario operates on: one already held by every collection under
   * measurement, so the WS echo changes no membership anywhere and is redundant end to end.
   */
  const heldMessage = (ctx: Ctx, overrides: Record<string, unknown>) =>
    generateMsg({
      ...ctx.held,
      created_at: at(1),
      id: 'seed1',
      ...overrides,
    }) as MessageResponse;

  describe('an echo that changes only content costs nothing', () => {
    it('edit — every collection holding the message', async () => {
      const counts = await both(
        (ctx) => {
          const edited = heldMessage(ctx, { text: 'edited', updated_at: at(9) });
          return [
            [
              'http',
              async () => {
                await ctx.channel.messageOperations.update(
                  { localMessage: formatMessage(edited) as LocalMessage },
                  async () => ({ message: edited }) as never,
                );
              },
            ],
            ['ws', () => echo(ctx, 'message.updated', edited)],
          ];
        },
        { withThread: true },
      );

      expect(counts.off.ws).toEqual({ main: 1, pinned: 1, thread: 1 });
      expect(counts.on.ws).toEqual({ main: 0, pinned: 0, thread: 0 });
      // The HTTP half is untouched — all of the saving is in the echo, which is the claim.
      expect(counts.on.http).toEqual(counts.off.http);
    });

    it('soft delete — every collection holding the message', async () => {
      const counts = await both(
        (ctx) => {
          const deleted = heldMessage(ctx, {
            deleted_at: at(9),
            type: 'deleted',
            updated_at: at(9),
          });
          return [
            [
              'http',
              async () => {
                await ctx.channel.messageOperations.delete(
                  { localMessage: formatMessage(deleted) as LocalMessage },
                  async () => ({ message: deleted }) as never,
                );
              },
            ],
            ['ws', () => echo(ctx, 'message.deleted', deleted)],
          ];
        },
        { withThread: true },
      );

      expect(counts.off.ws).toEqual({ main: 1, pinned: 1, thread: 1 });
      expect(counts.on.ws).toEqual({ main: 0, pinned: 0, thread: 0 });
      expect(counts.on.http).toEqual(counts.off.http);
    });

    it('reaction — every collection holding the message', async () => {
      const reaction = {
        created_at: at(9),
        custom: {},
        message_id: 'seed1',
        score: 1,
        type: 'love',
        updated_at: at(9),
        user: { id: ME },
        user_id: ME,
      };

      const counts = await both(
        (ctx) => {
          const withReaction = heldMessage(ctx, {
            latest_reactions: [reaction],
            own_reactions: [reaction],
            updated_at: at(1),
          });
          ctx.channel.sendReaction = (async () => ({
            message: withReaction,
            reaction,
          })) as never;

          return [
            [
              'http',
              async () => {
                await ctx.channel.addReactionWithLocalUpdate({
                  messageId: 'seed1',
                  reaction: { type: 'love' },
                });
              },
            ],
            ['ws', () => echo(ctx, 'reaction.new', withReaction, { reaction })],
          ];
        },
        { withThread: true },
      );

      // Reactions have no `applyServerCopy` equivalent — nothing else in the SDK declines a duplicate
      // reaction copy — so unlike the message path the ledger is the only thing removing this one.
      expect(counts.off.ws).toEqual({ main: 1, pinned: 1, thread: 1 });
      expect(counts.on.ws).toEqual({ main: 0, pinned: 0, thread: 0 });
      expect(counts.on.http).toEqual(counts.off.http);
    });

    it('send — a plain message, which the main list already holds when the echo lands', async () => {
      const counts = await both((ctx) => {
        const sent = generateMsg({
          cid: ctx.channel.cid,
          created_at: at(4),
          id: 'sent',
          pinned: false,
          updated_at: at(4),
          user: { id: ME },
        }) as MessageResponse;

        return [
          [
            'http',
            async () => {
              await ctx.channel.messageOperations.send(
                { localMessage: formatMessage(sent), message: { id: 'sent' } as never },
                async () => ({ message: sent }) as never,
              );
            },
          ],
          ['ws', () => echo(ctx, 'message.new', sent)],
        ];
      });

      expect(counts.off.ws).toEqual({ main: 1, pinned: 0 });
      expect(counts.on.ws).toEqual({ main: 0, pinned: 0 });
    });
  });

  describe('an echo that changes membership is never skipped', () => {
    /**
     * The other half of the gate, and the reason one client-global key is enough. A key says the
     * canonical copy already holds this version, which every collection sharing the store then shows
     * for free. It says nothing about what a collection HOLDS — the fan-out never adds or evicts — so
     * these three must keep costing exactly what they always did.
     */
    it('a message pinned on send still reaches the pinned list', async () => {
      const { channel, client } = linked({ enabled: true });
      const pinned = generateMsg({
        cid: channel.cid,
        created_at: at(6),
        id: 'pinned-on-send',
        pinned: true,
        pinned_at: 2,
        updated_at: at(6),
        user: { id: ME },
      }) as MessageResponse;

      await channel.messageOperations.send(
        {
          localMessage: formatMessage(pinned),
          message: { id: 'pinned-on-send' } as never,
        },
        async () => ({ message: pinned }) as never,
      );
      // The HTTP path writes the main list and the store; nothing it does can add an id to the pinned
      // list, so before the echo that list has not heard of this message.
      expect(
        (channel.pinnedMessagesPaginator.items ?? []).map((m) => m.id),
      ).not.toContain('pinned-on-send');

      client.dispatchEvent({
        cid: channel.cid,
        message: pinned,
        type: 'message.new',
        user: { id: ME },
      } as never);

      expect((channel.pinnedMessagesPaginator.items ?? []).map((m) => m.id)).toContain(
        'pinned-on-send',
      );
    });

    it('an unpin applied over HTTP is still evicted from the pinned list by the echo', async () => {
      const { channel, client } = linked({ enabled: true });
      const unpinned = generateMsg({
        cid: channel.cid,
        created_at: at(1),
        id: 'seed1',
        pinned: false,
        pinned_at: null,
        updated_at: at(9),
        user: { id: ME },
      }) as MessageResponse;

      await channel.messageOperations.update(
        { localMessage: formatMessage(unpinned) as LocalMessage },
        async () => ({ message: unpinned }) as never,
      );
      client.dispatchEvent({
        cid: channel.cid,
        message: unpinned,
        type: 'message.updated',
        user: { id: ME },
      } as never);

      // Asserted on the window rather than `getItem`: the item index keeps an id whose intervals
      // have dropped it, so `getItem` would still answer for a message no longer in the list.
      expect(
        (channel.pinnedMessagesPaginator.items ?? []).map((m) => m.id),
      ).not.toContain('seed1');
    });

    it("a thread reply sent from the thread still reaches the channel's own list", async () => {
      // The canary case: `Thread`'s `ingest` writes the reply paginator and the store, and the channel
      // list is reached ONLY by `message.new`. A gate that looked at content alone would lose it.
      const { channel, client, thread } = linked({ enabled: true, withThread: true });
      const reply = generateMsg({
        cid: channel.cid,
        created_at: at(7),
        id: 'reply',
        parent_id: PARENT_ID,
        show_in_channel: true,
        updated_at: at(7),
        user: { id: ME },
      }) as MessageResponse;

      await (thread as Thread).messageOperations.send(
        { localMessage: formatMessage(reply), message: { id: 'reply' } as never },
        async () => ({ message: reply }) as never,
      );
      expect((channel.messagePaginator.items ?? []).map((m) => m.id)).not.toContain(
        'reply',
      );

      client.dispatchEvent({
        cid: channel.cid,
        message: reply,
        type: 'message.new',
        user: { id: ME },
      } as never);

      expect((channel.messagePaginator.items ?? []).map((m) => m.id)).toContain('reply');
      expect(
        ((thread as Thread).messagePaginator.items ?? []).map((m) => m.id),
      ).toContain('reply');
    });
  });

  describe('what a full ledger must still let through', () => {
    it("another user's message.new applies normally", async () => {
      const ctx = linked({ enabled: true });
      const { channel, client, recorder } = ctx;

      // Arm the ledger with our own send first, so the assertion below is measured against a populated
      // ledger rather than an empty one.
      const mine = generateMsg({
        cid: channel.cid,
        created_at: at(4),
        id: 'mine',
        updated_at: at(4),
        user: { id: ME },
      }) as MessageResponse;
      await channel.messageOperations.send(
        { localMessage: formatMessage(mine), message: { id: 'mine' } as never },
        async () => ({ message: mine }) as never,
      );

      recorder.reset();
      const theirs = generateMsg({
        cid: channel.cid,
        created_at: at(5),
        id: 'theirs',
        updated_at: at(5),
        user: { id: 'someone-else' },
      }) as MessageResponse;
      client.dispatchEvent({
        cid: channel.cid,
        message: theirs,
        type: 'message.new',
        user: { id: 'someone-else' },
      } as never);

      expect(channel.messagePaginator.getItem('theirs')).toBeDefined();
      expect(recorder.stateCounts().main).toBe(1);
      recorder.stop();
    });

    it('a later edit of the same message still applies', async () => {
      const ctx = linked({ enabled: true });
      const first = heldMessage(ctx, { text: 'first', updated_at: at(8) });

      await ctx.channel.messageOperations.update(
        { localMessage: formatMessage(first) as LocalMessage },
        async () => ({ message: first }) as never,
      );
      echo(ctx, 'message.updated', first);

      // Same id, NEWER version — a different key, so the armed entry cannot swallow it. This is what
      // the version component buys, and the sharpest edge in the design this is modelled on.
      const second = heldMessage(ctx, { text: 'second', updated_at: at(9) });
      echo(ctx, 'message.updated', second);

      expect(ctx.channel.messagePaginator.getItem('seed1')?.text).toBe('second');
    });

    it('the WS-first ordering resolves to one application too', async () => {
      const counts = await both((ctx) => {
        const sent = generateMsg({
          cid: ctx.channel.cid,
          created_at: at(4),
          id: 'sent',
          pinned: false,
          updated_at: at(4),
          user: { id: ME },
        }) as MessageResponse;

        return [
          [
            'roundTrip',
            async () => {
              await ctx.channel.messageOperations.send(
                { localMessage: formatMessage(sent), message: { id: 'sent' } as never },
                async () => {
                  // Inside the request, so the event lands between the optimistic write and the
                  // reconciliation — which is what "the WS won the race" means.
                  echo(ctx, 'message.new', sent);
                  return { message: sent } as never;
                },
              );
            },
          ],
        ];
      });

      // Already collapsed before the ledger existed, but only as a side effect of `applyServerCopy`'s
      // freshness comparison. The ledger now states it, which is why this row must stay EQUAL rather
      // than improve: a change here means the two gates started disagreeing.
      expect(counts.on.roundTrip).toEqual(counts.off.roundTrip);
    });
  });
});
