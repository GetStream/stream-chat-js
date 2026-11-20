import { SCHEDULED_MESSAGE_STATUS } from './constants';
import type { ScheduledMessageResponse, ScheduledMessageStatus } from '../gen/models';

const REMOVED_STATUSES = new Set<ScheduledMessageStatus>([
  SCHEDULED_MESSAGE_STATUS.Canceled,
  SCHEDULED_MESSAGE_STATUS.Sent,
]);

const isSent = ({ status }: ScheduledMessageResponse) =>
  status === SCHEDULED_MESSAGE_STATUS.Sent;

/**
 * Sent or canceled: it leaves every list and becomes a tombstone. A sent ID never comes back; a
 * canceled one can be scheduled again. A deleted failed message arrives as canceled.
 */
export const isRemovedScheduledMessage = ({ status }: ScheduledMessageResponse) =>
  REMOVED_STATUSES.has(status);

/**
 * Whether `incoming` replaces the stored copy or tombstone. Sent is final; otherwise the later
 * `updated_at` (server clock) wins. A tie replaces, so `sending` ↔ `scheduled` from queries goes
 * through, except over a removal: a deleted failed message keeps its failure's `updated_at`.
 */
export const shouldReplaceScheduledMessage = (
  incoming: ScheduledMessageResponse,
  stored: ScheduledMessageResponse,
) => {
  if (isSent(stored)) return false;
  if (isSent(incoming)) return true;
  if (incoming.updated_at !== stored.updated_at) {
    return incoming.updated_at > stored.updated_at;
  }
  return !isRemovedScheduledMessage(stored);
};
