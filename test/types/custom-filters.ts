/**
 * Compile-time contract for filters over augmented custom data. Type-checked, never executed.
 *
 * An object-valued custom field must not become a typed `custom.<field>` filter key: it would
 * conflict with the primitive `custom.${string}` index signature and break every filter type built
 * from the custom data (the SDK's own search sources included).
 */
import type { ChannelFilters } from 'stream-chat';

declare module 'stream-chat' {
  interface CustomChannelData {
    filter_test_color?: string;
    filter_test_detail?: { user_id: number; nested?: { label: string } };
    filter_test_count?: number;
    filter_test_flag?: boolean;
    filter_test_date?: Date;
    filter_test_level?: 'low' | 'high';
    filter_test_tags?: string[];
  }
}

export const primitiveField: ChannelFilters = { 'custom.filter_test_color': 'red' };
export const nestedField: ChannelFilters = { 'custom.filter_test_detail.user_id': 1 };

// Every primitive kind keeps its own type, alongside object-valued fields on the same interface.
export const mixedFields: ChannelFilters = {
  'custom.filter_test_color': { $in: ['red', 'blue'] },
  'custom.filter_test_count': { $gt: 1 },
  'custom.filter_test_flag': true,
  'custom.filter_test_date': { $lt: new Date() },
  'custom.filter_test_level': 'low',
  'custom.filter_test_detail.nested.label': { $autocomplete: 'x' },
};
export const nullableEq: ChannelFilters = { 'custom.filter_test_color': { $eq: null } };
export const inLogical: ChannelFilters = {
  $or: [
    { 'custom.filter_test_count': 1 },
    { 'custom.filter_test_detail.user_id': { $gte: 2 } },
  ],
};
// Object- and array-valued fields fall back to the primitive index signature.
export const objectExists: ChannelFilters = {
  'custom.filter_test_detail': { $exists: true },
};
export const arrayContains: ChannelFilters = {
  'custom.filter_test_tags': { $contains: 'a' },
};

// @ts-expect-error -- a typed primitive custom field rejects a value of another type
export const wrongType: ChannelFilters = { 'custom.filter_test_color': { a: 1 } };
// @ts-expect-error -- a number field rejects a string operand
export const wrongNumber: ChannelFilters = { 'custom.filter_test_count': { $gt: 'x' } };
// @ts-expect-error -- a boolean field rejects a string
export const wrongBoolean: ChannelFilters = { 'custom.filter_test_flag': 'true' };
// @ts-expect-error -- a Date field rejects a string
export const wrongDate: ChannelFilters = { 'custom.filter_test_date': 'yesterday' };
// @ts-expect-error -- a literal-union field rejects other strings
export const wrongLiteral: ChannelFilters = { 'custom.filter_test_level': 'medium' };
export const wrongNested: ChannelFilters = {
  // @ts-expect-error -- a nested path rejects an object value
  'custom.filter_test_detail.user_id': { a: 1 },
};
export const wrongInLogical: ChannelFilters = {
  // @ts-expect-error -- typed fields are still checked inside logical operators
  $or: [{ 'custom.filter_test_count': 'x' }],
};
