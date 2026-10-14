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
    filter_test_detail?: { user_id: number };
  }
}

export const primitiveField: ChannelFilters = { 'custom.filter_test_color': 'red' };
export const nestedField: ChannelFilters = { 'custom.filter_test_detail.user_id': 1 };

// @ts-expect-error -- a typed primitive custom field rejects a value of another type
export const wrongType: ChannelFilters = { 'custom.filter_test_color': { a: 1 } };
