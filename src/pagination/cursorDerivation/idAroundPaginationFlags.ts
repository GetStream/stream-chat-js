import type { CursorDeriveContext, PaginationFlags } from '../paginators';

export const deriveIdAroundPaginationFlags = <
  T extends { id: string },
  Q extends { id_around?: string },
>({
  hasMoreHead,
  hasMoreTail,
  interval,
  page,
  queryShape,
  requestedPageSize,
}: CursorDeriveContext<T, Q>): PaginationFlags => {
  let flags: PaginationFlags = { hasMoreHead, hasMoreTail };
  if (!queryShape?.id_around) return flags;
  const { id_around } = queryShape;

  const [firstPageMsg, lastPageMsg] = [page[0], page.slice(-1)[0]];
  const [firstPageMsgIsFirstInSet, lastPageMsgIsLastInSet] = [
    firstPageMsg?.id === interval.itemIds[0],
    lastPageMsg?.id === interval.itemIds.slice(-1)[0],
  ];

  const midPoint = Math.floor(page.length / 2);
  const noMoreMessages =
    (requestedPageSize > interval.itemIds.length ||
      interval.itemIds.length >= page.length) &&
    requestedPageSize > page.length;

  if (noMoreMessages) {
    flags = { hasMoreHead: false, hasMoreTail: false };
  } else if (!page[midPoint]) {
    return flags;
  } else if (page[midPoint].id === id_around) {
    flags = { hasMoreHead: true, hasMoreTail: true };
  } else {
    const halves = [page.slice(0, midPoint), page.slice(midPoint)];
    if (firstPageMsgIsFirstInSet) {
      const targetMsg = halves[0].find((message) => message.id === id_around);
      if (targetMsg) {
        flags.hasMoreTail = false;
      }
    }
    if (lastPageMsgIsLastInSet) {
      const targetMsg = halves[1].find((message) => message.id === id_around);
      if (targetMsg) {
        flags.hasMoreHead = false;
      }
    }
  }

  return flags;
};
