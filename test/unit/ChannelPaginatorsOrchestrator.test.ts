import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from './test-utils/getClient';
import {
  ChannelPaginator,
  ChannelResponse,
  EventTypes,
  type StreamChat,
} from '../../src';
import { ChannelPaginatorsOrchestrator } from '../../src/ChannelPaginatorsOrchestrator';
vi.mock('../../src/pagination/utility.queryChannel', async () => {
  return {
    getChannel: vi.fn(async ({ client, id, type }) => {
      return client.channel(type, id);
    }),
  };
});
import { getChannel as mockGetChannel } from '../../src/pagination/utility.queryChannel';

describe('ChannelPaginatorsOrchestrator', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('initiates with default options', () => {
      // @ts-expect-error accessing protected property
      const defaultHandlers = ChannelPaginatorsOrchestrator.defaultEventHandlers;
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      expect(orchestrator.paginators).toHaveLength(0);

      expect(orchestrator.pipelines.size).toBe(Object.keys(defaultHandlers).length);
    });

    it('initiates with custom options', () => {
      const paginator = new ChannelPaginator({ client });
      const customChannelVisibleHandler = vi.fn();
      const customChannelDeletedHandler = vi.fn();
      const customEventHandler = vi.fn();

      // @ts-expect-error accessing protected property
      const defaultHandlers = ChannelPaginatorsOrchestrator.defaultEventHandlers;
      const eventHandlers = ChannelPaginatorsOrchestrator.getDefaultHandlers();

      eventHandlers['channel.visible'] = [
        ...(eventHandlers['channel.visible'] ?? []),
        {
          id: 'channel.visible:custom',
          handle: customChannelVisibleHandler,
        },
      ];

      eventHandlers['channel.deleted'] = [
        {
          id: 'channel.deleted:custom',
          handle: customChannelDeletedHandler,
        },
      ];

      eventHandlers['custom.event'] = [
        {
          id: 'custom.event',
          handle: customEventHandler,
        },
      ];

      const orchestrator = new ChannelPaginatorsOrchestrator({
        client,
        eventHandlers,
        paginators: [paginator],
      });
      expect(orchestrator.paginators).toHaveLength(1);
      expect(orchestrator.getPaginatorById(paginator.id)).toStrictEqual(paginator);
      expect(orchestrator.pipelines.size).toBe(Object.keys(defaultHandlers).length + 1);

      expect(orchestrator.pipelines.get('channel.visible')?.size).toBe(2);
      // @ts-expect-error accessing protected property
      expect(orchestrator.pipelines.get('channel.visible')?.handlers[0].id).toBe(
        eventHandlers['channel.visible'][0].id,
      );
      // @ts-expect-error accessing protected property
      expect(orchestrator.pipelines.get('channel.visible')?.handlers[1].id).toBe(
        eventHandlers['channel.visible'][1].id,
      );

      // @ts-expect-error accessing protected property
      expect(orchestrator.pipelines.get('channel.deleted').size).toBe(1);
      // @ts-expect-error accessing protected property
      expect(orchestrator.pipelines.get('channel.deleted').handlers[0].id).toBe(
        eventHandlers['channel.deleted'][0].id,
      );

      // @ts-expect-error accessing protected property
      expect(orchestrator.pipelines.get('custom.event').size).toBe(1);
      // @ts-expect-error accessing protected property
      expect(orchestrator.pipelines.get('custom.event').handlers[0].id).toBe(
        eventHandlers['custom.event'][0].id,
      );
    });
  });

  describe('registerSubscriptions', () => {
    it('subscribes only once', async () => {
      const onSpy = vi.spyOn(client, 'on');
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      orchestrator.registerSubscriptions();
      orchestrator.registerSubscriptions();
      expect(onSpy).toHaveBeenCalledTimes(1);
    });

    it('routes events to correct pipelines', async () => {
      const customChannelDeletedHandler = vi.fn();
      const customEventHandler = vi.fn();

      const eventHandlers = ChannelPaginatorsOrchestrator.getDefaultHandlers();

      eventHandlers['channel.deleted'] = [
        {
          id: 'channel.deleted:custom',
          handle: customChannelDeletedHandler,
        },
      ];

      eventHandlers['custom.event'] = [
        {
          id: 'custom.event',
          handle: customEventHandler,
        },
      ];

      const orchestrator = new ChannelPaginatorsOrchestrator({ client, eventHandlers });
      orchestrator.registerSubscriptions();

      const channelDeletedEvent = { type: 'channel.deleted', cid: 'x' } as const;

      client.dispatchEvent(channelDeletedEvent);

      await vi.waitFor(() => {
        expect(customChannelDeletedHandler).toHaveBeenCalledTimes(1);
        expect(customChannelDeletedHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            ctx: { orchestrator },
            event: channelDeletedEvent,
          }),
        );
      });

      const customEvent = { type: 'custom.event' as EventTypes, x: 'abc' } as const;

      client.dispatchEvent(customEvent);

      await vi.waitFor(() => {
        expect(customEventHandler).toHaveBeenCalledTimes(1);
        expect(customEventHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            ctx: { orchestrator },
            event: customEvent,
          }),
        );
      });
    });
  });

  describe('insertPaginator', () => {
    it('appends when no index is provided', () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });

      orchestrator.insertPaginator({ paginator: p1 });
      orchestrator.insertPaginator({ paginator: p2 });

      expect(orchestrator.paginators.map((p) => p.id)).toEqual([p1.id, p2.id]);
    });

    it('inserts at specific index', () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });
      const p3 = new ChannelPaginator({ client });

      orchestrator.insertPaginator({ paginator: p1 });
      orchestrator.insertPaginator({ paginator: p3 });
      orchestrator.insertPaginator({ paginator: p2, index: 1 });

      expect(orchestrator.paginators.map((p) => p.id)).toEqual([p1.id, p2.id, p3.id]);
    });

    it('moves existing paginator to new index', () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });
      const p3 = new ChannelPaginator({ client });

      orchestrator.insertPaginator({ paginator: p1 });
      orchestrator.insertPaginator({ paginator: p2 });
      orchestrator.insertPaginator({ paginator: p3 });

      // move p1 from 0 to 2
      orchestrator.insertPaginator({ paginator: p1, index: 2 });
      expect(orchestrator.paginators.map((p) => p.id)).toEqual([p2.id, p3.id, p1.id]);
    });

    it('clamps out-of-bounds index', () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });

      orchestrator.insertPaginator({ paginator: p1, index: -10 }); // -> 0
      orchestrator.insertPaginator({ paginator: p2, index: 999 }); // -> end

      expect(orchestrator.paginators.map((p) => p.id)).toEqual([p1.id, p2.id]);
    });
  });

  describe('addEventHandler', () => {
    it('registers a custom handler and can unsubscribe it', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const channelUpdatedHandler = vi.fn();
      const unsubscribe = orchestrator.addEventHandler({
        eventType: 'channel.updated',
        id: 'custom',
        handle: channelUpdatedHandler,
      });

      orchestrator.registerSubscriptions();
      const channelUpdatedEvent = { type: 'channel.updated', cid: 'x' } as const;

      client.dispatchEvent(channelUpdatedEvent);
      // event listeners are executed async
      await vi.waitFor(() => {
        expect(channelUpdatedHandler).toHaveBeenCalledWith({
          ctx: { orchestrator },
          event: channelUpdatedEvent,
        });
      });

      // Unsubscribe the custom handler and ensure it no longer fires
      unsubscribe();
      client.dispatchEvent(channelUpdatedEvent);

      // still 1 call total (did not increment)
      expect(channelUpdatedHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('setEventHandler', () => {
    it('replaces the existing handlers for a given event type', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const eventType = 'channel.updated';
      const channelUpdatedEvent = { type: eventType, cid: 'x' } as const;
      const channelUpdatedHandler1 = vi.fn();
      const channelUpdatedHandler2 = vi.fn();
      const unsubscribe = orchestrator.addEventHandler({
        eventType,
        id: 'custom',
        handle: channelUpdatedHandler1,
      });

      orchestrator.registerSubscriptions();

      client.dispatchEvent(channelUpdatedEvent);
      // event listeners are executed async
      await vi.waitFor(() => {
        expect(channelUpdatedHandler1).toHaveBeenCalledWith({
          ctx: { orchestrator },
          event: channelUpdatedEvent,
        });
      });
      expect(channelUpdatedHandler1).toHaveBeenCalledTimes(1);
      expect(channelUpdatedHandler2).toHaveBeenCalledTimes(0);

      orchestrator.setEventHandlers({
        eventType,
        handlers: [{ id: 'custom2', handle: channelUpdatedHandler2 }],
      });

      client.dispatchEvent(channelUpdatedEvent);
      await vi.waitFor(() => {
        expect(channelUpdatedHandler2).toHaveBeenCalledWith({
          ctx: { orchestrator },
          event: channelUpdatedEvent,
        });
      });

      // Unsubscribe the custom handler and ensure it no longer fires
      unsubscribe();

      // still 1 call total (did not increment)
      expect(channelUpdatedHandler1).toHaveBeenCalledTimes(1);
      expect(channelUpdatedHandler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeEventHandler', () => {
    it('does not create a pipeline for which the event type is removed', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const eventType = 'channel.updatedX';

      expect(orchestrator.pipelines.get(eventType)).toBeUndefined();
      orchestrator.removeEventHandlers({
        eventType,
        handlers: [{ idMatch: { id: 'XXX' } }],
      });
      expect(orchestrator.pipelines.get(eventType)).toBeUndefined();
    });

    it('removes the existing handlers for a given event type', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const eventType = 'channel.updated';
      const channelUpdatedEvent = { type: eventType, cid: 'x' } as const;
      const channelUpdatedHandler1 = vi.fn();
      const channelUpdatedHandler2 = vi.fn();
      orchestrator.setEventHandlers({
        eventType,
        handlers: [
          {
            id: 'custom1',
            handle: channelUpdatedHandler1,
          },
          {
            id: 'custom2',
            handle: channelUpdatedHandler2,
          },
        ],
      });

      orchestrator.registerSubscriptions();
      // @ts-expect-error accessing protected property handlers
      expect(orchestrator.pipelines.get(eventType).handlers).toHaveLength(2);

      client.dispatchEvent(channelUpdatedEvent);
      // wait for async handler execution
      await vi.waitFor(() => {
        expect(channelUpdatedHandler1).toHaveBeenCalledTimes(1);
        expect(channelUpdatedHandler2).toHaveBeenCalledTimes(1);
      });

      orchestrator.removeEventHandlers({
        eventType,
        handlers: [{ idMatch: { id: 'custom', regexMatch: true } }],
      });
      client.dispatchEvent(channelUpdatedEvent);
      // wait for async handler execution
      await vi.waitFor(() => {
        expect(channelUpdatedHandler1).toHaveBeenCalledTimes(1);
        expect(channelUpdatedHandler2).toHaveBeenCalledTimes(1);
      });
      // @ts-expect-error accessing protected property handlers
      expect(orchestrator.pipelines.get(eventType).handlers).toHaveLength(0);
    });
  });

  describe('ensurePipeline', () => {
    it('returns the same pipeline instance for the same event type', () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const p1 = orchestrator.ensurePipeline('channel.updated');
      const p2 = orchestrator.ensurePipeline('channel.updated');
      expect(p1).toBe(p2);
    });
  });

  describe('reload', () => {
    it('calls reload on all the paginators', async () => {
      const paginator1 = new ChannelPaginator({ client });
      const paginator2 = new ChannelPaginator({ client });
      vi.spyOn(paginator1, 'reload').mockResolvedValue();
      vi.spyOn(paginator2, 'reload').mockResolvedValue();
      const orchestrator = new ChannelPaginatorsOrchestrator({
        client,
        paginators: [paginator1, paginator2],
      });
      await orchestrator.reload();
      expect(paginator1.reload).toHaveBeenCalledTimes(1);
      expect(paginator2.reload).toHaveBeenCalledTimes(1);
    });
  });

  // Helper to create a minimal channel with needed state
  function makeChannel(cid: string) {
    const [type, id] = cid.split(':');
    return client.channel(type, id);
  }

  describe.each(['channel.deleted', 'channel.hidden'] as EventTypes[])(
    'event %s',
    (eventType) => {
      it('removes the channel from all paginators', async () => {
        const cid = 'messaging:1';
        const ch = makeChannel(cid);

        const p1 = new ChannelPaginator({ client });
        const p2 = new ChannelPaginator({ client });
        const r1 = vi.spyOn(p1, 'removeItem');
        const r2 = vi.spyOn(p2, 'removeItem');

        const orchestrator = new ChannelPaginatorsOrchestrator({
          client,
          paginators: [p1, p2],
        });
        client.activeChannels[cid] = ch;

        orchestrator.registerSubscriptions();
        client.dispatchEvent({ type: 'channel.deleted', cid } as const);

        await vi.waitFor(() => {
          // client.activeChannels does not contain the deleted channel, therefore the search is performed with id
          expect(r1).toHaveBeenCalledWith({ id: ch.cid, item: undefined });
          expect(r2).toHaveBeenCalledWith({ id: ch.cid, item: undefined });
        });
      });

      it('is a no-op when cid is missing', async () => {
        const orchestrator = new ChannelPaginatorsOrchestrator({ client });
        const p = new ChannelPaginator({ client });
        const r = vi.spyOn(p, 'removeItem');

        orchestrator.insertPaginator({ paginator: p });
        orchestrator.registerSubscriptions();

        client.dispatchEvent({ type: 'channel.deleted' } as const); // no cid
        await vi.waitFor(() => {
          expect(r).not.toHaveBeenCalled();
        });
      });

      it('tries to remove non-existent channel from all paginators', async () => {
        const orchestrator = new ChannelPaginatorsOrchestrator({ client });
        const p = new ChannelPaginator({ client });
        const r = vi.spyOn(p, 'removeItem');

        orchestrator.insertPaginator({ paginator: p });
        orchestrator.registerSubscriptions();

        client.dispatchEvent({ type: 'channel.deleted', cid: 'messaging:404' }); // no such channel
        await vi.waitFor(() => {
          expect(r).toHaveBeenCalledWith({ id: 'messaging:404', item: undefined });
        });
      });
    },
  );

  describe.each(['notification.removed_from_channel'] as EventTypes[])(
    'event %s',
    (eventType) => {
      it('removes the channel from all paginators', async () => {
        const cid = 'messaging:2';
        const ch = makeChannel(cid);

        const p1 = new ChannelPaginator({ client });
        const p2 = new ChannelPaginator({ client });
        const r1 = vi.spyOn(p1, 'removeItem');
        const r2 = vi.spyOn(p2, 'removeItem');

        const orchestrator = new ChannelPaginatorsOrchestrator({
          client,
          paginators: [p1, p2],
        });
        client.activeChannels[cid] = ch;

        orchestrator.registerSubscriptions();
        client.dispatchEvent({ type: eventType, cid } as const);

        await vi.waitFor(() => {
          // client.activeChannels contains the hidden channel, therefore the search is performed with item
          expect(r1).toHaveBeenCalledWith({ id: ch.cid, item: ch });
          expect(r2).toHaveBeenCalledWith({ id: ch.cid, item: ch });
        });
      });

      it('is a no-op when cid is missing', async () => {
        const orchestrator = new ChannelPaginatorsOrchestrator({ client });
        const p = new ChannelPaginator({ client });
        const r = vi.spyOn(p, 'removeItem');

        orchestrator.insertPaginator({ paginator: p });
        orchestrator.registerSubscriptions();

        client.dispatchEvent({ type: eventType } as const); // no cid
        await vi.waitFor(() => {
          expect(r).not.toHaveBeenCalled();
        });
      });

      it('tries to remove non-existent channel from all paginators', async () => {
        const orchestrator = new ChannelPaginatorsOrchestrator({ client });
        const p = new ChannelPaginator({ client });
        const r = vi.spyOn(p, 'removeItem');

        orchestrator.insertPaginator({ paginator: p });
        orchestrator.registerSubscriptions();

        client.dispatchEvent({ type: eventType, cid: 'messaging:404' }); // no such channel
        await vi.waitFor(() => {
          expect(r).toHaveBeenCalledWith({ id: 'messaging:404', item: undefined });
        });
      });
    },
  );

  describe.each(['channel.updated', 'channel.truncated'] as EventTypes[])(
    'event %s',
    (eventType) => {
      it('re-emits item lists for paginators that already contain the channel', async () => {
        const orchestrator = new ChannelPaginatorsOrchestrator({ client });
        const ch = makeChannel('messaging:3');
        client.activeChannels[ch.cid] = ch;

        const p1 = new ChannelPaginator({ client });
        const p2 = new ChannelPaginator({ client });
        p1.state.partialNext({ items: [ch] });
        vi.spyOn(p1, 'findItem').mockReturnValue(ch);
        vi.spyOn(p2, 'findItem').mockReturnValue(undefined);
        const partialNextSpy1 = vi.spyOn(p1.state, 'partialNext');
        const partialNextSpy2 = vi.spyOn(p2.state, 'partialNext');

        orchestrator.insertPaginator({ paginator: p1 });
        orchestrator.registerSubscriptions();

        client.dispatchEvent({ type: eventType, cid: ch.cid });
        await vi.waitFor(() => {
          expect(partialNextSpy2).toHaveBeenCalledTimes(0);
          expect(partialNextSpy1).toHaveBeenCalledTimes(1);
          const last = partialNextSpy1.mock.calls.at(-1)![0];
          expect(last.items!.length).toBe(1);
          expect(last.items![0]).toStrictEqual(ch);
        });
      });
    },
  );

  describe.each([
    'channel.visible',
    'member.updated',
    'message.new',
    'notification.added_to_channel',
    'notification.message_new',
  ] as EventTypes[])('event %s', (eventType) => {
    it('ingests when matchesFilter, removes when not', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const ch = makeChannel('messaging:5');
      client.activeChannels[ch.cid] = ch;

      const p = new ChannelPaginator({ client });
      const matchesFilterSpy = vi.spyOn(p, 'matchesFilter').mockReturnValue(true);
      const ingestItemSpy = vi.spyOn(p, 'ingestItem').mockReturnValue(true);
      const removeItemSpy = vi.spyOn(p, 'removeItem').mockReturnValue(true);

      orchestrator.insertPaginator({ paginator: p });
      orchestrator.registerSubscriptions();

      client.dispatchEvent({ type: eventType, cid: ch.cid });
      await vi.waitFor(() => {
        expect(matchesFilterSpy).toHaveBeenCalledWith(ch);
        expect(ingestItemSpy).toHaveBeenCalledWith(ch);
        expect(removeItemSpy).not.toHaveBeenCalled();
      });

      matchesFilterSpy.mockReturnValue(false);
      client.dispatchEvent({ type: eventType, cid: 'messaging:5' });

      await vi.waitFor(() => {
        expect(removeItemSpy).toHaveBeenCalledWith({ item: ch });
        expect(ingestItemSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('loads channel by (type,id) when not in activeChannels', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });

      const p = new ChannelPaginator({ client });
      const removeItemSpy = vi.spyOn(p, 'removeItem').mockReturnValue(true);
      const ingestItemSpy = vi.spyOn(p, 'ingestItem').mockReturnValue(true);
      vi.spyOn(p, 'matchesFilter').mockReturnValue(true);
      orchestrator.insertPaginator({ paginator: p });
      orchestrator.registerSubscriptions();

      client.dispatchEvent({
        type: eventType,
        channel_type: 'messaging',
        channel_id: '6',
      });

      await vi.waitFor(() => {
        expect(mockGetChannel).toHaveBeenCalledWith({
          client,
          id: '6',
          type: 'messaging',
        });
        const ch = makeChannel('messaging:6');
        expect(ingestItemSpy).toHaveBeenCalledWith(ch);
        expect(removeItemSpy).not.toHaveBeenCalled();
      });
    });

    it('uses event.channel if provided', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const ch = makeChannel('messaging:7');
      client.activeChannels[ch.cid] = ch;

      const p = new ChannelPaginator({ client });

      const removeItemSpy = vi.spyOn(p, 'removeItem').mockReturnValue(true);
      const ingestItemSpy = vi.spyOn(p, 'ingestItem').mockReturnValue(true);
      vi.spyOn(p, 'matchesFilter').mockReturnValue(true);

      orchestrator.insertPaginator({ paginator: p });
      orchestrator.registerSubscriptions();

      client.dispatchEvent({
        type: eventType,
        channel: { cid: 'messaging:7' } as ChannelResponse,
      });
      await vi.waitFor(() => {
        expect(ingestItemSpy).toHaveBeenCalledWith(ch);
        expect(removeItemSpy).not.toHaveBeenCalled();
      });
    });

    it('removes channel if does not match the filter anymore', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const ch = makeChannel('messaging:7');
      client.activeChannels[ch.cid] = ch;

      const p = new ChannelPaginator({ client });

      const removeItemSpy = vi.spyOn(p, 'removeItem').mockReturnValue(true);
      const ingestItemSpy = vi.spyOn(p, 'ingestItem').mockReturnValue(true);
      vi.spyOn(p, 'matchesFilter').mockReturnValue(false);

      orchestrator.insertPaginator({ paginator: p });
      orchestrator.registerSubscriptions();

      client.dispatchEvent({
        type: eventType,
        channel: { cid: 'messaging:7' } as ChannelResponse,
      });
      await vi.waitFor(() => {
        expect(ingestItemSpy).not.toHaveBeenCalled();
        expect(removeItemSpy).toHaveBeenCalledWith({ item: ch });
      });
    });
  });

  it.each([
    'message.new',
    'notification.message_new',
    'notification.added_to_channel',
    'channel.visible',
  ] as EventTypes[])(
    'boosts ingested channel on %s if the item is not already boosted at the top',
    async (eventType) => {
      vi.useFakeTimers();
      const now = new Date('2025-01-01T00:00:00Z');
      vi.setSystemTime(now);
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now.getTime());

      const orchestrator = new ChannelPaginatorsOrchestrator({ client });
      const ch = makeChannel('messaging:5');
      client.activeChannels[ch.cid] = ch;

      const paginator = new ChannelPaginator({ client });
      const matchesFilterSpy = vi.spyOn(paginator, 'matchesFilter').mockReturnValue(true);

      orchestrator.insertPaginator({ paginator });
      orchestrator.registerSubscriptions();

      // @ts-expect-error accessing protected property
      expect(paginator.boosts.size).toBe(0);

      client.dispatchEvent({ type: eventType, cid: ch.cid });

      await vi.waitFor(() => {
        // @ts-expect-error accessing protected property
        expect(Array.from(paginator.boosts.entries())).toEqual([
          [ch.cid, { seq: 1, until: now.getTime() + 15000 }],
        ]);
      });

      client.dispatchEvent({ type: eventType, cid: ch.cid });
      await vi.waitFor(() => {
        // already at the top
        // @ts-expect-error accessing protected property
        expect(Array.from(paginator.boosts.entries())).toEqual([
          [ch.cid, { seq: 1, until: now.getTime() + 15000 }],
        ]);
      });

      matchesFilterSpy.mockReturnValue(false);
      client.dispatchEvent({ type: eventType, cid: ch.cid });

      await vi.waitFor(() => {
        // @ts-expect-error accessing protected property
        expect(Array.from(paginator.boosts.entries())).toEqual([
          [ch.cid, { seq: 1, until: now.getTime() + 15000 }],
        ]);
      });

      matchesFilterSpy.mockReturnValue(true);
      // @ts-expect-error accessing protected property
      paginator._maxBoostSeq = 1000;
      client.dispatchEvent({ type: eventType, cid: ch.cid });
      await vi.waitFor(() => {
        // some other channel has a higher boost
        // @ts-expect-error accessing protected property
        expect(Array.from(paginator.boosts.entries())).toEqual([
          [ch.cid, { seq: 1001, until: now.getTime() + 15000 }],
        ]);
      });

      nowSpy.mockRestore();
      vi.useRealTimers();
    },
  );

  it.each([
    'channel.updated',
    'channel.truncated',
    'member.updated',
    'user.presence.changed',
  ] as EventTypes[])('does not boost ingested channel on %s', async (eventType) => {
    vi.useFakeTimers();
    const now = new Date('2025-01-01T00:00:00Z');
    vi.setSystemTime(now);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now.getTime());

    const orchestrator = new ChannelPaginatorsOrchestrator({ client });
    const ch = makeChannel('messaging:5');
    client.activeChannels[ch.cid] = ch;

    const paginator = new ChannelPaginator({ client });
    const matchesFilterSpy = vi.spyOn(paginator, 'matchesFilter').mockReturnValue(true);

    orchestrator.insertPaginator({ paginator });
    orchestrator.registerSubscriptions();

    // @ts-expect-error accessing protected property
    expect(paginator.boosts.size).toBe(0);

    client.dispatchEvent({ type: eventType, cid: ch.cid });

    await vi.waitFor(() => {
      // @ts-expect-error accessing protected property
      expect(paginator.boosts.size).toBe(0);
    });
  });

  describe('user.presence.changed', () => {
    it('updates user on channels where the user is a member and re-emits lists', async () => {
      const orchestrator = new ChannelPaginatorsOrchestrator({ client });

      const ch1 = makeChannel('messaging:13');
      ch1.state.members = {
        u1: { user: { id: 'u1', name: 'Old' } },
        u3: { user: { id: 'u3', name: 'Old3' } },
      };
      ch1.state.membership = { user: { id: 'u1', name: 'Old' } };

      const ch2 = makeChannel('messaging:14');
      ch2.state.members = {
        u1: { user: { id: 'u1', name: 'Old' } },
        u2: { user: { id: 'u2', name: 'Old2' } },
        u3: { user: { id: 'u3', name: 'Old3' } },
      };
      ch2.state.membership = { user: { id: 'u1', name: 'Old' } };

      client.activeChannels[ch1.cid] = ch1;
      client.activeChannels[ch2.cid] = ch2;

      const p = new ChannelPaginator({ client });
      p.state.partialNext({ items: [ch1, ch2] });
      const partialNextSpy = vi.spyOn(p.state, 'partialNext');

      orchestrator.insertPaginator({ paginator: p });
      orchestrator.registerSubscriptions();

      // user u1 presence changed
      client.dispatchEvent({
        type: 'user.presence.changed',
        user: { id: 'u1', name: 'NewName' },
      });

      await vi.waitFor(() => {
        expect(ch1.state.members['u1'].user?.name).toBe('NewName');
        expect(ch1.state.members['u3'].user?.name).toBe('Old3');

        expect(ch2.state.members['u1'].user?.name).toBe('NewName');
        expect(ch2.state.members['u2'].user?.name).toBe('Old2');
        expect(ch2.state.members['u3'].user?.name).toBe('Old3');

        expect(ch1.state.membership.user?.name).toBe('NewName');
        expect(ch2.state.membership.user?.name).toBe('NewName');
        expect(partialNextSpy).toHaveBeenCalledTimes(1);
        expect(partialNextSpy).toHaveBeenCalledWith({ items: [ch1, ch2] });
      });

      // Now user without id → ignored
      partialNextSpy.mockClear();
      client.dispatchEvent({ type: 'user.presence.changed', user: {} as any });
      expect(partialNextSpy).not.toHaveBeenCalled();
    });
  });
});
