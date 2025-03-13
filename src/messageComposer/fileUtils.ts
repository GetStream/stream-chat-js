import type { LocalAttachment, LocalImageAttachment } from './types';
import type { Attachment, DefaultGenerics, ExtendableGenerics, UR } from '../types';

export const isBlobButNotFile = (obj: unknown): obj is Blob => obj instanceof Blob && !(obj instanceof File);

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
  return match && match[1];
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

export const generateFileName = (mimeType: string) =>
  `file_${new Date().toISOString()}.${getExtensionFromMimeType(mimeType)}`;

export const isImageFile = (fileLike: File | Blob) =>
  fileLike.type.startsWith('image/') && !fileLike.type.endsWith('.photoshop'); // photoshop files begin with 'image/'

export const getAttachmentTypeFromMimeType = (mimeType: string) => {
  if (mimeType.startsWith('image/') && !mimeType.endsWith('.photoshop')) return 'image';
  if (mimeType.includes('video/')) return 'video';
  if (mimeType.includes('audio/')) return 'audio';
  return 'file';
};

export const isFile = (fileLike: File | Blob): fileLike is File => !!(fileLike as File).lastModified;

export const isScrapedContent = <SCG extends ExtendableGenerics = DefaultGenerics>(attachment: Attachment<SCG>) =>
  attachment.og_scrape_url || attachment.title_link;

export const isUploadedImage = <SCG extends ExtendableGenerics = DefaultGenerics>(attachment: Attachment<SCG>) =>
  attachment.type === 'image' && !isScrapedContent(attachment);

export const isLocalAttachment = <SCG extends ExtendableGenerics = DefaultGenerics>(
  attachment: UR,
): attachment is LocalAttachment<SCG> => !!(attachment as LocalAttachment<SCG>).localMetadata?.id;

export const isLocalImageAttachment = <SCG extends ExtendableGenerics = DefaultGenerics>(
  attachment: Attachment<SCG> | LocalAttachment<SCG>,
): attachment is LocalImageAttachment<SCG> => isUploadedImage(attachment) && isLocalAttachment(attachment);
