import { expect, it } from 'vitest';
import { getServerClient } from '../helpers/clients';
import { createdAtFromId, DOCS_TEST_PREFIX } from '../helpers/ids';
import { describeLeftovers, findLeftovers, removeLeftovers } from '../helpers/leaks';
import type { Leftover } from '../helpers/leaks';

// Finds (and by default removes) everything with the docs-test prefix, e.g. after a
// crashed run. Run with `yarn test-docs-sweep`.
//   DOCS_SWEEP_DRY_RUN=1   only list what would be removed
//   DOCS_SWEEP_MIN_AGE=0   minutes; skip younger resources so runs in progress are left alone (default 30)
const dryRun = process.env.DOCS_SWEEP_DRY_RUN === '1';
const minAgeMinutes = Number(process.env.DOCS_SWEEP_MIN_AGE ?? 30);

const isOldEnough = (leftover: Leftover) => {
  const createdAt = leftover.createdAt
    ? new Date(leftover.createdAt)
    : createdAtFromId(leftover.id.split(' ')[0]);
  // Unknown age: only sweep it when explicitly asked to ignore age.
  if (!createdAt || Number.isNaN(createdAt.getTime())) return minAgeMinutes === 0;
  return Date.now() - createdAt.getTime() >= minAgeMinutes * 60_000;
};

it('sweeps docs-test leftovers', async () => {
  const serverClient = getServerClient();
  const { leftovers, errors } = await findLeftovers(serverClient, {
    // `includes`: guest user ids are rewritten to `guest-<uuid>-docs-test-...`.
    matches: (id) => id.includes(DOCS_TEST_PREFIX),
    // Channels can't be searched by id prefix. Channels of docs-test users go away with
    // the users (conversations: 'hard') and channels of docs-test types with the types;
    // anything else must be found by the per-file leak check.
    channelIds: [],
  });

  if (errors.length) console.warn(`could not scan:\n  ${errors.join('\n  ')}`);
  const toRemove = leftovers.filter(isOldEnough);
  const skipped = leftovers.length - toRemove.length;

  console.log(
    toRemove.length
      ? `${dryRun ? 'Would remove' : 'Removing'} ${toRemove.length} leftover(s):\n${describeLeftovers(toRemove)}`
      : 'No docs-test leftovers found.',
  );
  if (skipped) {
    console.log(
      `Skipped ${skipped} younger than ${minAgeMinutes} min (DOCS_SWEEP_MIN_AGE=0 to include).`,
    );
  }
  if (dryRun) return;

  const failed = await removeLeftovers(toRemove);
  for (const { leftover, error } of failed) {
    console.error(`failed to remove ${leftover.kind} ${leftover.id}: ${error}`);
  }
  expect(failed).toEqual([]);
});
