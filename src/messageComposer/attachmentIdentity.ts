import type { Attachment } from '../types';
import type {
  AudioAttachment,
  FileAttachment,
  ImageAttachment,
  LocalAttachment,
  LocalAudioAttachment,
  LocalFileAttachment,
  LocalImageAttachment,
  LocalUploadAttachment,
  LocalVideoAttachment,
  LocalVoiceRecordingAttachment,
  UploadedAttachment,
  VideoAttachment,
  VoiceRecordingAttachment,
} from './types';

export const isScrapedContent = (attachment: Attachment) =>
  !!attachment?.og_scrape_url || !!attachment?.title_link;

export const isLocalAttachment = (attachment: unknown): attachment is LocalAttachment =>
  !!(attachment as LocalAttachment)?.localMetadata?.id;

export const isLocalUploadAttachment = (
  attachment: unknown,
): attachment is LocalUploadAttachment =>
  !!(attachment as LocalAttachment)?.localMetadata?.uploadState;

export const isFileAttachment = (
  attachment: Attachment | LocalAttachment,
  supportedVideoFormat: string[] = [],
): attachment is FileAttachment =>
  attachment.type === 'file' ||
  !!(
    attachment.mime_type &&
    supportedVideoFormat.indexOf(attachment.mime_type) === -1 &&
    attachment.type !== 'video'
  );

export const isLocalFileAttachment = (
  attachment: Attachment | LocalAttachment,
): attachment is LocalFileAttachment =>
  isFileAttachment(attachment) && isLocalAttachment(attachment);

export const isImageAttachment = (
  attachment: Attachment,
): attachment is ImageAttachment =>
  attachment.type === 'image' && !isScrapedContent(attachment);

export const isLocalImageAttachment = (
  attachment: Attachment | LocalAttachment,
): attachment is LocalImageAttachment =>
  isImageAttachment(attachment) && isLocalAttachment(attachment);

export const isAudioAttachment = (
  attachment: Attachment | LocalAttachment,
): attachment is AudioAttachment => attachment.type === 'audio';

export const isLocalAudioAttachment = (
  attachment: Attachment | LocalAttachment,
): attachment is LocalAudioAttachment =>
  isAudioAttachment(attachment) && isLocalAttachment(attachment);

export const isVoiceRecordingAttachment = (
  attachment: Attachment | LocalAttachment,
): attachment is VoiceRecordingAttachment => attachment.type === 'voiceRecording';

export const isLocalVoiceRecordingAttachment = (
  attachment: Attachment | LocalAttachment,
): attachment is LocalVoiceRecordingAttachment =>
  isVoiceRecordingAttachment(attachment) && isLocalAttachment(attachment);

export const isVideoAttachment = (
  attachment: Attachment | LocalAttachment,
  supportedVideoFormat: string[] = [],
): attachment is VideoAttachment =>
  attachment.type === 'video' ||
  !!(attachment.mime_type && supportedVideoFormat.indexOf(attachment.mime_type) !== -1);

export const isLocalVideoAttachment = (
  attachment: Attachment | LocalAttachment,
): attachment is LocalVideoAttachment =>
  isVideoAttachment(attachment) && isLocalAttachment(attachment);

export const isUploadedAttachment = (
  attachment: Attachment,
): attachment is UploadedAttachment =>
  isAudioAttachment(attachment) ||
  isFileAttachment(attachment) ||
  isImageAttachment(attachment) ||
  isVideoAttachment(attachment) ||
  isVoiceRecordingAttachment(attachment);
