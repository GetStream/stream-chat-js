import { withoutConcurrency } from '../utils/concurrency';

import type { MessageComposer } from '../messageComposer/messageComposer';
import type { SequencedOperationKind } from './types';

const SEND_ORDERED_KINDS: ReadonlySet<SequencedOperationKind> = new Set([
  'retry',
  'schedule',
  'send',
]);

/**
 * The {@link MessageOperationsContext.sequenceRequests} policy of `Channel` and `Thread`. Sends,
 * retries and schedules wait for each other while the composer may hand over still-uploading files, so
 * a short text sent after a photo is not dated first. Edits, deletes and the other scheduled-message
 * operations never wait.
 */
export const keepSendOrderWhilePendingUploadsAllowed = <T>({
  channelCid,
  composer,
  kind,
  request,
}: {
  /** Scope of the ordering: a thread passes its channel's cid. */
  channelCid: string;
  composer: MessageComposer;
  kind: SequencedOperationKind;
  request: () => Promise<T>;
}): Promise<T> =>
  SEND_ORDERED_KINDS.has(kind) && composer.allowsPendingUploads
    ? withoutConcurrency(`stream-chat/send-message/${channelCid}`, request)
    : request();
