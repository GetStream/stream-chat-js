import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChannelResponse, MessageResponse, StreamChat } from '../../../../src';
import { Thread } from '../../../../src';
import { generateUUIDv4 as uuidv4 } from '../../../../src/utils';
import { nowNs } from '../../../../src/utils/time';
import { generateChannel } from '../../test-utils/generateChannel';
import { generateMsg } from '../../test-utils/generateMessage';
import { generateThreadResponse } from '../../test-utils/generateThreadResponse';
import { getClientWithUser } from '../../test-utils/getClient';

describe('ThreadPaginator', () => {
  let client: StreamChat;
  let channelResponse: ChannelResponse;

  const makeThread = (id = uuidv4()) =>
    new Thread({
      client,
      threadData: generateThreadResponse(
        channelResponse,
        generateMsg({ id }) as MessageResponse,
      ),
    });
  const ids = () => (client.threads.paginator.items ?? []).map((thread) => thread.id);
  const respond = (threads: Thread[], next?: string) =>
    vi.spyOn(client, 'queryThreadsAndHydrate').mockResolvedValueOnce({ next, threads });

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
    channelResponse = generateChannel({ channel: { id: uuidv4() } })
      .channel as ChannelResponse;
  });

  it('flags the first load as a reload, with no items until it lands', async () => {
    respond([makeThread()]);

    const load = client.threads.reload();

    expect(client.threads.state.getLatestValue().isReloading).toBe(true);
    expect(client.threads.paginator.items).toBeUndefined();
    // `isLoading` is left to the next page.
    expect(client.threads.paginator.isLoading).toBe(false);
    await load;
    expect(client.threads.state.getLatestValue().isReloading).toBe(false);
    expect(ids()).toHaveLength(1);
  });

  describe('after a failed first load (master: `ready` stays false)', () => {
    const failFirstLoad = async () => {
      vi.spyOn(client, 'queryThreadsAndHydrate').mockRejectedValueOnce(
        new Error('offline'),
      );
      await client.threads.reload();
    };

    it('retries on the next unforced reload', async () => {
      await failFirstLoad();
      const query = respond([makeThread('a')]);

      await client.threads.reload();

      expect(query).toHaveBeenCalledTimes(2);
      expect(ids()).toEqual(['a']);
    });

    it('ignores replies until a load succeeds', async () => {
      client.threads.registerSubscriptions();
      await failFirstLoad();

      client.dispatchEvent({
        message: generateMsg({ parent_id: 'x' }) as MessageResponse,
        received_at: nowNs(),
        type: 'notification.thread_message_new',
      });

      expect(client.threads.state.getLatestValue().unseenThreadIds).toEqual([]);
      client.threads.unregisterSubscriptions();
    });

    it('does not load a next page', async () => {
      await failFirstLoad();
      const query = vi.spyOn(client, 'queryThreadsAndHydrate');

      await client.threads.loadNextPage();

      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('reload and next page are guarded independently (as on master)', () => {
    it('runs a reload while a next page is loading', async () => {
      respond([makeThread('a')], 'cursor');
      await client.threads.reload();
      respond([makeThread('b')]);
      const nextPage = client.threads.loadNextPage();
      const reloadQuery = respond([makeThread('c')]);

      await client.threads.reload({ force: true });
      await nextPage;

      expect(reloadQuery).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
      expect(ids()).toContain('c');
    });

    it('drops a second reload while one is in flight', async () => {
      respond([makeThread('a')]);
      await client.threads.reload();
      const query = respond([makeThread('b')]);

      const first = client.threads.reload({ force: true });
      await client.threads.reload({ force: true });
      await first;

      expect(query).toHaveBeenCalledTimes(2);
    });
  });

  it('appends pages in server order without blanking the loaded list', async () => {
    const [a, b, c] = [makeThread('a'), makeThread('b'), makeThread('c')];
    respond([c, a], 'next-cursor');
    await client.threads.reload();
    const blanked: boolean[] = [];
    client.threads.paginator.state.subscribe(({ items }) =>
      blanked.push(items === undefined),
    );
    respond([b]);

    await client.threads.loadNextPage();

    expect(ids()).toEqual(['c', 'a', 'b']);
    expect(blanked).not.toContain(true);
  });

  it('replaces the list in place on reload, keeping the items visible and reusing instances', async () => {
    const [a, b, c] = [makeThread('a'), makeThread('b'), makeThread('c')];
    respond([a, b]);
    await client.threads.reload();
    const snapshots: Array<{ isLoading: boolean; hasItems: boolean }> = [];
    client.threads.paginator.state.subscribe(({ isLoading, items }) =>
      snapshots.push({ hasItems: items !== undefined, isLoading }),
    );
    respond([c, makeThread('a')]);

    await client.threads.reload({ force: true });

    expect(ids()).toEqual(['c', 'a']);
    expect(client.threads.paginator.items?.[1]).toBe(a);
    expect(client.threads.get('b')).toBeUndefined();
    expect(snapshots.every(({ hasItems, isLoading }) => hasItems && !isLoading)).toBe(
      true,
    );
  });

  it('flags a reload on the manager while the list stays loaded', async () => {
    respond([makeThread('a')]);
    await client.threads.reload();
    const flags: boolean[] = [];
    client.threads.state.subscribe(({ isReloading }) => flags.push(isReloading));
    respond([makeThread('b')]);

    const reload = client.threads.reload({ force: true });

    expect(client.threads.state.getLatestValue().isReloading).toBe(true);
    expect(ids()).toEqual(['a']);
    await reload;
    expect(flags).toEqual([false, true, false]);
    expect(ids()).toEqual(['b']);
  });

  it('clears the reload flag and keeps the list and flags when a reload fails', async () => {
    respond([makeThread('a')]);
    await client.threads.reload();
    client.threads.state.partialNext({
      isThreadOrderStale: true,
      unseenThreadIds: ['x'],
    });
    vi.spyOn(client, 'queryThreadsAndHydrate').mockRejectedValueOnce(
      new Error('offline'),
    );

    await client.threads.reload();

    const { isReloading, isThreadOrderStale, unseenThreadIds } =
      client.threads.state.getLatestValue();
    expect(isReloading).toBe(false);
    expect(ids()).toEqual(['a']);
    // Kept for the next reload to pick up, as on master.
    expect(isThreadOrderStale).toBe(true);
    expect(unseenThreadIds).toEqual(['x']);
  });

  describe('after a successful but empty first load (master: `ready` is true)', () => {
    it('skips an unforced reload', async () => {
      const query = respond([]);
      await client.threads.reload();

      await client.threads.reload();

      expect(query).toHaveBeenCalledTimes(1);
      expect(client.threads.paginator.items).toEqual([]);
    });

    it('counts a reply to an unlisted thread as unseen', async () => {
      client.threads.registerSubscriptions();
      respond([]);
      await client.threads.reload();

      client.dispatchEvent({
        message: generateMsg({ parent_id: 'x' }) as MessageResponse,
        received_at: nowNs(),
        type: 'notification.thread_message_new',
      });

      expect(client.threads.state.getLatestValue().unseenThreadIds).toEqual(['x']);
      client.threads.unregisterSubscriptions();
    });
  });

  it('takes the response order on reload, even for threads it already holds', async () => {
    const [a, b] = [makeThread('a'), makeThread('b')];
    respond([a, b]);
    await client.threads.reload();
    respond([b, a]);

    await client.threads.reload({ force: true });

    expect(ids()).toEqual(['b', 'a']);
  });

  it('paginates again after a reload of a list that had reached its end', async () => {
    respond([makeThread('a'), makeThread('b')], 'first');
    await client.threads.reload();
    respond([makeThread('c')]);
    await client.threads.loadNextPage();
    expect(client.threads.paginator.hasMoreTail).toBe(false);
    respond([makeThread('c'), makeThread('a')], 'after-reload');

    await client.threads.reload({ force: true });

    expect(client.threads.paginator.hasMoreTail).toBe(true);
    const query = respond([makeThread('b')]);
    await client.threads.loadNextPage();
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ next: 'after-reload' }),
    );
    expect(ids()).toEqual(['c', 'a', 'b']);
  });

  it('treats a successful reload as a success after an earlier failure', async () => {
    respond([makeThread('a')], 'cursor');
    await client.threads.reload();
    vi.spyOn(client, 'queryThreadsAndHydrate').mockRejectedValueOnce(
      new Error('offline'),
    );
    await client.threads.loadNextPage();
    expect(client.threads.paginator.lastQueryError).toBeDefined();
    client.threads.state.partialNext({ unseenThreadIds: ['x'] });
    respond([makeThread('x'), makeThread('a')]);

    await client.threads.reload();

    expect(client.threads.paginator.lastQueryError).toBeUndefined();
    expect(client.threads.state.getLatestValue().unseenThreadIds).toEqual([]);
    expect(ids()).toEqual(['x', 'a']);
  });

  it('continues pagination from the cursor a reload returned', async () => {
    respond([makeThread('a')], 'first');
    await client.threads.reload();
    respond([makeThread('b')], 'after-reload');
    await client.threads.reload({ force: true });
    const query = respond([makeThread('c')]);

    await client.threads.loadNextPage();

    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({ next: 'after-reload' }),
    );
    expect(ids()).toEqual(['b', 'c']);
  });

  it('releases the list threads from the registry on reset', async () => {
    const listed = makeThread('listed');
    const opened = makeThread('opened');
    respond([listed, opened]);
    await client.threads.reload();
    opened.activate();

    client.threads.paginator.resetState();

    expect(client.threads.get('listed')).toBeUndefined();
    expect(client.threads.get('opened')).toBe(opened);
    expect(client.threads.isListed('opened')).toBe(false);
  });
});
