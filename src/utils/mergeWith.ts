/**
 * This method is like `_.merge` except that it accepts `customizer` which
 * is invoked to produce the merged values of the destination and source
 * properties. If `customizer` returns `undefined` merging is handled by the
 * method instead. The `customizer` is invoked with seven arguments:
 * (objValue, srcValue, key, object, source, stack).
 *
 * @category Object
 * @param object The destination object.
 * @param source A single source object or an array of objects to be merged into the .
 * @param customizer The function to customize assigned values.
 * @returns Returns `object`.
 * @example
 *
 * function customizer(objValue, srcValue) {
 *   if (_.isArray(objValue)) {
 *     return objValue.concat(srcValue);
 *   }
 * }
 *
 * var object = {
 *   'fruits': ['apple'],
 *   'vegetables': ['beet']
 * };
 *
 * var other = {
 *   'fruits': ['banana'],
 *   'vegetables': ['carrot']
 * };
 *
 * _.mergeWith(object, other, customizer);
 * // => { 'fruits': ['apple', 'banana'], 'vegetables': ['beet', 'carrot'] }
 */
type MergeWithCustomizer<T extends object> = (
  objValue: unknown,
  srcValue: unknown,
  key: string | symbol,
  object: T,
  source: object,
  stack: Set<unknown>,
) => unknown | undefined;

type PendingMerge = {
  key: string | symbol;
  parentKey: string | symbol;
  parentTarget: object;
  source: object;
  target: object;
};

export function mergeWith<T extends object>(
  target: T,
  source: object | object[],
  customizer?: MergeWithCustomizer<T>,
): T {
  const sources = Array.isArray(source) ? source : [source];

  function handleCustomizer(
    targetValue: unknown,
    srcValue: unknown,
    key: string | symbol,
    target: object,
    src: object,
    stack: Set<unknown>,
  ): boolean {
    const customValue = customizer?.(targetValue, srcValue, key, target as T, src, stack);
    if (customValue !== undefined) {
      Object.defineProperty(target, key, { value: customValue });
      return true;
    }
    return false;
  }

  function createNewTarget(targetValue: unknown, srcValue: unknown): object {
    if (targetValue && typeof targetValue === 'object') {
      return Array.isArray(targetValue) ? [...targetValue] : { ...targetValue };
    }
    return Array.isArray(srcValue) ? [] : {};
  }

  function processKeyValue(
    target: object,
    src: object,
    key: string | symbol,
    stack: Set<unknown>,
    pendingMerges: PendingMerge[],
  ): void {
    const srcValue = src[key as keyof typeof src];
    const targetValue = target[key as keyof typeof target];

    if (handleCustomizer(targetValue, srcValue, key, target, src, stack)) {
      return;
    }

    if (srcValue && typeof srcValue === 'object') {
      if (!stack.has(srcValue)) {
        const newTarget = createNewTarget(targetValue, srcValue);
        Object.defineProperty(target, key, { value: newTarget });

        pendingMerges.push({
          target: newTarget,
          source: srcValue,
          key,
          parentTarget: target,
          parentKey: key,
        });
      }
    } else if (srcValue !== undefined) {
      target[key as keyof typeof target] = srcValue;
    }
  }

  function processKeys(
    target: object,
    source: object,
    stack: Set<unknown>,
    pendingMerges: PendingMerge[],
  ): void {
    const keys = [...Object.keys(source), ...Object.getOwnPropertySymbols(source)];
    for (const key of keys) {
      processKeyValue(target, source, key, stack, pendingMerges);
    }
  }

  function processPendingMerge(
    { target, source }: PendingMerge,
    stack: Set<unknown>,
    pendingMerges: PendingMerge[],
  ): void {
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

  return sources.reduce<T>((result, source) => baseMerge(result, source) as T, {
    ...target,
  } as T);
}
