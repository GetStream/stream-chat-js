import { StateStore } from '@stream-io/state-store';
import { copyEventHandlers, PaginatorsManager } from '../pagination/PaginatorsManager';
import { ScheduledMessageErrorReason } from './constants';
import { getScheduledMessageErrorReason } from './errors';
import { DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS } from './eventHandlers';
import type { Unsubscribe } from '@stream-io/state-store';
import type { ScheduledMessageResponse } from '../gen/models';
import type { ScheduledMessagePaginator } from '../pagination/paginators/ScheduledMessagePaginator';
import type {
  ScheduledMessagePaginatorsManagerEventHandlerContext,
  ScheduledMessagePaginatorsManagerEventHandlers,
  ScheduledMessagePaginatorsManagerOptions,
  ScheduledMessagePaginatorsManagerState,
} from './types';

const isDisabledError = (error: Error | undefined) =>
  !!error &&
  getScheduledMessageErrorReason(error) === ScheduledMessageErrorReason.Disabled;

const createInitialState = (): ScheduledMessagePaginatorsManagerState => ({
  isDisabled: false,
  paginators: [],
});

export class ScheduledMessagePaginatorsManager extends PaginatorsManager<
  ScheduledMessagePaginator,
  ScheduledMessagePaginatorsManagerEventHandlerContext
> {
  public state: StateStore<ScheduledMessagePaginatorsManagerState>;

  protected readonly managerName = 'ScheduledMessagePaginatorsManager';
  private queryErrorUnsubscribeByPaginator = new Map<
    ScheduledMessagePaginator,
    Unsubscribe
  >();

  constructor({
    client,
    eventHandlers = ScheduledMessagePaginatorsManager.getDefaultHandlers(),
  }: ScheduledMessagePaginatorsManagerOptions) {
    super(client);

    this.state = new StateStore<ScheduledMessagePaginatorsManagerState>(
      createInitialState(),
    );

    this.installEventHandlers(eventHandlers);
  }

  get paginators() {
    return this.state.getLatestValue().paginators;
  }

  get isDisabled() {
    return this.state.getLatestValue().isDisabled;
  }

  public static getDefaultHandlers(): ScheduledMessagePaginatorsManagerEventHandlers {
    return copyEventHandlers(DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS);
  }

  protected get eventHandlerContext(): ScheduledMessagePaginatorsManagerEventHandlerContext {
    return { scheduledMessagePaginators: this };
  }

  protected writePaginators(paginators: ScheduledMessagePaginator[]) {
    this.state.partialNext({ paginators });
  }

  protected onPaginatorAttached(paginator: ScheduledMessagePaginator) {
    if (this.queryErrorUnsubscribeByPaginator.has(paginator)) return;

    const unsubscribe = paginator.state.subscribeWithSelector(
      ({ lastQueryError }) => ({ lastQueryError }),
      this.updateIsDisabled,
    );

    this.queryErrorUnsubscribeByPaginator.set(paginator, unsubscribe);
  }

  protected onPaginatorDetached(paginator: ScheduledMessagePaginator) {
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

  public ingest = (scheduledMessage: ScheduledMessageResponse) => {
    this.paginators.forEach((paginator) => paginator.ingestItem(scheduledMessage));
  };

  public recover = async () => {
    const loadedPaginators = this.paginators.filter(({ hasLoadedPage }) => hasLoadedPage);

    await Promise.allSettled(loadedPaginators.map((paginator) => paginator.reload()));
  };

  public resetPaginatorStates() {
    super.resetPaginatorStates();
    this.state.partialNext({ isDisabled: false });
  }
}
