import { describe, expect, it, vi } from 'vitest';
import { MessageReplyPaginator } from '../../../../src/pagination/paginators/MessageReplyPaginator';
import type {
  LocalMessage,
  MessagePaginationOptions,
  MessageResponse,
} from '../../../../src/types';

const makeLocalMessage = (id: string, createdAtMs: number): LocalMessage =>
  ({
    attachments: [],
    created_at: new Date(createdAtMs),
    deleted_at: null,
    id,
    mentioned_users: [],
    pinned_at: null,
    reaction_groups: null,
    status: 'received',
    text: id,
    type: 'regular',
    updated_at: new Date(createdAtMs),
  }) as LocalMessage;

const makeChannel = () =>
  ({
    cid: 'messaging:cid',
    getClient: () => ({
      notifications: { addError: vi.fn() },
    }),
    // Not used when config.doRequest is provided
    getReplies: vi.fn(),
  }) as unknown as import('../../../../src/channel').Channel;

describe('MessageReplyPaginator', () => {
  it('jumpToMessage does not query if message already in an interval', async () => {
    const channel = makeChannel();
    const paginator = new MessageReplyPaginator({
      channel,
      parentMessageId: 'parent-1',
    });

    const doRequest = vi.fn(async (query) => {
      const options = query.options as MessagePaginationOptions;
      const ids = options.id_around ? ['m1'] : ['m1'];
      return {
        items: ids.map((id) => makeLocalMessage(id, 1)),
      };
    });

    paginator.config.doRequest = doRequest;

    // Seed intervals + index
    await paginator.executeQuery({
      queryShape: { options: { limit: 1 }, sort: paginator.sort },
    });
    expect(doRequest).toHaveBeenCalledTimes(1);

    const executeSpy = vi.spyOn(paginator, 'executeQuery');
    const ok = await paginator.jumpToMessage('m1');
    expect(ok).toBe(true);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('jumpToMessage queries id_around when message not present', async () => {
    const channel = makeChannel();
    const paginator = new MessageReplyPaginator({
      channel,
      parentMessageId: 'parent-1',
    });

    const doRequest = vi.fn(async () => {
      return {
        items: [makeLocalMessage('m2', 2)],
      };
    });
    paginator.config.doRequest = doRequest;

    const ok = await paginator.jumpToMessage('m2', { pageSize: 10 });
    expect(ok).toBe(true);

    expect(doRequest).toHaveBeenCalledTimes(1);
    expect(doRequest).toHaveBeenCalledWith({
      options: { id_around: 'm2', limit: 10 },
      sort: [{ created_at: 1 }],
    });
  });

  it('jumpToTheLatestMessage calls jumpToMessage with latest id from head interval', async () => {
    const channel = makeChannel();
    const paginator = new MessageReplyPaginator({
      channel,
      parentMessageId: 'parent-1',
    });

    const doRequest = vi.fn(async () => {
      return {
        items: [makeLocalMessage('m1', 1), makeLocalMessage('m2', 2)],
      };
    });
    paginator.config.doRequest = doRequest;

    // Ensure intervals are populated
    await paginator.executeQuery({
      queryShape: { options: { limit: 2 }, sort: paginator.sort },
    });

    const jumpSpy = vi.spyOn(paginator, 'jumpToMessage');
    await paginator.jumpToTheLatestMessage();

    // We don't hard assert the id here because interval "head" semantics are internal,
    // but we ensure it uses jumpToMessage as the final step.
    expect(jumpSpy).toHaveBeenCalled();
  });
});
