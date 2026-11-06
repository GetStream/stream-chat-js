import type { Interval, PaginationFlags } from '../paginators';

/**
 * Flags for a page centred on a point (`id_around` / `created_at_around`). The server splits the
 * limit evenly around the point and fills a side that runs out from the other, so on a full page a
 * side with less than the smaller half is exhausted. A page shorter than the limit holds everything.
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
  // The smaller half, so the odd slot the server gives either side does not matter.
  const minShare = Math.floor((olderCount + newerCount) / 2);
  // An interval already known to reach the dataset head or tail stays there.
  return {
    hasMoreHead: !interval.isHead && isPageFull && newerCount >= minShare,
    hasMoreTail: !interval.isTail && isPageFull && olderCount >= minShare,
  };
};
