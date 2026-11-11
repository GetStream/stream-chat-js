import { StateStore } from '@stream-io/state-store';
import { EventHandlerPipeline } from '../EventHandlerPipeline';
import { WithSubscriptions } from '../utils/WithSubscriptions';
import { ScheduledMessageErrorReason } from './constants';
import { getScheduledMessageErrorReason } from './errors';
import { DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS } from './eventHandlers';
import type { Unsubscribe } from '@stream-io/state-store';
import type { StreamChat } from '../client';
import type { ScheduledMessageResponse } from '../gen/models';
import type { ScheduledMessagePaginator } from '../pagination/paginators/ScheduledMessagePaginator';
import type {
  AddScheduledMessageEventHandlerParams,
  RemoveScheduledMessageEventHandlersParams,
  ScheduledMessagePaginatorsManagerEventHandlerContext,
  ScheduledMessagePaginatorsManagerEventHandlers,
  ScheduledMessagePaginatorsManagerEventType,
  ScheduledMessagePaginatorsManagerOptions,
  ScheduledMessagePaginatorsManagerState,
  SetScheduledMessageEventHandlersParams,
} from './types';

type ScheduledMessageEventHandlerPipeline =
  EventHandlerPipeline<ScheduledMessagePaginatorsManagerEventHandlerContext>;

const isDisabledError = (error: Error | undefined) =>
  !!error &&
  getScheduledMessageErrorReason(error) === ScheduledMessageErrorReason.Disabled;

const createInitialState = (): ScheduledMessagePaginatorsManagerState => ({
  isDisabled: false,
  paginators: [],
});

/**
 * Keeps the scheduled message lists an integrator registers up to date with `scheduled_message.*`
 * events, which reach every connection of the user, loaded channel or not. A channel's own list
 * (`channel.scheduledMessagesPaginator`) is the channel's.
 */
export class ScheduledMessagePaginatorsManager extends WithSubscriptions {
  private client: StreamChat;
  private eventHandlerPipelines = new Map<
    ScheduledMessagePaginatorsManagerEventType,
    ScheduledMessageEventHandlerPipeline
  >();
  private queryErrorUnsubscribeFunctions = new Map<
    ScheduledMessagePaginator,
    Unsubscribe
  >();

  public state: StateStore<ScheduledMessagePaginatorsManagerState>;

  constructor({
    client,
    eventHandlers = ScheduledMessagePaginatorsManager.getDefaultHandlers(),
  }: ScheduledMessagePaginatorsManagerOptions) {
    super();

    this.client = client;
    this.state = new StateStore<ScheduledMessagePaginatorsManagerState>(
      createInitialState(),
    );

    Object.entries(eventHandlers).forEach(([eventType, handlers = []]) =>
      this.ensurePipeline(eventType).replaceAll(handlers),
    );
  }

  get paginators() {
    return this.state.getLatestValue().paginators;
  }

  get pipelines() {
    return this.eventHandlerPipelines;
  }

  get isDisabled() {
    return this.state.getLatestValue().isDisabled;
  }

  public static getDefaultHandlers(): ScheduledMessagePaginatorsManagerEventHandlers {
    const defaultHandlers = Object.fromEntries(
      Object.entries(DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS).map(
        ([eventType, handlers = []]) => [eventType, [...handlers]],
      ),
    );

    return defaultHandlers;
  }

  private get eventHandlerContext(): ScheduledMessagePaginatorsManagerEventHandlerContext {
    return { scheduledMessagePaginators: this };
  }

  private runEventHandlers = () =>
    this.client.on((event) => {
      const pipeline = this.eventHandlerPipelines.get(event.type);

      pipeline?.run(event, this.eventHandlerContext);
    }).unsubscribe;

  private updateIsDisabled = () => {
    const isDisabled = this.paginators.some(({ lastQueryError }) =>
      isDisabledError(lastQueryError),
    );

    this.state.partialNext({ isDisabled });
  };

  private watchQueryErrors = (paginator: ScheduledMessagePaginator) => {
    if (this.queryErrorUnsubscribeFunctions.has(paginator)) return;

    const unsubscribe = paginator.state.subscribeWithSelector(
      ({ lastQueryError }) => ({ lastQueryError }),
      this.updateIsDisabled,
    );

    this.queryErrorUnsubscribeFunctions.set(paginator, unsubscribe);
  };

  private unwatchQueryErrors = (paginator: ScheduledMessagePaginator) => {
    this.queryErrorUnsubscribeFunctions.get(paginator)?.();
    this.queryErrorUnsubscribeFunctions.delete(paginator);
  };

