import type {
  Attachment,
  CommandResponse,
  DefaultGenerics,
  ExtendableGenerics,
  FileUploadConfig, UR,
  UserResponse
} from '../types';
import { SearchSource } from '../search_controller';


export type LocalAttachment<SCG extends ExtendableGenerics = DefaultGenerics> =
  | AnyLocalAttachment<SCG>
  | LocalUploadAttachment<SCG>
  | LocalUploadAttachmentSeed;

export type LocalUploadAttachment<SCG extends ExtendableGenerics = DefaultGenerics> =
  | LocalFileAttachment<SCG>
  | LocalImageAttachment<SCG>
  | LocalAudioAttachment<SCG>
  | LocalVideoAttachment<SCG>
  | LocalVoiceRecordingAttachment<SCG>;

export type LocalUploadAttachmentSeed = LocalAttachmentCast<
  {
    type: string;
  },
  LocalAttachmentUploadMetadata
>;

export type LocalVoiceRecordingAttachment<
  SCG extends ExtendableGenerics = DefaultGenerics,
  CustomLocalMetadata = Record<string, unknown>
> = LocalAttachmentCast<VoiceRecordingAttachment<SCG>, LocalAttachmentUploadMetadata & CustomLocalMetadata>;

export type LocalAudioAttachment<
  SCG extends ExtendableGenerics = DefaultGenerics,
  CustomLocalMetadata = Record<string, unknown>
> = LocalAttachmentCast<AudioAttachment<SCG>, LocalAttachmentUploadMetadata & CustomLocalMetadata>;

export type LocalVideoAttachment<
  SCG extends ExtendableGenerics = DefaultGenerics,
  CustomLocalMetadata = Record<string, unknown>
> = LocalAttachmentCast<VideoAttachment<SCG>, LocalAttachmentUploadMetadata & CustomLocalMetadata>;

export type LocalImageAttachment<
  SCG extends ExtendableGenerics = DefaultGenerics,
  CustomLocalMetadata = Record<string, unknown>
> = LocalAttachmentCast<ImageAttachment<SCG>, LocalImageAttachmentUploadMetadata & CustomLocalMetadata>;

export type LocalFileAttachment<
  SCG extends ExtendableGenerics = DefaultGenerics,
  CustomLocalMetadata = Record<string, unknown>
> = LocalAttachmentCast<FileAttachment<SCG>, LocalAttachmentUploadMetadata & CustomLocalMetadata>;

export type AnyLocalAttachment<
  SCG extends ExtendableGenerics = DefaultGenerics,
  CustomLocalMetadata = Record<string, unknown>
> = LocalAttachmentCast<Attachment<SCG>, LocalAttachmentMetadata<CustomLocalMetadata>>;

export type LocalAttachmentCast<A, L = Record<string, unknown>> = A & {
  localMetadata: L & BaseLocalAttachmentMetadata;
};

export type LocalAttachmentMetadata<CustomLocalMetadata = Record<string, unknown>> = CustomLocalMetadata &
  BaseLocalAttachmentMetadata &
  LocalImageAttachmentUploadMetadata;

export type VoiceRecordingAttachment<SCG extends ExtendableGenerics = DefaultGenerics> = Attachment<SCG> & {
  asset_url: string;
  type: 'voiceRecording';
  duration?: number;
  file_size?: number;
  mime_type?: string;
  title?: string;
  waveform_data?: Array<number>;
};

type FileAttachment<SCG extends ExtendableGenerics = DefaultGenerics> = Attachment<SCG> & {
  type: 'file';
  asset_url?: string;
  file_size?: number;
  mime_type?: string;
  title?: string;
};

export type AudioAttachment<SCG extends ExtendableGenerics = DefaultGenerics> = Attachment<SCG> & {
  type: 'audio';
  asset_url?: string;
  file_size?: number;
  mime_type?: string;
  title?: string;
};

export type VideoAttachment<SCG extends ExtendableGenerics = DefaultGenerics> = Attachment<SCG> & {
  type: 'video';
  asset_url?: string;
  file_size?: number;
  mime_type?: string;
  thumb_url?: string;
  title?: string;
};

type ImageAttachment<SCG extends ExtendableGenerics = DefaultGenerics> = Attachment<SCG> & {
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

export type UploadPermissionCheckResult = { uploadBlocked: boolean; reason?: keyof FileUploadConfig };

export type FileLike = File | Blob;

type Id = string;
export type MentionedUserMap<SCG extends ExtendableGenerics = DefaultGenerics> = Map<Id, UserResponse<SCG>>;
export type TextSelection = { end: number; start: number };
export type TextComposerSuggestion<T = UR> = T & {
  id: string;
}

export type Suggestions = {
  query: string;
  searchSource: SearchSource<TextComposerSuggestion>; // we do not want to limit the use of SearchSources
  trigger: string;
};

export type TextComposerState<SCG extends ExtendableGenerics = DefaultGenerics> = {
  mentionedUsers: UserResponse<SCG>[];
  selection: TextSelection;
  text: string;
  suggestions?: Suggestions;
};
