import fs from 'node:fs';
import path from 'node:path';

import { readCallSiteCopy } from './callSites';
import {
  formatFailures,
  guardConflictingCopy,
  guardPrefixCollisions,
  guardShadowedKeys,
  guardUnresolvableKeys,
} from './guards';
import { readStringMap } from './stringMaps';
import type { GeneratedCatalog, GeneratorConfig } from './types';

/** Values under these prefixes are dayjs/i18next expressions, not copy. */
const BUILTIN_FORMATTER_PREFIXES = ['timestamp.', 'duration.'];

/**
 * Two ways English hides inside a formatter expression, both of which have to be reported: a translator
 * working from the JSON export never sees these keys otherwise.
 */
const hasEnglishWords = (value: string) =>
  // Day words baked into a `calendarFormats` argument, e.g. `[Yesterday]` — dayjs escapes literal text
  // in brackets.
  [...value.matchAll(/\[([^\]]+)\]/g)].some(([, literal]) =>
    /[A-Za-z]{2}/.test(literal),
  ) ||
  // Prose sitting beside the interpolation, e.g. `Last seen {{ timestamp | … }}`. Each expression is
  // matched individually — a greedy `{{[\s\S]*}}` would span from the first `{{` to the last `}}` and
  // swallow the prose between two of them. Stopping at `}}` rather than any `}` is what keeps the
  // nested braces of a `calendarFormats` argument inside the match.
  /[A-Za-z]{2}/.test(value.replace(/\{\{(?:[^}]|\}(?!\}))*\}\}/g, ''));

/**
 * Builds the catalog and runs every guard, without writing anything.
 *
 * Separate from {@link generateI18nKeys} so a test — or a caller wanting to inspect before committing —
 * can get the failures as data rather than as process output.
 */
export const buildCatalog = (config: GeneratorConfig): GeneratedCatalog => {
  const { runtimeDefaultsPath, ts } = config;

  const runtimeDefaults = readStringMap({
    exportName: 'runtimeDefaults',
    file: runtimeDefaultsPath,
    ts,
  });
  const {
    conflicts,
    copy: inlineCopy,
    withoutCopy,
  } = readCallSiteCopy({
    ignoreDirs: config.ignoreDirs,
    srcRoot: config.srcRoot,
    ts,
  });

  const catalogEntries = new Map([...inlineCopy, ...runtimeDefaults]);
  const keys = [...catalogEntries.keys()].sort();
  const catalog = new Map(keys.map((key) => [key, catalogEntries.get(key) as string]));

  const failures = [
    guardConflictingCopy(conflicts),
    guardUnresolvableKeys({ runtimeDefaults, runtimeDefaultsPath, withoutCopy }),
    guardShadowedKeys({ inlineCopy, runtimeDefaults, runtimeDefaultsPath }),
    guardPrefixCollisions(keys),
  ].filter((failure): failure is NonNullable<typeof failure> => failure !== null);

  return { bundledKeys: [...runtimeDefaults.keys()].sort(), catalog, failures };
};

const renderKeysFile = ({
  bundledKeys,
  catalog,
  emitBundledKeyUnion,
}: {
  bundledKeys: string[];
  catalog: Map<string, string>;
  emitBundledKeyUnion?: boolean;
}): string => {
  const lines: string[] = [
    '// AUTO-GENERATED — do not edit by hand.',
    '// Regenerate with `yarn build-translations`. CI fails if this file is out of sync.',
    '//',
    '// Type-only: no runtime value is emitted, so this adds nothing to the bundle.',
    '',
    '/**',
    ' * Every translation entry shipped with the SDK, mapped to its English copy.',
    ' *',
    ' * Plural entries appear as `<key>_one` / `<key>_other`; call sites use the bare `<key>` and',
    ' * pass `count`.',
    ' */',
    'export type TranslationCatalog = {',
  ];

  for (const [key, value] of catalog) {
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)};`);
  }
  lines.push('};', '');

  if (emitBundledKeyUnion) {
    lines.push(
      '/**',
      ' * Keys whose copy is bundled rather than passed inline at the call site.',
      ' *',
      ' * They reach `t()` as runtime values — a JSX prop, a ternary branch, a lookup table — so there',
      ' * is nowhere to write a `defaultValue`. Call sites pass the key alone.',
      ' */',
      'export type BundledTranslationKey =',
    );
    for (const key of bundledKeys) lines.push(`  | ${JSON.stringify(key)}`);
    lines.push(';', '');
  }

  return lines.join('\n');
};

/**
 * Regenerates an SDK's translation catalog from its `t()` call sites and bundled defaults.
 *
 * Throws on a guard failure with every failure formatted, so the caller's script exits non-zero and CI
 * fails. The catalog is written only when all guards pass.
 */
export const generateI18nKeys = (config: GeneratorConfig): GeneratedCatalog => {
  const log = config.log ?? ((message: string) => console.log(message));
  const result = buildCatalog(config);

  if (result.failures.length) {
    throw new Error(formatFailures(result.failures));
  }

  const { bundledKeys, catalog } = result;
  const keys = [...catalog.keys()];

  fs.mkdirSync(path.dirname(config.keysOut), { recursive: true });
  fs.writeFileSync(
    config.keysOut,
    renderKeysFile({
      bundledKeys,
      catalog,
      emitBundledKeyUnion: config.emitBundledKeyUnion,
    }),
  );

  if (config.fixtureOut) {
    fs.mkdirSync(path.dirname(config.fixtureOut), { recursive: true });
    fs.writeFileSync(
      config.fixtureOut,
      `${JSON.stringify(Object.fromEntries(catalog), null, 2)}\n`,
    );
  }

  log(
    `generated ${config.keysOut} (${keys.length} entries, type-only) — ` +
      `${keys.length - bundledKeys.length} from inline defaults, ${bundledKeys.length} bundled`,
  );

  if (config.json) {
    const formatterPrefixes = [
      ...BUILTIN_FORMATTER_PREFIXES,
      ...(config.extraFormatterPrefixes ?? []),
    ];
    const isFormatterKey = (key: string) =>
      formatterPrefixes.some((prefix) => key.startsWith(prefix));

    const exported = config.json.includeFormats
      ? keys
      : keys.filter((k) => !isFormatterKey(k));
    fs.writeFileSync(
      config.json.out,
      `${JSON.stringify(
        Object.fromEntries(exported.map((key) => [key, catalog.get(key)])),
        null,
        2,
      )}\n`,
    );

    log(
      `wrote ${config.json.out} (${exported.length} ${
        config.json.includeFormats
          ? 'entries, formatter expressions included'
          : 'translatable entries'
      })`,
    );

    const excluded = keys.filter((key) => !exported.includes(key));
    if (excluded.length) {
      // Excluding formatter expressions does drop some translatable text: a few embed English day
      // words. It is not translatable *as copy* — the format string has to be rewritten — so it is
      // named here and handled by overriding the key. Detected rather than hardcoded, so the list
      // cannot go stale.
      const withEnglish = excluded.filter((key) =>
        hasEnglishWords(catalog.get(key) as string),
      );
      log(
        `  excluded ${excluded.length} formatter expressions (${formatterPrefixes.join(', ')}) — ` +
          `not copy, and a TMS that translates them breaks date rendering. Pass --all to include ` +
          `them.` +
          (withEnglish.length
            ? `\n  ${withEnglish.length} of them do carry English copy and must be translated by ` +
              `overriding the key:\n${withEnglish.map((key) => `    ${key}`).join('\n')}` +
              (config.migrationGuideRef ? `\n  see ${config.migrationGuideRef}.` : '')
            : ''),
      );
    }
  }

  return result;
};
