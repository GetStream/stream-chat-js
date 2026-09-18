import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChannelWatchStatus,
  Thread,
  type Channel,
  type MessageResponse,
  type StreamChat,
} from '../../src';
import { generateMsg } from './test-utils/generateMessage';
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

  /**
   * A reconnect, which is what starts a recovery: the socket drops and comes back.
   *
   * Both halves matter. Recovery is driven by the socket's status store rather than by an event, and
   * it ignores a first connect — nothing was loaded to fall behind — so a client that has only ever
   * been online has nothing to recover.
   */
  const online = () => {
    client.wsConnection._setStatus({ isHealthy: false });
    client.wsConnection._setStatus({ isHealthy: true, connectionId: 'reconnected-id' });
  };
  const offline = () => client.wsConnection._setStatus({ isHealthy: false });

  /** A channel a consumer has declared it is reading, i.e. what recovery reloads. */
  const activeChannel = (id: string) => {
    const channel = client.channel('messaging', id);
    channel.initialized = true;
    channel.activate();
    const reload = vi.spyOn(channel, 'reload').mockResolvedValue(undefined);
    return { channel, reload };
  };

  /** Builds a thread the way a UI SDK does, without activating or adopting it. */
  const buildThread = (id: string) => {
    const channel = client.channel('messaging', `channel-for-${id}`);
    channel.initialized = true;
    const thread = new Thread({
      client,
      channel,
      parentMessage: channel.state.formatMessage(
        generateMsg({ id, cid: channel.cid }) as MessageResponse,
      ),
    });
    const reload = vi.spyOn(thread, 'reload').mockResolvedValue(undefined);
    return { thread, reload, channel };
  };

  /** Mirrors what the UI SDKs do once a thread's replies have loaded: put it in the manager's list. */
  const adopt = (thread: Thread) =>
    client.threads.state.next((current) => ({
      ...current,
      threads: [thread, ...current.threads],
    }));

  /**
   * A thread a consumer is displaying: adopted into the manager (so it is reachable through
   * `threadsById`) and activated (so recovery selects it out of everything else in the list).
   */
  const activeThread = (id: string) => {
    const built = buildThread(id);
    adopt(built.thread);
    built.thread.activate();
    return built;
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

    it('reloads the thread a consumer is displaying, not every thread in the list', async () => {
      const { reload } = activeThread('open-thread');
      // Also in the list, but nobody is reading it: reloading every paged-in thread on reconnect
      // would be a burst of `getThreadAndHydrate` calls for rows on a screen, which is exactly what
      // the `active` filter exists to prevent. `ThreadManager.reload()` refreshes the list itself.
      const idle = buildThread('idle-thread');
      adopt(idle.thread);
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(idle.reload).not.toHaveBeenCalled();
    });

    it('KNOWN GAP: skips an active thread that has not been adopted into the manager', async () => {
      // Not desired behaviour — a pin on an accepted trade-off. Recovery finds threads through
      // `threadsById`, i.e. the thread LIST, and a thread opened from a message list only lands there
      // once the UI SDK adopts it (after its replies load). A reconnect inside that window misses it,
      // as does one after `ThreadManager.reload()` evicts it. Fixing this means giving `ThreadManager`
      // a real off-list registry (its commented-out `threadCache`); when that lands, this test should
      // be inverted rather than deleted.
      const { thread, reload } = buildThread('active-but-unadopted');
      thread.activate();
      expect(client.threads.threadsById[thread.id]).toBeUndefined();
      const { reload: channelReload } = activeChannel('still-open');
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      online();
      // Anchored on a reload that provably happens in the same pass.
      await vi.waitFor(() => expect(channelReload).toHaveBeenCalledTimes(1));
      expect(reload).not.toHaveBeenCalled();
    });

    it('leaves a thread nobody is displaying alone', async () => {
      const { thread, reload } = activeThread('closed-thread');
      // Closing the thread screen deactivates it; recovery must then skip it entirely.
      thread.deactivate();
      const { reload: channelReload } = activeChannel('still-open');
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      online();
      // Anchored on a reload that provably happens in the same pass, so the negative cannot pass
      // merely by being asserted before anything ran.
      await vi.waitFor(() => expect(channelReload).toHaveBeenCalledTimes(1));
      expect(reload).not.toHaveBeenCalled();
    });

    it('skips a thread whose channel is being torn down', async () => {
      const { thread, reload, channel } = activeThread('doomed-thread');
      channel.pendingDisposal = true;
      const { reload: channelReload } = activeChannel('still-open');
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      online();
      await vi.waitFor(() => expect(channelReload).toHaveBeenCalledTimes(1));
      expect(reload).not.toHaveBeenCalled();
      expect(thread.state.getLatestValue().active).toBe(true);
    });

    it('one thread failing does not stop the channels or the other threads', async () => {
      const { reload: failing } = activeThread('failing-thread');
      failing.mockRejectedValue(new Error('thread reload failed'));
      const { reload: healthy } = activeThread('healthy-thread');
      const { reload: channelReload } = activeChannel('active');
      vi.spyOn(client.channelManager, 'recover').mockResolvedValue([]);

      online();
      await vi.waitFor(() => {
        expect(healthy).toHaveBeenCalledTimes(1);
        expect(channelReload).toHaveBeenCalledTimes(1);
      });
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

  describe('a reconnect landing mid-recovery', () => {
    it('does not start a second pass alongside the first', async () => {
      // The trigger is a subscription to the socket's status store, so a reload that moves that
      // status calls straight back in before the first `await`. Without the guard that recurses
      // until the stack gives out.
      const { reload } = activeChannel('re-entrant');
      let reloads = 0;
      reload.mockImplementation(async () => {
        reloads += 1;
        client.wsConnection._setStatus({ isHealthy: false });
        client.wsConnection._setStatus({ isHealthy: true, connectionId: 'flapped' });
      });
      client.connectionRecovery.registerSubscriptions();

      online();
      await vi.waitFor(() => expect(reloads).toBeGreaterThan(0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // One pass, plus the single deferred retry the reconnect earns. Never more, however many
      // times the reload moves the socket.
      expect(reloads).toBe(2);
    });

    it('runs once more so the reconnect is not stranded', async () => {
      // The pass in flight withholds its event because the socket moved under it, so without the
      // retry nothing would bring the newer connection's state back in line.
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      const { reload } = activeChannel('deferred');
      let reloads = 0;
      reload.mockImplementation(async () => {
        reloads += 1;
        // Only the first pass flaps; the retry then runs against a steady socket.
        if (reloads > 1) return;
        client.wsConnection._setStatus({ isHealthy: false });
        client.wsConnection._setStatus({ isHealthy: true, connectionId: 'flapped' });
      });
      client.connectionRecovery.registerSubscriptions();

      online();

      await vi.waitFor(() => expect(reloads).toBe(2));
      await vi.waitFor(() => expect(recovered).toHaveBeenCalledTimes(1));
    });
  });

  describe('recover() while one is already running', () => {
    it('does not start a second pass', async () => {
      // The guard logged and then carried on. Two passes reload every active channel twice and race
      // on the in-flight flag: the second clears it while the first is still going.
      const { reload } = activeChannel('reloaded-twice');
      let release = () => {};
      reload.mockImplementation(
        () => new Promise<void>((resolve) => (release = () => resolve())),
      );

      const first = client.connectionRecovery.recover();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

      await client.connectionRecovery.recover();

      expect(reload).toHaveBeenCalledTimes(1);
      release();
      await first;
    });
  });

  describe('the socket dropping mid-recovery', () => {
    it('withholds connection.recovered when the socket drops while the reloads run', async () => {
      // The network half alone did not cover this. A socket dying on a working network is the more
      // common of the two — a server close, an expired token, a health check timing out — and it
      // fails every reload just the same, so announcing recovery afterwards is the same lie.
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      const { reload } = activeChannel('socket-drops-midway');
      reload.mockImplementation(async () => {
        client.wsConnection._setStatus({ isHealthy: false });
        throw new Error('socket is gone');
      });
      client.connectionRecovery.registerSubscriptions();

      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(recovered).not.toHaveBeenCalled();
    });

    it('withholds it even when the socket drops and returns inside the recovery', async () => {
      // Same reason the network half compares timestamps: a flap ends online while having failed
      // the reloads.
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      const { reload } = activeChannel('socket-flaps');
      reload.mockImplementation(async () => {
        client.wsConnection._setStatus({ isHealthy: false });
        client.wsConnection._setStatus({ isHealthy: true, connectionId: 'back-again' });
      });
      client.connectionRecovery.registerSubscriptions();

      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(recovered).not.toHaveBeenCalled();
    });

    it('still dispatches when nothing dropped', async () => {
      // The guard has to stay quiet on the ordinary path, including on a host with no network
      // reporter, where the device's status is unknown rather than offline.
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      activeChannel('uneventful');
      client.wsConnection._setStatus({ isHealthy: true, connectionId: 'steady' });

      await client.connectionRecovery.recover();

      expect(recovered).toHaveBeenCalledTimes(1);
    });
  });

  describe('the device network', () => {
    // Recovery reads the socket and nothing else. Every reload is a request over that socket, so it
    // is the connection whose failure invalidates them; a device that loses its network takes the
    // socket with it and is caught that way. Reading the network as well meant a host that cannot
    // report one — React Native without a reporter, Node, server-side rendering — got different
    // behaviour from one that can, for a signal that adds nothing.

    it('starts no recovery when only the network comes back', async () => {
      // Recovery re-establishes channel *watches*, which are keyed by connection ID, so it has to
      // wait for a reconnected socket. A network edge on its own is too early.
      const { reload } = activeChannel('network-only');
      client.connectionRecovery.registerSubscriptions();

      client.networkConnection.setStatus(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(reload).not.toHaveBeenCalled();
    });

    it('recovers on a socket reconnect even while the device reports no network', async () => {
      // The socket is up, which is all recovery needs. Blocking on a contradictory network reading
      // would strand the client until something else happened to reconnect it.
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      const { reload } = activeChannel('contradictory');
      client.connectionRecovery.registerSubscriptions();
      client.networkConnection.setStatus(false);

      online();

      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
      await vi.waitFor(() => expect(recovered).toHaveBeenCalled());
    });

    it('does not withhold connection.recovered for a network drop the socket survived', async () => {
      // A network reading that flaps while the socket keeps carrying traffic has not failed
      // anything, and the reloads it did not interrupt are as fresh as any other.
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      const { reload } = activeChannel('network-flaps');
      reload.mockImplementation(async () => {
        client.networkConnection.setStatus(false);
        client.networkConnection.setStatus(true);
      });
      client.connectionRecovery.registerSubscriptions();

      online();

      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
      await vi.waitFor(() => expect(recovered).toHaveBeenCalled());
    });

    it('behaves identically when no reporter is installed', async () => {
      // The case the socket-derived stand-in exists for, and the one that used to differ: with the
      // network unknown, recovery now takes exactly the path it takes when the network is known.
      const recovered = vi.fn();
      client.on('connection.recovered', recovered);
      const { reload } = activeChannel('unknown-network');
      client.connectionRecovery.registerSubscriptions();

      // No reporter was supplied, so the device's status is whatever the socket-derived stand-in
      // says. Recovery does not read it either way, which is the point.
      online();
      await vi.waitFor(() => expect(reload).toHaveBeenCalled());
      await vi.waitFor(() => expect(recovered).toHaveBeenCalled());
    });
  });

  describe('connectionRecovery.enabled: false', () => {
    it('recovers nothing', async () => {
      // The kill switch is declarative configuration now, read when a recovery actually runs — so it
      // is honoured from the next reconnect without the manager being re-wired.
      client.config.set({ client: { connectionRecovery: { enabled: false } } });
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
      // `connection.changed` is ever dispatched and `isSynced` stays stale-true across the outage.
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
