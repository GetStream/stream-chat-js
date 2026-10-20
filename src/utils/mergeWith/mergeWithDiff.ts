import { cleanupDiffTree, createMergeCore } from './mergeWithCore';
import type { DiffNode, MergeWithCustomizer } from './mergeWithCore';

/**
 * Like `mergeWith`, and also returns a hierarchical diff of the keys that were added or
 * updated.
 *
 * @example
 *
 * const { result, diff } = mergeWithDiff({ a: 1, b: { c: 2 } }, { b: { c: 3 }, d: 4 });
 * // result => { a: 1, b: { c: 3 }, d: 4 }
 * // diff => {
 * //   children: {
 * //     b: {
 * //       type: 'updated', value: { c: 3 }, oldValue: { c: 2 },
 * //       children: { c: { type: 'updated', value: 3, oldValue: 2, children: {} } }
 * //     },
 * //     d: { type: 'added', value: 4, children: {} }
 * //   }
 * // }
 */
export function mergeWithDiff<T extends object>(
  target: T,
  source: object | object[],
  customizer?: MergeWithCustomizer<T>,
): { result: T; diff: DiffNode } {
  const mergeCore = createMergeCore<T>({ trackDiff: true });
  const { result, diff } = mergeCore({ target, source, customizer });

  return { result, diff: cleanupDiffTree(diff ?? { children: {} }) || { children: {} } };
}
