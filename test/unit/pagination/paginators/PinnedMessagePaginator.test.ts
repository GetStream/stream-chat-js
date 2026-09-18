import { describe, expect, it, vi } from 'vitest';
import { PinnedMessagePaginator } from '../../../../src/pagination/paginators/PinnedMessagePaginator';
import type { LocalMessage, MessageResponse } from '../../../../src/types';
import { convertDateToTimestamp } from '../../test-utils/time';

const CID = 'messaging:cid';

const makePinned = (
  id: string,
  pinnedAtMs: number,
  overrides: Partial<MessageResponse> = {},
): MessageResponse =>
  ({
    attachments: [],
    cid: CID,
    created_at: convertDateToTimestamp(new Date(pinnedAtMs).toISOString()),
    id,
    mentioned_users: [],
    pinned: true,
    pinned_at: convertDateToTimestamp(new Date(pinnedAtMs).toISOString()),
    status: 'received',
    text: id,
    type: 'regular',
    updated_at: convertDateToTimestamp(new Date(pinnedAtMs).toISOString()),
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
      created_at: convertDateToTimestamp(new Date(1000)),
      pinned: false,
      pinned_at: null,
    } as unknown as LocalMessage);
    expect(paginator.items?.map((m) => m.id)).toEqual([]);
  });

  it('does not become a store holder for messages it will never display', () => {
    // `ingestItem` writes the index BEFORE checking the filter, so an unpinned message used to be
    // registered as a member and a store holder here — displayed nowhere, but blocking the store's
    // refcount GC, which is what made message pruning on the main list reclaim nothing.
    const paginator = new PinnedMessagePaginator({ channel: makeChannel() });
    paginator.ingestPage({ page: [], isHead: true, isTail: true, setActive: true });

    paginator.ingestItem(
      makePinned('not-pinned', 1, {
        pinned: false,
        pinned_at: undefined,
      }) as LocalMessage,
    );

    expect(paginator.getItem('not-pinned')).toBeUndefined();
    expect(paginator.items ?? []).toHaveLength(0);
  });

  it('still propagates an unpin for a message it DOES hold', () => {
    // The mirror case, and why the write precedes the filter at all: an unpinned snapshot no longer
    // matches, but it has to reach the store so other holders observe `pinned: false`.
    const paginator = new PinnedMessagePaginator({ channel: makeChannel() });
    const pinned = makePinned('p1', 1) as LocalMessage;
    paginator.ingestPage({ page: [pinned], isHead: true, isTail: true, setActive: true });
    expect(paginator.items ?? []).toHaveLength(1);

    paginator.ingestItem({ ...pinned, pinned: false, pinned_at: undefined });

    expect(paginator.items ?? []).toHaveLength(0);
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
  });
});
