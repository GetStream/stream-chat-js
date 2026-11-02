/**
 * Report state for the update-custom-mapping skill. Read-only.
 *
 * Usage: node .claude/skills/update-custom-mapping/find-unmapped-custom.mts
 *
 * Prints, for `src/gen/models/index.ts`:
 *  - the `Custom*Data` interfaces declared in `src/custom_types.ts`
 *  - every `custom` field (and every `Filters<{ custom: { type } }>` entry) still typed
 *    `Record<string, any>`, with its doc comment and the fields that reference the
 *    enclosing interface, so the caller can judge which domain object it belongs to
 *  - entries in the mapping tables of `scripts/apply-custom-data-types.mts` that name an
 *    interface or filter field the models no longer contain
 */
import { readFileSync } from 'node:fs';

const MODELS_PATH = 'src/gen/models/index.ts';
const CUSTOM_TYPES_PATH = 'src/custom_types.ts';
const SCRIPT_PATH = 'scripts/apply-custom-data-types.mts';

const models = readFileSync(MODELS_PATH, 'utf8').split('\n');
const customTypes = [
  ...readFileSync(CUSTOM_TYPES_PATH, 'utf8').matchAll(/^export interface (Custom\w+Data)\b/gm),
].map((m) => m[1]);
const script = readFileSync(SCRIPT_PATH, 'utf8');

const INTERFACE_OPEN_RE = /^export interface (\w+)\b/;
const CUSTOM_FIELD_RE = /^\s*(\w*custom\w*)\??:\s*Record<string,\s*any>;/;
const FILTER_OPEN_RE = /^\s*(\w+)\??:\s*Filters<\{\s*$/;
const FILTER_CUSTOM_TYPE_RE = /^\s*type:\s*Record<string,\s*any>;/;

type Finding = { line: number; iface: string; field: string; doc: string };

const interfaces = new Set<string>();
const filterKeys = new Set<string>();
const findings: Finding[] = [];
let iface = '';
let filterField: string | null = null;
let previousLine = '';

const docAbove = (index: number) => {
  // Collect the `/** ... */` block that ends right above `index`, if any.
  if (!models[index - 1]?.trim().endsWith('*/')) return '';
  const doc: string[] = [];
  for (let i = index - 1; i >= 0; i -= 1) {
    const text = models[i].trim().replace(/^\/?\*+\/?\s?/, '').replace(/\*\/$/, '');
    if (text) doc.unshift(text.trim());
    if (models[i].trim().startsWith('/**')) break;
  }
  return doc.join(' ');
};

models.forEach((line, index) => {
  const open = line.match(INTERFACE_OPEN_RE);
  if (open) {
    iface = open[1];
    interfaces.add(iface);
    filterField = null;
  }
  const filterOpen = line.match(FILTER_OPEN_RE);
  if (filterOpen) {
    filterField = filterOpen[1];
    filterKeys.add(`${iface}.${filterField}`);
  }
  if (line.startsWith('}')) filterField = null;

  const custom = line.match(CUSTOM_FIELD_RE);
  if (custom && !filterField) {
    findings.push({ line: index + 1, iface, field: custom[1], doc: docAbove(index) });
  }
  if (filterField && FILTER_CUSTOM_TYPE_RE.test(line) && /^\s*custom:\s*\{/.test(previousLine)) {
    findings.push({
      line: index + 1,
      iface,
      field: `${filterField} (filter custom)`,
      doc: docAbove(index - 1),
    });
  }
  previousLine = line;
});

const referencesTo = (name: string) =>
  models.flatMap((line, index) => {
    if (!new RegExp(`:\\s*(Array<)?${name}\\b`).test(line)) return [];
    let owner = '';
    for (let i = index; i >= 0; i -= 1) {
      const open = models[i].match(INTERFACE_OPEN_RE);
      if (open) {
        owner = open[1];
        break;
      }
    }
    return [`${owner}.${line.trim().split(/\??:/)[0]}`];
  });

console.log(`Custom*Data interfaces in ${CUSTOM_TYPES_PATH}:`);
console.log(`  ${customTypes.join(', ')}\n`);

console.log(`Unmapped custom fields in ${MODELS_PATH} (${findings.length}):`);
for (const f of findings) {
  console.log(`\n- ${f.iface}.${f.field}  (${MODELS_PATH}:${f.line})`);
  if (f.doc) console.log(`    doc: ${f.doc}`);
  const refs = referencesTo(f.iface);
  console.log(`    referenced by: ${refs.length ? refs.join(', ') : '(nothing)'}`);
}

const mappingBlock = (name: string) =>
  script.split(`const ${name}`)[1]?.split('\n};')[0] ?? '';
const staleInterfaces = [...mappingBlock('CUSTOM_DATA_MAPPING').matchAll(/^\s*(\w+):\s*'/gm)]
  .map((m) => m[1])
  .filter((name) => !interfaces.has(name));
const staleFilters = [...mappingBlock('FILTER_CUSTOM_MAPPING').matchAll(/^\s*'([\w.]+)':/gm)]
  .map((m) => m[1])
  .filter((key) => !filterKeys.has(key));

console.log(`\nStale CUSTOM_DATA_MAPPING entries: ${staleInterfaces.join(', ') || '(none)'}`);
console.log(`Stale FILTER_CUSTOM_MAPPING entries: ${staleFilters.join(', ') || '(none)'}`);
