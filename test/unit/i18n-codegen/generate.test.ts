import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

import { buildCatalog, generateI18nKeys, readStringMap } from '../../../src/i18n-codegen';
import type { GeneratorConfig } from '../../../src/i18n-codegen';

/**
 * Fixtures are written to a scratch directory and the generator runs in-process against them.
 *
 * In-process rather than by spawning the script: the failures come back as data, so a test asserts on
 * the failure itself instead of scraping stderr — which is what most of the length of the SDK-side
 * version of this suite was. It also means real stack traces on failure.
 */
const scratchDirs: string[] = [];

const makeProject = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-codegen-'));
  scratchDirs.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
};

const configFor = (
  dir: string,
  overrides: Partial<GeneratorConfig> = {},
): GeneratorConfig => ({
  keysOut: path.join(dir, 'src/i18n/keys.ts'),
  log: () => {},
  runtimeDefaultsPath: path.join(dir, 'src/i18n/runtimeDefaults.ts'),
  srcRoot: path.join(dir, 'src'),
  ts,
  ...overrides,
});

const runtimeDefaults = (entries: Record<string, string>) =>
  `export const runtimeDefaults = {\n${Object.entries(entries)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n')}\n};\n`;

afterEach(() => {
  while (scratchDirs.length) {
    fs.rmSync(scratchDirs.pop() as string, { force: true, recursive: true });
  }
});

describe('call-site reading', () => {
  it('collects prose, plural and bundled keys', () => {
    const dir = makeProject({
      'src/Component.tsx': `
        const C = () => {
          t('common.cancel.label', 'Cancel');
          t('channel.memberCount.title', {
            count,
            defaultValue_one: '{{ count }} member',
            defaultValue_other: '{{ count }} members',
          });
          t('timestamp.MessageTimestamp', { timestamp });
          return null;
        };
      `,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({
        'timestamp.MessageTimestamp': '{{ timestamp | timestampFormatter }}',
      }),
    });

    const { catalog, failures } = buildCatalog(configFor(dir));

    expect(failures).toEqual([]);
    expect(Object.fromEntries(catalog)).toEqual({
      'channel.memberCount.title_one': '{{ count }} member',
      'channel.memberCount.title_other': '{{ count }} members',
      'common.cancel.label': 'Cancel',
      'timestamp.MessageTimestamp': '{{ timestamp | timestampFormatter }}',
    });
  });

  it('recognises a `.t(...)` property call as well as a bare `t(...)`', () => {
    const dir = makeProject({
      'src/Component.tsx': `i18n.t('common.ok.label', 'OK');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });

    const { catalog } = buildCatalog(configFor(dir));
    expect(catalog.get('common.ok.label')).toBe('OK');
  });

  it('skips ignored directories', () => {
    const dir = makeProject({
      'src/__tests__/Component.test.tsx': `t('only.in.tests', 'Nope');`,
      'src/Component.tsx': `t('real.key', 'Yes');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });

    const { catalog } = buildCatalog(configFor(dir));
    expect(catalog.has('only.in.tests')).toBe(false);
    expect(catalog.has('real.key')).toBe(true);
  });
});

