import { describe, expect, it, beforeEach, afterEach, vi, MockInstance } from 'vitest';
import {
  AbstractOfflineDB,
  ChannelAPIResponse,
  ChannelManager,
  StreamChat,
  Event,
  Channel,
  MessageResponse,
  ReadResponse,
} from '../../../src';

import { generateChannel } from '../test-utils/generateChannel';
import { generateReadResponse } from '../test-utils/generateReadResponse';
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

    describe('queriesWithChannelGuard', () => {
      let createQueries: ReturnType<typeof vi.fn>;

      beforeEach(() => {
        createQueries = vi.fn(async () => [{ sql: 'MOCK_QUERY', args: [] }]);
      });

      it('returns createQueries result when no cid is present', async () => {
        const event: Event = { type: 'message.new' };
        const result = await offlineDb.queriesWithChannelGuard({ event }, createQueries);

        expect(createQueries).toHaveBeenCalledWith(true);
        expect(result).toEqual([{ sql: 'MOCK_QUERY', args: [] }]);
      });

      it('upserts channel data when channel does not exist and channel data is present in the event', async () => {
        const event: Event = {
          type: 'message.new',
          cid: 'channel:123',
          channel: { id: '123', type: 'messaging' } as any,
        };

        offlineDb.channelExists.mockResolvedValue(false);
        offlineDb.upsertChannelData.mockResolvedValue([{ sql: 'UPSERT', args: [] }]);
        const clientChannelSpy = vi.spyOn(client, 'channel');

        const result = await offlineDb.queriesWithChannelGuard({ event }, createQueries);

        expect(offlineDb.channelExists).toHaveBeenCalledWith({ cid: 'channel:123' });
        expect(offlineDb.upsertChannelData).toHaveBeenCalledWith({
          channel: event.channel,
          execute: false,
        });
        expect(clientChannelSpy).not.toHaveBeenCalled();
        expect(offlineDb.executeSqlBatch).toHaveBeenCalledWith([
          { sql: 'UPSERT', args: [] },
          { sql: 'MOCK_QUERY', args: [] },
        ]);
        expect(result).toEqual([
          { sql: 'UPSERT', args: [] },
          { sql: 'MOCK_QUERY', args: [] },
        ]);
      });

      it('uses client.channel when channel data is not present in event', async () => {
        const mockChannelData = { id: '123', type: 'messaging' };
        const mockChannel = {
          initialized: true,
          disconnected: false,
          data: mockChannelData,
        };

        const clientChannelSpy = vi
          .spyOn(client, 'channel')
          .mockReturnValue(mockChannel as unknown as Channel);

        const event: Event = {
          type: 'message.new',
          cid: 'channel:123',
          channel_type: 'messaging',
          channel_id: '123',
        };

        offlineDb.channelExists.mockResolvedValue(false);
        offlineDb.upsertChannelData.mockResolvedValue([{ sql: 'UPSERT', args: [] }]);

        const result = await offlineDb.queriesWithChannelGuard({ event }, createQueries);

        expect(clientChannelSpy).toHaveBeenCalledWith('messaging', '123');
        expect(offlineDb.upsertChannelData).toHaveBeenCalledWith({
          channel: mockChannelData,
          execute: false,
        });
        expect(offlineDb.executeSqlBatch).toHaveBeenCalledWith([
          { sql: 'UPSERT', args: [] },
          { sql: 'MOCK_QUERY', args: [] },
        ]);
        expect(result).toEqual([
          { sql: 'UPSERT', args: [] },
          { sql: 'MOCK_QUERY', args: [] },
        ]);
      });

      it('returns empty array and logs warning when channel data is missing', async () => {
        const event: Event = {
          type: 'message.new',
          cid: 'channel:123',
          channel_type: 'messaging',
          channel_id: '123',
        };

        offlineDb.channelExists.mockResolvedValue(false);

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await offlineDb.queriesWithChannelGuard({ event }, createQueries);

        // TODO: testing against warning logs seems silly, please rethink this
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Received message.new event for a non initialized channel that is not in DB, skipping event',
          { event },
        );
        expect(result).toEqual([]);

        consoleWarnSpy.mockRestore();
      });

      it('returns createQueries result directly when channel exists and forceUpdate is false', async () => {
        const event: Event = {
          type: 'message.new',
          cid: 'channel:123',
        };

        offlineDb.channelExists.mockResolvedValue(true);

        const result = await offlineDb.queriesWithChannelGuard({ event }, createQueries);

        expect(offlineDb.channelExists).toHaveBeenCalledWith({ cid: 'channel:123' });
        expect(createQueries).toHaveBeenCalledWith(true);
        expect(result).toEqual([{ sql: 'MOCK_QUERY', args: [] }]);
      });

      it('does not execute queries when execute is false', async () => {
        const event: Event = {
          type: 'message.new',
          cid: 'channel:123',
          channel: { id: '123', type: 'messaging' } as any,
        };

        offlineDb.channelExists.mockResolvedValue(false);
        offlineDb.upsertChannelData.mockResolvedValue([{ sql: 'UPSERT', args: [] }]);

        const result = await offlineDb.queriesWithChannelGuard(
          { event, execute: false },
          createQueries,
        );

        expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();
        expect(result).toEqual([
          { sql: 'UPSERT', args: [] },
          { sql: 'MOCK_QUERY', args: [] },
        ]);
      });

      it('should reject if channelExists throws', async () => {
        offlineDb.channelExists.mockRejectedValue(new Error('DB failure'));
        const event: Event = {
          type: 'message.new',
          cid: 'channel:123',
          channel_type: 'messaging',
          channel_id: '123',
        };

        await expect(
          offlineDb.queriesWithChannelGuard({ event }, createQueries),
        ).rejects.toThrow('DB failure');
      });

      it('should reject if upsertChannelData throws when channelExists returns false', async () => {
        offlineDb.channelExists.mockResolvedValue(false);
        offlineDb.upsertChannelData.mockRejectedValue(new Error('Upsert failed'));

        const event: Event = {
          type: 'message.new',
          cid: 'channel:123',
          channel_type: 'messaging',
          channel_id: '123',
        };

        const mockChannelData = { id: '123', type: 'messaging' };
        const mockChannel = {
          initialized: true,
          disconnected: false,
          data: mockChannelData,
        };

        vi.spyOn(client, 'channel').mockReturnValue(mockChannel as unknown as Channel);

        await expect(
          offlineDb.queriesWithChannelGuard({ event }, createQueries),
        ).rejects.toThrow('Upsert failed');
      });

      it('should reject if createQueries throws', async () => {
        offlineDb.channelExists.mockResolvedValue(true);
        createQueries.mockRejectedValue(new Error('Query generation failed'));

        const event: Event = {
          type: 'message.new',
          cid: 'messaging:123',
          channel_type: 'messaging',
          channel_id: '123',
        };

        await expect(
          offlineDb.queriesWithChannelGuard({ event }, createQueries),
        ).rejects.toThrow('Query generation failed');
      });
    });

    describe('ws event handlers', () => {
      const baseEvent: Event = {
        type: 'message.new',
        cid: 'messaging:channel123',
        message: {
          id: 'msg-1',
          text: 'Hello!',
        } as unknown as MessageResponse,
        user: { id: 'user-b' },
      };
      let queriesWithChannelGuardSpy: MockInstance<
        typeof offlineDb.queriesWithChannelGuard
      >;
      let channelResponse: ChannelAPIResponse;
      let readResponse: ReadResponse;

      beforeEach(() => {
        queriesWithChannelGuardSpy = vi.spyOn(offlineDb, 'queriesWithChannelGuard');
        vi.spyOn(offlineDb, 'channelExists').mockResolvedValue(true);
        readResponse = generateReadResponse({ user: client.user });
        channelResponse = generateChannel({
          channel: { id: 'channel123', type: 'messaging' },
          read: [readResponse],
        } as ChannelAPIResponse);
        client.hydrateActiveChannels([channelResponse]);

        // to make sure queriesWithChannelGuard always passes
        offlineDb.channelExists.mockResolvedValue(true);
      });

      afterEach(() => {
        vi.resetAllMocks();
      });
      describe('handleNewMessage', () => {
        const mockUpsertMessagesQueries = [
          'INSERT INTO messages',
          'INSERT INTO messages',
        ];
        const mockUpsertReadsQueries = ['INSERT INTO reads', 'DELETE * FROM reads'];
        const mockQueries = [...mockUpsertMessagesQueries, ...mockUpsertReadsQueries];

        beforeEach(() => {
          offlineDb.upsertMessages.mockResolvedValue(mockUpsertMessagesQueries);
          offlineDb.upsertReads.mockResolvedValue(mockUpsertReadsQueries);
        });

        it('should return empty array if message is missing', async () => {
          const result = await offlineDb.handleNewMessage({
            event: { ...baseEvent, message: undefined },
          });
          expect(result).toEqual([]);
          expect(queriesWithChannelGuardSpy).not.toHaveBeenCalled();
        });

        it('should return empty array if message is a thread reply and not shown in channel', async () => {
          const result = await offlineDb.handleNewMessage({
            event: {
              ...baseEvent,
              message: {
                ...baseEvent.message!,
                parent_id: 'msg-parent',
                show_in_channel: false,
              },
            },
          });
          expect(result).toEqual([]);
          expect(queriesWithChannelGuardSpy).not.toHaveBeenCalled();
        });

        it('should call all queries and executeSqlBatch when execute is true', async () => {
          const result = await offlineDb.handleNewMessage({
            event: baseEvent,
            execute: true,
          });

          expect(offlineDb.upsertMessages).toHaveBeenCalledWith({
            execute: false,
            messages: [baseEvent.message],
          });
          expect(offlineDb.upsertReads).toHaveBeenCalledWith({
            cid: baseEvent.cid,
            execute: false,
            reads: [readResponse],
          });
          expect(offlineDb.executeSqlBatch).toHaveBeenCalledWith(mockQueries);
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: baseEvent, execute: true },
            expect.any(Function),
          );
          expect(result).toEqual(mockQueries);
        });

        it('should not call upsertReads if event.user is the same as client user', async () => {
          const eventWithSameUser = { ...baseEvent, user: client.user };

          const result = await offlineDb.handleNewMessage({
            event: eventWithSameUser,
            execute: false,
          });

          expect(offlineDb.upsertMessages).toHaveBeenCalled();
          expect(offlineDb.upsertReads).not.toHaveBeenCalled();
          expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: eventWithSameUser, execute: false },
            expect.any(Function),
          );
          expect(result).toEqual(mockUpsertMessagesQueries);
        });

        it('should not call upsertReads event.cid does not exist in client.activeChannels', async () => {
          const eventWithDifferentCid = { ...baseEvent, cid: 'channel321' };

          const result = await offlineDb.handleNewMessage({
            event: eventWithDifferentCid,
            execute: false,
          });

          expect(offlineDb.upsertMessages).toHaveBeenCalled();
          expect(offlineDb.upsertReads).not.toHaveBeenCalled();
          expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: eventWithDifferentCid, execute: false },
            expect.any(Function),
          );
          expect(result).toEqual(mockUpsertMessagesQueries);
        });

        it('should not call executeSqlBatch if execute is false', async () => {
          const result = await offlineDb.handleNewMessage({
            event: baseEvent,
            execute: false,
          });

          expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: baseEvent, execute: false },
            expect.any(Function),
          );
          expect(result).toEqual(mockQueries);
        });

        it('should propagate error if upsertMessages throws', async () => {
          offlineDb.upsertMessages.mockRejectedValue(
            new Error('Upserting messages has failed'),
          );

          await expect(offlineDb.handleNewMessage({ event: baseEvent })).rejects.toThrow(
            'Upserting messages has failed',
          );
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: baseEvent, execute: true },
            expect.any(Function),
          );
        });

        it('should propagate error if queriesWithChannelGuard throws', async () => {
          queriesWithChannelGuardSpy.mockRejectedValue(new Error('guard failed'));

          await expect(offlineDb.handleNewMessage({ event: baseEvent })).rejects.toThrow(
            'guard failed',
          );
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: baseEvent, execute: true },
            expect.any(Function),
          );
        });
      });

      describe('handleDeleteMessage', () => {
        const deletedEvent: Event = {
          ...baseEvent,
          type: 'message.deleted',
        };

        beforeEach(() => {
          vi.clearAllMocks();

          offlineDb.softDeleteMessage.mockResolvedValue([['DELETE soft']]);
          offlineDb.hardDeleteMessage.mockResolvedValue([['DELETE hard']]);
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it('soft deletes a message by default and executes SQL batch', async () => {
          const result = await offlineDb.handleDeleteMessage({ event: deletedEvent });

          expect(offlineDb.softDeleteMessage).toHaveBeenCalledWith({
            id: deletedEvent.message?.id,
            execute: true,
          });
          expect(offlineDb.hardDeleteMessage).not.toHaveBeenCalled();
          expect(result).toEqual([['DELETE soft']]);
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: deletedEvent, execute: true },
            expect.any(Function),
          );
        });

        it('hard deletes a message when `hard_delete` is true', async () => {
          const eventWithHardDelete = { ...deletedEvent, hard_delete: true };
          const result = await offlineDb.handleDeleteMessage({
            event: eventWithHardDelete,
          });

          expect(offlineDb.hardDeleteMessage).toHaveBeenCalledWith({
            id: deletedEvent.message?.id,
            execute: true,
          });
          expect(offlineDb.softDeleteMessage).not.toHaveBeenCalled();
          expect(result).toEqual([['DELETE hard']]);
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: eventWithHardDelete, execute: true },
            expect.any(Function),
          );
        });

        it('returns an empty array if no message is present on the event', async () => {
          const result = await offlineDb.handleDeleteMessage({
            event: { type: 'message.deleted' },
          });

          expect(result).toEqual([]);
          expect(offlineDb.softDeleteMessage).not.toHaveBeenCalled();
          expect(offlineDb.hardDeleteMessage).not.toHaveBeenCalled();
          expect(queriesWithChannelGuardSpy).not.toHaveBeenCalled();
        });

        it('does not execute the queries if execute is false', async () => {
          const result = await offlineDb.handleDeleteMessage({
            event: deletedEvent,
            execute: false,
          });

          expect(offlineDb.softDeleteMessage).toHaveBeenCalledWith({
            id: deletedEvent.message?.id,
            execute: false,
          });
          expect(result).toEqual([['DELETE soft']]);
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: deletedEvent, execute: false },
            expect.any(Function),
          );
        });

        it('handles errors gracefully from softDeleteMessage', async () => {
          offlineDb.softDeleteMessage.mockRejectedValue(new Error('soft delete failed'));

          await expect(
            offlineDb.handleDeleteMessage({ event: deletedEvent }),
          ).rejects.toThrow('soft delete failed');
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: deletedEvent, execute: true },
            expect.any(Function),
          );
        });

        it('handles errors gracefully from hardDeleteMessage', async () => {
          const eventWithHardDelete = { ...deletedEvent, hard_delete: true };
          offlineDb.hardDeleteMessage.mockRejectedValue(new Error('hard delete failed'));

          await expect(
            offlineDb.handleDeleteMessage({
              event: eventWithHardDelete,
            }),
          ).rejects.toThrow('hard delete failed');
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: eventWithHardDelete, execute: true },
            expect.any(Function),
          );
        });
      });

      describe('handleRemoveMessage', () => {
        const messageId = 'message-123';

        beforeEach(() => {
          offlineDb.dropPendingTasks.mockResolvedValue([['DROP pending tasks']]);
          offlineDb.hardDeleteMessage.mockResolvedValue([['DELETE hard']]);
          offlineDb.executeSqlBatch.mockResolvedValue(undefined);
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it('drops pending tasks and hard deletes the message, executing the queries', async () => {
          const result = await offlineDb.handleRemoveMessage({ messageId });

          expect(offlineDb.dropPendingTasks).toHaveBeenCalledWith({
            messageId,
            execute: false,
          });
          expect(offlineDb.hardDeleteMessage).toHaveBeenCalledWith({
            id: messageId,
            execute: false,
          });
          expect(offlineDb.executeSqlBatch).toHaveBeenCalledWith([
            ['DROP pending tasks'],
            ['DELETE hard'],
          ]);
          expect(result).toEqual([['DROP pending tasks'], ['DELETE hard']]);
        });

        it('returns queries without executing them when execute is false', async () => {
          const result = await offlineDb.handleRemoveMessage({
            messageId,
            execute: false,
          });

          expect(offlineDb.dropPendingTasks).toHaveBeenCalledWith({
            messageId,
            execute: false,
          });
          expect(offlineDb.hardDeleteMessage).toHaveBeenCalledWith({
            id: messageId,
            execute: false,
          });
          expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();
          expect(result).toEqual([['DROP pending tasks'], ['DELETE hard']]);
        });

        it('handles errors from dropPendingTasks gracefully', async () => {
          offlineDb.dropPendingTasks.mockRejectedValue(new Error('drop failed'));

          await expect(offlineDb.handleRemoveMessage({ messageId })).rejects.toThrow(
            'drop failed',
          );
        });

        it('handles errors from hardDeleteMessage gracefully', async () => {
          offlineDb.hardDeleteMessage.mockRejectedValue(new Error('hard delete failed'));

          await expect(offlineDb.handleRemoveMessage({ messageId })).rejects.toThrow(
            'hard delete failed',
          );
        });
      });

      describe('handleRead', () => {
        let readEvent: Event;

        beforeEach(() => {
          readEvent = {
            ...baseEvent,
            cid: 'channel-123',
            user: { id: 'user-1', name: 'Alice' },
            last_read_message_id: 'msg-987',
            received_at: '2023-01-01T00:00:00Z',
            unread_messages: 3,
          };
          offlineDb.upsertReads.mockResolvedValue([['UPSERT read']]);
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it('inserts read with provided unreadMessages override and executes the batch', async () => {
          const result = await offlineDb.handleRead({
            event: readEvent,
            unreadMessages: 5,
          });

          expect(offlineDb.upsertReads).toHaveBeenCalledWith({
            cid: readEvent.cid,
            execute: true,
            reads: [
              {
                last_read: readEvent.received_at,
                last_read_message_id: readEvent.last_read_message_id,
                unread_messages: 5,
                user: readEvent.user,
              },
            ],
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: readEvent, execute: true },
            expect.any(Function),
          );
          expect(result).toEqual([['UPSERT read']]);
        });

        it('inserts read using event.unread_messages when no override is provided', async () => {
          const result = await offlineDb.handleRead({
            event: readEvent,
          });

          expect(offlineDb.upsertReads).toHaveBeenCalledWith({
            cid: readEvent.cid,
            execute: true,
            reads: [
              {
                last_read: readEvent.received_at,
                last_read_message_id: readEvent.last_read_message_id,
                unread_messages: readEvent.unread_messages,
                user: readEvent.user,
              },
            ],
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: readEvent, execute: true },
            expect.any(Function),
          );
          expect(result).toEqual([['UPSERT read']]);
        });

        it('skips execution if execute is false', async () => {
          const result = await offlineDb.handleRead({
            event: readEvent,
            execute: false,
          });

          expect(offlineDb.upsertReads).toHaveBeenCalledWith({
            cid: readEvent.cid,
            execute: false,
            reads: [
              {
                last_read: readEvent.received_at,
                last_read_message_id: readEvent.last_read_message_id,
                unread_messages: readEvent.unread_messages,
                user: readEvent.user,
              },
            ],
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: readEvent, execute: false },
            expect.any(Function),
          );
          expect(result).toEqual([['UPSERT read']]);
        });

        it('returns empty array if user is missing', async () => {
          const result = await offlineDb.handleRead({
            event: { ...readEvent, user: undefined },
          });

          expect(result).toEqual([]);
          expect(offlineDb.upsertReads).not.toHaveBeenCalled();
          expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();
          expect(queriesWithChannelGuardSpy).not.toHaveBeenCalled();
        });

        it('returns empty array if cid is missing', async () => {
          const result = await offlineDb.handleRead({
            event: { ...readEvent, cid: undefined },
          });

          expect(result).toEqual([]);
          expect(offlineDb.upsertReads).not.toHaveBeenCalled();
          expect(queriesWithChannelGuardSpy).not.toHaveBeenCalled();
        });

        it('handles errors from upsertReads', async () => {
          offlineDb.upsertReads.mockRejectedValue(new Error('Upserting reads failed.'));

          await expect(offlineDb.handleRead({ event: baseEvent })).rejects.toThrow(
            'Upserting reads failed.',
          );
        });
      });
    });
  });
});
