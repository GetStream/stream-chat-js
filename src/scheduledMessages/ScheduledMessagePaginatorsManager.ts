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

const MANAGER_NAME = 'ScheduledMessagePaginatorsManager';

const isDisabledError = (error: Error | undefined) =>
  !!error &&
  getScheduledMessageErrorReason(error) === ScheduledMessageErrorReason.Disabled;

const createInitialState = (): ScheduledMessagePaginatorsManagerState => ({
  isDisabled: false,
  paginators: [],
});

const copyEventHandlers = (
  handlers: ScheduledMessagePaginatorsManagerEventHandlers,
): ScheduledMessagePaginatorsManagerEventHandlers => {
  const copy: ScheduledMessagePaginatorsManagerEventHandlers = {};
  for (const [eventType, eventHandlers] of Object.entries(handlers)) {
    if (eventHandlers) copy[eventType] = [...eventHandlers];
  }
  return copy;
};

const dedupeById = (paginators: ScheduledMessagePaginator[]) => {
  const seenIds = new Set<string>();
  return paginators.filter(({ id }) => {
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
};

const sameOrder = (
  first: ScheduledMessagePaginator[],
  second: ScheduledMessagePaginator[],
) =>
  first.length === second.length &&
  first.every((paginator, index) => paginator === second[index]);

export class ScheduledMessagePaginatorsManager extends WithSubscriptions {
  private eventHandlerPipelines = new Map<
    ScheduledMessagePaginatorsManagerEventType,
    EventHandlerPipeline<ScheduledMessagePaginatorsManagerEventHandlerContext>
  >();
  private queryErrorUnsubscribeByPaginator = new Map<
    ScheduledMessagePaginator,
    Unsubscribe
  >();

  public readonly client: StreamChat;
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

    this.installEventHandlers(eventHandlers);
  }

  public static getDefaultHandlers(): ScheduledMessagePaginatorsManagerEventHandlers {
    return copyEventHandlers(DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS);
  }

  get paginators() {
    return this.state.getLatestValue().paginators;
  }

  get isDisabled() {
    return this.state.getLatestValue().isDisabled;
  }

  get pipelines() {
    return this.eventHandlerPipelines;
  }

  private get eventHandlerContext(): ScheduledMessagePaginatorsManagerEventHandlerContext {
    return { scheduledMessagePaginators: this };
  }

  private installEventHandlers(handlers: ScheduledMessagePaginatorsManagerEventHandlers) {
    for (const [eventType, eventHandlers] of Object.entries(handlers)) {
      if (eventHandlers) this.ensurePipeline(eventType).replaceAll(eventHandlers);
    }
  }

  private watchQueryErrors(paginator: ScheduledMessagePaginator) {
    if (this.queryErrorUnsubscribeByPaginator.has(paginator)) return;

    const unsubscribe = paginator.state.subscribeWithSelector(
      ({ lastQueryError }) => ({ lastQueryError }),
      this.updateIsDisabled,
    );

    this.queryErrorUnsubscribeByPaginator.set(paginator, unsubscribe);
  }

  private unwatchQueryErrors(paginator: ScheduledMessagePaginator) {
    this.queryErrorUnsubscribeByPaginator.get(paginator)?.();
    this.queryErrorUnsubscribeByPaginator.delete(paginator);
    this.updateIsDisabled();
  }

  private updateIsDisabled = () => {
    const isDisabled = this.paginators.some(({ lastQueryError }) =>
      isDisabledError(lastQueryError),
    );

    this.state.partialNext({ isDisabled });
  };

  public ensurePipeline(eventType: ScheduledMessagePaginatorsManagerEventType) {
    const existingPipeline = this.eventHandlerPipelines.get(eventType);
    if (existingPipeline) return existingPipeline;

    const pipeline =
      new EventHandlerPipeline<ScheduledMessagePaginatorsManagerEventHandlerContext>({
        id: `${MANAGER_NAME}:${eventType}`,
      });
    this.eventHandlerPipelines.set(eventType, pipeline);

    return pipeline;
  }

  public addEventHandler({
    eventType,
    ...payload
  }: AddScheduledMessageEventHandlerParams): Unsubscribe {
    return this.ensurePipeline(eventType).insert(payload);
  }

  public setEventHandlers({
    eventType,
    handlers,
  }: SetScheduledMessageEventHandlersParams) {
    return this.ensurePipeline(eventType).replaceAll(handlers);
  }

  public removeEventHandlers({
    eventType,
    handlers,
  }: RemoveScheduledMessageEventHandlersParams) {
    const pipeline = this.eventHandlerPipelines.get(eventType);
    handlers.forEach((params) => pipeline?.remove(params));
  }

  public getPaginatorById(id: string): ScheduledMessagePaginator | undefined {
    return this.paginators.find((paginator) => paginator.id === id);
  }

  public setPaginators(paginators: ScheduledMessagePaginator[]) {
    const nextPaginators = dedupeById(paginators);
    const currentPaginators = this.paginators;
    if (sameOrder(currentPaginators, nextPaginators)) return;

    const detached = currentPaginators.filter(
      (paginator) => !nextPaginators.includes(paginator),
    );
    const attached = nextPaginators.filter(
      (paginator) => !currentPaginators.includes(paginator),
    );

    this.state.partialNext({ paginators: nextPaginators });

    detached.forEach((paginator) => {
      this.unwatchQueryErrors(paginator);
      paginator.cancelScheduledQuery();
    });
    attached.forEach((paginator) => this.watchQueryErrors(paginator));
  }

  public clearPaginators(): ScheduledMessagePaginator[] {
    const cleared = this.paginators;
    this.setPaginators([]);
    return cleared;
  }

  public insertPaginator({
    index,
    paginator,
  }: {
    paginator: ScheduledMessagePaginator;
    index?: number;
  }) {
    const paginators = this.paginators.filter(({ id }) => id !== paginator.id);
    const validIndex = Math.max(
      0,
      Math.min(index ?? paginators.length, paginators.length),
    );
    paginators.splice(validIndex, 0, paginator);
    this.setPaginators(paginators);
  }

  public removePaginator(
    paginatorOrId: ScheduledMessagePaginator | string,
  ): ScheduledMessagePaginator | undefined {
    const id = typeof paginatorOrId === 'string' ? paginatorOrId : paginatorOrId.id;
    const removed = this.getPaginatorById(id);
    if (!removed) return undefined;
    this.setPaginators(this.paginators.filter((paginator) => paginator !== removed));
    return removed;
  }

  public resetPaginatorStates() {
    this.paginators.forEach((paginator) => {
      paginator.cancelScheduledQuery();
      paginator.resetState();
    });
    this.state.partialNext({ isDisabled: false });
  }

  public ingest = (scheduledMessage: ScheduledMessageResponse) => {
    this.paginators.forEach((paginator) => paginator.ingestItem(scheduledMessage));
  };

  public update = (scheduledMessage: ScheduledMessageResponse) => {
    this.paginators.forEach((paginator) => paginator.updateItem(scheduledMessage));
  };

  public recover = async () => {
    const loadedPaginators = this.paginators.filter(({ hasLoadedPage }) => hasLoadedPage);

    await Promise.allSettled(loadedPaginators.map((paginator) => paginator.reload()));
  };

  /**
   * Starts syncing the registered lists with the client's WS events. Nothing keeps them in sync
   * until this is called, so an integration has to call it once a user is connected and call the
   * returned unsubscribe (or {@link unregisterSubscriptions}) on teardown. The Stream UI SDKs do
   * this for you; a pure-LLC integration must do it itself. Ref-counted, so several holders can
   * share one manager and only the last unsubscribe tears the subscriptions down.
   */
  public registerSubscriptions(): Unsubscribe {
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
