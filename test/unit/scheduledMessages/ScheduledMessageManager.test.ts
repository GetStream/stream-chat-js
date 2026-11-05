import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EventType,
  ScheduledMessageManager,
  ScheduledMessagePaginator,
  ScheduledMessageResponse,
  StreamChat,
} from '../../../src';
import { msToNs, nowNs, nsToDate } from '../../../src/utils/time';
import { getClientWithUser } from '../test-utils/getClient';
import { generateAPIError } from '../test-utils/generateAPIError';

const cid = 'messaging:general';
const otherCid = 'messaging:random';

const ACTIVE_STATUSES = ['scheduled', 'sending', 'failed'];

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

const setup = () => {
  const client = getClientWithUser({ id: 'user1' }) as StreamChat;
  const manager = client.scheduledMessages;
  vi.spyOn(client, 'queryScheduledMessages').mockResolvedValue(queryResponse([]));
  return { client, manager };
};

const itemsOf = (paginator: ScheduledMessagePaginator) => paginator.items ?? [];

const loadAll = (manager: ScheduledMessageManager) =>
  Promise.all(manager.paginators.map((paginator) => paginator.toTail()));

describe('ScheduledMessageManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is created by the client with an empty list of all scheduled messages', () => {
    const { manager } = setup();

    expect(manager).toBeInstanceOf(ScheduledMessageManager);
    expect(manager.paginator).toBeInstanceOf(ScheduledMessagePaginator);
    expect(manager.paginator.cid).toBeUndefined();
    expect(itemsOf(manager.paginator)).toEqual([]);
    expect(manager.paginators).toEqual([manager.paginator]);
    expect(manager.state.getLatestValue()).toEqual({ isDisabled: false });
  });

  describe('state', () => {
    it('upserts and removes scheduled messages', () => {
      const { manager } = setup();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);
      expect(manager.getFromState(sm.id)).toBe(sm);
      expect(itemsOf(manager.paginator)).toEqual([sm]);

      const edited = { ...sm, message: { text: 'edited' } };
      manager.upsertToState(edited);
      expect(manager.getFromState(sm.id)).toBe(edited);
      expect(itemsOf(manager.paginator)).toEqual([edited]);

      manager.removeFromState(sm.id);
      expect(manager.getFromState(sm.id)).toBeUndefined();
      expect(itemsOf(manager.paginator)).toEqual([]);
    });

    it('removes instead of storing canceled and sent scheduled messages', () => {
      const { manager } = setup();
      const canceled = generateScheduledMessage();
      const sent = generateScheduledMessage();
      manager.upsertToState(canceled);
      manager.upsertToState(sent);

      manager.upsertToState({ ...canceled, status: 'canceled' });
      manager.upsertToState({ ...sent, status: 'sent' });

      expect(manager.getFromState(canceled.id)).toBeUndefined();
      expect(manager.getFromState(sent.id)).toBeUndefined();
      expect(itemsOf(manager.paginator)).toEqual([]);
    });

    it('does not bring back a removed scheduled message', () => {
      const { manager } = setup();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);
      manager.removeFromState(sm.id);

      manager.upsertToState(sm);

      expect(manager.getFromState(sm.id)).toBeUndefined();
      expect(itemsOf(manager.paginator)).toEqual([]);
    });

    it('is reset when the user disconnects', async () => {
      const { client, manager } = setup();
      const channelPaginator = manager.getChannelPaginator(cid);
      manager.upsertToState(generateScheduledMessage());
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);

      await client.disconnectUser();

      expect(manager.store.values()).toEqual([]);
      expect(itemsOf(manager.paginator)).toEqual([]);
      expect(manager.paginators).toEqual([manager.paginator]);
      expect(manager.getChannelPaginator(cid)).not.toBe(channelPaginator);
    });
  });

  describe('paginators', () => {
    const populate = async () => {
      const { client, manager } = setup();
      const channelPaginator = manager.getChannelPaginator(cid);
      const otherChannelPaginator = manager.getChannelPaginator(otherCid);
      await loadAll(manager);
      const later = generateScheduledMessage({ scheduled_at: at(20) });
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const reply = generateScheduledMessage({
        scheduled_at: at(30),
        message: { text: 'reply', parent_id: 'parent' },
      });
      const elsewhere = generateScheduledMessage({ cid: otherCid, scheduled_at: at(15) });
      [later, reply, elsewhere, sooner].forEach(manager.upsertToState);
      return {
        channelPaginator,
        client,
        elsewhere,
        later,
        manager,
        otherChannelPaginator,
        reply,
        sooner,
      };
    };

    it('returns one paginator per channel', () => {
      const { manager } = setup();

      const channelPaginator = manager.getChannelPaginator(cid);

      expect(channelPaginator.cid).toBe(cid);
      expect(manager.getChannelPaginator(cid)).toBe(channelPaginator);
      expect(manager.paginators).toEqual([manager.paginator, channelPaginator]);
    });

    it('lists the scheduled messages of each channel, thread replies included', async () => {
      const { channelPaginator, elsewhere, later, otherChannelPaginator, reply, sooner } =
        await populate();

      expect(itemsOf(channelPaginator)).toEqual([sooner, later, reply]);
      expect(itemsOf(otherChannelPaginator)).toEqual([elsewhere]);
    });

    it('lists the scheduled messages of all channels', async () => {
      const { elsewhere, later, manager, reply, sooner } = await populate();

      expect(itemsOf(manager.paginator)).toEqual([sooner, elsewhere, later, reply]);
    });

    it('lists pending scheduled messages before failed ones', async () => {
      const { manager } = setup();
      await loadAll(manager);
      const failedSooner = generateScheduledMessage({
        scheduled_at: at(10),
        status: 'failed',
      });
      const sending = generateScheduledMessage({
        scheduled_at: at(30),
        status: 'sending',
      });
      const scheduled = generateScheduledMessage({ scheduled_at: at(20) });
      [failedSooner, sending, scheduled].forEach(manager.upsertToState);

      expect(itemsOf(manager.paginator)).toEqual([scheduled, sending, failedSooner]);
    });

    it('breaks scheduled_at ties by id', async () => {
      const { manager } = setup();
      await loadAll(manager);
      const b = generateScheduledMessage({ id: 'b', scheduled_at: at(10) });
      const a = generateScheduledMessage({ id: 'a', scheduled_at: at(10) });
      [b, a].forEach(manager.upsertToState);

      expect(itemsOf(manager.paginator)).toEqual([a, b]);
    });

    it('lists every scheduled message added to a list that loaded empty', async () => {
      const { manager } = setup();
      await loadAll(manager);
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const later = generateScheduledMessage({ scheduled_at: at(20) });
      const failed = generateScheduledMessage({ scheduled_at: at(5), status: 'failed' });

      [sooner, later, failed].forEach(manager.upsertToState);

      expect(itemsOf(manager.paginator)).toEqual([sooner, later, failed]);
    });

    it('lists every scheduled message added to a list emptied by removals', async () => {
      const { manager } = setup();
      await loadAll(manager);
      const removed = generateScheduledMessage({ scheduled_at: at(10) });
      manager.upsertToState(removed);
      manager.removeFromState(removed.id);
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const later = generateScheduledMessage({ scheduled_at: at(20) });

      [sooner, later].forEach(manager.upsertToState);

      expect(itemsOf(manager.paginator)).toEqual([sooner, later]);
    });

    it('moves a rescheduled message in every list that holds it', async () => {
      const { channelPaginator, elsewhere, later, manager, reply, sooner } =
        await populate();

      const rescheduled = { ...sooner, scheduled_at: at(25), updated_at: nowNs() };
      manager.upsertToState(rescheduled);

      expect(itemsOf(channelPaginator)).toEqual([later, rescheduled, reply]);
      expect(itemsOf(manager.paginator)).toEqual([elsewhere, later, rescheduled, reply]);
    });

    it('moves a failed message behind the pending ones in every list', async () => {
      const { channelPaginator, later, manager, reply, sooner } = await populate();

      const failed = { ...sooner, status: 'failed' as const, updated_at: nowNs() };
      manager.upsertToState(failed);

      expect(itemsOf(channelPaginator)).toEqual([later, reply, failed]);
      expect(manager.getFromState(sooner.id)).toBe(failed);
    });

    it('does not republish the list of a channel when another channel changes', async () => {
      const { elsewhere, manager, channelPaginator } = await populate();
      const channelItems = channelPaginator.items;

      manager.upsertToState({ ...elsewhere, message: { text: 'edited' } });
      manager.upsertToState(generateScheduledMessage({ cid: otherCid }));
      manager.removeFromState(elsewhere.id);

      expect(channelPaginator.items).toBe(channelItems);
    });

    it('removes a scheduled message from every list that holds it', async () => {
      const { channelPaginator, later, manager, reply, sooner } = await populate();

      manager.removeFromState(sooner.id);

      expect(itemsOf(channelPaginator)).toEqual([later, reply]);
      expect(itemsOf(manager.paginator)).not.toContain(sooner);
    });
  });

  describe('hydration', () => {
    it('replaces the scheduled messages of a channel', async () => {
      const { manager } = setup();
      const channelPaginator = manager.getChannelPaginator(cid);
      await loadAll(manager);
      const stale = generateScheduledMessage();
      const elsewhere = generateScheduledMessage({ cid: otherCid });
      manager.upsertToState(stale);
      manager.upsertToState(elsewhere);

      const fresh = generateScheduledMessage();
      manager.hydrateChannelState(cid, [fresh]);

      expect(itemsOf(channelPaginator)).toEqual([fresh]);
      expect(manager.getFromState(stale.id)).toBeUndefined();
      expect(itemsOf(manager.paginator)).toEqual(
        expect.arrayContaining([fresh, elsewhere]),
      );
      expect(itemsOf(manager.paginator)).toHaveLength(2);
    });

    it('keeps the scheduled messages when the channel response has no field for them', () => {
      const { manager } = setup();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);

      manager.hydrateChannelState(cid, undefined);

      expect(manager.getFromState(sm.id)).toBe(sm);
    });

    it('empties the channel when the channel response has an empty list', () => {
      const { manager } = setup();
      const channelPaginator = manager.getChannelPaginator(cid);
      manager.upsertToState(generateScheduledMessage());

      manager.hydrateChannelState(cid, []);

      expect(itemsOf(channelPaginator)).toEqual([]);
    });

    it('fills a channel list opened later without querying it', async () => {
      const { client, manager } = setup();
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const later = generateScheduledMessage({ scheduled_at: at(20) });
      manager.hydrateChannelState(cid, [later, sooner]);
      manager.hydrateChannelState(otherCid, [
        generateScheduledMessage({ cid: otherCid }),
      ]);

      const channelPaginator = manager.getChannelPaginator(cid);

      expect(itemsOf(channelPaginator)).toEqual([sooner, later]);
      expect(channelPaginator.hasMoreTail).toBe(false);
      await channelPaginator.toTail();
      expect(client.queryScheduledMessages).not.toHaveBeenCalled();
    });

    it('queries a channel list opened after the socket dropped since the hydration', async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      manager.hydrateChannelState(cid, [generateScheduledMessage()]);
      client.wsConnection._setStatus({ isHealthy: false });
      client.wsConnection._setStatus({ isHealthy: true });

      const channelPaginator = manager.getChannelPaginator(cid);
      await channelPaginator.toTail();

      expect(client.queryScheduledMessages).toHaveBeenCalledTimes(1);
    });

    it('does not store finished scheduled messages of the channel response', () => {
      const { manager } = setup();
      const sent = generateScheduledMessage({ status: 'sent' });

      manager.hydrateChannelState(cid, [sent]);

      expect(manager.getFromState(sent.id)).toBeUndefined();
    });
  });

  describe('events', () => {
    it.each(['scheduled_message.created', 'scheduled_message.updated'] as EventType[])(
      'upserts on %s',
      (type) => {
        const { client, manager } = setup();
        manager.registerSubscriptions();
        const sm = generateScheduledMessage();

        client.dispatchEvent(generateEvent(type, sm));

        expect(manager.getFromState(sm.id)).toEqual(sm);
        expect(itemsOf(manager.paginator)).toEqual([sm]);
      },
    );

    it('keeps a message awaiting a send retry as sending', () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);

      client.dispatchEvent(
        generateEvent('scheduled_message.updated', { ...sm, status: 'sending' }),
      );

      expect(manager.getFromState(sm.id)?.status).toBe('sending');
      expect(itemsOf(manager.paginator)).toHaveLength(1);
    });

    it('marks the scheduled message failed on scheduled_message.failed', () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);

      client.dispatchEvent(
        generateEvent('scheduled_message.failed', {
          ...sm,
          status: 'failed',
          failure_reason: 'channel_frozen',
        }),
      );

      expect(manager.getFromState(sm.id)).toEqual(
        expect.objectContaining({ status: 'failed', failure_reason: 'channel_frozen' }),
      );
    });

    it('removes on scheduled_message.sent', () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);

      client.dispatchEvent(
        generateEvent(
          'scheduled_message.sent',
          { ...sm, status: 'sent' },
          { message_id: 'final-message-id' },
        ),
      );

      expect(manager.getFromState(sm.id)).toBeUndefined();
      expect(itemsOf(manager.paginator)).toEqual([]);
    });

    it('removes on scheduled_message.deleted', () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);

      client.dispatchEvent(
        generateEvent('scheduled_message.deleted', { ...sm, status: 'canceled' }),
      );

      expect(manager.getFromState(sm.id)).toBeUndefined();
      expect(itemsOf(manager.paginator)).toEqual([]);
    });

    it('ignores scheduled message events before registerSubscriptions and after unregistering', () => {
      const { client, manager } = setup();
      const sm = generateScheduledMessage();

      client.dispatchEvent(generateEvent('scheduled_message.created', sm));
      expect(manager.getFromState(sm.id)).toBeUndefined();

      manager.registerSubscriptions();
      manager.unregisterSubscriptions();
      client.dispatchEvent(generateEvent('scheduled_message.created', sm));
      expect(manager.getFromState(sm.id)).toBeUndefined();
    });
  });

  describe('connection recovery', () => {
    it('does not query when subscriptions are registered', () => {
      const { client, manager } = setup();

      manager.registerSubscriptions();

      expect(client.queryScheduledMessages).not.toHaveBeenCalled();
    });

    it('reloads the loaded lists once the connection is recovered', async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const channelPaginator = manager.getChannelPaginator(cid);
      manager.getChannelPaginator(otherCid);
      await manager.paginator.toTail();
      await channelPaginator.toTail();
      const querySpy = vi.mocked(client.queryScheduledMessages);
      querySpy.mockClear();

      client.dispatchEvent({ type: 'connection.recovered' });

      await vi.waitFor(() => expect(querySpy).toHaveBeenCalledTimes(2));
      expect(querySpy).toHaveBeenCalledWith(
        expect.objectContaining({ filter: { status: ACTIVE_STATUSES } }),
      );
      expect(querySpy).toHaveBeenCalledWith(
        expect.objectContaining({ filter: { cid, status: ACTIVE_STATUSES } }),
      );
    });
  });

  describe('queries', () => {
    it('loads up to 100 active scheduled messages of all channels', async () => {
      const { client, manager } = setup();
      const loaded = [
        generateScheduledMessage({ scheduled_at: at(10) }),
        generateScheduledMessage({ scheduled_at: at(20) }),
      ];
      const querySpy = vi
        .spyOn(client, 'queryScheduledMessages')
        .mockResolvedValue(queryResponse(loaded, 'cursor'));

      await manager.paginator.toTail();

      expect(querySpy).toHaveBeenCalledWith({
        filter: { status: ACTIVE_STATUSES },
        limit: 100,
      });
      expect(itemsOf(manager.paginator)).toEqual(loaded);
      expect(manager.paginator.hasMoreTail).toBe(true);
      expect(manager.paginator.isLoading).toBe(false);
    });

    it('loads the scheduled messages of one channel', async () => {
      const { client, manager } = setup();
      const querySpy = vi.mocked(client.queryScheduledMessages);

      await manager.getChannelPaginator(cid).toTail();

      expect(querySpy).toHaveBeenCalledWith({
        filter: { cid, status: ACTIVE_STATUSES },
        limit: 100,
      });
    });

    it('loads the next page with the cursor of the previous one', async () => {
      const { client, manager } = setup();
      const first = generateScheduledMessage({ scheduled_at: at(10) });
      const second = generateScheduledMessage({ scheduled_at: at(20) });
      const querySpy = vi
        .spyOn(client, 'queryScheduledMessages')
        .mockResolvedValueOnce(queryResponse([first], 'cursor'))
        .mockResolvedValueOnce(queryResponse([second]));

      await manager.paginator.toTail();
      await manager.paginator.toTail();

      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(querySpy).toHaveBeenLastCalledWith({
        filter: { status: ACTIVE_STATUSES },
        limit: 100,
        next: 'cursor',
      });
      expect(itemsOf(manager.paginator)).toEqual([first, second]);
      expect(manager.paginator.hasMoreTail).toBe(false);
    });

    it('does not list finished scheduled messages returned by a query', async () => {
      const { client, manager } = setup();
      const active = generateScheduledMessage();
      const sent = generateScheduledMessage({ status: 'sent' });
      vi.spyOn(client, 'queryScheduledMessages').mockResolvedValue(
        queryResponse([active, sent]),
      );

      await manager.paginator.toTail();

      expect(itemsOf(manager.paginator)).toEqual([active]);
    });

    it('shares the queried scheduled message with the other lists', async () => {
      const { client, manager } = setup();
      const channelPaginator = manager.getChannelPaginator(cid);
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);
      const edited = { ...sm, message: { text: 'edited' }, updated_at: nowNs() };
      vi.spyOn(client, 'queryScheduledMessages').mockResolvedValue(
        queryResponse([edited]),
      );

      await manager.paginator.toTail();

      expect(itemsOf(channelPaginator)).toEqual([edited]);
      expect(itemsOf(manager.paginator)[0]).toBe(itemsOf(channelPaginator)[0]);
    });

    it('keeps the error of a failed query', async () => {
      const { client, manager } = setup();
      const error = new Error('boom');
      vi.spyOn(client, 'queryScheduledMessages').mockRejectedValue(error);

      await manager.paginator.toTail();

      expect(manager.paginator.lastQueryError).toBe(error);
      expect(manager.paginator.isLoading).toBe(false);
      expect(manager.state.getLatestValue().isDisabled).toBe(false);
    });

    it('marks the feature disabled when a query fails with error 114', async () => {
      const { client, manager } = setup();
      vi.spyOn(client, 'queryScheduledMessages').mockRejectedValue(
        generateAPIError(114, 'scheduled_messages_disabled'),
      );

      await manager.getChannelPaginator(cid).toTail();

      expect(manager.state.getLatestValue().isDisabled).toBe(true);
    });

    it('clears the disabled flag after a successful query', async () => {
      const { client, manager } = setup();
      vi.spyOn(client, 'queryScheduledMessages')
        .mockRejectedValueOnce(generateAPIError(114))
        .mockResolvedValueOnce(queryResponse([]));

      await manager.paginator.toTail();
      await manager.paginator.reload();

      expect(manager.state.getLatestValue().isDisabled).toBe(false);
      expect(manager.paginator.lastQueryError).toBeUndefined();
    });

    it('does not mark the feature disabled for other errors', async () => {
      const { client, manager } = setup();
      vi.spyOn(client, 'queryScheduledMessages').mockRejectedValue(generateAPIError(4));

      await manager.paginator.toTail();

      expect(manager.state.getLatestValue().isDisabled).toBe(false);
    });
  });

  describe('API', () => {
    it('updates a scheduled message and stores the result', async () => {
      const { client, manager } = setup();
      const sm = generateScheduledMessage();
      const updated = { ...sm, scheduled_at: msToNs(Date.parse('2030-01-01T00:00:00Z')) };
      const spy = vi
        .spyOn(client, 'updateScheduledMessage')
        .mockResolvedValue({ scheduled_message: updated, duration: '' });

      await manager.updateScheduledMessage(sm.id, {
        scheduled_at: nsToDate(updated.scheduled_at),
      });

      expect(spy).toHaveBeenCalledWith(
        { id: sm.id },
        { scheduled_at: nsToDate(updated.scheduled_at) },
      );
      expect(manager.getFromState(sm.id)).toBe(updated);
    });

    it('deletes a scheduled message and removes it from the store', async () => {
      const { client, manager } = setup();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);
      vi.spyOn(client, 'deleteScheduledMessage').mockResolvedValue({
        scheduled_message: { ...sm, status: 'canceled' },
        duration: '',
      });

      await manager.deleteScheduledMessage(sm.id);

      expect(manager.getFromState(sm.id)).toBeUndefined();
      expect(itemsOf(manager.paginator)).toEqual([]);
    });

    it('sends a scheduled message now and stores the result', async () => {
      const { client, manager } = setup();
      const sm = generateScheduledMessage();
      const due = { ...sm, scheduled_at: nowNs() };
      vi.spyOn(client, 'sendScheduledMessageNow').mockResolvedValue({
        scheduled_message: due,
        duration: '',
      });

      await manager.sendScheduledMessageNow(sm.id);

      expect(manager.getFromState(sm.id)).toBe(due);
    });

    describe('a scheduled message the server no longer has', () => {
      const notFoundError = generateAPIError(16, undefined, 404);

      it.each([
        [
          'updateScheduledMessage',
          (manager: ScheduledMessageManager, id: string) =>
            manager.updateScheduledMessage(id, { message: { text: 'late edit' } }),
        ],
        [
          'deleteScheduledMessage',
          (manager: ScheduledMessageManager, id: string) =>
            manager.deleteScheduledMessage(id),
        ],
        [
          'sendScheduledMessageNow',
          (manager: ScheduledMessageManager, id: string) =>
            manager.sendScheduledMessageNow(id),
        ],
      ] as const)('is removed from the store when %s gets a 404', async (method, act) => {
        const { client, manager } = setup();
        const sm = generateScheduledMessage();
        manager.upsertToState(sm);
        vi.spyOn(client, method).mockRejectedValue(notFoundError);

        await expect(act(manager, sm.id)).rejects.toBe(notFoundError);

        expect(manager.getFromState(sm.id)).toBeUndefined();
        expect(itemsOf(manager.paginator)).toEqual([]);
      });

      it('is not brought back by a late event', async () => {
        const { client, manager } = setup();
        manager.registerSubscriptions();
        const sm = generateScheduledMessage();
        manager.upsertToState(sm);
        vi.spyOn(client, 'sendScheduledMessageNow').mockRejectedValue(notFoundError);

        await expect(manager.sendScheduledMessageNow(sm.id)).rejects.toBe(notFoundError);
        client.dispatchEvent(generateEvent('scheduled_message.updated', sm));

        expect(manager.getFromState(sm.id)).toBeUndefined();
      });

      it('stays in the store when the request fails for another reason', async () => {
        const { client, manager } = setup();
        const sm = generateScheduledMessage();
        manager.upsertToState(sm);
        const sendingError = generateAPIError(121, 'scheduled_message_sending', 409);
        vi.spyOn(client, 'sendScheduledMessageNow').mockRejectedValue(sendingError);

        await expect(manager.sendScheduledMessageNow(sm.id)).rejects.toBe(sendingError);

        expect(manager.getFromState(sm.id)).toBe(sm);
      });
    });
  });

  describe('ordering', () => {
    it('keeps a message created while the first query is in flight', async () => {
      const { client, manager } = setup();
      const response = deferred<unknown>();
      vi.spyOn(client, 'queryScheduledMessages').mockReturnValue(
        response.promise as never,
      );

      const loading = manager.paginator.toTail();
      const fresh = generateScheduledMessage();
      manager.upsertToState(fresh);
      response.resolve(queryResponse([]));
      await loading;

      expect(itemsOf(manager.paginator)).toEqual([fresh]);
    });

    it('drops a message missing from a reload', async () => {
      const { client, manager } = setup();
      const gone = generateScheduledMessage();
      vi.spyOn(client, 'queryScheduledMessages')
        .mockResolvedValueOnce(queryResponse([gone]))
        .mockResolvedValueOnce(queryResponse([]));
      await manager.paginator.toTail();

      await manager.paginator.reload();

      expect(itemsOf(manager.paginator)).toEqual([]);
    });

    it('keeps a message stored after the channel state was requested', () => {
      const { manager } = setup();
      const stale = generateScheduledMessage();
      manager.upsertToState(stale);
      const requestedAtVersion = manager.version;
      const fresh = generateScheduledMessage();
      manager.upsertToState(fresh);

      manager.hydrateChannelState(cid, [], requestedAtVersion);

      expect(manager.getFromState(fresh.id)).toBe(fresh);
      expect(manager.getFromState(stale.id)).toBeUndefined();
    });

    it('keeps a failed message failed when the send-now response arrives after the failed event', async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      manager.upsertToState(sm);
      const response = deferred<unknown>();
      vi.spyOn(client, 'sendScheduledMessageNow').mockReturnValue(
        response.promise as never,
      );

      const sending = manager.sendScheduledMessageNow(sm.id);
      client.dispatchEvent(
        generateEvent('scheduled_message.failed', {
          ...sm,
          status: 'failed',
          failure_reason: 'channel_frozen',
          updated_at: at(20),
        }),
      );
      response.resolve({
        scheduled_message: { ...sm, scheduled_at: at(10), updated_at: at(10) },
      });
      await sending;

      expect(manager.getFromState(sm.id)?.status).toBe('failed');
      expect(itemsOf(manager.paginator)[0]?.status).toBe('failed');
    });

    it('ignores an updated event older than the stored version', () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      client.dispatchEvent(
        generateEvent('scheduled_message.failed', {
          ...sm,
          status: 'failed',
          updated_at: at(20),
        }),
      );
      client.dispatchEvent(
        generateEvent('scheduled_message.updated', { ...sm, updated_at: at(10) }),
      );

      expect(manager.getFromState(sm.id)?.status).toBe('failed');
    });

    it('applies an update with the same updated_at', () => {
      const { manager } = setup();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      manager.upsertToState(sm);
      manager.upsertToState({ ...sm, status: 'sending' });

      expect(manager.getFromState(sm.id)?.status).toBe('sending');
    });

    it('does not bring back a message sent while a query is in flight', async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);
      const response = deferred<unknown>();
      vi.spyOn(client, 'queryScheduledMessages').mockReturnValue(
        response.promise as never,
      );

      const loading = manager.paginator.toTail();
      client.dispatchEvent(
        generateEvent('scheduled_message.sent', { ...sm, status: 'sent' }),
      );
      response.resolve(queryResponse([sm]));
      await loading;

      expect(manager.getFromState(sm.id)).toBeUndefined();
      expect(itemsOf(manager.paginator)).toEqual([]);
    });

    it('keeps a failure received while a query is in flight', async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage({ status: 'sending', updated_at: at(5) });
      manager.upsertToState(sm);
      const response = deferred<unknown>();
      vi.spyOn(client, 'queryScheduledMessages').mockReturnValue(
        response.promise as never,
      );

      const loading = manager.paginator.toTail();
      client.dispatchEvent(
        generateEvent('scheduled_message.failed', {
          ...sm,
          status: 'failed',
          updated_at: at(20),
        }),
      );
      response.resolve(queryResponse([sm]));
      await loading;

      expect(manager.getFromState(sm.id)?.status).toBe('failed');
      expect(itemsOf(manager.paginator)[0]?.status).toBe('failed');
    });
  });
});
