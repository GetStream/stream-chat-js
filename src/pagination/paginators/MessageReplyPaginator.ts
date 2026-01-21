import type {
  AnyInterval,
  Interval,
  PaginationQueryParams,
  PaginatorState,
} from './BasePaginator';
import { isLogicalInterval, ZERO_PAGE_CURSOR } from './BasePaginator';
import {
  BasePaginator,
  type PaginationQueryReturnValue,
  type PaginationQueryShapeChangeIdentifier,
  type PaginatorOptions,
} from './BasePaginator';
import type {
  LocalMessage,
  MessagePaginationOptions,
  PinnedMessagePaginationOptions,
} from '../../types';
import type { Channel } from '../../channel';
import { formatMessage, generateUUIDv4 } from '../../utils';
import { makeComparator } from '../sortCompiler';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';
import type { FieldToDataResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import type {
  JumpToMessageOptions,
  MessagePaginatorOptions,
  MessagePaginatorSort,
} from './MessagePaginator';
import { ItemIndex } from '../ItemIndex';

export type MessageReplyPaginatorFilter = {
  cid: string;
  parent_id: string;
};

const DEFAULT_PAGE_SIZE = 50;

const DEFAULT_BACKEND_SORT: MessagePaginatorSort = {
  created_at: 1,
};

export type MessageReplyQueryShape = {
  options: MessagePaginationOptions | PinnedMessagePaginationOptions;
  sort: MessagePaginatorSort;
};

const getQueryShapeRelevantMessageOptions = (
  options: MessagePaginationOptions,
): Omit<MessagePaginationOptions, 'limit'> => {
  const {
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    limit: _,
    ...relevantOptions
  } = options;
  return relevantOptions;
};

const hasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  MessageReplyQueryShape
> = (prevQueryShape, nextQueryShape) =>
  !isEqual(
    {
      ...prevQueryShape,
      options: getQueryShapeRelevantMessageOptions(prevQueryShape?.options ?? {}),
    },
    {
      ...nextQueryShape,
      options: getQueryShapeRelevantMessageOptions(nextQueryShape?.options ?? {}),
    },
  );

const dataFieldFilterResolver: FieldToDataResolver<LocalMessage> = {
  matchesField: () => true,
  resolve: (message, path) => resolveDotPathValue(message, path),
};

export type MessageReplyPaginatorOptions = Omit<
  MessagePaginatorOptions,
  'paginatorOptions'
> & {
  parentMessageId: string;
  paginatorOptions?: PaginatorOptions<LocalMessage, MessageReplyQueryShape>;
};

export class MessageReplyPaginator extends BasePaginator<
  LocalMessage,
  MessageReplyQueryShape
> {
  private readonly _id: string;
  private channel: Channel;
  protected _parentMessageId: string;
  protected _sort = DEFAULT_BACKEND_SORT;
  protected _nextQueryShape: MessageReplyQueryShape | undefined;
  sortComparator: (a: LocalMessage, b: LocalMessage) => number;

  protected get intervalItemIdsAreHeadFirst(): boolean {
    // Replies are stored in chronological order (created_at asc) within an interval.
    // Pagination "head" (newest side) is therefore at the END of the `itemIds` array.
    return false;
  }

  protected get intervalSortDirection(): 'asc' | 'desc' {
    // Head edge is newest, but sortComparator is created_at asc => newer head edges
    // should come first => reverse interval ordering.
    return 'desc';
  }

  constructor({
    channel,
    id,
    itemIndex = new ItemIndex({ getId: (item) => item.id }),
    paginatorOptions,
    parentMessageId,
  }: MessageReplyPaginatorOptions) {
    super({
      hasPaginationQueryShapeChanged,
      initialCursor: ZERO_PAGE_CURSOR,
      itemIndex,
      ...paginatorOptions,
      pageSize: paginatorOptions?.pageSize ?? DEFAULT_PAGE_SIZE,
    });
    const definedSort = DEFAULT_BACKEND_SORT;
    this.channel = channel;
    this._parentMessageId = parentMessageId;
    this._id = id ?? `message-reply-paginator-${generateUUIDv4()}`;
    this._sort = definedSort;
    this.sortComparator = makeComparator<LocalMessage, MessagePaginatorSort>({
      sort: this._sort,
      resolvePathValue: resolveDotPathValue,
      tiebreaker: (l, r) => {
        const leftId = this.getItemId(l);
        const rightId = this.getItemId(r);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      },
    });
    this.setFilterResolvers([dataFieldFilterResolver]);
  }

  get id() {
    return this._id;
  }

  get sort() {
    return this._sort ?? DEFAULT_BACKEND_SORT;
  }

  /**
   * Even though we do not send filters object to the server, we need to have filters for client-side item ingestion logic.
   */
  buildFilters = (): MessageReplyPaginatorFilter => ({
    cid: this.channel.cid,
    parent_id: this._parentMessageId,
  });

  // invoked inside BasePaginator.executeQuery() to keep it as a query descriptor;
  protected getNextQueryShape({
    direction,
  }: PaginationQueryParams<MessageReplyQueryShape>): MessageReplyQueryShape {
    return {
      options: {
        limit: this.pageSize,
        [direction === 'tailward' ? 'id_lt' : 'id_gt']:
          direction && this.cursor?.[direction],
      },
      sort: this._sort,
    };
  }

  query = async ({
    direction,
    queryShape,
  }: PaginationQueryParams<MessageReplyQueryShape>): Promise<
    PaginationQueryReturnValue<LocalMessage>
  > => {
    if (!queryShape) {
      queryShape = this.getNextQueryShape({ direction });
    }
    const { sort, options } = queryShape;
    let items: LocalMessage[];
    let tailward: string | undefined;
    let headward: string | undefined;
    if (this.config.doRequest) {
      const result = await this.config.doRequest({
        options,
        sort: Array.isArray(sort) ? sort : [sort],
      });
      items = result?.items ?? [];
      // if there is no direction, then we are jumping, and we want to set both directions in the cursor
      tailward =
        !direction || direction === 'tailward'
          ? (result.cursor?.tailward ?? undefined)
          : undefined;
      headward =
        !direction || direction === 'headward'
          ? (result.cursor?.headward ?? undefined)
          : undefined;
    } else {
      const { messages } = await this.channel.getReplies(
        this._parentMessageId,
        options,
        Array.isArray(sort) ? sort : [sort],
      );
      items = messages.map(formatMessage);
      // if there is no direction, then we are jumping, and we want to set both directions in the cursor
      tailward = !direction || direction === 'tailward' ? messages[0].id : undefined;
      headward =
        !direction || direction === 'headward' ? messages.slice(-1)[0].id : undefined;
    }

    return { items, headward, tailward };
  };

  isJumpQueryShape(queryShape: MessageReplyQueryShape): boolean {
    return (
      !!queryShape?.options?.id_around ||
      !!(queryShape.options as MessagePaginationOptions)?.created_at_around
    );
  }

  /**
   * Jump to a message inside thread replies.
   *
   * Mirrors `MessagePaginator.jumpToMessage` behavior:
   * - If the message is already present in the item index and belongs to an existing interval,
   *   it activates that interval without querying.
   * - Otherwise, performs an `id_around` query and ensures the item is present.
   */
  jumpToMessage = async (
    messageId: string,
    { pageSize }: JumpToMessageOptions = {},
  ): Promise<boolean> => {
    let localMessage = this.getItem(messageId);
    let interval: AnyInterval | undefined;
    let state: Partial<PaginatorState<LocalMessage>> | undefined;

    if (localMessage) {
      interval = this.locateIntervalForItem(localMessage);
    }

    if (!localMessage || !interval || isLogicalInterval(interval)) {
      const result = await this.executeQuery({
        queryShape: {
          options: { id_around: messageId, limit: pageSize },
          sort: this.sort,
        },
        updateState: false,
      });

      localMessage = this.getItem(messageId);
      if (!localMessage || !result || !result.targetInterval) {
        this.channel.getClient().notifications.addError({
          message: 'Jump to message unsuccessful',
          origin: {
            emitter: 'MessageReplyPaginator.jumpToMessage',
            context: { messageId, parentMessageId: this._parentMessageId },
          },
          options: { type: 'api:replies:query:failed' },
        });
        return false;
      }
      interval = result.targetInterval;
      state = result.stateCandidate;
    }

    if (!this.isActiveInterval(interval)) {
      this.setActiveInterval(interval);
      if (state) this.state.partialNext(state);
    }

    return true;
  };

  jumpToTheLatestMessage = async (options?: JumpToMessageOptions): Promise<boolean> => {
    let latestMessageId: string | undefined;
    const intervals = this.itemIntervals;

    if (!(intervals[0] as Interval)?.isHead) {
      // get the first page (in case the pagination has not started at the head)
      await this.executeQuery({ updateState: false });
    }

    const headInterval = intervals[0];
    if ((intervals[0] as Interval)?.isHead) {
      latestMessageId = headInterval.itemIds.slice(-1)[0];
    }

    if (!latestMessageId) {
      this.channel.getClient().notifications.addError({
        message: 'Jump to latest message unsuccessful',
        origin: { emitter: 'MessageReplyPaginator.jumpToTheLatestMessage' },
        options: { type: 'api:message:replies:query:failed' },
      });
      return false;
    }

    return await this.jumpToMessage(latestMessageId, options);
  };

  filterQueryResults = (items: LocalMessage[]) => items;
}
