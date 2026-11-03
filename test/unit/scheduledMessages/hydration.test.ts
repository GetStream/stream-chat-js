import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledMessageResponse, StreamChat } from '../../../src';
import { msToNs, nowNs } from '../../../src/utils/time';
import { getClientWithUser } from '../test-utils/getClient';
import { mockChannelQueryResponse } from '../test-utils/mockChannelQueryResponse';

const channelCid = mockChannelQueryResponse.channel.cid;

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> = {},
): ScheduledMessageResponse =>
  ({
    id: `sm-${Math.random().toString(36).slice(2)}`,
    cid: channelCid,
    user: { id: 'user1' },
    message: { text: 'see you tomorrow' },
    scheduled_at: msToNs(Date.now() + 60 * 60 * 1000),
    status: 'scheduled',
    created_at: nowNs(),
    updated_at: nowNs(),
    ...data,
  }) as ScheduledMessageResponse;

const channelResponse = (
  id: string,
  scheduled_messages?: ScheduledMessageResponse[],
) => ({
  ...mockChannelQueryResponse,
  channel: { ...mockChannelQueryResponse.channel, cid: `messaging:${id}`, id },
  ...(scheduled_messages ? { scheduled_messages } : {}),
});

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

const mockQueryChannels = (client: StreamChat, channels: unknown[]) =>
  vi
    .spyOn(client, 'queryChannels')
    .mockResolvedValue({ channels, duration: '' } as never);

describe('scheduled message hydration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('queryChannelsAndHydrate', () => {
    it('hydrates the store per channel', async () => {
      const { client, manager } = setup();
      const inA = generateScheduledMessage({ cid: 'messaging:a' });
      mockQueryChannels(client, [channelResponse('a', [inA]), channelResponse('b', [])]);

      await client.queryChannelsAndHydrate({ include_scheduled_messages: true });

      expect(manager.getForChannel('messaging:a')).toEqual([inA]);
      expect(manager.getForChannel('messaging:b')).toEqual([]);
    });

    it('empties a channel whose scheduled_messages is an empty list', async () => {
      const { client, manager } = setup();
      const stale = generateScheduledMessage({ cid: 'messaging:a' });
      const other = generateScheduledMessage({ cid: 'messaging:other' });
      manager.upsertToState(stale);
      manager.upsertToState(other);
      mockQueryChannels(client, [channelResponse('a', [])]);

      await client.queryChannelsAndHydrate({ include_scheduled_messages: true });

      expect(manager.getForChannel('messaging:a')).toEqual([]);
      expect(manager.getForChannel('messaging:other')).toEqual([other]);
    });

    it('keeps the store when scheduled_messages is absent', async () => {
      const { client, manager } = setup();
      const known = generateScheduledMessage({ cid: 'messaging:a' });
      manager.upsertToState(known);
      mockQueryChannels(client, [channelResponse('a')]);

      await client.queryChannelsAndHydrate({ include_scheduled_messages: true });

      expect(manager.getForChannel('messaging:a')).toEqual([known]);
    });

    it('keeps a message stored while the query is in flight', async () => {
      const { client, manager } = setup();
      const response = deferred<unknown>();
      vi.spyOn(client, 'queryChannels').mockReturnValue(response.promise as never);

      const querying = client.queryChannelsAndHydrate({
        include_scheduled_messages: true,
      });
      const fresh = generateScheduledMessage({ cid: 'messaging:a' });
      manager.upsertToState(fresh);
      response.resolve({ channels: [channelResponse('a', [])], duration: '' });
      await querying;

      expect(manager.getFromState(fresh.id)).toBe(fresh);
    });
  });

  describe('channel queries', () => {
    it('hydrates the store from channel.query', async () => {
      const { client, manager } = setup();
      const { id, type } = mockChannelQueryResponse.channel;
      const channel = client.channel(type, id);
      const inChannel = generateScheduledMessage();
      vi.spyOn(channel, 'getOrCreate').mockResolvedValue({
        ...mockChannelQueryResponse,
        scheduled_messages: [inChannel],
      } as never);

      await channel.query({ include_scheduled_messages: true });

      expect(manager.getForChannel(channelCid)).toEqual([inChannel]);
    });

    it('keeps a message stored while channel.query is in flight', async () => {
      const { client, manager } = setup();
      const { id, type } = mockChannelQueryResponse.channel;
      const channel = client.channel(type, id);
      const response = deferred<unknown>();
      vi.spyOn(channel, 'getOrCreate').mockReturnValue(response.promise as never);

      const querying = channel.query({ include_scheduled_messages: true });
      await vi.waitFor(() => expect(channel.getOrCreate).toHaveBeenCalled());
      const fresh = generateScheduledMessage();
      manager.upsertToState(fresh);
      response.resolve({ ...mockChannelQueryResponse, scheduled_messages: [] });
      await querying;

      expect(manager.getFromState(fresh.id)).toBe(fresh);
    });
  });

  describe('sendMessage', () => {
    it('stores the scheduled message of a scheduled send', async () => {
      const { client, manager } = setup();
      const channel = client.channel('messaging', 'general');
      const sm = generateScheduledMessage({ cid: channel.cid });
      vi.spyOn(client, 'sendMessage').mockResolvedValue({
        duration: '',
        message: { id: sm.id, text: 'see you tomorrow' },
        scheduled_message: sm,
      } as never);

      await channel.sendMessage({
        message: { id: sm.id, text: 'see you tomorrow' },
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000),
      });

      expect(manager.getFromState(sm.id)).toEqual(sm);
      expect(channel.messagePaginator.items ?? []).toHaveLength(0);
    });

    it('stores nothing when a scheduled send is sent immediately', async () => {
      const { client, manager } = setup();
      const channel = client.channel('messaging', 'general');
      vi.spyOn(client, 'sendMessage').mockResolvedValue({
        duration: '',
        message: { id: 'm-1', text: 'too late to schedule' },
      } as never);

      await channel.sendMessage({
        message: { id: 'm-1', text: 'too late to schedule' },
        scheduled_at: new Date(Date.now() - 60 * 1000),
      });

      expect(manager.scheduledMessages.size).toBe(0);
    });
  });
});
