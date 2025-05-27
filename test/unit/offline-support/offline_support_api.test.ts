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
  ChannelMemberResponse,
  ChannelResponse,
  PendingTask,
  APIErrorResponse,
  OfflineDBSyncManager,
  StableWSConnection,
} from '../../../src';

import { generateChannel } from '../test-utils/generateChannel';
import { generateReadResponse } from '../test-utils/generateReadResponse';
import { generatePendingTask } from '../test-utils/generatePendingTask';
import { getClientWithUser } from '../test-utils/getClient';
import * as utils from '../../../src/utils';
import { AxiosError } from 'axios';
import { MockOfflineDB } from './MockOfflineDB';

describe('OfflineSupportApi', () => {
  let client: StreamChat;
  let channelManager: ChannelManager;

  beforeEach(async () => {
    client = await getClientWithUser();
    channelManager = client.createChannelManager({});
    channelManager.registerSubscriptions();
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

      describe('handleMemberEvent', () => {
        const memberAddedEvent: Event = {
          member: { id: 'member1' } as ChannelMemberResponse,
          cid: 'messaging:channel123',
          type: 'member.added',
          channel: { id: 'channel123', type: 'messaging' } as ChannelResponse,
        };

        const memberRemovedEvent: Event = {
          ...memberAddedEvent,
          type: 'member.removed',
        };

        beforeEach(() => {
          // to make it easier for queriesWithChannelGuard to run
          offlineDb.upsertChannelData.mockResolvedValue([]);
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it('returns empty query array if no member or cid exist', async () => {
          const noMemberEvent = { ...memberAddedEvent, member: undefined };
          expect(await offlineDb.handleMemberEvent({ event: noMemberEvent })).toEqual([]);

          const noCidEvent = { ...memberAddedEvent, cid: undefined };
          expect(await offlineDb.handleMemberEvent({ event: noCidEvent })).toEqual([]);
        });

        it('calls upsertMembers inside queriesWithChannelGuard for member.added event', async () => {
          offlineDb.upsertMembers.mockResolvedValue(['INSERT INTO members']);

          const result = await offlineDb.handleMemberEvent({
            event: memberAddedEvent,
            execute: false,
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: memberAddedEvent, execute: false, forceUpdate: true },
            expect.any(Function),
          );

          expect(offlineDb.upsertMembers).toHaveBeenCalledWith({
            cid: memberAddedEvent.cid,
            members: [memberAddedEvent.member],
            execute: false,
          });

          expect(result).toEqual(['INSERT INTO members']);
        });

        it('calls upsertMembers inside queriesWithChannelGuard for member.updated event', async () => {
          const memberUpdatedEvent: Event = {
            ...memberAddedEvent,
            type: 'member.updated',
          };
          offlineDb.upsertMembers.mockResolvedValue(['UPDATE members']);

          const result = await offlineDb.handleMemberEvent({
            event: memberUpdatedEvent,
            execute: false,
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: memberUpdatedEvent, execute: false, forceUpdate: true },
            expect.any(Function),
          );

          expect(offlineDb.upsertMembers).toHaveBeenCalledWith({
            cid: memberUpdatedEvent.cid,
            members: [memberUpdatedEvent.member],
            execute: false,
          });

          expect(result).toEqual(['UPDATE members']);
        });

        it('calls deleteMember inside queriesWithChannelGuard for member.removed event', async () => {
          offlineDb.deleteMember.mockResolvedValue(['DELETE * FROM members']);

          const result = await offlineDb.handleMemberEvent({
            event: memberRemovedEvent,
            execute: false,
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: memberRemovedEvent, execute: false, forceUpdate: true },
            expect.any(Function),
          );

          expect(offlineDb.deleteMember).toHaveBeenCalledWith({
            member: memberRemovedEvent.member,
            cid: memberRemovedEvent.cid,
            execute: false,
          });

          expect(result).toEqual(['DELETE * FROM members']);
        });

        it('passes execute = true and calls executeSqlBatch if execute is true', async () => {
          offlineDb.upsertMembers.mockResolvedValue(['INSERT INTO members']);

          const result = await offlineDb.handleMemberEvent({
            event: memberAddedEvent,
            execute: true,
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: memberAddedEvent, execute: true, forceUpdate: true },
            expect.any(Function),
          );
          expect(result).toEqual(['INSERT INTO members']);
        });

        it('throws if upsertMembers rejects', async () => {
          const error = new Error('upsertMembers error');
          offlineDb.upsertMembers.mockRejectedValue(error);

          await expect(
            offlineDb.handleMemberEvent({ event: memberAddedEvent }),
          ).rejects.toThrow(error);
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: memberAddedEvent, execute: true, forceUpdate: true },
            expect.any(Function),
          );
        });
      });

      describe('handleMessageUpdatedEvent', () => {
        let messageUpdatedEvent: Event;
        let eventWithThreadReply: Event;

        beforeEach(() => {
          messageUpdatedEvent = { ...baseEvent, type: 'message.updated' };
          eventWithThreadReply = {
            ...baseEvent,
            message: { ...baseEvent.message, parent_id: 'parent1' } as MessageResponse,
          };
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it('returns empty query array if no message is present', async () => {
          const faultyEvent = { ...baseEvent, message: undefined };
          const result = await offlineDb.handleMessageUpdatedEvent({
            event: faultyEvent,
          });
          expect(queriesWithChannelGuardSpy).not.toHaveBeenCalled();
          expect(result).toEqual([]);
        });

        it('returns empty query array if message is a thread reply', async () => {
          const result = await offlineDb.handleMessageUpdatedEvent({
            event: eventWithThreadReply,
          });
          expect(queriesWithChannelGuardSpy).not.toHaveBeenCalled();
          expect(result).toEqual([]);
        });

        it('calls updateMessage inside queriesWithChannelGuard when message exists without parent_id', async () => {
          offlineDb.updateMessage.mockResolvedValue(['UPDATE * IN messages']);

          const result = await offlineDb.handleMessageUpdatedEvent({
            event: messageUpdatedEvent,
            execute: false,
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: messageUpdatedEvent, execute: false },
            expect.any(Function),
          );

          expect(offlineDb.updateMessage).toHaveBeenCalledWith({
            message: messageUpdatedEvent.message,
            execute: false,
          });

          expect(result).toEqual(['UPDATE * IN messages']);
        });

        it('calls updateMessage and executeSqlBatch if execute is true', async () => {
          offlineDb.updateMessage.mockResolvedValue(['UPDATE * IN messages']);

          const result = await offlineDb.handleMessageUpdatedEvent({
            event: messageUpdatedEvent,
            execute: true,
          });

          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: messageUpdatedEvent, execute: true },
            expect.any(Function),
          );

          expect(offlineDb.updateMessage).toHaveBeenCalledWith({
            message: messageUpdatedEvent.message,
            execute: true,
          });

          expect(result).toEqual(['UPDATE * IN messages']);
        });

        it('throws if updateMessage rejects', async () => {
          const error = new Error('updateMessage error');
          offlineDb.updateMessage.mockRejectedValue(error);

          await expect(
            offlineDb.handleMessageUpdatedEvent({ event: messageUpdatedEvent }),
          ).rejects.toThrow(error);
          expect(queriesWithChannelGuardSpy).toHaveBeenCalledWith(
            { event: messageUpdatedEvent, execute: true },
            expect.any(Function),
          );
        });
      });

      describe('handleChannelVisibilityEvent', () => {
        const channelHiddenEvent: Event = {
          ...baseEvent,
          type: 'channel.hidden',
          channel: { id: 'channel123', type: 'messaging' } as ChannelResponse,
        };
        const channelVisibleEvent: Event = {
          ...channelHiddenEvent,
          type: 'channel.visible',
        };

        beforeEach(() => {
          offlineDb.upsertChannelData.mockResolvedValue(['UPDATE * IN channels']);
        });

        it('returns empty query array if event.channel is missing', async () => {
          const hiddenEventMissingChannel = { ...channelHiddenEvent, channel: undefined };
          const result1 = await offlineDb.handleChannelVisibilityEvent({
            event: hiddenEventMissingChannel,
          });

          expect(result1).toEqual([]);
          expect(offlineDb.upsertChannelData).not.toHaveBeenCalled();

          const visibleEventMissingChannel = {
            ...channelVisibleEvent,
            channel: undefined,
          };
          const result2 = await offlineDb.handleChannelVisibilityEvent({
            event: visibleEventMissingChannel,
          });

          expect(result2).toEqual([]);
          expect(offlineDb.upsertChannelData).not.toHaveBeenCalled();
        });

        it('calls upsertChannelData with hidden: true on channel.hidden events', async () => {
          const result = await offlineDb.handleChannelVisibilityEvent({
            event: channelHiddenEvent,
            execute: true,
          });
          expect(offlineDb.upsertChannelData).toHaveBeenCalledWith({
            channel: { ...channelHiddenEvent.channel, hidden: true },
            execute: true,
          });
          expect(result).toEqual(['UPDATE * IN channels']);
        });

        it('calls upsertChannelData with hidden false when type is not "channel.hidden"', async () => {
          const result = await offlineDb.handleChannelVisibilityEvent({
            event: channelVisibleEvent,
            execute: false,
          });
          expect(offlineDb.upsertChannelData).toHaveBeenCalledWith({
            channel: { ...channelVisibleEvent.channel, hidden: false },
            execute: false,
          });
          expect(result).toEqual(['UPDATE * IN channels']);
        });

        it('throws if upsertChannelData rejects', async () => {
          const error = new Error('upsertChannelData error');
          offlineDb.upsertChannelData.mockRejectedValue(error);

          await expect(
            offlineDb.handleChannelVisibilityEvent({
              event: channelHiddenEvent,
            }),
          ).rejects.toThrow(error);
        });
      });

      describe('handleChannelTruncatedEvent', () => {
        const truncatedEvent: Event = {
          ...baseEvent,
          channel: {
            cid: 'messaging:to-truncate',
            truncated_at: '2025-05-20T10:00:00Z',
          } as ChannelResponse,
        };

        const lastReadDate = new Date('2025-05-19T09:00:00Z');
        const lastReadMessageId = 'msg789';
        const unreadMessagesCount = 5;

        beforeEach(() => {
          offlineDb.deleteMessagesForChannel.mockResolvedValue([
            'DELETE * FROM messages',
          ]);
          offlineDb.upsertReads.mockResolvedValue(['UPDATE * IN reads']);

          readResponse = generateReadResponse({
            user: client.user,
            last_read: lastReadDate,
            last_read_message_id: lastReadMessageId,
            unread_messages: unreadMessagesCount,
          });
          channelResponse = generateChannel({
            channel: { id: 'to-truncate', type: 'messaging' },
            read: [readResponse],
          } as ChannelAPIResponse);
          client.hydrateActiveChannels([channelResponse]);
        });

        afterEach(() => {
          vi.clearAllMocks();
        });

        it('returns empty array if event.channel or client.user is missing', async () => {
          const eventNoChannel = { ...truncatedEvent, channel: undefined };
          const resultNoChannel = await offlineDb.handleChannelTruncatedEvent({
            event: eventNoChannel,
          });
          expect(resultNoChannel).toEqual([]);
          expect(offlineDb.deleteMessagesForChannel).not.toHaveBeenCalled();
          expect(offlineDb.upsertReads).not.toHaveBeenCalled();
          expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();

          // @ts-ignore
          offlineDb.client.user = undefined;
          const resultNoUser = await offlineDb.handleChannelTruncatedEvent({
            event: truncatedEvent,
          });
          expect(resultNoUser).toEqual([]);
          expect(offlineDb.deleteMessagesForChannel).not.toHaveBeenCalled();

          expect(offlineDb.upsertReads).not.toHaveBeenCalled();
          expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();
        });

        it('calls deleteMessagesForChannel and upsertReads with correct arguments and returns combined queries', async () => {
          const countUnreadSpy = vi
            .spyOn(client.activeChannels[truncatedEvent.channel!.cid], 'countUnread')
            .mockReturnValue(2);

          const result = await offlineDb.handleChannelTruncatedEvent({
            event: truncatedEvent,
            execute: true,
          });

          expect(offlineDb.deleteMessagesForChannel).toHaveBeenCalledWith({
            cid: truncatedEvent.channel!.cid,
            truncated_at: truncatedEvent.channel!.truncated_at,
            execute: false,
          });

          expect(countUnreadSpy).toHaveBeenCalled();
          expect(countUnreadSpy).toHaveBeenCalledWith(
            new Date(truncatedEvent.channel!.truncated_at as unknown as string),
          );

          expect(offlineDb.upsertReads).toHaveBeenCalledWith({
            cid: truncatedEvent.channel!.cid,
            execute: false,
            reads: [
              {
                last_read: lastReadDate.toString(),
                last_read_message_id: lastReadMessageId,
                unread_messages: 2,
                user: client.user,
              },
            ],
          });

          expect(offlineDb.executeSqlBatch).toHaveBeenCalledWith([
            'DELETE * FROM messages',
            'UPDATE * IN reads',
          ]);
          expect(result).toEqual(['DELETE * FROM messages', 'UPDATE * IN reads']);
        });

        it('passes execute=false correctly to deleteMessagesForChannel and upsertReads', async () => {
          await offlineDb.handleChannelTruncatedEvent({
            event: truncatedEvent,
            execute: false,
          });

          expect(offlineDb.deleteMessagesForChannel).toHaveBeenCalledWith({
            cid: truncatedEvent.channel!.cid,
            truncated_at: truncatedEvent.channel!.truncated_at,
            execute: false,
          });
          expect(offlineDb.upsertReads).toHaveBeenCalledWith({
            cid: truncatedEvent.channel!.cid,
            execute: false,
            reads: [
              {
                last_read: lastReadDate.toString(),
                last_read_message_id: lastReadMessageId,
                unread_messages: 0,
                user: client.user,
              },
            ],
          });
          expect(offlineDb.executeSqlBatch).not.toHaveBeenCalled();
        });

        it('handles missing truncated_at gracefully with unread count 0', async () => {
          const countUnreadSpy = vi.spyOn(
            client.activeChannels[truncatedEvent.channel!.cid],
            'countUnread',
          );
          const channelWithoutTruncatedAt = truncatedEvent.channel!;
          delete channelWithoutTruncatedAt.truncated_at;

          const eventNoTruncatedAt = {
            ...truncatedEvent,
            channel: {
              ...truncatedEvent.channel,
              truncated_at: undefined,
            } as ChannelResponse,
          };
          const result = await offlineDb.handleChannelTruncatedEvent({
            event: eventNoTruncatedAt,
          });

          expect(offlineDb.deleteMessagesForChannel).toHaveBeenCalledWith({
            cid: truncatedEvent.channel!.cid,
            execute: false,
          });

          // countUnread should NOT be called if truncated_at is missing
          expect(countUnreadSpy).not.toHaveBeenCalled();

          expect(offlineDb.upsertReads).toHaveBeenCalledWith({
            cid: truncatedEvent.channel!.cid,
            execute: false,
            reads: [
              {
                last_read: lastReadDate.toString(),
                last_read_message_id: lastReadMessageId,
                unread_messages: 0,
                user: client.user,
              },
            ],
          });

          expect(offlineDb.executeSqlBatch).toHaveBeenCalledWith([
            'DELETE * FROM messages',
            'UPDATE * IN reads',
          ]);
          expect(result).toEqual(['DELETE * FROM messages', 'UPDATE * IN reads']);
        });
      });

      describe('handleReactionEvent', () => {
        const reaction = { type: 'like' };

        const baseReactionEvent: Event = {
          ...baseEvent,
          reaction,
        } as Event;

        beforeEach(() => {
          offlineDb.insertReaction.mockResolvedValue(['INSERT INTO reactions']);
          offlineDb.deleteReaction.mockResolvedValue(['DELETE FROM reactions']);
          offlineDb.updateReaction.mockResolvedValue(['UPDATE reactions']);
        });

        it('returns empty array if message or reaction is missing', async () => {
          const noMessageEvent = { ...baseReactionEvent, message: undefined };
          const result1 = await offlineDb.handleReactionEvent({ event: noMessageEvent });
          expect(result1).toEqual([]);
          expect(offlineDb.queriesWithChannelGuard).not.toHaveBeenCalled();

          const noReactionEvent = { ...baseReactionEvent, reaction: undefined };
          const result2 = await offlineDb.handleReactionEvent({ event: noReactionEvent });
          expect(result2).toEqual([]);
          expect(offlineDb.queriesWithChannelGuard).not.toHaveBeenCalled();
        });

        it.each([
          ['reaction.new', 'insertReaction', ['INSERT INTO reactions']],
          ['reaction.deleted', 'deleteReaction', ['DELETE FROM reactions']],
          ['reaction.updated', 'updateReaction', ['UPDATE reactions']],
        ])(
          'calls correct method for event %s and returns its queries when execute is true',
          async (type, methodName, expectedQueries) => {
            const localReactionEvent = { ...baseReactionEvent, type } as Event;

            const result = await offlineDb.handleReactionEvent({
              event: localReactionEvent,
              execute: true,
            });

            expect(offlineDb.queriesWithChannelGuard).toHaveBeenCalledWith(
              { event: localReactionEvent, execute: true },
              expect.any(Function),
            );

            expect(offlineDb[methodName as keyof typeof offlineDb]).toHaveBeenCalledWith({
              message: localReactionEvent.message,
              reaction,
              execute: true,
            });

            expect(result).toEqual(expectedQueries);
          },
        );

        it.each([
          ['reaction.new', 'insertReaction', ['INSERT INTO reactions']],
          ['reaction.deleted', 'deleteReaction', ['DELETE FROM reactions']],
          ['reaction.updated', 'updateReaction', ['UPDATE reactions']],
        ])(
          'calls correct method for event %s and returns its queries when execute is false',
          async (type, methodName, expectedQueries) => {
            const localReactionEvent = { ...baseReactionEvent, type } as Event;

            const result = await offlineDb.handleReactionEvent({
              event: localReactionEvent,
              execute: false,
            });

            expect(offlineDb.queriesWithChannelGuard).toHaveBeenCalledWith(
              { event: localReactionEvent, execute: false },
              expect.any(Function),
            );

            expect(offlineDb[methodName as keyof typeof offlineDb]).toHaveBeenCalledWith({
              message: localReactionEvent.message,
              reaction,
              execute: false,
            });

            expect(result).toEqual(expectedQueries);
          },
        );

        it('throws if event type is not a reaction event', async () => {
          const invalidEvent = { ...baseReactionEvent, type: 'channel.hidden' } as Event;

          await expect(
            offlineDb.handleReactionEvent({ event: invalidEvent }),
          ).rejects.toThrow(/non-reaction event/);
        });
      });

      describe('handleEvent', () => {
        const dummyEvent = {
          type: '',
          channel: { cid: 'channel-123' },
        } as unknown as Event;

        beforeEach(() => {
          offlineDb.handleReactionEvent = vi.fn().mockResolvedValue(['reaction']);
          offlineDb.handleNewMessage = vi.fn().mockResolvedValue(['new-message']);
          offlineDb.handleDeleteMessage = vi.fn().mockResolvedValue(['delete-message']);
          offlineDb.handleMessageUpdatedEvent = vi
            .fn()
            .mockResolvedValue(['update-message']);
          offlineDb.handleRead = vi.fn().mockResolvedValue(['read']);
          offlineDb.handleMemberEvent = vi.fn().mockResolvedValue(['member']);
          offlineDb.handleChannelVisibilityEvent = vi
            .fn()
            .mockResolvedValue(['channel-visibility']);
          offlineDb.handleChannelTruncatedEvent = vi
            .fn()
            .mockResolvedValue(['truncate-channel']);
          offlineDb.upsertChannelData.mockResolvedValue(['upsert-channel']);
          offlineDb.deleteChannel.mockResolvedValue(['delete-channel']);
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it.each([
          ['reaction.new', 'handleReactionEvent', 'reaction'],
          ['reaction.deleted', 'handleReactionEvent', 'reaction'],
          ['reaction.updated', 'handleReactionEvent', 'reaction'],
          ['message.new', 'handleNewMessage', 'new-message'],
          ['message.deleted', 'handleDeleteMessage', 'delete-message'],
          ['message.updated', 'handleMessageUpdatedEvent', 'update-message'],
          ['message.undeleted', 'handleMessageUpdatedEvent', 'update-message'],
          ['message.read', 'handleRead', 'read'],
          ['notification.mark_read', 'handleRead', 'read'],
          ['notification.mark_unread', 'handleRead', 'read'],
          ['member.added', 'handleMemberEvent', 'member'],
          ['member.removed', 'handleMemberEvent', 'member'],
          ['member.updated', 'handleMemberEvent', 'member'],
          ['channel.hidden', 'handleChannelVisibilityEvent', 'channel-visibility'],
          ['channel.visible', 'handleChannelVisibilityEvent', 'channel-visibility'],
          ['channel.updated', 'upsertChannelData', 'upsert-channel'],
          ['notification.message_new', 'upsertChannelData', 'upsert-channel'],
          ['notification.added_to_channel', 'upsertChannelData', 'upsert-channel'],
          ['channel.deleted', 'deleteChannel', 'delete-channel'],
          ['notification.channel_deleted', 'deleteChannel', 'delete-channel'],
          ['notification.removed_from_channel', 'deleteChannel', 'delete-channel'],
          ['channel.truncated', 'handleChannelTruncatedEvent', 'truncate-channel'],
        ])(
          'handles event type %s by calling %s',
          async (type, method, expectedResult) => {
            const event = { ...dummyEvent, type } as Event;

            const result = await offlineDb.handleEvent({ event });

            let queryInput: Record<string, unknown> = { event, execute: true };

            if (['message.read', 'notification.mark_read'].includes(type)) {
              queryInput.unreadMessages = 0;
            }

            if (
              [
                'channel.updated',
                'notification.message_new',
                'notification.added_to_channel',
              ].includes(type)
            ) {
              queryInput = { channel: event.channel!, execute: true };
            }

            if (
              [
                'channel.deleted',
                'notification.channel_deleted',
                'notification.removed_from_channel',
              ].includes(type)
            ) {
              queryInput = { cid: event.channel!.cid, execute: true };
            }

            expect(result).toEqual([expectedResult]);
            expect(offlineDb[method as keyof typeof offlineDb]).toHaveBeenCalledWith(
              queryInput,
            );
          },
        );

        it('passes execute=false correctly to delegated method', async () => {
          const event = { ...dummyEvent, type: 'reaction.new' } as Event;
          await offlineDb.handleEvent({ event, execute: false });

          expect(offlineDb.handleReactionEvent).toHaveBeenCalledWith({
            event,
            execute: false,
          });
        });

        it('returns empty query array if event type is unhandled', async () => {
          // @ts-ignore
          const event = { type: 'unknown.event' } as Event;
          const result = await offlineDb.handleEvent({ event });
          expect(result).toEqual([]);
        });

        it.each([
          ['channel.updated'],
          ['notification.message_new'],
          ['notification.added_to_channel'],
        ])('does not call upsertChannelData if channel is missing', async (type) => {
          const event = { type, channel: undefined } as unknown as Event;
          const result = await offlineDb.handleEvent({ event });
          expect(result).toEqual([]);
          expect(offlineDb.upsertChannelData).not.toHaveBeenCalled();
        });

        it.each([
          ['channel.deleted'],
          ['notification.channel_deleted'],
          ['notification.removed_from_channel'],
        ])('does not call deleteChannel if channel is missing', async (type) => {
          const event = { type, channel: undefined } as unknown as Event;
          const result = await offlineDb.handleEvent({ event });
          expect(result).toEqual([]);
          expect(offlineDb.deleteChannel).not.toHaveBeenCalled();
        });
      });
    });

    describe('queueing and execution of pending tasks', () => {
      it('shouldSkipQueueingTask', () => {
        const shouldSkipQueueingTask = (offlineDb as any)['shouldSkipQueueingTask'].bind(
          offlineDb,
        );

        expect(
          shouldSkipQueueingTask({ response: { data: { code: 4 } } } as AxiosError),
        ).toBe(true);

        expect(
          shouldSkipQueueingTask({ response: { data: { code: 17 } } } as AxiosError),
        ).toBe(true);

        expect(
          shouldSkipQueueingTask({ response: { data: { code: 999 } } } as AxiosError),
        ).toBe(false);

        expect(shouldSkipQueueingTask({} as AxiosError)).toBe(false);
      });

      describe('queueTask', () => {
        let executeTaskSpy: MockInstance;
        let shouldSkipSpy: MockInstance;
        let addPendingTaskSpy: MockInstance;
        let mockResponse: { ok: boolean };

        const task = generatePendingTask('send-message') as PendingTask;

        beforeEach(() => {
          mockResponse = { ok: true };
          executeTaskSpy = vi
            .spyOn(offlineDb as any, 'executeTask')
            .mockResolvedValue(mockResponse);
          shouldSkipSpy = vi.spyOn(offlineDb as any, 'shouldSkipQueueingTask');
          addPendingTaskSpy = vi.spyOn(offlineDb, 'addPendingTask');
          client.wsConnection = { isHealthy: true } as StableWSConnection;
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it('should execute the task and return its result if successful', async () => {
          const addPendingTaskSpy = vi.spyOn(offlineDb, 'addPendingTask');

          const result = await offlineDb.queueTask({ task });

          expect(result).toEqual(mockResponse);
          expect(executeTaskSpy).toHaveBeenCalledWith({ task });
          expect(addPendingTaskSpy).not.toHaveBeenCalled();
        });

        it('should add the task as pending immediately and not try to execute if we are offline', async () => {
          client.wsConnection = { isHealthy: false } as StableWSConnection;
          const addPendingTaskSpy = vi.spyOn(offlineDb, 'addPendingTask');

          const result = await offlineDb.queueTask({ task });

          expect(result).toBeUndefined();
          expect(executeTaskSpy).not.toHaveBeenCalled();
          expect(addPendingTaskSpy).toHaveBeenCalledWith(task);
        });

        it('should add task and rethrow if executeTask throws non-skippable error', async () => {
          const error = {
            isAxiosError: true,
            response: { data: { code: 999 } },
          } as AxiosError<APIErrorResponse>;

          shouldSkipSpy.mockReturnValue(false);
          executeTaskSpy.mockRejectedValue(error);

          await expect(offlineDb.queueTask({ task })).rejects.toEqual(error);

          expect(addPendingTaskSpy).toHaveBeenCalledWith(task);
          expect(shouldSkipSpy).toHaveBeenCalledWith(error);
        });

        it('should not add task if error is skippable', async () => {
          const error = {
            isAxiosError: true,
            response: { data: { code: 4 } },
          } as AxiosError<APIErrorResponse>;

          shouldSkipSpy.mockReturnValue(true);
          executeTaskSpy.mockRejectedValue(error);

          await expect(offlineDb.queueTask({ task })).resolves.toBeUndefined();

          expect(addPendingTaskSpy).not.toHaveBeenCalled();
          expect(shouldSkipSpy).toHaveBeenCalledWith(error);
        });
      });

      describe('executeTask', () => {
        let mockChannel: Channel;
        let _deleteMessageSpy: MockInstance;
        let clientChannelSpy: MockInstance;

        beforeEach(() => {
          mockChannel = {
            initialized: true,
            watch: vi.fn(),
            _sendMessage: vi.fn(),
            _sendReaction: vi.fn(),
            _deleteReaction: vi.fn(),
            state: { addMessageSorted: vi.fn() },
          } as unknown as Channel;

          _deleteMessageSpy = vi
            .spyOn(client, '_deleteMessage')
            .mockImplementation(vi.fn());
          clientChannelSpy = vi.spyOn(client, 'channel').mockReturnValue(mockChannel);
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it('should call _deleteMessage for delete-message task', async () => {
          const task = generatePendingTask('delete-message') as PendingTask;

          await offlineDb['executeTask']({ task });

          expect(_deleteMessageSpy).toHaveBeenCalledWith(...task.payload);
        });

        it('should call _sendReaction for send-reaction task', async () => {
          const task = generatePendingTask('send-reaction') as PendingTask;

          await offlineDb['executeTask']({ task });

          expect(clientChannelSpy).toHaveBeenCalledWith(task.channelType, task.channelId);
          expect(mockChannel._sendReaction).toHaveBeenCalledWith(...task.payload);
        });

        it('should call _deleteReaction for delete-reaction task', async () => {
          const task = generatePendingTask('delete-reaction') as PendingTask;

          await offlineDb['executeTask']({ task });

          expect(mockChannel._deleteReaction).toHaveBeenCalledWith(...task.payload);
        });

        it('should call _sendMessage and addMessageSorted if isPendingTask is true', async () => {
          const task = generatePendingTask('send-message') as PendingTask;

          const messageResponse = { message: { id: 'msg1', text: 'hello' } };
          // no idea why this complains, the test works just fine
          // @ts-ignore
          mockChannel._sendMessage.mockResolvedValue(messageResponse);

          await offlineDb['executeTask']({ task }, true);

          expect(mockChannel._sendMessage).toHaveBeenCalledWith(...task.payload);
          expect(mockChannel.state.addMessageSorted).toHaveBeenCalledWith(
            messageResponse.message,
            true,
          );
        });

        it('should throw error for unknown task type', async () => {
          const task = {
            type: 'unknown-task-type',
            payload: [],
            channelId: 'cid',
            channelType: 'messaging',
          };

          // @ts-ignore
          await expect(offlineDb['executeTask']({ task })).rejects.toThrow(
            /Tried to execute invalid pending task type/,
          );
        });
      });

      describe('executePendingTasks', () => {
        let getPendingTasksSpy: MockInstance;
        let executeTaskSpy: MockInstance;
        let shouldSkipSpy: MockInstance;
        let deletePendingTaskSpy: MockInstance;

        const task1 = generatePendingTask('send-message', 1) as PendingTask;
        const task2 = generatePendingTask('send-reaction', 2) as PendingTask;
        const skippableError = {
          isAxiosError: true,
          response: { data: { code: 4 } },
        } as AxiosError<APIErrorResponse>;

        beforeEach(() => {
          getPendingTasksSpy = vi
            .spyOn(offlineDb, 'getPendingTasks')
            .mockResolvedValue([task1, task2]);
          executeTaskSpy = vi
            .spyOn(offlineDb as any, 'executeTask')
            .mockResolvedValue(undefined);
          shouldSkipSpy = vi.spyOn(offlineDb as any, 'shouldSkipQueueingTask');
          deletePendingTaskSpy = vi.spyOn(offlineDb, 'deletePendingTask');
        });

        afterEach(() => {
          vi.resetAllMocks();
        });

        it('should execute all tasks and delete them if successful', async () => {
          await offlineDb.executePendingTasks();

          expect(getPendingTasksSpy).toHaveBeenCalled();
          expect(executeTaskSpy).toHaveBeenCalledTimes(2);
          expect(executeTaskSpy).toHaveBeenCalledWith({ task: task1 }, true);
          expect(executeTaskSpy).toHaveBeenCalledWith({ task: task2 }, true);

          expect(deletePendingTaskSpy).toHaveBeenCalledTimes(2);
          expect(deletePendingTaskSpy).toHaveBeenCalledWith({ id: 1 });
          expect(deletePendingTaskSpy).toHaveBeenCalledWith({ id: 2 });
        });

        it('should not delete the task if error is non-skippable', async () => {
          executeTaskSpy.mockRejectedValueOnce({
            isAxiosError: true,
            response: { data: { code: 999 } },
          });
          shouldSkipSpy.mockReturnValueOnce(false);

          await offlineDb.executePendingTasks();

          expect(deletePendingTaskSpy).toHaveBeenCalledTimes(1); // only task2 was deleted
          expect(deletePendingTaskSpy).toHaveBeenCalledWith({ id: 2 });
        });

        it('should delete the task if error is skippable', async () => {
          executeTaskSpy.mockRejectedValueOnce(skippableError);
          shouldSkipSpy.mockReturnValueOnce(true);

          await offlineDb.executePendingTasks();

          expect(deletePendingTaskSpy).toHaveBeenCalledTimes(2);
          expect(deletePendingTaskSpy).toHaveBeenCalledWith({ id: 1 });
          expect(deletePendingTaskSpy).toHaveBeenCalledWith({ id: 2 });
        });

        it('should skip tasks with no id', async () => {
          const taskWithoutId = generatePendingTask('delete-reaction', 1, {
            id: undefined,
          }) as PendingTask;
          getPendingTasksSpy.mockResolvedValueOnce([taskWithoutId, task1]);

          await offlineDb.executePendingTasks();

          expect(executeTaskSpy).toHaveBeenCalledTimes(1); // only task1 executed
          expect(deletePendingTaskSpy).toHaveBeenCalledWith({ id: 1 });
        });
      });
    });
  });
});

describe('OfflineDBSyncManager', () => {
  let client: StreamChat;
  let offlineDb: MockOfflineDB;
  let syncManager: OfflineDBSyncManager;
  let syncAndExecutePendingTasksSpy: MockInstance;
  let invokeSyncStatusListenersSpy: MockInstance;

  beforeEach(async () => {
    client = await getClientWithUser();
    client.wsConnection = { isHealthy: false } as StableWSConnection;
    offlineDb = new MockOfflineDB({ client });
    client.setOfflineDBApi(offlineDb);
    syncManager = new OfflineDBSyncManager({ client, offlineDb });

    syncAndExecutePendingTasksSpy = vi.spyOn(
      syncManager as any,
      'syncAndExecutePendingTasks',
    );
    invokeSyncStatusListenersSpy = vi.spyOn(
      syncManager as any,
      'invokeSyncStatusListeners',
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initialization', () => {
    beforeEach(() => {
      syncAndExecutePendingTasksSpy.mockImplementation(vi.fn());
      invokeSyncStatusListenersSpy.mockImplementation(vi.fn());
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('calls sync and sets sync status if already connected', async () => {
      client.wsConnection = { isHealthy: true } as StableWSConnection;

      await syncManager.init();

      expect(syncAndExecutePendingTasksSpy).toHaveBeenCalled();
      expect(invokeSyncStatusListenersSpy).toHaveBeenCalledWith(true);
    });

    it('does not call sync if client.user is undefined', async () => {
      // @ts-ignore
      syncManager.client.user = undefined;

      await syncManager.init();

      expect(syncAndExecutePendingTasksSpy).not.toHaveBeenCalled();
      expect(invokeSyncStatusListenersSpy).not.toHaveBeenCalled();
    });

    it('does not call sync if the ws connection is not healthy', async () => {
      // @ts-ignore
      syncManager.client.wsConnection = { isHealthy: false };

      await syncManager.init();

      expect(syncAndExecutePendingTasksSpy).not.toHaveBeenCalled();
      expect(invokeSyncStatusListenersSpy).not.toHaveBeenCalled();
    });

    it('unsubscribes previous listener if already present', async () => {
      const unsubscribeFn = vi.fn();
      syncManager.connectionChangedListener = { unsubscribe: unsubscribeFn };

      await syncManager.init();

      expect(unsubscribeFn).toHaveBeenCalled();
    });

    it('calls sync when connection.changed triggers online=true', async () => {
      client.wsConnection = { isHealthy: true } as StableWSConnection;

      await syncManager.init();

      client.dispatchEvent({
        type: 'connection.changed',
        online: true,
      });

      expect(syncAndExecutePendingTasksSpy).toHaveBeenCalledTimes(2);
      expect(invokeSyncStatusListenersSpy).toHaveBeenCalledWith(true);
    });

    it('sets sync status to false on connection.changed with online=false', async () => {
      await syncManager.init();

      client.dispatchEvent({
        type: 'connection.changed',
        online: false,
      });

      expect(syncAndExecutePendingTasksSpy).not.toHaveBeenCalled();
      expect(invokeSyncStatusListenersSpy).toHaveBeenCalledWith(false);
    });

    it('handles errors in init gracefully', async () => {
      client.wsConnection = { isHealthy: true } as StableWSConnection;

      const error = new Error('Sync failed');
      syncAndExecutePendingTasksSpy.mockRejectedValueOnce(error);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await syncManager.init();

      expect(consoleSpy).toHaveBeenCalledWith('Error in DBSyncManager.init: ', error);
    });
  });

  describe('sync status listeners and callbacks', () => {
    describe('onSyncStatusChange', () => {
      it('adds a listener to syncStatusListeners', () => {
        const listener = vi.fn();
        expect(syncManager['syncStatusListeners']).toHaveLength(0);

        const subscription = syncManager.onSyncStatusChange(listener);

        expect(syncManager['syncStatusListeners']).toContain(listener);
        expect(typeof subscription.unsubscribe).toBe('function');
      });

      it('removes the listener when unsubscribe is called', () => {
        const listener = vi.fn();
        const subscription = syncManager.onSyncStatusChange(listener);

        expect(syncManager['syncStatusListeners']).toContain(listener);

        subscription.unsubscribe();

        expect(syncManager['syncStatusListeners']).not.toContain(listener);
      });

      it('does not affect other listeners when one is unsubscribed', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        const sub1 = syncManager.onSyncStatusChange(listener1);
        syncManager.onSyncStatusChange(listener2);

        sub1.unsubscribe();

        expect(syncManager['syncStatusListeners']).not.toContain(listener1);
        expect(syncManager['syncStatusListeners']).toContain(listener2);
      });
    });

    describe('scheduleSyncStatusChangeCallback', () => {
      it('adds the callback to scheduledSyncStatusCallbacks with the given tag', () => {
        const tag = 'testTag';
        const callback = vi.fn().mockResolvedValue(undefined);

        syncManager.scheduleSyncStatusChangeCallback(tag, callback);

        expect(syncManager['scheduledSyncStatusCallbacks'].get(tag)).toBe(callback);
      });

      it('overwrites an existing callback with the same tag', () => {
        const tag = 'duplicateTag';
        const callback1 = vi.fn().mockResolvedValue(undefined);
        const callback2 = vi.fn().mockResolvedValue(undefined);

        syncManager.scheduleSyncStatusChangeCallback(tag, callback1);
        syncManager.scheduleSyncStatusChangeCallback(tag, callback2);

        expect(syncManager['scheduledSyncStatusCallbacks'].get(tag)).toBe(callback2);
        expect(syncManager['scheduledSyncStatusCallbacks'].get(tag)).not.toBe(callback1);
      });

      it('works with symbol tags as well', () => {
        const tag = Symbol('symbolTag');
        const callback = vi.fn().mockResolvedValue(undefined);

        syncManager.scheduleSyncStatusChangeCallback(tag, callback);

        expect(syncManager['scheduledSyncStatusCallbacks'].get(tag)).toBe(callback);
      });
    });

    describe('invokeSyncStatusListeners', () => {
      it('updates syncStatus and notifies all listeners', async () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        syncManager.onSyncStatusChange(listener1);
        syncManager.onSyncStatusChange(listener2);

        await (syncManager as any).invokeSyncStatusListeners(true);

        expect(listener1).toHaveBeenCalledWith(true);
        expect(listener2).toHaveBeenCalledWith(true);
        expect(syncManager['syncStatus']).toBe(true);
      });

      it('does not call scheduled callbacks, but calls listeners if status is false', async () => {
        const scheduledCallback = vi.fn().mockResolvedValue(undefined);
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        syncManager.onSyncStatusChange(listener1);
        syncManager.onSyncStatusChange(listener2);
        syncManager.scheduleSyncStatusChangeCallback('tag1', scheduledCallback);

        await (syncManager as any).invokeSyncStatusListeners(false);

        expect(scheduledCallback).not.toHaveBeenCalled();
        expect(listener1).toHaveBeenCalledWith(false);
        expect(listener2).toHaveBeenCalledWith(false);
        expect(syncManager['scheduledSyncStatusCallbacks'].size).toBe(1);
      });

      it('calls all scheduled callbacks and clears them if status is true', async () => {
        const callback1 = vi.fn().mockResolvedValue(undefined);
        const callback2 = vi.fn().mockResolvedValue(undefined);

        syncManager.scheduleSyncStatusChangeCallback('cb1', callback1);
        syncManager.scheduleSyncStatusChangeCallback('cb2', callback2);

        await (syncManager as any).invokeSyncStatusListeners(true);

        expect(callback1).toHaveBeenCalled();
        expect(callback2).toHaveBeenCalled();
        expect(syncManager['scheduledSyncStatusCallbacks'].size).toBe(0);
      });

      it('awaits all scheduled callback promises', async () => {
        const order: string[] = [];
        const callback1 = vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push('cb1');
        });
        const callback2 = vi.fn().mockImplementation(async () => {
          order.push('cb2');
        });

        syncManager.scheduleSyncStatusChangeCallback('cb1', callback1);
        syncManager.scheduleSyncStatusChangeCallback('cb2', callback2);

        await (syncManager as any).invokeSyncStatusListeners(true);

        expect(order).toContain('cb1');
        expect(order).toContain('cb2');
      });
    });

    describe('syncAndExecutePendingTasks', () => {
      let executePendingTasksSpy: MockInstance;
      let syncSpy: MockInstance;

      beforeEach(() => {
        executePendingTasksSpy = vi
          .spyOn(offlineDb, 'executePendingTasks')
          .mockResolvedValue(undefined);
        syncSpy = vi.spyOn(syncManager as any, 'sync').mockResolvedValue(undefined);
      });

      it('executes pending tasks and then performs sync', async () => {
        await (syncManager as any).syncAndExecutePendingTasks();

        expect(executePendingTasksSpy).toHaveBeenCalled();
        expect(syncSpy).toHaveBeenCalled();
        expect(executePendingTasksSpy.mock.invocationCallOrder[0]).toBeLessThan(
          syncSpy.mock.invocationCallOrder[0],
        );
      });

      it('throws if executePendingTasks fails', async () => {
        const error = new Error('Failed to execute pending tasks');
        executePendingTasksSpy.mockRejectedValueOnce(error);

        await expect((syncManager as any).syncAndExecutePendingTasks()).rejects.toThrow(
          error,
        );
        expect(syncSpy).not.toHaveBeenCalled();
      });

      it('throws if sync fails', async () => {
        const error = new Error('Sync failed');
        syncSpy.mockRejectedValueOnce(error);

        await expect((syncManager as any).syncAndExecutePendingTasks()).rejects.toThrow(
          error,
        );
        expect(executePendingTasksSpy).toHaveBeenCalled();
      });
    });

    describe('sync', () => {
      let getAllChannelCidsSpy: MockInstance;
      let getLastSyncedAtSpy: MockInstance;
      let resetDBSpy: MockInstance;
      let syncApiSpy: MockInstance;
      let handleEventSpy: MockInstance;
      let executeSqlBatchSpy: MockInstance;
      let upsertUserSyncStatusSpy: MockInstance;

      const userId = 'test-user';

      beforeEach(() => {
        // @ts-ignore
        syncManager.client.user = { id: userId } as any;

        getAllChannelCidsSpy = vi
          .spyOn(offlineDb, 'getAllChannelCids')
          .mockResolvedValue(['channel-1']);

        getLastSyncedAtSpy = vi
          .spyOn(offlineDb, 'getLastSyncedAt')
          .mockResolvedValue(new Date().toString());

        resetDBSpy = vi.spyOn(offlineDb, 'resetDB').mockResolvedValue(undefined);

        syncApiSpy = vi
          .spyOn(client, 'sync')
          .mockResolvedValue({ events: [] as Event[], duration: '1' });

        handleEventSpy = vi.spyOn(offlineDb, 'handleEvent').mockResolvedValue([]);

        executeSqlBatchSpy = vi
          .spyOn(offlineDb, 'executeSqlBatch')
          .mockResolvedValue(undefined);

        upsertUserSyncStatusSpy = vi
          .spyOn(offlineDb, 'upsertUserSyncStatus')
          .mockResolvedValue(undefined);
      });

      it('does nothing if client user is not set', async () => {
        // @ts-ignore
        syncManager.client.user = undefined;

        await (syncManager as any).sync();

        expect(getAllChannelCidsSpy).not.toHaveBeenCalled();
      });

      it('does nothing if no channels are found', async () => {
        getAllChannelCidsSpy.mockResolvedValueOnce([]);

        await (syncManager as any).sync();

        expect(getLastSyncedAtSpy).not.toHaveBeenCalled();
      });

      it('resets DB if last sync was more than 30 days ago', async () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 31);
        getLastSyncedAtSpy.mockResolvedValueOnce(oldDate.toString());

        await (syncManager as any).sync();

        expect(resetDBSpy).toHaveBeenCalled();
        expect(upsertUserSyncStatusSpy).toHaveBeenCalledWith({
          userId,
          lastSyncedAt: expect.any(String),
        });
      });

      it('calls sync API and handles events when last sync is within 30 days', async () => {
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 10);
        getLastSyncedAtSpy.mockResolvedValueOnce(recentDate.toString());

        const mockEvents = [{ type: 'message.new' }, { type: 'reaction.new' }];
        syncApiSpy.mockResolvedValueOnce({ events: mockEvents });

        handleEventSpy.mockResolvedValueOnce(['query1']);
        handleEventSpy.mockResolvedValueOnce(['query2']);

        await (syncManager as any).sync();

        expect(syncApiSpy).toHaveBeenCalledWith(
          ['channel-1'],
          expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/, // ISO8601 regex, YYYY-MM-DDTHH:mm:ss.sssZ
          ),
        );
        expect(handleEventSpy).toHaveBeenCalledTimes(mockEvents.length);
        expect(executeSqlBatchSpy).toHaveBeenCalledWith(['query1', 'query2']);
        expect(upsertUserSyncStatusSpy).toHaveBeenCalled();
      });

      it('resets DB if sync API throws an error', async () => {
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 10);
        getLastSyncedAtSpy.mockResolvedValueOnce(recentDate.toString());

        syncApiSpy.mockRejectedValueOnce(new Error('Sync failed'));

        await (syncManager as any).sync();

        expect(resetDBSpy).toHaveBeenCalled();
        expect(upsertUserSyncStatusSpy).not.toHaveBeenCalled();
      });

      it('does not call executeSqlBatch if no queries are returned', async () => {
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 5);
        getLastSyncedAtSpy.mockResolvedValueOnce(recentDate.toString());

        syncApiSpy.mockResolvedValueOnce({ events: [{ type: 'event' }] });
        handleEventSpy.mockResolvedValueOnce([]);

        await (syncManager as any).sync();

        expect(executeSqlBatchSpy).not.toHaveBeenCalled();
        expect(upsertUserSyncStatusSpy).toHaveBeenCalled();
      });
    });
  });
});
