import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChannelResponse, MessageResponse, StreamChat } from '../../../../src';
import { Thread } from '../../../../src';
import { generateUUIDv4 as uuidv4 } from '../../../../src/utils';
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

  it('shows no items while the first page loads', async () => {
    const snapshots: Array<{ isLoading: boolean; hasItems: boolean }> = [];
    client.threads.paginator.state.subscribe(({ isLoading, items }) =>
      snapshots.push({ hasItems: items !== undefined, isLoading }),
    );
    respond([makeThread()]);

    await client.threads.reload();

    expect(snapshots).toContainEqual({ hasItems: false, isLoading: true });
    expect(snapshots.at(-1)).toEqual({ hasItems: true, isLoading: false });
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

  it('clears the reload flag and keeps the list when a reload fails', async () => {
    respond([makeThread('a')]);
    await client.threads.reload();
    vi.spyOn(client, 'queryThreadsAndHydrate').mockRejectedValueOnce(
      new Error('offline'),
    );

    await client.threads.reload({ force: true });

    expect(client.threads.state.getLatestValue().isReloading).toBe(false);
    expect(ids()).toEqual(['a']);
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
