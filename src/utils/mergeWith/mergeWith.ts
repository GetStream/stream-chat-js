import type { MergeWithCustomizer } from './mergeWithCore';
import { createMergeCore } from './mergeWithCore';

/**
 * Like lodash `_.merge`, but `customizer` produces the merged value of each destination and source
 * property. When it returns `undefined` the default merge applies. It is called with
 * (objValue, srcValue, key, object, source, stack).
 *
 * @param target - The destination object. It is not mutated.
 * @param source - A single source object or an array of objects to be merged into `target`.
 * @param customizer - The function to customize assigned values.
 * @returns A new object with the merged result.
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
 *   'vegetables': ['carrot']
 * };
 *
 * mergeWith(object, other, customizer);
 * // => { 'fruits': ['apple', 'banana'], 'vegetables': ['beet', 'carrot'] }
 */
export function mergeWith<T extends object>(
  target: T,
  source: object | object[],
  customizer?: MergeWithCustomizer<T>,
): T {
  const mergeCore = createMergeCore<T>();
  return mergeCore({ target, source, customizer }).result;
}
