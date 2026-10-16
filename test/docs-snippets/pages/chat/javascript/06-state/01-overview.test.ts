import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, StreamChat } from '../../../../../../src';
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
});
