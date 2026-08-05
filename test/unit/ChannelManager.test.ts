import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from './test-utils/getClient';
import {
  type Channel,
  ChannelPaginator,
  ChannelResponse,
  EventTypes,
  type StreamChat,
} from '../../src';
import {
  ChannelManager,
  createPriorityOwnershipResolver,
} from '../../src/ChannelManager';
vi.mock('../../src/pagination/utility.queryChannel', async () => {
  return {
    getChannel: vi.fn(async ({ client, id, type }) => {
      return client.channel(type, id);
    }),
  };
});
import { getChannel as mockGetChannel } from '../../src/pagination/utility.queryChannel';

describe('ChannelManager', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser();
    vi.clearAllMocks();
  });

  describe('ownershipResolver', () => {
    it('keeps channel in all matching paginators by default', async () => {
      const ch = makeChannel('messaging:100');
      client.activeChannels[ch.cid] = ch;

      const p1 = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const p2 = new ChannelPaginator({ client, filters: { type: 'messaging' } });

      const channelManager = new ChannelManager({
        client,
        paginators: [p1, p2],
      });
      channelManager.registerSubscriptions();

      client.dispatchEvent({ type: 'message.new', cid: ch.cid });
      await vi.waitFor(() => {
        expect(channelManager.getPaginatorById(p1.id)).toStrictEqual(p1);
        expect(channelManager.getPaginatorById(p2.id)).toStrictEqual(p2);
        expect(p1.items).toHaveLength(1);
        expect(p1.items![0]).toStrictEqual(ch);
        expect(p2.items).toHaveLength(1);
        expect(p2.items![0]).toStrictEqual(ch);
      });
    });

    it('keeps channel only in highest-priority matching paginator when resolver provided', async () => {
      const pHigh = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const pLow = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const channelManager = new ChannelManager({
        client,
        paginators: [pLow, pHigh],
        ownershipResolver: createPriorityOwnershipResolver([pHigh.id, pLow.id]),
      });

      const ch = makeChannel('messaging:101');
      client.activeChannels[ch.cid] = ch;

      channelManager.registerSubscriptions();
      client.dispatchEvent({ type: 'message.new', cid: ch.cid });

      await vi.waitFor(() => {
        expect(pHigh.items).toHaveLength(1);
        expect(pHigh.items![0]).toStrictEqual(ch);
        expect(pLow.items).toBeUndefined();
      });
    });

    it('keeps item in all priority ownership paginators when resolver returns multiple ids', async () => {
      const pHigh = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const pLow = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const channelManager = new ChannelManager({
        client,
        paginators: [pLow, pHigh],
        ownershipResolver: () => [pHigh.id, pLow.id],
      });

      const ch = makeChannel('messaging:101');
      client.activeChannels[ch.cid] = ch;

      channelManager.registerSubscriptions();
      client.dispatchEvent({ type: 'message.new', cid: ch.cid });

      await vi.waitFor(() => {
        expect(pHigh.items).toHaveLength(1);
        expect(pHigh.items![0]).toStrictEqual(ch);
        expect(pLow.items).toHaveLength(1);
        expect(pLow.items![0]).toStrictEqual(ch);
      });
    });

    it('accepts ownershipResolver as array of ids and applies priority', async () => {
      const pLow = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const pHigh = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const channelManager = new ChannelManager({
        client,
        paginators: [pLow, pHigh],
        ownershipResolver: [pHigh.id, pLow.id],
      });

      const ch = makeChannel('messaging:102');
      client.activeChannels[ch.cid] = ch;

      channelManager.registerSubscriptions();
      client.dispatchEvent({ type: 'message.new', cid: ch.cid });

      await vi.waitFor(() => {
        expect(pHigh.items).toHaveLength(1);
        expect(pHigh.items![0]).toStrictEqual(ch);
        expect(pLow.items).toBeUndefined();
      });
    });

    it('keeps items only in owner paginators if some matching paginators are not listed in ownershipResolver array', async () => {
      const pLow = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const pHigh = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const channelManager = new ChannelManager({
        client,
        paginators: [pLow, pHigh],
        ownershipResolver: [pHigh.id],
      });

      const ch = makeChannel('messaging:102');
      client.activeChannels[ch.cid] = ch;

      channelManager.registerSubscriptions();
      client.dispatchEvent({ type: 'message.new', cid: ch.cid });

      await vi.waitFor(() => {
        expect(pHigh.items).toHaveLength(1);
        expect(pHigh.items![0]).toStrictEqual(ch);
        expect(pLow.items).toBeUndefined();
      });
    });

    it('keeps items only in matching paginators if owner paginators are not matching', async () => {
      const p1 = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const p2 = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const p3 = new ChannelPaginator({ client, filters: { type: 'messagingX' } });
      const channelManager = new ChannelManager({
        client,
        paginators: [p1, p2, p3],
        ownershipResolver: [p3.id],
      });

      const ch = makeChannel('messaging:102');
      client.activeChannels[ch.cid] = ch;

      channelManager.registerSubscriptions();
      client.dispatchEvent({ type: 'message.new', cid: ch.cid });

      await vi.waitFor(() => {
        expect(p1.items).toHaveLength(1);
        expect(p1.items![0]).toStrictEqual(ch);
        expect(p2.items).toHaveLength(1);
        expect(p2.items![0]).toStrictEqual(ch);
        expect(p3.items).toBeUndefined();
      });
    });

    it('applies ownership rules to paginators when they paginate', async () => {
      const ch1 = makeChannel('messaging:101');
      const ch2 = makeChannel('messaging:102');
      const queryChannelSpy = vi
        .spyOn(client, 'queryChannelsAndHydrate')
        // ChannelPaginator queries with `withResponse: true` to read `predefined_filter` metadata,
        // so the mock has to resolve the full response shape.
        .mockResolvedValue({ channels: [ch1], duration: '0.1ms' });
      const p1 = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'p1',
        paginatorOptions: { pageSize: 1 },
      });
      const p2 = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'p2',
        paginatorOptions: { pageSize: 1 },
      });
      new ChannelManager({
        client,
        paginators: [p1, p2],
        ownershipResolver: [p2.id],
      });

      await Promise.all([p1, p2].map((p) => p.toTail()));

      await vi.waitFor(() => {
        expect(p1.items).toHaveLength(0);
        // even though ownership claimed by p2, it is still possible to request next page.
        expect(p1.hasMoreTail).toBe(true);
        expect(p2.items).toHaveLength(1);
        expect(p2.items).toStrictEqual([ch1]);
        expect(p2.hasMoreTail).toBe(true);
      });

      queryChannelSpy.mockResolvedValue({ channels: [ch2], duration: '0.1ms' });
      await Promise.all([p1, p2].map((p) => p.toTail()));

      await vi.waitFor(() => {
        expect(p1.items).toHaveLength(0);
        expect(p1.hasMoreTail).toBe(true);
        expect(p2.items).toHaveLength(2);
        expect(p2.items).toStrictEqual([ch1, ch2]);
        expect(p2.hasMoreTail).toBe(true);
      });
    });
  });

  describe('client.createChannelManager', () => {
    it('builds a manager bound to the client, with or without options', () => {
      const paginator = new ChannelPaginator({ client });

      expect(client.createChannelManager()).toBeInstanceOf(ChannelManager);

      const channelManager = client.createChannelManager({ paginators: [paginator] });

      expect(channelManager).toBeInstanceOf(ChannelManager);
      expect(channelManager.client).toBe(client);
      expect(channelManager.paginators).toStrictEqual([paginator]);
    });

    // ported from the legacy suite ("should only invoke event handlers if registerSubscriptions has been
    // called" / "should unregister subscriptions if unregisterSubscriptions is called")
    it('handles events only while subscribed', async () => {
      const handler = vi.fn();
      const channelManager = client.createChannelManager({
        eventHandlers: { 'message.new': [{ handle: handler, id: 'test' }] },
      });

      client.dispatchEvent({ type: 'message.new', cid: 'messaging:1' });
      await vi.waitFor(() => expect(handler).not.toHaveBeenCalled());

      channelManager.registerSubscriptions();
      client.dispatchEvent({ type: 'message.new', cid: 'messaging:1' });
      await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));

      channelManager.unregisterSubscriptions();
      client.dispatchEvent({ type: 'message.new', cid: 'messaging:1' });
      await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    });

    it('ref-counts its subscriptions', () => {
      const channelManager = client.createChannelManager();

      const unregisterFirst = channelManager.registerSubscriptions();
      channelManager.registerSubscriptions();
      expect(channelManager.hasSubscriptions).toBe(true);

      // two consumers registered, so the first unregister must not tear the subscriptions down
      unregisterFirst();
      expect(channelManager.hasSubscriptions).toBe(true);

      channelManager.unregisterSubscriptions();
      expect(channelManager.hasSubscriptions).toBe(false);
    });
  });

  describe('constructor', () => {
    it('initiates with default options', () => {
      // @ts-expect-error accessing protected property
      const defaultHandlers = ChannelManager.defaultEventHandlers;
      const channelManager = new ChannelManager({ client });
      expect(channelManager.paginators).toHaveLength(0);

      expect(channelManager.pipelines.size).toBe(Object.keys(defaultHandlers).length);
    });

    it('initiates with custom options', () => {
      const paginator = new ChannelPaginator({ client });
      const customChannelVisibleHandler = vi.fn();
      const customChannelDeletedHandler = vi.fn();
      const customEventHandler = vi.fn();

      // @ts-expect-error accessing protected property
      const defaultHandlers = ChannelManager.defaultEventHandlers;
      const eventHandlers = ChannelManager.getDefaultHandlers();

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

      const channelManager = new ChannelManager({
        client,
        eventHandlers,
        paginators: [paginator],
      });
      expect(channelManager.paginators).toHaveLength(1);
      expect(channelManager.getPaginatorById(paginator.id)).toStrictEqual(paginator);
      expect(channelManager.pipelines.size).toBe(Object.keys(defaultHandlers).length + 1);

      expect(channelManager.pipelines.get('channel.visible')?.size).toBe(2);
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.visible')?.handlers[0].id).toBe(
        eventHandlers['channel.visible'][0].id,
      );
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.visible')?.handlers[1].id).toBe(
        eventHandlers['channel.visible'][1].id,
      );

      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.deleted').size).toBe(1);
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.deleted').handlers[0].id).toBe(
        eventHandlers['channel.deleted'][0].id,
      );

      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('custom.event').size).toBe(1);
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('custom.event').handlers[0].id).toBe(
        eventHandlers['custom.event'][0].id,
      );
    });
  });

  describe('registerSubscriptions', () => {
    it('subscribes only once', async () => {
      const onSpy = vi.spyOn(client, 'on');
      const channelManager = new ChannelManager({ client });
      channelManager.registerSubscriptions();
      channelManager.registerSubscriptions();
      expect(onSpy).toHaveBeenCalledTimes(1);
    });

    it('routes events to correct pipelines', async () => {
      const customChannelDeletedHandler = vi.fn();
      const customEventHandler = vi.fn();

      const eventHandlers = ChannelManager.getDefaultHandlers();

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

      const channelManager = new ChannelManager({ client, eventHandlers });
      channelManager.registerSubscriptions();

      const channelDeletedEvent = { type: 'channel.deleted', cid: 'x' } as const;

      client.dispatchEvent(channelDeletedEvent);

      await vi.waitFor(() => {
        expect(customChannelDeletedHandler).toHaveBeenCalledTimes(1);
        expect(customChannelDeletedHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            ctx: { channelManager },
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
            ctx: { channelManager },
            event: customEvent,
          }),
        );
      });
    });
  });

  describe('insertPaginator', () => {
    it('appends when no index is provided', () => {
      const channelManager = new ChannelManager({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });

      channelManager.insertPaginator({ paginator: p1 });
      channelManager.insertPaginator({ paginator: p2 });

      expect(channelManager.paginators.map((p) => p.id)).toEqual([p1.id, p2.id]);
    });

    it('inserts at specific index', () => {
      const channelManager = new ChannelManager({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });
      const p3 = new ChannelPaginator({ client });

      channelManager.insertPaginator({ paginator: p1 });
      channelManager.insertPaginator({ paginator: p3 });
      channelManager.insertPaginator({ paginator: p2, index: 1 });

      expect(channelManager.paginators.map((p) => p.id)).toEqual([p1.id, p2.id, p3.id]);
    });

    it('moves existing paginator to new index', () => {
      const channelManager = new ChannelManager({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });
      const p3 = new ChannelPaginator({ client });

      channelManager.insertPaginator({ paginator: p1 });
      channelManager.insertPaginator({ paginator: p2 });
      channelManager.insertPaginator({ paginator: p3 });

      // move p1 from 0 to 2
      channelManager.insertPaginator({ paginator: p1, index: 2 });
      expect(channelManager.paginators.map((p) => p.id)).toEqual([p2.id, p3.id, p1.id]);
    });

    it('clamps out-of-bounds index', () => {
      const channelManager = new ChannelManager({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });

      channelManager.insertPaginator({ paginator: p1, index: -10 }); // -> 0
      channelManager.insertPaginator({ paginator: p2, index: 999 }); // -> end

      expect(channelManager.paginators.map((p) => p.id)).toEqual([p1.id, p2.id]);
    });
  });

  describe('addEventHandler', () => {
    it('registers a custom handler and can unsubscribe it', async () => {
      const channelManager = new ChannelManager({ client });
      const channelUpdatedHandler = vi.fn();
      const unsubscribe = channelManager.addEventHandler({
        eventType: 'channel.updated',
        id: 'custom',
        handle: channelUpdatedHandler,
      });

      channelManager.registerSubscriptions();
      const channelUpdatedEvent = { type: 'channel.updated', cid: 'x' } as const;

      client.dispatchEvent(channelUpdatedEvent);
      // event listeners are executed async
      await vi.waitFor(() => {
        expect(channelUpdatedHandler).toHaveBeenCalledWith({
          ctx: { channelManager },
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
      const channelManager = new ChannelManager({ client });
      const eventType = 'channel.updated';
      const channelUpdatedEvent = { type: eventType, cid: 'x' } as const;
      const channelUpdatedHandler1 = vi.fn();
      const channelUpdatedHandler2 = vi.fn();
      const unsubscribe = channelManager.addEventHandler({
        eventType,
        id: 'custom',
        handle: channelUpdatedHandler1,
      });

      channelManager.registerSubscriptions();

      client.dispatchEvent(channelUpdatedEvent);
      // event listeners are executed async
      await vi.waitFor(() => {
        expect(channelUpdatedHandler1).toHaveBeenCalledWith({
          ctx: { channelManager },
          event: channelUpdatedEvent,
        });
      });
      expect(channelUpdatedHandler1).toHaveBeenCalledTimes(1);
      expect(channelUpdatedHandler2).toHaveBeenCalledTimes(0);

      channelManager.setEventHandlers({
        eventType,
        handlers: [{ id: 'custom2', handle: channelUpdatedHandler2 }],
      });

      client.dispatchEvent(channelUpdatedEvent);
      await vi.waitFor(() => {
        expect(channelUpdatedHandler2).toHaveBeenCalledWith({
          ctx: { channelManager },
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
      const channelManager = new ChannelManager({ client });
      const eventType = 'channel.updatedX';

      expect(channelManager.pipelines.get(eventType)).toBeUndefined();
      channelManager.removeEventHandlers({
        eventType,
        handlers: [{ idMatch: { id: 'XXX' } }],
      });
      expect(channelManager.pipelines.get(eventType)).toBeUndefined();
    });

    it('removes the existing handlers for a given event type', async () => {
      const channelManager = new ChannelManager({ client });
      const eventType = 'channel.updated';
      const channelUpdatedEvent = { type: eventType, cid: 'x' } as const;
      const channelUpdatedHandler1 = vi.fn();
      const channelUpdatedHandler2 = vi.fn();
      channelManager.setEventHandlers({
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

      channelManager.registerSubscriptions();
      // @ts-expect-error accessing protected property handlers
      expect(channelManager.pipelines.get(eventType).handlers).toHaveLength(2);

      client.dispatchEvent(channelUpdatedEvent);
      // wait for async handler execution
      await vi.waitFor(() => {
        expect(channelUpdatedHandler1).toHaveBeenCalledTimes(1);
        expect(channelUpdatedHandler2).toHaveBeenCalledTimes(1);
      });

      channelManager.removeEventHandlers({
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
      expect(channelManager.pipelines.get(eventType).handlers).toHaveLength(0);
    });
  });

  describe('ensurePipeline', () => {
    it('returns the same pipeline instance for the same event type', () => {
      const channelManager = new ChannelManager({ client });
      const p1 = channelManager.ensurePipeline('channel.updated');
      const p2 = channelManager.ensurePipeline('channel.updated');
      expect(p1).toBe(p2);
    });
  });

  describe('reload', () => {
    it('calls reload on all the paginators', async () => {
      const paginator1 = new ChannelPaginator({ client });
      const paginator2 = new ChannelPaginator({ client });
      vi.spyOn(paginator1, 'reload').mockResolvedValue();
      vi.spyOn(paginator2, 'reload').mockResolvedValue();
      const channelManager = new ChannelManager({
        client,
        paginators: [paginator1, paginator2],
      });
      await channelManager.reload();
      expect(paginator1.reload).toHaveBeenCalledTimes(1);
      expect(paginator2.reload).toHaveBeenCalledTimes(1);
    });
  });

  // Helper to create a minimal channel with needed state
  function makeChannel(cid: string) {
    const [type, id] = cid.split(':');
    const channel = client.channel(type, id);
    channel.data!.type = type;
    channel.data!.id = id;
    return channel;
  }

  // `channel.hidden` used to be parameterized in here, but every case dispatched a hardcoded
  // `channel.deleted`, so the hidden variant was never exercised. It is not a removal either — see the
  // `event channel.hidden` block below.
  describe.each(['channel.deleted'] as EventTypes[])('event %s', (eventType) => {
    it('removes the channel from all paginators', async () => {
      const cid = 'messaging:1';
      const ch = makeChannel(cid);

      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });
      const r1 = vi.spyOn(p1, 'removeItem');
      const r2 = vi.spyOn(p2, 'removeItem');

      const channelManager = new ChannelManager({
        client,
        paginators: [p1, p2],
      });
      client.activeChannels[cid] = ch;

      channelManager.registerSubscriptions();
      client.dispatchEvent({ type: eventType, cid } as const);

      await vi.waitFor(() => {
        // client.activeChannels does not contain the deleted channel, therefore the search is performed with id
        expect(r1).toHaveBeenCalledWith({ id: ch.cid, item: undefined });
        expect(r2).toHaveBeenCalledWith({ id: ch.cid, item: undefined });
      });
    });

    it('is a no-op when cid is missing', async () => {
      const channelManager = new ChannelManager({ client });
      const p = new ChannelPaginator({ client });
      const r = vi.spyOn(p, 'removeItem');

      channelManager.insertPaginator({ paginator: p });
      channelManager.registerSubscriptions();

      client.dispatchEvent({ type: eventType } as const); // no cid
      await vi.waitFor(() => {
        expect(r).not.toHaveBeenCalled();
      });
    });

    // ported from the legacy ChannelManager suite, which removed by `event.cid || event.channel?.cid`
    it('removes the channel when only event.channel carries the cid', async () => {
      const cid = 'messaging:nested-cid';
      const channelManager = new ChannelManager({ client });
      const p = new ChannelPaginator({ client });
      const r = vi.spyOn(p, 'removeItem');

      channelManager.insertPaginator({ paginator: p });
      channelManager.registerSubscriptions();

      client.dispatchEvent({
        type: eventType,
        channel: { cid, id: 'nested-cid', type: 'messaging' } as ChannelResponse,
      });

      await vi.waitFor(() => {
        expect(r).toHaveBeenCalledWith({ id: cid, item: undefined });
      });
    });

    it('tries to remove non-existent channel from all paginators', async () => {
      const channelManager = new ChannelManager({ client });
      const p = new ChannelPaginator({ client });
      const r = vi.spyOn(p, 'removeItem');

      channelManager.insertPaginator({ paginator: p });
      channelManager.registerSubscriptions();

      client.dispatchEvent({ type: eventType, cid: 'messaging:404' }); // no such channel
      await vi.waitFor(() => {
        expect(r).toHaveBeenCalledWith({ id: 'messaging:404', item: undefined });
      });
    });
  });

  // ported from the legacy suite's "predefined filter response metadata" block, which asserted the same
  // thing through its WS handlers: a channel the backend-resolved filter excludes must not be promoted
  // into the list by an event.
  describe('backend-resolved predefined filter', () => {
    it('a message.new in an archived channel does not add it to a list the backend filtered to { archived: false }', async () => {
      const archived = makeChannel('messaging:archived-1');
      archived.state.membership = {
        user: { id: client.userID as string },
        archived_at: '2025-09-03T12:19:39.101089Z',
      };
      client.activeChannels[archived.cid] = archived;

      const paginator = new ChannelPaginator({ client });
      // the query reports that the backend applied `{ archived: false }`, which the local filters do not say
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [],
        duration: '0.1ms',
        predefined_filter: { name: 'unarchived', filter: { archived: false } },
      });
      await paginator.toTail();

      const channelManager = new ChannelManager({ client, paginators: [paginator] });
      channelManager.registerSubscriptions();

      client.dispatchEvent({ type: 'message.new', cid: archived.cid });

      await vi.waitFor(() => {
        expect(paginator.items).toEqual([]);
      });
    });
  });

  describe('event channel.hidden', () => {
    const seed = (paginator: ChannelPaginator, channels: Channel[]) =>
      paginator.setItems({
        valueOrFactory: channels,
        isFirstPage: true,
        isLastPage: true,
      });

    it('drops the channel from lists that exclude hidden channels, keeping it in a hidden-only list', async () => {
      const cid = 'messaging:hidden-1';
      const channel = makeChannel(cid);
      client.activeChannels[cid] = channel;

      const regular = new ChannelPaginator({ client });
      const hiddenOnly = new ChannelPaginator({ client, filters: { hidden: true } });
      seed(regular, [channel]);
      seed(hiddenOnly, [channel]);

      const channelManager = new ChannelManager({
        client,
        paginators: [regular, hiddenOnly],
      });
      channelManager.registerSubscriptions();

      client.dispatchEvent({ type: 'channel.hidden', cid } as const);

      await vi.waitFor(() => {
        // Channel._handleChannelEvent runs before the client listeners, so the filters see the new value
        expect(channel.data?.hidden).toBe(true);
        expect(regular.items).toEqual([]);
        expect(hiddenOnly.items?.map((c) => c.cid)).toEqual([cid]);
      });
    });

    it('re-adds the channel on channel.visible', async () => {
      const cid = 'messaging:hidden-2';
      const channel = makeChannel(cid);
      client.activeChannels[cid] = channel;

      const regular = new ChannelPaginator({ client });
      const channelManager = new ChannelManager({
        client,
        paginators: [regular],
      });
      channelManager.registerSubscriptions();

      client.dispatchEvent({ type: 'channel.hidden', cid } as const);
      await vi.waitFor(() => expect(regular.items ?? []).toEqual([]));

      client.dispatchEvent({ type: 'channel.visible', cid } as const);

      await vi.waitFor(() => {
        expect(channel.data?.hidden).toBe(false);
        expect(regular.items?.map((c) => c.cid)).toEqual([cid]);
      });
    });
  });

  describe('channel resolution from the event', () => {
    it('falls back to event.channel.cid when the event carries no top-level identifiers', async () => {
      const cid = 'messaging:added-1';
      const paginator = new ChannelPaginator({ client });
      const channelManager = new ChannelManager({
        client,
        paginators: [paginator],
      });
      channelManager.registerSubscriptions();

      // notification.added_to_channel has optional cid / channel_type / channel_id — only
      // event.channel is guaranteed
      client.dispatchEvent({
        type: 'notification.added_to_channel',
        channel: { cid, id: 'added-1', type: 'messaging' } as ChannelResponse,
      });

      await vi.waitFor(() => {
        expect(mockGetChannel).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'added-1', type: 'messaging' }),
        );
        expect(paginator.items?.map((c) => c.cid)).toEqual([cid]);
      });
    });

    it('does not query a channel it cannot identify', async () => {
      const paginator = new ChannelPaginator({ client });
      const channelManager = new ChannelManager({
        client,
        paginators: [paginator],
      });
      channelManager.registerSubscriptions();

      client.dispatchEvent({ type: 'notification.added_to_channel' } as never);

      await vi.waitFor(() => {
        expect(mockGetChannel).not.toHaveBeenCalled();
        expect(paginator.items).toBeUndefined();
      });
    });
  });

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

        const channelManager = new ChannelManager({
          client,
          paginators: [p1, p2],
        });
        client.activeChannels[cid] = ch;

        channelManager.registerSubscriptions();
        client.dispatchEvent({ type: eventType, cid } as const);

        await vi.waitFor(() => {
          // The client evicts the channel from activeChannels on
          // notification.removed_from_channel (stream-chat-js #1788), so the
          // channelManager no longer has the instance and removes purely by id.
          expect(r1).toHaveBeenCalledWith({ id: ch.cid, item: undefined });
          expect(r2).toHaveBeenCalledWith({ id: ch.cid, item: undefined });
        });
      });

      it('is a no-op when cid is missing', async () => {
        const channelManager = new ChannelManager({ client });
        const p = new ChannelPaginator({ client });
        const r = vi.spyOn(p, 'removeItem');

        channelManager.insertPaginator({ paginator: p });
        channelManager.registerSubscriptions();

        client.dispatchEvent({ type: eventType } as const); // no cid
        await vi.waitFor(() => {
          expect(r).not.toHaveBeenCalled();
        });
      });

      it('tries to remove non-existent channel from all paginators', async () => {
        const channelManager = new ChannelManager({ client });
        const p = new ChannelPaginator({ client });
        const r = vi.spyOn(p, 'removeItem');

        channelManager.insertPaginator({ paginator: p });
        channelManager.registerSubscriptions();

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
        const channelManager = new ChannelManager({ client });
        const ch = makeChannel('messaging:3');
        client.activeChannels[ch.cid] = ch;

        const p1 = new ChannelPaginator({ client });
        const p2 = new ChannelPaginator({ client });
        p1.state.partialNext({ items: [ch] });
        vi.spyOn(p1, 'locateByItem').mockReturnValue({
          state: { currentIndex: 0, insertionIndex: 1 },
        });
        vi.spyOn(p2, 'locateByItem').mockReturnValue({
          state: { currentIndex: -1, insertionIndex: 1 },
        });
        const partialNextSpy1 = vi.spyOn(p1.state, 'partialNext');
        const partialNextSpy2 = vi.spyOn(p2.state, 'partialNext');

        channelManager.insertPaginator({ paginator: p1 });
        channelManager.registerSubscriptions();

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
      const channelManager = new ChannelManager({ client });
      const ch = makeChannel('messaging:5');
      client.activeChannels[ch.cid] = ch;

      const p = new ChannelPaginator({ client });
      const matchesFilterSpy = vi.spyOn(p, 'matchesFilter').mockReturnValue(true);
      const ingestItemSpy = vi.spyOn(p, 'ingestItem').mockReturnValue(true);
      const removeItemSpy = vi
        .spyOn(p, 'removeItem')
        .mockReturnValue({ state: { currentIndex: 0, insertionIndex: 1 } });

      channelManager.insertPaginator({ paginator: p });
      channelManager.registerSubscriptions();

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
      const channelManager = new ChannelManager({ client });

      const p = new ChannelPaginator({ client });
      const removeItemSpy = vi
        .spyOn(p, 'removeItem')
        .mockReturnValue({ state: { currentIndex: 0, insertionIndex: -1 } });
      const ingestItemSpy = vi.spyOn(p, 'ingestItem').mockReturnValue(true);
      vi.spyOn(p, 'matchesFilter').mockReturnValue(true);
      channelManager.insertPaginator({ paginator: p });
      channelManager.registerSubscriptions();

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
      const channelManager = new ChannelManager({ client });
      const ch = makeChannel('messaging:7');
      client.activeChannels[ch.cid] = ch;

      const p = new ChannelPaginator({ client });

      const removeItemSpy = vi
        .spyOn(p, 'removeItem')
        .mockReturnValue({ state: { currentIndex: 0, insertionIndex: -1 } });
      const ingestItemSpy = vi.spyOn(p, 'ingestItem').mockReturnValue(true);
      vi.spyOn(p, 'matchesFilter').mockReturnValue(true);

      channelManager.insertPaginator({ paginator: p });
      channelManager.registerSubscriptions();

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
      const channelManager = new ChannelManager({ client });
      const ch = makeChannel('messaging:7');
      client.activeChannels[ch.cid] = ch;

      const p = new ChannelPaginator({ client });

      const removeItemSpy = vi
        .spyOn(p, 'removeItem')
        .mockReturnValue({ state: { currentIndex: 0, insertionIndex: -1 } });
      const ingestItemSpy = vi.spyOn(p, 'ingestItem').mockReturnValue(true);
      vi.spyOn(p, 'matchesFilter').mockReturnValue(false);

      channelManager.insertPaginator({ paginator: p });
      channelManager.registerSubscriptions();

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

      const channelManager = new ChannelManager({ client });
      const ch = makeChannel('messaging:5');
      client.activeChannels[ch.cid] = ch;

      const paginator = new ChannelPaginator({ client });
      const matchesFilterSpy = vi.spyOn(paginator, 'matchesFilter').mockReturnValue(true);

      channelManager.insertPaginator({ paginator });
      channelManager.registerSubscriptions();

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

    const channelManager = new ChannelManager({ client });
    const ch = makeChannel('messaging:5');
    client.activeChannels[ch.cid] = ch;

    const paginator = new ChannelPaginator({ client });
    const matchesFilterSpy = vi.spyOn(paginator, 'matchesFilter').mockReturnValue(true);

    channelManager.insertPaginator({ paginator });
    channelManager.registerSubscriptions();

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
      const channelManager = new ChannelManager({ client });

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

      channelManager.insertPaginator({ paginator: p });
      channelManager.registerSubscriptions();

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

  describe('ingestChannel', () => {
    it('ingests a channel into every paginator whose filter it matches', () => {
      const ch = makeChannel('messaging:200');
      const p1 = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const p2 = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const channelManager = new ChannelManager({
        client,
        paginators: [p1, p2],
      });

      channelManager.ingestChannel(ch);

      expect(p1.items?.map((c) => c.cid)).toEqual(['messaging:200']);
      expect(p2.items?.map((c) => c.cid)).toEqual(['messaging:200']);
    });

    it('routes a non-matching channel to a catch-all fallback (lowest priority) and keeps matches in the primary', () => {
      const primary = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const fallback = new ChannelPaginator({ client, filters: {} });
      const channelManager = new ChannelManager({
        client,
        paginators: [primary, fallback],
        ownershipResolver: createPriorityOwnershipResolver([primary.id, fallback.id]),
      });

      channelManager.ingestChannel(makeChannel('messaging:201'));
      channelManager.ingestChannel(makeChannel('team:202'));

      // A channel matching the primary filter is owned by the primary only (higher priority),
      // even though the catch-all fallback also matches it.
      expect(primary.items?.map((c) => c.cid)).toEqual(['messaging:201']);
      // A channel that matches only the catch-all lands in the fallback.
      expect(fallback.items?.map((c) => c.cid)).toEqual(['team:202']);
    });
  });
});
