import { withoutConcurrency } from '../utils/concurrency';

import type { MessageComposer } from '../messageComposer/messageComposer';
import type { OperationKind } from './types';

/**
 * The ordering policy `Channel` and `Thread` both install as
 * {@link MessageOperationsContext.sequenceRequests}.
 *
 * Sends and retries wait for each other while the composer may hand over still-uploading files,
 * so a short text sent after a photo is not dated first. Edits and deletes never wait. Shared so
 * both owners keep the same rule; the tag differs, a thread reply being tagged by its channel.
 */
export const keepSendOrderWhilePendingUploadsAllowed = <T>({
  channelCid,
  composer,
  kind,
  request,
}: {
  /** Scope of the ordering — a thread passes its channel's cid. */
  channelCid: string;
  composer: MessageComposer;
  kind: OperationKind;
  request: () => Promise<T>;
}): Promise<T> =>
  (kind === 'send' || kind === 'retry') && composer.allowsPendingUploads
    ? withoutConcurrency(`stream-chat/send-message/${channelCid}`, request)
    : request();
