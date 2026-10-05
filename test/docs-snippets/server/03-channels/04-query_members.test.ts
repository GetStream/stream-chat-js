import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, ChannelMemberAPIResponse } from '../../../../src';
import { getServerClient } from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

const DOCS = '_default/03-channels/04-query_members.md';

/** Awaits every call recorded by a `queryMembers` spy (the docs don't keep the results). */
const spiedResults = async (spy: { mock: { results: Array<{ value: unknown }> } }) =>
  (await Promise.all(spy.mock.results.map((r) => r.value))) as ChannelMemberAPIResponse[];

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const owner = uniqueId('owner');
  const tommaso = uniqueId('tommaso');
  const jane = uniqueId('jane');
  const bob = uniqueId('bob');
  let channel: Channel;

  beforeAll(async () => {
    cleanup.users.push(owner, tommaso, jane, bob);
    await serverClient.upsertUsers([
      { id: owner },
      { id: tommaso, name: 'tommaso' },
      { id: jane, name: 'jane' },
      { id: bob, name: 'bob' },
    ]);
    channel = serverClient.channel('messaging', uniqueId('channel'), {
      created_by_id: owner,
      members: [owner],
    });
    await channel.create();
    if (channel.cid) cleanup.channels.push(channel.cid);
    // Added one by one so the members have distinct created_at values.
    for (const id of [tommaso, jane, bob]) {
      await channel.addMembers([id]);
    }
  });

  afterAll(() => cleanup.run());

  it('queries members by name, autocomplete and all', async () => {
    const spy = vi.spyOn(channel, 'queryMembers');

    // #region snippet docs="_default/03-channels/04-query_members.md" heading="" tab="Node.js" index=1
    // Query members by user name
    channel.queryMembers({ name: 'tommaso' });

    // Autocomplete members by user name
    channel.queryMembers({ name: { $autocomplete: 'tom' } });

    // Query all members
    channel.queryMembers({});
    // #endregion snippet

    const [byName, autocomplete, all] = await spiedResults(spy);
    spy.mockRestore();
    expect(byName.members.map((m) => m.user_id)).toEqual([tommaso]);
    expect(autocomplete.members.map((m) => m.user_id)).toEqual([tommaso]);
    expect(all.members.map((m) => m.user_id).sort()).toEqual(
      [owner, tommaso, jane, bob].sort(),
    );
  });

  it('paginates channel members', async () => {
    // The docs' placeholder: the last member of a previous page (here the newest member).
    const { members: newestFirst } = await channel.queryMembers(
      {},
      { created_at: -1 },
      {},
    );
    const lastMember = newestFirst[0];
    const spy = vi.spyOn(channel, 'queryMembers');

    // #region snippet docs="_default/03-channels/04-query_members.md" heading="Paginating Channel Members" tab="Node.js" index=1
    // Returns up to 100 members ordered by created_at descending
    await channel.queryMembers({}, { created_at: -1 }, {});

    // Returns up to 100 members ordered by user_id descending
    await channel.queryMembers({}, { user_id: -1 }, {});

    // Paginate by user_id in ascending order
    await channel.queryMembers({}, { user_id: 1 }, { user_id_lt: lastMember.user_id });

    // Paginate by created_at in descending order
    await channel.queryMembers(
      {},
      { created_at: -1 },
      { created_at_before: lastMember.created_at },
    );

    // Paginate using offset
    await channel.queryMembers({}, { created_at: -1 }, { offset: 20 });
    // #endregion snippet

    const [byCreatedAt, byUserIdDesc, userIdPage, createdAtPage, offsetPage] =
      await spiedResults(spy);
    spy.mockRestore();
    const ids = (r: ChannelMemberAPIResponse) => r.members.map((m) => m.user_id ?? '');
    const all = [owner, tommaso, jane, bob];

    expect(ids(byCreatedAt)).toEqual([bob, jane, tommaso, owner]);
    expect(ids(byUserIdDesc)).toEqual([...all].sort().reverse());

    const lastId = lastMember.user_id ?? '';
    expect(ids(userIdPage)).toEqual(all.filter((id) => id < lastId).sort());

    expect(ids(createdAtPage)).toEqual([jane, tommaso, owner]);
    expect(offsetPage.members).toEqual([]);
  });
});
