/* eslint-disable @typescript-eslint/no-explicit-any */

export function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [v];
}

export function isISODateString(x: any): x is string {
  return typeof x === 'string' && x.includes('T') && !Number.isNaN(Date.parse(x));
}

export function toEpochMillis(x: any): number | null {
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number' && Number.isFinite(x)) return x; // treat as epoch ms
  if (isISODateString(x)) return Date.parse(x);
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
  const Ad = toEpochMillis(a),
    Bd = toEpochMillis(b);
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

// dot-path accessor
export function resolveDotPathValue(obj: any, path: string): unknown[] {
  return path
    .split('.')
    .reduce((reduced, key) => (!reduced ? undefined : reduced[key]), obj);
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
