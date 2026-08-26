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

  describe('client.channelManager', () => {
    it('is instantiated with the client and bound to it', () => {
      const freshClient = getClientWithUser();

      expect(freshClient.channelManager).toBeInstanceOf(ChannelManager);
      expect(freshClient.channelManager.client).toBe(freshClient);
      expect(freshClient.channelManager.paginators).toHaveLength(0);
      // the same instance for the whole client lifetime
      expect(freshClient.channelManager).toBe(freshClient.channelManager);
    });

    it('is configured through its own API, not the client options', () => {
      const archived = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:archived',
      });
      const primary = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:default',
      });
      client.channelManager.insertPaginator({ paginator: primary });
      client.channelManager.insertPaginator({ paginator: archived });
      client.channelManager.setOwnershipResolver([archived.id, primary.id]);

      client.channelManager.ingestChannel(makeChannel('messaging:300'));

      expect(archived.items?.map((c) => c.cid)).toEqual(['messaging:300']);
      expect(primary.items).toBeUndefined();
    });

    // ported from the legacy suite ("should only invoke event handlers if registerSubscriptions has been
    // called" / "should unregister subscriptions if unregisterSubscriptions is called")
    it('handles events only while subscribed', async () => {
      const handler = vi.fn();
      const { channelManager } = client;
      channelManager.setEventHandlers({
        eventType: 'message.new',
        handlers: [{ handle: handler, id: 'test' }],
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
      const { channelManager } = client;

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
      // @ts-expect-error accessing protected property
      const defaultHandlers = ChannelManager.defaultEventHandlers;

      const channelManager = new ChannelManager({
        client,
        paginators: [paginator],
      });

      expect(channelManager.paginators).toHaveLength(1);
      expect(channelManager.getPaginatorById(paginator.id)).toStrictEqual(paginator);
      expect(channelManager.pipelines.size).toBe(Object.keys(defaultHandlers).length);
    });

    it('starts from the default handlers when none are given', () => {
      // @ts-expect-error accessing protected property
      const defaultHandlers = ChannelManager.defaultEventHandlers;
      const channelManager = new ChannelManager({ client });

      for (const [eventType, handlers] of Object.entries(defaultHandlers)) {
        expect(channelManager.pipelines.get(eventType)?.size).toBe(handlers?.length);
      }
    });

    it('replaces the defaults with the handlers given to the constructor', () => {
      const customChannelDeletedHandler = vi.fn();
      const customEventHandler = vi.fn();

      const channelManager = new ChannelManager({
        client,
        eventHandlers: {
          'channel.deleted': [
            { handle: customChannelDeletedHandler, id: 'channel.deleted:custom' },
          ],
          'custom.event': [{ handle: customEventHandler, id: 'custom.event' }],
        },
      });

      // the supplied map is the whole set — defaults not in it are not registered
      expect([...channelManager.pipelines.keys()].sort()).toEqual([
        'channel.deleted',
        'custom.event',
      ]);
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.deleted').handlers[0].id).toBe(
        'channel.deleted:custom',
      );
    });

    it('enriches the defaults when the map is built from getDefaultHandlers()', async () => {
      const extraHandler = vi.fn();
      const eventHandlers = ChannelManager.getDefaultHandlers();
      eventHandlers['channel.visible'] = [
        ...(eventHandlers['channel.visible'] ?? []),
        { handle: extraHandler, id: 'channel.visible:custom' },
      ];

      const channelManager = new ChannelManager({ client, eventHandlers });
      channelManager.registerSubscriptions();

      expect(channelManager.pipelines.get('channel.visible')?.size).toBe(2);

      client.dispatchEvent({ cid: 'messaging:1', type: 'channel.visible' });
      await vi.waitFor(() => expect(extraHandler).toHaveBeenCalledTimes(1));
    });

    it('enriches and replaces the default handlers after construction', () => {
      const customChannelVisibleHandler = vi.fn();
      const customChannelDeletedHandler = vi.fn();
      const customEventHandler = vi.fn();

      // @ts-expect-error accessing protected property
      const defaultHandlers = ChannelManager.defaultEventHandlers;
      const channelManager = new ChannelManager({ client });

      channelManager.addEventHandler({
        eventType: 'channel.visible',
        handle: customChannelVisibleHandler,
        id: 'channel.visible:custom',
      });
      channelManager.setEventHandlers({
        eventType: 'channel.deleted',
        handlers: [{ handle: customChannelDeletedHandler, id: 'channel.deleted:custom' }],
      });
      channelManager.setEventHandlers({
        eventType: 'custom.event',
        handlers: [{ handle: customEventHandler, id: 'custom.event' }],
      });

      expect(channelManager.pipelines.size).toBe(Object.keys(defaultHandlers).length + 1);

      // appended to the default one
      expect(channelManager.pipelines.get('channel.visible')?.size).toBe(2);
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.visible')?.handlers[0].id).toBe(
        'ChannelManager:default-handler:channel.visible',
      );
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.visible')?.handlers[1].id).toBe(
        'channel.visible:custom',
      );

      // replaced the default one
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.deleted').size).toBe(1);
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('channel.deleted').handlers[0].id).toBe(
        'channel.deleted:custom',
      );

      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('custom.event').size).toBe(1);
      // @ts-expect-error accessing protected property
      expect(channelManager.pipelines.get('custom.event').handlers[0].id).toBe(
        'custom.event',
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

      const channelManager = new ChannelManager({ client });

      channelManager.setEventHandlers({
        eventType: 'channel.deleted',
        handlers: [{ handle: customChannelDeletedHandler, id: 'channel.deleted:custom' }],
      });
      channelManager.setEventHandlers({
        eventType: 'custom.event',
        handlers: [{ handle: customEventHandler, id: 'custom.event' }],
      });

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

  describe('setPaginators', () => {
    it('replaces the whole set in a single state update', () => {
      const channelManager = new ChannelManager({ client });
      const p1 = new ChannelPaginator({ client, id: 'channels:1' });
      const p2 = new ChannelPaginator({ client, id: 'channels:2' });
      const p3 = new ChannelPaginator({ client, id: 'channels:3' });
      channelManager.insertPaginator({ paginator: p1 });
      channelManager.insertPaginator({ paginator: p2 });
      const nextSpy = vi.spyOn(channelManager.state, 'partialNext');

      channelManager.setPaginators([p2, p3]);

      expect(channelManager.paginators).toStrictEqual([p2, p3]);
      expect(nextSpy).toHaveBeenCalledTimes(1);
    });

    it('detaches the paginators that are no longer in the set', () => {
      const kept = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:kept',
      });
      const dropped = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:dropped',
      });
      const channelManager = new ChannelManager({
        client,
        ownershipResolver: [kept.id, dropped.id],
        paginators: [kept, dropped],
      });
      const cancelSpy = vi.spyOn(dropped, 'cancelScheduledQuery');
      const channel = makeChannel('messaging:600');
      expect(dropped.filterQueryResults([channel])).toEqual([]);

      channelManager.setPaginators([kept]);

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      // its own (unfiltered) implementation is back
      expect(dropped.filterQueryResults([channel])).toEqual([channel]);
      // the kept one still filters by ownership
      expect(channelManager.paginators).toStrictEqual([kept]);
    });

    it('applies ownership filtering to newly added paginators', () => {
      const primary = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:default',
      });
      const secondary = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:secondary',
      });
      const channelManager = new ChannelManager({
        client,
        ownershipResolver: [primary.id, secondary.id],
      });

      channelManager.setPaginators([primary, secondary]);

      const channel = makeChannel('messaging:601');
      expect(primary.filterQueryResults([channel])).toEqual([channel]);
      expect(secondary.filterQueryResults([channel])).toEqual([]);
    });

    it('does not publish a state update when the set is unchanged', () => {
      const p1 = new ChannelPaginator({ client, id: 'channels:1' });
      const p2 = new ChannelPaginator({ client, id: 'channels:2' });
      const channelManager = new ChannelManager({ client, paginators: [p1, p2] });
      const nextSpy = vi.spyOn(channelManager.state, 'partialNext');

      channelManager.setPaginators([p1, p2]);

      // same paginators in the same order — subscribers must not be handed a new array
      expect(nextSpy).not.toHaveBeenCalled();
      expect(channelManager.paginators).toStrictEqual([p1, p2]);

      // reordering is a change
      channelManager.setPaginators([p2, p1]);
      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(channelManager.paginators).toStrictEqual([p2, p1]);
    });

    it('keeps only the first occurrence of a repeated id', () => {
      const channelManager = new ChannelManager({ client });
      const first = new ChannelPaginator({ client, id: 'channels:dup' });
      const duplicate = new ChannelPaginator({ client, id: 'channels:dup' });
      const other = new ChannelPaginator({ client, id: 'channels:other' });

      channelManager.setPaginators([first, other, duplicate]);

      expect(channelManager.paginators).toStrictEqual([first, other]);
    });

    it('clears all the lists when given an empty array', () => {
      const paginator = new ChannelPaginator({ client });
      const channelManager = new ChannelManager({ client, paginators: [paginator] });

      channelManager.setPaginators([]);

      expect(channelManager.paginators).toEqual([]);
      expect(channelManager.getPaginatorById(paginator.id)).toBeUndefined();
    });

    it('excludes the detached paginators from event handling', async () => {
      const kept = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const dropped = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const channelManager = new ChannelManager({
        client,
        paginators: [kept, dropped],
      });
      channelManager.registerSubscriptions();
      const channel = makeChannel('messaging:602');
      client.activeChannels[channel.cid] = channel;

      channelManager.setPaginators([kept]);
      client.dispatchEvent({ type: 'message.new', cid: channel.cid });

      await vi.waitFor(() => {
        expect(kept.items?.map((c) => c.cid)).toEqual(['messaging:602']);
      });
      expect(dropped.items).toBeUndefined();
    });
  });

  describe('resetPaginatorStates', () => {
    it('discards the loaded data of every list but keeps them registered', () => {
      const p1 = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:1',
      });
      const p2 = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:2',
      });
      const channelManager = new ChannelManager({ client, paginators: [p1, p2] });
      channelManager.ingestChannel(makeChannel('messaging:800'));
      expect(p1.items).toHaveLength(1);
      expect(p2.items).toHaveLength(1);

      channelManager.resetPaginatorStates();

      // "never queried" — the state a fresh paginator starts in
      expect(p1.items).toBeUndefined();
      expect(p2.items).toBeUndefined();
      expect(channelManager.paginators).toStrictEqual([p1, p2]);
    });

    it('cancels the queries the lists had scheduled', () => {
      const paginator = new ChannelPaginator({ client });
      const channelManager = new ChannelManager({ client, paginators: [paginator] });
      const cancelSpy = vi.spyOn(paginator, 'cancelScheduledQuery');

      channelManager.resetPaginatorStates();

      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps the ownership rules applied to the reset lists', () => {
      const primary = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:default',
      });
      const secondary = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:secondary',
      });
      const channelManager = new ChannelManager({
        client,
        ownershipResolver: [primary.id, secondary.id],
        paginators: [primary, secondary],
      });

      channelManager.resetPaginatorStates();

      const channel = makeChannel('messaging:801');
      expect(primary.filterQueryResults([channel])).toEqual([channel]);
      expect(secondary.filterQueryResults([channel])).toEqual([]);
    });

    it('is called by client.disconnectUser, which leaves the lists registered', async () => {
      const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      client.channelManager.insertPaginator({ paginator });
      client.channelManager.ingestChannel(makeChannel('messaging:802'));
      client.mutedChannels = [{ channel: { cid: 'messaging:802' } }] as any;
      expect(paginator.items).toHaveLength(1);

      await client.disconnectUser();

      expect(paginator.items).toBeUndefined();
      expect(client.channelManager.paginators).toStrictEqual([paginator]);
      // per-user data that would otherwise leak into the next connection
      expect(client.mutedChannels).toEqual([]);
    });
  });

  describe('clearPaginators', () => {
    it('detaches every list and returns them', () => {
      const p1 = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:1',
      });
      const p2 = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:2',
      });
      const channelManager = new ChannelManager({
        client,
        ownershipResolver: [p1.id, p2.id],
        paginators: [p1, p2],
      });
      const cancelSpy = vi.spyOn(p2, 'cancelScheduledQuery');
      const channel = makeChannel('messaging:700');
      expect(p2.filterQueryResults([channel])).toEqual([]);

      expect(channelManager.clearPaginators()).toStrictEqual([p1, p2]);

      expect(channelManager.paginators).toEqual([]);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(p2.filterQueryResults([channel])).toEqual([channel]);
    });

    it('does not publish a state update on an empty manager', () => {
      const channelManager = new ChannelManager({ client });
      const nextSpy = vi.spyOn(channelManager.state, 'partialNext');

      expect(channelManager.clearPaginators()).toEqual([]);

      expect(channelManager.paginators).toEqual([]);
      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe('removePaginator', () => {
    it('removes a paginator by instance and returns it', () => {
      const channelManager = new ChannelManager({ client });
      const p1 = new ChannelPaginator({ client });
      const p2 = new ChannelPaginator({ client });
      channelManager.insertPaginator({ paginator: p1 });
      channelManager.insertPaginator({ paginator: p2 });

      expect(channelManager.removePaginator(p1)).toBe(p1);

      expect(channelManager.paginators.map((p) => p.id)).toEqual([p2.id]);
      expect(channelManager.getPaginatorById(p1.id)).toBeUndefined();
    });

    it('removes a paginator by id', () => {
      const channelManager = new ChannelManager({ client });
      const paginator = new ChannelPaginator({ client, id: 'channels:default' });
      channelManager.insertPaginator({ paginator });

      expect(channelManager.removePaginator('channels:default')).toBe(paginator);
      expect(channelManager.paginators).toHaveLength(0);
    });

    it('is a no-op for an unknown paginator', () => {
      const channelManager = new ChannelManager({ client });
      const paginator = new ChannelPaginator({ client });
      channelManager.insertPaginator({ paginator });
      const nextSpy = vi.spyOn(channelManager.state, 'partialNext');

      expect(channelManager.removePaginator('nope')).toBeUndefined();
      expect(channelManager.removePaginator(new ChannelPaginator({ client }))).toBe(
        undefined,
      );

      expect(nextSpy).not.toHaveBeenCalled();
      expect(channelManager.paginators).toStrictEqual([paginator]);
    });

    it('cancels a query scheduled by the removed paginator', () => {
      const channelManager = new ChannelManager({ client });
      const paginator = new ChannelPaginator({ client });
      const cancelSpy = vi.spyOn(paginator, 'cancelScheduledQuery');
      channelManager.insertPaginator({ paginator });

      channelManager.removePaginator(paginator);

      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });

    it('stops applying ownership rules to the removed paginator', () => {
      const primary = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:default',
      });
      const secondary = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:secondary',
      });
      const channelManager = new ChannelManager({
        client,
        ownershipResolver: [primary.id, secondary.id],
        paginators: [primary, secondary],
      });
      const channel = makeChannel('messaging:400');

      // while managed, the lower-priority paginator does not get to keep the channel
      expect(secondary.filterQueryResults([channel])).toEqual([]);

      channelManager.removePaginator(secondary);

      // detached: its own (unfiltered) implementation is back
      expect(secondary.filterQueryResults([channel])).toEqual([channel]);
    });

    it('leaves the loaded items of the removed paginator untouched', () => {
      const channelManager = new ChannelManager({ client });
      const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      channelManager.insertPaginator({ paginator });
      const channel = makeChannel('messaging:401');
      channelManager.ingestChannel(channel);
      expect(paginator.items).toHaveLength(1);

      channelManager.removePaginator(paginator);

      expect(paginator.items?.map((c) => c.cid)).toEqual(['messaging:401']);
    });

    it('excludes the removed paginator from event handling', async () => {
      const channelManager = new ChannelManager({ client });
      const kept = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const removed = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      channelManager.insertPaginator({ paginator: kept });
      channelManager.insertPaginator({ paginator: removed });
      channelManager.registerSubscriptions();

      const channel = makeChannel('messaging:402');
      client.activeChannels[channel.cid] = channel;

      channelManager.removePaginator(removed);
      client.dispatchEvent({ type: 'message.new', cid: channel.cid });

      await vi.waitFor(() => {
        expect(kept.items?.map((c) => c.cid)).toEqual(['messaging:402']);
      });
      expect(removed.items).toBeUndefined();
    });

    it('can be re-inserted after removal', () => {
      const channelManager = new ChannelManager({ client });
      const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      channelManager.insertPaginator({ paginator });
      channelManager.removePaginator(paginator);

      channelManager.insertPaginator({ paginator });
      channelManager.ingestChannel(makeChannel('messaging:403'));

      expect(channelManager.paginators.map((p) => p.id)).toEqual([paginator.id]);
      expect(paginator.items?.map((c) => c.cid)).toEqual(['messaging:403']);
    });
  });

  describe('setOwnershipResolver', () => {
    it('applies a priority list set after construction', () => {
      const primary = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:default',
      });
      const fallback = new ChannelPaginator({ client, filters: {}, id: 'channels:open' });
      const channelManager = new ChannelManager({
        client,
        paginators: [primary, fallback],
      });

      channelManager.setOwnershipResolver([primary.id, fallback.id]);
      channelManager.ingestChannel(makeChannel('messaging:404'));

      expect(primary.items?.map((c) => c.cid)).toEqual(['messaging:404']);
      expect(fallback.items).toBeUndefined();
    });

    it('reverts to keeping a channel in every matching paginator when unset', () => {
      const p1 = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const p2 = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      const channelManager = new ChannelManager({
        client,
        ownershipResolver: [p1.id, p2.id],
        paginators: [p1, p2],
      });

      channelManager.setOwnershipResolver();
      channelManager.ingestChannel(makeChannel('messaging:405'));

      expect(p1.items?.map((c) => c.cid)).toEqual(['messaging:405']);
      expect(p2.items?.map((c) => c.cid)).toEqual(['messaging:405']);
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
        user: { id: client.userId as string },
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
    // The manager never boosts by default on ANY event — the sort is the single source of truth for
    // order. A new message bumps last_message_at and the sort relocates the channel on its own (see the
    // in-place relocate fix 60566820); an added / unhidden channel likewise relocates via its sort key.
    // Boosting stays a public per-paginator primitive integrators can opt into (see ChannelManager.updateLists).
    'notification.added_to_channel',
    'channel.visible',
    'message.new',
    'notification.message_new',
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

  // Archiving a channel routes it into the archived list through a WS event. That list may never
  // have been queried, so the channel is parked in a logical interval — and its own first query
  // must then reconcile that interval instead of leaving the channel stored twice (once pending,
  // once in the loaded page), which is what renders as a duplicate row.
  describe('a channel ingested before the list was ever queried', () => {
    const intervalHomes = (paginator: ChannelPaginator, cid: string) =>
      // @ts-expect-error accessing protected property
      Array.from(paginator._itemIntervals.values()).filter((itv) =>
        itv.itemIds.includes(cid),
      );

    const setupNeverQueriedList = (queryResult: Channel[]) => {
      const paginator = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:archived',
      });
      const channelManager = new ChannelManager({ client, paginators: [paginator] });
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: queryResult,
        duration: '0.1ms',
      } as never);
      return { channelManager, paginator };
    };

    it('stores the channel once when its own first query returns it', async () => {
      const ingested = makeChannel('messaging:archived-1');
      const other = makeChannel('messaging:archived-2');
      const { channelManager, paginator } = setupNeverQueriedList([ingested, other]);

      channelManager.ingestChannel(ingested); // → logical interval, items = [ingested]
      expect(paginator.items?.map((c) => c.cid)).toEqual([ingested.cid]);

      await paginator.toTail();

      expect(intervalHomes(paginator, ingested.cid)).toHaveLength(1);
      expect(paginator.items?.map((c) => c.cid)).toEqual([ingested.cid, other.cid]);
    });

    // The real-world path: the archived list is visited while empty (a query that returns nothing
    // records the query shape but creates no interval), then a channel is archived into it and the
    // list queries again — with an unchanged shape, so that query is a continuation.
    it('stores the channel once when the list was first queried while empty', async () => {
      const ingested = makeChannel('messaging:archived-1');
      const { channelManager, paginator } = setupNeverQueriedList([]);

      await paginator.toTail(); // empty archived list
      expect(paginator.items).toEqual([]);

      channelManager.ingestChannel(ingested);
      vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue({
        channels: [ingested],
        duration: '0.1ms',
      } as never);
      await paginator.toTail();

      expect(intervalHomes(paginator, ingested.cid)).toHaveLength(1);
      expect(paginator.items?.map((c) => c.cid)).toEqual([ingested.cid]);
    });

    it('stores the channel once when the queried page does not contain it', async () => {
      const ingested = makeChannel('messaging:archived-1');
      const other = makeChannel('messaging:archived-2');
      const { channelManager, paginator } = setupNeverQueriedList([other]);

      channelManager.ingestChannel(ingested);

      await paginator.toTail();

      expect(intervalHomes(paginator, ingested.cid)).toHaveLength(1);
    });
  });

  // Pinning writes `pinned_at` into the live `Channel` the list already holds (the manager sees the
  // channel only afterwards, through `member.updated`), so the loaded page is momentarily unsorted
  // at that channel's slot. Relocating it must still work — and it has to work from EVERY position,
  // because only the slots the insertion binary-search probes ever compared the channel with
  // itself, which made the failure look intermittent (a channel at index 2 of 10 stayed put while
  // one at index 4 moved).
  describe('event member.updated: pinned channel', () => {
    const PAGE_SIZE = 10;

    const setupPinnedList = () => {
      const paginator = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        id: 'channels:default',
        sort: [
          { direction: -1, field: 'pinned_at' },
          { direction: -1, field: 'last_message_at' },
        ],
      });
      // channels ordered by last_message_at desc, none pinned
      const channels = Array.from({ length: PAGE_SIZE }, (_, i) => {
        const channel = makeChannel(`messaging:pin-${i}`);
        channel.messagePaginator.aggregateState.partialNext({
          seededLastMessageAt: new Date(Date.UTC(2026, 0, PAGE_SIZE - i)),
        });
        client.activeChannels[channel.cid] = channel;
        return channel;
      });
      paginator.setItems({
        isFirstPage: true,
        isLastPage: true,
        valueOrFactory: channels,
      });

      const channelManager = new ChannelManager({ client, paginators: [paginator] });
      channelManager.registerSubscriptions();
      return { channelManager, channels, paginator };
    };

    it.each(Array.from({ length: PAGE_SIZE }, (_, index) => index))(
      'moves the channel pinned at index %i to the top of the list',
      async (index) => {
        const { channels, paginator } = setupPinnedList();
        const pinned = channels[index];

        // what `member.updated` does to the live channel before the manager is notified
        pinned.state.membership = {
          ...pinned.state.membership,
          pinned_at: new Date().toISOString(),
        };
        client.dispatchEvent({
          cid: pinned.cid,
          member: { pinned_at: new Date().toISOString(), user: { id: client.userId } },
          type: 'member.updated',
        } as any);

        await vi.waitFor(() => {
          expect(paginator.items?.[0]?.cid).toBe(pinned.cid);
        });
        // and the rest keeps its relative order
        expect(paginator.items?.map((c) => c.cid)).toEqual([
          pinned.cid,
          ...channels.filter((c) => c.cid !== pinned.cid).map((c) => c.cid),
        ]);
      },
    );

    it.each(Array.from({ length: PAGE_SIZE }, (_, index) => index))(
      'returns the channel unpinned at index %i to its place in the list',
      async (index) => {
        const { channels, paginator } = setupPinnedList();
        const target = channels[index];

        target.state.membership = {
          ...target.state.membership,
          pinned_at: new Date().toISOString(),
        };
        client.dispatchEvent({
          cid: target.cid,
          member: { pinned_at: new Date().toISOString(), user: { id: client.userId } },
          type: 'member.updated',
        } as any);
        await vi.waitFor(() => expect(paginator.items?.[0]?.cid).toBe(target.cid));

        target.state.membership = { ...target.state.membership, pinned_at: undefined };
        client.dispatchEvent({
          cid: target.cid,
          member: { user: { id: client.userId } },
          type: 'member.updated',
        } as any);

        await vi.waitFor(() => {
          expect(paginator.items?.map((c) => c.cid)).toEqual(channels.map((c) => c.cid));
        });
      },
    );
  });

  describe('event notification.channel_mutes_updated', () => {
    const muteChannels = (cids: string[]) => ({
      me: { channel_mutes: cids.map((cid) => ({ channel: { cid } })) },
      type: 'notification.channel_mutes_updated' as const,
    });

    const setupMuteLists = () => {
      const unmuted = new ChannelPaginator({
        client,
        filters: { muted: false, type: 'messaging' },
        id: 'channels:default',
      });
      const muted = new ChannelPaginator({
        client,
        filters: { muted: true, type: 'messaging' },
        id: 'channels:muted',
      });
      const channelManager = new ChannelManager({
        client,
        paginators: [unmuted, muted],
      });
      channelManager.registerSubscriptions();
      return { channelManager, muted, unmuted };
    };

    it('moves a newly muted channel to the list filtering muted channels', async () => {
      const { muted, unmuted } = setupMuteLists();
      const channel = makeChannel('messaging:500');
      client.activeChannels[channel.cid] = channel;
      unmuted.setItems({ isLastPage: true, valueOrFactory: [channel] });
      muted.setItems({ isLastPage: true, valueOrFactory: [] });

      client.dispatchEvent(muteChannels([channel.cid]) as any);

      await vi.waitFor(() => {
        expect(muted.items?.map((c) => c.cid)).toEqual([channel.cid]);
        expect(unmuted.items).toEqual([]);
      });
    });

    it('moves an unmuted channel back to the list filtering unmuted channels', async () => {
      const { muted, unmuted } = setupMuteLists();
      const channel = makeChannel('messaging:501');
      client.activeChannels[channel.cid] = channel;
      client.mutedChannels = [{ channel: { cid: channel.cid } }] as any;
      unmuted.setItems({ isLastPage: true, valueOrFactory: [] });
      muted.setItems({ isLastPage: true, valueOrFactory: [channel] });

      // the event carries the mutes that remain — an empty list means everything got unmuted
      client.dispatchEvent(muteChannels([]) as any);

      await vi.waitFor(() => {
        expect(unmuted.items?.map((c) => c.cid)).toEqual([channel.cid]);
        expect(muted.items).toEqual([]);
      });
    });

    it('re-evaluates every loaded channel only once', async () => {
      const { channelManager, muted, unmuted } = setupMuteLists();
      const first = makeChannel('messaging:502');
      const second = makeChannel('messaging:503');
      // the same channel is loaded in both lists — it must not be ingested twice
      unmuted.setItems({ isLastPage: true, valueOrFactory: [first, second] });
      muted.setItems({ isLastPage: true, valueOrFactory: [first] });
      const ingestSpy = vi.spyOn(channelManager, 'ingestChannel');

      client.dispatchEvent(muteChannels([]) as any);

      await vi.waitFor(() => {
        expect(ingestSpy).toHaveBeenCalledTimes(2);
      });
      expect(ingestSpy.mock.calls.map(([channel]) => channel.cid)).toEqual([
        first.cid,
        second.cid,
      ]);
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
  // A channel becoming read has to leave an unread list, and the offset has to follow it.
  describe('read state events', () => {
    const seedUnread = (channel: Channel, unreadMessages = 1) => {
      channel.state.read = {
        [client.userId as string]: {
          last_read: new Date(0),
          unread_messages: unreadMessages,
          user: { id: client.userId as string },
        },
      };
    };

    const loadedUnreadList = (channel: Channel) => {
      client.activeChannels[channel.cid] = channel;
      const paginator = new ChannelPaginator({ client, filters: { has_unread: true } });
      paginator.setItems({ valueOrFactory: [channel], isFirstPage: true });
      const channelManager = new ChannelManager({ client, paginators: [paginator] });
      channelManager.registerSubscriptions();
      return { channelManager, paginator };
    };

    const markReadEvent = (channel: Channel, payload = {}) => ({
      channel_id: channel.id,
      channel_type: channel.type,
      cid: channel.cid,
      created_at: new Date(),
      type: 'notification.mark_read' as const,
      user: { id: client.userId as string },
      ...payload,
    });

    it('drops a channel the user read elsewhere, and shrinks the offset with it', async () => {
      const channel = makeChannel('messaging:300');
      seedUnread(channel);
      const { paginator } = loadedUnreadList(channel);

      expect(paginator.items).toHaveLength(1);
      expect(paginator.offset).toBe(1);

      client.dispatchEvent(markReadEvent(channel));

      await vi.waitFor(() => {
        expect(paginator.items).toHaveLength(0);
        expect(paginator.offset).toBe(0);
      });
    });

    it('puts a channel back when it is marked unread again', async () => {
      const channel = makeChannel('messaging:301');
      seedUnread(channel, 0);
      client.activeChannels[channel.cid] = channel;
      const paginator = new ChannelPaginator({ client, filters: { has_unread: true } });
      paginator.setItems({ valueOrFactory: [], isFirstPage: true });
      new ChannelManager({ client, paginators: [paginator] }).registerSubscriptions();

      seedUnread(channel, 1);
      client.dispatchEvent(
        markReadEvent(channel, { type: 'notification.mark_unread' as const }),
      );

      await vi.waitFor(() => {
        expect(paginator.items?.map((c) => c.cid)).toEqual([channel.cid]);
      });
    });

    it('ignores a read receipt from another member', async () => {
      const channel = makeChannel('messaging:302');
      seedUnread(channel);
      const { paginator } = loadedUnreadList(channel);
      const ingest = vi.spyOn(paginator, 'ingestItem');

      client.dispatchEvent({
        channel_id: channel.id,
        channel_type: channel.type,
        cid: channel.cid,
        created_at: new Date(),
        type: 'message.read',
        user: { id: 'somebody-else' },
      });

      await vi.waitFor(() => {
        expect(ingest).not.toHaveBeenCalled();
        expect(paginator.items).toHaveLength(1);
      });
    });

    it('ignores a thread being read', async () => {
      const channel = makeChannel('messaging:303');
      seedUnread(channel);
      const { paginator } = loadedUnreadList(channel);

      client.dispatchEvent(markReadEvent(channel, { thread_id: 'thread-1' }));

      await vi.waitFor(() => {
        expect(paginator.items).toHaveLength(1);
        expect(paginator.offset).toBe(1);
      });
    });

    it('does nothing when the event names no channel', async () => {
      const channel = makeChannel('messaging:308');
      seedUnread(channel);
      const { paginator } = loadedUnreadList(channel);
      const ingest = vi.spyOn(paginator, 'ingestItem');
      const remove = vi.spyOn(paginator, 'removeItem');

      // a mark-all-read; without a target there is nothing to route, so the list is left as it is and
      // reconciles on the next event naming a channel, or the next query
      seedUnread(channel, 0);
      client.dispatchEvent({
        created_at: new Date(),
        type: 'notification.mark_read',
        unread_channels: 0,
        user: { id: client.userId as string },
      });

      await vi.waitFor(() => {
        expect(ingest).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(paginator.items).toHaveLength(1);
      });
    });

    it('drops every channel the client marked read, not only the one the event names', async () => {
      const named = makeChannel('messaging:310');
      const other = makeChannel('messaging:311');
      seedUnread(named);
      seedUnread(other);
      client.activeChannels[named.cid] = named;
      client.activeChannels[other.cid] = other;

      // the client reconciles the lists it owns, so this one is registered on `client.channelManager`
      const paginator = new ChannelPaginator({ client, filters: { has_unread: true } });
      paginator.setItems({ valueOrFactory: [named, other], isFirstPage: true });
      client.channelManager.insertPaginator({ paginator });
      client.channelManager.registerSubscriptions();

      // `unread_channels: 0` makes the client zero every active channel, so both stop matching
      client.dispatchEvent(markReadEvent(named, { unread_channels: 0 }));

      await vi.waitFor(() => {
        expect(paginator.items).toHaveLength(0);
        expect(paginator.offset).toBe(0);
      });
    });

    it('drops channels a mark-all-read leaves read, though it names none', async () => {
      const channel = makeChannel('messaging:312');
      seedUnread(channel);
      client.activeChannels[channel.cid] = channel;

      const paginator = new ChannelPaginator({ client, filters: { has_unread: true } });
      paginator.setItems({ valueOrFactory: [channel], isFirstPage: true });
      client.channelManager.insertPaginator({ paginator });
      client.channelManager.registerSubscriptions();

      client.dispatchEvent({
        created_at: new Date(),
        type: 'notification.mark_read',
        unread_channels: 0,
        user: { id: client.userId as string },
      });

      await vi.waitFor(() => {
        expect(paginator.items).toHaveLength(0);
        expect(paginator.offset).toBe(0);
      });
    });

    it('skips lists that neither filter nor sort on read state', async () => {
      const channel = makeChannel('messaging:313');
      seedUnread(channel);
      client.activeChannels[channel.cid] = channel;

      const plainList = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      plainList.setItems({ valueOrFactory: [channel], isFirstPage: true });
      new ChannelManager({ client, paginators: [plainList] }).registerSubscriptions();

      const ingest = vi.spyOn(plainList, 'ingestItem');
      const remove = vi.spyOn(plainList, 'removeItem');

      client.dispatchEvent(markReadEvent(channel));

      await vi.waitFor(() => {
        // nothing here is derived from read state, so the read never reaches this list
        expect(ingest).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(plainList.items?.map((c) => c.cid)).toEqual([channel.cid]);
      });
    });

    it('still routes to a list that only sorts on read state', async () => {
      const channel = makeChannel('messaging:314');
      seedUnread(channel);
      client.activeChannels[channel.cid] = channel;

      const sortedList = new ChannelPaginator({
        client,
        filters: { type: 'messaging' },
        sort: [{ direction: -1, field: 'unread_count' }],
      });
      sortedList.setItems({ valueOrFactory: [channel], isFirstPage: true });
      new ChannelManager({ client, paginators: [sortedList] }).registerSubscriptions();

      const ingest = vi.spyOn(sortedList, 'ingestItem');

      client.dispatchEvent(markReadEvent(channel));

      // still matches, but its sort key changed, so it has to be re-placed
      await vi.waitFor(() => {
        expect(ingest).toHaveBeenCalledOnce();
      });
    });

    it('does not fetch a channel this client never loaded', async () => {
      const channel = makeChannel('messaging:305');
      seedUnread(channel);
      const { paginator } = loadedUnreadList(channel);
      delete client.activeChannels['messaging:306'];

      client.dispatchEvent({
        channel_id: '306',
        channel_type: 'messaging',
        cid: 'messaging:306',
        created_at: new Date(),
        type: 'notification.mark_read',
        user: { id: client.userId as string },
      });

      await vi.waitFor(() => {
        expect(mockGetChannel).not.toHaveBeenCalled();
        expect(paginator.items).toHaveLength(1);
      });
    });
  });
});
