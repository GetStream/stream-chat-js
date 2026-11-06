import { describe, expect, it, vi } from 'vitest';

import type { Channel } from '../../../src/channel';
import { ChannelMemberSearchSource } from '../../../src/search/ChannelMemberSearchSource';
import { ChannelSearchSource } from '../../../src/search/ChannelSearchSource';
import { MessageSearchSource } from '../../../src/search/MessageSearchSource';
import { UserSearchSource } from '../../../src/search/UserSearchSource';
import { MentionsSearchSource } from '../../../src/messageComposer/middleware/textComposer/mentions';
import { getClientWithUser } from '../test-utils/getClient';

const channelStub = (client: unknown) =>
  ({
    getClient: () => client,
    state: { members: {}, watchers: {} },
    queryMembers: vi.fn(),
  }) as unknown as Channel;

describe('search source query parameters as constructor options', () => {
  it('seeds ChannelSearchSource', () => {
    const client = getClientWithUser({ id: 'u1' });
    const source = new ChannelSearchSource(client, {
      filters: { type: 'messaging' },
      searchOptions: { presence: true },
      sort: [{ field: 'last_message_at', direction: -1 }],
    });

    expect(source.filters).toEqual({ type: 'messaging' });
    expect(source.sort).toEqual([{ field: 'last_message_at', direction: -1 }]);
    expect(source.searchOptions).toEqual({ presence: true });
  });

  it('seeds UserSearchSource', () => {
    const client = getClientWithUser({ id: 'u1' });
    const source = new UserSearchSource(client, {
      filters: { role: { $eq: 'admin' } },
      sort: [{ field: 'name', direction: 1 }],
    });

    expect(source.filters).toEqual({ role: { $eq: 'admin' } });
    expect(source.sort).toEqual([{ field: 'name', direction: 1 }]);
  });

  it('seeds ChannelMemberSearchSource', () => {
    const client = getClientWithUser({ id: 'u1' });
    const source = new ChannelMemberSearchSource(channelStub(client), {
      filters: { user_id: 'user-2' },
      sort: [{ field: 'user_id', direction: 1 }],
    });

    expect(source.filters).toEqual({ user_id: 'user-2' });
    expect(source.sort).toEqual([{ field: 'user_id', direction: 1 }]);
  });

  it('seeds all six MessageSearchSource parameters', () => {
    const client = getClientWithUser({ id: 'u1' });
    const source = new MessageSearchSource(client, {
      channelQueryFilters: { type: 'team' },
      channelQueryOptions: { presence: false },
      channelQuerySort: [{ field: 'last_message_at', direction: -1 }],
      messageSearchChannelFilters: { type: 'messaging' },
      messageSearchFilters: { type: 'regular' },
      messageSearchSort: [{ field: 'created_at', direction: 1 }],
    });

    expect(source.messageSearchChannelFilters).toEqual({ type: 'messaging' });
    expect(source.messageSearchFilters).toEqual({ type: 'regular' });
    expect(source.messageSearchSort).toEqual([{ field: 'created_at', direction: 1 }]);
    expect(source.channelQueryFilters).toEqual({ type: 'team' });
    expect(source.channelQuerySort).toEqual([
      { field: 'last_message_at', direction: -1 },
    ]);
    expect(source.channelQueryOptions).toEqual({ presence: false });
  });

  it('seeds MentionsSearchSource user and member parameters', () => {
    const client = getClientWithUser({ id: 'u1' });
    const source = new MentionsSearchSource(channelStub(client), {
      memberFilters: { user_id: 'user-2' },
      memberSort: [{ field: 'user_id', direction: 1 }],
      userFilters: { role: { $eq: 'admin' } },
      userSort: [{ field: 'name', direction: 1 }],
    });

    expect(source.userFilters).toEqual({ role: { $eq: 'admin' } });
    expect(source.userSort).toEqual([{ field: 'name', direction: 1 }]);
    expect(source.memberFilters).toEqual({ user_id: 'user-2' });
    expect(source.memberSort).toEqual([{ field: 'user_id', direction: 1 }]);
  });

  it('leaves query parameters undefined when no options are given', () => {
    const client = getClientWithUser({ id: 'u1' });
    const source = new ChannelSearchSource(client);

    expect(source.filters).toBeUndefined();
    expect(source.sort).toBeUndefined();
    expect(source.searchOptions).toBeUndefined();
  });

  it('still honours the SearchSourceOptions passed alongside them', () => {
    const client = getClientWithUser({ id: 'u1' });
    const source = new ChannelSearchSource(client, {
      filters: { type: 'messaging' },
      pageSize: 42,
    });

    expect(source.pageSize).toBe(42);
    expect(source.filters).toEqual({ type: 'messaging' });
  });

  it('keeps property assignment working as the way to change them later', () => {
    const client = getClientWithUser({ id: 'u1' });
    const source = new ChannelSearchSource(client, { filters: { type: 'messaging' } });

    source.filters = { type: 'team' };

    expect(source.filters).toEqual({ type: 'team' });
  });
});
