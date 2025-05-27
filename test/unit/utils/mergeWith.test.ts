import { describe, expect, it } from 'vitest';
import { mergeWith } from '../../../src/utils/mergeWith/mergeWith';
import { mergeWithDiff } from '../../../src/utils/mergeWith/mergeWithDiff';
import { cleanupDiffTree, isEqual } from '../../../src/utils/mergeWith/mergeWithCore';

describe('mergeWith', () => {
  it('should merge objects without customizer', () => {
    const object = {
      a: [{ b: 2 }, { d: 4 }],
      e: { f: 5 },
    };

    const other = {
      a: [{ c: 3 }, { e: 5 }],
      e: { g: 6 },
      x: { w: 9 },
    };

    const result = mergeWith(object, other);
    expect(result).toEqual({
      a: [
        { b: 2, c: 3 },
        { d: 4, e: 5 },
      ],
      e: { f: 5, g: 6 },
      x: { w: 9 },
    });
  });

  it('should handle multiple sources', () => {
    const object = { a: 1 };
    const source1 = { b: 2 };
    const source2 = { c: 3 };

    const result = mergeWith(object, [source1, source2]);

    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('should handle multiple sources overrides', () => {
    const object = { a: 1 };
    const source1 = { a: 2 };
    const source2 = { a: 3 };

    const result = mergeWith(object, [source1, source2]);

    expect(result).toEqual({ a: 3 });
  });

  it('should handle deep merging', () => {
    const object = {
      a: {
        b: {
          c: 1,
        },
      },
    };

    const other = {
      a: {
        b: {
          d: 2,
        },
      },
    };

    const result = mergeWith(object, other);

    expect(result).toEqual({
      a: {
        b: {
          c: 1,
          d: 2,
        },
      },
    });
  });

  it('should handle arrays', () => {
    const object = {
      a: [1, 2, 3],
    };

    const other = {
      a: [4, 5, 6],
    };

    const result = mergeWith(object, other);

    // Arrays are replaced, not merged
    expect(result).toEqual({
      a: [4, 5, 6],
    });
  });

  it('should handle arrays with customizer', () => {
    const object = {
      a: [1, 2, 3],
    };

    const other = {
      a: [4, 5, 6],
    };

    const customizer = (objValue: unknown, srcValue: unknown) => {
      if (Array.isArray(objValue) && Array.isArray(srcValue)) {
        return [...objValue, ...srcValue];
      }
      return undefined;
    };

    const result = mergeWith(object, other, customizer);

    expect(result).toEqual({
      a: [1, 2, 3, 4, 5, 6],
    });
  });

  it('should handle null and undefined values', () => {
    const object = {
      a: 1,
      b: null,
      c: undefined,
      d: null,
    };

    const other = {
      a: null,
      b: 2,
      c: 3,
      d: undefined,
    };

    const result = mergeWith(object, other);

    expect(result).toEqual({
      a: null,
      b: 2,
      c: 3,
      d: null,
    });
  });

  it('should handle primitive values', () => {
    const object = {
      a: 1,
      b: 'string',
      c: true,
      d: false,
      e: null,
      f: undefined,
    };

    const other = {
      a: 2,
      b: 'new string',
      c: false,
      d: true,
      e: 0,
      f: 'defined',
    };

    const result = mergeWith(object, other);

    expect(result).toEqual({
      a: 2,
      b: 'new string',
      c: false,
      d: true,
      e: 0,
      f: 'defined',
    });
  });

  it('should handle symbols as keys', () => {
    const sym1 = Symbol('sym1');
    const sym2 = Symbol('sym2');

    const object: Record<string | symbol, number> = {
      [sym1]: 1,
      [sym2]: 2,
      a: 2,
    };

    const other: Record<string | symbol, number> = {
      [sym2]: 3,
      b: 4,
    };

    const result = mergeWith(object, other);

    expect(result[sym1]).toBe(1);
    expect(result[sym2]).toBe(3);
    expect(result.a).toBe(2);
    expect(result.b).toBe(4);
  });

  it('should handle circular references', () => {
    const object: any = { a: 1 };
    object.self = object;

    const other = { b: 2 };

    const result = mergeWith(object, other);

    // The result should have the properties from both objects
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);

    // The circular reference is broken since we're creating a new object
    expect(result.self).not.toBe(result);

    // Check that result.self has the expected properties
    expect(result.self.a).toBe(1);
    expect(result.self).toHaveProperty('self');
  });

  it('should handle customizer with all parameters', () => {
    const object = { a: 1 };
    const other = { a: 2 };

    const customizerCalls: Array<{
      objValue: unknown;
      srcValue: unknown;
      key: string | symbol;
      object: object;
      source: object;
      stack: Set<unknown>;
    }> = [];

    const customizer = (
      objValue: unknown,
      srcValue: unknown,
      key: string | symbol,
      object: object,
      source: object,
      stack: Set<unknown>,
    ) => {
      customizerCalls.push({ objValue, srcValue, key, object, source, stack });
      return undefined;
    };

    const result = mergeWith(object, other, customizer);

    expect(customizerCalls.length).toBe(1);
    expect(customizerCalls[0].objValue).toBe(1);
    expect(customizerCalls[0].srcValue).toBe(2);
    expect(customizerCalls[0].key).toBe('a');

    // The object passed to customizer is a copy, not the original
    expect(customizerCalls[0].object).not.toBe(object);
    expect(customizerCalls[0].object).toEqual({ a: 2 });
    expect(customizerCalls[0].source).toBe(other);
    expect(customizerCalls[0].stack).toBeInstanceOf(Set);
  });

  it('should return a new object, not the original', () => {
    const object = { a: 1 };
    const other = { b: 2 };

    const result = mergeWith(object, other);

    // The result should be a new object, not the original
    expect(result).not.toBe(object);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('should handle empty objects', () => {
    const object = {};
    const other = {};

    const result = mergeWith(object, other);

    expect(result).toEqual({});
  });

  it('should handle empty arrays', () => {
    const object = { a: [] };
    const other = { a: [] };

    const result = mergeWith(object, other);

    expect(result).toEqual({ a: [] });
  });

  it('should handle objects with prototype properties', () => {
    const object = { a: 1 };
    const other = Object.create({ b: 2 });

    const result = mergeWith(object, other);

    expect(result).toEqual({ a: 1 });
  });

  it('should use source class instance when both target and source are class instances', () => {
    // Create File instances
    const targetFile = new File(['target content'], 'target.txt', { type: 'text/plain' });
    const sourceFile = new File(['source content'], 'source.txt', { type: 'text/html' });

    const result = mergeWith({ file: targetFile }, { file: sourceFile });

    // The source class instance should be used
    expect(result.file).toBe(sourceFile);
    expect(result.file.name).toBe('source.txt');
    expect(result.file.type).toBe('text/html');
  });

  it('should preserve target class instance when source is a plain object', () => {
    // Create File instance and plain object
    const targetFile = new File(['target content'], 'target.txt', { type: 'text/plain' });
    const sourcePlain = { name: 'source.txt', content: 'source content' };

    const result = mergeWith({ file: targetFile }, { file: sourcePlain });

    // The target class instance should be preserved
    expect(result.file).toBe(targetFile);
    expect(result.file.name).toBe('target.txt');
    expect(result.file.type).toBe('text/plain');
  });

  it('should use source class instance when target is a plain object', () => {
    // Create File instance and plain object
    const sourceFile = new File(['source content'], 'source.txt', { type: 'text/html' });
    const targetPlain = { name: 'target.txt', content: 'target content' };

    const result = mergeWith({ file: targetPlain }, { file: sourceFile });

    // The source class instance should be used
    expect(result.file).toBe(sourceFile);
    expect(result.file.name).toBe('source.txt');
    expect((result.file as unknown as File).type).toBe('text/html');
  });
});

// Original tests for mergeWith...

describe('mergeWithDiff', () => {
  it('should return result and diff for simple objects', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };

    const { result, diff } = mergeWithDiff(target, source);

    expect(result).toEqual({ a: 1, b: 3, c: 4 });
    expect(diff).toEqual({
      children: {
        b: { type: 'updated', value: 3, oldValue: 2, children: {} },
        c: { type: 'added', value: 4, children: {} },
      },
    });
  });

  it('should track nested object changes', () => {
    const target = {
      a: { x: 1, y: 2 },
      b: { z: 3 },
    };
    const source = {
      a: { y: 5, w: 6 },
      c: { v: 7 },
    };

    const { result, diff } = mergeWithDiff(target, source);

    expect(result).toEqual({
      a: { x: 1, y: 5, w: 6 },
      b: { z: 3 },
      c: { v: 7 },
    });

    expect(diff).toEqual({
      children: {
        a: {
          type: 'updated',
          value: { x: 1, y: 5, w: 6 },
          oldValue: { x: 1, y: 2 },
          children: {
            y: { type: 'updated', value: 5, oldValue: 2, children: {} },
            w: { type: 'added', value: 6, children: {} },
          },
        },
        c: { type: 'added', value: { v: 7 }, children: {} },
      },
    });
  });

  it('should track array changes', () => {
    const target = { fruits: ['apple', 'banana'] };
    const source = { fruits: ['cherry', 'date'] };

    const { result, diff } = mergeWithDiff(target, source);

    expect(result).toEqual({ fruits: ['cherry', 'date'] });
    expect(diff).toEqual({
      children: {
        fruits: {
          type: 'updated',
          children: {
            '0': {
              type: 'updated',
              value: 'cherry',
              oldValue: 'apple',
              children: {},
            },
            '1': {
              type: 'updated',
              value: 'date',
              oldValue: 'banana',
              children: {},
            },
          },
          oldValue: ['apple', 'banana'],
          value: ['cherry', 'date'],
        },
      },
    });
  });

  it('should merge with customizer and track changes correctly', () => {
    const target = { fruits: ['apple'] };
    const source = { fruits: ['banana'] };

    const customizer = (objValue: unknown, srcValue: unknown) => {
      if (Array.isArray(objValue) && Array.isArray(srcValue)) {
        return [...objValue, ...srcValue];
      }
      return undefined;
    };

    const { result, diff } = mergeWithDiff(target, source, customizer);

    expect(result).toEqual({ fruits: ['apple', 'banana'] });
    expect(diff).toEqual({
      children: {
        fruits: {
          type: 'updated',
          children: {
            '1': {
              type: 'added',
              value: 'banana',
              children: {},
            },
          },
          oldValue: ['apple'],
          value: ['apple', 'banana'],
        },
      },
    });
  });

  it('should merge multiple sources with diff tracking', () => {
    const target = { a: 1 };
    const source1 = { b: 2 };
    const source2 = { c: 3 };

    const { result, diff } = mergeWithDiff(target, [source1, source2]);

    expect(result).toEqual({ a: 1, b: 2, c: 3 });
    expect(diff).toEqual({
      children: {
        b: { type: 'added', value: 2, children: {} },
        c: { type: 'added', value: 3, children: {} },
      },
    });
  });

  it('should ignore class instances in diff tracking', () => {
    // Create test File instances
    const targetFile = new File(['target content'], 'target.txt', { type: 'text/plain' });
    const sourceFile = new File(['source content'], 'source.txt', { type: 'text/html' });

    // Perform merge with diff tracking
    const { result, diff } = mergeWithDiff({ file: targetFile }, { file: sourceFile });

    // Verify source file is used in result
    expect(result.file).toBe(sourceFile);

    const fileDiff = diff.children.file;

    // Verify the structure of the diff
    expect(fileDiff.type).toBe('updated');
    expect(fileDiff.children).toEqual({});

    // Verify the types of value and oldValue properties
    expect(fileDiff.value instanceof Blob).toBe(true);
    expect(fileDiff.oldValue instanceof Blob).toBe(true);

    // Verify MIME types to ensure correct object identification
    expect((fileDiff.value as Blob).type).toBe('text/html'); // Source file type
    expect((fileDiff.oldValue as Blob).type).toBe('text/plain'); // Target file type
  });

  it('should handle circular references in diff tracking', () => {
    const target: any = { a: 1 };
    target.self = target;

    const source = { b: 2 };

    const { result, diff } = mergeWithDiff(target, source);

    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
    expect(result.self).not.toBe(result);

    // Diff should only track the added property b
    expect(diff).toEqual({
      children: {
        b: { type: 'added', value: 2, children: {} },
      },
    });
  });
});

describe('cleanupDiffTree', () => {
  it('should return null for empty diff nodes', () => {
    const diffNode = { children: {} };
    const result = cleanupDiffTree(diffNode);
    expect(result).toBeNull();
  });

  it('should keep nodes with type', () => {
    const diffNode = {
      type: 'added',
      value: 42,
      children: {},
    };
    const result = cleanupDiffTree(diffNode);
    expect(result).toEqual({
      type: 'added',
      value: 42,
      children: {},
    });
  });

  it('should remove empty child nodes', () => {
    const diffNode = {
      children: {
        a: { children: {} },
        b: { type: 'added', value: 2, children: {} },
        c: {
          children: {
            d: { children: {} },
          },
        },
      },
    };

    const result = cleanupDiffTree(diffNode);
    expect(result).toEqual({
      children: {
        b: { type: 'added', value: 2, children: {} },
      },
    });
  });

  it('should keep parent nodes with non-empty children', () => {
    const diffNode = {
      children: {
        parent: {
          children: {
            child: { type: 'added', value: 42, children: {} },
          },
        },
      },
    };

    const result = cleanupDiffTree(diffNode);
    expect(result).toEqual({
      children: {
        parent: {
          children: {
            child: { type: 'added', value: 42, children: {} },
          },
        },
      },
    });
  });

  it('should handle complex nested structures', () => {
    const diffNode = {
      children: {
        a: {
          children: {
            b: { type: 'updated', value: 2, oldValue: 1, children: {} },
            c: { children: {} },
          },
        },
        d: { children: {} },
        e: {
          type: 'added',
          value: { f: 3 },
          children: {
            f: { type: 'added', value: 3, children: {} },
          },
        },
      },
    };

    const result = cleanupDiffTree(diffNode);
    expect(result).toEqual({
      children: {
        a: {
          children: {
            b: { type: 'updated', value: 2, oldValue: 1, children: {} },
          },
        },
        e: {
          type: 'added',
          value: { f: 3 },
          children: {
            f: { type: 'added', value: 3, children: {} },
          },
        },
      },
    });
  });
});

// Testing the isEqual function
describe('isEqual', () => {
  it('should consider primitives equal if they have the same value', () => {
    expect(isEqual(42, 42)).toBe(true);
    expect(isEqual('hello', 'hello')).toBe(true);
    expect(isEqual(true, true)).toBe(true);
    expect(isEqual(null, null)).toBe(true);
    expect(isEqual(undefined, undefined)).toBe(true);
  });

  it('should consider different primitives not equal', () => {
    expect(isEqual(42, 43)).toBe(false);
    expect(isEqual('hello', 'world')).toBe(false);
    expect(isEqual(true, false)).toBe(false);
    expect(isEqual(null, undefined)).toBe(false);
    expect(isEqual(0, false)).toBe(false);
    expect(isEqual('', false)).toBe(false);
  });

  it('should handle NaN correctly', () => {
    expect(isEqual(NaN, NaN)).toBe(true);
    expect(isEqual(NaN, 0)).toBe(false);
    expect(isEqual(NaN, null)).toBe(false);
  });

  it('should compare arrays by value', () => {
    expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(isEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(isEqual([], [])).toBe(true);
  });

  it('should compare nested arrays correctly', () => {
    expect(isEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(isEqual([1, [2, 3]], [1, [2, 4]])).toBe(false);
    expect(isEqual([1, [2, [3]]], [1, [2, [3]]])).toBe(true);
  });

  it('should compare objects by value', () => {
    expect(isEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true); // order doesn't matter
    expect(isEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    expect(isEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(isEqual({}, {})).toBe(true);
  });

  it('should compare nested objects correctly', () => {
    expect(isEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    expect(isEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })).toBe(false);
    expect(isEqual({ a: 1, b: { c: { d: 3 } } }, { a: 1, b: { c: { d: 3 } } })).toBe(
      true,
    );
  });

  it('should compare mixed nested structures', () => {
    expect(isEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(isEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(isEqual([{ a: 1 }, [2, 3]], [{ a: 1 }, [2, 3]])).toBe(true);
  });

  it('should handle Date objects', () => {
    const date1 = new Date('2023-01-01');
    const date2 = new Date('2023-01-01');
    const date3 = new Date('2023-01-02');

    expect(isEqual(date1, date2)).toBe(true);
    expect(isEqual(date1, date3)).toBe(false);
    expect(isEqual({ date: date1 }, { date: date2 })).toBe(true);
  });

  it('should handle RegExp objects', () => {
    const regex1 = /abc/g;
    const regex2 = /abc/g;
    const regex3 = /def/g;

    expect(isEqual(regex1, regex2)).toBe(true);
    expect(isEqual(regex1, regex3)).toBe(false);
    expect(isEqual({ regex: regex1 }, { regex: regex2 })).toBe(true);
  });

  it('should handle class instances as not equal', () => {
    const file1 = new File(['content'], 'test.txt');
    const file2 = new File(['content'], 'test.txt');

    // Class instances should not be considered equal even with same properties
    expect(isEqual(file1, file2)).toBe(false);
    expect(isEqual(file1, file1)).toBe(true); // Same reference is equal
  });

  it('should handle circular references', () => {
    const obj1: any = { a: 1 };
    obj1.self = obj1;

    const obj2: any = { a: 1 };
    obj2.self = obj2;

    const obj3: any = { a: 2 };
    obj3.self = obj3;

    expect(isEqual(obj1, obj2)).toBe(true);
    expect(isEqual(obj1, obj3)).toBe(false);
  });

  it('should handle nested circular references', () => {
    const obj1: any = { a: 1 };
    const obj2: any = { b: 2, parent: obj1 };
    obj1.child = obj2;

    const obj3: any = { a: 1 };
    const obj4: any = { b: 2, parent: obj3 };
    obj3.child = obj4;

    const obj5: any = { a: 1 };
    const obj6: any = { b: 3, parent: obj5 }; // different value for b
    obj5.child = obj6;

    expect(isEqual(obj1, obj3)).toBe(true);
    expect(isEqual(obj1, obj5)).toBe(false);
  });

  it('should compare object property keys correctly', () => {
    // Objects with same keys but different order
    expect(isEqual({ a: 1, b: 2, c: 3 }, { c: 3, b: 2, a: 1 })).toBe(true);

    // Ensure keys in second object are correctly checked
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: 1, c: 3 };
    expect(isEqual(obj1, obj2)).toBe(false);
  });
});
