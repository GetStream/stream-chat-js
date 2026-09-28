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

  it('publishes isLoading on the first load, like any paginator, with no items until it lands', async () => {
    respond([makeThread()]);

    const load = client.threads.reload();

    expect(client.threads.paginator.isLoading).toBe(true);
    expect(client.threads.paginator.items).toBeUndefined();
    await load;
    expect(client.threads.paginator.isLoading).toBe(false);
    expect(ids()).toHaveLength(1);
  });

  describe('after a failed first load (master: `ready` stays false)', () => {
    const failFirstLoad = async () => {
      vi.spyOn(client, 'queryThreadsAndHydrate').mockRejectedValueOnce(
        new Error('offline'),
      );
      await client.threads.reload();
    };

    it('clears isLoading and leaves nothing loaded', async () => {
      await failFirstLoad();

      expect(client.threads.paginator.isLoading).toBe(false);
      expect(client.threads.paginator.items).toBeUndefined();
    });

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

      await client.threads.paginator.toTail();

      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  it('counts a reply to an opened thread the list does not hold as unseen, as on master', async () => {
    client.threads.registerSubscriptions();
    respond([makeThread('a')]);
    await client.threads.reload();
    makeThread('opened').activate();

    client.dispatchEvent({
      message: generateMsg({ parent_id: 'opened' }) as MessageResponse,
      received_at: nowNs(),
      type: 'notification.thread_message_new',
    });

    const { isThreadOrderStale, unseenThreadIds } = client.threads.state.getLatestValue();
    expect(unseenThreadIds).toEqual(['opened']);
    expect(isThreadOrderStale).toBe(false);
    client.threads.unregisterSubscriptions();
  });

  describe('reload and next page are guarded independently (as on master)', () => {
    /** A `queryThreadsAndHydrate` call that resolves only when the test says so. */
    const respondLater = () => {
      let settle: (threads: Thread[], next?: string) => void = () => undefined;
      vi.spyOn(client, 'queryThreadsAndHydrate').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settle = (threads, next) => resolve({ next, threads });
          }),
      );
      return (threads: Thread[], next?: string) => settle(threads, next);
    };

    it('runs a reload while a next page is loading', async () => {
      respond([makeThread('a')], 'cursor');
      await client.threads.reload();
      const settleNextPage = respondLater();
      const nextPage = client.threads.paginator.toTail();
      const query = respond([makeThread('c')]);

      await client.threads.reload({ force: true });

      // first load, the pending next page, then the reload, without waiting for the page
      expect(query).toHaveBeenCalledTimes(3);
      expect(query).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1 }));
      settleNextPage([]);
      await nextPage;
    });

    it('runs a next page while a reload is loading', async () => {
      respond([makeThread('a')], 'cursor');
      await client.threads.reload();
      const settleReload = respondLater();
      const reload = client.threads.reload({ force: true });
      const query = respond([makeThread('b')]);

      await client.threads.paginator.toTail();

      expect(query).toHaveBeenCalledTimes(3);
      expect(query).toHaveBeenLastCalledWith(expect.objectContaining({ next: 'cursor' }));
      settleReload([makeThread('c')]);
      await reload;
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

    await client.threads.paginator.toTail();

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

  it('shows no loading state while a loaded list reloads, keeping it until the reload lands', async () => {
    respond([makeThread('a')]);
    await client.threads.reload();
    respond([makeThread('b')]);

    const reload = client.threads.reload({ force: true });

    expect(client.threads.paginator.isLoading).toBe(false);
    expect(ids()).toEqual(['a']);
    await reload;
    expect(ids()).toEqual(['b']);
  });

  it('keeps the list and flags when a reload fails, and lets the next reload run', async () => {
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

    const { isThreadOrderStale, unseenThreadIds } = client.threads.state.getLatestValue();
    expect(ids()).toEqual(['a']);
    // Kept for the next reload to pick up, as on master.
    expect(isThreadOrderStale).toBe(true);
    expect(unseenThreadIds).toEqual(['x']);
    respond([makeThread('b')]);
    await client.threads.reload();
    expect(ids()).toEqual(['b']);
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
    await client.threads.paginator.toTail();
    expect(client.threads.paginator.hasMoreTail).toBe(false);
    respond([makeThread('c'), makeThread('a')], 'after-reload');

    await client.threads.reload({ force: true });

    expect(client.threads.paginator.hasMoreTail).toBe(true);
    const query = respond([makeThread('b')]);
    await client.threads.paginator.toTail();
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
    await client.threads.paginator.toTail();
    expect(client.threads.paginator.lastQueryError).toBeDefined();
    client.threads.state.partialNext({ unseenThreadIds: ['x'] });
    respond([makeThread('x'), makeThread('a')]);

    await client.threads.reload();

    expect(client.threads.paginator.lastQueryError).toBeUndefined();
    expect(client.threads.state.getLatestValue().unseenThreadIds).toEqual([]);
    expect(ids()).toEqual(['x', 'a']);
  });

  it('keeps the list and cursor after a failed next page, so the next one retries', async () => {
    respond([makeThread('a')], 'cursor');
    await client.threads.reload();
    vi.spyOn(client, 'queryThreadsAndHydrate').mockRejectedValueOnce(
      new Error('offline'),
    );

    await client.threads.paginator.toTail();

    expect(ids()).toEqual(['a']);
    expect(client.threads.paginator.hasMoreTail).toBe(true);
    const query = respond([makeThread('b')]);
    await client.threads.paginator.toTail();
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({ next: 'cursor' }));
    expect(ids()).toEqual(['a', 'b']);
  });

  it('continues pagination from the cursor a reload returned', async () => {
    respond([makeThread('a')], 'first');
    await client.threads.reload();
    respond([makeThread('b')], 'after-reload');
    await client.threads.reload({ force: true });
    const query = respond([makeThread('c')]);

    await client.threads.paginator.toTail();

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
    expect(client.threads.paginator.getItem('opened')).toBeUndefined();
  });
});
