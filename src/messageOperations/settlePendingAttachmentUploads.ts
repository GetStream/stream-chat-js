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

  // The message has owned this preview since the composition was handed over — see
  // `createPostUploadAttachmentEnrichmentMiddleware`, which stops revoking once the composer
  // no longer holds the attachment.
  const { previewUri } = attachment.localMetadata;
  if (previewUri?.startsWith('blob:')) URL.revokeObjectURL?.(previewUri);

  // `localMetadata` is dropped, not read - the attachment leaves here as a plain server payload.
  const { localMetadata: _localMetadata, ...rest } = enriched;
  return rest;
};

/**
 * Settles the uploads of any attachment that is still in flight, and reports the outcome.
 *
 * A message only ever reaches the send path with an unresolved attachment when
 * {@link AttachmentManagerConfig.pendingUploadsEnabled} is on — otherwise the composition
 * middleware discards such a composition instead. {@link UploadManager.upload} is idempotent by
 * `localMetadata.id`, so this awaits the request the composer already started rather than
 * starting a second one; an attachment whose upload never started (a retry, an offline replay)
 * is uploaded here for the first time.
 *
 * An upload that already `failed` is retried here rather than dropped — offline is the case that
 * needs it, where the first attempt could not have succeeded. `blocked` is left alone: the
 * server's upload configuration refused it, so no retry can settle it.
 *
 * Resolved attachments come back carrying their URL and **without** `localMetadata`, and their
 * local preview is revoked. Failed ones are returned untouched, `localMetadata` and all, so a
 * retry re-uploads only what is still missing.
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

    // Deliberately `allSettled`, and the resolved URLs above are kept even though the message as
    // a whole now fails: a retry then only re-uploads what did not make it.
    if (!failureReason) {
      failureReason =
        result.status === 'rejected'
          ? result.reason
          : new Error('Attachment upload returned no result');
    }
  });

  return { attachments: nextAttachments, failureReason };
};
