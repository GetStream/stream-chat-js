import { isLocalUploadAttachment } from './attachmentIdentity';

import type { Attachment } from '../types';
import type { LocalAttachment } from './types';

/** The first truthy URL, else the local preview URL while the upload is in flight. */
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

/** The declared file size: `custom.file_size`, falling back to a flat `file_size`. */
export const resolveAttachmentFileSize = (attachment?: {
  custom?: { file_size?: number | string } | null;
  file_size?: number | string;
}): number | string | undefined => attachment?.custom?.file_size ?? attachment?.file_size;

/** Size in bytes, preferring the held `File` (`file_size` may be absent until the server answers). */
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
