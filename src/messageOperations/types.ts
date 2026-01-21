import type {
  LocalMessage,
  Message,
  MessageResponse,
  SendMessageAPIResponse,
  SendMessageOptions,
  UpdateMessageAPIResponse,
  UpdateMessageOptions,
} from '../types';

export type OperationKind = 'send' | 'retry' | 'update';

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
};

export type OperationParams<K extends OperationKind> = {
  localMessage: LocalMessage;
  options?: MessageOperationSpec[K]['options'];
} & (K extends 'update' ? {} : { message?: Message });

export type OperationResponse = { message: MessageResponse };

export type OperationRequestFn<K extends OperationKind> = (
  params: OperationParams<K>,
) => Promise<OperationResponse>;

export type MessageOperationsHandlers = {
  send?: OperationRequestFn<'send'>;
  retry?: OperationRequestFn<'retry'>;
  update?: OperationRequestFn<'update'>;
};

export type MessageOperationsContext = {
  ingest: (m: LocalMessage) => void;
  get: (id: string) => LocalMessage | undefined;

  normalizeOutgoingMessage?: (m: Message) => Message;

  defaults: {
    send: (m: Message, o?: SendMessageOptions) => Promise<OperationResponse>;
    update: (m: LocalMessage, o?: UpdateMessageOptions) => Promise<OperationResponse>;
  };

  handlers: () => MessageOperationsHandlers;
};
