import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Removes the `_request?: Record<string, never>` parameter the generator emits on body-less
 * endpoints (`getApp`, `getPoll`, `listDevices`, ...). It is never read and only holds a position,
 * so callers had to pass `undefined` before they could reach `requestOptions`. Without it,
 * `requestOptions` directly follows the path params, or is the first argument.
 *
 * Usage: node scripts/drop-placeholder-request-params.mts <path-to-api-file>...
 */
const PLACEHOLDER_PARAM_RE = /^\s*_request\?: Record<string, never>,\s*$/;

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error(
    'Usage: node scripts/drop-placeholder-request-params.mts <path-to-api-file>...',
  );
  process.exit(1);
}

for (const path of paths) {
  const absolutePath = resolve(process.cwd(), path);
  const lines = readFileSync(absolutePath, 'utf8').split('\n');
  const kept = lines.filter((line) => !PLACEHOLDER_PARAM_RE.test(line));
  writeFileSync(absolutePath, kept.join('\n'));
  console.log(
    `${path}: dropped ${lines.length - kept.length} placeholder request params.`,
  );
}
