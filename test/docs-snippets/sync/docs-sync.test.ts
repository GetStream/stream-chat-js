import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_JS_LABELS,
  applyCopy,
  DOCS_CHAT_DIR,
  EXCLUDED_PAGES,
  fenceId,
  findSidebarPages,
  findTestFiles,
  formatForDocs,
  NODE_TAB,
  normalize,
  parseDocsFences,
  parseTestRegions,
  readDocsPage,
} from './parse';
import type { DocsFence, TestRegion } from './parse';

// `yarn test-docs-sync`, in this order:
// 1. Every JS fence (except `Node.js` and comment-only fences, like the "server-side
//    only" placeholders) on the pages of the chat JavaScript sidebar has a test region.
// 2. Every JS fence on those pages is labelled `JavaScript` or `Node.js`.
// 3. Every marked test region points at an existing fence and matches it (after
//    applying COPY values and formatting both sides the same way).
// Pages in `EXCLUDED_PAGES` (parse.ts) are skipped.
//   DOCS_SYNC_WRITE=<page>  overwrite that page's fences with the test code instead of
//                           comparing (page path as in the markers, e.g.
//                           _default/04-messages/01-send_message.md; `1` = all pages)
//   DOCS_CHAT_DIR=...  path to getstream.io/content/docs/chat (default: sibling checkout)

const writeTarget = process.env.DOCS_SYNC_WRITE;
const shouldWrite = (docs: string) => writeTarget === '1' || writeTarget === docs;
const testsRoot = path.join(__dirname, '..');

const regions: TestRegion[] = findTestFiles().flatMap((file) =>
  parseTestRegions(path.relative(testsRoot, file), fs.readFileSync(file, 'utf8')),
);
const regionPages = [...new Set(regions.map((region) => region.docs))].sort();

it('collects the test regions', () => {
  // Marker syntax errors already throw while the regions are parsed above.
  console.log(`${regions.length} snippet region(s) on ${regionPages.length} page(s)`);
});

// Without a docs checkout there is nothing to compare against: skip (vitest still runs
// the describe body to collect tests, so it must not read the docs either).
const hasDocs = fs.existsSync(DOCS_CHAT_DIR);

describe.skipIf(!hasDocs)(`docs sync (${DOCS_CHAT_DIR})`, () => {
  // Pages with tests count even if they are no longer in the sidebar.
  const pages = [...new Set([...(hasDocs ? findSidebarPages() : []), ...regionPages])]
    .filter((docs) => !(docs in EXCLUDED_PAGES))
    .sort();
  const pageFences = (hasDocs ? pages : []).map((docs) => {
    const { file, markdown } = readDocsPage(docs);
    return { docs, file, fences: parseDocsFences(docs, markdown) };
  });
  const where = (file: string, fence: DocsFence) =>
    `${fenceId(fence)} (${file}:${fence.line})`;

  it('every JavaScript snippet has a test region', () => {
    const covered = new Set(regions.map(fenceId));
    const missing = pageFences.flatMap(({ file, fences }) =>
      fences
        .filter(
          (fence) =>
            fence.tab !== NODE_TAB && !fence.commentOnly && !covered.has(fenceId(fence)),
        )
        .map((fence) => where(file, fence)),
    );
    expect(
      missing,
      'snippets without a test region; add one (in it.skip if it cannot run), or add the page to EXCLUDED_PAGES in sync/parse.ts with a reason',
    ).toEqual([]);
  });

  it(`every JS snippet is labelled ${ALLOWED_JS_LABELS.join(' or ')}`, () => {
    const mislabelled = pageFences.flatMap(({ file, fences }) =>
      fences
        .filter((fence) => !ALLOWED_JS_LABELS.includes(fence.tab))
        .map((fence) => `${where(file, fence)} [${fence.lang}]`),
    );
    expect(
      mislabelled,
      `JS fences need label="${ALLOWED_JS_LABELS.join('" or label="')}" (client-side code or @stream-io/node-sdk code)`,
    ).toEqual([]);
  });

  describe.each(hasDocs ? regionPages : [])('%s', (docs) => {
    const { file: docsFile, markdown } = readDocsPage(docs);
    const fences = parseDocsFences(docs, markdown);
    const pageRegions = regions.filter((region) => region.docs === docs);
    const fenceFor = (region: TestRegion) =>
      fences.find((fence) => fenceId(fence) === fenceId(region));

    it('markers point at existing fences', () => {
      const unknown = pageRegions.filter((region) => !fenceFor(region));
      expect(
        unknown.map((region) => `${fenceId(region)} (${region.file}:${region.line})`),
        `no such fence. Fences on this page:\n${fences
          .filter((fence) => fence.tab !== NODE_TAB)
          .map((fence) => `  ${fenceId(fence)}`)
          .join('\n')}\n`,
      ).toEqual([]);
    });

    it.each(pageRegions.map((region) => [fenceId(region), region] as const))(
      '%s',
      async (_, region) => {
        const fence = fenceFor(region);
        if (!fence) return; // reported above
        const expected = applyCopy(region.code, region.copy);
        if (shouldWrite(docs)) {
          writeFence(docsFile, fence, await formatForDocs(expected, docsFile));
          return;
        }
        expect(
          await normalize(expected),
          `${region.file}:${region.line} differs from ${docsFile}:${fence.line}. Update the test (or the docs), or run DOCS_SYNC_WRITE=${docs} to copy the test into the docs.`,
        ).toBe(await normalize(fence.code));
      },
    );
  });
});

/** Replaces one fence body; re-reads the file so several writes to one page compose. */
const writeFence = (docsFile: string, fence: DocsFence, code: string) => {
  const docs = path.relative(DOCS_CHAT_DIR, docsFile);
  const current = parseDocsFences(docs, fs.readFileSync(docsFile, 'utf8')).find(
    (candidate) => fenceId(candidate) === fenceId(fence),
  );
  if (!current) throw new Error(`fence disappeared: ${fenceId(fence)}`);
  const lines = fs.readFileSync(docsFile, 'utf8').split('\n');
  const body = code.split('\n').map((line) => (line ? fence.indent + line : line));
  lines.splice(current.bodyStart, current.bodyEnd - current.bodyStart, ...body);
  fs.writeFileSync(docsFile, lines.join('\n'));
};
