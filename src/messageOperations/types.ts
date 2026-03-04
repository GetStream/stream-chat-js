import type {
  DeleteMessageOptions,
  LocalMessage,
  Message,
  MessageResponse,
  SendMessageAPIResponse,
  SendMessageOptions,
  UpdateMessageAPIResponse,
  UpdateMessageOptions,
} from '../types';

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
} & (K extends 'send' | 'retry' ? { message?: Message } : {});

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
  get: (id: string) => LocalMessage | undefined;

  normalizeOutgoingMessage?: (m: Message) => Message;

  defaults: {
    delete: (id: string, o?: DeleteMessageOptions) => Promise<OperationResponse>;
    send: (m: Message, o?: SendMessageOptions) => Promise<OperationResponse>;
    update: (m: LocalMessage, o?: UpdateMessageOptions) => Promise<OperationResponse>;
  };

  handlers: () => MessageOperationsHandlers;
};
