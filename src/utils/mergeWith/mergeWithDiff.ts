/**
 * This method is like `mergeWith` except that it also returns information about
 * which keys have been added or updated during the merge operation.
 *
 * @category Object
 * @param object The destination object.
 * @param source A single source object or an array of objects to be merged into the object.
 * @param customizer The function to customize assigned values.
 * @returns Returns an object containing the merged result and a hierarchical diff object.
 * @example
 *
 * function customizer(objValue, srcValue) {
 *   if (Array.isArray(objValue)) {
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
 *   'vegetables': ['carrot'],
 *   'grains': ['wheat']
 * };
 *
 * const { result, diff } = mergeWithDiff({ target: object, source: other, customizer });
 * // result => { 'fruits': ['apple', 'banana'], 'vegetables': ['beet', 'carrot'], 'grains': ['wheat'] }
 * // diff => {
 * //   children: {
 * //     'fruits': { type: 'updated', value: ['banana'], oldValue: ['apple'], children: {} },
 * //     'vegetables': { type: 'updated', value: ['carrot'], oldValue: ['beet'], children: {} },
 * //     'grains': { type: 'added', value: ['wheat'], children: {} }
 * //   }
 * // }
 */
import { cleanupDiffTree, createMergeCore } from './mergeWithCore';
import type { DiffNode, MergeWithCustomizer } from './mergeWithCore';

export function mergeWithDiff<T extends object>(
  target: T,
  source: object | object[],
  customizer?: MergeWithCustomizer<T>,
): { result: T; diff: DiffNode } {
  const mergeCore = createMergeCore<T>({ trackDiff: true });
  const { result, diff } = mergeCore({ target, source, customizer });

  // Clean up the diff tree to remove empty nodes

  return { result, diff: cleanupDiffTree(diff ?? { children: {} }) || { children: {} } };
}
