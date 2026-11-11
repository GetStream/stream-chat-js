import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Event,
  EventType,
  ScheduledMessagePaginator,
  ScheduledMessagePaginatorsManager,
  ScheduledMessageResponse,
  StreamChat,
} from '../../../src';
import { msToNs, nowNs } from '../../../src/utils/time';
import { getClientWithUser } from '../test-utils/getClient';
import { generateAPIError } from '../test-utils/generateAPIError';

const cid = 'messaging:general';
const otherCid = 'messaging:random';

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> = {},
): ScheduledMessageResponse => {
  const now = nowNs();
  return {
    id: `sm-${Math.random().toString(36).slice(2)}`,
    cid,
    user: { id: 'user1' },
    message: { text: 'see you tomorrow' },
    scheduled_at: msToNs(Date.now() + 60 * 60 * 1000),
    status: 'scheduled',
    created_at: now,
    updated_at: now,
    ...data,
  } as ScheduledMessageResponse;
};

const generateEvent = (
  type: EventType,
  scheduled_message: ScheduledMessageResponse,
  extra: Record<string, unknown> = {},
) =>
  ({
    type,
    cid: scheduled_message.cid,
    created_at: nowNs(),
    user: scheduled_message.user,
    scheduled_message,
    ...extra,
  }) as never;

const at = (second: number) => msToNs(Date.UTC(2030, 0, 1, 0, 0, second));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const queryResponse = (scheduled_messages: ScheduledMessageResponse[], next?: string) =>
  ({ scheduled_messages, next, duration: '' }) as never;

/** A client with two registered lists: all scheduled messages, and the failed ones. */
const setup = () => {
  const client = getClientWithUser({ id: 'user1' }) as StreamChat;
  const manager = client.scheduledMessagePaginators;
  vi.spyOn(client, 'queryScheduledMessages').mockResolvedValue(queryResponse([]));
  const all = new ScheduledMessagePaginator({ client, id: 'all' });
  const failed = new ScheduledMessagePaginator({
    client,
    filter: { status: ['failed'] },
    id: 'failed',
  });
  manager.setPaginators([all, failed]);
  return { all, client, failed, manager };
};

const drainPipelines = async (manager: ScheduledMessagePaginatorsManager) => {
  const pipelines = Array.from(manager.pipelines.values());
  await Promise.all(pipelines.map((pipeline) => pipeline.drain()));
};

const dispatchEvent = async (client: StreamChat, event: Event) => {
  client.dispatchEvent(event);
  await drainPipelines(client.scheduledMessagePaginators);
};

const itemsOf = (paginator: ScheduledMessagePaginator) => paginator.items ?? [];

const loadAll = (manager: ScheduledMessagePaginatorsManager) =>
  Promise.all(manager.paginators.map((paginator) => paginator.toTail()));

describe('ScheduledMessagePaginatorsManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is created by the client with no lists and a shared store', () => {
    const client = getClientWithUser({ id: 'user1' }) as StreamChat;

    expect(client.scheduledMessagePaginators).toBeInstanceOf(
      ScheduledMessagePaginatorsManager,
    );
    expect(client.scheduledMessagePaginators.state.getLatestValue()).toEqual({
      isDisabled: false,
      paginators: [],
    });
    expect(client.scheduledMessageStore.values()).toEqual([]);
  });

  describe('registered lists', () => {
    it('keeps a list held twice by ID once', () => {
      const { client, manager } = setup();
      const again = new ScheduledMessagePaginator({ client, id: 'all' });

      manager.setPaginators([again, again]);

      expect(manager.paginators).toEqual([again]);
    });

    it('does not publish an unchanged set of lists', () => {
      const { all, failed, manager } = setup();
      const before = manager.state.getLatestValue();

      manager.setPaginators([all, failed]);

      expect(manager.state.getLatestValue()).toBe(before);
    });

    it('inserts a list at an index and moves one already held', () => {
      const { all, client, failed, manager } = setup();
      const channelOnly = new ScheduledMessagePaginator({
        client,
        filter: { cid },
        id: 'channel',
      });

      manager.insertPaginator({ index: 1, paginator: channelOnly });
      expect(manager.paginators).toEqual([all, channelOnly, failed]);

      manager.insertPaginator({ index: 0, paginator: failed });
      expect(manager.paginators).toEqual([failed, all, channelOnly]);
    });

    it('removes a list by instance or by ID', () => {
      const { all, failed, manager } = setup();

      expect(manager.removePaginator('failed')).toBe(failed);
      expect(manager.removePaginator(all)).toBe(all);
      expect(manager.removePaginator('missing')).toBeUndefined();
      expect(manager.paginators).toEqual([]);
    });

    it('clears every list and returns them', () => {
      const { all, failed, manager } = setup();

      expect(manager.clearPaginators()).toEqual([all, failed]);
      expect(manager.paginators).toEqual([]);
    });

    it('finds a list by ID', () => {
      const { failed, manager } = setup();

      expect(manager.getPaginatorById('failed')).toBe(failed);
    });

    it('stops updating a list once it is removed', async () => {
      const { all, client, manager } = setup();
      manager.registerSubscriptions();
      await all.toTail();
      manager.removePaginator(all);

      await dispatchEvent(
        client,
        generateEvent('scheduled_message.created', generateScheduledMessage()),
      );

      expect(itemsOf(all)).toEqual([]);
    });
  });

  describe('events', () => {
    it.each(['scheduled_message.created', 'scheduled_message.updated'] as EventType[])(
      'lists the message of %s in the lists it matches',
      async (type) => {
        const { all, client, failed, manager } = setup();
        manager.registerSubscriptions();
        await loadAll(manager);
        const sm = generateScheduledMessage();

        await dispatchEvent(client, generateEvent(type, sm));

        expect(itemsOf(all)).toEqual([sm]);
        expect(itemsOf(failed)).toEqual([]);
        expect(client.scheduledMessageStore.get(sm.id)).toEqual(sm);
      },
    );

    it('hears about messages of channels the client has not loaded', async () => {
      const { all, client, manager } = setup();
      manager.registerSubscriptions();
      await all.toTail();
      const sm = generateScheduledMessage({ cid: 'messaging:never-loaded' });

      await dispatchEvent(client, generateEvent('scheduled_message.created', sm));

      expect(client.channelManager.get('messaging:never-loaded')).toBeUndefined();
      expect(itemsOf(all)).toEqual([sm]);
    });

    it("leaves a channel's own list to the channel", async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const channelList = client.channel(
        'messaging',
        'general',
      ).scheduledMessagesPaginator;
      const ingestSpy = vi.spyOn(channelList, 'ingestItem');
      const sm = generateScheduledMessage();

      manager.ingest(sm);

      expect(ingestSpy).not.toHaveBeenCalled();
    });

    it('moves a message into the failed list on scheduled_message.failed', async () => {
      const { all, client, failed, manager } = setup();
      manager.registerSubscriptions();
      await loadAll(manager);
      const sm = generateScheduledMessage({ updated_at: at(0) });
      manager.ingest(sm);

      await dispatchEvent(
        client,
        generateEvent('scheduled_message.failed', {
          ...sm,
          failure_reason: 'channel_frozen',
          status: 'failed',
          updated_at: at(10),
        }),
      );

      expect(itemsOf(failed)).toEqual([
        expect.objectContaining({ failure_reason: 'channel_frozen', status: 'failed' }),
      ]);
      expect(itemsOf(all)).toEqual(itemsOf(failed));
    });

    it('keeps a message awaiting a send retry as sending', async () => {
      const { all, client, manager } = setup();
      manager.registerSubscriptions();
      await all.toTail();
      const sm = generateScheduledMessage();
      manager.ingest(sm);

      await dispatchEvent(
        client,
        generateEvent('scheduled_message.updated', { ...sm, status: 'sending' }),
      );

      expect(itemsOf(all)).toEqual([expect.objectContaining({ status: 'sending' })]);
    });

    it.each([
      ['scheduled_message.sent', 'scheduled'],
      ['scheduled_message.deleted', 'scheduled'],
    ] as const)(
      'removes the message on %s, whatever status the payload carries',
      async (type, payloadStatus) => {
        const { all, client, manager } = setup();
        manager.registerSubscriptions();
        await all.toTail();
        const sm = generateScheduledMessage();
        manager.ingest(sm);

        await dispatchEvent(
          client,
          generateEvent(type as EventType, { ...sm, status: payloadStatus }),
        );

        expect(itemsOf(all)).toEqual([]);
        expect(client.scheduledMessageStore.get(sm.id)).toBeUndefined();
      },
    );

    it('ignores events before registerSubscriptions and after unregistering', async () => {
      const { all, client, manager } = setup();
      await all.toTail();
      const sm = generateScheduledMessage();

      await dispatchEvent(client, generateEvent('scheduled_message.created', sm));
      expect(itemsOf(all)).toEqual([]);

      manager.registerSubscriptions();
      manager.unregisterSubscriptions();
      await dispatchEvent(client, generateEvent('scheduled_message.created', sm));
      expect(itemsOf(all)).toEqual([]);
    });
  });

  describe('ordering', () => {
    it('lists pending scheduled messages before failed ones, each by scheduled_at', async () => {
      const { all, manager } = setup();
      await all.toTail();
      const failedSooner = generateScheduledMessage({
        scheduled_at: at(10),
        status: 'failed',
      });
      const sending = generateScheduledMessage({
        scheduled_at: at(30),
        status: 'sending',
      });
      const scheduled = generateScheduledMessage({ scheduled_at: at(20) });

      [failedSooner, sending, scheduled].forEach(manager.ingest);

      expect(itemsOf(all)).toEqual([scheduled, sending, failedSooner]);
    });

    it('breaks scheduled_at ties by id', async () => {
      const { all, manager } = setup();
      await all.toTail();
      const b = generateScheduledMessage({ id: 'b', scheduled_at: at(10) });
      const a = generateScheduledMessage({ id: 'a', scheduled_at: at(10) });

      [b, a].forEach(manager.ingest);

      expect(itemsOf(all)).toEqual([a, b]);
    });

    it('lists every scheduled message added to a list that loaded empty', async () => {
      const { all, manager } = setup();
      await all.toTail();
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const later = generateScheduledMessage({ scheduled_at: at(20) });
      const failed = generateScheduledMessage({ scheduled_at: at(5), status: 'failed' });

      [sooner, later, failed].forEach(manager.ingest);

      expect(itemsOf(all)).toEqual([sooner, later, failed]);
    });

    it('lists every scheduled message added to a list emptied by removals', async () => {
      const { all, manager } = setup();
      await all.toTail();
      const removed = generateScheduledMessage({ scheduled_at: at(10) });
      manager.ingest(removed);
      manager.ingest({ ...removed, status: 'canceled' });
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const later = generateScheduledMessage({ scheduled_at: at(20) });

      [sooner, later].forEach(manager.ingest);

      expect(itemsOf(all)).toEqual([sooner, later]);
    });

    it('moves a rescheduled message', async () => {
      const { all, manager } = setup();
      await all.toTail();
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const later = generateScheduledMessage({ scheduled_at: at(20) });
      [sooner, later].forEach(manager.ingest);

      const rescheduled = { ...sooner, scheduled_at: at(25), updated_at: nowNs() };
      manager.ingest(rescheduled);

      expect(itemsOf(all)).toEqual([later, rescheduled]);
    });
  });

  describe('queries', () => {
    it('loads up to 100 active scheduled messages of all channels', async () => {
      const { all, client } = setup();
      const loaded = [
        generateScheduledMessage({ scheduled_at: at(10) }),
        generateScheduledMessage({ cid: otherCid, scheduled_at: at(20) }),
      ];
      const querySpy = vi
        .spyOn(client, 'queryScheduledMessages')
        .mockResolvedValue(queryResponse(loaded, 'cursor'));

      await all.toTail();

      expect(querySpy).toHaveBeenCalledWith({
        filter: {},
        limit: 100,
      });
      expect(itemsOf(all)).toEqual(loaded);
      expect(all.hasMoreTail).toBe(true);
      expect(all.isLoading).toBe(false);
    });

    it('queries with the filter of the list', async () => {
      const { client, failed } = setup();
      const querySpy = vi.mocked(client.queryScheduledMessages);

      await failed.toTail();

      expect(querySpy).toHaveBeenCalledWith({
        filter: { status: ['failed'] },
        limit: 100,
      });
    });

    it('resets the list when its filter changes and loads it with the new one', async () => {
      const { all, client } = setup();
      const pending = generateScheduledMessage();
      const failedOne = generateScheduledMessage({ status: 'failed' });
      vi.mocked(client.queryScheduledMessages).mockResolvedValueOnce(
        queryResponse([pending]),
      );
      await all.toTail();

      all.filter = { status: ['failed'] };

      expect(all.items).toBeUndefined();
      vi.mocked(client.queryScheduledMessages).mockResolvedValueOnce(
        queryResponse([failedOne]),
      );
      await all.reload();
      expect(client.queryScheduledMessages).toHaveBeenLastCalledWith({
        filter: { status: ['failed'] },
        limit: 100,
      });
      expect(itemsOf(all)).toEqual([failedOne]);
      await dispatchEvent(
        client,
        generateEvent('scheduled_message.updated', { ...pending, updated_at: at(59) }),
      );
      expect(itemsOf(all)).toEqual([failedOne]);
    });

    it('loads the next page with the cursor of the previous one', async () => {
      const { all, client } = setup();
      const first = generateScheduledMessage({ scheduled_at: at(10) });
      const second = generateScheduledMessage({ scheduled_at: at(20) });
      const querySpy = vi
        .spyOn(client, 'queryScheduledMessages')
        .mockResolvedValueOnce(queryResponse([first], 'cursor'))
        .mockResolvedValueOnce(queryResponse([second]));

      await all.toTail();
      await all.toTail();

      expect(querySpy).toHaveBeenLastCalledWith({
        filter: {},
        limit: 100,
        next: 'cursor',
      });
      expect(itemsOf(all)).toEqual([first, second]);
      expect(all.hasMoreTail).toBe(false);
    });

    it('does not list sent or canceled scheduled messages returned by a query', async () => {
      const { all, client } = setup();
      const active = generateScheduledMessage();
      const sent = generateScheduledMessage({ status: 'sent' });
      vi.spyOn(client, 'queryScheduledMessages').mockResolvedValue(
        queryResponse([active, sent]),
      );

      await all.toTail();

      expect(itemsOf(all)).toEqual([active]);
    });

    it('shares a queried message with the other lists holding it', async () => {
      const { all, client, failed } = setup();
      const sm = generateScheduledMessage({ status: 'failed', updated_at: at(0) });
      vi.spyOn(client, 'queryScheduledMessages').mockResolvedValue(queryResponse([sm]));
      await all.toTail();
      await failed.toTail();
      const edited = { ...sm, message: { text: 'edited' }, updated_at: at(10) };
      vi.spyOn(client, 'queryScheduledMessages').mockResolvedValue(
        queryResponse([edited]),
      );

      await all.reload();

      expect(itemsOf(failed)).toEqual([edited]);
      expect(itemsOf(all)[0]).toBe(itemsOf(failed)[0]);
    });

    it('keeps the error of a failed query', async () => {
      const { all, client, manager } = setup();
      const error = new Error('boom');
      vi.spyOn(client, 'queryScheduledMessages').mockRejectedValue(error);

      await all.toTail();

      expect(all.lastQueryError).toBe(error);
      expect(manager.isDisabled).toBe(false);
    });

    it('marks the feature disabled when a registered list fails with error 114', async () => {
      const { all, client, manager } = setup();
      vi.spyOn(client, 'queryScheduledMessages').mockRejectedValue(
        generateAPIError(114, 'scheduled_messages_disabled'),
      );

      await all.toTail();

      expect(manager.isDisabled).toBe(true);
    });

    it('clears the disabled flag after a successful query', async () => {
      const { all, client, manager } = setup();
      vi.spyOn(client, 'queryScheduledMessages')
        .mockRejectedValueOnce(generateAPIError(114))
        .mockResolvedValueOnce(queryResponse([]));

      await all.toTail();
      await all.reload();

      expect(manager.isDisabled).toBe(false);
    });

    it('clears the disabled flag when the failing list is removed', async () => {
      const { all, client, manager } = setup();
      vi.spyOn(client, 'queryScheduledMessages').mockRejectedValue(generateAPIError(114));
      await all.toTail();

      manager.removePaginator(all);

      expect(manager.isDisabled).toBe(false);
    });
  });

  describe('stale copies', () => {
    const setupLoaded = async () => {
      const context = setup();
      context.manager.registerSubscriptions();
      await context.all.toTail();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      context.manager.ingest(sm);
      return { ...context, sm };
    };

    it('takes a newer copy over the stored one', async () => {
      const { all, client, sm } = await setupLoaded();
      const newer = { ...sm, message: { text: 'newer' }, updated_at: at(20) };

      await dispatchEvent(client, generateEvent('scheduled_message.updated', newer));
      await dispatchEvent(
        client,
        generateEvent('scheduled_message.updated', { ...sm, updated_at: at(10) }),
      );

      expect(itemsOf(all)).toEqual([newer]);
    });

    it('applies a copy with the same updated_at', async () => {
      const { all, manager, sm } = await setupLoaded();

      manager.ingest({ ...sm, status: 'sending' });

      expect(itemsOf(all)).toEqual([expect.objectContaining({ status: 'sending' })]);
    });

    it('lists a canceled message scheduled again under the same ID', async () => {
      const { all, client, sm } = await setupLoaded();
      await dispatchEvent(
        client,
        generateEvent('scheduled_message.deleted', { ...sm, updated_at: at(10) }),
      );
      const scheduledAgain = { ...sm, message: { text: 'again' }, updated_at: at(20) };

      await dispatchEvent(
        client,
        generateEvent('scheduled_message.created', scheduledAgain),
      );

      expect(itemsOf(all)).toEqual([scheduledAgain]);
    });

    it('does not list a canceled message again from a stale query page', async () => {
      const { all, client, sm } = await setupLoaded();
      await dispatchEvent(
        client,
        generateEvent('scheduled_message.deleted', { ...sm, updated_at: at(10) }),
      );
      vi.mocked(client.queryScheduledMessages).mockResolvedValue(queryResponse([sm]));

      await all.reload();

      expect(itemsOf(all)).toEqual([]);
    });

    it('does not list a sent message again from a query page', async () => {
      const { all, client, sm } = await setupLoaded();
      await dispatchEvent(
        client,
        generateEvent('scheduled_message.sent', { ...sm, updated_at: at(20) }),
      );
      vi.mocked(client.queryScheduledMessages).mockResolvedValue(queryResponse([sm]));

      await all.reload();

      expect(itemsOf(all)).toEqual([]);
    });

    it('does not bring back a message sent while a query is in flight', async () => {
      const { all, client, sm } = await setupLoaded();
      const response = deferred<unknown>();
      vi.spyOn(client, 'queryScheduledMessages').mockReturnValue(
        response.promise as never,
      );

      const loading = all.reload();
      await dispatchEvent(client, generateEvent('scheduled_message.sent', sm));
      response.resolve(queryResponse([sm]));
      await loading;

      expect(itemsOf(all)).toEqual([]);
    });

    it('keeps a failure received while a query is in flight', async () => {
      const { all, client, sm } = await setupLoaded();
      const response = deferred<unknown>();
      vi.spyOn(client, 'queryScheduledMessages').mockReturnValue(
        response.promise as never,
      );

      const loading = all.reload();
      await dispatchEvent(
        client,
        generateEvent('scheduled_message.failed', {
          ...sm,
          status: 'failed',
          updated_at: at(20),
        }),
      );
      response.resolve(queryResponse([sm]));
      await loading;

      expect(itemsOf(all)).toEqual([expect.objectContaining({ status: 'failed' })]);
    });

    it('keeps a message created while the first query is in flight', async () => {
      const { all, client, manager } = setup();
      const response = deferred<unknown>();
      vi.spyOn(client, 'queryScheduledMessages').mockReturnValue(
        response.promise as never,
      );

      const loading = all.toTail();
      const fresh = generateScheduledMessage();
      manager.ingest(fresh);
      response.resolve(queryResponse([]));
      await loading;

      expect(itemsOf(all)).toEqual([fresh]);
      expect(all.logicalHeadItems).toEqual([]);
    });

    it('drops a message missing from a reload', async () => {
      const { all, client } = setup();
      const gone = generateScheduledMessage();
      vi.spyOn(client, 'queryScheduledMessages')
        .mockResolvedValueOnce(queryResponse([gone]))
        .mockResolvedValueOnce(queryResponse([]));
      await all.toTail();

      await all.reload();

      expect(itemsOf(all)).toEqual([]);
    });
  });

  describe('connection recovery', () => {
    const reconnect = (client: StreamChat) => {
      client.wsConnection._setStatus({ isHealthy: false });
      client.wsConnection._setStatus({ isHealthy: true, connectionId: 'reconnected' });
    };

    it('does not query when subscriptions are registered', () => {
      const { client, manager } = setup();

      manager.registerSubscriptions();

      expect(client.queryScheduledMessages).not.toHaveBeenCalled();
    });

    it('reloads the registered lists that had loaded after a reconnect', async () => {
      const { all, client, manager } = setup();
      manager.registerSubscriptions();
      await all.toTail();
      const querySpy = vi.mocked(client.queryScheduledMessages);
      querySpy.mockClear();

      reconnect(client);

      await vi.waitFor(() => expect(querySpy).toHaveBeenCalledTimes(1));
      expect(querySpy).toHaveBeenCalledWith(expect.objectContaining({ filter: {} }));
    });

    it('does not reload anything when connection recovery is turned off', async () => {
      const { all, client, manager } = setup();
      manager.registerSubscriptions();
      await all.toTail();
      client.connectionRecovery.updateConfig({ enabled: false });
      const querySpy = vi.mocked(client.queryScheduledMessages);
      querySpy.mockClear();
      const recovered = new Promise((resolve) =>
        client.on('connection.recovered', resolve),
      );

      reconnect(client);
      await recovered;

      expect(querySpy).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('empties the lists, keeps them registered and clears the store', async () => {
      const { all, client, failed, manager } = setup();
      await all.toTail();
      manager.ingest(generateScheduledMessage());
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);

      await client.disconnectUser();

      expect(manager.paginators).toEqual([all, failed]);
      expect(all.items).toBeUndefined();
      expect(client.scheduledMessageStore.values()).toEqual([]);
    });

    it('lists a message sent before the logout again for the next user', async () => {
      const { all, client, manager } = setup();
      await all.toTail();
      const sm = generateScheduledMessage();
      manager.ingest({ ...sm, status: 'sent' });
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);
      await client.disconnectUser();
      await all.toTail();

      manager.ingest(sm);

      expect(itemsOf(all)).toEqual([sm]);
    });
  });

  describe('event handlers', () => {
    it('handles the scheduled message events with labeled defaults', () => {
      const { manager } = setup();

      const handlerIds = Array.from(manager.pipelines.entries()).map(
        ([eventType, pipeline]) => [
          eventType,
          pipeline.findIndex({
            idMatch: {
              id: `ScheduledMessagePaginatorsManager:default-handler:${eventType}`,
            },
          }),
        ],
      );

      expect(Object.fromEntries(handlerIds)).toEqual({
        'scheduled_message.created': 0,
        'scheduled_message.deleted': 0,
        'scheduled_message.failed': 0,
        'scheduled_message.sent': 0,
        'scheduled_message.updated': 0,
      });
    });

    it('returns a copy of the default handlers', () => {
      const defaultHandlers = ScheduledMessagePaginatorsManager.getDefaultHandlers();
      defaultHandlers['scheduled_message.created']?.splice(0);

      expect(
        ScheduledMessagePaginatorsManager.getDefaultHandlers()[
          'scheduled_message.created'
        ],
      ).toHaveLength(1);
    });

    it('replaces the default handlers with the ones passed to the constructor', async () => {
      const { all, client } = setup();
      await all.toTail();
      const manager = new ScheduledMessagePaginatorsManager({
        client,
        eventHandlers: {},
      });
      manager.setPaginators([all]);
      manager.registerSubscriptions();

      client.dispatchEvent(
        generateEvent('scheduled_message.created', generateScheduledMessage()),
      );

      expect(manager.pipelines.size).toBe(0);
      expect(itemsOf(all)).toEqual([]);
    });

    it('stops the default handler from an added handler until it is unsubscribed', async () => {
      const { all, client, manager } = setup();
      manager.registerSubscriptions();
      await all.toTail();
      const ignored = generateScheduledMessage({ cid: otherCid });
      const unsubscribe = manager.addEventHandler({
        eventType: 'scheduled_message.created',
        handle: ({ event }) =>
          event.scheduled_message?.cid === otherCid ? { action: 'stop' } : undefined,
        index: 0,
      });

      await dispatchEvent(client, generateEvent('scheduled_message.created', ignored));
      expect(itemsOf(all)).toEqual([]);

      unsubscribe();
      await dispatchEvent(client, generateEvent('scheduled_message.created', ignored));
      expect(itemsOf(all)).toEqual([ignored]);
    });

    it('lets a replaced handler keep failed messages out of the lists', async () => {
      const { all, client, manager } = setup();
      manager.registerSubscriptions();
      await all.toTail();
      const sm = generateScheduledMessage();
      manager.ingest(sm);
      manager.setEventHandlers({
        eventType: 'scheduled_message.failed',
        handlers: [
          {
            handle: ({ ctx: { scheduledMessagePaginators }, event }) => {
              if (event.scheduled_message) {
                scheduledMessagePaginators.ingest({
                  ...event.scheduled_message,
                  status: 'canceled',
                });
              }
            },
            id: 'app:drop-failed',
          },
        ],
      });

      await dispatchEvent(
        client,
        generateEvent('scheduled_message.failed', { ...sm, status: 'failed' }),
      );

      expect(itemsOf(all)).toEqual([]);
    });
  });
});
