import type { StreamClient } from '@stream-io/node-sdk';
import { DOCS_TEST_PREFIX } from './ids';

/**
 * App-level state that tests may change but can't create under a docs-test name:
 * app settings (incl. push config), the built-in / pre-existing channel types, and
 * retention policies.
 */
export type AppSnapshot = Record<string, unknown>;

const VOLATILE_KEYS = new Set(['created_at', 'updated_at', 'duration']);

/** Drops timestamps and sorts keys and lists, so equal state serializes identically. */
const normalize = (value: unknown): unknown => {
  // Some lists (e.g. geofences) come back in a different order on every call.
  if (Array.isArray(value)) {
    return value
      .map(normalize)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  // node-sdk decodes timestamps to Dates; compare them by value.
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !VOLATILE_KEYS.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
};

export const takeAppSnapshot = async (client: StreamClient): Promise<AppSnapshot> => {
  const snapshot: AppSnapshot = {};
  const { app } = await client.getApp();
  for (const [key, value] of Object.entries(app ?? {})) {
    // Also lists docs-test channel types; channel types are compared separately below.
    if (key === 'channel_configs') continue;
    snapshot[`app.${key}`] = normalize(value);
  }
  const { channel_types } = await client.chat.listChannelTypes();
  for (const [name, type] of Object.entries(channel_types)) {
    if (!name.startsWith(DOCS_TEST_PREFIX))
      snapshot[`channel_type.${name}`] = normalize(type);
  }
  try {
    snapshot.retention_policies = normalize(
      (await client.chat.getRetentionPolicy()).policies,
    );
  } catch {
    // Not available on every plan.
  }
  return snapshot;
};

/** Keys whose value differs between two snapshots. */
export const diffAppSnapshots = (before: AppSnapshot, after: AppSnapshot) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort();
