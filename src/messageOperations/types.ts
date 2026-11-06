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
import type { QueueableType } from '../offline-support/types';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';

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

/** What an operation sends when nothing replaces it: the HTTP request, through the offline queue. */
export type DefaultOperationRequest<K extends OperationKind> = (
  params: OperationParams<K>,
) => Promise<OperationResponse>;

/**
 * Replaces an operation's request. Call `defaultRequest` (with the params as given, or changed) to
 * send it the default way, offline queueing included.
 */
export type OperationRequestFn<K extends OperationKind> = (
  params: OperationParams<K>,
  defaultRequest: DefaultOperationRequest<K>,
) => Promise<OperationResponse>;

export type MessageOperationsHandlers = {
  delete?: OperationRequestFn<'delete'>;
  send?: OperationRequestFn<'send'>;
  retry?: OperationRequestFn<'retry'>;
  update?: OperationRequestFn<'update'>;
};

export type MessageOperationsContext = {
  /** The channel every request and offline-DB row belongs to. A `Thread` passes its parent channel. */
  channel: Channel;
  ingest: (m: LocalMessage) => void;
  get: (id: string) => LocalMessage | undefined;
  /** Drops the message from local state: a hard delete removes it rather than marking it `deleted`. */
  remove: (id: string) => void;
  /** Mirrors a message into the offline DB. Fire-and-forget: a failed write never fails the operation. */
  persist: (m: LocalMessage) => void;
  /** Removes a message's offline-DB row (the hard-delete counterpart of {@link persist}). */
  purge: (id: string) => void;
  /**
   * Whether this message's mutation sits in the offline queue waiting to be replayed, read from the
   * queue rather than inferred from the error ({@link isQueuedForReplay}). A queued mutation is pending,
   * not failed: the optimistic state stays as it is. Reactions use the same predicate.
   */
  isQueued: (messageId: string, types: readonly QueueableType[]) => Promise<boolean>;

  normalizeOutgoingMessage?: (m: MessageRequest) => MessageRequest;

  /** Runs first on every send (not a retry). This is where the typing indicator is stopped. */
  beforeSend?: () => void;

  /**
   * Lets the owner serialize requests: the server dates a message on arrival, so a short text sent after
   * a photo would otherwise be dated first. Wraps the request only; call it once and return its result.
   */
  sequenceRequests?: <T>(kind: OperationKind, request: () => Promise<T>) => Promise<T>;

  /**
   * Resolves any attachment upload still in flight, returning the attachments with their URLs written
   * on. Only reachable with {@link AttachmentManagerConfig.pendingUploadsEnabled} on.
   */
  settlePendingUploads?: (
    attachments: NonNullable<LocalMessage['attachments']>,
  ) => Promise<{
    /**
     * The same list, with each resolved upload replaced by its uploaded form (URL written,
     * `localMetadata` dropped). Unresolved ones come back untouched, so on failure this is a mix. The
     * same reference when nothing was pending.
     */
    attachments: NonNullable<LocalMessage['attachments']>;
    /** Set if any upload failed. The ones that did resolve are still kept above. */
    failureReason?: unknown;
  }>;

  /**
   * The HTTP requests, through the offline queue, used when no {@link handlers} entry replaces them.
   * A replaced request still reaches them through its `defaultRequest`.
   */
  defaults: {
    delete: (id: string, o?: DeleteMessageOptions) => Promise<OperationResponse>;
    send: (m: MessageRequest, o?: SendMessageOptions) => Promise<OperationResponse>;
    update: (m: LocalMessage, o?: UpdateMessageOptions) => Promise<OperationResponse>;
    sendReaction: StreamChat['sendReaction'];
    deleteReaction: StreamChat['deleteReaction'];
  };

  handlers: () => MessageOperationsHandlers;
};
