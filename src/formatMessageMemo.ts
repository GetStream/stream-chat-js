import type { LocalMessage } from './types';

/**
 * One `LocalMessage` per source object, for as long as that source object lives.
 *
 * Several independent subscribers — `Channel`, `Thread`, `MessageComposer`, `PollManager` — each
 * format the same `event.message` for themselves. Those copies are equal but not identical, so
 * `EntityStore.upsert`'s reference bail never fires and every write re-projects the other holders.
 * Handing them all the same object makes the bail do its job.
 *
 * Keyed weakly on the source, so an entry lives exactly as long as the object it was derived from
 * and nothing is retained on its behalf.
 */
const memo: WeakMap<object, LocalMessage> = new WeakMap();

/** The `LocalMessage` already produced for `source`, if any. */
export const getMemoizedFormat = (source: object): LocalMessage | undefined =>
  memo.get(source);

/** Records `formatted` as the `LocalMessage` for `source`. */
export const memoizeFormat = (source: object, formatted: LocalMessage): void => {
  memo.set(source, formatted);
};
