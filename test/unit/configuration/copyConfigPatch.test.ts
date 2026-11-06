import { describe, expect, it } from 'vitest';
import { copyConfigPatch } from '../../../src/configuration/utils/copyConfigPatch';

/**
 * `copyConfigPatch` walks an object an integrator built — `client.config.set()` and every `updateConfig`
 * route through it — so it has to survive shapes the SDK did not construct.
 */
describe('copyConfigPatch', () => {
  it('copies plain objects and arrays, and passes everything else by reference', () => {
    const fn = () => undefined;
    const date = new Date(0);
    const source = { fn, date, nested: { list: [1, { deep: true }] } };

    const copy = copyConfigPatch(source);

    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.nested).not.toBe(source.nested);
    expect(copy.nested.list).not.toBe(source.nested.list);
    // Handed over, not merged into.
    expect(copy.fn).toBe(fn);
    expect(copy.date).toBe(date);
  });

  it('terminates on an object that points at itself', () => {
    const source: Record<string, unknown> = { pageSize: 10 };
    source.self = source;

    const copy = copyConfigPatch(source);

    expect(copy.pageSize).toBe(10);
    // The copy's back-reference points at the copy, not at the original.
    expect(copy.self).toBe(copy);
  });

  it('terminates on a longer cycle', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { a, name: 'b' };
    a.b = b;

    const copy = copyConfigPatch(a);

    expect((copy.b as Record<string, unknown>).name).toBe('b');
    expect(((copy.b as Record<string, unknown>).a as unknown) === copy).toBe(true);
  });

  it('terminates on a cycle through an array', () => {
    const list: unknown[] = [1];
    list.push(list);

    const copy = copyConfigPatch(list);

    expect(copy[0]).toBe(1);
    expect(copy[1]).toBe(copy);
  });

  it('copies an object referenced twice exactly once', () => {
    const shared = { enabled: true };
    const source = { left: shared, right: shared };

    const copy = copyConfigPatch(source);

    expect(copy.left).not.toBe(shared);
    // One object in, one object out — the two references still lead to the same place.
    expect(copy.left).toBe(copy.right);
  });
});
