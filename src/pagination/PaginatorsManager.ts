import { EventHandlerPipeline } from '../EventHandlerPipeline';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import type { Unsubscribe } from '@stream-io/state-store';
import type { StreamChat } from '../client';
import type { EventType } from '../types';
import type {
  FindEventHandlerParams,
  InsertEventHandlerPayload,
  LabeledEventHandler,
} from '../EventHandlerPipeline';

export type ManagerEventType = EventType | (string & {});

export interface ManagedPaginator {
  id: string;
  cancelScheduledQuery: () => void;
  resetState: () => void;
}

export type ManagerEventHandlers<TContext extends Record<string, unknown>> = Partial<
  Record<ManagerEventType, LabeledEventHandler<TContext>[]>
>;

export type AddEventHandlerParams<TContext extends Record<string, unknown>> = {
  eventType: ManagerEventType;
} & InsertEventHandlerPayload<TContext>;

export type SetEventHandlersParams<TContext extends Record<string, unknown>> = {
  eventType: ManagerEventType;
  handlers: LabeledEventHandler<TContext>[];
};

export type RemoveEventHandlersParams<TContext extends Record<string, unknown>> = {
  eventType: ManagerEventType;
  handlers: FindEventHandlerParams<TContext>[];
};

export const copyEventHandlers = <TContext extends Record<string, unknown>>(
  handlers: ManagerEventHandlers<TContext>,
): ManagerEventHandlers<TContext> => {
  const copy: ManagerEventHandlers<TContext> = {};
  for (const [eventType, eventHandlers] of Object.entries(handlers)) {
    if (eventHandlers) copy[eventType as ManagerEventType] = [...eventHandlers];
  }
  return copy;
};

/**
 * Shared engine for a client-level registry of filterable paginator lists kept in sync with WS
 * events: the event-handler pipelines and the paginator-set bookkeeping, with the per-domain parts
 * left abstract. `ScheduledMessagePaginatorsManager` is built on it; `ChannelManager` duplicates the
 * same mechanism today and could be migrated onto this base in the future (its filter-wrapping maps
 * to `onPaginatorAttached`/`onPaginatorDetached`), but is left as is for now.
 *
 * @internal
 */
export abstract class PaginatorsManager<
  TPaginator extends ManagedPaginator,
  TContext extends Record<string, unknown>,
> extends WithSubscriptions {
  public readonly client: StreamChat;
  protected eventHandlerPipelines = new Map<
    ManagerEventType,
    EventHandlerPipeline<TContext>
  >();

  constructor(client: StreamChat) {
    super();
    this.client = client;
  }

  abstract get paginators(): TPaginator[];

  protected abstract readonly managerName: string;
  protected abstract get eventHandlerContext(): TContext;
  protected abstract writePaginators(paginators: TPaginator[]): void;
  protected abstract onPaginatorAttached(paginator: TPaginator): void;
  protected abstract onPaginatorDetached(paginator: TPaginator): void;

  get pipelines() {
    return this.eventHandlerPipelines;
  }

  ensurePipeline(eventType: ManagerEventType): EventHandlerPipeline<TContext> {
    const existingPipeline = this.eventHandlerPipelines.get(eventType);
    if (existingPipeline) return existingPipeline;

    const pipeline = new EventHandlerPipeline<TContext>({
      id: `${this.managerName}:${eventType}`,
    });
    this.eventHandlerPipelines.set(eventType, pipeline);

    return pipeline;
  }

  protected installEventHandlers(handlers: ManagerEventHandlers<TContext>) {
    for (const [eventType, eventHandlers] of Object.entries(handlers)) {
      if (eventHandlers) this.ensurePipeline(eventType).replaceAll(eventHandlers);
    }
  }

  addEventHandler({
    eventType,
    ...payload
  }: AddEventHandlerParams<TContext>): Unsubscribe {
    return this.ensurePipeline(eventType).insert(payload);
  }

  setEventHandlers({ eventType, handlers }: SetEventHandlersParams<TContext>) {
    return this.ensurePipeline(eventType).replaceAll(handlers);
  }

  removeEventHandlers({ eventType, handlers }: RemoveEventHandlersParams<TContext>) {
    const pipeline = this.eventHandlerPipelines.get(eventType);
    handlers.forEach((params) => pipeline?.remove(params));
  }

  getPaginatorById(id: string): TPaginator | undefined {
    return this.paginators.find((paginator) => paginator.id === id);
  }

  setPaginators(paginators: TPaginator[]) {
    const nextPaginators: TPaginator[] = [];
    const seenIds = new Set<string>();
    for (const paginator of paginators) {
      if (seenIds.has(paginator.id)) continue;
      seenIds.add(paginator.id);
      nextPaginators.push(paginator);
    }

    const currentPaginators = this.paginators;
    const isUnchanged =
      currentPaginators.length === nextPaginators.length &&
      currentPaginators.every((paginator, i) => paginator === nextPaginators[i]);
    if (isUnchanged) return;

    const detached = currentPaginators.filter(
      (paginator) => !nextPaginators.includes(paginator),
    );
    const attached = nextPaginators.filter(
      (paginator) => !currentPaginators.includes(paginator),
    );

    this.writePaginators(nextPaginators);

    detached.forEach((paginator) => {
      this.onPaginatorDetached(paginator);
      paginator.cancelScheduledQuery();
    });
    attached.forEach((paginator) => this.onPaginatorAttached(paginator));
  }

  clearPaginators(): TPaginator[] {
    const cleared = this.paginators;
    this.setPaginators([]);
    return cleared;
  }

  insertPaginator({ index, paginator }: { paginator: TPaginator; index?: number }) {
    const paginators = this.paginators.filter(({ id }) => id !== paginator.id);
    const validIndex = Math.max(
      0,
      Math.min(index ?? paginators.length, paginators.length),
    );
    paginators.splice(validIndex, 0, paginator);
    this.setPaginators(paginators);
  }

  removePaginator(paginatorOrId: TPaginator | string): TPaginator | undefined {
    const id = typeof paginatorOrId === 'string' ? paginatorOrId : paginatorOrId.id;
    const removed = this.getPaginatorById(id);
    if (!removed) return undefined;
    this.setPaginators(this.paginators.filter((paginator) => paginator !== removed));
    return removed;
  }

  resetPaginatorStates() {
    this.paginators.forEach((paginator) => {
      paginator.cancelScheduledQuery();
      paginator.resetState();
    });
  }

  registerSubscriptions(): Unsubscribe {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(
        this.client.on((event) => {
          this.eventHandlerPipelines
            .get(event.type)
            ?.run(event, this.eventHandlerContext);
        }).unsubscribe,
      );
    }

    this.incrementRefCount();

    return () => this.unregisterSubscriptions();
  }
}
