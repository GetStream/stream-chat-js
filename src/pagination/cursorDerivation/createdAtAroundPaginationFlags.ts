import { deriveAroundPaginationFlags } from './aroundPaginationFlags';
import { dateToNs } from '../../utils/time';
import type { TimestampNS } from '../../types';
import type { CursorDeriveContext, PaginationFlags } from '../paginators';

export const deriveCreatedAtAroundPaginationFlags = <
  T extends { id: string; created_at: TimestampNS },
  Q extends { created_at_around?: Date | string },
>({
  hasMoreHead,
  hasMoreTail,
  interval,
  page,
  queryShape,
  requestedPageSize,
}: CursorDeriveContext<T, Q>): PaginationFlags => {
  if (!queryShape?.created_at_around) return { hasMoreHead, hasMoreTail };
  // The bound is a `Date` or ISO string but items carry nanoseconds: convert before comparing.
  const createdAtAround = dateToNs(new Date(queryShape.created_at_around));
  const olderCount = page.filter((item) => item.created_at < createdAtAround).length;
  return deriveAroundPaginationFlags({
    interval,
    newerCount: page.length - olderCount,
    olderCount,
    pageLength: page.length,
    requestedPageSize,
  });
};
