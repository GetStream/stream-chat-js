import fs from 'node:fs';
import path from 'node:path';
import { format } from 'prettier';
import type { Options } from 'prettier';

/** `content/docs` in a getstream.io checkout (override with DOCS_DIR). */
export const DOCS_DIR = path.resolve(
  process.env.DOCS_DIR ?? path.join(__dirname, '../../../../getstream.io/content/docs'),
);

/** Identifies one code fence on a docs page. */
export type FenceKey = {
  /** Page path relative to `content/docs`, e.g. `chat/_default/04-messages/01-send_message.md`. */
  docs: string;
  /** Text of the nearest heading above the fence (`""` before the first heading). */
  heading: string;
  /** The fence's `label="..."`, or `unlabelled`. */
  tab: string;
  /** 1-based position among the fences with the same heading text and tab on the page. */
  index: number;
};

export type DocsFence = FenceKey & {
  /** The fence language as written (`js`, `javascript`, `ts`, `typescript`). */
  lang: string;
  /** Fence body, de-indented. */
  code: string;
  /** Texts of the headings the fence is nested under, outermost first (ends with `heading`). */
  headingPath: string[];
  /** 1-based line of the opening ``` line. */
  line: number;
  /** 0-based line range of the body in the file (end exclusive), plus the fence indent. */
  bodyStart: number;
  bodyEnd: number;
  indent: string;
  /** The body is only comments (e.g. a "server-side only" placeholder): nothing to test. */
  commentOnly: boolean;
};

export type TestRegion = FenceKey & {
  /** Code between the markers, de-indented, without marker / COPY lines. */
  code: string;
  /** Values the test uses in place of the docs literals: identifier -> JS literal. */
  copy: Record<string, string>;
  file: string;
  line: number;
};

export const fenceId = (key: FenceKey) =>
  `${key.docs} > "${key.heading}" > ${key.tab} #${key.index}`;

const JS_LANGS = new Set(['js', 'javascript', 'ts', 'typescript']);
/** The tested tab. */
export const JS_TAB = 'JavaScript';
/**
 * Out of scope: server-side code, both `@stream-io/node-sdk` code and Node.js reference
 * implementations without an SDK (raw HTTP, AWS SDK, ...). Neither tested nor changed.
 */
export const NODE_TAB = 'Node.js';
/**
 * Out of scope too: the stream-chat-js@9 versions shown next to `JavaScript` (client-side)
 * and `Node.js` (server-side). Neither tested nor changed.
 */
export const V9_TABS = ['JavaScript (stream-chat-js@9)', 'Node.js (stream-chat-js@9)'];
/** Fences with these labels are never tested. */
export const OUT_OF_SCOPE_TABS = [NODE_TAB, ...V9_TABS];
/** Every JS fence must carry one of these labels. */
export const ALLOWED_JS_LABELS = [JS_TAB, ...OUT_OF_SCOPE_TABS];

/**
 * Sidebars whose pages' `JavaScript` fences are tested: sidebar file in
 * `content/docs/_sidebars`, and the prefix of the page paths taken from it.
 */
const SIDEBARS = [
  { file: '[chat][javascript].json', prefix: 'chat/' },
  { file: '[platform][default].json', prefix: 'platform/' },
];

/**
 * Sidebar pages that are deliberately not validated (page path relative to
 * `content/docs`, reason).
 */
export const EXCLUDED_PAGES: Record<string, string> = {
  'chat/javascript/11-debugging_and_cli/10-upgrading_to_v9.md':
    'React/TSX type examples, no runnable JS',
};

const FEEDS =
  'Feeds client SDK (@stream-io/feeds-client and its React hooks), not stream-chat-js';

/**
 * Sections of a page that are not validated: every fence under one of these headings
 * (at any level above the fence) is skipped by the coverage and label checks.
 */
export const EXCLUDED_SECTIONS: Record<string, { headings: string[]; reason: string }> = {
  'platform/02-identity-and-access/02-users.md': {
    headings: ['Guest users', 'Anonymous users'],
    reason: FEEDS,
  },
  'platform/03-events-and-notifications/02-push-notifications.md': {
    headings: [
      'Handling Push Notifications on the Foreground',
      'Direct Push Notifications',
      'Notification Feed Push Notifications',
    ],
    reason: `${FEEDS}; React Native notifee example`,
  },
  'platform/03-events-and-notifications/04-push-devices.md': {
    headings: [
      'Multi-Bundle Device Registration',
      'Listing from the feeds client SDKs',
      'Removing from the feeds client SDKs',
    ],
    reason: FEEDS,
  },
  'platform/03-events-and-notifications/05-push-preferences.md': {
    headings: ['Feeds Push Preferences'],
    reason: FEEDS,
  },
};

