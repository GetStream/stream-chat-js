import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../../src';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { retry, waitForChannelTypePropagation } from '../../../helpers/wait';

const BATCH_TEST_TIMEOUT = 170000;

type BatchResult = {
  status?: string;
  finished_at?: string;
  success_channels_count?: number;
  failed_channels?: unknown[];
};

/**
 * Waits for a batch update to finish. The page says to poll the inner `result.status`:
 * the top-level task `status` is `completed` long before the channels are updated
 * (`result.status` stays `started` for ~35-60s), hence the longer test timeouts.
 */
const waitForBatch = async (client: StreamChat, taskId: string | undefined) => {
  if (!taskId) throw new Error('batch update returned no task_id');
  return await retry(
    async () => {
      const task = await client.getTask(taskId);
      const result = task.result as BatchResult | undefined;
      if (result?.status !== 'completed') {
        throw new Error(`batch ${taskId} is still ${result?.status ?? task.status}`);
      }
      return result;
    },
    { timeout: 150000, interval: 2000 },
  );
};

// Batch updates (`PUT /channels/batch`) and `getTask` are server-only (client-side: 403
// code 17 "this endpoint can only be called server side").
// The docs filters target `messaging` / `team` channels, which would change every channel
// in the app. The test retargets them to its own channels only: the `types` filters use
// two `uniqueId` channel types (COPY "messaging" / "team") that only contain this test's
// channels, and the `cids` filter uses this test's cids.
describe('_default/03-channels/07-channel_management/17-batch-updates.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const ownerId = uniqueId('owner');
  const userId = uniqueId('user');
  const messagingType = uniqueId('messaging');
  const teamType = uniqueId('team');
  const cidChannelIds = [1, 2, 3, 4].map(() => uniqueId('cid'));
  const [cid1, cid2, cid3, cid4] = cidChannelIds.map((id) => `messaging:${id}`);
  const messagingChannelId = uniqueId('channel');
  const teamChannelId = uniqueId('channel');

  const getChannelData = async (cid: string) => {
    const [channel] = await serverClient.queryChannels({ cid }, {}, { user_id: ownerId });
    return channel.data;
  };

  beforeAll(async () => {
    cleanup.users.push(ownerId, userId);
    await serverClient.upsertUsers([{ id: ownerId }, { id: userId }]);

    await serverClient.createChannelType({ name: messagingType });
    cleanup.channelTypes.push(messagingType);
    await serverClient.createChannelType({ name: teamType });
    cleanup.channelTypes.push(teamType);
    await waitForChannelTypePropagation();

    const channels: Array<[string, string]> = [
      ...cidChannelIds.map((id): [string, string] => ['messaging', id]),
      [messagingType, messagingChannelId],
      [teamType, teamChannelId],
    ];
    for (const [type, id] of channels) {
      cleanup.channels.push(`${type}:${id}`);
      await serverClient
        .channel(type, id, { created_by_id: ownerId, members: [ownerId] })
        .create();
    }
  });

  afterAll(() => cleanup.run());

  it(
    'targets channels by type and by cid',
    async () => {
      // #region snippet docs="_default/03-channels/07-channel_management/17-batch-updates.md" heading="Filter examples" tab="Node.js" index=1
      // COPY: messagingType="messaging", cid1="messaging:3b11838a-7734-4ece-8547-4b8524257671", cid2="messaging:a266bee6-dc3c-4188-a37d-e554d4bfac34", cid3="messaging:40fef12a-0b7c-4bcf-bd97-3ddf604efed5", cid4="messaging:2a58963e-d769-4ce3-9309-bff93c14db57"
      // 1) Filter by type
      const filters = {
        types: { $in: [messagingType] },
      };

      // 2) Filter by specific CIDs
      const filtersByCIDS = {
        cids: {
          $in: [cid1, cid2, cid3, cid4],
        },
      };
      // #endregion snippet

      const updater = serverClient.channelBatchUpdater();
      const [byType, byCids] = await Promise.all([
        updater.updateData(filters, { custom_set: { color: 'red' } }),
        updater.updateData(filtersByCIDS, { custom_set: { color: 'green' } }),
      ]);
      const [byTypeResult, byCidsResult] = await Promise.all([
        waitForBatch(serverClient, byType.task_id),
        waitForBatch(serverClient, byCids.task_id),
      ]);

      expect(byTypeResult.success_channels_count).toBe(1);
      expect(byCidsResult.success_channels_count).toBe(4);
      expect(
        (await getChannelData(`${messagingType}:${messagingChannelId}`))?.color,
      ).toBe('red');
      for (const cid of [cid1, cid2, cid3, cid4]) {
        expect((await getChannelData(cid))?.color).toBe('green');
      }
      // the other channels weren't matched
      expect(
        (await getChannelData(`${teamType}:${teamChannelId}`))?.color,
      ).toBeUndefined();
    },
    BATCH_TEST_TIMEOUT,
  );

  it(
    'adds members and updates channel data with the convenience methods',
    async () => {
      // #region snippet docs="_default/03-channels/07-channel_management/17-batch-updates.md" heading="Config overrides" tab="Node.js" index=1
      // COPY: messagingType="messaging", teamType="team", userId="user-123"
      // Add members
      const updater = serverClient.channelBatchUpdater();
      const filter = {
        types: {
          $in: [messagingType],
        },
      };

      const members = [{ user_id: userId }];

      const resp = await updater.addMembers(filter, members);

      // Update channel data
      const dataUpdater = serverClient.channelBatchUpdater();
      const dataFilter = {
        types: {
          $in: [messagingType, teamType],
        },
      };

      const data = {
        frozen: true,
        custom: {
          color: 'blue',
        },
      };

      const dataResp = await dataUpdater.updateData(dataFilter, data);
      // #endregion snippet

      const [addResult, dataResult] = await Promise.all([
        waitForBatch(serverClient, resp.task_id),
        waitForBatch(serverClient, dataResp.task_id),
      ]);
      expect(addResult.success_channels_count).toBe(1);
      expect(dataResult.success_channels_count).toBe(2);

      const { members: added } = await serverClient
        .channel(messagingType, messagingChannelId)
        .queryMembers({ user_id: userId });
      expect(added.map((member) => member.user_id)).toEqual([userId]);
      for (const cid of [
        `${messagingType}:${messagingChannelId}`,
        `${teamType}:${teamChannelId}`,
      ]) {
        // Open question: `data.custom` doesn't set the custom field `color`. It replaces the
        // channel's custom data with a single key named `custom` (`custom_set` merges flat
        // keys as expected).
        expect(await getChannelData(cid)).toMatchObject({
          frozen: true,
          custom: { color: 'blue' },
        });
      }
    },
    BATCH_TEST_TIMEOUT,
  );

  it(
    'gets the status of a batch update',
    async () => {
      const response = await serverClient
        .channelBatchUpdater()
        .updateData({ cids: { $eq: cid1 } }, { custom_set: { color: 'purple' } });
      if (!response.task_id) throw new Error('batch update returned no task_id');

      // #region snippet docs="_default/03-channels/07-channel_management/17-batch-updates.md" heading="Status" tab="Node.js" index=1
      const taskResponse = await serverClient.getTask(response.task_id);
      // #endregion snippet

      expect(taskResponse.task_id).toBe(response.task_id);
      expect(taskResponse.status).toEqual(expect.any(String));

      const result = await waitForBatch(serverClient, response.task_id);
      expect(result.success_channels_count).toBe(1);
      expect(result.failed_channels).toEqual([]);
      expect(result.finished_at).toEqual(expect.any(String));
    },
    BATCH_TEST_TIMEOUT,
  );
});
