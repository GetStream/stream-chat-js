import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EventTypes,
  ScheduledMessageManager,
  ScheduledMessageResponse,
  StreamChat,
} from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';

const cid = 'messaging:general';
const otherCid = 'messaging:random';

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> = {},
): ScheduledMessageResponse => {
  const now = new Date().toISOString();
  return {
    id: `sm-${Math.random().toString(36).slice(2)}`,
    cid,
    user: { id: 'user1' },
    message: { text: 'see you tomorrow' },
    scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    created_at: now,
    updated_at: now,
    ...data,
  };
};

const generateEvent = (
  type: EventTypes,
  scheduled_message: ScheduledMessageResponse,
  extra: Record<string, unknown> = {},
) => ({
  type,
  cid: scheduled_message.cid,
  created_at: new Date().toISOString(),
  user: scheduled_message.user,
  scheduled_message,
  ...extra,
});

const at = (second: number) => new Date(Date.UTC(2030, 0, 1, 0, 0, second)).toISOString();

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const setup = () => {
  const client = getClientWithUser({ id: 'user1' }) as StreamChat;
  const manager = client.scheduledMessages;
  return { client, manager };
};

describe('ScheduledMessageManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is created by the client with an empty store', () => {
    const { manager } = setup();
    expect(manager).toBeInstanceOf(ScheduledMessageManager);
    expect(manager.scheduledMessages.size).toBe(0);
    expect(manager.state.getLatestValue()).toEqual(
      expect.objectContaining({ hasMore: false, isLoaded: false, isLoading: false }),
    );
  });

  describe('state', () => {
    it('upserts and removes scheduled messages', () => {
      const { manager } = setup();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);
      expect(manager.getFromState(sm.id)).toBe(sm);

      const edited = { ...sm, message: { text: 'edited' } };
      manager.upsertToState(edited);
      expect(manager.getFromState(sm.id)).toBe(edited);
      expect(manager.scheduledMessages.size).toBe(1);

      manager.removeFromState(sm.id);
      expect(manager.getFromState(sm.id)).toBeUndefined();
    });

    it('removes instead of storing canceled and sent scheduled messages', () => {
      const { manager } = setup();
      const canceled = generateScheduledMessage();
      const sent = generateScheduledMessage();
      manager.upsertToState(canceled);
      manager.upsertToState(sent);

      manager.upsertToState({ ...canceled, status: 'canceled' });
      manager.upsertToState({ ...sent, status: 'sent' });

      expect(manager.scheduledMessages.size).toBe(0);
    });

    it('does not bring back a removed scheduled message', () => {
      const { manager } = setup();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);
      manager.removeFromState(sm.id);

      // e.g. the send_now response arriving after the scheduled_message.sent event
      manager.upsertToState(sm);

      expect(manager.getFromState(sm.id)).toBeUndefined();
    });

    it('does not store anything when the cache is disabled', () => {
      const { client, manager } = setup();
      vi.spyOn(client, '_cacheEnabled').mockReturnValue(false);
      manager.upsertToState(generateScheduledMessage());
      manager.hydrateChannelState(cid, [generateScheduledMessage()]);
      expect(manager.scheduledMessages.size).toBe(0);
    });

    it('returns the scheduled messages of a channel or thread ordered by scheduled_at', () => {
      const { manager } = setup();
      const later = generateScheduledMessage({ scheduled_at: '2030-01-02T00:00:00Z' });
      const sooner = generateScheduledMessage({ scheduled_at: '2030-01-01T00:00:00Z' });
      const reply = generateScheduledMessage({
        scheduled_at: '2030-01-03T00:00:00Z',
        message: { text: 'reply', parent_id: 'parent' },
      });
      const elsewhere = generateScheduledMessage({ cid: otherCid });
      [later, reply, elsewhere, sooner].forEach(manager.upsertToState);

      expect(manager.getForChannel(cid)).toEqual([sooner, later, reply]);
      expect(manager.getForChannel(cid, { parentId: 'parent' })).toEqual([reply]);
      expect(manager.getForChannel(cid, { parentId: null })).toEqual([sooner, later]);
      expect(manager.getForChannel(otherCid)).toEqual([elsewhere]);
    });

    it('replaces the scheduled messages of a channel when hydrating channel state', () => {
      const { manager } = setup();
      const stale = generateScheduledMessage();
      const elsewhere = generateScheduledMessage({ cid: otherCid });
      manager.upsertToState(stale);
      manager.upsertToState(elsewhere);

      const fresh = generateScheduledMessage();
      manager.hydrateChannelState(cid, [fresh]);

      expect(manager.getForChannel(cid)).toEqual([fresh]);
      expect(manager.getFromState(elsewhere.id)).toBe(elsewhere);
    });

    it('keeps the store when the channel response has no scheduled messages field', () => {
      const { manager } = setup();
      const sm = generateScheduledMessage();
      manager.upsertToState(sm);

      manager.hydrateChannelState(cid, undefined);

      expect(manager.getFromState(sm.id)).toBe(sm);
    });

    it('empties the channel when the channel response has an empty list', () => {
      const { manager } = setup();
      manager.upsertToState(generateScheduledMessage());

      manager.hydrateChannelState(cid, []);

      expect(manager.getForChannel(cid)).toEqual([]);
    });

    it('is reset when the user disconnects', async () => {
      const { client, manager } = setup();
      manager.upsertToState(generateScheduledMessage());
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);

      await client.disconnectUser();

      expect(manager.scheduledMessages.size).toBe(0);
    });
  });

  describe('events', () => {
    it.each(['scheduled_message.created', 'scheduled_message.updated'] as EventTypes[])(
      'upserts on %s',
      (type) => {
        const { client, manager } = setup();
        manager.registerSubscriptions();
        const sm = generateScheduledMessage();

        client.dispatchEvent(generateEvent(type, sm));

        expect(manager.getFromState(sm.id)).toEqual(sm);
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
      expect(manager.getForChannel(cid)).toHaveLength(1);
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

    it('reloads a loaded store on connection.recovered', async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const querySpy = vi
        .spyOn(client, 'queryScheduledMessages')
        .mockResolvedValue({ scheduled_messages: [], duration: '' });

      client.dispatchEvent({ type: 'connection.recovered' });
      expect(querySpy).not.toHaveBeenCalled();

      await manager.load();
      client.dispatchEvent({ type: 'connection.recovered' });
      expect(querySpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('API', () => {
    it('loads up to 100 scheduled messages and replaces the store', async () => {
      const { client, manager } = setup();
      const stale = generateScheduledMessage();
      manager.upsertToState(stale);
      const loaded = [generateScheduledMessage(), generateScheduledMessage()];
      const querySpy = vi
        .spyOn(client, 'queryScheduledMessages')
        .mockResolvedValue({ scheduled_messages: loaded, next: 'cursor', duration: '' });

      await manager.load();

      expect(querySpy).toHaveBeenCalledWith({ limit: 100 });
      expect(Array.from(manager.scheduledMessages.values())).toEqual(loaded);
      expect(manager.state.getLatestValue()).toEqual(
        expect.objectContaining({
          hasMore: true,
          isLoaded: true,
          isLoading: false,
          next: 'cursor',
        }),
      );
    });

    it('loads the next page and adds it to the store', async () => {
      const { client, manager } = setup();
      const first = generateScheduledMessage();
      const second = generateScheduledMessage();
      const querySpy = vi
        .spyOn(client, 'queryScheduledMessages')
        .mockResolvedValueOnce({
          scheduled_messages: [first],
          next: 'cursor',
          duration: '',
        })
        .mockResolvedValueOnce({ scheduled_messages: [second], duration: '' });

      await manager.load();
      await manager.loadMore();
      await manager.loadMore(); // no next cursor: no request

      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(querySpy).toHaveBeenLastCalledWith({ limit: 100, next: 'cursor' });
      expect(manager.scheduledMessages.size).toBe(2);
      expect(manager.state.getLatestValue().hasMore).toBe(false);
    });

    it('keeps the error of a failed load', async () => {
      const { client, manager } = setup();
      const error = new Error('boom');
      vi.spyOn(client, 'queryScheduledMessages').mockRejectedValue(error);

      await expect(manager.load()).rejects.toThrow('boom');

      expect(manager.state.getLatestValue()).toEqual(
        expect.objectContaining({
          isLoading: false,
          isLoaded: false,
          lastQueryError: error,
        }),
      );
    });

    it('updates a scheduled message and stores the result', async () => {
      const { client, manager } = setup();
      const sm = generateScheduledMessage();
      const updated = { ...sm, scheduled_at: '2030-01-01T00:00:00Z' };
      const spy = vi
        .spyOn(client, 'updateScheduledMessage')
        .mockResolvedValue({ scheduled_message: updated, duration: '' });

      await manager.updateScheduledMessage(sm.id, { scheduled_at: updated.scheduled_at });

      expect(spy).toHaveBeenCalledWith(sm.id, { scheduled_at: updated.scheduled_at });
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
    });

    it('sends a scheduled message now and stores the result', async () => {
      const { client, manager } = setup();
      const sm = generateScheduledMessage();
      const due = { ...sm, scheduled_at: new Date().toISOString() };
      vi.spyOn(client, 'sendScheduledMessageNow').mockResolvedValue({
        scheduled_message: due,
        duration: '',
      });

      await manager.sendScheduledMessageNow(sm.id);

      expect(manager.getFromState(sm.id)).toBe(due);
    });
  });

  describe('ordering', () => {
    it('keeps a failed message failed when the send-now response arrives after the failed event', async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      manager.upsertToState(sm);
      const response = deferred<unknown>();
      vi.spyOn(client, 'post').mockReturnValue(response.promise as never);

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

    it('keeps a message scheduled while load is in flight', async () => {
      const { client, manager } = setup();
      const response = deferred<unknown>();
      vi.spyOn(client, 'post').mockReturnValue(response.promise as never);
      const existing = generateScheduledMessage();
      const scheduledMeanwhile = generateScheduledMessage();

      const loading = manager.load();
      manager.upsertToState(scheduledMeanwhile);
      response.resolve({ scheduled_messages: [existing] });
      await loading;

      expect(manager.getFromState(existing.id)).toEqual(existing);
      expect(manager.getFromState(scheduledMeanwhile.id)).toEqual(scheduledMeanwhile);
    });

    it('keeps a failure received while load is in flight', async () => {
      const { client, manager } = setup();
      manager.registerSubscriptions();
      const sm = generateScheduledMessage({ status: 'sending', updated_at: at(5) });
      manager.upsertToState(sm);
      const response = deferred<unknown>();
      vi.spyOn(client, 'post').mockReturnValue(response.promise as never);

      const loading = manager.load();
      client.dispatchEvent(
        generateEvent('scheduled_message.failed', {
          ...sm,
          status: 'failed',
          updated_at: at(20),
        }),
      );
      response.resolve({ scheduled_messages: [sm] });
      await loading;

      expect(manager.getFromState(sm.id)?.status).toBe('failed');
    });

    it('still drops a message missing from the load when it did not change meanwhile', async () => {
      const { client, manager } = setup();
      const gone = generateScheduledMessage();
      manager.upsertToState(gone);
      vi.spyOn(client, 'post').mockResolvedValue({ scheduled_messages: [] });

      await manager.load();

      expect(manager.getFromState(gone.id)).toBeUndefined();
    });

    it('keeps a message scheduled while a channel query is in flight', async () => {
      const { manager } = setup();
      const token = manager.snapshotToken();
      const scheduledMeanwhile = generateScheduledMessage();
      manager.upsertToState(scheduledMeanwhile);

      manager.hydrateChannelState(cid, [], token);

      expect(manager.getFromState(scheduledMeanwhile.id)).toEqual(scheduledMeanwhile);
    });
  });

  describe('user switch', () => {
    it('drops a load response that arrives after the user disconnected', async () => {
      const { client, manager } = setup();
      const response = deferred<unknown>();
      vi.spyOn(client, 'post').mockReturnValue(response.promise as never);
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);

      const loading = manager.load();
      await client.disconnectUser();
      response.resolve({ scheduled_messages: [generateScheduledMessage()] });
      await loading;

      expect(manager.scheduledMessages.size).toBe(0);
      expect(manager.state.getLatestValue().isLoaded).toBe(false);
    });

    it('drops a send-now response that arrives after the user disconnected', async () => {
      const { client, manager } = setup();
      const sm = generateScheduledMessage();
      const response = deferred<unknown>();
      vi.spyOn(client, 'post').mockReturnValue(response.promise as never);
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);

      const sending = manager.sendScheduledMessageNow(sm.id);
      await client.disconnectUser();
      response.resolve({ scheduled_message: sm });
      await sending;

      expect(manager.scheduledMessages.size).toBe(0);
    });

    it('drops a channel query response that arrives after the user disconnected', async () => {
      const { client, manager } = setup();
      const token = manager.snapshotToken();
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);
      await client.disconnectUser();

      manager.hydrateChannelState(cid, [generateScheduledMessage()], token);

      expect(manager.scheduledMessages.size).toBe(0);
    });
  });
});
