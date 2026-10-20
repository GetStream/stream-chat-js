import type { CursorDeriveContext, PaginationFlags } from '../paginators';
import type { MessagePaginationParams, TimestampNS } from '../../types';

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

const hasAnyOf = (
  queryShape: LinearPaginationQueryShape | undefined,
  properties: Array<keyof LinearPaginationQueryShape>,
) => !!queryShape && properties.some((p) => typeof queryShape[p] !== 'undefined');

/**
 * The direction a query pages in, read from its cursor keys: `headward` for newer items, `tailward`
 * for older, `undefined` for a query without a cursor (the newest page) or with only unknown keys.
 */
export const getLinearQueryDirection = (
  queryShape: LinearPaginationQueryShape | undefined,
): 'headward' | 'tailward' | undefined => {
  if (hasAnyOf(queryShape, HEADWARD_QUERY_PROPERTIES)) return 'headward';
  if (hasAnyOf(queryShape, TAILWARD_QUERY_PROPERTIES)) return 'tailward';
  return undefined;
};

/**
 * Flags for a page queried from a cursor, or the newest page. `intervalEdges` are the outermost
 * items of the page's interval that a page can hold (see `BasePaginator.getServerKnownEdges`).
 */
export const deriveLinearPaginationFlags = <
  T extends { id: string; created_at: TimestampNS },
  Q extends LinearPaginationQueryShape,
>({
  direction,
  hasMoreHead,
  hasMoreTail,
  intervalEdges,
  page,
  queryShape,
  requestedPageSize,
}: CursorDeriveContext<T, Q> & {
  intervalEdges: { head: T | undefined; tail: T | undefined };
}): PaginationFlags => {
  const flags: PaginationFlags = { hasMoreHead, hasMoreTail };
  const [firstPageMsg, lastPageMsg] = [page[0], page.slice(-1)[0]];
  const [firstPageMsgIsFirstInSet, lastPageMsgIsLastInSet] = [
    firstPageMsg?.id && firstPageMsg.id === intervalEdges.tail?.id,
    lastPageMsg?.id && lastPageMsg.id === intervalEdges.head?.id,
  ];

  const containsCursorPaginationProperties = hasAnyOf(
    queryShape,
    HEADWARD_QUERY_PROPERTIES.concat(TAILWARD_QUERY_PROPERTIES),
  );

  const queriedMessagesTowardsHead =
    direction === 'headward' || hasAnyOf(queryShape, HEADWARD_QUERY_PROPERTIES);

  const queriedMessagesTowardsTail =
    direction === 'tailward' ||
    typeof queryShape === 'undefined' ||
    hasAnyOf(queryShape, TAILWARD_QUERY_PROPERTIES);

  const containsNonLinearPaginationProperties =
    !!(queryShape as MessagePaginationParams)?.id_around ||
    !!(queryShape as MessagePaginationParams)?.created_at_around;

  const containsUnrecognizedOptionsOnly =
    !queriedMessagesTowardsHead &&
    !queriedMessagesTowardsTail &&
    !containsNonLinearPaginationProperties;

  // A query without a cursor asks for the newest page.
  const isFirstPage = !containsCursorPaginationProperties;

  const hasMore = page.length >= requestedPageSize;
  const pageIsEmpty = page.length === 0;

  // A page says something about the side it was queried towards, and the newest page about both.
  // An older page cannot tell whether newer items exist, nor a newer page whether older ones do.
  if (queriedMessagesTowardsTail || isFirstPage || containsUnrecognizedOptionsOnly) {
    // Without the isFirstPage branch, a partial first page (e.g. an
    // offline prehydrate returning fewer than `requestedPageSize`) latches `hasMoreTail`
    // to `false` and a subsequent full network first page can never restore it.
    hasMoreTail = isFirstPage ? hasMore : !hasMoreTail ? false : hasMore;
    if (firstPageMsgIsFirstInSet || pageIsEmpty) flags.hasMoreTail = hasMoreTail;
  }
  if (isFirstPage) {
    // The server has nothing newer than its newest page, so the interval holding it reaches the head
    // even where it ends with newer items than the page: those arrived live, by events.
    flags.hasMoreHead = false;
  } else if (queriedMessagesTowardsHead) {
    hasMoreHead = !hasMoreHead ? false : hasMore;
    if (lastPageMsgIsLastInSet || pageIsEmpty) flags.hasMoreHead = hasMoreHead;
  }

  return flags;
};
