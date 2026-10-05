import { randomBytes } from 'node:crypto';

// Every id created by a docs test starts with this prefix, so leftovers from
// crashed runs are easy to find and sweep.
export const DOCS_TEST_PREFIX = 'docs-test';

/**
 * One id per test file run (each test file gets its own module instance).
 * Starts with `Date.now()` in base36 (8 chars) so the sweep can tell how old an id is.
 */
export const runId = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
let counter = 0;

/** Every id handed out by `uniqueId` in this test file; the leak check looks these up. */
export const mintedIds = new Set<string>();

/**
 * Returns an id that is unique across runs, e.g. `docs-test-john-lx3k9a1f-1`.
 * Use it for the id or name of everything a test creates: users, channels, channel
 * types, roles, commands, blocklists, segments, campaigns, user groups, moderation
 * configs, predefined filters, ... Anything named this way is found by the leak check.
 */
export const uniqueId = (name: string) => {
  const id = `${DOCS_TEST_PREFIX}-${name}-${runId}-${++counter}`;
  mintedIds.add(id);
  return id;
};

const RUN_ID_RE = /-([0-9a-z]{8})[0-9a-f]{4}-\d+$/;

/** When the run that minted `id` started, or undefined if `id` wasn't made by `uniqueId`. */
export const createdAtFromId = (id: string) => {
  const match = id.includes(DOCS_TEST_PREFIX) ? RUN_ID_RE.exec(id) : null;
  return match ? new Date(parseInt(match[1], 36)) : undefined;
};
