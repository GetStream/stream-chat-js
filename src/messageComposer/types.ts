import type { Attachment, FileUploadConfig, UR, UserResponse } from '../types';
import type { SearchSource } from '../search_controller';

export type LocalAttachment =
  | AnyLocalAttachment
  | LocalUploadAttachment
  | LocalUploadAttachmentSeed;

export type LocalUploadAttachment =
  | LocalFileAttachment
  | LocalImageAttachment
  | LocalAudioAttachment
  | LocalVideoAttachment
  | LocalVoiceRecordingAttachment;

export type LocalUploadAttachmentSeed = LocalAttachmentCast<
  {
    type: string;
  },
  LocalAttachmentUploadMetadata
>;

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

export type VoiceRecordingAttachment = Attachment & {
  asset_url: string;
  type: 'voiceRecording';
  duration?: number;
  file_size?: number;
  mime_type?: string;
  title?: string;
  waveform_data?: Array<number>;
};

type FileAttachment = Attachment & {
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

type ImageAttachment = Attachment & {
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
  file?: File;
  uploadPermissionCheck?: UploadPermissionCheckResult; // added new
  uploadState?: AttachmentLoadingState;
};

export type LocalImageAttachmentUploadMetadata = LocalAttachmentUploadMetadata & {
  previewUri?: string;
};

export type AttachmentLoadingState = 'uploading' | 'finished' | 'failed' | 'blocked';

export type UploadPermissionCheckResult = {
  uploadBlocked: boolean;
  reason?: keyof FileUploadConfig;
};

export type FileLike = File | Blob;

type Id = string;
export type MentionedUserMap = Map<Id, UserResponse>;
export type TextSelection = { end: number; start: number };
export type TextComposerSuggestion<T = UR> = T & {
  id: string;
};

export type Suggestions = {
  query: string;
  searchSource: SearchSource<TextComposerSuggestion>; // we do not want to limit the use of SearchSources
  trigger: string;
};

export type TextComposerState = {
  mentionedUsers: UserResponse[];
  selection: TextSelection;
  text: string;
  suggestions?: Suggestions;
};
