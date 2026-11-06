import { dateToNs, msToNs } from '../utils/time';

export function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [v];
}

export function isISODateString(x: any): x is string {
  return typeof x === 'string' && x.includes('T') && !Number.isNaN(Date.parse(x));
}

/**
 * Converts a `Date`, ISO string or finite number into unix nanoseconds, the unit item timestamps
 * carry. A bare `number` is read as nanoseconds already. Returns `null` for anything else.
 */
export function toEpochNanos(x: any): number | null {
  if (x instanceof Date) return dateToNs(x);
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (isISODateString(x)) return msToNs(Date.parse(x));
  return null;
}

export function toNumberLike(x: any): number | null {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function normalizeComparedValues(a: any, b: any) {
  const Ad = toEpochNanos(a),
    Bd = toEpochNanos(b);
  if (Ad !== null && Bd !== null) return { kind: 'date', a: Ad, b: Bd };

  const An = toNumberLike(a),
    Bn = toNumberLike(b);
  if (An !== null && Bn !== null) return { kind: 'number', a: An, b: Bn };

  if (typeof a === 'string' && typeof b === 'string') return { kind: 'string', a, b };
  if (typeof a === 'boolean' && typeof b === 'boolean') return { kind: 'boolean', a, b };

  return { kind: 'incomparable', a, b };
}

export function normKey(x: unknown): string {
  // Unary form of `normalizeComparedValues`: normalize x against itself.
  const n = normalizeComparedValues(x, x);
  switch (n.kind) {
    case 'date':
    case 'number':
    case 'string':
    case 'boolean':
      return `${n.kind}:${String(n.a)}`;
    default:
      return `other:${String(x)}`;
  }
}

export function compare(a: any, b: any): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function arraysEqualAsSets(aList: unknown[], bList: unknown[]): boolean {
  const aKeys = new Set(aList.map(normKey));
  const bKeys = new Set(bList.map(normKey));
  if (aKeys.size !== bKeys.size) return false;
  for (const k of aKeys) if (!bKeys.has(k)) return false;
  return true;
}

export function normalizeString(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim();
}

export function normalizeStringAccentInsensitive(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function tokenize(s: string): string[] {
  return normalizeString(s).split(/\s+/).filter(Boolean);
}

/**
 * Reads `a.b.c` off an item, for the filter and sort compilers. Descends through anything indexable
 * (plain objects, arrays, class instances such as `Reminder`), unlike `getPath` in
 * `src/utils/objectPath.ts`, which walks plain records only. Stops at `null` / `undefined`.
 */
export function resolveDotPathValue(obj: any, path: string): unknown {
  return path
    .split('.')
    .reduce((reduced, key) => (reduced == null ? undefined : reduced[key]), obj);
}

export function isIterableButNotString(v: unknown): v is Iterable<unknown> {
  return (
    v != null &&
    typeof v !== 'string' &&
    typeof (v as any)[Symbol.iterator] === 'function'
  );
}

export function toIterableArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isIterableButNotString(v)) return Array.from(v as Iterable<unknown>);
  return [v];
}
