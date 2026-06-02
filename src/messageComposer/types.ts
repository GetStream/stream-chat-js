import type { CustomAttachmentData } from '../custom_types';
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
  type: 'voiceRecording';
  custom: CustomAttachmentData & {
    duration?: number;
    waveform_data?: Array<number>;
  };
};

export type FileAttachment = Attachment & {
  type: 'file';
};

export type AudioAttachment = Attachment & {
  type: 'audio';
};

export type VideoAttachment = Attachment & {
  type: 'video';
};

export type ImageAttachment = Attachment & {
  type: 'image';
};

export type GiphyAttachment = Attachment & {
  type: 'giphy';
};

export type BaseLocalAttachmentMetadata = {
  id: string;
};

export type LocalAttachmentUploadMetadata = {
  file: File | FileReference;
  /**
   * Local preview URI, typically a Blob URL from `URL.createObjectURL(file)`
   * or (for React Native `FileReference`) the provided `uri`.
   */
  previewUri?: string;
  uploadState: AttachmentLoadingState;
  uploadPermissionCheck?: UploadPermissionCheckResult; // added new
  /** 0–100 while uploading when progress tracking is enabled; undefined otherwise or when indeterminate */
  uploadProgress?: number;
};

export type LocalImageAttachmentUploadMetadata = LocalAttachmentUploadMetadata & {
  /**
   * @deprecated `previewUri` is now available on `LocalAttachmentUploadMetadata`.
   */
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
