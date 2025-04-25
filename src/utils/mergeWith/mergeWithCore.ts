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

/**
 * Performs a deep comparison between two values to determine if they are equivalent.
 * This is similar to Lodash's isEqual implementation but simplified.
 */
export const isEqual = (
  value1: unknown,
  value2: unknown,
  compareStack = new Set<[unknown, unknown]>(),
  objectStack1 = new WeakSet<object>(),
  objectStack2 = new WeakSet<object>(),
): boolean => {
  // Handle simple equality cases first
  if (value1 === value2) return true;

  // If either is null/undefined, they're not equal (already checked ===)
  if (value1 == null || value2 == null) return false;

  // Get the type of both values
  const type1 = typeof value1;
  const type2 = typeof value2;

  // Different types mean they're not equal
  if (type1 !== type2) return false;

  // Handle non-object types that need special comparison
  if (type1 !== 'object') {
    // Special case for NaN
    // eslint-disable-next-line no-self-compare
    if (value1 !== value1 && value2 !== value2) return true;
    return value1 === value2;
  }

  // At this point, both values are objects
  const obj1 = value1 as object;
  const obj2 = value2 as object;

  // Check for circular references in each object
  if (objectStack1.has(obj1) || objectStack2.has(obj2)) {
    // If either object has been seen before, consider them equal
    // if they're both in a circular reference
    return objectStack1.has(obj1) && objectStack2.has(obj2);
  }

  // Add objects to their respective stacks
  objectStack1.add(obj1);
  objectStack2.add(obj2);

  // Handle Date objects - needs to be before the class instance check
  if (value1 instanceof Date && value2 instanceof Date) {
    objectStack1.delete(obj1);
    objectStack2.delete(obj2);
    return value1.getTime() === value2.getTime();
  }

  // Handle RegExp objects - needs to be before the class instance check
  if (value1 instanceof RegExp && value2 instanceof RegExp) {
    objectStack1.delete(obj1);
    objectStack2.delete(obj2);
    return value1.toString() === value2.toString();
  }

  // If either is a class instance, use reference equality (already checked above)
  if (isClassInstance(value1) || isClassInstance(value2)) {
    // Clean up before returning
    objectStack1.delete(obj1);
    objectStack2.delete(obj2);
    return false;
  }

  // Handle arrays
  const isArray1 = Array.isArray(value1);
  const isArray2 = Array.isArray(value2);

  if (isArray1 !== isArray2) {
    // Clean up before returning
    objectStack1.delete(obj1);
    objectStack2.delete(obj2);
    return false;
  }

  if (isArray1 && isArray2) {
    const arr1 = value1 as unknown[];
    const arr2 = value2 as unknown[];

    if (arr1.length !== arr2.length) {
      // Clean up before returning
      objectStack1.delete(obj1);
      objectStack2.delete(obj2);
      return false;
    }

    // Check for circular references in the comparison context
    const pairKey: [unknown, unknown] = [value1, value2];
    if (compareStack.has(pairKey)) {
      // Clean up before returning
      objectStack1.delete(obj1);
      objectStack2.delete(obj2);
      return true;
    }
    compareStack.add(pairKey);

    // Compare each element
    for (let i = 0; i < arr1.length; i++) {
      if (!isEqual(arr1[i], arr2[i], compareStack, objectStack1, objectStack2)) {
        compareStack.delete(pairKey);
        // Clean up before returning
        objectStack1.delete(obj1);
        objectStack2.delete(obj2);
        return false;
      }
    }

    compareStack.delete(pairKey);
    objectStack1.delete(obj1);
    objectStack2.delete(obj2);
    return true;
  }

  // Handle plain objects
  const plainObj1 = value1 as Record<string, unknown>;
  const plainObj2 = value2 as Record<string, unknown>;

  const keys1 = Object.keys(plainObj1);
  const keys2 = Object.keys(plainObj2);

  // If key counts differ, objects aren't equal
  if (keys1.length !== keys2.length) {
    // Clean up before returning
    objectStack1.delete(obj1);
    objectStack2.delete(obj2);
    return false;
  }

  // Verify all keys in obj2 are in obj1 (we already checked counts, so this
  // also ensures all keys in obj1 are in obj2)
  for (const key of keys2) {
    if (!Object.prototype.hasOwnProperty.call(plainObj1, key)) {
      // Clean up before returning
      objectStack1.delete(obj1);
      objectStack2.delete(obj2);
      return false;
    }
  }

  // Check for circular references in the comparison context
  const pairKey: [unknown, unknown] = [value1, value2];
  if (compareStack.has(pairKey)) {
    // Clean up before returning
    objectStack1.delete(obj1);
    objectStack2.delete(obj2);
    return true;
  }
  compareStack.add(pairKey);

  // Compare each property's value
  for (const key of keys1) {
    if (
      !isEqual(plainObj1[key], plainObj2[key], compareStack, objectStack1, objectStack2)
    ) {
      compareStack.delete(pairKey);
      // Clean up before returning
      objectStack1.delete(obj1);
      objectStack2.delete(obj2);
      return false;
    }
  }

  compareStack.delete(pairKey);
  // Clean up before returning successful comparison
  objectStack1.delete(obj1);
  objectStack2.delete(obj2);
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
  /**
   * Tracks pairs of objects being compared
   *  - It stores pairs of values that are being compared `[original, modified]`
   *  - This helps detect when we're comparing the same pair of objects again
   *  - It prevents infinite recursion when comparing complex object structures
   */
  compareStack = new Set<[unknown, unknown]>(),
  /**
   * Tracks individual objects that are being processed in the current traversal path
   *  - It's used to detect when we encounter the same object multiple times in a single traversal path
   *  - This helps identify self-referential or circular structures within a single object (e.g., when an object references itself)
   *  - When an object appears in `objectStack` again, we know it's a circular reference within the same object
   */
  objectStack = new Set<unknown>(),
): void {
  // If values are equal, no diff to record
  if (isEqual(original, modified, new Set(compareStack))) {
    return;
  }

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

  // Check for circular references in comparison
  const pairKey: [unknown, unknown] = [original, modified];
  if (compareStack.has(pairKey)) {
    // Remove from object stack before returning
    if (typeof original === 'object' && original !== null) {
      objectStack.delete(original);
    }
    return;
  }
  compareStack.add(pairKey);

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
      compareStack,
      objectStack,
    );
  }

  compareStack.delete(pairKey);

  // Remove from object stack before returning
  if (typeof original === 'object' && original !== null) {
    objectStack.delete(original);
  }
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

    function createNewTarget(targetValue: unknown, srcValue: unknown): object {
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
