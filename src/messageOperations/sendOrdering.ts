import { withoutConcurrency } from '../utils/concurrency';

import type { MessageComposer } from '../messageComposer/messageComposer';
import type { OperationKind } from './types';

/**
 * The {@link MessageOperationsContext.sequenceRequests} policy of `Channel` and `Thread`. Sends and
 * retries wait for each other while the composer may hand over still-uploading files, so a short text
 * sent after a photo is not dated first. Edits and deletes never wait.
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
  kind: OperationKind;
  request: () => Promise<T>;
}): Promise<T> =>
  (kind === 'send' || kind === 'retry') && composer.allowsPendingUploads
    ? withoutConcurrency(`stream-chat/send-message/${channelCid}`, request)
    : request();
