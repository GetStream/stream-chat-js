import {
  isFailedUpload,
  isLocalImageAttachment,
  isPendingUpload,
} from '../messageComposer/attachmentIdentity';

import type { StreamChat } from '../client';
import type { LocalMessage } from '../types';
import type {
  LocalNotImageAttachment,
  LocalUploadAttachment,
} from '../messageComposer/types';
import type { MinimumUploadRequestResult } from '../messageComposer/configuration';

/** Writes the resolved URL onto the attachment and releases its local preview. */
const applyUploadResult = (
  attachment: LocalUploadAttachment,
  response: MinimumUploadRequestResult,
) => {
  const enriched: LocalUploadAttachment = { ...attachment };

  // Narrow on the copy, not the original, so the assignment type-checks.
  if (isLocalImageAttachment(enriched)) {
    enriched.image_url = response.file;
  } else {
    (enriched as LocalNotImageAttachment).asset_url = response.file;
  }
  if (response.thumb_url) {
    (enriched as LocalNotImageAttachment).thumb_url = response.thumb_url;
  }

  // The message owns this preview once the composition is handed over.
  const { previewUri } = attachment.localMetadata;
  if (previewUri?.startsWith('blob:')) URL.revokeObjectURL?.(previewUri);

  // `localMetadata` is dropped: the attachment leaves as a plain server payload.
  const { localMetadata: _localMetadata, ...rest } = enriched;
  return rest;
};

/**
 * Settles the uploads of attachments still in flight and reports the outcome. Unresolved attachments
 * only reach the send path when {@link AttachmentManagerConfig.pendingUploadsEnabled} is on.
 * {@link UploadManager.upload} is idempotent by `localMetadata.id`, so this awaits the composer's
 * request rather than starting a second one; an upload that never started (a retry, an offline replay)
 * starts here. A `failed` upload is retried, while `blocked` is left alone since no retry can settle it.
 *
 * Resolved attachments come back with their URL, without `localMetadata`, and with their local preview
 * revoked. Failed ones come back untouched, so a retry re-uploads only what is missing.
 */
export const settlePendingAttachmentUploads = async ({
  attachments,
  channelCid,
  client,
}: {
  attachments: NonNullable<LocalMessage['attachments']>;
  channelCid: string;
  client: StreamChat;
}): Promise<{
  attachments: NonNullable<LocalMessage['attachments']>;
  failureReason?: unknown;
}> => {
  const unsettledIndexes = attachments.reduce<number[]>((indexes, attachment, index) => {
    if (isPendingUpload(attachment) || isFailedUpload(attachment)) indexes.push(index);
    return indexes;
  }, []);

  if (!unsettledIndexes.length) return { attachments };

  const settled = await Promise.allSettled(
    unsettledIndexes.map((index) => {
      const { file, id } = (attachments[index] as LocalUploadAttachment).localMetadata;
      return client.uploadManager.upload({ channelCid, file, id });
    }),
  );

  const nextAttachments = [...attachments];
  let failureReason: unknown;

  settled.forEach((result, position) => {
    const index = unsettledIndexes[position];
    const attachment = nextAttachments[index] as LocalUploadAttachment;

    if (result.status === 'fulfilled' && result.value) {
      nextAttachments[index] = applyUploadResult(attachment, result.value);
      return;
    }

    // Resolved URLs above are kept even when the message fails: a retry re-uploads only the rest.
    if (!failureReason) {
      failureReason =
        result.status === 'rejected'
          ? result.reason
          : new Error('Attachment upload returned no result');
    }
  });

  return { attachments: nextAttachments, failureReason };
};
