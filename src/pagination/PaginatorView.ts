import { StateStore } from '@stream-io/state-store';

import type { BasePaginator } from './paginators/BasePaginator';

type Loader<T> = BasePaginator<T, any>['toTail'];
type DebouncedLoader<T> = BasePaginator<T, any>['toTailDebounced'];
import { WithSubscriptions } from '../utils/WithSubscriptions';

export type PaginatorViewState<T> = {
  /**
   * The items of the paginator's active interval (`state.items`) the predicate accepts, in the
   * paginator's order. `undefined` until the paginator has items.
   */
  items: T[] | undefined;
};

export type PaginatorViewPredicate<T> = (item: T) => boolean;

export type PaginatorViewOptions<T> = {
  /** The list the items come from. The view only reads it. */
  paginator: BasePaginator<T, any>;
  /** Which items the view shows; all of them without it. */
  predicate?: PaginatorViewPredicate<T>;
};

const sameItems = <T>(first: T[] | undefined, second: T[] | undefined) =>
  first === second ||
  (!!first &&
    !!second &&
    first.length === second.length &&
    first.every((item, index) => item === second[index]));

/**
 * A subset of a paginator's loaded items, kept in step with it: a list derived from another, not a
 * list of its own. Nothing is copied or queried, so every view of a paginator agrees with it. Use
 * one when the server cannot filter what a UI shows, e.g. a thread's scheduled replies among a
 * channel's scheduled messages.
 *
 * It narrows the active interval only (`state.items`). Not to be confused with the paginator's
 * `intervalViews`, which project whole intervals. It never writes the paginator's items; its
 * `toHead` / `toTail` (and their debounced versions) are the paginator's own, so a UI holding only
 * the view can load further pages, in whichever direction that paginator grows.
 *
 * `state` follows the paginator while subscriptions are registered. Registering is ref-counted:
 * each holder (an owning object, a UI showing the view) registers while it holds the view. On
 * registering, `state` catches up at once.
 */
export class PaginatorView<T> extends WithSubscriptions {
  public readonly paginator: BasePaginator<T, any>;
  public readonly state: StateStore<PaginatorViewState<T>>;
  private predicate?: PaginatorViewPredicate<T>;

  constructor({ paginator, predicate }: PaginatorViewOptions<T>) {
    super();
    this.paginator = paginator;
    this.predicate = predicate;
    this.state = new StateStore<PaginatorViewState<T>>({
      items: this.selectItems(paginator.state.getLatestValue().items),
    });
  }

  /** The paginator's `toHead`: loads the page headward of the loaded items. */
  public toHead: Loader<T> = (params) => this.paginator.toHead(params);

  /** The paginator's `toTail`: loads the page tailward of the loaded items. */
  public toTail: Loader<T> = (params) => this.paginator.toTail(params);

  /** The paginator's `toHeadDebounced`. */
  public toHeadDebounced: DebouncedLoader<T> = (params) =>
    this.paginator.toHeadDebounced(params);

  /** The paginator's `toTailDebounced`. */
  public toTailDebounced: DebouncedLoader<T> = (params) =>
    this.paginator.toTailDebounced(params);

  /** Whether the view takes an item, loaded or not. */
  public accepts = (item: T) => this.predicate?.(item) ?? true;

  /** Replaces the predicate and recomputes `items` from the paginator's current ones. */
  public setPredicate = (predicate?: PaginatorViewPredicate<T>) => {
    this.predicate = predicate;
    this.syncItems(this.paginator.state.getLatestValue().items);
  };

  public registerSubscriptions = () => {
    this.incrementRefCount();
    if (this.hasSubscriptions) return;

    // fires at once, so `state` is current from here on
    this.addUnsubscribeFunction(
      this.paginator.state.subscribeWithSelector(
        ({ items }) => ({ items }),
        ({ items }) => this.syncItems(items),
      ),
    );
  };

  private selectItems(items: T[] | undefined) {
    if (!items || !this.predicate) return items;
    return items.filter(this.accepts);
  }

  /** Writes the view's own `state` from the paginator's items; never the paginator. */
  private syncItems(paginatorItems: T[] | undefined) {
    const items = this.selectItems(paginatorItems);
    // the same items keep the same array, so subscribers are not notified for nothing
    if (sameItems(this.state.getLatestValue().items, items)) return;
    this.state.next({ items });
  }
}
