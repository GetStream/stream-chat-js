import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { waitForAppSetting } from '../../../helpers/server';

describe('platform/02-identity-and-access/04-multi-tenancy.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const globalUserId = uniqueId('global-reader');
  const redTeam = uniqueId('red');
  const blueTeam = uniqueId('blue');
  const redChannelId = uniqueId('red-general');
  const otherRedChannelId = uniqueId('red-other');
  const blueChannelId = uniqueId('blue-general');
  const noTeamChannelId = uniqueId('no-team');
  let client: StreamChat;
  // Querying other teams' channels needs a `*-any-team` read grant: a regular team user
  // gets code 70 ("N channels match your query but cannot be returned ..."), even as a
  // member. The built-in `global_read_only` role has `read-channel-any-team`.
  let globalClient: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId, globalUserId);
    const { app } = await serverClient.getApp();
    const originalMultiTenancy = app.multi_tenant_enabled;
    cleanup.add(async () => {
      await serverClient.updateApp({ multi_tenant_enabled: originalMultiTenancy });
      await waitForAppSetting(serverClient, 'multi_tenant_enabled', originalMultiTenancy);
    });
    await serverClient.updateApp({ multi_tenant_enabled: true });
    await waitForAppSetting(serverClient, 'multi_tenant_enabled', true);

    client = await getClientSideClient({ id: userId, teams: [redTeam] });
    globalClient = await getClientSideClient({
      id: globalUserId,
      role: 'global_read_only',
      teams: [redTeam],
    });

    // One channel in the user's team, one in another team and one without a team.
    const channels: Array<[string, string | undefined]> = [
      [otherRedChannelId, redTeam],
      [blueChannelId, blueTeam],
      [noTeamChannelId, undefined],
    ];
    for (const [id, team] of channels) {
      cleanup.channels.push(`messaging:${id}`);
      await serverClient.chat.channel('messaging', id).getOrCreate({
        data: { team, created_by_id: userId },
      });
    }
    cleanup.channels.push(`messaging:${redChannelId}`);
  });

  afterAll(async () => {
    await disconnectClients(client, globalClient);
    await cleanup.run();
  });

  it('creates a channel for a team', async () => {
    // #region snippet docs="platform/02-identity-and-access/04-multi-tenancy.md" heading="Creating chat channels with a team" tab="JavaScript" index=1
    // COPY: redChannelId="red-general", redTeam="red"
    // Creates the channel red-general for team red
    await client.channel('messaging', redChannelId, { team: redTeam }).create();
    // #endregion snippet

    const { channels } = await serverClient.chat.queryChannels({
      filter_conditions: { cid: `messaging:${redChannelId}` },
    });
    expect(channels.map(({ channel }) => channel?.team)).toEqual([redTeam]);
  });

  it('queries channels by team', async () => {
    const client = globalClient;
    const spy = vi.spyOn(client, 'queryChannelsAndHydrate');
    let results: Channel[][];
    try {
      // #region snippet docs="platform/02-identity-and-access/04-multi-tenancy.md" heading="Querying chat channels" tab="JavaScript" index=1
      // query all channels from teams that user is a part of
      await client.queryChannelsAndHydrate({ filter_conditions: {} });

      // query all channels from all teams
      await client.queryChannelsAndHydrate({ filter_conditions: { team: {} } });

      // query all channels with no teams
      await client.queryChannelsAndHydrate({
        filter_conditions: { team: { $eq: null } },
      });
      // #endregion snippet
      results = await Promise.all(spy.mock.results.map((result) => result.value));
    } finally {
      spy.mockRestore();
    }

    const [ownTeams, allTeams, noTeam] = results.map((channels) =>
      channels.map((channel) => channel.id),
    );
    expect(ownTeams).toContain(otherRedChannelId);
    expect(ownTeams).not.toContain(blueChannelId);
    expect(ownTeams).not.toContain(noTeamChannelId);
    expect(allTeams).toEqual(
      expect.arrayContaining([otherRedChannelId, blueChannelId, noTeamChannelId]),
    );
    expect(noTeam).toContain(noTeamChannelId);
    expect(noTeam).not.toContain(otherRedChannelId);
    expect(noTeam).not.toContain(blueChannelId);
  });
});
