import { deriveAroundPaginationFlags } from './aroundPaginationFlags';
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
  const targetIndex = page.findIndex((item) => item.id === queryShape?.id_around);
  // Without the target in the page, the page says nothing about where it sits.
  if (!queryShape?.id_around || targetIndex === -1) return { hasMoreHead, hasMoreTail };
  return deriveAroundPaginationFlags({
    interval,
    newerCount: page.length - 1 - targetIndex,
    olderCount: targetIndex,
    pageLength: page.length,
    requestedPageSize,
  });
};
