import fs from 'node:fs';
import path from 'node:path';
import { format } from 'prettier';
import type { Options } from 'prettier';

/** `content/docs/chat` in a getstream.io checkout (override with DOCS_CHAT_DIR). */
export const DOCS_CHAT_DIR = path.resolve(
  process.env.DOCS_CHAT_DIR ??
    path.join(__dirname, '../../../../getstream.io/content/docs/chat'),
);

/** Identifies one code fence on a docs page. */
export type FenceKey = {
  /** Page path relative to `content/docs/chat`, e.g. `_default/04-messages/01-send_message.md`. */
  docs: string;
  /** Text of the nearest heading above the fence (`""` before the first heading). */
  heading: string;
  /** The fence's `label="..."`, or `unlabelled`. */
  tab: string;
  /** 1-based position among the fences with the same heading text and tab on the page. */
  index: number;
};

export type DocsFence = FenceKey & {
  /** Fence body, de-indented. */
  code: string;
  /** 1-based line of the opening ``` line. */
  line: number;
  /** 0-based line range of the body in the file (end exclusive), plus the fence indent. */
  bodyStart: number;
  bodyEnd: number;
  indent: string;
};

export type TestRegion = FenceKey & {
  kind: 'snippet' | 'ignore';
  /** Code between the markers, de-indented, without marker / COPY lines. */
  code: string;
  /** Values the test uses in place of the docs literals: identifier -> JS literal. */
  copy: Record<string, string>;
  reason?: string;
  file: string;
  line: number;
};

export const fenceId = (key: FenceKey) =>
  `${key.docs} > "${key.heading}" > ${key.tab} #${key.index}`;

const JS_LANGS = new Set(['js', 'javascript', 'ts', 'typescript']);
const NODE_TAB = 'Node.js';

const dedent = (lines: string[]) => {
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => /^\s*/.exec(line)?.[0].length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(min))
    .join('\n')
    .trim();
};

/**
 * All JavaScript fences of a docs page, keyed the same way as the test markers.
 * `Node.js` fences are out of scope (only client-side snippets are tested) and skipped.
 */
export const parseDocsFences = (docs: string, markdown: string): DocsFence[] => {
  const lines = markdown.split('\n');
  const fences: DocsFence[] = [];
  const counts = new Map<string, number>();
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,})(\S*)(.*)$/.exec(lines[i]);
    if (!open) {
      const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(lines[i]);
      if (h) heading = h[1];
      continue;
    }
    const [, indent, ticks, lang, rest] = open;
    let end = i + 1;
    while (end < lines.length && !new RegExp(`^\\s*${ticks}\\s*$`).test(lines[end]))
      end++;
    const tab = /label="([^"]*)"/.exec(rest)?.[1] ?? 'unlabelled';
    if (JS_LANGS.has(lang.toLowerCase()) && tab !== NODE_TAB) {
      const countKey = `${heading}\u0000${tab}`;
      const index = (counts.get(countKey) ?? 0) + 1;
      counts.set(countKey, index);
      fences.push({
        docs,
        heading,
        tab,
        index,
        code: dedent(lines.slice(i + 1, end)),
        line: i + 1,
        bodyStart: i + 1,
        bodyEnd: end,
        indent,
      });
    }
    i = end;
  }
  return fences;
};

const ATTR_RE = /(\w+)=("(?:[^"\\]|\\.)*"|\d+)/g;

const parseAttrs = (text: string) => {
  const attrs: Record<string, string> = {};
  for (const [, key, raw] of text.matchAll(ATTR_RE)) {
    attrs[key] = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  }
  return attrs;
};

/** `// COPY: channelId="general", limit=10` -> { channelId: '"general"', limit: '10' } */
export const parseCopy = (text: string) => {
  const copy: Record<string, string> = {};
  for (const [, key, raw] of text.matchAll(/(\w+)=("(?:[^"\\]|\\.)*"|[^,\s]+)/g)) {
    copy[key] = raw;
  }
  return copy;
};

const keyFromAttrs = (attrs: Record<string, string>, where: string): FenceKey => {
  for (const required of ['docs', 'heading', 'tab']) {
    if (attrs[required] === undefined) {
      throw new Error(`${where}: marker is missing ${required}="..."`);
    }
  }
  return {
    docs: attrs.docs,
    heading: attrs.heading,
    tab: attrs.tab,
    index: attrs.index ? Number(attrs.index) : 1,
  };
};

