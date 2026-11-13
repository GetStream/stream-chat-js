import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Channel,
  EventType,
  getThreadScheduledMessages,
  ScheduledMessagePaginator,
  ScheduledMessageResponse,
  StreamChat,
} from '../../../src';
import { msToNs, nowNs } from '../../../src/utils/time';
import { getClientWithUser } from '../test-utils/getClient';
import { generateAPIError } from '../test-utils/generateAPIError';
import { mockChannelQueryResponse } from '../test-utils/mockChannelQueryResponse';

const { id: channelId, type: channelType } = mockChannelQueryResponse.channel;
const cid = mockChannelQueryResponse.channel.cid;

const scheduledMessageLimits = {
  scheduled_messages_max_lead_time_seconds: 120 * 24 * 60 * 60,
  scheduled_messages_max_per_channel: 10,
  scheduled_messages_max_per_user: 100,
  scheduled_messages_min_lead_time_seconds: 60,
};

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> = {},
): ScheduledMessageResponse =>
  ({
    id: `sm-${Math.random().toString(36).slice(2)}`,
    cid,
    user: { id: 'user1' },
    message: { text: 'see you tomorrow' },
    scheduled_at: msToNs(Date.now() + 60 * 60 * 1000),
    status: 'scheduled',
    created_at: nowNs(),
    updated_at: nowNs(),
    ...data,
  }) as ScheduledMessageResponse;

const at = (second: number) => msToNs(Date.UTC(2030, 0, 1, 0, 0, second));

const generateEvent = (type: EventType, scheduled_message: ScheduledMessageResponse) =>
  ({
    type,
    cid: scheduled_message.cid,
    created_at: nowNs(),
    user: scheduled_message.user,
    scheduled_message,
  }) as never;

