#!/usr/bin/env node

import { resolve } from 'node:path';
import { builtinModules } from 'node:module';
import * as esbuild from 'esbuild';
import packageJson from '../package.json' with { type: 'json' };
import getPackageVersion from './get-package-version.mjs';

// import.meta.dirname is not available before Node 20
const __dirname = import.meta.dirname;

const watchModeEnabled = process.argv.includes('--watch') || process.argv.includes('-w');

const version = getPackageVersion();

const modules = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.peerDependencies,
});

// do not externalize modules that are ignored in browser field
// externalizing them will cause esbuild to not replace the imports
// in the bundles
const browserIgnoreModules = []; // Object.keys(packageJson.browser);
const browserExternal = modules.filter(
  (module) => !browserIgnoreModules.includes(module),
);
const nodeExternal = [...modules, ...builtinModules];

/** @type esbuild.BuildOptions */
const commonBuildOptions = {
  // Name-keyed so `[name]` stays stable per entry. `i18n` is a separate entry point on purpose: it
  // pulls in i18next and dayjs, and keeping those out of the root bundle is the whole reason
  // `stream-chat/i18n` exists as a subpath. `assertBundleBoundaries` enforces that below.
  entryPoints: {
    index: resolve(__dirname, '../src/index.ts'),
    i18n: resolve(__dirname, '../src/i18n/index.ts'),
  },
  bundle: true,
  metafile: true,
  target: 'ES2020',
  sourcemap: watchModeEnabled ? 'inline' : 'linked',
  define: {
    'process.env.PKG_VERSION': JSON.stringify(version),
  },
};

/** Dependencies that must never be reachable from the root bundle. */
const I18N_ONLY_DEPENDENCIES = ['i18next', 'dayjs'];

/**
 * Fails the build if the entry-point boundaries have been crossed.
 *
 * Two directions, both of which are a single careless `export * from './i18n'` away:
 *   - the root bundle must not reach `src/i18n/` or its dependencies, or every consumer of
 *     `stream-chat` pays for i18next and dayjs whether they translate anything or not;
 *   - the i18n bundle must not reach `src/i18n-codegen/`, which is Node-only build tooling.
 *
 * Checked here rather than left to review, because the failure is invisible: everything still works,
 * the bundle is just quietly bigger.
 */
const assertBundleBoundaries = (metafile) => {
  const failures = [];

  for (const [outputFile, output] of Object.entries(metafile.outputs)) {
    if (!output.entryPoint) continue;

    const forbidden = output.entryPoint.endsWith('src/index.ts')
      ? { deps: I18N_ONLY_DEPENDENCIES, sources: /(^|\/)src\/i18n\// }
      : { deps: [], sources: /(^|\/)src\/i18n-codegen\// };

    const leakedSources = Object.keys(output.inputs).filter((input) =>
      forbidden.sources.test(input),
    );
    const leakedDeps = (output.imports ?? [])
      .map(({ path }) => path)
      .filter((path) =>
        forbidden.deps.some((dep) => path === dep || path.startsWith(`${dep}/`)),
      );

    if (leakedSources.length || leakedDeps.length) {
      failures.push(
        `${outputFile} (entry ${output.entryPoint}) must not reach: ` +
          [...new Set([...leakedSources, ...leakedDeps])].join(', '),
      );
    }
  }

  if (failures.length) {
    console.error(`\nBundle boundary violated:\n  ${failures.join('\n  ')}\n`);
    process.exit(1);
  }
};

/**
 * process.env.CLIENT_BUNDLE values:
 *
 * - index.js - browser-esm
 * - index.browser.cjs - browser-cjs
 * - index.node.cjs - node-cjs
 */

// We build two CJS bundles: for browser and for node. The latter one can be
// used e.g. during SSR (although it makes little sence to SSR chat, but still
// nice for import not to break on server).
const bundles = [
  // CJS (browser & Node)
  ['browser', 'node'].map((platform) => ({
    ...commonBuildOptions,
    format: 'cjs',
    external: platform === 'browser' ? browserExternal : nodeExternal,
    entryNames: `[dir]/[name].${platform}`,
    outdir: resolve(__dirname, '../dist/cjs'),
    platform,
    define: {
      ...commonBuildOptions.define,
      'process.env.CLIENT_BUNDLE': JSON.stringify(`${platform}-cjs`),
    },
  })),
  // ESM (browser only)
  {
    ...commonBuildOptions,
    format: 'esm',
    external: browserExternal,
    outExtension: { '.js': '.mjs' },
    outdir: resolve(__dirname, '../dist/esm'),
    entryNames: `[dir]/[name]`,
    platform: 'browser',
    define: {
      ...commonBuildOptions.define,
      'process.env.CLIENT_BUNDLE': JSON.stringify('browser-esm'),
    },
  },
].flat();

if (watchModeEnabled) {
  const contexts = await Promise.all(bundles.map((config) => esbuild.context(config)));

  await Promise.all(contexts.map((context) => context.watch()));

  console.log('ESBuild is watching for changes...');
} else {
  const results = await Promise.all(bundles.map((config) => esbuild.build(config)));
  results.forEach(({ metafile }) => metafile && assertBundleBoundaries(metafile));
}