  public ensurePipeline = (eventType: ScheduledMessagePaginatorsManagerEventType) => {
    const existingPipeline = this.eventHandlerPipelines.get(eventType);

    if (existingPipeline) return existingPipeline;

    const pipeline: ScheduledMessageEventHandlerPipeline = new EventHandlerPipeline({
      id: `ScheduledMessagePaginatorsManager:${eventType}`,
    });
    this.eventHandlerPipelines.set(eventType, pipeline);

    return pipeline;
  };

  public addEventHandler = ({
    eventType,
    ...payload
  }: AddScheduledMessageEventHandlerParams): Unsubscribe =>
    this.ensurePipeline(eventType).insert(payload);

  public setEventHandlers = ({
    eventType,
    handlers,
  }: SetScheduledMessageEventHandlersParams) =>
    this.ensurePipeline(eventType).replaceAll(handlers);

  public removeEventHandlers = ({
    eventType,
    handlers,
  }: RemoveScheduledMessageEventHandlersParams) => {
    const pipeline = this.eventHandlerPipelines.get(eventType);

    handlers.forEach((params) => pipeline?.remove(params));
  };

  public getPaginatorById = (id: string) =>
    this.paginators.find((paginator) => paginator.id === id);

  /**
   * Replaces the set of lists in one update, skipped when unchanged; duplicate IDs are kept once. A
   * dropped list stops receiving events and its scheduled query is cancelled.
   */
  public setPaginators = (paginators: ScheduledMessagePaginator[]) => {
    const nextPaginators: ScheduledMessagePaginator[] = [];
    const seenIds = new Set<string>();
    for (const paginator of paginators) {
      if (seenIds.has(paginator.id)) continue;
      seenIds.add(paginator.id);
      nextPaginators.push(paginator);
    }

    const currentPaginators = this.paginators;
    // An equivalent set would hand subscribers a new array and re-render every list.
    const isUnchanged =
      currentPaginators.length === nextPaginators.length &&
      currentPaginators.every((paginator, i) => paginator === nextPaginators[i]);
    if (isUnchanged) return;

    const detached = currentPaginators.filter(
      (paginator) => !nextPaginators.includes(paginator),
    );

    this.state.partialNext({ paginators: nextPaginators });

    detached.forEach((paginator) => {
      this.unwatchQueryErrors(paginator);
      paginator.cancelScheduledQuery();
    });
    nextPaginators.forEach(this.watchQueryErrors);
    this.updateIsDisabled();
  };

  /** Removes every list in one update and returns them. */
  public clearPaginators = (): ScheduledMessagePaginator[] => {
    const cleared = this.paginators;
    this.setPaginators([]);
    return cleared;
  };

  /** Registers a list at `index` (default: last), moving or replacing one with the same ID. */
  public insertPaginator = ({
    index,
    paginator,
  }: {
    paginator: ScheduledMessagePaginator;
    index?: number;
  }) => {
    const paginators = this.paginators.filter(({ id }) => id !== paginator.id);
    const validIndex = Math.max(
      0,
      Math.min(index ?? paginators.length, paginators.length),
    );
    paginators.splice(validIndex, 0, paginator);
    this.setPaginators(paginators);
  };

  /** Unregisters a list, keeping its items. Returns it, or `undefined` if it was not held. */
  public removePaginator = (
    paginatorOrId: ScheduledMessagePaginator | string,
  ): ScheduledMessagePaginator | undefined => {
    const id = typeof paginatorOrId === 'string' ? paginatorOrId : paginatorOrId.id;
    const removed = this.getPaginatorById(id);
    if (!removed) return undefined;
    this.setPaginators(this.paginators.filter((paginator) => paginator !== removed));
    return removed;
  };

  /** Ingests a copy into every registered list; each decides whether and where it belongs. */
  public ingest = (scheduledMessage: ScheduledMessageResponse) => {
    this.paginators.forEach((paginator) => paginator.ingestItem(scheduledMessage));
  };

  /** Reloads the loaded lists after a reconnect (called by `ConnectionRecoveryManager`). */
  public recover = async () => {
    const loadedPaginators = this.paginators.filter(({ isInitialized }) => isInitialized);

    await Promise.allSettled(loadedPaginators.map((paginator) => paginator.reload()));
  };

  /** Empties the lists on logout and keeps them registered. */
  public resetPaginatorStates = () => {
    this.paginators.forEach((paginator) => {
      paginator.cancelScheduledQuery();
      paginator.resetState();
    });
    this.state.partialNext({ isDisabled: false });
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(this.runEventHandlers());
  };
}
