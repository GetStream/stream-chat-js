import { SCHEDULED_MESSAGE_STATUS } from './constants';
import { isScheduledMessageNotFoundError } from './errors';
import type { ScheduledMessageResponse } from '../gen/models';

export type ScheduledMessageOperationKind = 'schedule' | 'update' | 'cancel' | 'sendNow';

export type ScheduledMessageStatePolicyContext = {
  ingest: (scheduledMessage: ScheduledMessageResponse) => void;
  get: (id: string) => ScheduledMessageResponse | undefined;
};

export class ScheduledMessageStatePolicy {
  private ctx: ScheduledMessageStatePolicyContext;

  constructor(ctx: ScheduledMessageStatePolicyContext) {
    this.ctx = ctx;
  }

  success(
    kind: ScheduledMessageOperationKind,
    scheduledMessage: ScheduledMessageResponse | undefined,
  ) {
    if (!scheduledMessage) return;

    if (kind === 'cancel') {
      this.ctx.ingest({ ...scheduledMessage, status: SCHEDULED_MESSAGE_STATUS.Canceled });
      return;
    }

    this.ctx.ingest(scheduledMessage);
  }

  failure(kind: ScheduledMessageOperationKind, id: string | undefined, error: unknown) {
    if (kind === 'schedule' || kind === 'sendNow') return;
    if (!id || !isScheduledMessageNotFoundError(error)) return;

    const stored = this.ctx.get(id);
    if (stored) {
      this.ctx.ingest({ ...stored, status: SCHEDULED_MESSAGE_STATUS.Canceled });
    }
  }
}
