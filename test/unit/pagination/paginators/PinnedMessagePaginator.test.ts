import { describe, expect, it, vi } from 'vitest';
import { PinnedMessagePaginator } from '../../../../src/pagination/paginators/PinnedMessagePaginator';
import type { LocalMessage, MessageResponse } from '../../../../src/types';

const CID = 'messaging:cid';

const makePinned = (
  id: string,
  pinnedAtMs: number,
  overrides: Partial<MessageResponse> = {},
): MessageResponse =>
  ({
    attachments: [],
    cid: CID,
    created_at: new Date(pinnedAtMs).toISOString(),
    id,
    mentioned_users: [],
    pinned: true,
    pinned_at: new Date(pinnedAtMs).toISOString(),
    status: 'received',
    text: id,
    type: 'regular',
    updated_at: new Date(pinnedAtMs).toISOString(),
    ...overrides,
  }) as MessageResponse;

const makeChannel = (getPinnedMessages = vi.fn()) =>
  ({
    cid: CID,
    getClient: () => ({
      notifications: { addError: vi.fn() },
      userId: 'me',
    }),
    getPinnedMessages,
  }) as unknown as import('../../../../src/channel').Channel;

describe('PinnedMessagePaginator', () => {
  it('fetches from getPinnedMessages and orders by pinned_at ascending', async () => {
    const getPinnedMessages = vi.fn().mockResolvedValue({
      messages: [makePinned('c', 3000), makePinned('a', 1000), makePinned('b', 2000)],
    });
    const paginator = new PinnedMessagePaginator({
      channel: makeChannel(getPinnedMessages),
    });

    await paginator.executeQuery();

    expect(getPinnedMessages).toHaveBeenCalledTimes(1);
    // sort travels inside the request object (generated ChannelApi signature), not as a 2nd arg
    expect(getPinnedMessages).toHaveBeenCalledWith(
      expect.objectContaining({ sort: [{ direction: 1, field: 'pinned_at' }] }),
    );
    expect(paginator.items?.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('excludes non-pinned and shadowed messages from the queried page', async () => {
    const getPinnedMessages = vi.fn().mockResolvedValue({
      messages: [
        makePinned('p', 1000),
        makePinned('u', 2000, { pinned: false, pinned_at: null }),
        makePinned('s', 3000, { shadowed: true }),
      ],
    });
    const paginator = new PinnedMessagePaginator({
      channel: makeChannel(getPinnedMessages),
    });

    await paginator.executeQuery();

    expect(paginator.items?.map((m) => m.id)).toEqual(['p']);
  });

  it('auto-removes a message from the active window when it is unpinned', async () => {
    const getPinnedMessages = vi
      .fn()
      .mockResolvedValue({ messages: [makePinned('p', 1000)] });
    const paginator = new PinnedMessagePaginator({
      channel: makeChannel(getPinnedMessages),
    });

    await paginator.executeQuery();
    expect(paginator.items?.map((m) => m.id)).toEqual(['p']);

    // Same message, now unpinned → matchesFilter({ pinned: true }) fails → removed from the list.
    paginator.ingestItem({
      ...makePinned('p', 1000),
      created_at: new Date(1000),
      pinned: false,
      pinned_at: null,
    } as unknown as LocalMessage);
    expect(paginator.items?.map((m) => m.id)).toEqual([]);
  });

  it('does not expose the unread / live-view surface (never coupled to read state)', () => {
    const paginator = new PinnedMessagePaginator({ channel: makeChannel() });
    const surface = paginator as unknown as Record<string, unknown>;

    expect(surface.unreadStateSnapshot).toBeUndefined();
    expect(surface.liveViewState).toBeUndefined();
    expect(surface.seedUnreadSnapshot).toBeUndefined();
    expect(surface.setUnreadSnapshot).toBeUndefined();
    expect(surface.clearUnreadSnapshot).toBeUndefined();
    expect(surface.setViewingLive).toBeUndefined();
    expect(surface.isViewingLive).toBeUndefined();
    expect(surface.jumpToTheFirstUnreadMessage).toBeUndefined();
  });

  it('retains message-interval navigation (jumpToMessage is inherited)', () => {
    const paginator = new PinnedMessagePaginator({ channel: makeChannel() });
    expect(typeof paginator.jumpToMessage).toBe('function');
    expect(typeof paginator.jumpToTheLatestMessage).toBe('function');
    expect(typeof paginator.reflectReaction).toBe('function');
  });
});
