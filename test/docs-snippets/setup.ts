import { config } from 'dotenv';
import path from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { getServerClient } from './helpers/clients';
import { mintedIds, runId } from './helpers/ids';
import { describeLeftovers, findLeftovers, removeLeftovers } from './helpers/leaks';
import { diffAppSnapshots, takeAppSnapshot } from './helpers/snapshot';
import type { AppSnapshot } from './helpers/snapshot';
import { retry } from './helpers/wait';

config({ path: path.join(__dirname, '.env'), quiet: true });

if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
  throw new Error(
    'Missing STREAM_API_KEY / STREAM_API_SECRET. Copy test/docs-snippets/.env.example to test/docs-snippets/.env and fill it in.',
  );
}

// These hooks are registered before the test file's own hooks, so `afterAll` below
// runs after the file's cleanup (vitest runs after-hooks in reverse order).

let snapshot: AppSnapshot | undefined;

beforeAll(async () => {
  snapshot = await takeAppSnapshot(getServerClient());
});

afterAll(async () => {
  const serverClient = getServerClient();

  let leakError: Error | undefined;

  // Leak check: everything this file created through `uniqueId` must be gone.
  if (mintedIds.size) {
    const filter = {
      matches: (id: string) => mintedIds.has(id) || id.includes(runId),
      channelIds: [...mintedIds],
    };
    let scan = await findLeftovers(serverClient, filter);
    if (scan.leftovers.length) {
      // Deletes are eventually consistent: only report what is still there after a while.
      scan = await retry(
        async () => {
          const rescan = await findLeftovers(serverClient, filter);
          if (rescan.leftovers.length) throw rescan;
          return rescan;
        },
        { timeout: 15000, interval: 3000 },
      ).catch((stillThere: typeof scan) => stillThere);
    }
    if (scan.errors.length) {
      console.warn(
        `[docs-snippets] leak check could not scan:\n  ${scan.errors.join('\n  ')}`,
      );
    }
    if (scan.leftovers.length) {
      // Thrown at the end, together with a possible drift error.
      const failed = await removeLeftovers(scan.leftovers);
      leakError = new Error(
        `[docs-snippets] LEAK: this test file left resources behind (they have now been removed` +
          `${failed.length ? `, except ${failed.length} that failed - run \`yarn test-docs-sweep\`` : ''}).\n` +
          `Register them on \`Cleanup\` (cleanup.users / channels / channelTypes, or cleanup.add(...)):\n` +
          describeLeftovers(scan.leftovers),
      );
    }
  }

  // App-level drift: settings a test changed must be restored (cleanup.add). Pages are
  // run one at a time, so any drift was caused by this file.
  let driftError: Error | undefined;
  if (snapshot) {
    const drift = diffAppSnapshots(snapshot, await takeAppSnapshot(serverClient));
    if (drift.length) {
      driftError = new Error(
        `[docs-snippets] DRIFT: app settings changed by this file were not restored. Save the original values and restore them with cleanup.add(...):\n  ${drift.join('\n  ')}`,
      );
    }
  }

  if (leakError && driftError) {
    throw new AggregateError(
      [leakError, driftError],
      `${leakError.message}\n\n${driftError.message}`,
    );
  }
  if (leakError ?? driftError) throw leakError ?? driftError;
});