/** True when the fence is in one of its page's `EXCLUDED_SECTIONS`. */
export const isExcludedFence = (fence: DocsFence) =>
  fence.headingPath.some((heading) =>
    EXCLUDED_SECTIONS[fence.docs]?.headings.includes(heading),
  );

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

/** True when the code has comments only (line and block comments), no statements. */
export const isCommentOnly = (code: string) =>
  code.trim() !== '' &&
  code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .every((line) => !line.trim() || line.trim().startsWith('//'));

/**
 * All JS fences (`js`/`javascript`/`ts`/`typescript`) of a docs page, keyed the same way
 * as the test markers. Includes out-of-scope and unlabelled fences (for the label check);
 * only `JavaScript` fences are tested.
 */
export const parseDocsFences = (docs: string, markdown: string): DocsFence[] => {
  const lines = markdown.split('\n');
  const fences: DocsFence[] = [];
  const counts = new Map<string, number>();
  let heading = '';
  // Open headings by level: `headings[level - 1]`.
  let headings: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,})(\S*)(.*)$/.exec(lines[i]);
    if (!open) {
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
      if (h) {
        heading = h[2];
        headings = [...headings.slice(0, h[1].length - 1), heading];
      }
      continue;
    }
    const [, indent, ticks, lang, rest] = open;
    let end = i + 1;
    while (end < lines.length && !new RegExp(`^\\s*${ticks}\\s*$`).test(lines[end]))
      end++;
    const tab = /label="([^"]*)"/.exec(rest)?.[1] ?? 'unlabelled';
    if (JS_LANGS.has(lang.toLowerCase())) {
      const countKey = `${heading}\u0000${tab}`;
      const index = (counts.get(countKey) ?? 0) + 1;
      counts.set(countKey, index);
      const code = dedent(lines.slice(i + 1, end));
      fences.push({
        docs,
        heading,
        headingPath: headings.filter(Boolean),
        tab,
        index,
        lang,
        code,
        commentOnly: isCommentOnly(code),
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
 * Snippet regions of a test file:
 *
 * ```ts
 * // #region snippet docs="_default/04-messages/01-send_message.md" heading="Sending a Message" tab="JavaScript" index=1
 * // COPY: channelId="general", userId="john"
 * ...docs code...
 * // #endregion snippet
 * ```
 */
export const parseTestRegions = (file: string, source: string): TestRegion[] => {
  const lines = source.split('\n');
  const regions: TestRegion[] = [];
  for (let i = 0; i < lines.length; i++) {
    const where = `${file}:${i + 1}`;
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

type SidebarItem = { markdown?: string; children?: SidebarItem[] };

/**
 * Pages of the tested sidebars (`SIDEBARS`, paths relative to `content/docs`), minus
 * `EXCLUDED_PAGES`.
 */
export const findSidebarPages = () => {
  const pages = new Set<string>();
  for (const sidebar of SIDEBARS) {
    const file = path.join(DOCS_DIR, '_sidebars', sidebar.file);
    const { items } = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      items: SidebarItem[];
    };
    const walk = (entries: SidebarItem[] = []) => {
      for (const entry of entries) {
        if (entry.markdown?.startsWith(sidebar.prefix)) pages.add(entry.markdown);
        walk(entry.children);
      }
    };
    walk(items);
  }
  return [...pages].filter((page) => !(page in EXCLUDED_PAGES)).sort();
};

export const readDocsPage = (docs: string) => {
  const file = path.join(DOCS_DIR, docs);
  return { file, markdown: fs.readFileSync(file, 'utf8') };
};

/** Every *.test.ts under pages/. */
export const findTestFiles = (root = path.join(__dirname, '..')) => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.test.ts')) files.push(full);
    }
  };
  if (fs.existsSync(path.join(root, 'pages'))) walk(path.join(root, 'pages'));
  return files.sort();
};
