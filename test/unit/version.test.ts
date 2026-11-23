import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as root from '../../src';
import { parseVersion, readInjectedVersion } from '../../src/version';

describe('parseVersion', () => {
  it.each([
    [
      '10.0.1',
      {
        major: 10,
        minor: 0,
        patch: 1,
        prerelease: null,
        prereleaseNumber: null,
        raw: '10.0.1',
      },
    ],
    [
      '10.0.2-beta.1',
      {
        major: 10,
        minor: 0,
        patch: 2,
        prerelease: 'beta',
        prereleaseNumber: 1,
        raw: '10.0.2-beta.1',
      },
    ],
    [
      '10.0.0-rc.35',
      {
        major: 10,
        minor: 0,
        patch: 0,
        prerelease: 'rc',
        prereleaseNumber: 35,
        raw: '10.0.0-rc.35',
      },
    ],
    [
      // An id with its own dashes, from this repo's tag history: the whole id survives.
      '10.0.0-offline-support-beta.2',
      {
        major: 10,
        minor: 0,
        patch: 0,
        prerelease: 'offline-support-beta',
        prereleaseNumber: 2,
        raw: '10.0.0-offline-support-beta.2',
      },
    ],
    [
      '9.0.0-insights',
      {
        major: 9,
        minor: 0,
        patch: 0,
        prerelease: 'insights',
        prereleaseNumber: null,
        raw: '9.0.0-insights',
      },
    ],
    [
      // No `.N` to split off: a numeric-only id stays the id.
      '1.0.0-1',
      {
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: '1',
        prereleaseNumber: null,
        raw: '1.0.0-1',
      },
    ],
    [
      '10.0.1+build.7',
      {
        major: 10,
        minor: 0,
        patch: 1,
        prerelease: null,
        prereleaseNumber: null,
        raw: '10.0.1+build.7',
      },
    ],
    [
      'v10.0.1',
      {
        major: 10,
        minor: 0,
        patch: 1,
        prerelease: null,
        prereleaseNumber: null,
        raw: 'v10.0.1',
      },
    ],
  ])('parses %s', (input, expected) => {
    expect(parseVersion(input)).toEqual(expected);
  });

  it('falls back to 0.0.0-development when PKG_VERSION is missing or empty', () => {
    const fallback = {
      major: 0,
      minor: 0,
      patch: 0,
      prerelease: 'development',
      prereleaseNumber: null,
      raw: '0.0.0-development',
    };
    expect(parseVersion(undefined)).toEqual(fallback);
    expect(parseVersion('')).toEqual(fallback);
  });

  it('does not throw on unparseable input and keeps it in raw', () => {
    expect(parseVersion('not-a-version')).toEqual({
      major: 0,
      minor: 0,
      patch: 0,
      prerelease: null,
      prereleaseNumber: null,
      raw: 'not-a-version',
    });
    expect(parseVersion('10.0')).toEqual({
      major: 0,
      minor: 0,
      patch: 0,
      prerelease: null,
      prereleaseNumber: null,
      raw: '10.0',
    });
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(parseVersion('10.0.1'))).toBe(true);
  });
});

describe('readInjectedVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads PKG_VERSION from the environment', () => {
    vi.stubEnv('PKG_VERSION', '1.2.3');
    expect(readInjectedVersion()).toBe('1.2.3');
  });

  // A browser loading `src/` unbundled has no `process`; importing the SDK must not throw there.
  it('returns undefined instead of throwing when process is not defined', () => {
    vi.stubGlobal('process', undefined);
    expect(readInjectedVersion()).toBeUndefined();
  });
});

describe('version', () => {
  it('is the only name the root export takes from src/version.ts', () => {
    expect(root).toHaveProperty('version');
    for (const internal of [
      'parseVersion',
      'readInjectedVersion',
      'readInjectedClientBundle',
    ]) {
      expect(root).not.toHaveProperty(internal);
    }
  });

  // The dist is one file, so `sideEffects: false` cannot drop this module for a consumer; only the
  // `#__PURE__` annotations let their bundler remove an unused `version`.
  it('is removed by a bundler when nothing imports it', async () => {
    const result = await build({
      stdin: {
        contents:
          "import { parseVersion } from './src/version'; console.log(parseVersion);",
        loader: 'ts',
        resolveDir: fileURLToPath(new URL('../..', import.meta.url)),
      },
      bundle: true,
      format: 'esm',
      write: false,
    });

    expect(result.outputFiles[0].text).not.toContain('readInjectedVersion');
  });
});
