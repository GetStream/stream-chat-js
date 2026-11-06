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

/** True for objects of a class other than `Object`. Arrays and plain objects are not. */
export const isClassInstance = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;

  if (Array.isArray(value)) return false;

  const proto = Object.getPrototypeOf(value);
  if (proto === null || proto === Object.prototype) return false;

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
 * Deep equality that is cycle-safe and covers symbol keys. Dates and RegExps compare by value, Sets
 * and Maps by content, other class instances only by `===`. `NaN` equals `NaN`, `-0` equals `0`.
 */
export const isEqual = (
  value1: unknown,
  value2: unknown,
  pairMemo: PairMemo = new WeakMap(),
): boolean => {
  if (value1 === value2) return true;
  if (value1 == null || value2 == null) return false;

  const t1 = typeof value1;
  const t2 = typeof value2;
  if (t1 !== t2) return false;

  if (t1 !== 'object') {
    // eslint-disable-next-line no-self-compare
    return value1 !== value1 && value2 !== value2 ? true : value1 === value2;
  }

  const o1 = value1 as object;
  const o2 = value2 as object;

  const tag1 = Object.prototype.toString.call(o1);
  const tag2 = Object.prototype.toString.call(o2);
  if (tag1 !== tag2) return false;

  // Dates and RegExps are class instances: compare them before that test.
  if (o1 instanceof Date && o2 instanceof Date) {
    return (o1 as Date).getTime() === (o2 as Date).getTime();
  }
  if (o1 instanceof RegExp && o2 instanceof RegExp) {
    const r1 = o1 as RegExp,
      r2 = o2 as RegExp;
    return r1.source === r2.source && r1.flags === r2.flags;
  }

  // Sets are equal when every value matches a distinct deep-equal value in the other.
  if (value1 instanceof Set && value2 instanceof Set) {
    if (value1.size !== value2.size) return false;
    if (memoHasOrAdd(pairMemo, value1, value2)) return true;

    const unmatched = new Set(value2);

    for (const v1 of value1) {
      let matched = false;
      for (const v2 of unmatched) {
        if (isEqual(v1, v2, pairMemo)) {
          unmatched.delete(v2);
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }

    return unmatched.size === 0;
  }

  if (value1 instanceof Map && value2 instanceof Map) {
    if (value1.size !== value2.size) return false;

    if (memoHasOrAdd(pairMemo, value1, value2)) return true;

    const unmatched = new Set(value2);

    for (const [k1, v1] of value1) {
      let matchedEntry: [unknown, unknown] | null = null;

      for (const entry of unmatched) {
        const [k2, v2] = entry as [unknown, unknown];
        if (isEqual(k1, k2, pairMemo) && isEqual(v1, v2, pairMemo)) {
          matchedEntry = entry;
          break;
        }
      }

      if (!matchedEntry) return false;
      unmatched.delete(matchedEntry);
    }

    return unmatched.size === 0;
  }

  if (isClassInstance(o1) || isClassInstance(o2)) return false;

  // Cycle guard: a pair already being compared counts as equal.
  if (memoHasOrAdd(pairMemo, o1, o2)) return true;

  // A hole differs from `undefined`.
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

  const keys1 = Reflect.ownKeys(o1).filter((k) =>
    Object.prototype.propertyIsEnumerable.call(o1, k),
  );
  const keys2 = Reflect.ownKeys(o2).filter((k) =>
    Object.prototype.propertyIsEnumerable.call(o2, k),
  );
  if (keys1.length !== keys2.length) return false;

  // Same prototype, so `{}` differs from `Object.create(null)`.
  if (Object.getPrototypeOf(o1) !== Object.getPrototypeOf(o2)) return false;

  for (const k of keys1) {
    if (!Object.prototype.hasOwnProperty.call(o2, k)) return false;
    // @ts-expect-error index signature
    if (!isEqual(o1[k], o2[k], pairMemo)) return false;
  }
  return true;
};

/** Diff of the keys added or updated in `modified`, or `null` when there are none. */
export function generateDiff(original: unknown, modified: unknown): DiffNode | null {
  const diffRoot: DiffNode = { children: {} };

  compareAndBuildDiff(original, modified, diffRoot);

  return cleanupDiffTree(diffRoot);
}

function compareAndBuildDiff(
  original: unknown,
  modified: unknown,
  parentDiffNode: DiffNode,
  key?: string | symbol,
  pairMemo: PairMemo = new WeakMap(),
  /** Objects on the current traversal path, to detect an object that references itself. */
  objectStack = new Set<unknown>(),
): void {
  if (isEqual(original, modified)) return;

  // A null/undefined original counts as an addition.
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

    if (typeof original === 'object' && original !== null) {
      objectStack.delete(original);
    }
    return;
  }

  const originalObj = original as Record<string | symbol, unknown>;
  const modifiedObj = modified as Record<string | symbol, unknown>;

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

  // Pairwise cycle check.
  if (
    typeof original === 'object' &&
    original !== null &&
    typeof modified === 'object' &&
    modified !== null
  ) {
    if (memoHasOrAdd(pairMemo, original as object, modified as object)) {
      if (typeof original === 'object') objectStack.delete(original);
      return;
    }
  }

  const allKeys = new Set([
    ...Object.keys(originalObj),
    ...Object.getOwnPropertySymbols(originalObj),
    ...Object.keys(modifiedObj),
    ...Object.getOwnPropertySymbols(modifiedObj),
  ]);

  for (const childKey of allKeys) {
    const originalValue = originalObj[childKey];
    const modifiedValue = modifiedObj[childKey];

    // Deletions are not tracked.
    if (!(childKey in modifiedObj)) {
      continue;
    }

    if (!(childKey in originalObj)) {
      currentDiffNode.children[String(childKey)] = {
        type: 'added',
        value: modifiedValue,
        children: {},
      };
      continue;
    }

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
        const isTargetClassInstance = isClassInstance(targetValue);
        const isSourceClassInstance = isClassInstance(srcValue);

        // A class instance on either side is not merged: the source one wins, else the target
        // stays.
        if (isTargetClassInstance || isSourceClassInstance) {
          if (isSourceClassInstance) {
            return srcValue as object;
          }
          return targetValue;
        }

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
        // Circular reference in the source: skip the merge. With diff tracking the target is re-set
        // on the parent.
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
      // Prevents infinite recursion.
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

    const diff =
      trackDiff && originalTarget ? generateDiff(originalTarget, result) : null;

    return { result, diff };
  };
}

/** Prunes nodes that have no type and no children. Returns `null` for an empty tree. */
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

  if (diffNode.type || hasChildren) {
    return {
      ...diffNode,
      children: cleanChildren,
    };
  }

  return null;
}
