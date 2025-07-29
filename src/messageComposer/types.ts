import type { Attachment, FileUploadConfig } from '../types';

export type LocalAttachment = AnyLocalAttachment | LocalUploadAttachment;

export type LocalUploadAttachment =
  | LocalFileAttachment
  | LocalImageAttachment
  | LocalAudioAttachment
  | LocalVideoAttachment
  | LocalVoiceRecordingAttachment;

export type LocalVoiceRecordingAttachment<CustomLocalMetadata = Record<string, unknown>> =
  LocalAttachmentCast<
    VoiceRecordingAttachment,
    LocalAttachmentUploadMetadata & CustomLocalMetadata
  >;

export type LocalAudioAttachment<CustomLocalMetadata = Record<string, unknown>> =
  LocalAttachmentCast<
    AudioAttachment,
    LocalAttachmentUploadMetadata & CustomLocalMetadata
  >;

export type LocalVideoAttachment<CustomLocalMetadata = Record<string, unknown>> =
  LocalAttachmentCast<
    VideoAttachment,
    LocalAttachmentUploadMetadata & CustomLocalMetadata
  >;

export type LocalImageAttachment<CustomLocalMetadata = Record<string, unknown>> =
  LocalAttachmentCast<
    ImageAttachment,
    LocalImageAttachmentUploadMetadata & CustomLocalMetadata
  >;

export type LocalFileAttachment<CustomLocalMetadata = Record<string, unknown>> =
  LocalAttachmentCast<
    FileAttachment,
    LocalAttachmentUploadMetadata & CustomLocalMetadata
  >;

export type AnyLocalAttachment<CustomLocalMetadata = Record<string, unknown>> =
  LocalAttachmentCast<Attachment, LocalAttachmentMetadata<CustomLocalMetadata>>;

export type LocalAttachmentCast<A, L = Record<string, unknown>> = A & {
  localMetadata: L & BaseLocalAttachmentMetadata;
};

export type LocalAttachmentMetadata<CustomLocalMetadata = Record<string, unknown>> =
  CustomLocalMetadata & BaseLocalAttachmentMetadata & LocalImageAttachmentUploadMetadata;

export type UploadedAttachment =
  | AudioAttachment
  | FileAttachment
  | ImageAttachment
  | VideoAttachment
  | VoiceRecordingAttachment;

export type VoiceRecordingAttachment = Attachment & {
  asset_url: string;
  type: 'voiceRecording';
  duration?: number;
  file_size?: number;
  mime_type?: string;
  title?: string;
  waveform_data?: Array<number>;
};

export type FileAttachment = Attachment & {
  type: 'file';
  asset_url?: string;
  file_size?: number;
  mime_type?: string;
  title?: string;
};

export type AudioAttachment = Attachment & {
  type: 'audio';
  asset_url?: string;
  file_size?: number;
  mime_type?: string;
  title?: string;
};

export type VideoAttachment = Attachment & {
  type: 'video';
  asset_url?: string;
  file_size?: number;
  mime_type?: string;
  thumb_url?: string;
  title?: string;
};

export type ImageAttachment = Attachment & {
  type: 'image';
  fallback?: string;
  image_url?: string;
  original_height?: number;
  original_width?: number;
};

export type BaseLocalAttachmentMetadata = {
  id: string;
};

export type LocalAttachmentUploadMetadata = {
  file: File | FileReference;
  uploadState: AttachmentLoadingState;
  uploadPermissionCheck?: UploadPermissionCheckResult; // added new
};

export type LocalImageAttachmentUploadMetadata = LocalAttachmentUploadMetadata & {
  previewUri?: string;
};

export type LocalNotImageAttachment =
  | LocalFileAttachment
  | LocalAudioAttachment
  | LocalVideoAttachment
  | LocalVoiceRecordingAttachment;

export type AttachmentLoadingState =
  | 'uploading'
  | 'finished'
  | 'failed'
  | 'blocked'
  | 'pending';

export type UploadPermissionCheckResult = {
  uploadBlocked: boolean;
  reason?: keyof FileUploadConfig;
};

export type FileLike = File | Blob;

// todo: make sure that RN SDK passes MIME type in the type field
export type FileReference = Pick<File, 'name' | 'size' | 'type'> & {
  uri: string;
  // For images
  height?: number;
  width?: number;

  // For voice recordings
  duration?: number;
  waveform_data?: number[];

  // This is specially needed for video in camera roll
  thumb_url?: string;
};
