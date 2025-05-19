import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  AbstractOfflineDB,
  ChannelAPIResponse,
  ChannelManager,
  StreamChat,
} from '../../../src';

// import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from '../test-utils/getClient';
import * as utils from '../../../src/utils';

export class MockOfflineDB extends AbstractOfflineDB {
  constructor({ client }: { client: StreamChat }) {
    super({ client });
  }

  upsertCidsForQuery = vi.fn();
  upsertChannels = vi.fn();
  upsertUserSyncStatus = vi.fn();
  upsertAppSettings = vi.fn();
  upsertPoll = vi.fn();
  upsertChannelData = vi.fn();
  upsertReads = vi.fn();
  upsertMessages = vi.fn();
  upsertMembers = vi.fn();
  updateMessage = vi.fn();
  getChannels = vi.fn();
  getChannelsForQuery = vi.fn();
  getAllChannelCids = vi.fn();
  getLastSyncedAt = vi.fn();
  getAppSettings = vi.fn();
  getReactions = vi.fn();
  addPendingTask = vi.fn();
  deletePendingTask = vi.fn();
  deleteReaction = vi.fn();
  deleteMember = vi.fn();
  deleteChannel = vi.fn();
  deleteMessagesForChannel = vi.fn();
  dropPendingTasks = vi.fn();
  hardDeleteMessage = vi.fn();
  softDeleteMessage = vi.fn();
  getPendingTasks = vi.fn();
  updateReaction = vi.fn();
  insertReaction = vi.fn();
  channelExists = vi.fn();
  resetDB = vi.fn();
  executeSqlBatch = vi.fn();
  initializeDB = vi.fn();
}

