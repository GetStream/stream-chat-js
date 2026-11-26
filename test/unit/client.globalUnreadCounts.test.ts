import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, GlobalUnreadCountsState, WSEvent } from '../../src';
import { StreamChat } from '../../src';
import { getClientWithUser } from './test-utils/getClient';

describe('client.globalUnreadCounts', () => {
  let client: StreamChat;

  const counts = () => client.globalUnreadCounts.getLatestValue();

  const handle = (event: Record<string, unknown>) =>
    client._handleClientEvent(event as unknown as WSEvent);

  const dispatch = (event: Record<string, unknown>) =>
    client.dispatchEvent(event as unknown as Event);

  beforeEach(() => {
    client = getClientWithUser({ id: 'me' }) as StreamChat;
  });

  it('starts at zero', () => {
    expect(counts()).toEqual({ totalUnreadCount: 0, unreadChannelsCount: 0 });
  });

  it('seeds the counts from the own user on connection.ok', () => {
    handle({
      type: 'connection.ok',
      me: { id: 'me', total_unread_count: 5, unread_channels: 2 },
    });

    expect(counts()).toEqual({ totalUnreadCount: 5, unreadChannelsCount: 2 });
  });

  it('follows message.new', () => {
    handle({ type: 'message.new', total_unread_count: 7, unread_channels: 3 });

    expect(counts()).toEqual({ totalUnreadCount: 7, unreadChannelsCount: 3 });
  });

  it('follows notification.mark_read', () => {
    handle({ type: 'message.new', total_unread_count: 7, unread_channels: 3 });
    handle({ type: 'notification.mark_read', total_unread_count: 0, unread_channels: 0 });

    expect(counts()).toEqual({ totalUnreadCount: 0, unreadChannelsCount: 0 });
  });

  it('follows notification.mark_unread', () => {
    handle({
      type: 'notification.mark_unread',
      total_unread_count: 4,
      unread_channels: 1,
    });

    expect(counts()).toEqual({ totalUnreadCount: 4, unreadChannelsCount: 1 });
  });

  it('leaves the counts untouched when an event does not carry them', () => {
    handle({ type: 'message.new', total_unread_count: 7, unread_channels: 3 });
    handle({ type: 'message.new' });

    expect(counts()).toEqual({ totalUnreadCount: 7, unreadChannelsCount: 3 });
  });

  it('resets to zero on disconnect', async () => {
    handle({ type: 'message.new', total_unread_count: 7, unread_channels: 3 });

    await client.disconnectUser();

    expect(counts()).toEqual({ totalUnreadCount: 0, unreadChannelsCount: 0 });
  });

  it('notifies a store subscriber as events flow through dispatchEvent', () => {
    const seen: GlobalUnreadCountsState[] = [];
    const unsubscribe = client.globalUnreadCounts.subscribe((state) => seen.push(state));

    dispatch({
      type: 'connection.ok',
      me: { id: 'me', total_unread_count: 3, unread_channels: 2 },
    });
    dispatch({ type: 'message.new', total_unread_count: 4, unread_channels: 2 });
    dispatch({
      type: 'notification.mark_read',
      total_unread_count: 0,
      unread_channels: 0,
    });

    unsubscribe();

    expect(seen).toEqual([
      { totalUnreadCount: 0, unreadChannelsCount: 0 },
      { totalUnreadCount: 3, unreadChannelsCount: 2 },
      { totalUnreadCount: 4, unreadChannelsCount: 2 },
      { totalUnreadCount: 0, unreadChannelsCount: 0 },
    ]);
  });

  it('reseeds from the next user on a user switch', () => {
    handle({
      type: 'connection.ok',
      me: { id: 'me', total_unread_count: 5, unread_channels: 2 },
    });
    handle({
      type: 'connection.ok',
      me: { id: 'other', total_unread_count: 1, unread_channels: 1 },
    });

    expect(counts()).toEqual({ totalUnreadCount: 1, unreadChannelsCount: 1 });
  });

  describe('on channel.truncated', () => {
    const cid = 'messaging:truncated';

    const channelWithOwnUnread = (unreadMessages: number) => {
      const channel = client.channel('messaging', 'truncated');
      channel.state.read = {
        ...channel.state.read,
        me: {
          last_read: 0,
          unread_messages: unreadMessages,
          user: { id: 'me' },
        } as never,
      };
      return channel;
    };

    const serverCounts = (totalUnreadCount: number, unreadChannelsCount: number) =>
      ({
        total_unread_count: totalUnreadCount,
        channels: Array.from({ length: unreadChannelsCount }, () => ({})),
      }) as never;

    const truncate = () =>
      dispatch({ type: 'channel.truncated', cid, channel_type: 'messaging' });

    beforeEach(() => {
      handle({ type: 'message.new', total_unread_count: 5, unread_channels: 2 });
    });

    it('refetches the counts when the truncated channel had unread messages', async () => {
      channelWithOwnUnread(3);
      const unreadCounts = vi
        .spyOn(client, 'unreadCounts')
        .mockResolvedValue(serverCounts(2, 1));

      truncate();

      await vi.waitFor(() =>
        expect(counts()).toEqual({ totalUnreadCount: 2, unreadChannelsCount: 1 }),
      );
      expect(unreadCounts).toHaveBeenCalledTimes(1);
    });

    it('does not refetch when the truncated channel had no unread messages', () => {
      channelWithOwnUnread(0);
      const unreadCounts = vi.spyOn(client, 'unreadCounts');

      truncate();

      expect(unreadCounts).not.toHaveBeenCalled();
      expect(counts()).toEqual({ totalUnreadCount: 5, unreadChannelsCount: 2 });
    });

    it('does not refetch for a channel the client does not hold', () => {
      const unreadCounts = vi.spyOn(client, 'unreadCounts');

      truncate();

      expect(unreadCounts).not.toHaveBeenCalled();
    });

    it('keeps counts that an event delivered while the refetch was in flight', async () => {
      channelWithOwnUnread(3);
      let resolveRefetch: (response: never) => void = () => undefined;
      vi.spyOn(client, 'unreadCounts').mockReturnValue(
        new Promise((resolve) => {
          resolveRefetch = resolve;
        }),
      );

      truncate();
      handle({ type: 'message.new', total_unread_count: 9, unread_channels: 4 });
      resolveRefetch(serverCounts(2, 1));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(counts()).toEqual({ totalUnreadCount: 9, unreadChannelsCount: 4 });
    });

    it('keeps the counts when the refetch fails', async () => {
      channelWithOwnUnread(3);
      const unreadCounts = vi
        .spyOn(client, 'unreadCounts')
        .mockRejectedValue(new Error('offline'));

      truncate();
      await vi.waitFor(() => expect(unreadCounts).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(counts()).toEqual({ totalUnreadCount: 5, unreadChannelsCount: 2 });
    });
  });
});
