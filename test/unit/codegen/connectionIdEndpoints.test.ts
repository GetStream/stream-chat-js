import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `requiresConnectionId` (src/api-client.ts) gates only on the `watch` / `presence` flags. The two
 * generated operations that declare `connection_id` but carry no flag set it themselves:
 * `stopWatchingChannel` from `StreamChat`'s override, which waits for a connection being established
 * and sends its id, and `longPoll`'s endpoint from the long-poll fallback, which addresses its own polls.
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
    const lines = readFileSync(file, 'utf8').split('\n');
    let currentMethod: string | undefined;

    for (const line of lines) {
      const declaration = /^\s{2}(?:async\s+)?([A-Za-z0-9_]+)\(\s*$/.exec(line);
      if (declaration) currentMethod = declaration[1];

      if (line.includes('connection_id: request?.connection_id') && currentMethod) {
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

  it('does not include queryUsers, which the payload.presence probe exists for', () => {
    // GET /users needs a connection id to subscribe to presence but the spec declares no
    // `connection_id` param, so it is the one operation the flag probes alone keep gated. Drop
    // those probes and queryUsers silently stops waiting.
    expect(methodsEmittingConnectionId()).not.toContain('queryUsers');
  });
});
