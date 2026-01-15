import type {
  APIErrorResponse,
  ErrorFromResponse,
  LocalMessage,
  MessageResponse,
} from '../types';
import { formatMessage } from '../utils';

export type MessageOperationStatePolicyContext = {
  ingest: (m: LocalMessage) => void;
  get: (id: string) => LocalMessage | undefined;
};

const parseError = (error: unknown): ErrorFromResponse<APIErrorResponse> => {
  const stringError = JSON.stringify(error);
  return (
    stringError ? JSON.parse(stringError) : {}
  ) as ErrorFromResponse<APIErrorResponse>;
};

const isAlreadyExistsError = (
  error: unknown,
  parsed: ErrorFromResponse<APIErrorResponse>,
) =>
  parsed.code === 4 && error instanceof Error && error.message.includes('already exists');

export class MessageOperationStatePolicy {
  private ctx: MessageOperationStatePolicyContext;

  constructor(ctx: MessageOperationStatePolicyContext) {
    this.ctx = ctx;
  }

  optimistic(localMessage: LocalMessage) {
    this.ctx.ingest({
      ...localMessage,
      error: undefined,
      status:
        !localMessage.status || localMessage.status === 'failed'
          ? 'sending'
          : localMessage.status,
    });
  }

  success({
    messageFromResponse,
    messageId,
  }: {
    messageFromResponse: MessageResponse;
    messageId: string;
  }) {
    const formatted = formatMessage({ ...messageFromResponse, status: 'received' });
    const existing = this.ctx.get(messageId);

    if (
      !existing ||
      existing.updated_at.getTime() < formatted.updated_at.getTime() ||
      existing.status === 'sending'
    ) {
      this.ctx.ingest(formatted);
    }
  }

  failure({
    error,
    localMessage,
    messageId,
  }: {
    error: unknown;
    localMessage: LocalMessage;
    messageId: string;
  }) {
    const parsed = parseError(error);

    if (isAlreadyExistsError(error, parsed)) {
      const existing = this.ctx.get(messageId);
      if (existing?.status === 'sending') {
        this.ctx.ingest({ ...localMessage, status: 'received' });
      }
      return;
    }

    this.ctx.ingest({ ...localMessage, status: 'failed', error: parsed });
  }
}
