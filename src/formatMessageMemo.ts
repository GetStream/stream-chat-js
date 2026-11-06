import type { LocalMessage } from './types';

/**
 * One `LocalMessage` per source object, shared by every subscriber that formats the same
 * `event.message`, so `EntityStore.upsert`'s reference check skips redundant writes. Keyed weakly:
 * an entry lives as long as its source.
 */
const memo: WeakMap<object, LocalMessage> = new WeakMap();

/** The `LocalMessage` already produced for `source`, if any. */
export const getMemoizedFormat = (source: object): LocalMessage | undefined =>
  memo.get(source);

/** Records `formatted` as the `LocalMessage` for `source`. */
export const memoizeFormat = (source: object, formatted: LocalMessage): void => {
  memo.set(source, formatted);
};
