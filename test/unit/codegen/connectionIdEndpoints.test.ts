import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `requiresConnectionId` (src/api-client.ts) gates on the `watch` / `presence` flags, and falls
 * back to the generated `queryParams` carrying a `connection_id` key for the operations that
 * declare no flag at all: `stopWatchingChannel` and `longPoll`. The generator emits that key for
 * every operation the client-side OpenAPI spec declares one on, even when the value is `undefined`.
 *
 * That coupling is invisible at runtime: should the generator start omitting keys holding
 * `undefined`, the fallback would silently stop firing for those two, and they would start racing
 * the handshake again with nothing failing. This test pins the set instead.
 *
 * The other seven entries are not load-bearing for the fallback - they all declare a flag, which is
 * read first - but they are pinned so that a regenerated spec adding a connection-scoped operation
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