describe('guards', () => {
  it('fails on a key used with two different inline copies', () => {
    const dir = makeProject({
      'src/A.tsx': `t('common.cancel.label', 'Cancel');`,
      'src/B.tsx': `t('common.cancel.label', 'Dismiss');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });

    const { failures } = buildCatalog(configFor(dir));

    expect(failures.map((f) => f.kind)).toEqual(['conflicting-copy']);
    expect(failures[0].entries.join('\n')).toContain('common.cancel.label');
  });

  /** Without this the key renders as a raw dotted path in the UI. */
  it('fails on a key with no inline default and no bundled entry', () => {
    const dir = makeProject({
      'src/A.tsx': `t('forgot.the.copy');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });

    const { failures } = buildCatalog(configFor(dir));

    expect(failures.map((f) => f.kind)).toEqual(['unresolvable-key']);
    expect(failures[0].entries.join('\n')).toContain('forgot.the.copy');
  });

  /** The bundled value wins, so the call site's copy would silently never render. */
  it('fails on a key present both inline and in the bundled defaults', () => {
    const dir = makeProject({
      'src/A.tsx': `t('common.cancel.label', 'Cancel');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({
        'common.cancel.label': 'Abort',
      }),
    });

    const { failures } = buildCatalog(configFor(dir));

    expect(failures.map((f) => f.kind)).toEqual(['shadowed-key']);
    expect(failures[0].entries.join('\n')).toContain('Abort');
  });

  it('fails when one key is a strict dotted prefix of another', () => {
    const dir = makeProject({
      'src/A.tsx': `
        t('poll.title', 'Title');
        t('poll.title.text', 'Text');
      `,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });

    const { failures } = buildCatalog(configFor(dir));

    expect(failures.map((f) => f.kind)).toEqual(['prefix-collision']);
    expect(failures[0].entries.join('\n')).toContain('is a strict prefix of');
  });

  /** Compared on segment boundaries, so a shared word prefix is fine. */
  it('allows a shared prefix that is not a segment boundary', () => {
    const dir = makeProject({
      'src/A.tsx': `
        t('poll.title', 'Title');
        t('poll.titleText', 'Title text');
      `,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });

    expect(buildCatalog(configFor(dir)).failures).toEqual([]);
  });

  it('throws with every failure formatted, and writes nothing', () => {
    const dir = makeProject({
      'src/A.tsx': `t('forgot.the.copy');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });
    const config = configFor(dir);

    expect(() => generateI18nKeys(config)).toThrow(/no inline default/);
    expect(fs.existsSync(config.keysOut)).toBe(false);
  });
});

