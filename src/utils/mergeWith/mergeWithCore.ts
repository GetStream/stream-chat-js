/**
 * Core utility functions and types for mergeWith functionality.
 * This file contains shared logic used by both mergeWith and mergeWithDiff functions.
 */

export type MergeWithCustomizer<T extends object> = (
  objValue: unknown,
  srcValue: unknown,
  key: string | symbol,
  object: T,
  source: object,
  stack: Set<unknown>,
) => unknown | undefined;

export type PendingMerge = {
  sourceKey: string | symbol;
  parentTarget: object;
  source: object;
  target: object;
};

export type ChangeType = 'added' | 'updated' | 'circular' | (string & {});

export interface DiffNode {
  type?: ChangeType;
  children: Record<string | symbol, DiffNode>;
  value?: unknown;
  oldValue?: unknown;
}

export const isClassInstance = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;

  // Arrays are not class instances
  if (Array.isArray(value)) return false;

  // Get the prototype chain
  const proto = Object.getPrototypeOf(value);

  // If it's null or Object.prototype, it's a plain object
  if (proto === null || proto === Object.prototype) return false;

  // Check if it has a constructor that's not Object
  return value.constructor && value.constructor !== Object;
};

type PairMemo = WeakMap<object, WeakSet<object>>;

function memoHasOrAdd(memo: PairMemo, a: object, b: object): boolean {
  const set = memo.get(a);
  if (set && set.has(b)) return true;
  if (set) set.add(b);
  else memo.set(a, new WeakSet([b]));
  return false;
}

/**
 * Deep semantic equality with cycle safety and symbol-key support.
 * Keeps your existing semantics:
 *  - Dates/RegExps compared by value
 *  - "Class instances" are treated atomically (unequal unless ===)
 *  - NaN equals NaN; -0 equals 0 (same as ===)
 */
