#!/usr/bin/env node

import { resolve } from 'node:path';
import * as esbuild from 'esbuild';
import packageJson from '../package.json' with {'type': 'json'};
import getPackageVersion from './get-package-version.mjs';

// import.meta.dirname is not available before Node 20
const __dirname = import.meta.dirname;

// Those dependencies are distributed as ES modules, and cannot be externalized
// in our CJS bundle. We convert them to CJS and bundle them instead.
const bundledDeps = ['axios', 'form-data', 'isomorphic-ws', 'base64-js'];

const version = getPackageVersion();

const deps = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.peerDependencies,
});
const external = deps.filter((dep) => !bundledDeps.includes(dep));

/** @type esbuild.BuildOptions */
const commonBuildOptions = {
  entryPoints: [resolve(__dirname, '../src/index.ts')],
  bundle: true,
  target: 'ES2020',
  sourcemap: 'linked',
  define: {
    'process.env.PKG_VERSION': JSON.stringify(version),
  },
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
    external,
    outExtension: { '.js': '.cjs' },
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
    outdir: resolve(__dirname, '../dist/esm'),
    entryNames: `[dir]/[name]`,
    platform: 'browser',
    define: {
      ...commonBuildOptions.define,
      'process.env.CLIENT_BUNDLE': JSON.stringify('browser-esm'),
    },
  },
]
  .flat()
  .map((config) => esbuild.build(config));

await Promise.all(bundles);
