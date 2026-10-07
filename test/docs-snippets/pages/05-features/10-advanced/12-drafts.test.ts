import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { retry } from '../../../helpers/wait';

describe('_default/05-features/10-advanced/12-drafts.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  let client: StreamChat;

  const createChannel = async () => {
    const channelId = uniqueId('channel');
    const channel = client.channel('messaging', channelId, { members: [userId] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.create();
    return channel;
  };

  const sendParent = async (channel: Channel) => {
    const { message } = await channel.sendMessage({ text: 'parent message' });
    return message.id;
  };

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId, name: 'John' });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('creates a draft message', async () => {
    const channel = await createChannel();
    const parentMessageId = await sendParent(channel);

    // #region snippet docs="_default/05-features/10-advanced/12-drafts.md" heading="Creating a draft message" tab="JavaScript" index=1
    const draft = await channel.createDraft({
      text: 'this is a draft message',
    });

    // Update the draft
    const updatedDraft = await channel.createDraft({
      text: 'this is an updated draft message',
    });

    // Create a draft on a thread
    const threadDraft = await channel.createDraft({
      text: 'this is a draft message',
      parent_id: parentMessageId,
    });
    // #endregion snippet

    expect(draft.draft.message.text).toBe('this is a draft message');
    expect(draft.draft.channel_cid).toBe(channel.cid);
    expect(updatedDraft.draft.message.text).toBe('this is an updated draft message');
    expect(threadDraft.draft.parent_id).toBe(parentMessageId);

    // Only one draft per channel: the update replaced the first one.
    const channelDraft = await channel.getDraft();
    expect(channelDraft.draft.message.text).toBe('this is an updated draft message');
    const loadedThreadDraft = await channel.getDraft({ parent_id: parentMessageId });
    expect(loadedThreadDraft.draft.message.text).toBe('this is a draft message');
  });

  it('deletes a draft message', async () => {
    const channel = await createChannel();
    const parentMessageId = await sendParent(channel);
    await channel.createDraft({ text: 'channel draft' });
    await channel.createDraft({ text: 'thread draft', parent_id: parentMessageId });

    // #region snippet docs="_default/05-features/10-advanced/12-drafts.md" heading="Deleting a draft message" tab="JavaScript" index=1
    // Channel draft
    await channel.deleteDraft();

    // Thread draft
    await channel.deleteDraft({ parent_id: parentMessageId });
    // #endregion snippet

    const { drafts } = await client.queryDrafts({
      filter: { channel_cid: { $eq: channel.cid } },
    });
    expect(drafts).toEqual([]);
    await expect(channel.getDraft()).rejects.toThrow('draft not found');
  });

  it('loads a draft message', async () => {
    const channel = await createChannel();
    const parentMessageId = await sendParent(channel);
    await channel.createDraft({ text: 'channel draft' });
    await channel.createDraft({ text: 'thread draft', parent_id: parentMessageId });

    // #region snippet docs="_default/05-features/10-advanced/12-drafts.md" heading="Loading a draft message" tab="JavaScript" index=1
    // Channel draft
    const draft = await channel.getDraft();

    // Thread draft
    const threadDraft = await channel.getDraft({ parent_id: parentMessageId });
    // #endregion snippet

    expect(draft.draft.message.text).toBe('channel draft');
    expect(draft.draft.channel_cid).toBe(channel.cid);
    expect(threadDraft.draft.message.text).toBe('thread draft');
    expect(threadDraft.draft.parent_id).toBe(parentMessageId);
  });

  it('queries draft messages', async () => {
    const channel1 = await createChannel();
    const channel2 = await createChannel();
    const otherChannel = await createChannel();
    // Sequential, so `created_at: -1` puts channel2's draft before channel1's.
    await channel1.createDraft({ text: 'draft 1' });
    await channel2.createDraft({ text: 'draft 2' });
    await otherChannel.createDraft({ text: 'other draft' });
    const channel1Cid = channel1.cid;
    const channel2Cid = channel2.cid;
    const querySpy = vi.spyOn(client, 'queryDrafts');

    // #region snippet docs="_default/05-features/10-advanced/12-drafts.md" heading="Querying draft messages" tab="JavaScript" index=1
    // COPY: channel1Cid="messaging:channel-1", channel2Cid="messaging:channel-2"
    // Query all user drafts
    const response = await client.queryDrafts({});

    // Query drafts for certain channels and sort
    const filteredResponse = await client.queryDrafts({
      filter: {
        channel_cid: { $in: [channel1Cid, channel2Cid] },
      },
      sort: [{ created_at: -1 }],
    });
    // #endregion snippet

    expect(querySpy.mock.calls[1][0]?.sort).toEqual([{ created_at: -1 }]);
    querySpy.mockRestore();
    expect(response.drafts.map((d) => d.channel_cid)).toEqual(
      expect.arrayContaining([channel1Cid, channel2Cid, otherChannel.cid]),
    );
    expect(filteredResponse.drafts.map((d) => d.channel_cid)).toEqual([
      channel2Cid,
      channel1Cid,
    ]);

    // The opposite direction proves the sort is applied.
    const ascending = await client.queryDrafts({
      filter: { channel_cid: { $in: [channel1Cid, channel2Cid] } },
      sort: [{ created_at: 1 }],
    });
    expect(ascending.drafts.map((d) => d.channel_cid)).toEqual([
      channel1Cid,
      channel2Cid,
    ]);
  });

  it('paginates draft messages', async () => {
    const channel = await createChannel();
    for (let i = 0; i < 7; i++) {
      const parentId = await sendParent(channel);
      await channel.createDraft({ text: `thread draft ${i}`, parent_id: parentId });
    }

    // #region snippet docs="_default/05-features/10-advanced/12-drafts.md" heading="Pagination" tab="JavaScript" index=1
    // Query drafts with a limit
    const firstPage = await client.queryDrafts({
      limit: 5,
    });

    // Query the next page
    const secondPage = await client.queryDrafts({
      limit: 5,
      next: firstPage.next,
    });
    // #endregion snippet

    expect(firstPage.drafts).toHaveLength(5);
    expect(firstPage.next).toBeDefined();
    expect(secondPage.drafts.length).toBeGreaterThan(0);
    const firstKeys = firstPage.drafts.map((d) => `${d.channel_cid}/${d.parent_id}`);
    for (const d of secondPage.drafts) {
      expect(firstKeys).not.toContain(`${d.channel_cid}/${d.parent_id}`);
    }
  });

  it('subscribes to draft events', async () => {
    const channel = await createChannel();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const onSpy = vi.spyOn(client, 'on');
    try {
      // #region snippet docs="_default/05-features/10-advanced/12-drafts.md" heading="Events" tab="JavaScript" index=1
      client.on('draft.updated', (event) => {
        // Handle event
        console.log('event', event);
        console.log('channel_cid', event.draft?.channel_cid);
      });
      // #endregion snippet

      await channel.createDraft({ text: 'draft for the event' });
      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('channel_cid', channel.cid);
        return Promise.resolve();
      });
      expect(logSpy).toHaveBeenCalledWith(
        'event',
        expect.objectContaining({ type: 'draft.updated' }),
      );
    } finally {
      onSpy.mock.results.forEach((r) => {
        if (r.type === 'return') r.value.unsubscribe();
      });
      onSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