/** A channel query response of an app that has scheduled messages. */
const channelState = (
  scheduled_messages?: ScheduledMessageResponse[],
  channelId_ = channelId,
) => ({
  ...mockChannelQueryResponse,
  channel: {
    ...mockChannelQueryResponse.channel,
    cid: `${channelType}:${channelId_}`,
    config: { ...mockChannelQueryResponse.channel.config, ...scheduledMessageLimits },
    id: channelId_,
  },
  ...(scheduled_messages ? { scheduled_messages } : {}),
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const queryResponse = (scheduled_messages: ScheduledMessageResponse[]) =>
  ({ scheduled_messages, duration: '' }) as never;

const setup = () => {
  const client = getClientWithUser({ id: 'user1' }) as StreamChat;
  const channel = client.channelManager.ensure({ id: channelId, type: channelType });
  const getOrCreate = vi
    .spyOn(channel, 'getOrCreate')
    .mockResolvedValue(channelState([]) as never);
  const queryScheduledMessages = vi
    .spyOn(client, 'queryScheduledMessages')
    .mockResolvedValue(queryResponse([]));
  return { channel, client, getOrCreate, queryScheduledMessages };
};

const listed = (channel: Channel) => channel.scheduledMessagesPaginator.items ?? [];

const lastRequest = (getOrCreate: ReturnType<typeof setup>['getOrCreate']) =>
  getOrCreate.mock.lastCall?.[0];

describe("a channel's scheduled messages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('channel.scheduledMessagesPaginator', () => {
    it('is created with the channel, limited to it', () => {
      const { channel } = setup();

      const paginator = channel.scheduledMessagesPaginator;

      expect(paginator).toBeInstanceOf(ScheduledMessagePaginator);
      expect(paginator.cid).toBe(cid);
      expect(channel.scheduledMessagesPaginator).toBe(paginator);
    });

    it('keeps its messages in the client store', () => {
      const { channel, client } = setup();
      const sm = generateScheduledMessage();

      channel.scheduledMessagesPaginator.hydrate([sm]);

      expect(client.scheduledMessageStore.get(sm.id)).toBe(sm);
    });

    it('is not registered with client.scheduledMessagePaginators', () => {
      const { channel, client } = setup();

      expect(client.scheduledMessagePaginators.paginators).toEqual([]);
    });

    it('lists thread replies, which a thread view filters', () => {
      const { channel } = setup();
      const inChannel = generateScheduledMessage({ scheduled_at: at(10) });
      const reply = generateScheduledMessage({
        message: { parent_id: 'parent', text: 'reply' },
        scheduled_at: at(20),
      });

      channel.scheduledMessagesPaginator.hydrate([reply, inChannel]);

      expect(listed(channel)).toEqual([inChannel, reply]);
      expect(getThreadScheduledMessages(listed(channel), 'parent')).toEqual([reply]);
    });

    it('follows the cid a channel created from its members gets from its first query', async () => {
      const { client } = setup();
      const channel = client.channelManager.ensure({
        data: { members: ['user1', 'user2'] },
        type: 'messaging',
      });
      const paginator = channel.scheduledMessagesPaginator;
      const sm = generateScheduledMessage({ cid: `messaging:distinct` });
      vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue(
        channelState([sm], 'distinct') as never,
      );

      await channel.query();

      expect(paginator.cid).toBe('messaging:distinct');
      expect(listed(channel)).toEqual([sm]);
    });

    it('releases its messages when the channel is disposed', () => {
      const { channel, client } = setup();
      const sm = generateScheduledMessage();
      channel.scheduledMessagesPaginator.hydrate([sm]);

      channel.disconnect();

      expect(client.scheduledMessageStore.get(sm.id)).toBeUndefined();
    });
  });

  describe('filled by the channel query', () => {
    it('asks for the scheduled messages on query() and watch()', async () => {
      const { channel, getOrCreate } = setup();

      await channel.query();
      expect(lastRequest(getOrCreate)).toEqual(
        expect.objectContaining({ include_scheduled_messages: true }),
      );

      await channel.watch();
      expect(lastRequest(getOrCreate)).toEqual(
        expect.objectContaining({ include_scheduled_messages: true }),
      );
    });

    it('does not ask when scheduled messages are turned off for the channel', async () => {
      const { channel, client, getOrCreate } = setup();
      client.config.set({ channel: { scheduledMessages: { enabled: false } } });

      await channel.query();

      expect(lastRequest(getOrCreate)).not.toHaveProperty('include_scheduled_messages');
    });

    it('does not ask once a response shows the app has no scheduled messages', async () => {
      const { channel, getOrCreate } = setup();
      getOrCreate.mockResolvedValue(mockChannelQueryResponse as never);
      await channel.query();

      await channel.query();

      expect(lastRequest(getOrCreate)).not.toHaveProperty('include_scheduled_messages');
    });

    it('lets a caller opt out of asking', async () => {
      const { channel, getOrCreate } = setup();

      await channel.query({ include_scheduled_messages: false });

      expect(lastRequest(getOrCreate)).toEqual(
        expect.objectContaining({ include_scheduled_messages: false }),
      );
    });

    it('fills the list, sorted and complete, so it does not query', async () => {
      const { channel, getOrCreate, queryScheduledMessages } = setup();
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const later = generateScheduledMessage({ scheduled_at: at(20) });
      getOrCreate.mockResolvedValue(channelState([later, sooner]) as never);

      await channel.query();
      await channel.scheduledMessagesPaginator.toTail();

      expect(listed(channel)).toEqual([sooner, later]);
      expect(channel.scheduledMessagesPaginator.hasMoreTail).toBe(false);
      expect(queryScheduledMessages).not.toHaveBeenCalled();
    });

    it('marks an empty list complete and lists messages added to it', async () => {
      const { channel, client } = setup();
      await channel.query();
      const sooner = generateScheduledMessage({ scheduled_at: at(10) });
      const later = generateScheduledMessage({ scheduled_at: at(20) });

      expect(channel.scheduledMessagesPaginator.items).toEqual([]);
      expect(channel.scheduledMessagesPaginator.hasMoreHead).toBe(false);
      expect(channel.scheduledMessagesPaginator.hasMoreTail).toBe(false);

      client.dispatchEvent(generateEvent('scheduled_message.created', later));
      client.dispatchEvent(generateEvent('scheduled_message.created', sooner));

      expect(listed(channel)).toEqual([sooner, later]);
    });

    it('replaces the list with the response', async () => {
      const { channel, getOrCreate } = setup();
      const stale = generateScheduledMessage();
      getOrCreate.mockResolvedValueOnce(channelState([stale]) as never);
      await channel.query();
      const fresh = generateScheduledMessage();
      getOrCreate.mockResolvedValueOnce(channelState([fresh]) as never);

      await channel.query();

      expect(listed(channel)).toEqual([fresh]);
    });

    it('publishes the list once per response', () => {
      const { channel } = setup();
      const paginator = channel.scheduledMessagesPaginator;
      paginator.hydrate([generateScheduledMessage(), generateScheduledMessage()]);
      const publish = vi.fn();
      const unsubscribe = paginator.state.subscribeWithSelector(
        ({ items }) => ({ items }),
        publish,
      );
      publish.mockClear();
      const fresh = Array.from({ length: 20 }, () => generateScheduledMessage());

      paginator.hydrate(fresh, paginator.getItemIds());
      unsubscribe();

      expect(publish).toHaveBeenCalledTimes(1);
      expect(listed(channel)).toHaveLength(fresh.length);
    });

    it('publishes the first fill once', () => {
      const { channel } = setup();
      const paginator = channel.scheduledMessagesPaginator;
      const gone = generateScheduledMessage({ scheduled_at: at(1) });
      paginator.ingestItem(gone);
      const itemIdsAtRequest = paginator.getItemIds();
      const waiting = generateScheduledMessage({ scheduled_at: at(2) });
      paginator.ingestItem(waiting);
      const publish = vi.fn();
      const unsubscribe = paginator.state.subscribeWithSelector(
        ({ items }) => ({ items }),
        publish,
      );
      publish.mockClear();
      const fresh = [3, 4, 5].map((second) =>
        generateScheduledMessage({ scheduled_at: at(second) }),
      );

      paginator.hydrate(fresh, itemIdsAtRequest);
      unsubscribe();

      expect(publish).toHaveBeenCalledTimes(1);
      expect(listed(channel)).toEqual([waiting, ...fresh]);
      expect(paginator.logicalHeadItems).toEqual([]);
    });

    it('keeps a message that arrived while the query was in flight', async () => {
      const { channel, client, getOrCreate } = setup();
      const gone = generateScheduledMessage({ scheduled_at: at(10) });
      getOrCreate.mockResolvedValueOnce(channelState([gone]) as never);
      await channel.query();
      const response = deferred<unknown>();
      getOrCreate.mockReturnValueOnce(response.promise as never);

      const querying = channel.query();
      await vi.waitFor(() => expect(getOrCreate).toHaveBeenCalledTimes(2));
      const fresh = generateScheduledMessage({ scheduled_at: at(20) });
      client.dispatchEvent(generateEvent('scheduled_message.created', fresh));
      response.resolve(channelState([]));
      await querying;

      expect(listed(channel)).toEqual([fresh]);
    });

    it('does not list a sent message again from a late response', async () => {
      const { channel, client, getOrCreate } = setup();
      const sm = generateScheduledMessage();
      getOrCreate.mockResolvedValueOnce(channelState([sm]) as never);
      await channel.query();
      const response = deferred<unknown>();
      getOrCreate.mockReturnValueOnce(response.promise as never);

      const querying = channel.query();
      await vi.waitFor(() => expect(getOrCreate).toHaveBeenCalledTimes(2));
      client.dispatchEvent(generateEvent('scheduled_message.sent', sm));
      response.resolve(channelState([sm]));
      await querying;

      expect(listed(channel)).toEqual([]);
    });

    it('does not bring back a message canceled while the query was in flight', async () => {
      const { channel, client, getOrCreate } = setup();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      getOrCreate.mockResolvedValueOnce(channelState([sm]) as never);
      await channel.query();
      const response = deferred<unknown>();
      getOrCreate.mockReturnValueOnce(response.promise as never);

      const querying = channel.query();
      await vi.waitFor(() => expect(getOrCreate).toHaveBeenCalledTimes(2));
      client.dispatchEvent(
        generateEvent('scheduled_message.deleted', { ...sm, updated_at: at(10) }),
      );
      response.resolve(channelState([sm]));
      await querying;

      expect(listed(channel)).toEqual([]);
    });

    it('does not store sent or canceled scheduled messages of the response', async () => {
      const { channel, client, getOrCreate } = setup();
      const sent = generateScheduledMessage({ status: 'sent' });
      getOrCreate.mockResolvedValue(channelState([sent]) as never);

      await channel.query();

      expect(listed(channel)).toEqual([]);
      expect(client.scheduledMessageStore.get(sent.id)).toBeUndefined();
    });

    it('does not bring back a message canceled during the first query, before the list existed', async () => {
      const { channel, client, getOrCreate } = setup();
      const sm = generateScheduledMessage();
      const response = deferred<unknown>();
      getOrCreate.mockReturnValueOnce(response.promise as never);

      const querying = channel.query();
      await vi.waitFor(() => expect(getOrCreate).toHaveBeenCalledTimes(1));
      client.dispatchEvent(generateEvent('scheduled_message.deleted', sm));
      response.resolve(channelState([sm]));
      await querying;

      expect(listed(channel)).toEqual([]);
    });

    it('keeps a sent message from coming back before the list loaded', () => {
      const { channel, client } = setup();
      const sm = generateScheduledMessage();

      client.dispatchEvent(generateEvent('scheduled_message.sent', sm));
      channel.scheduledMessagesPaginator.hydrate([sm]);

      expect(listed(channel)).toEqual([]);
    });

    it('keeps a message that arrived while the first query was in flight', async () => {
      const { channel, client, getOrCreate } = setup();
      const response = deferred<unknown>();
      getOrCreate.mockReturnValueOnce(response.promise as never);

      const querying = channel.query();
      await vi.waitFor(() => expect(getOrCreate).toHaveBeenCalledTimes(1));
      const fresh = generateScheduledMessage();
      client.dispatchEvent(generateEvent('scheduled_message.created', fresh));
      response.resolve(channelState([]));
      await querying;

      expect(listed(channel)).toEqual([fresh]);
      expect(channel.scheduledMessagesPaginator.logicalHeadItems).toEqual([]);
    });

    it('does not ask from the queries that only probe the channel', async () => {
      const { channel, client, getOrCreate } = setup();
      await channel.query();
      getOrCreate.mockClear();

      client.dispatchEvent({
        channel: { ...channel.data, frozen: !channel.data?.frozen },
        cid,
        type: 'channel.updated',
      } as never);

      await vi.waitFor(() => expect(getOrCreate).toHaveBeenCalled());
      expect(lastRequest(getOrCreate)).toEqual(
        expect.objectContaining({ include_scheduled_messages: false }),
      );
    });

    it('ignores a response that lands after the channel was disposed', async () => {
      const { channel, client, getOrCreate } = setup();
      const sm = generateScheduledMessage();
      const response = deferred<unknown>();
      getOrCreate.mockReturnValueOnce(response.promise as never);

      const querying = channel.query();
      await vi.waitFor(() => expect(getOrCreate).toHaveBeenCalledTimes(1));
      channel.disconnect();
      response.resolve(channelState([sm]));
      await querying.catch(() => undefined);

      expect(client.scheduledMessageStore.get(sm.id)).toBeUndefined();
    });

    describe('when the response leaves them out', () => {
      it('leaves a list that never loaded unloaded', async () => {
        const { channel, getOrCreate, queryScheduledMessages } = setup();
        getOrCreate.mockResolvedValue(channelState() as never);

        await channel.query();

        expect(channel.scheduledMessagesPaginator.items).toBeUndefined();
        expect(queryScheduledMessages).not.toHaveBeenCalled();
      });

      it('reloads a list that had loaded', async () => {
        const { channel, getOrCreate, queryScheduledMessages } = setup();
        await channel.query();
        const known = generateScheduledMessage();
        queryScheduledMessages.mockResolvedValue(queryResponse([known]));
        getOrCreate.mockResolvedValue(channelState() as never);

        await channel.query();

        await vi.waitFor(() => expect(listed(channel)).toEqual([known]));
        expect(queryScheduledMessages).toHaveBeenCalledWith({
          filter: { cid },
          limit: 100,
        });
      });
    });

    it('loads the list itself when asked and the channel query left them out', async () => {
      const { channel, queryScheduledMessages } = setup();
      const sm = generateScheduledMessage();
      queryScheduledMessages.mockResolvedValue(queryResponse([sm]));

      await channel.scheduledMessagesPaginator.toTail();

      expect(listed(channel)).toEqual([sm]);
    });
  });

  describe('filled by queryChannels', () => {
    const mockQueryChannels = (client: StreamChat, channels: unknown[]) =>
      vi
        .spyOn(client, 'queryChannels')
        .mockResolvedValue({ channels, duration: '' } as never);

    it('asks for the scheduled messages', async () => {
      const { client } = setup();
      const querySpy = mockQueryChannels(client, []);

      await client.queryChannelsAndHydrate({});

      expect(querySpy).toHaveBeenCalledWith(
        expect.objectContaining({ include_scheduled_messages: true }),
        undefined,
      );
    });

    it('does not ask when scheduled messages are turned off for channels', async () => {
      const { client } = setup();
      client.config.set({ channel: { scheduledMessages: { enabled: false } } });
      const querySpy = mockQueryChannels(client, []);

      await client.queryChannelsAndHydrate({});

      expect(querySpy.mock.lastCall?.[0]).not.toHaveProperty(
        'include_scheduled_messages',
      );
    });

    it("fills each channel's list", async () => {
      const { client } = setup();
      const inA = generateScheduledMessage({ cid: 'messaging:a' });
      mockQueryChannels(client, [channelState([inA], 'a'), channelState([], 'b')]);

      await client.queryChannelsAndHydrate({});

      expect(listed(client.channel('messaging', 'a'))).toEqual([inA]);
      expect(client.channel('messaging', 'b').scheduledMessagesPaginator.items).toEqual(
        [],
      );
    });

    it('fills no list when the integrator turned scheduled messages off', async () => {
      const { client } = setup();
      const channel = client.channelManager.ensure({ id: 'a', type: 'messaging' });
      client.config.set({ channel: { scheduledMessages: { enabled: false } } });
      mockQueryChannels(client, [
        channelState([generateScheduledMessage({ cid: 'messaging:a' })], 'a'),
      ]);

      await client.queryChannelsAndHydrate({});

      expect(channel.scheduledMessagesPaginator.items).toBeUndefined();
    });

    it('keeps the lists when the response leaves them out', async () => {
      const { client, queryScheduledMessages } = setup();
      const known = generateScheduledMessage({ cid: 'messaging:a' });
      client.channel('messaging', 'a').scheduledMessagesPaginator.hydrate([known]);
      mockQueryChannels(client, [channelState(undefined, 'a')]);

      await client.queryChannelsAndHydrate({});

      expect(listed(client.channel('messaging', 'a'))).toEqual([known]);
      expect(queryScheduledMessages).not.toHaveBeenCalled();
    });

    it('accepts a response without channels', async () => {
      const { client } = setup();
      vi.spyOn(client, 'queryChannels').mockResolvedValue({ duration: '' } as never);

      await expect(client.queryChannelsAndHydrate({})).resolves.toEqual([]);
    });

    it('keeps a message that arrived while the query was in flight', async () => {
      const { client } = setup();
      const channel = client.channelManager.ensure({ id: 'a', type: 'messaging' });
      channel.scheduledMessagesPaginator.hydrate([]);
      const response = deferred<unknown>();
      vi.spyOn(client, 'queryChannels').mockReturnValue(response.promise as never);

      const querying = client.queryChannelsAndHydrate({});
      const fresh = generateScheduledMessage({ cid: 'messaging:a' });
      client.dispatchEvent(generateEvent('scheduled_message.created', fresh));
      response.resolve({ channels: [channelState([], 'a')], duration: '' });
      await querying;

      expect(listed(channel)).toEqual([fresh]);
    });
  });

  describe('events', () => {
    const setupLoaded = () => {
      const context = setup();
      context.channel.scheduledMessagesPaginator.hydrate([]);
      return context;
    };

    it.each(['scheduled_message.created', 'scheduled_message.updated'] as EventType[])(
      'lists the message of %s',
      (type) => {
        const { channel, client } = setupLoaded();
        const sm = generateScheduledMessage();

        client.dispatchEvent(generateEvent(type, sm));

        expect(listed(channel)).toEqual([sm]);
      },
    );

    it('keeps a failed message, in its place by time', () => {
      const { channel, client } = setupLoaded();
      const failing = generateScheduledMessage({
        scheduled_at: at(10),
        updated_at: at(0),
      });
      const pending = generateScheduledMessage({ scheduled_at: at(20) });
      [failing, pending].forEach((sm) =>
        client.dispatchEvent(generateEvent('scheduled_message.created', sm)),
      );

      client.dispatchEvent(
        generateEvent('scheduled_message.failed', {
          ...failing,
          failure_reason: 'channel_frozen',
          status: 'failed',
          updated_at: at(5),
        }),
      );

      expect(listed(channel)).toEqual([
        expect.objectContaining({ id: failing.id, status: 'failed' }),
        pending,
      ]);
    });

    it.each(['scheduled_message.sent', 'scheduled_message.deleted'] as EventType[])(
      'removes the message on %s',
      (type) => {
        const { channel, client } = setupLoaded();
        const sm = generateScheduledMessage();
        client.dispatchEvent(generateEvent('scheduled_message.created', sm));

        client.dispatchEvent(generateEvent(type, sm));

        expect(listed(channel)).toEqual([]);
      },
    );

    it('lists a canceled message scheduled again under the same ID', () => {
      const { channel, client } = setupLoaded();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      client.dispatchEvent(generateEvent('scheduled_message.created', sm));
      client.dispatchEvent(
        generateEvent('scheduled_message.deleted', { ...sm, updated_at: at(10) }),
      );
      const scheduledAgain = { ...sm, message: { text: 'again' }, updated_at: at(20) };

      client.dispatchEvent(generateEvent('scheduled_message.created', scheduledAgain));

      expect(listed(channel)).toEqual([scheduledAgain]);
    });

    it('lists a deleted failed message scheduled again under the same ID', () => {
      const { channel, client } = setupLoaded();
      const failed = generateScheduledMessage({ status: 'failed', updated_at: at(10) });
      client.dispatchEvent(generateEvent('scheduled_message.failed', failed));
      client.dispatchEvent(generateEvent('scheduled_message.deleted', failed));
      expect(listed(channel)).toEqual([]);
      const scheduledAgain = {
        ...failed,
        status: 'scheduled' as const,
        updated_at: at(20),
      };

      client.dispatchEvent(generateEvent('scheduled_message.created', scheduledAgain));

      expect(listed(channel)).toEqual([scheduledAgain]);
    });

    it('does not bring back a deleted failed message from a stale copy', () => {
      const { channel, client } = setupLoaded();
      const failed = generateScheduledMessage({ status: 'failed', updated_at: at(10) });
      client.dispatchEvent(generateEvent('scheduled_message.failed', failed));
      client.dispatchEvent(generateEvent('scheduled_message.deleted', failed));

      channel.scheduledMessagesPaginator.hydrate([failed]);

      expect(listed(channel)).toEqual([]);
    });

    it('ignores a newer copy arriving before an older one', () => {
      const { channel, client } = setupLoaded();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      const newer = { ...sm, message: { text: 'newer' }, updated_at: at(20) };

      client.dispatchEvent(generateEvent('scheduled_message.updated', newer));
      client.dispatchEvent(
        generateEvent('scheduled_message.updated', { ...sm, updated_at: at(10) }),
      );

      expect(listed(channel)).toEqual([newer]);
    });

    it('does not republish the list for a stale copy of a message it holds', () => {
      const { channel } = setupLoaded();
      const paginator = channel.scheduledMessagesPaginator;
      const sm = generateScheduledMessage({ updated_at: at(20) });
      paginator.ingestItem(sm);
      const items = paginator.items;
      const publish = vi.fn();
      const unsubscribe = paginator.state.subscribeWithSelector(
        ({ items }) => ({ items }),
        publish,
      );
      publish.mockClear();

      const changed = paginator.ingestItem({ ...sm, updated_at: at(10) });
      unsubscribe();

      expect(changed).toBe(false);
      expect(publish).not.toHaveBeenCalled();
      expect(paginator.items).toBe(items);
    });

    it('takes a message before the list loaded and leaves the next channel query to decide', async () => {
      const { channel, client, getOrCreate } = setup();
      const kept = generateScheduledMessage({ scheduled_at: at(10) });
      const gone = generateScheduledMessage({ scheduled_at: at(20) });

      client.dispatchEvent(generateEvent('scheduled_message.created', kept));
      client.dispatchEvent(generateEvent('scheduled_message.created', gone));

      expect(channel.scheduledMessagesPaginator.hasLoadedPage).toBe(false);
      // Sent after both events, so the response is newer: what it leaves out is gone.
      getOrCreate.mockResolvedValue(channelState([kept]) as never);
      await channel.query();
      expect(listed(channel)).toEqual([kept]);
    });

    it("does not list another channel's messages", () => {
      const { channel, client } = setupLoaded();
      client.channelManager.ensure({ id: 'other', type: 'messaging' });

      client.dispatchEvent(
        generateEvent(
          'scheduled_message.created',
          generateScheduledMessage({ cid: 'messaging:other' }),
        ),
      );

      expect(listed(channel)).toEqual([]);
    });
  });

  describe('actions', () => {
    const setupWithMessage = () => {
      const context = setup();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      context.channel.scheduledMessagesPaginator.hydrate([sm]);
      return { ...context, sm };
    };

    it('lists the message of a scheduled send', async () => {
      const { channel, client } = setup();
      channel.scheduledMessagesPaginator.hydrate([]);
      const sm = generateScheduledMessage();
      vi.spyOn(client, 'sendMessage').mockResolvedValue({
        duration: '',
        message: { id: sm.id, text: 'see you tomorrow' },
        scheduled_message: sm,
      } as never);

      await channel.sendMessage({
        message: { id: sm.id, text: 'see you tomorrow' },
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000),
      });

      expect(listed(channel)).toEqual([sm]);
      expect(channel.messagePaginator.items ?? []).toHaveLength(0);
    });

    it('stores nothing when a scheduled send is sent at once', async () => {
      const { channel, client } = setup();
      channel.scheduledMessagesPaginator.hydrate([]);
      vi.spyOn(client, 'sendMessage').mockResolvedValue({
        duration: '',
        message: { id: 'm-1', text: 'too late to schedule' },
      } as never);

      await channel.sendMessage({
        message: { id: 'm-1', text: 'too late to schedule' },
        scheduled_at: new Date(Date.now() - 60 * 1000),
      });

      expect(client.scheduledMessageStore.values()).toEqual([]);
    });

    it('updates a scheduled message and lists the result', async () => {
      const { channel, client, sm } = setupWithMessage();
      const updated = { ...sm, scheduled_at: at(30), updated_at: at(10) };
      const spy = vi
        .spyOn(client, 'updateScheduledMessage')
        .mockResolvedValue({ duration: '', scheduled_message: updated });

      await channel.updateScheduledMessage(sm.id, { message: { text: 'edited' } });

      expect(spy).toHaveBeenCalledWith({ id: sm.id }, { message: { text: 'edited' } });
      expect(listed(channel)).toEqual([updated]);
    });

    it('deletes a scheduled message and removes it from the list', async () => {
      const { channel, client, sm } = setupWithMessage();
      vi.spyOn(client, 'deleteScheduledMessage').mockResolvedValue({
        duration: '',
        scheduled_message: sm,
      });

      await channel.deleteScheduledMessage(sm.id);

      expect(listed(channel)).toEqual([]);
      expect(client.scheduledMessageStore.get(sm.id)).toBeUndefined();
    });

    it('sends a scheduled message now and lists the result', async () => {
      const { channel, client, sm } = setupWithMessage();
      const sending = { ...sm, status: 'sending' as const, updated_at: at(10) };
      vi.spyOn(client, 'sendScheduledMessageNow').mockResolvedValue({
        duration: '',
        scheduled_message: sending,
      });

      await channel.sendScheduledMessageNow(sm.id);

      expect(listed(channel)).toEqual([sending]);
    });

    it('updates the registered lists too', async () => {
      const { channel, client, sm } = setupWithMessage();
      const all = new ScheduledMessagePaginator({ client });
      all.hydrate([]);
      client.scheduledMessagePaginators.insertPaginator({ paginator: all });
      const updated = { ...sm, updated_at: at(10) };
      vi.spyOn(client, 'updateScheduledMessage').mockResolvedValue({
        duration: '',
        scheduled_message: updated,
      });

      await channel.updateScheduledMessage(sm.id, { message: { text: 'edited' } });

      expect(all.items).toEqual([updated]);
    });

    it('does not list a sent message again when a late edit response still says scheduled', async () => {
      const { channel, client, sm } = setupWithMessage();
      const response = deferred<unknown>();
      vi.spyOn(client, 'updateScheduledMessage').mockReturnValue(
        response.promise as never,
      );

      const updating = channel.updateScheduledMessage(sm.id, {
        message: { text: 'edited' },
      });
      client.dispatchEvent(
        generateEvent('scheduled_message.sent', { ...sm, updated_at: at(20) }),
      );
      response.resolve({
        scheduled_message: { ...sm, message: { text: 'edited' }, updated_at: at(30) },
      });
      await updating;

      expect(listed(channel)).toEqual([]);
    });

    it('keeps a failed message failed when the send-now response arrives after the failed event', async () => {
      const { channel, client, sm } = setupWithMessage();
      const response = deferred<unknown>();
      vi.spyOn(client, 'sendScheduledMessageNow').mockReturnValue(
        response.promise as never,
      );

      const sending = channel.sendScheduledMessageNow(sm.id);
      client.dispatchEvent(
        generateEvent('scheduled_message.failed', {
          ...sm,
          failure_reason: 'channel_frozen',
          status: 'failed',
          updated_at: at(20),
        }),
      );
      response.resolve({
        scheduled_message: { ...sm, scheduled_at: at(10), updated_at: at(10) },
      });
      await sending;

      expect(listed(channel)).toEqual([expect.objectContaining({ status: 'failed' })]);
    });

    describe('a scheduled message the server no longer has', () => {
      const notFoundError = generateAPIError(16, undefined, 404);

      it.each([
        [
          'updateScheduledMessage',
          (channel: Channel, id: string) =>
            channel.updateScheduledMessage(id, { message: { text: 'late edit' } }),
        ],
        [
          'deleteScheduledMessage',
          (channel: Channel, id: string) => channel.deleteScheduledMessage(id),
        ],
        [
          'sendScheduledMessageNow',
          (channel: Channel, id: string) => channel.sendScheduledMessageNow(id),
        ],
      ] as const)('is removed from the lists when %s gets a 404', async (method, act) => {
        const { channel, client, sm } = setupWithMessage();
        vi.spyOn(client, method).mockRejectedValue(notFoundError);

        await expect(act(channel, sm.id)).rejects.toBe(notFoundError);

        expect(listed(channel)).toEqual([]);
      });

      it('is not brought back by a late event', async () => {
        const { channel, client, sm } = setupWithMessage();
        vi.spyOn(client, 'sendScheduledMessageNow').mockRejectedValue(notFoundError);

        await expect(channel.sendScheduledMessageNow(sm.id)).rejects.toBe(notFoundError);
        client.dispatchEvent(generateEvent('scheduled_message.updated', sm));

        expect(listed(channel)).toEqual([]);
      });

      it('stays listed when the request fails for another reason', async () => {
        const { channel, client, sm } = setupWithMessage();
        const sendingError = generateAPIError(121, 'scheduled_message_sending', 409);
        vi.spyOn(client, 'sendScheduledMessageNow').mockRejectedValue(sendingError);

        await expect(channel.sendScheduledMessageNow(sm.id)).rejects.toBe(sendingError);

        expect(listed(channel)).toEqual([sm]);
      });
    });
  });

  describe('lists holding the same message', () => {
    const setupTwoLists = (
      filter?: ConstructorParameters<typeof ScheduledMessagePaginator>[0]['filter'],
    ) => {
      const context = setup();
      const { channel, client } = context;
      const registered = new ScheduledMessagePaginator({ client, filter });
      client.scheduledMessagePaginators.insertPaginator({ paginator: registered });
      client.scheduledMessagePaginators.registerSubscriptions();
      channel.scheduledMessagesPaginator.hydrate([]);
      registered.hydrate([]);
      return { ...context, registered };
    };

    /** Dispatches an event and waits for the manager's pipelines, which run asynchronously. */
    const dispatch = async (client: StreamChat, event: never) => {
      client.dispatchEvent(event);
      await Promise.all(
        [...client.scheduledMessagePaginators.pipelines.values()].map((pipeline) =>
          pipeline.drain(),
        ),
      );
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each(['scheduled_message.deleted', 'scheduled_message.sent'] as const)(
      'all drop a message on %s',
      async (type) => {
        const { channel, client, registered } = setupTwoLists();
        const sm = generateScheduledMessage({ updated_at: at(0) });
        await dispatch(client, generateEvent('scheduled_message.created', sm));
        expect(listed(channel)).toEqual([sm]);
        expect(registered.items).toEqual([sm]);

        await dispatch(client, generateEvent(type, { ...sm, updated_at: at(1) }));

        expect(listed(channel)).toEqual([]);
        expect(registered.items).toEqual([]);
        client.scheduledMessagePaginators.unregisterSubscriptions();
      },
    );

    it('all drop a message deleted through the channel', async () => {
      const { channel, client, registered } = setupTwoLists();
      const sm = generateScheduledMessage({ updated_at: at(0) });
      await dispatch(client, generateEvent('scheduled_message.created', sm));
      vi.spyOn(client, 'deleteScheduledMessage').mockResolvedValue({
        duration: '',
        scheduled_message: { ...sm, updated_at: at(1) },
      } as never);

      await channel.deleteScheduledMessage(sm.id);

      expect(listed(channel)).toEqual([]);
      expect(registered.items).toEqual([]);
      client.scheduledMessagePaginators.unregisterSubscriptions();
    });

    it('takes a failed message out of a list of pending ones', async () => {
      const { channel, client, registered } = setupTwoLists({ status: ['scheduled'] });
      const sm = generateScheduledMessage({ updated_at: at(0) });
      await dispatch(client, generateEvent('scheduled_message.created', sm));
      const failed = {
        ...sm,
        failure_reason: 'channel_frozen',
        status: 'failed',
        updated_at: at(1),
      } as ScheduledMessageResponse;

      await dispatch(client, generateEvent('scheduled_message.failed', failed));

      expect(listed(channel)).toEqual([failed]);
      expect(registered.items).toEqual([]);
      client.scheduledMessagePaginators.unregisterSubscriptions();
    });

    it('moves a rescheduled message in every list', async () => {
      const { channel, client, registered } = setupTwoLists();
      const first = generateScheduledMessage({ scheduled_at: at(10), updated_at: at(0) });
      const second = generateScheduledMessage({
        scheduled_at: at(20),
        updated_at: at(0),
      });
      await dispatch(client, generateEvent('scheduled_message.created', first));
      await dispatch(client, generateEvent('scheduled_message.created', second));
      const moved = { ...second, scheduled_at: at(5), updated_at: at(1) };

      await dispatch(client, generateEvent('scheduled_message.updated', moved));

      expect(listed(channel)).toEqual([moved, first]);
      expect(registered.items).toEqual([moved, first]);
      client.scheduledMessagePaginators.unregisterSubscriptions();
    });

    it('moves a message in a list that another list changed in the store', async () => {
      const { channel, client, registered } = setupTwoLists();
      const first = generateScheduledMessage({ scheduled_at: at(10), updated_at: at(0) });
      const second = generateScheduledMessage({
        scheduled_at: at(20),
        updated_at: at(0),
      });
      await dispatch(client, generateEvent('scheduled_message.created', first));
      await dispatch(client, generateEvent('scheduled_message.created', second));
      const moved = { ...second, scheduled_at: at(5), updated_at: at(1) };

      // a channel query response reaches only the channel's list
      channel.hydrateScheduledMessages(
        [first, moved],
        channel.scheduledMessagesPaginator.getItemIds(),
      );

      expect(registered.items).toEqual([moved, first]);
      client.scheduledMessagePaginators.unregisterSubscriptions();
    });
  });

  describe('a removal no list holds', () => {
    it('keeps a channel query read before it from listing the message', () => {
      const { client } = setup();
      const otherCid = `${channelType}:other`;
      const sm = generateScheduledMessage({ cid: otherCid, updated_at: at(0) });

      client.dispatchEvent(
        generateEvent('scheduled_message.sent', { ...sm, updated_at: at(1) }),
      );
      const other = client.channelManager.ensure({ id: 'other', type: channelType });
      other.hydrateScheduledMessages([sm]);

      expect(listed(other)).toEqual([]);
    });
  });

  describe('reload', () => {
    it('keeps the list until the response lands', async () => {
      const { channel, queryScheduledMessages } = setup();
      const kept = generateScheduledMessage({ scheduled_at: at(1), updated_at: at(0) });
      const gone = generateScheduledMessage({ scheduled_at: at(2), updated_at: at(0) });
      channel.scheduledMessagesPaginator.hydrate([kept, gone]);
      const response = deferred<never>();
      queryScheduledMessages.mockReturnValueOnce(response.promise);

      const reloading = channel.scheduledMessagesPaginator.reload();
      expect(listed(channel)).toEqual([kept, gone]);
      response.resolve(queryResponse([kept]));
      await reloading;

      expect(listed(channel)).toEqual([kept]);
    });

    it('keeps a message that arrived while the request was out', async () => {
      const { channel, client, queryScheduledMessages } = setup();
      channel.scheduledMessagesPaginator.hydrate([]);
      const response = deferred<never>();
      queryScheduledMessages.mockReturnValueOnce(response.promise);

      const reloading = channel.scheduledMessagesPaginator.reload();
      const arrived = generateScheduledMessage();
      client.dispatchEvent(generateEvent('scheduled_message.created', arrived));
      response.resolve(queryResponse([]));
      await reloading;

      expect(listed(channel)).toEqual([arrived]);
    });

    it('places the first page of a longer list and keeps its cursor', async () => {
      const { channel, queryScheduledMessages } = setup();
      const old = generateScheduledMessage({ scheduled_at: at(1), updated_at: at(0) });
      channel.scheduledMessagesPaginator.hydrate([old]);
      const firstPage = generateScheduledMessage({
        scheduled_at: at(2),
        updated_at: at(0),
      });
      queryScheduledMessages.mockResolvedValueOnce({
        ...(queryResponse([firstPage]) as object),
        next: 'page-2',
      } as never);

      await channel.scheduledMessagesPaginator.reload();

      expect(listed(channel)).toEqual([firstPage]);
      expect(channel.scheduledMessagesPaginator.hasMoreTail).toBe(true);
    });

    it('joins a reload already in flight', async () => {
      const { channel, queryScheduledMessages } = setup();
      channel.scheduledMessagesPaginator.hydrate([]);

      await Promise.all([
        channel.scheduledMessagesPaginator.reload(),
        channel.scheduledMessagesPaginator.reload(),
      ]);

      expect(queryScheduledMessages).toHaveBeenCalledTimes(1);
    });

    it('leaves a registered list that loaded empty to be recovered', async () => {
      const { client, queryScheduledMessages } = setup();
      const registered = new ScheduledMessagePaginator({ client });
      client.scheduledMessagePaginators.insertPaginator({ paginator: registered });

      await registered.reload();
      await client.scheduledMessagePaginators.recover();

      expect(registered.hasLoadedPage).toBe(true);
      expect(queryScheduledMessages).toHaveBeenCalledTimes(2);
    });

    it('keeps the list and records the error when the request fails', async () => {
      const { channel, queryScheduledMessages } = setup();
      const sm = generateScheduledMessage();
      channel.scheduledMessagesPaginator.hydrate([sm]);
      const error = new Error('offline');
      queryScheduledMessages.mockRejectedValueOnce(error);

      await channel.scheduledMessagesPaginator.reload();

      expect(listed(channel)).toEqual([sm]);
      expect(channel.scheduledMessagesPaginator.lastQueryError).toBe(error);
    });
  });
});
