import { dateToNs, msToNs } from '../utils/time';

export function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [v];
}

export function isISODateString(x: any): x is string {
  return typeof x === 'string' && x.includes('T') && !Number.isNaN(Date.parse(x));
}

/**
 * Brings anything date-shaped into unix **nanoseconds**, the unit item fields carry, so a filter or
 * sort can compare an operand against a value.
 *
 * Nanoseconds rather than milliseconds because the two sides of a comparison come from different
 * places: an item's `created_at` is the wire number, while a filter operand is typed `Date | string`
 * in the generated filter types. Normalizing to ms would have meant halving the pair — a `Date`
 * became ms while a wire number was passed through untouched and *called* ms, so every mixed
 * comparison silently ordered wrong and `normKey` bucketed the two apart.
 *
 * A bare `number` is therefore read as nanoseconds. That is the SDK's unit for a timestamp
 * everywhere else, and it is what a value read off an item will be.
 */
export function toEpochNanos(x: any): number | null {
  if (x instanceof Date) return dateToNs(x);
  if (typeof x === 'number' && Number.isFinite(x)) return x; // already the wire unit
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
  // Use your normalizeComparedValues to coerce pairs; here we need a unary form.
  // We can piggyback by normalizing x against itself:
  const n = normalizeComparedValues(x, x);
  switch (n.kind) {
    case 'date':
    case 'number':
    case 'string':
    case 'boolean':
      return `${n.kind}:${String(n.a)}`;
    default:
      // fallback: use JSON-like string with type tag for determinism
      return `other:${String(x)}`;
  }
}

export function compare(a: any, b: any): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function arraysEqualAsSets(aList: unknown[], bList: unknown[]): boolean {
  // de-duplicate by normalized key
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
  // split on whitespace; keep simple & deterministic
  return normalizeString(s).split(/\s+/).filter(Boolean);
}

/**
 * Reads `a.b.c` off an item, for the filter and sort compilers.
 *
 * Descends through **anything indexable** — plain objects, arrays (`items.0.id`, `items.length`) and class
 * instances (a `Reminder`, a `Poll`) — because a filter path legitimately reaches into all three. That is why
 * this is not `getPath` from `src/utils/objectPath.ts`, which deliberately walks plain records only; the two
 * are documented there as non-interchangeable.
 *
 * Stops at `null` / `undefined`, the only values that cannot be indexed. It used to stop at any *falsy*
 * value, which made the result depend on a string's contents rather than on its shape: `name.length`
 * resolved to `2` for `'ab'` and to `undefined` for `''`. A falsy value at the end of a path was never
 * affected — the guard only ever ran against an intermediate — so `{ count: 0 }` on `'count'` has always
 * returned `0`, and sorting and filtering on scalar fields were never wrong.
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
  return [v]; // scalar as a single-element list
}
