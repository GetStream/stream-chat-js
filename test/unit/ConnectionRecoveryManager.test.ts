import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelWatchStatus, type Channel, type StreamChat } from '../../src';
// @ts-expect-error - untyped test helper
import { getClientWithUser } from './test-utils/getClient';
import { MockOfflineDB } from './offline-support/MockOfflineDB';

/**
 * Connection recovery is the reconnect contract: after the socket comes back, the surfaces the app is
 * consuming have to be brought back in line with the server. These tests pin the two things that make
 * it correct rather than merely present — WHICH surfaces are refreshed, and WHEN relative to the
 * offline pending-task replay and sync.
 */
describe('ConnectionRecoveryManager', () => {
  let client: StreamChat;

  const online = () => client.dispatchEvent({ type: 'connection.changed', online: true });
  const offline = () =>
    client.dispatchEvent({ type: 'connection.changed', online: false });

  /** A channel a consumer has declared it is reading, i.e. what recovery reloads. */
  const activeChannel = (id: string) => {
    const channel = client.channel('messaging', id);
    channel.initialized = true;
    channel.activate();
    const reload = vi.spyOn(channel, 'reload').mockResolvedValue(undefined);
    return { channel, reload };
  };

  beforeEach(() => {
    client = getClientWithUser({ id: 'me' }) as StreamChat;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('what it recovers', () => {
    it('reloads active channels and re-runs the channel lists', async () => {
      const { reload } = activeChannel('active');
      const recoverLists = vi
        .spyOn(client.channelManager, 'recover')
        .mockResolvedValue([]);

      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(recoverLists).toHaveBeenCalledTimes(1);
    });

    it('leaves channels nobody is reading alone', async () => {
      const idle = client.channel('messaging', 'idle');
      idle.initialized = true;
      // Watched before the drop, but not active — it must NOT be eagerly re-queried. Such channels
      // come back demand-driven, when an event proves them relevant.
      idle.watchStatus = ChannelWatchStatus.WasWatching;
      const reload = vi.spyOn(idle, 'reload').mockResolvedValue(undefined);
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      online();
      await vi.waitFor(() => expect(client.channelManager.recover).toHaveBeenCalled());
      expect(reload).not.toHaveBeenCalled();
    });

    it('never sends a bulk `cid: { $in: … }` query', async () => {
      // The removed `recoverState()` recovered by querying the whole instance cache with a hardcoded
      // limit of 30. Nothing may reintroduce that: recovery is each list's own query plus the active
      // channels' own reloads.
      activeChannel('active');
      const queryChannels = vi
        .spyOn(client, 'queryChannels')
        .mockResolvedValue({ channels: [] } as never);

      online();
      await client.connectionRecovery.recover();

      expect(queryChannels).not.toHaveBeenCalled();
    });

    it('skips a channel pending disposal', async () => {
      const { channel, reload } = activeChannel('disposing');
      channel.pendingDisposal = true;
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      await client.connectionRecovery.recover();

      expect(reload).not.toHaveBeenCalled();
    });

    it('reloads an active channel that was never watched, e.g. opened while offline', async () => {
      // Regression guard. Opening a channel with no connection leaves it `offlineMode` with
      // `watchStatus: NotWatching`, because its `watch()` threw before recording a watch. Filtering
      // recovery on `WasWatching` would strand exactly that channel forever — it would never load its
      // messages, on any subsequent reconnect. `Channel.reload()`'s own `initialized || offlineMode`
      // check is the correct gate.
      const channel = client.channel('messaging', 'opened-offline');
      channel.offlineMode = true;
      channel.activate();
      expect(channel.watchStatus).to.equal(ChannelWatchStatus.NotWatching);
      const reload = vi.spyOn(channel, 'reload').mockResolvedValue(undefined);

      await client.connectionRecovery.recover();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reloads exactly once per reconnect (offline support off)', async () => {
      // Mirror of the offline-on case: with no offline DB there is no sync edge, so the direct call
      // is the only path. Settle before re-asserting — a late duplicate would satisfy a bare count.
      const { reload } = activeChannel('active');
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not stop at the first channel that fails', async () => {
      const { reload: failing } = activeChannel('failing');
      const { reload: healthy } = activeChannel('healthy');
      failing.mockRejectedValue(new Error('nope'));
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      await client.connectionRecovery.recover();

      expect(failing).toHaveBeenCalledTimes(1);
      expect(healthy).toHaveBeenCalledTimes(1);
    });
  });

  describe('connection.recovered', () => {
    it('is dispatched after the reload, on a path `recoverState()` never runs on', async () => {
      // `recoverState()` is only ever called by `StableWSConnection._reconnect()`, so a
      // `closeConnection()` → `openConnection()` cycle (mobile backgrounding) used to produce no
      // `connection.recovered` at all. Consumers that key post-recovery work off it — marking a
      // caught-up channel read, for one — silently did nothing there.
      const order: string[] = [];
      const { channel } = activeChannel('active');
      vi.spyOn(channel, 'reload').mockImplementation(async () => {
        order.push('reload');
      });
      client.on('connection.recovered', () => order.push('recovered'));

      online();

      await vi.waitFor(() => expect(order).to.deep.equal(['reload', 'recovered']));
    });

    it('is dispatched once per recovery', async () => {
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      activeChannel('active');

      await client.connectionRecovery.recover();

      expect(recovered).toHaveBeenCalledTimes(1);
    });

    it('is still dispatched when a reload fails', async () => {
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      const { reload } = activeChannel('failing');
      reload.mockRejectedValue(new Error('nope'));

      await client.connectionRecovery.recover();

      expect(recovered).toHaveBeenCalledTimes(1);
    });
  });

  describe('recoverStateOnReconnect: false', () => {
    it('recovers nothing', async () => {
      client.recoverStateOnReconnect = false;
      const { reload } = activeChannel('active');
      const recoverLists = vi
        .spyOn(client.channelManager, 'recover')
        .mockResolvedValue([]);

      online();
      await client.connectionRecovery.recover();

      expect(reload).not.toHaveBeenCalled();
      expect(recoverLists).not.toHaveBeenCalled();
    });
  });

  describe('offline support: ordering', () => {
    let db: MockOfflineDB;

    const attachDb = async () => {
      db = new MockOfflineDB({ client });
      db.getPendingTasks.mockResolvedValue([]);
      db.getAllChannelCids.mockResolvedValue([]);
      db.getLastSyncedAt.mockResolvedValue(new Date().toString());
      db.initializeDB.mockResolvedValue(true);
      client.setOfflineDBApi(db);
      await db.init('me');
      return db;
    };

    it('waits for pending-task replay and sync before reloading, on the closeConnection path', async () => {
      // The path worth pinning: `closeConnection()` sets `isHealthy` directly, so no offline
      // `connection.changed` is ever dispatched and `syncStatus` stays stale-true across the outage.
      // Anything that polled that flag would conclude "already synced" and query ahead of the replay.
      // The sync-status EDGE has no such problem: the sync manager publishes it unconditionally after
      // `executePendingTasks()` → `sync()` on every online transition.
      const order: string[] = [];
      await attachDb();

      const { channel } = activeChannel('active');
      vi.spyOn(channel, 'reload').mockImplementation(async () => {
        order.push('reload');
      });
      vi.spyOn(client, 'sync').mockImplementation(async () => {
        order.push('sync');
        return { events: [] } as never;
      });
      db.getAllChannelCids.mockResolvedValue([channel.cid]);
      db.executePendingTasks = vi.fn().mockImplementation(async () => {
        order.push('executePendingTasks');
      });

      online();

      await vi.waitFor(() => expect(order).to.contain('reload'));
      expect(order).to.deep.equal(['executePendingTasks', 'sync', 'reload']);
    });

    it('still reloads when the sync fails', async () => {
      // The sync manager isolates replay and sync so the status edge is published either way. A
      // failed sync must degrade to possibly-stale data, never to a recovery that never happens.
      await attachDb();
      const { reload } = activeChannel('active');
      db.executePendingTasks = vi.fn().mockRejectedValue(new Error('replay failed'));
      vi.spyOn(client, 'sync').mockRejectedValue(new Error('sync failed'));

      online();

      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    });

    it('does not reload off connection.changed once the DB is initialized', async () => {
      // Two triggers would mean two reloads per reconnect: the raw event and the post-sync edge.
      await attachDb();
      const { reload } = activeChannel('active');
      // Never resolve the sync, so the edge never arrives.
      db.executePendingTasks = vi.fn().mockImplementation(() => new Promise(() => {}));

      online();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(reload).not.toHaveBeenCalled();
    });

    it('falls back to connection.changed when the DB never initializes', async () => {
      // An offline DB whose `init()` failed publishes no sync-status edge, so keying recovery solely
      // on it would cost recovery altogether.
      const failing = new MockOfflineDB({ client });
      failing.initializeDB.mockResolvedValue(false);
      client.setOfflineDBApi(failing);
      await failing.init('me');
      expect(failing.state.getLatestValue().initialized).to.equal(false);

      const { reload } = activeChannel('active');

      online();

      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    });

    it('reloads exactly once per reconnect, and stays at once', async () => {
      // Exactly one of the two paths in `registerSubscriptions` may run: binding the sync-status
      // subscription is what hands active-channel recovery to the edge, so the direct call must be
      // skipped. Asserting only "was called" would not catch a double, and neither would asserting
      // the count immediately — a duplicate arriving late would still satisfy it. So settle first,
      // then re-assert.
      await attachDb();
      const { reload } = activeChannel('active');
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('recovers again on a second reconnect', async () => {
      await attachDb();
      const { reload } = activeChannel('active');

      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      offline();
      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    });
  });
});
