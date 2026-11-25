import type { PaginatorViewState } from '../pagination/PaginatorView';
import { PaginatorView } from '../pagination/PaginatorView';
import type { ScheduledMessageResponse } from '../gen/models';
import type { ScheduledMessagePaginator } from '../pagination/paginators/ScheduledMessagePaginator';

/**
 * Which of its paginator's scheduled messages a view shows.
 * - `all`: every one, e.g. of a list registered with `client.scheduledMessagePaginators`.
 * - `channel`: a channel's own, without thread replies.
 * - `thread`: the replies of the thread whose parent message is `parentId`.
 */
export type ScheduledMessagesViewScope =
  | { type: 'all' }
  | { type: 'channel' }
  | { parentId: string; type: 'thread' };

export type ScheduledMessagesViewState = PaginatorViewState<ScheduledMessageResponse>;

export type ScheduledMessagesViewOptions = {
  /** The list the messages come from. The view only reads it. */
  paginator: ScheduledMessagePaginator;
  /** Defaults to `{ type: 'all' }`. */
  scope?: ScheduledMessagesViewScope;
};

const getScopePredicate = (scope: ScheduledMessagesViewScope) => {
  switch (scope.type) {
    case 'channel':
      return ({ message }: ScheduledMessageResponse) => !message.parent_id;
    case 'thread':
      return ({ message }: ScheduledMessageResponse) =>
        message.parent_id === scope.parentId;
    default:
      return undefined;
  }
};

/**
 * A scope of a `ScheduledMessagePaginator`, e.g. a channel's own scheduled messages or a thread's
 * scheduled replies. The server cannot filter scheduled messages by thread, so a channel's
 * paginator holds both, and each scope is a `PaginatorView` of it rather than a list of
 * its own. `Channel` and `Thread` hold theirs registered while they are.
 */
export class ScheduledMessagesView extends PaginatorView<ScheduledMessageResponse> {
  declare public readonly paginator: ScheduledMessagePaginator;
  public readonly scope: ScheduledMessagesViewScope;

  constructor({ paginator, scope = { type: 'all' } }: ScheduledMessagesViewOptions) {
    super({ paginator, predicate: getScopePredicate(scope) });
    this.scope = scope;
  }

  /** The thread's parent message ID, for a `thread` scope. */
  get parentId() {
    return this.scope.type === 'thread' ? this.scope.parentId : undefined;
  }
}