export const isEqual = (
  value1: unknown,
  value2: unknown,
  pairMemo: PairMemo = new WeakMap(),
): boolean => {
  if (value1 === value2) return true; // includes -0 === 0
  if (value1 == null || value2 == null) return false;

  const t1 = typeof value1;
  const t2 = typeof value2;
  if (t1 !== t2) return false;

  if (t1 !== 'object') {
    // NaN handling
    // eslint-disable-next-line no-self-compare
    return value1 !== value1 && value2 !== value2 ? true : value1 === value2;
  }

  // Objects
  const o1 = value1 as object;
  const o2 = value2 as object;

  // Fast path for tag mismatch
  const tag1 = Object.prototype.toString.call(o1);
  const tag2 = Object.prototype.toString.call(o2);
  if (tag1 !== tag2) return false;

  // Special cases before instance test
  if (o1 instanceof Date && o2 instanceof Date) {
    return (o1 as Date).getTime() === (o2 as Date).getTime();
  }
  if (o1 instanceof RegExp && o2 instanceof RegExp) {
    const r1 = o1 as RegExp,
      r2 = o2 as RegExp;
    return r1.source === r2.source && r1.flags === r2.flags;
  }

  // Handle Set comparison
  // Two sets are equal if they have the same size and
  // every value in one has an equivalent value in the
  // other (using deep equality).
  // Cannot use the same item for multiple matches in another set.
  if (value1 instanceof Set && value2 instanceof Set) {
    if (value1.size !== value2.size) return false;
    if (memoHasOrAdd(pairMemo, value1, value2)) return true;

    const unmatched = new Set(value2);

    for (const v1 of value1) {
      let matched = false;
      for (const v2 of unmatched) {
        if (isEqual(v1, v2, pairMemo)) {
          unmatched.delete(v2); // consume the match
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }

    return unmatched.size === 0;
  }

  // Handle Map comparison
  if (value1 instanceof Map && value2 instanceof Map) {
    if (value1.size !== value2.size) return false;

    if (memoHasOrAdd(pairMemo, value1, value2)) return true;

    const unmatched = new Set(value2); // tracks entries in map2 not yet matched

    for (const [k1, v1] of value1) {
      let matchedEntry: [unknown, unknown] | null = null;

      for (const entry of unmatched) {
        const [k2, v2] = entry as [unknown, unknown];
        if (isEqual(k1, k2, pairMemo) && isEqual(v1, v2, pairMemo)) {
          matchedEntry = entry;
          break;
        }
      }

      if (!matchedEntry) return false; // nothing matched this entry
      unmatched.delete(matchedEntry); // consume it
    }

    return unmatched.size === 0;
  }

  // Treat non-plain instances atomically (your current rule)
  if (isClassInstance(o1) || isClassInstance(o2)) return false;

  // Cycle guard (pairwise)
  if (memoHasOrAdd(pairMemo, o1, o2)) return true;

  // Arrays (respect holes vs undefined)
  if (Array.isArray(o1)) {
    const a1 = value1 as unknown[],
      a2 = value2 as unknown[];
    if (a1.length !== a2.length) return false;
    for (let i = 0; i < a1.length; i++) {
      const has1 = i in a1,
        has2 = i in a2;
      if (has1 !== has2) return false;
      if (has1 && !isEqual(a1[i], a2[i], pairMemo)) return false;
    }
    // Compare enumerable non-index props as well (to align with objects)
    const extraKeys1 = Reflect.ownKeys(o1)
      .filter((k) => typeof k !== 'string' || isNaN(+k))
      .filter((k) => Object.prototype.propertyIsEnumerable.call(o1, k));
    const extraKeys2 = Reflect.ownKeys(o2)
      .filter((k) => typeof k !== 'string' || isNaN(+k))
      .filter((k) => Object.prototype.propertyIsEnumerable.call(o2, k));
    if (extraKeys1.length !== extraKeys2.length) return false;
    for (const k of extraKeys1) {
      if (!Object.prototype.hasOwnProperty.call(o2, k)) return false;
      // @ts-expect-error index signature
      if (!isEqual(o1[k], o2[k], pairMemo)) return false;
    }
    return true;
  }

  // Plain objects (string + symbol enumerable own keys)
  const keys1 = Reflect.ownKeys(o1).filter((k) =>
    Object.prototype.propertyIsEnumerable.call(o1, k),
  );
  const keys2 = Reflect.ownKeys(o2).filter((k) =>
    Object.prototype.propertyIsEnumerable.call(o2, k),
  );
  if (keys1.length !== keys2.length) return false;

  // enforce same prototype to avoid {} == Object.create(null, ...)
  if (Object.getPrototypeOf(o1) !== Object.getPrototypeOf(o2)) return false;

  for (const k of keys1) {
    if (!Object.prototype.hasOwnProperty.call(o2, k)) return false;
    // @ts-expect-error index signature
    if (!isEqual(o1[k], o2[k], pairMemo)) return false;
  }
  return true;
};

/**
 * Generates a diff between original and modified objects.
 * This is used after the merge operation to track what has changed.
 */
export function generateDiff(original: unknown, modified: unknown): DiffNode | null {
  // Root diff node
  const diffRoot: DiffNode = { children: {} };

  // Compare the objects and build the diff tree
  compareAndBuildDiff(original, modified, diffRoot);

  // Clean up the diff tree (remove empty nodes)
  return cleanupDiffTree(diffRoot);
}

/**
 * Helper function to compare and build the diff tree
 */
function compareAndBuildDiff(
  original: unknown,
  modified: unknown,
  parentDiffNode: DiffNode,
  key?: string | symbol,
  pairMemo: PairMemo = new WeakMap(),
  /**
   * Tracks individual objects that are being processed in the current traversal path
   *  - It's used to detect when we encounter the same object multiple times in a single traversal path
   *  - This helps identify self-referential or circular structures within a single object (e.g., when an object references itself)
   *  - When an object appears in `objectStack` again, we know it's a circular reference within the same object
   */
  objectStack = new Set<unknown>(),
): void {
  // If values are equal, no diff to record
  if (isEqual(original, modified)) return;

  // Handle additions (value in modified but not in original)
  if (original === undefined || original === null) {
    if (key !== undefined) {
      parentDiffNode.children[String(key)] = {
        type: 'added',
        value: modified,
        children: {},
      };
    }
    return;
  }

  // Check for circular references in objects
  if (typeof original === 'object' && original !== null) {
    if (objectStack.has(original)) {
      if (key !== undefined) {
        parentDiffNode.children[String(key)] = {
          type: 'circular',
          value: modified,
          oldValue: original,
          children: {},
        };
      }
      return;
    }
    objectStack.add(original);
  }

  // Check if we're dealing with non-objects or special object types that should be treated atomically
  const shouldTreatAtomically =
    typeof original !== 'object' ||
    typeof modified !== 'object' ||
    original === null ||
    modified === null ||
    Array.isArray(original) !== Array.isArray(modified) ||
    isClassInstance(original) ||
    isClassInstance(modified);

  if (shouldTreatAtomically) {
    if (key !== undefined) {
      parentDiffNode.children[String(key)] = {
        type: 'updated',
        value: modified,
        oldValue: original,
        children: {},
      };
    }

    // Remove from object stack if it was added
    if (typeof original === 'object' && original !== null) {
      objectStack.delete(original);
    }
    return;
  }

  // Handle objects
  const originalObj = original as Record<string | symbol, unknown>;
  const modifiedObj = modified as Record<string | symbol, unknown>;

  // Create a diff node for this level if we're processing a property
  const currentDiffNode =
    key !== undefined
      ? {
          type: 'updated' as ChangeType,
          children: {},
          oldValue: original,
          value: modified,
        }
      : parentDiffNode;

  if (key !== undefined) {
    parentDiffNode.children[String(key)] = currentDiffNode;
  }

  // Pairwise cycle check (prevents infinite recursion across the *pair*)
  if (
    typeof original === 'object' &&
    original !== null &&
    typeof modified === 'object' &&
    modified !== null
  ) {
    if (memoHasOrAdd(pairMemo, original as object, modified as object)) {
      // already visited this exact pair in this diff traversal
      // (prevents infinite recursion), so stop here
      if (typeof original === 'object') objectStack.delete(original);
      return;
    }
  }

  // Process all keys from both objects
  const allKeys = new Set([
    ...Object.keys(originalObj),
    ...Object.getOwnPropertySymbols(originalObj),
    ...Object.keys(modifiedObj),
    ...Object.getOwnPropertySymbols(modifiedObj),
  ]);

  for (const childKey of allKeys) {
    const originalValue = originalObj[childKey];
    const modifiedValue = modifiedObj[childKey];

    // Handle deleted properties (they exist in original but not in modified)
    if (!(childKey in modifiedObj)) {
      // Currently we don't track deletions, but could be added here if needed
      continue;
    }

    // Handle added properties (they exist in modified but not in original)
    if (!(childKey in originalObj)) {
      currentDiffNode.children[String(childKey)] = {
        type: 'added',
        value: modifiedValue,
        children: {},
      };
      continue;
    }

    // Process properties that exist in both but may have changed
    compareAndBuildDiff(
      originalValue,
      modifiedValue,
      currentDiffNode,
      childKey,
      pairMemo,
      objectStack,
    );
  }

  if (typeof original === 'object' && original !== null) objectStack.delete(original);
}

export function createMergeCore<T extends object>(options: { trackDiff?: boolean } = {}) {
  const { trackDiff = false } = options;

  return function mergeCore({
    target,
    source,
    customizer,
  }: {
    target: T;
    source: object | object[];
    customizer?: MergeWithCustomizer<T>;
  }): { result: T; diff: DiffNode | null } {
    const sources = Array.isArray(source) ? source : [source];

    // Store the original target if we need to track diffs
    const originalTarget = trackDiff ? structuredClone(target) : undefined;

    function handleCustomizer(
      targetValue: unknown,
      srcValue: unknown,
      sourceKey: string | symbol,
      target: object,
      src: object,
      stack: Set<unknown>,
    ): boolean {
      const customValue = customizer?.(
        targetValue,
        srcValue,
        sourceKey,
        target as T,
        src,
        stack,
      );
      if (customValue !== undefined) {
        Object.defineProperty(target, sourceKey, {
          value: customValue,
          enumerable: true,
          writable: true,
          configurable: true,
        });
        return true;
      }
      return false;
    }

    function createNewTarget(targetValue: unknown, srcValue: object): object {
      if (targetValue === null || typeof targetValue === 'undefined') {
        return srcValue;
      }
      if (!Array.isArray(targetValue) && typeof targetValue !== 'object') {
        return srcValue;
      }
      if (targetValue && typeof targetValue === 'object') {
        // Check if it's a class instance (not a plain object)
        const isTargetClassInstance = isClassInstance(targetValue);
        const isSourceClassInstance = isClassInstance(srcValue);

        // If either is a class instance, don't try to merge them
        if (isTargetClassInstance || isSourceClassInstance) {
          // If source is a class instance, use it
          if (isSourceClassInstance) {
            return srcValue as object;
          }
          // Otherwise preserve the target
          return targetValue;
        }

        // For plain objects, use normal merging
        return Array.isArray(targetValue) ? [...targetValue] : { ...targetValue };
      }
      return Array.isArray(srcValue) ? [] : {};
    }

    function processSourceValue(
      target: object,
      src: object,
      sourceKey: string | symbol,
      stack: Set<unknown>,
      pendingMerges: PendingMerge[],
    ): void {
      const srcValue = src[sourceKey as keyof typeof src];
      const targetValue = target[sourceKey as keyof typeof target];

      if (handleCustomizer(targetValue, srcValue, sourceKey, target, src, stack)) {
        return;
      }

      if (srcValue && typeof srcValue === 'object') {
        if (!stack.has(srcValue)) {
          const newTarget = createNewTarget(targetValue, srcValue);
          Object.defineProperty(target, sourceKey, {
            value: newTarget,
            enumerable: true,
            writable: true,
            configurable: true,
          });

          if (isClassInstance(newTarget)) return;

          pendingMerges.push({
            target: newTarget,
            source: srcValue,
            sourceKey,
            parentTarget: target,
          });
        }
      } else if (srcValue !== undefined) {
        target[sourceKey as keyof typeof target] = srcValue;
      }
    }

    function processKeys(
      target: object,
      source: object,
      stack: Set<unknown>,
      pendingMerges: PendingMerge[],
    ): void {
      const sourceKeys = [
        ...Object.keys(source),
        ...Object.getOwnPropertySymbols(source),
      ];
      for (const sourceKey of sourceKeys) {
        processSourceValue(target, source, sourceKey, stack, pendingMerges);
      }
    }

    function processPendingMerge(
      { target, source, sourceKey, parentTarget }: PendingMerge,
      stack: Set<unknown>,
      pendingMerges: PendingMerge[],
    ): void {
      if (stack.has(source)) {
        // We've detected a circular reference in the source object
        // Just skip this merge to avoid infinite recursion

        // If we're tracking diffs, we need to mark this as a circular reference
        if (trackDiff && sourceKey && parentTarget) {
          Object.defineProperty(parentTarget, sourceKey, {
            value: target,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        return;
      }

      if (!stack.has(target) && !stack.has(source)) {
        stack.add(target);
        stack.add(source);
        processKeys(target, source, stack, pendingMerges);
        stack.delete(source);
        stack.delete(target);
      }
    }

    function baseMerge(object: T, source: object, stack = new Set<unknown>()): T {
      // prevent infinite recursion
      if (stack.has(object) || stack.has(source)) {
        return { ...object };
      }

      const result = { ...object };
      const pendingMerges: PendingMerge[] = [];
      stack.add(result);
      stack.add(source);

      processKeys(result, source, stack, pendingMerges);

      while (pendingMerges.length) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        processPendingMerge(pendingMerges.pop()!, stack, pendingMerges);
      }

      stack.delete(source);
      stack.delete(result);

      return result;
    }

    const result = sources.reduce<T>((result, source) => baseMerge(result, source) as T, {
      ...target,
    } as T);

    // If diff tracking is enabled, generate the diff after the merge is complete
    const diff =
      trackDiff && originalTarget ? generateDiff(originalTarget, result) : null;

    return { result, diff };
  };
}

// Utility function to clean up the diff tree by removing empty child nodes
export function cleanupDiffTree(diffNode: DiffNode): DiffNode | null {
  const cleanChildren: Record<string | symbol, DiffNode> = {};
  let hasChildren = false;

  for (const key in diffNode.children) {
    const childNode = cleanupDiffTree(diffNode.children[key]);
    if (childNode) {
      cleanChildren[key] = childNode;
      hasChildren = true;
    }
  }

  // If this node has a type (added/updated) or has children, keep it
  if (diffNode.type || hasChildren) {
    return {
      ...diffNode,
      children: cleanChildren,
    };
  }

  return null;
}
