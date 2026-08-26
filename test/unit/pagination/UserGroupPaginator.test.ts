import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamChat } from '../../../src/client';
import { UserGroupPaginator } from '../../../src/pagination';
import type { UserGroupResponse } from '../../../src/types';

const createUserGroup = (
  overrides: Partial<UserGroupResponse> = {},
): UserGroupResponse => ({
  id: 'group-1',
  name: 'Backend Support',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('UserGroupPaginator', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api_key');
  });

  it('starts as a forward-only paginator', () => {
    const paginator = new UserGroupPaginator(client);

    expect(paginator.hasMoreTail).toBe(true);
    expect(paginator.hasMoreHead).toBe(false);
    expect(paginator.items).toBeUndefined();
    expect(paginator.cursor).toEqual({ tailward: undefined, headward: null });
  });

  it('paginates listed user groups using synthesized cursors', async () => {
    const firstPage = [
      createUserGroup({
        id: 'group-1',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      }),
      createUserGroup({
        id: 'group-2',
        name: 'Frontend Support',
        created_at: new Date('2026-01-02T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
      }),
    ];
    const secondPage = [
      createUserGroup({
        id: 'group-3',
        name: 'QA Support',
        created_at: new Date('2026-01-03T00:00:00.000Z'),
        updated_at: new Date('2026-01-03T00:00:00.000Z'),
      }),
    ];

    const querySpy = vi
      .spyOn(client, 'listUserGroups')
      .mockResolvedValueOnce({ duration: '0.01s', user_groups: firstPage })
      .mockResolvedValueOnce({ duration: '0.01s', user_groups: secondPage });

    const paginator = new UserGroupPaginator(client, { pageSize: 2 });

    await paginator.toTail();

    expect(querySpy).toHaveBeenNthCalledWith(1, { limit: 2 });
    expect(paginator.items).toEqual(firstPage);
    expect(paginator.hasMoreTail).toBe(true);
    expect(paginator.hasMoreHead).toBe(false);
    expect(JSON.parse(paginator.cursor?.tailward ?? '{}')).toEqual({
      created_at_gt: firstPage[1].created_at.toISOString(),
      id_gt: firstPage[1].id,
    });

    await paginator.toTail();

    expect(querySpy).toHaveBeenNthCalledWith(2, {
      limit: 2,
      created_at_gt: firstPage[1].created_at.toISOString(),
      id_gt: firstPage[1].id,
    });
    expect(paginator.items).toEqual([...firstPage, ...secondPage]);
    expect(paginator.hasMoreTail).toBe(false);
    expect(paginator.hasMoreHead).toBe(false);
    // forward-only: headward stays exhausted, tailward exhausted after the short page
    expect(paginator.cursor?.headward).toBeNull();
    expect(paginator.cursor?.tailward == null).toBe(true);
  });

  it('resets paginator state when team id changes', async () => {
    vi.spyOn(client, 'listUserGroups').mockResolvedValue({
      duration: '0.01s',
      user_groups: [createUserGroup()],
    });

    const paginator = new UserGroupPaginator(client, { pageSize: 1 });

    await paginator.toTail();

    paginator.teamId = 'engineering';

    expect(paginator.items).toBeUndefined();
    expect(paginator.cursor).toEqual({ tailward: undefined, headward: null });
    expect(paginator.hasMoreTail).toBe(true);
    expect(paginator.hasMoreHead).toBe(false);
  });

  it('ignores malformed stored cursors and retries from the first page options', async () => {
    const querySpy = vi.spyOn(client, 'listUserGroups').mockResolvedValue({
      duration: '0.01s',
      user_groups: [createUserGroup()],
    });

    const paginator = new UserGroupPaginator(client, { pageSize: 1 });
    paginator.state.partialNext({
      cursor: { tailward: '{not-json', headward: null },
    });

    await paginator.toTail();

    expect(querySpy).toHaveBeenCalledWith({ limit: 1 });
  });

  it('does not execute prev pagination requests', async () => {
    const querySpy = vi.spyOn(client, 'listUserGroups');
    const paginator = new UserGroupPaginator(client);

    await paginator.toHead();

    expect(querySpy).not.toHaveBeenCalled();
    expect(paginator.hasMoreHead).toBe(false);
  });
});
