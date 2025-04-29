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
import type { MergeWithCustomizer } from './mergeWithCore';
import { createMergeCore } from './mergeWithCore';

export function mergeWith<T extends object>(
  target: T,
  source: object | object[],
  customizer?: MergeWithCustomizer<T>,
): T {
  const mergeCore = createMergeCore<T>();
  return mergeCore({ target, source, customizer }).result;
}