describe('OfflineSupportApi', () => {
  let client: StreamChat;
  let channelManager: ChannelManager;
  let channelsResponse: ChannelAPIResponse[];

  beforeEach(async () => {
    client = await getClientWithUser();
    channelManager = client.createChannelManager({});
    channelManager.registerSubscriptions();

    // channelsResponse = [
    //   generateChannel({ channel: { id: 'channel1' } }),
    //   generateChannel({ channel: { id: 'channel2' } }),
    //   generateChannel({ channel: { id: 'channel3' } }),
    // ];
    // client.hydrateActiveChannels(channelsResponse);
    // const channels = channelsResponse.map((c) =>
    //   client.channel(c.channel.type, c.channel.id),
    // );
    // channelManager.state.partialNext({ channels, initialized: true });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('instantiation and initialization', () => {
    it('should properly set the offline db and get initial state', async () => {
      expect(client.offlineDb).toBeUndefined();
      client.setOfflineDBApi(new MockOfflineDB({ client }));
      expect(client.offlineDb).toBeDefined();
      const { initialized, userId } = client.offlineDb!.state.getLatestValue() ?? {};
      expect(initialized).toBe(false);
      expect(userId).toBe(client.userID);
    });

    it('should not set client.offlineDb if it has already been set', async () => {
      const firstInstance = new MockOfflineDB({ client });
      const secondInstance = new MockOfflineDB({ client });

      client.setOfflineDBApi(firstInstance);
      client.setOfflineDBApi(secondInstance);

      expect(client.offlineDb).toBe(firstInstance);
      expect(client.offlineDb).not.toBe(secondInstance);
    });

    it('should properly initialize the offline db', async () => {
      client.setOfflineDBApi(new MockOfflineDB({ client }));
      const initializeDBSpy = vi
        .spyOn(client.offlineDb!, 'initializeDB')
        .mockResolvedValue(true);
      const initSyncManagerSpy = vi.spyOn(client.offlineDb?.syncManager!, 'init');
      await client.offlineDb!.init(client.userID as unknown as string);

      expect(initializeDBSpy).toHaveBeenCalledOnce();
      expect(initSyncManagerSpy).toHaveBeenCalledOnce();

      const { initialized, userId } = client.offlineDb?.state.getLatestValue() ?? {};

      expect(initialized).toBe(true);
      expect(userId).toBe(client.userID);
    });

    it('should handle offlineDb.initializeDB failing', async () => {
      client.setOfflineDBApi(new MockOfflineDB({ client }));
      const initializeDBSpy = vi
        .spyOn(client.offlineDb!, 'initializeDB')
        .mockResolvedValue(false);
      const initSyncManagerSpy = vi.spyOn(client.offlineDb?.syncManager!, 'init');
      await client.offlineDb!.init(client.userID as unknown as string);

      expect(initializeDBSpy).toHaveBeenCalledOnce();
      expect(initSyncManagerSpy).not.toHaveBeenCalled();

      const { initialized, userId } = client.offlineDb?.state.getLatestValue() ?? {};

      expect(initialized).toBe(false);
      expect(userId).toBe(client.userID);
    });

    it('should gracefully handle the state on exceptions during initialization', async () => {
      client.setOfflineDBApi(new MockOfflineDB({ client }));
      const initializeDBSpy = vi
        .spyOn(client.offlineDb!, 'initializeDB')
        .mockResolvedValue(true);
      const initSyncManagerSpy = vi
        .spyOn(client.offlineDb?.syncManager!, 'init')
        .mockRejectedValue(new Error('Sync manager init failed.'));
      await client.offlineDb!.init(client.userID as unknown as string);

      expect(initializeDBSpy).toHaveBeenCalledOnce();
      expect(initSyncManagerSpy).toHaveBeenCalledOnce();

      const { initialized, userId } = client.offlineDb?.state.getLatestValue() ?? {};

      expect(initialized).toBe(false);
      expect(userId).toBe(undefined);
    });

    it('should not initialize again if already initialized with the same user ID', async () => {
      client.setOfflineDBApi(new MockOfflineDB({ client }));
      const initializeDBSpy = vi
        .spyOn(client.offlineDb!, 'initializeDB')
        .mockResolvedValue(true);
      const initSyncManagerSpy = vi.spyOn(client.offlineDb?.syncManager!, 'init');
      await client.offlineDb!.init(client.userID as unknown as string);
      await client.offlineDb!.init(client.userID as unknown as string);
      await client.offlineDb!.init(client.userID as unknown as string);

      expect(initializeDBSpy).toHaveBeenCalledOnce();
      expect(initSyncManagerSpy).toHaveBeenCalledOnce();

      const { initialized, userId } = client.offlineDb?.state.getLatestValue() ?? {};

      expect(initialized).toBe(true);
      expect(userId).toBe(client.userID);
    });

    it('should reinitialize if the userId changes', async () => {
      client.setOfflineDBApi(new MockOfflineDB({ client }));
      const initializeDBSpy = vi
        .spyOn(client.offlineDb!, 'initializeDB')
        .mockResolvedValue(true);
      const initSyncManagerSpy = vi.spyOn(client.offlineDb?.syncManager!, 'init');
      await client.offlineDb!.init(client.userID as unknown as string);
      await client.offlineDb!.init('user123');

      expect(initializeDBSpy).toHaveBeenCalledTimes(2);
      expect(initSyncManagerSpy).toHaveBeenCalledTimes(2);

      const { initialized, userId } = client.offlineDb?.state.getLatestValue() ?? {};

      expect(initialized).toBe(true);
      expect(userId).toBe('user123');
    });

    describe('offlineDb.shouldInitialize', () => {
      beforeEach(() => {
        client.setOfflineDBApi(new MockOfflineDB({ client }));
      });

      afterEach(() => {
        vi.resetAllMocks();
      });

      it('returns true when userId matches and initialized is true', () => {
        client.offlineDb!.state.partialNext({ userId: 'user123', initialized: true });

        expect(client.offlineDb!.shouldInitialize('user123')).toBe(true);
      });

      it('returns false when userId matches but initialized is false', () => {
        client.offlineDb!.state.partialNext({ userId: 'user123', initialized: false });

        expect(client.offlineDb!.shouldInitialize('user123')).toBe(false);
      });

      it('returns false when userId does not match even if initialized is true', () => {
        client.offlineDb!.state.partialNext({ userId: 'userABC', initialized: true });

        expect(client.offlineDb!.shouldInitialize('user123')).toBe(false);
      });

      it('returns false when userId does not match and initialized is false', () => {
        client.offlineDb!.state.partialNext({ userId: 'userABC', initialized: false });

        expect(client.offlineDb!.shouldInitialize('user123')).toBe(false);
      });
    });
  });

  describe('queries and query utilities', () => {
    let offlineDb: MockOfflineDB;

    beforeEach(async () => {
      offlineDb = new MockOfflineDB({ client });
      vi.spyOn(offlineDb!, 'initializeDB').mockResolvedValue(true);
      await offlineDb.init(client.userID as unknown as string);
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('calls runDetached when initialized is true', async () => {
      const queryCallback = vi.fn().mockResolvedValue('result');
      const runDetachedSpy = vi.spyOn(utils, 'runDetached');

      offlineDb.executeQuerySafely(queryCallback, { method: 'testMethod' });

      expect(queryCallback).toHaveBeenCalledWith(offlineDb);
      expect(runDetachedSpy).toHaveBeenCalledTimes(1);
      expect(runDetachedSpy).toHaveBeenCalledWith(expect.any(Promise), {
        context: 'OfflineDB(testMethod)',
      });
    });

    it('does not call runDetached when initialized is false', async () => {
      const queryCallback = vi.fn().mockResolvedValue('result');
      const runDetachedSpy = vi.spyOn(utils, 'runDetached');

      offlineDb.state.partialNext({ initialized: false });

      offlineDb.executeQuerySafely(queryCallback, { method: 'testMethod' });

      expect(queryCallback).not.toHaveBeenCalled();
      expect(runDetachedSpy).not.toHaveBeenCalled();
    });
  });
});
