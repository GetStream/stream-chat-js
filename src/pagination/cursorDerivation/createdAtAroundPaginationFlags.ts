import { binarySearch } from '../sortCompiler';
import type { BasePaginator, CursorDeriveContext, PaginationFlags } from '../paginators';
import { ComparisonResult } from '../types.normalization';

export const deriveCreatedAtAroundPaginationFlags = <
  T extends { id: string; created_at: Date },
  Q extends { created_at_around?: Date | string },
  P extends BasePaginator<T, Q>,
>({
  hasMoreHead,
  hasMoreTail,
  interval,
  page,
  paginator,
  queryShape,
  requestedPageSize,
}: CursorDeriveContext<T, Q> & { paginator: P }): PaginationFlags => {
  let flags: PaginationFlags = { hasMoreHead, hasMoreTail };
  if (!queryShape?.created_at_around) return flags;
  const createdAtAroundDate = new Date(queryShape.created_at_around);
  const [firstPageItem, lastPageItem] = [page[0], page.slice(-1)[0]];

  // expect ASC order (from oldest to newest)
  const isAboveHeadBound =
    paginator.sortComparator({ created_at: createdAtAroundDate } as T, lastPageItem) ===
    ComparisonResult.A_PRECEDES_B;
  const isBelowTailBound =
    paginator.sortComparator(firstPageItem, { created_at: createdAtAroundDate } as T) ===
    ComparisonResult.A_PRECEDES_B;

  const requestedPageSizeNotMet =
    requestedPageSize > interval.itemIds.length && requestedPageSize > page.length;
  const noMoreMessages =
    (requestedPageSize > interval.itemIds.length ||
      interval.itemIds.length >= page.length) &&
    requestedPageSize > page.length;

  if (isAboveHeadBound) {
    flags.hasMoreHead = false;
    if (requestedPageSizeNotMet) {
      flags.hasMoreTail = false;
    }
  } else if (isBelowTailBound) {
    flags.hasMoreTail = false;
    if (requestedPageSizeNotMet) {
      flags.hasMoreHead = false;
    }
  } else if (noMoreMessages) {
    flags = { hasMoreHead: false, hasMoreTail: false };
  } else {
    const [firstPageMsgIsFirstInSet, lastPageMsgIsLastInSet] = [
      firstPageItem?.id && firstPageItem.id === interval.itemIds[0],
      lastPageItem?.id && lastPageItem.id === interval.itemIds.slice(-1)[0],
    ];

    const midPointByCount = Math.floor(page.length / 2);
    const { insertionIndex } = binarySearch({
      needle: { created_at: createdAtAroundDate } as T,
      length: page.length,
      getItemAt: (index) => page[index],
      compare: (a, b) => a.created_at?.getTime() - b.created_at.getTime(),
      itemIdentityEquals: (a, b) => a.created_at?.getTime() === b.created_at?.getTime(),
      plateauScan: false,
    });

    if (insertionIndex !== -1) {
      if (firstPageMsgIsFirstInSet) flags.hasMoreTail = midPointByCount <= insertionIndex;
      if (lastPageMsgIsLastInSet) flags.hasMoreHead = midPointByCount >= insertionIndex;
    }
  }

  return flags;
};
