import type {
  DeleteMessageOptions,
  LocalMessage,
  MessageRequest,
  MessageResponse,
  SendMessageAPIResponse,
  SendMessageOptions,
  UpdateMessageAPIResponse,
  UpdateMessageOptions,
} from '../types';
import type { MessageEchoKind } from '../mutationEcho';
import type { MessageOperationStatePolicyContext } from './MessageOperationStatePolicy';
import type { QueueableType } from '../offline-support/types';

export type OperationKind = 'send' | 'retry' | 'update' | 'delete';

export type MessageOperationSpec = {
  send: {
    options: SendMessageOptions;
    requestResult: SendMessageAPIResponse;
  };
  retry: {
    options: SendMessageOptions;
    requestResult: SendMessageAPIResponse;
  };
  update: {
    options: UpdateMessageOptions;
    requestResult: UpdateMessageAPIResponse;
  };
  delete: {
    options: DeleteMessageOptions;
    requestResult: { message: MessageResponse };
  };
};

export type OperationParams<K extends OperationKind> = {
  localMessage: LocalMessage;
  options?: MessageOperationSpec[K]['options'];
} & (K extends 'send' | 'retry' ? { message?: MessageRequest } : {});

export type OperationResponse = { message: MessageResponse };

export type OperationRequestFn<K extends OperationKind> = (
  params: OperationParams<K>,
) => Promise<OperationResponse>;

export type MessageOperationsHandlers = {
  delete?: OperationRequestFn<'delete'>;
  send?: OperationRequestFn<'send'>;
  retry?: OperationRequestFn<'retry'>;
  update?: OperationRequestFn<'update'>;
};

export type MessageOperationsContext = {
  ingest: (m: LocalMessage) => void;
  /**
   * Records that the server copy {@link ingest} just wrote was applied, so its WS echo can be skipped.
   * Supplied by the owner, which is the only thing that knows which collections its `ingest` reached.
   * See {@link MessageOperationStatePolicyContext.recordApplied}.
   */
  recordApplied?: (m: LocalMessage, kind: MessageEchoKind) => void;
  /** Removal counterpart of {@link recordApplied}, for a hard delete. */
  recordRemoved?: (m: LocalMessage) => void;
  /**
   * Whether the WS event this response is the twin of has already applied this exact version — the
   * read half of {@link recordApplied}, supplied by the same owner so the two agree on which
   * collections are involved.
   *
   * Must answer for **every** collection the owner's `ingest` writes, and only say yes when all of
   * them are covered: a partially-armed write still has work to do, and skipping it would leave a
   * collection the WS event never reached.
   */
  wasApplied?: (m: LocalMessage, kind: MessageEchoKind) => boolean;
  /** Removal counterpart of {@link wasApplied}, for a hard delete. */
  wasRemovalApplied?: (m: LocalMessage) => boolean;
  /**
   * Marks an operation as open on this message id and returns its disposer, so the WS handlers know
   * an event about it may have an HTTP twin worth arming for. See `MutationEcho.trackRequest`.
   */
  trackRequest?: (messageId: string) => () => void;
  get: (id: string) => LocalMessage | undefined;
  /**
   * Drops the message from local state entirely. Needed by the delete lifecycle: a hard delete removes
   * the message rather than marking it `deleted` (mirroring the `message.deleted` WS handler, which
   * branches on `event.hard_delete` the same way).
   */
  remove: (id: string) => void;
  /**
   * Mirrors a message into the offline DB. Fire-and-forget: local state is the source of truth, so a
   * failed DB write must never fail the operation.
   */
  persist: (m: LocalMessage) => void;
  /** Removes a message's offline-DB row (the hard-delete counterpart of {@link persist}). */
  purge: (id: string) => void;
  /**
   * Whether this message's mutation is sitting in the offline queue waiting to be replayed — read from
   * the queue, not inferred from the error ({@link isQueuedForReplay}). A queued mutation is pending,
   * not failed, so the optimistic state stays exactly as it is: no `failed` status, no error, no revert.
   * Reactions run the same predicate, which is what keeps the two from drifting.
   */
  isQueued: (messageId: string, types: readonly QueueableType[]) => Promise<boolean>;

  normalizeOutgoingMessage?: (m: MessageRequest) => MessageRequest;

  defaults: {
    delete: (id: string, o?: DeleteMessageOptions) => Promise<OperationResponse>;
    send: (m: MessageRequest, o?: SendMessageOptions) => Promise<OperationResponse>;
    update: (m: LocalMessage, o?: UpdateMessageOptions) => Promise<OperationResponse>;
  };

  handlers: () => MessageOperationsHandlers;
};
