import { describe, expect, it } from 'vitest';
import { resolveDotPathValue } from '../../../src/pagination/utility.normalization';
import { makeComparator } from '../../../src/pagination/sortCompiler';

/**
 * The dot-path accessor behind every filter and sort comparator.
 *
 * It used to stop descending at any **falsy** intermediate rather than at a nullish one, which made a result
 * depend on a value's contents instead of its shape: `name.length` resolved to `2` for `'ab'` and to
 * `undefined` for `''`. Falsy values at the *end* of a path were never affected — the guard only ran against
 * intermediates — so scalar filtering and sorting were never wrong, which is why this went unnoticed.
 */
describe('resolveDotPathValue', () => {
  describe('descends to the end of the path', () => {
    it('reads a nested plain-object value', () => {
      expect(resolveDotPathValue({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
    });

    it('reads through arrays, by index and by property', () => {
      // A filter path legitimately reaches into arrays, which is one reason this is not `getPath` from
      // `src/utils/objectPath.ts`.
      expect(
        resolveDotPathValue({ items: [{ id: 'x' }, { id: 'y' }] }, 'items.1.id'),
      ).toBe('y');
      expect(resolveDotPathValue({ items: [1, 2, 3] }, 'items.length')).toBe(3);
    });

    it('reads through class instances', () => {
      // The other reason: `Reminder`, `Poll` and friends are class instances, and `getPath` walks plain
      // records only.
      class Reminder {
        readonly remind_at = 'soon';
        readonly user = { id: 'u1' };
      }

      expect(resolveDotPathValue(new Reminder(), 'remind_at')).toBe('soon');
      expect(resolveDotPathValue(new Reminder(), 'user.id')).toBe('u1');
    });
  });

  describe('falsy values', () => {
    it('returns a falsy value at the end of a path', () => {
      // Never broken, and the case that actually matters for filtering and sorting — asserted so a future
      // change to the guard cannot quietly start swallowing these.
      expect(resolveDotPathValue({ count: 0 }, 'count')).toBe(0);
      expect(resolveDotPathValue({ name: '' }, 'name')).toBe('');
      expect(resolveDotPathValue({ flag: false }, 'flag')).toBe(false);
      expect(resolveDotPathValue({ a: { b: 0 } }, 'a.b')).toBe(0);
    });

    it('does not let a falsy intermediate change the answer for the same path', () => {
      // The defect. Both are strings, so both should answer with a length.
      expect(resolveDotPathValue({ name: 'ab' }, 'name.length')).toBe(2);
      expect(resolveDotPathValue({ name: '' }, 'name.length')).toBe(0);
    });
  });

  describe('stops only where it cannot descend', () => {
    it('returns undefined for an absent path', () => {
      expect(resolveDotPathValue({}, 'a.b')).toBeUndefined();
    });

    it('returns undefined rather than throwing on a nullish intermediate', () => {
      expect(resolveDotPathValue({ a: null }, 'a.b')).toBeUndefined();
      expect(resolveDotPathValue({ a: undefined }, 'a.b')).toBeUndefined();
      expect(resolveDotPathValue(undefined, 'a.b')).toBeUndefined();
    });
  });

  it('sorts an empty string by length alongside the others', () => {
    // The reachable consequence: with the old guard the empty-string row resolved to `undefined` and sorted
    // as though the field were missing, while every other row sorted by its length.
    const comparator = makeComparator<{ cid: string; name: string }>({
      sort: [{ direction: 1, field: 'name.length' }] as never,
    });
    const rows = [
      { cid: 'c', name: 'abc' },
      { cid: 'a', name: '' },
      { cid: 'b', name: 'ab' },
    ];

    expect([...rows].sort(comparator).map(({ cid }) => cid)).toEqual(['a', 'b', 'c']);
  });
});
