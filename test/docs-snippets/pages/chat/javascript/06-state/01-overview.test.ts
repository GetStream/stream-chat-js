import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, StreamChat } from '../../../../../../src';
import { ChannelPaginator } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { retry } from '../../../../helpers/wait';

describe('javascript/06-state/01-overview.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('state');
  let client: StreamChat;
  let channel: Channel;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    channel = client.channel('messaging', channelId);
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();
    await channel.sendMessage({ message: { text: 'hello' } });
    // The sent message reaches the paginator with its `message.new` event
    await retry(() => {
      expect(channel.messagePaginator.items).toHaveLength(1);
      return Promise.resolve();
    });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('reads and subscribes to state', () => {
    const renderChannel = vi.fn();
    const renderHeader = vi.fn();

    // #region snippet docs="chat/javascript/06-state/01-overview.md" heading="Reading state" tab="JavaScript" index=1
    // Read the current value
    const { items } = channel.messagePaginator.state.getLatestValue();

    // React to any change in the store
    const unsubscribeChannel = channel.state.subscribe((state) => renderChannel(state));

    // React to changes of selected values only.
    // Return a small, flat object: it is compared key by key.
    const unsubscribeHeader = channel.state.subscribeWithSelector(
      ({ typing, memberCount }) => ({ typing, memberCount }),
      ({ typing, memberCount }) => renderHeader(typing, memberCount),
    );

    // Stop listening
    unsubscribeChannel();
    unsubscribeHeader();
    // #endregion snippet

    expect(items?.map((message) => message.text)).toContain('hello');
    // Both call back once right away with the current value
    expect(renderChannel).toHaveBeenCalledTimes(1);
    expect(renderChannel).toHaveBeenCalledWith(channel.state.getLatestValue());
    expect(renderHeader).toHaveBeenCalledTimes(1);
    expect(renderHeader).toHaveBeenCalledWith(
      {},
      channel.state.getLatestValue().memberCount,
    );

    // After unsubscribing no more calls arrive
    channel.state.partialNext({ typing: {} });
    expect(renderChannel).toHaveBeenCalledTimes(1);
    expect(renderHeader).toHaveBeenCalledTimes(1);
  });

  it('paginates a list', async () => {
    const pagedChannelId = uniqueId('state');
    const pagedChannel = client.channel('messaging', pagedChannelId);
    cleanup.channels.push(`messaging:${pagedChannelId}`);
    await pagedChannel.create();
    for (let i = 0; i < 3; i++) {
      await pagedChannel.sendMessage({ message: { text: `message ${i}` } });
    }
    // Two messages per page, so there is an older page to load
    pagedChannel.messagePaginator.updateConfig({ pageSize: 2 });
    await pagedChannel.watch();
    const channel = pagedChannel;
    const toTailSpy = vi.spyOn(channel.messagePaginator, 'toTail');

    // #region snippet docs="chat/javascript/06-state/01-overview.md" heading="Pagination" tab="JavaScript" index=1
    const paginator = channel.messagePaginator;

    const { items, isLoading, hasMoreTail, lastQueryError } =
      paginator.state.getLatestValue();

    // Load the next page
    if (paginator.hasMoreTail) {
      await paginator.toTail();
    }

    // Load the first page again
    await paginator.reload();
    // #endregion snippet

    expect(items).toHaveLength(2);
    expect(isLoading).toBe(false);
    expect(hasMoreTail).toBe(true);
    expect(lastQueryError).toBeUndefined();
    // `toTail()` loaded the older page, `reload()` (itself a `toTail`) the first page again
    expect(toTailSpy).toHaveBeenCalledTimes(2);
    expect(paginator.items?.map((message) => message.text)).toEqual([
      'message 1',
      'message 2',
    ]);
    expect(paginator.hasMoreTail).toBe(true);
  });

  it('reports a failed page in lastQueryError', async () => {
    const paginator = new ChannelPaginator({
      client,
      filters: { members: { $in: [userId] } },
      paginatorOptions: { retryCount: 0 },
    });
    const error = new Error('network down');
    const querySpy = vi
      .spyOn(client, 'queryChannelsAndHydrate')
      .mockRejectedValueOnce(error);
    try {
      // Resolves rather than rejects
      await paginator.toTail();
      expect(paginator.lastQueryError).toBe(error);

      // Calling it again retries, and clears the error
      await paginator.toTail();
      expect(paginator.lastQueryError).toBeUndefined();
      expect(querySpy).toHaveBeenCalledTimes(2);
    } finally {
      querySpy.mockRestore();
    }
  });
});
