import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StreamChat, UserGroupResponse } from '../../../../src';
import { UserGroupPaginator } from '../../../../src/pagination/paginators/UserGroupPaginator';
import { getClientWithUser } from '../../test-utils/getClient';
import { convertDateToTimestamp } from '../../test-utils/time';

const makeGroup = (id: string, createdAt: string): UserGroupResponse => ({
  id,
  name: id,
  created_at: convertDateToTimestamp(createdAt),
  updated_at: convertDateToTimestamp(new Date(createdAt)),
});

const response = (groups: UserGroupResponse[]) => ({ duration: '', user_groups: groups });

describe('UserGroupPaginator', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
  });

  it('stores results in interval storage (index-addressable, headItems populated)', async () => {
    const paginator = new UserGroupPaginator(client, { pageSize: 2 });
    vi.spyOn(client, 'listUserGroups').mockResolvedValue(
      response([
        makeGroup('a', '2020-01-01T00:00:00.000Z'),
        makeGroup('b', '2020-01-02T00:00:00.000Z'),
      ]),
    );

    await paginator.executeQuery({});

    expect(paginator.items?.map((g) => g.id)).toEqual(['a', 'b']);
    // interval storage: items are now resolvable by id and mirrored into the head window
    expect(paginator.getItem('a')?.id).toBe('a');
    expect(paginator.getItem('b')?.id).toBe('b');
    expect(paginator.headItems.map((g) => g.id)).toEqual(['a', 'b']);
    // full page -> more forward; backward pagination is disabled for this listing
    expect(paginator.hasMoreTail).toBe(true);
    expect(paginator.hasMoreHead).toBe(false);
  });

  it('appends forward pages and stops at a short (final) page', async () => {
    const paginator = new UserGroupPaginator(client, { pageSize: 2 });
    const spy = vi.spyOn(client, 'listUserGroups');
    spy.mockResolvedValueOnce(
      response([
        makeGroup('a', '2020-01-01T00:00:00.000Z'),
        makeGroup('b', '2020-01-02T00:00:00.000Z'),
      ]),
    );
    await paginator.executeQuery({});
    expect(paginator.hasMoreTail).toBe(true);

    spy.mockResolvedValueOnce(response([makeGroup('c', '2020-01-03T00:00:00.000Z')]));
    await paginator.toTail();

    expect(paginator.items?.map((g) => g.id)).toEqual(['a', 'b', 'c']);
    expect(paginator.hasMoreTail).toBe(false);
    expect(paginator.cursor?.tailward).toBeNull();
    // the forward request carried the cursor derived from the previous last item
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id_gt: 'b',
        created_at_gt: '2020-01-02T00:00:00.000000000Z',
      }),
    );
  });

  it('carries sub-millisecond precision so the boundary item cannot repeat', async () => {
    const paginator = new UserGroupPaginator(client, { pageSize: 2 });
    const spy = vi.spyOn(client, 'listUserGroups');
    const boundary = makeGroup('b', '2020-01-02T00:00:00.000Z');
    // 123392ns past the millisecond (a multiple of the ~256ns quantum a double holds at this
    // magnitude, so it survives the round trip exactly).
    boundary.created_at += 123392;
    spy.mockResolvedValueOnce(
      response([makeGroup('a', '2020-01-01T00:00:00.000Z'), boundary]),
    );
    await paginator.executeQuery({});

    spy.mockResolvedValueOnce(response([makeGroup('c', '2020-01-03T00:00:00.000Z')]));
    await paginator.toTail();

    // Flooring to milliseconds would emit '2020-01-02T00:00:00.000Z', which is strictly less
    // than `boundary.created_at` — so a strict `created_at_gt` would return it a second time.
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        created_at_gt: '2020-01-02T00:00:00.000123392Z',
        id_gt: 'b',
      }),
    );
  });

  it('dedupes by id when a group is returned again', async () => {
    const paginator = new UserGroupPaginator(client, { pageSize: 2 });
    const spy = vi.spyOn(client, 'listUserGroups');
    spy.mockResolvedValueOnce(
      response([
        makeGroup('a', '2020-01-01T00:00:00.000Z'),
        makeGroup('b', '2020-01-02T00:00:00.000Z'),
      ]),
    );
    await paginator.executeQuery({});

    spy.mockResolvedValueOnce(
      response([
        makeGroup('b', '2020-01-02T00:00:00.000Z'), // duplicate
        makeGroup('c', '2020-01-03T00:00:00.000Z'),
      ]),
    );
    await paginator.toTail();

    expect(paginator.items?.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders by created_at/id via the comparator even if the server returns out of order', async () => {
    const paginator = new UserGroupPaginator(client, { pageSize: 3 });
    vi.spyOn(client, 'listUserGroups').mockResolvedValue(
      response([
        makeGroup('b', '2020-01-02T00:00:00.000Z'),
        makeGroup('a', '2020-01-01T00:00:00.000Z'),
        makeGroup('c', '2020-01-03T00:00:00.000Z'),
      ]),
    );

    await paginator.executeQuery({});

    expect(paginator.items?.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not paginate backward (headward is exhausted)', async () => {
    const paginator = new UserGroupPaginator(client, { pageSize: 2 });
    const spy = vi
      .spyOn(client, 'listUserGroups')
      .mockResolvedValue(response([makeGroup('a', '2020-01-01T00:00:00.000Z')]));
    await paginator.executeQuery({});
    spy.mockClear();

    await paginator.toHead();

    expect(spy).not.toHaveBeenCalled();
    expect(paginator.hasMoreHead).toBe(false);
  });
});
