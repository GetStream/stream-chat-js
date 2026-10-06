import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyCopy,
  DOCS_CHAT_DIR,
  fenceId,
  findTestFiles,
  formatForDocs,
  normalize,
  parseDocsFences,
  parseTestRegions,
  readDocsPage,
} from './parse';
import type { DocsFence, TestRegion } from './parse';

// `yarn test-docs-sync`: checks that every marked test region matches its docs fence
// (after applying COPY values and formatting both sides the same way), and that every
// JS fence of a page that has tests is covered by a region or a #docs-ignore
// (`Node.js` fences are out of scope and ignored).
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
const pages = [...new Set(regions.map((region) => region.docs))].sort();

it('collects the test regions', () => {
  // Marker syntax errors already throw while the regions are parsed above.
  console.log(
    `${regions.length} snippet region(s) / #docs-ignore marker(s) on ${pages.length} page(s)`,
  );
});

describe.skipIf(!fs.existsSync(DOCS_CHAT_DIR) || !pages.length)(
  `docs sync (${DOCS_CHAT_DIR})`,
  () => {
    describe.each(pages)('%s', (docs) => {
      const { file: docsFile, markdown } = readDocsPage(docs);
      const fences = parseDocsFences(docs, markdown);
      const pageRegions = regions.filter((region) => region.docs === docs);
      const fenceFor = (region: TestRegion) =>
        fences.find((fence) => fenceId(fence) === fenceId(region));

      it('every JS fence is covered by a test region or #docs-ignore', () => {
        const covered = new Set(pageRegions.map(fenceId));
        const missing = fences.filter((fence) => !covered.has(fenceId(fence)));
        expect(
          missing.map((fence) => `${fenceId(fence)} (${docsFile}:${fence.line})`),
          'fences without a test region; add one or a // #docs-ignore with a reason',
        ).toEqual([]);
      });

      it('markers point at existing fences', () => {
        const unknown = pageRegions.filter((region) => !fenceFor(region));
        expect(
          unknown.map((region) => `${fenceId(region)} (${region.file}:${region.line})`),
          `no such fence. Fences on this page:\n${fences.map((fence) => `  ${fenceId(fence)}`).join('\n')}\n`,
        ).toEqual([]);
      });

      const snippets = pageRegions.filter((region) => region.kind === 'snippet');
      it.each(snippets.map((region) => [fenceId(region), region] as const))(
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
  },
);

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
