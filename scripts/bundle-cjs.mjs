#!/usr/bin/env node

import { resolve } from 'node:path';
import * as esbuild from 'esbuild';
import packageJson from '../package.json' with {'type': 'json'};

// import.meta.dirname is not available before Node 20
const __dirname = import.meta.dirname;

const mainEntrypoint = resolve(__dirname, '../src/index.ts');
const outDir = resolve(__dirname, '../dist');

// Those dependencies are distributed as ES modules, and cannot be externalized
// in our CJS bundle. We convert them to CJS and bundle them instead.
const bundledDeps = [
  'axios',
  'form-data',
  'isomorphic-ws',
  'base64-js',
];

const deps = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.peerDependencies,
});
const external = deps.filter((dep) => !bundledDeps.includes(dep));

/** @type esbuild.BuildOptions */
const cjsBundleConfig = {
  entryPoints: [mainEntrypoint],
  bundle: true,
  format: 'cjs',
  target: "ES6",
  external,
  outdir: outDir,
  outExtension: { '.js': '.cjs' },
  sourcemap: 'linked',
};

// We build two CJS bundles: for browser and for node. The latter one can be
// used e.g. during SSR (although it makes little sence to SSR chat, but still
// nice for import not to break on server).
const bundles = ['browser', 'node'].map((platform) => {
  const config = {
    ...cjsBundleConfig,
    entryNames: `[dir]/[name].${platform}`,
    platform,
    define: {
      'process.env.PKG_VERSION': JSON.stringify(packageJson.version),
    },
  };

  esbuild.build(config);
});
await Promise.all(bundles);
