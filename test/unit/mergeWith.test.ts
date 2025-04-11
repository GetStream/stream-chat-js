import { describe, expect, it } from 'vitest';
import { mergeWith } from '../../src/utils/mergeWith';

describe('mergeWith', () => {
  it('should merge objects without customizer', () => {
    const object = {
      a: [{ b: 2 }, { d: 4 }],
      e: { f: 5 },
    };

    const other = {
      a: [{ c: 3 }, { e: 5 }],
      e: { g: 6 },
    };

    const result = mergeWith(object, other);

    expect(result).toEqual({
      a: [
        { b: 2, c: 3 },
        { d: 4, e: 5 },
      ],
      e: { f: 5, g: 6 },
    });
  });

  it('should handle multiple sources', () => {
    const object = { a: 1 };
    const source1 = { b: 2 };
    const source2 = { c: 3 };

    const result = mergeWith(object, [source1, source2]);

    expect(result).toEqual({ a: 1, b: 2, c: 3 });
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
