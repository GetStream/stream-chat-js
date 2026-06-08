import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamChat } from '../../../src/client';
import { UserGroupPaginator } from '../../../src/pagination';
import type { UserGroupResponse } from '../../../src/types';

const createUserGroup = (
  overrides: Partial<UserGroupResponse> = {},
): UserGroupResponse => ({
  id: 'group-1',
  name: 'Backend Support',
  created_at: '2026-01-01T00:00:00.000000000Z',
  updated_at: '2026-01-01T00:00:00.000000000Z',
  ...overrides,
});

describe('UserGroupPaginator', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api_key');
  });

  it('starts as a forward-only paginator', () => {
    const paginator = new UserGroupPaginator(client);

    expect(paginator.hasNext).toBe(true);
    expect(paginator.hasPrev).toBe(false);
    expect(paginator.items).toBeUndefined();
    expect(paginator.cursor).toBeUndefined();
  });

  it('paginates listed user groups using synthesized cursors', async () => {
    const firstPage = [
      createUserGroup({ id: 'group-1', created_at: '2026-01-01T00:00:00.000000000Z' }),
      createUserGroup({
        id: 'group-2',
        name: 'Frontend Support',
        created_at: '2026-01-02T00:00:00.000000000Z',
        updated_at: '2026-01-02T00:00:00.000000000Z',
      }),
    ];
    const secondPage = [
      createUserGroup({
        id: 'group-3',
        name: 'QA Support',
        created_at: '2026-01-03T00:00:00.000000000Z',
        updated_at: '2026-01-03T00:00:00.000000000Z',
      }),
    ];

    const querySpy = vi
      .spyOn(client, 'queryUserGroups')
      .mockResolvedValueOnce({ duration: '0.01s', user_groups: firstPage })
      .mockResolvedValueOnce({ duration: '0.01s', user_groups: secondPage });

    const paginator = new UserGroupPaginator(client, { pageSize: 2 });

    await paginator.next();

    expect(querySpy).toHaveBeenNthCalledWith(1, { limit: 2 });
    expect(paginator.items).toEqual(firstPage);
    expect(paginator.hasNext).toBe(true);
    expect(paginator.hasPrev).toBe(false);
    expect(JSON.parse(paginator.cursor?.next ?? '{}')).toEqual({
      created_at_gt: firstPage[1].created_at,
      id_gt: firstPage[1].id,
    });

    await paginator.next();

    expect(querySpy).toHaveBeenNthCalledWith(2, {
      limit: 2,
      created_at_gt: firstPage[1].created_at,
      id_gt: firstPage[1].id,
    });
    expect(paginator.items).toEqual([...firstPage, ...secondPage]);
    expect(paginator.hasNext).toBe(false);
    expect(paginator.hasPrev).toBe(false);
    expect(paginator.cursor).toEqual({ next: null, prev: null });
  });

  it('resets paginator state when team id changes', async () => {
    vi.spyOn(client, 'queryUserGroups').mockResolvedValue({
      duration: '0.01s',
      user_groups: [createUserGroup()],
    });

    const paginator = new UserGroupPaginator(client, { pageSize: 1 });

    await paginator.next();

    paginator.teamId = 'engineering';

    expect(paginator.items).toBeUndefined();
    expect(paginator.cursor).toBeUndefined();
    expect(paginator.hasNext).toBe(true);
    expect(paginator.hasPrev).toBe(false);
  });

  it('ignores malformed stored cursors and retries from the first page options', async () => {
    const querySpy = vi.spyOn(client, 'queryUserGroups').mockResolvedValue({
      duration: '0.01s',
      user_groups: [createUserGroup()],
    });

    const paginator = new UserGroupPaginator(client, { pageSize: 1 });
    paginator.state.partialNext({
      cursor: { next: '{not-json', prev: null },
    });

    await paginator.next();

    expect(querySpy).toHaveBeenCalledWith({ limit: 1 });
  });

  it('does not execute prev pagination requests', async () => {
    const querySpy = vi.spyOn(client, 'queryUserGroups');
    const paginator = new UserGroupPaginator(client);

    await paginator.prev();

    expect(querySpy).not.toHaveBeenCalled();
    expect(paginator.hasPrev).toBe(false);
  });
});
