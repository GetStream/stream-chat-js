import type { Interval, PaginationFlags } from '../paginators';

/**
 * Flags for a page centred on a point (`id_around` / `created_at_around`). The server splits the
 * items around the point evenly and, when one side runs out, fills the rest from the other side. So
 * on a full page a side that got less than the smaller half ran out. A page shorter than the limit
 * holds everything on both sides.
 */
export const deriveAroundPaginationFlags = ({
  interval,
  newerCount,
  olderCount,
  pageLength,
  requestedPageSize,
}: {
  interval: Interval;
  newerCount: number;
  olderCount: number;
  pageLength: number;
  requestedPageSize: number;
}): PaginationFlags => {
  const isPageFull = pageLength >= requestedPageSize;
  // the smaller half, so an odd slot the server gives either side does not matter
  const minShare = Math.floor((olderCount + newerCount) / 2);
  // an interval already known to reach the dataset head or tail stays there
  return {
    hasMoreHead: !interval.isHead && isPageFull && newerCount >= minShare,
    hasMoreTail: !interval.isTail && isPageFull && olderCount >= minShare,
  };
};
