import { isLocalUploadAttachment } from './attachmentIdentity';

import type { Attachment } from '../types';
import type { LocalAttachment } from './types';

// Accessors reading values off an attachment payload — as opposed to `attachmentIdentity`, which
// answers what kind of attachment it is. Each exists because the answer is not a plain field read.

/**
 * The URL to render an attachment from, falling back to the local blob preview while its upload is
 * in flight. Lives here because the preview is this package's: created by `AttachmentManager`,
 * revoked by `settlePendingAttachmentUploads`.
 */
export const getAttachmentPreviewUrl = (
  attachment?: Attachment | LocalAttachment,
  ...urls: (string | undefined)[]
): string | undefined => {
  const resolved = urls.find(Boolean);
  if (resolved) return resolved;

  return isLocalUploadAttachment(attachment)
    ? attachment.localMetadata.previewUri
    : undefined;
};

/**
 * An attachment's declared file size. v10 moved these fields under `attachment.custom`; the flat
 * one remains a fallback for older or hand-built payloads. Where the field lives is this package's
 * schema knowledge, not a UI SDK's.
 */
export const resolveAttachmentFileSize = (attachment?: {
  custom?: { file_size?: number | string } | null;
  file_size?: number | string;
}): number | string | undefined => attachment?.custom?.file_size ?? attachment?.file_size;

/**
 * Size in bytes, preferring the held `File` — during an upload that is the only exact figure,
 * since `file_size` may be absent until the server answers.
 */
export const resolveAttachmentFullByteSize = (attachment?: {
  custom?: { file_size?: number | string } | null;
  file_size?: number | string;
  localMetadata?: { file?: { size?: unknown } } | null;
}): number | undefined => {
  const fromFile = attachment?.localMetadata?.file?.size;
  if (typeof fromFile === 'number' && Number.isFinite(fromFile) && fromFile >= 0) {
    return fromFile;
  }

  const raw = resolveAttachmentFileSize(attachment);
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return undefined;
};