/**
 * Snippet regions and ignore markers of a test file:
 *
 * ```ts
 * // #region snippet docs="_default/04-messages/01-send_message.md" heading="Sending a Message" tab="JavaScript" index=1
 * // COPY: channelId="general", userId="john"
 * ...docs code...
 * // #endregion snippet
 *
 * // #docs-ignore docs="..." heading="..." tab="unlabelled" index=2 reason="JSON payload, not code"
 * ```
 */
export const parseTestRegions = (file: string, source: string): TestRegion[] => {
  const lines = source.split('\n');
  const regions: TestRegion[] = [];
  for (let i = 0; i < lines.length; i++) {
    const where = `${file}:${i + 1}`;
    const ignore = /^\s*\/\/ #docs-ignore\s+(.*)$/.exec(lines[i]);
    if (ignore) {
      const attrs = parseAttrs(ignore[1]);
      if (!attrs.reason) throw new Error(`${where}: #docs-ignore needs reason="..."`);
      regions.push({
        ...keyFromAttrs(attrs, where),
        kind: 'ignore',
        code: '',
        copy: {},
        reason: attrs.reason,
        file,
        line: i + 1,
      });
      continue;
    }
    const start = /^\s*\/\/ #region snippet\s+(.*)$/.exec(lines[i]);
    if (!start) continue;
    const key = keyFromAttrs(parseAttrs(start[1]), where);
    let end = i + 1;
    while (end < lines.length && !/^\s*\/\/ #endregion snippet/.test(lines[end])) end++;
    if (end === lines.length) throw new Error(`${where}: missing // #endregion snippet`);
    const body = lines.slice(i + 1, end);
    const copy: Record<string, string> = {};
    while (body.length && /^\s*\/\/ COPY:/.test(body[0])) {
      Object.assign(
        copy,
        parseCopy((body.shift() as string).replace(/^\s*\/\/ COPY:/, '')),
      );
    }
    regions.push({
      ...key,
      kind: 'snippet',
      code: dedent(body),
      copy,
      file,
      line: i + 1,
    });
    i = end;
  }
  return regions;
};

/**
 * Applies the COPY values: every identifier `name` that is not a property access
 * (`x.name`) or an object key (`name:`) is replaced with its docs literal.
 * Don't use COPY identifiers in shorthand properties (`{ userId }`).
 */
export const applyCopy = (code: string, copy: Record<string, string>) =>
  Object.entries(copy).reduce(
    (result, [name, literal]) =>
      result.replace(
        new RegExp(`(?<![\\w$.'"\`])${name}(?![\\w$'"\`])(?!\\s*:(?!:))`, 'g'),
        literal,
      ),
    code,
  );

const COMPARE_OPTIONS: Options = {
  parser: 'typescript',
  singleQuote: false,
  semi: true,
  printWidth: 80,
  trailingComma: 'all',
};

/**
 * Formats code the same way on both sides so only real differences count. Fragments
 * prettier can't parse fall back to whitespace / quote normalization.
 */
export const normalize = async (code: string) => {
  try {
    return (await format(code, COMPARE_OPTIONS)).trim();
  } catch {
    return code
      .replace(/'/g, '"')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
      .replace(/,(\s*[)\]}])/g, '$1');
  }
};

/** Formats a snippet the way the docs repo would (its .prettierrc.json, double quotes). */
export const formatForDocs = async (code: string, markdownFile: string) => {
  const { resolveConfig } = await import('prettier');
  const config = (await resolveConfig(markdownFile)) ?? {};
  try {
    return (await format(code, { ...config, parser: 'typescript' })).trim();
  } catch {
    return code;
  }
};

export const readDocsPage = (docs: string) => {
  const file = path.join(DOCS_CHAT_DIR, docs);
  return { file, markdown: fs.readFileSync(file, 'utf8') };
};

/** Every *.test.ts under client/. */
export const findTestFiles = (root = path.join(__dirname, '..')) => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.test.ts')) files.push(full);
    }
  };
  if (fs.existsSync(path.join(root, 'client'))) walk(path.join(root, 'client'));
  return files.sort();
};
