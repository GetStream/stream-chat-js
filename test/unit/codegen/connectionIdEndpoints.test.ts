import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { requiresConnectionId } from '../../../src/api-client';

/**
 * `requiresConnectionId` (src/api-client.ts) gates only on the `watch` / `presence` flags. The two
 * generated operations that declare `connection_id` but carry no flag set it themselves:
 * `stopWatchingChannel` from `StreamChat`'s override, which always waits for the connection id as the
 * gate does and sends it, and `longPoll`'s endpoint from the long-poll fallback, which addresses its
 * own polls. `searchAll` declares it too, but the SDK does not call it, so a caller passes its own.
 *
 * That makes every new flagless, connection-scoped operation a place the id has to be set by hand,
 * with nothing failing if it is not. This test pins the set, so a regenerated spec adding one
 * surfaces here rather than passing silently.
 */
const GEN_ROOT = join(__dirname, '../../../src/gen');

const ENDPOINTS_DECLARING_CONNECTION_ID = [
  'getOrCreateChannel',
  'getOrCreateDistinctChannel',
  'getThread',
  'groupedQueryChannels',
  'longPoll',
  'queryChannels',
  'queryThreads',
  'queryUsers',
  'searchAll',
  'stopWatchingChannel',
  'sync',
];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.ts') ? [path] : [];
  });

const methodsEmittingConnectionId = () => {
  const found = new Set<string>();

  for (const file of walk(GEN_ROOT)) {
    const source = readFileSync(file, 'utf8');
    // Only the classes that send requests. A resource class (`ChannelApi`) restates the signatures of
    // the operations it wraps, which would list `getOrCreate` / `stopWatching` alongside them.
    if (!source.includes('this.apiClient.sendRequest')) continue;

    let currentMethod: string | undefined;

    for (const line of source.split('\n')) {
      const declaration = /^\s{2}(?:async\s+)?([A-Za-z0-9_]+)\(\s*$/.exec(line);
      if (declaration) currentMethod = declaration[1];

      // The request is passed through as-is, so a query param shows up only in the method's
      // signature (`request?: … & { connection_id?: string }`) and the destructure that splits it off.
      if (/\bconnection_id\??:/.test(line) && currentMethod) {
        found.add(currentMethod);
      }
    }
  }

  return [...found].sort();
};

describe('generated endpoints declaring connection_id', () => {
  it('matches the set the api-client gate is written against', () => {
    expect(methodsEmittingConnectionId()).to.eql(ENDPOINTS_DECLARING_CONNECTION_ID);
  });

  it('includes queryUsers, which still relies on the payload.presence probe', () => {
    // Generated queryUsers only forwards a caller's `connection_id`; the presence probe attaches it.
    expect(methodsEmittingConnectionId()).toContain('queryUsers');
    expect(requiresConnectionId({ payload: { presence: true } }, undefined)).toBe(true);
  });
});
