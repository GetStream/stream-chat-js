import { describe, expect, it } from 'vitest';
import { getPath, hasPath } from '../../../src/utils/objectPath';

/**
 * The pair's reason to exist is that `getPath` alone cannot answer "was this registered?": a configuration
 * patch may carry an explicit `undefined`, and that reads back the same as an absent key. Three other
 * dot-path walkers in this package return only a value, so none of them can express `hasPath` — which is
 * what the first test here pins.
 */
describe('objectPath', () => {
  describe('hasPath', () => {
    it('distinguishes an explicit undefined from an absent key', () => {
      // The property no value-returning accessor can provide, and the one the construction-only
      // diagnostic depends on to report a late registration.
      expect(
        hasPath(
          { messagePaginator: { initialCursor: undefined } },
          'messagePaginator.initialCursor',
        ),
      ).toBe(true);
      expect(hasPath({ messagePaginator: {} }, 'messagePaginator.initialCursor')).toBe(
        false,
      );
    });

    it('walks nested plain objects', () => {
      const tree = { a: { b: { c: 1 } } };

      expect(hasPath(tree, 'a')).toBe(true);
      expect(hasPath(tree, 'a.b')).toBe(true);
      expect(hasPath(tree, 'a.b.c')).toBe(true);
      expect(hasPath(tree, 'a.b.d')).toBe(false);
      expect(hasPath(tree, 'x.y')).toBe(false);
    });

    it('refuses to descend into anything that is not a plain object', () => {
      // A config tree holds class instances, arrays and functions as leaf *values*. Indexing into their
      // internals would be meaningless — `itemIndex.length` is not a configuration path.
      class ItemIndex {
        readonly length = 3;
      }

      expect(hasPath({ itemIndex: new ItemIndex() }, 'itemIndex.length')).toBe(false);
      expect(hasPath({ list: [1, 2, 3] }, 'list.length')).toBe(false);
      expect(hasPath({ findURLFn: () => [] }, 'findURLFn.name')).toBe(false);
      // …but each is still present as a leaf in its own right.
      expect(hasPath({ list: [1, 2, 3] }, 'list')).toBe(true);
    });
  });

  describe('getPath', () => {
    it('returns the value at a nested path', () => {
      expect(getPath({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
      expect(getPath({ a: { b: 0 } }, 'a.b')).toBe(0);
      expect(getPath({ a: { b: '' } }, 'a.b')).toBe('');
    });

    it('does not short-circuit on a falsy intermediate value', () => {
      // `resolveDotPathValue` in the pagination utilities does, which is the behaviour difference that
      // stops these being interchangeable.
      expect(getPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
      expect(getPath({ a: 0 }, 'a.b')).toBeUndefined();
    });

    it('returns undefined for an absent path rather than throwing', () => {
      expect(getPath({}, 'a.b.c')).toBeUndefined();
      expect(getPath({ a: null }, 'a.b')).toBeUndefined();
    });
  });
});
