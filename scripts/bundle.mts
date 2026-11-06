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

const { dependencies = {}, peerDependencies = {} } = packageJson as {
  dependencies?: Record<string, string>;
  // There are none today. Kept in the spread so that adding one externalizes it automatically rather
  // than silently bundling it — `tsc` rejected reading the absent field, which is how this surfaced.
  peerDependencies?: Record<string, string>;
};

const modules = Object.keys({ ...dependencies, ...peerDependencies });

// do not externalize modules that are ignored in browser field
// externalizing them will cause esbuild to not replace the imports
// in the bundles
const browserIgnoreModules: string[] = []; // Object.keys(packageJson.browser);
const browserExternal = modules.filter(
  (module) => !browserIgnoreModules.includes(module),
);
const nodeExternal = [...modules, ...builtinModules];

const commonBuildOptions = {
  // Name-keyed so `[name]` stays stable per entry.
  entryPoints: {
    index: resolve(__dirname, '../src/index.ts'),
  },
  bundle: true,
  metafile: true,
  target: 'ES2020',
  sourcemap: watchModeEnabled ? 'inline' : 'linked',
  define: {
    'process.env.PKG_VERSION': JSON.stringify(version),
  },
  // `satisfies` rather than a `: esbuild.BuildOptions` annotation. The annotation would widen every
  // field to its optional declared type, so `...commonBuildOptions.define` below would spread a
  // possibly-`undefined` value and stop typechecking. This checks the literal against `BuildOptions`
  // while keeping its exact shape.
} satisfies esbuild.BuildOptions;

type EntryBoundary = {
  /** Suffix-matched against esbuild's `entryPoint`. */
  entry: string;
  /** Bare module specifiers this entry must not import, matched exactly or as a subpath prefix. */
  forbiddenDeps: string[];
  /** Input paths this entry must not reach. `null` means no restriction. */
  forbiddenSources: RegExp | null;
};

/**
 * What each entry point is forbidden from reaching. Keyed on the entry explicitly rather than by
 * elimination, so a new entry gets no rule by accident (and the codegen entry is not told off for
 * reaching its own source).
 */
const ENTRY_BOUNDARIES: EntryBoundary[] = [
  {
    // The only entry point. The translation layer that used to live behind `stream-chat/i18n` — and
    // the `i18next`/`dayjs` it pulled in — now ships as `@stream-io/i18n`, so there is no second
    // bundle to keep it out of. The mechanism is kept because it is what makes *adding* an entry
    // point a deliberate act: an undeclared one fails the build rather than silently shipping.
    entry: 'src/index.ts',
    forbiddenDeps: [],
    forbiddenSources: null,
  },
];

/**
 * Fails the build if an entry point reached something it must not.
 *
 * Nothing is forbidden today: the i18n layer this used to fence off now lives in `@stream-io/i18n`,
 * so the root bundle is the only bundle. What the check still buys is the *undeclared entry* failure
 * below — a new entry point has to state its boundary rather than inherit none by accident.
 *
 * Checked here rather than left to review, because this class of failure is invisible: everything
 * still works, the bundle is just quietly bigger.
 */
const assertBundleBoundaries = (metafile: esbuild.Metafile) => {
  const failures: string[] = [];

  for (const [outputFile, output] of Object.entries(metafile.outputs)) {
    const { entryPoint } = output;
    if (!entryPoint) continue;

    // Hoisted out of `output` because a narrowing does not survive into the callback below.
    const boundary = ENTRY_BOUNDARIES.find(({ entry }) => entryPoint.endsWith(entry));
    if (!boundary) {
      failures.push(
        `${outputFile} (entry ${entryPoint}) has no declared boundary — add one to ` +
          `ENTRY_BOUNDARIES in scripts/bundle.mts.`,
      );
      continue;
    }

    const forbidden = {
      deps: boundary.forbiddenDeps,
      sources: boundary.forbiddenSources,
    };

    const { sources: forbiddenSources } = forbidden;
    const leakedSources = forbiddenSources
      ? Object.keys(output.inputs).filter((input) => forbiddenSources.test(input))
      : [];
    const leakedDeps = (output.imports ?? [])
      .map(({ path }) => path)
      .filter((path) =>
        forbidden.deps.some((dep) => path === dep || path.startsWith(`${dep}/`)),
      );

    if (leakedSources.length || leakedDeps.length) {
      failures.push(
        `${outputFile} (entry ${entryPoint}) must not reach: ` +
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
  (['browser', 'node'] as const).map(
    (platform): esbuild.BuildOptions => ({
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
    }),
  ),
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
  } satisfies esbuild.BuildOptions,
].flat();

if (watchModeEnabled) {
  const contexts = await Promise.all(bundles.map((config) => esbuild.context(config)));

  await Promise.all(contexts.map((context) => context.watch()));

  console.log('ESBuild is watching for changes...');
} else {
  const results = await Promise.all(bundles.map((config) => esbuild.build(config)));
  results.forEach(({ metafile }) => metafile && assertBundleBoundaries(metafile));
}
