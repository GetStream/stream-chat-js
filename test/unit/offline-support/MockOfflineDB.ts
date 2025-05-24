import { AbstractOfflineDB, StreamChat } from '../../../src';
import { vi } from 'vitest';

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
