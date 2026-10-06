import type { PushProviderConfig, StreamChat } from '../../../src';
import { DOCS_TEST_PREFIX } from './ids';
import { hardDeleteUsers } from './users';
import { retry, retryOnRateLimit, waitForTask } from './wait';

/** Something a docs test created and didn't remove. */
export type Leftover = {
  kind: string;
  id: string;
  /** Used by the sweep to skip resources of runs that may still be in progress. */
  createdAt?: string;
  remove: () => Promise<unknown>;
  /**
   * Removes many leftovers of this kind in one call (e.g. users in one `deleteUsers`).
   * `removeLeftovers` prefers it over `remove`, to stay under the rate limits.
   */
  removeMany?: (ids: string[]) => Promise<unknown>;
};

/**
 * Decides which resources are leftovers. `matches` gets ids / names (and a poll's
 * `created_by_id`); `channelIds` is needed because channels can't be searched by prefix.
 */
export type LeftoverFilter = {
  matches: (idOrName: string) => boolean;
  channelIds?: string[];
};

/**
 * Polls can only be queried server-side "as" a user, and they survive their
 * creator's deletion, so a permanent helper user (outside the docs-test prefix) is
 * used for poll queries / deletes.
 */
const POLL_QUERY_USER_ID = 'docs-snippets-leak-checker';

type Scanner = (client: StreamChat, filter: LeftoverFilter) => Promise<Leftover[]>;

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

const scanUsers = async (
  client: StreamChat,
  prefix: string,
  matches: LeftoverFilter['matches'],
) => {
  const found: Leftover[] = [];
  for (let offset = 0; ; offset += 100) {
    const { users } = await client.queryUsers(
      { id: { $autocomplete: prefix } },
      { id: 1 },
      { limit: 100, offset },
    );
    for (const user of users) {
      if (!matches(user.id)) continue;
      found.push({
        kind: 'user',
        id: user.id,
        createdAt: user.created_at,
        remove: () => hardDeleteUsers(client, [user.id]),
        removeMany: (ids) => hardDeleteUsers(client, ids),
      });
    }
    if (users.length < 100) return found;
  }
};

