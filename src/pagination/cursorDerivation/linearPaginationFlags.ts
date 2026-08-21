import type { CursorDeriveContext, PaginationFlags } from '../paginators';
import type { MessagePaginationParams } from '../../types';

/**
 * The query keys this helper understands when deriving a cursor direction. Not a request
 * shape — `MessagePaginationParams` and `PinnedMessagePaginationOptions` are both assignable
 * to it, and `offset` is present because the pinned-messages endpoint accepts one.
 */
type LinearPaginationQueryShape = {
  created_at_after?: Date;
  created_at_after_or_equal?: Date;
  created_at_before?: Date;
  created_at_before_or_equal?: Date;
  id_gt?: string;
  id_gte?: string;
  id_lt?: string;
  id_lte?: string;
  limit?: number;
  offset?: number;
};

const TAILWARD_QUERY_PROPERTIES: Array<keyof LinearPaginationQueryShape> = [
  'created_at_before_or_equal',
  'created_at_before',
  'id_lt',
  'id_lte',
  'offset',
];

const HEADWARD_QUERY_PROPERTIES: Array<keyof LinearPaginationQueryShape> = [
  'created_at_after_or_equal',
  'created_at_after',
  'id_gt',
  'id_gte',
];
export const deriveLinearPaginationFlags = <
  T extends { id: string; created_at: Date },
  Q extends LinearPaginationQueryShape,
>({
  direction,
  hasMoreHead,
  hasMoreTail,
  interval,
  page,
  queryShape,
  requestedPageSize,
}: CursorDeriveContext<T, Q>): PaginationFlags => {
  const flags: PaginationFlags = { hasMoreHead, hasMoreTail };
  const [firstPageMsg, lastPageMsg] = [page[0], page.slice(-1)[0]];
  const [firstPageMsgIsFirstInSet, lastPageMsgIsLastInSet] = [
    firstPageMsg?.id && firstPageMsg.id === interval.itemIds[0],
    lastPageMsg?.id && lastPageMsg.id === interval.itemIds.slice(-1)[0],
  ];

  const containsCursorPaginationProperties =
    !!queryShape &&
    HEADWARD_QUERY_PROPERTIES.concat(TAILWARD_QUERY_PROPERTIES).some(
      (p) => typeof queryShape[p] !== 'undefined',
    );

  const queriedMessagesTowardsHead =
    direction === 'headward' ||
    (!!queryShape &&
      HEADWARD_QUERY_PROPERTIES.some((p) => typeof queryShape[p] !== 'undefined'));

  const queriedMessagesTowardsTail =
    direction === 'tailward' ||
    typeof queryShape === 'undefined' ||
    TAILWARD_QUERY_PROPERTIES.some((p) => typeof queryShape[p] !== 'undefined');

  const containsNonLinearPaginationProperties =
    !!(queryShape as MessagePaginationParams)?.id_around ||
    !!(queryShape as MessagePaginationParams)?.created_at_around;

  const containsUnrecognizedOptionsOnly =
    !queriedMessagesTowardsHead &&
    !queriedMessagesTowardsTail &&
    !containsNonLinearPaginationProperties;

  const isFirstPage = !containsCursorPaginationProperties;

  const hasMore = page.length >= requestedPageSize;

  if (
    typeof queriedMessagesTowardsTail !== 'undefined' ||
    containsUnrecognizedOptionsOnly
  ) {
    // Without the isFirstPage branch, a partial first page (e.g. an
    // offline prehydrate returning fewer than `requestedPageSize`) latches `hasMoreTail`
    // to `false` and a subsequent full network first page can never restore it.
    hasMoreTail = isFirstPage ? hasMore : !hasMoreTail ? false : hasMore;
  }
  if (typeof queriedMessagesTowardsHead !== 'undefined') {
    hasMoreHead = !hasMoreHead || isFirstPage ? false : hasMore;
  }
  const pageIsEmpty = page.length === 0;

  if ((firstPageMsgIsFirstInSet || pageIsEmpty) && typeof hasMoreTail !== 'undefined')
    flags.hasMoreTail = hasMoreTail;
  if ((lastPageMsgIsLastInSet || pageIsEmpty) && typeof hasMoreHead !== 'undefined')
    flags.hasMoreHead = hasMoreHead;

  return flags;
};
