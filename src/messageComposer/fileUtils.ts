import type { Attachment } from '../types';
import { generateUUIDv4 } from '../utils';
import { isLocalAttachment } from './attachmentIdentity';
import type {
  BaseLocalAttachmentMetadata,
  FileLike,
  FileReference,
  LocalAttachment,
} from './types';

export const isFile = (fileLike: FileReference | File | Blob): fileLike is File =>
  !!(fileLike as File).lastModified && !('uri' in fileLike);

export const isFileList = (obj: unknown): obj is FileList => {
  if (obj === null || obj === undefined) return false;
  if (typeof obj !== 'object') return false;

  return (
    (typeof FileList !== 'undefined' && (obj as object) instanceof FileList) ||
    ('item' in obj && 'length' in obj && !Array.isArray(obj))
  );
};

export const isBlobButNotFile = (obj: unknown): obj is Blob =>
  obj instanceof Blob && !(obj instanceof File);

export const isFileReference = (obj: FileReference | FileLike): obj is FileReference =>
  obj !== null &&
  typeof obj === 'object' &&
  !isFile(obj) &&
  !isBlobButNotFile(obj) &&
  typeof obj.name === 'string' &&
  typeof obj.uri === 'string' &&
  typeof obj.size === 'number' &&
  typeof obj.type === 'string';

export const createFileFromBlobs = ({
  blobsArray,
  fileName,
  mimeType,
}: {
  blobsArray: Blob[];
  fileName: string;
  mimeType: string;
}) => {
  const concatenatedBlob = new Blob(blobsArray, { type: mimeType });
  return new File([concatenatedBlob], fileName, { type: concatenatedBlob.type });
};

export const getExtensionFromMimeType = (mimeType: string) => {
  const match = mimeType.match(/\/([^/;]+)/);
  return match?.[1];
};

export const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = () => {
      resolve(fileReader.result as ArrayBuffer);
    };

    fileReader.onerror = () => {
      reject(fileReader.error);
    };

    fileReader.readAsArrayBuffer(file);
  });

export const generateFileName = (mimeType: string) => {
  const extension = getExtensionFromMimeType(mimeType);
  return `file_${new Date().toISOString()}${extension ? '.' + extension : ''}`;
};

export const isImageFile = (fileLike: FileReference | FileLike) => {
  const mimeType = fileLike.type;
  return mimeType.startsWith('image/') && !mimeType.endsWith('.photoshop'); // photoshop files begin with 'image/'
};

export const getAttachmentTypeFromMimeType = (mimeType: string) => {
  if (mimeType.startsWith('image/') && !mimeType.endsWith('.photoshop')) return 'image';
  if (mimeType.includes('video/')) return 'video';
  if (mimeType.includes('audio/')) return 'audio';
  return 'file';
};

export const ensureIsLocalAttachment = (
  attachment: Attachment | LocalAttachment,
): LocalAttachment | null => {
  if (!attachment) return null;
  if (isLocalAttachment(attachment)) {
    return attachment;
  }
  // local is considered local only if localMetadata has `id` so this is to doublecheck
  const { localMetadata, ...rest } = attachment as LocalAttachment;
  return {
    localMetadata: {
      ...(localMetadata ?? {}),
      id: (localMetadata as BaseLocalAttachmentMetadata)?.id || generateUUIDv4(),
    },
    ...rest,
  };
};