const scanners: Record<string, Scanner> = {
  async users(client, { matches }) {
    const found: Leftover[] = [];
    // Guest users get their id rewritten to `guest-<uuid>-<requested id>`, so they need
    // a second query.
    for (const prefix of [DOCS_TEST_PREFIX, 'guest']) {
      found.push(...(await scanUsers(client, prefix, matches)));
    }
    return found;
  },

  async channels(client, { channelIds = [] }) {
    const found: Leftover[] = [];
    for (const ids of chunk(channelIds, 100)) {
      const channels = await client.queryChannels(
        { id: { $in: ids } },
        {},
        { limit: 100, state: false, watch: false },
      );
      for (const channel of channels) {
        found.push({
          kind: 'channel',
          id: channel.cid,
          createdAt: channel.data?.created_at as string | undefined,
          remove: async () => {
            const { task_id } = await client.deleteChannels([channel.cid], {
              hard_delete: true,
            });
            if (task_id) await waitForTask(client, task_id);
          },
        });
      }
    }
    return found;
  },

  async channelTypes(client, { matches }) {
    const { channel_types } = await client.listChannelTypes();
    return Object.entries(channel_types)
      .filter(([name]) => matches(name))
      .map(([name, type]) => ({
        kind: 'channel type',
        id: name,
        createdAt: type.created_at,
        remove: async () => {
          // Its channels must be gone first; they are only findable by type.
          const channels = await client.queryChannels({ type: name }, {}, { limit: 100 });
          if (channels.length) {
            const { task_id } = await client.deleteChannels(
              channels.map((channel) => channel.cid),
              { hard_delete: true },
            );
            if (task_id) await waitForTask(client, task_id);
          }
          await retry(() => client.deleteChannelType(name), {
            interval: 2000,
            retryIf: (error) =>
              error instanceof Error && /channels of that type exist/.test(error.message),
          });
        },
      }));
  },

  async commands(client, { matches }) {
    const { commands = [] } = await client.listCommands();
    return commands
      .filter((command) => command.name && matches(command.name))
      .map((command) => ({
        kind: 'command',
        id: command.name as string,
        createdAt: command.created_at,
        remove: () => client.deleteCommand(command.name as string),
      }));
  },

  async roles(client, { matches }) {
    const { roles } = await client.listRoles();
    return roles
      .filter((role) => role.custom && matches(role.name))
      .map((role) => ({
        kind: 'role',
        id: role.name,
        createdAt: role.created_at,
        remove: () => client.deleteRole(role.name),
      }));
  },

  async permissions(client, { matches }) {
    const { permissions = [] } = await client.listPermissions();
    return permissions
      .filter(
        (permission) => permission.custom && permission.id && matches(permission.id),
      )
      .map((permission) => ({
        kind: 'custom permission',
        id: permission.id as string,
        remove: () => client.deletePermission(permission.id as string),
      }));
  },

  async blocklists(client, { matches }) {
    const { blocklists } = await client.listBlockLists();
    return blocklists
      .filter((blocklist) => matches(blocklist.name))
      .map((blocklist) => ({
        kind: 'blocklist',
        id: blocklist.name,
        createdAt: blocklist.created_at,
        remove: () => client.deleteBlockList(blocklist.name),
      }));
  },

  async segments(client, { matches }) {
    const found: Leftover[] = [];
    let next: string | undefined;
    do {
      const response = await client.querySegments({}, [], { limit: 100, next });
      for (const segment of response.segments) {
        if (!matches(segment.id) && !matches(segment.name ?? '')) continue;
        found.push({
          kind: 'segment',
          id: segment.id,
          createdAt: segment.created_at,
          remove: () => client.deleteSegment(segment.id),
        });
      }
      next = response.next;
    } while (next);
    return found;
  },

  async campaigns(client, { matches }) {
    const found: Leftover[] = [];
    let next: string | undefined;
    do {
      const response = await client.queryCampaigns({}, undefined, { limit: 100, next });
      for (const campaign of response.campaigns) {
        if (!matches(campaign.id) && !matches(campaign.name ?? '')) continue;
        found.push({
          kind: 'campaign',
          id: `${campaign.id} (${campaign.name})`,
          createdAt: campaign.created_at,
          remove: () => client.deleteCampaign(campaign.id),
        });
      }
      next = response.next;
    } while (next);
    return found;
  },

  async userGroups(client, { matches }) {
    const found: Leftover[] = [];
    let idGt: string | undefined;
    for (;;) {
      const { user_groups } = await client.queryUserGroups({ limit: 100, id_gt: idGt });
      for (const group of user_groups) {
        if (!matches(group.id) && !matches(group.name ?? '')) continue;
        found.push({
          kind: 'user group',
          id: group.id,
          createdAt: group.created_at,
          remove: () => client.deleteUserGroup(group.id),
        });
      }
      if (user_groups.length < 100) return found;
      idGt = user_groups[user_groups.length - 1].id;
    }
  },

  async moderationConfigs(client, { matches }) {
    const { configs } = await client.moderation.queryConfigs({}, [], { limit: 100 });
    return configs
      .filter((config) => matches(config.key))
      .map((config) => ({
        kind: 'moderation config',
        id: config.key,
        createdAt: config.created_at,
        remove: () => client.moderation.deleteConfig(config.key),
      }));
  },

  async predefinedFilters(client, { matches }) {
    // No list method in the SDK yet; call the endpoint directly.
    const { predefined_filters = [] } = await client.get<{
      predefined_filters?: Array<{ name: string; created_at?: string }>;
    }>(`${client.baseURL}/predefined_filters`);
    return predefined_filters
      .filter((filter) => matches(filter.name))
      .map((filter) => ({
        kind: 'predefined filter',
        id: filter.name,
        createdAt: filter.created_at,
        remove: () => client.deletePredefinedFilter(filter.name),
      }));
  },

  async pushProviders(client, { matches }) {
    const response = await client.listPushProviders();
    // SDK typing bug: `push_providers` is typed as the provider *type* union instead of configs.
    const providers = response.push_providers as unknown as PushProviderConfig[];
    return providers
      .filter((provider) => matches(provider.name))
      .map((provider) => ({
        kind: 'push provider',
        id: `${provider.type}:${provider.name}`,
        createdAt: provider.created_at,
        remove: () =>
          client.deletePushProvider({ type: provider.type, name: provider.name }),
      }));
  },

  async polls(client, { matches }) {
    await client.upsertUser({
      id: POLL_QUERY_USER_ID,
      name: 'Docs snippets leak checker',
    });
    const found: Leftover[] = [];
    let next: string | undefined;
    do {
      const response = await client.queryPolls(
        {},
        [],
        { limit: 100, next },
        POLL_QUERY_USER_ID,
      );
      for (const poll of response.polls) {
        if (!matches(poll.created_by_id ?? '') && !matches(poll.name)) continue;
        found.push({
          kind: 'poll',
          id: `${poll.id} (by ${poll.created_by_id})`,
          createdAt: poll.created_at,
          remove: () => client.deletePoll(poll.id, POLL_QUERY_USER_ID),
        });
      }
      next = response.next;
    } while (next);
    return found;
  },
};