describe('output', () => {
  it('writes a sorted, type-only catalog', () => {
    const dir = makeProject({
      'src/A.tsx': `
        t('z.last.label', 'Last');
        t('a.first.label', 'First');
      `,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });
    const config = configFor(dir);

    generateI18nKeys(config);
    const written = fs.readFileSync(config.keysOut, 'utf8');

    expect(written).toContain('export type TranslationCatalog = {');
    expect(written.indexOf('a.first.label')).toBeLessThan(
      written.indexOf('z.last.label'),
    );
    // Type-only: nothing that emits a runtime value.
    expect(written).not.toMatch(/^(export )?const /m);
  });

  it('emits the bundled key union only when asked', () => {
    const dir = makeProject({
      'src/A.tsx': `t('a11y.close.label');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({ 'a11y.close.label': 'Close' }),
    });

    const withUnion = configFor(dir, { emitBundledKeyUnion: true });
    generateI18nKeys(withUnion);
    expect(fs.readFileSync(withUnion.keysOut, 'utf8')).toContain(
      'export type BundledTranslationKey =',
    );

    const withoutUnion = configFor(dir, {
      keysOut: path.join(dir, 'src/i18n/keys-no-union.ts'),
    });
    generateI18nKeys(withoutUnion);
    expect(fs.readFileSync(withoutUnion.keysOut, 'utf8')).not.toContain(
      'BundledTranslationKey',
    );
  });

  /** `keys.ts` is type-only, so a test cannot iterate it — this is its data twin. */
  it('writes a JSON fixture twin when configured', () => {
    const dir = makeProject({
      'src/A.tsx': `t('common.cancel.label', 'Cancel');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({}),
    });
    const fixtureOut = path.join(dir, 'src/i18n/__tests__/catalog.fixture.json');

    generateI18nKeys(configFor(dir, { fixtureOut }));

    expect(JSON.parse(fs.readFileSync(fixtureOut, 'utf8'))).toEqual({
      'common.cancel.label': 'Cancel',
    });
  });

  it('excludes formatter expressions from the translator JSON export by default', () => {
    const dir = makeProject({
      'src/A.tsx': `
        t('common.cancel.label', 'Cancel');
        t('timestamp.MessageTimestamp', { timestamp });
      `,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({
        'timestamp.MessageTimestamp': '{{ timestamp | timestampFormatter }}',
      }),
    });
    const jsonOut = path.join(dir, 'en.json');

    generateI18nKeys(configFor(dir, { json: { out: jsonOut } }));
    expect(Object.keys(JSON.parse(fs.readFileSync(jsonOut, 'utf8')))).toEqual([
      'common.cancel.label',
    ]);

    generateI18nKeys(configFor(dir, { json: { includeFormats: true, out: jsonOut } }));
    expect(Object.keys(JSON.parse(fs.readFileSync(jsonOut, 'utf8'))).sort()).toEqual([
      'common.cancel.label',
      'timestamp.MessageTimestamp',
    ]);
  });

  it('names formatter keys that still hide English copy', () => {
    const dir = makeProject({
      'src/A.tsx': `t('timestamp.UserActivity', { timestamp });`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({
        'timestamp.UserActivity': 'Last seen {{ timestamp | fromNowFormatter }}',
      }),
    });
    const logged: string[] = [];

    generateI18nKeys(
      configFor(dir, {
        json: { out: path.join(dir, 'en.json') },
        log: (m) => logged.push(m),
      }),
    );

    // The prose sits beside the interpolation, so a translator working from the export never sees it.
    expect(logged.join('\n')).toContain('timestamp.UserActivity');
    expect(logged.join('\n')).toContain('do carry English copy');
  });

  it('extends the formatter prefixes an SDK excludes', () => {
    const dir = makeProject({
      'src/A.tsx': `t('translationBuilderTopic.notification');`,
      'src/i18n/runtimeDefaults.ts': runtimeDefaults({
        'translationBuilderTopic.notification': '{{value, notification}}',
      }),
    });
    const jsonOut = path.join(dir, 'en.json');

    generateI18nKeys(
      configFor(dir, {
        extraFormatterPrefixes: ['translationBuilderTopic.'],
        json: { out: jsonOut },
      }),
    );

    expect(JSON.parse(fs.readFileSync(jsonOut, 'utf8'))).toEqual({});
  });
});

describe('readStringMap', () => {
  it('reads through `as const` and `satisfies`', () => {
    const dir = makeProject({
      'src/i18n/runtimeDefaults.ts': `export const runtimeDefaults = {\n  'a.b': 'C',\n} as const satisfies Record<string, string>;\n`,
    });

    const map = readStringMap({
      exportName: 'runtimeDefaults',
      file: path.join(dir, 'src/i18n/runtimeDefaults.ts'),
      ts,
    });

    expect(Object.fromEntries(map)).toEqual({ 'a.b': 'C' });
  });

  it('throws a named error when the file is missing', () => {
    expect(() =>
      readStringMap({ exportName: 'runtimeDefaults', file: '/nope/missing.ts', ts }),
    ).toThrow(/could not read the file expected to export `runtimeDefaults`/);
  });

  it('throws when the export is absent', () => {
    const dir = makeProject({
      'src/i18n/runtimeDefaults.ts': `export const other = {};\n`,
    });

    expect(() =>
      readStringMap({
        exportName: 'runtimeDefaults',
        file: path.join(dir, 'src/i18n/runtimeDefaults.ts'),
        ts,
      }),
    ).toThrow(/could not find an exported `runtimeDefaults` object literal/);
  });

  it('throws when an entry is not a string literal', () => {
    const dir = makeProject({
      'src/i18n/runtimeDefaults.ts': `export const runtimeDefaults = { 'a.b': someVar };\n`,
    });

    expect(() =>
      readStringMap({
        exportName: 'runtimeDefaults',
        file: path.join(dir, 'src/i18n/runtimeDefaults.ts'),
        ts,
      }),
    ).toThrow(/must be 'quoted.key': 'string literal'/);
  });
});