/** Resource kinds that are checked. Anything else (reminders, devices, drafts, ...) is per-user and goes away with the user. */
export const SCANNED_KINDS = Object.keys(scanners);

/**
 * Finds docs-test resources matching `filter` across every scanned resource kind.
 * Scanner failures (e.g. a feature not enabled on the app) are returned as `errors`
 * instead of failing the whole scan.
 */
export const findLeftovers = async (client: StreamChat, filter: LeftoverFilter) => {
  const leftovers: Leftover[] = [];
  const errors: string[] = [];
  for (const [kind, scan] of Object.entries(scanners)) {
    try {
      leftovers.push(...(await scan(client, filter)));
    } catch (error) {
      errors.push(`${kind}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { leftovers, errors };
};

/**
 * Removes leftovers in dependency order (campaigns/polls before users, channels
 * before channel types) and returns the ones that couldn't be removed.
 */
export const removeLeftovers = async (leftovers: Leftover[]) => {
  const order = [
    'campaign',
    'poll',
    'segment',
    'channel',
    'channel type',
    'user',
    'moderation config',
  ];
  const rank = (kind: string) =>
    order.includes(kind) ? order.indexOf(kind) : order.length;
  const failed: Array<{ leftover: Leftover; error: string }> = [];
  const describe = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  // Leftovers that can be removed together are batched per kind (one call for all
  // users instead of one each), the rest one by one. Both retry on 429.
  const sorted = [...leftovers].sort((a, b) => rank(a.kind) - rank(b.kind));
  for (const kind of [...new Set(sorted.map((leftover) => leftover.kind))]) {
    const ofKind = sorted.filter((leftover) => leftover.kind === kind);
    const removeMany = ofKind.find((leftover) => leftover.removeMany)?.removeMany;
    if (removeMany) {
      try {
        await removeMany(ofKind.map((leftover) => leftover.id));
      } catch (error) {
        failed.push(...ofKind.map((leftover) => ({ leftover, error: describe(error) })));
      }
      continue;
    }
    for (const leftover of ofKind) {
      try {
        await retryOnRateLimit(() => leftover.remove());
      } catch (error) {
        failed.push({ leftover, error: describe(error) });
      }
    }
  }
  return failed;
};

export const describeLeftovers = (leftovers: Leftover[]) =>
  leftovers.map((leftover) => `  - ${leftover.kind}: ${leftover.id}`).join('\n');
