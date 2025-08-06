import type { LinkPreview } from '../linkPreviewsManager';
import type { FileUploadFilter } from '../attachmentManager';
import type { FileLike, FileReference } from '../types';

export type MinimumUploadRequestResult = { file: string; thumb_url?: string } & Partial<
  Record<string, unknown>
>;

export type UploadRequestFn = (
  fileLike: FileReference | FileLike,
) => Promise<MinimumUploadRequestResult>;

export type DraftsConfiguration = {
  enabled: boolean;
};

export type TextComposerConfig = {
  /** If false, the text input, change and selection events are disabled */
  enabled: boolean;
  /** If true, triggers typing events on text input keystroke. Disabled for threads and message editing by default. */
  publishTypingEvents: boolean;
  /** Default value for the message input */
  defaultValue?: string;
  /** Prevents editing the message to more than this length */
  maxLengthOnEdit?: number;
  /** Prevents sending a message longer than this length */
  maxLengthOnSend?: number;
};

export type AttachmentManagerConfig = {
  // todo: document removal of noFiles prop showing how to achieve the same with custom fileUploadFilter function
  /**
   * Function that allows to prevent uploading files based on the functions output.
   * Use this option to simulate deprecated prop noFiles which was actually a filter to upload only image files.
   */
  fileUploadFilter: FileUploadFilter;
  /** Maximum number of attachments allowed per message */
  maxNumberOfFilesPerMessage: number;
  /**
   * Array of one or more file types, or unique file type specifiers (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept#unique_file_type_specifiers),
   * describing which file types are allowed to be selected when uploading files.
   */
  acceptedFiles: string[];
  /** Function that allows to customize the upload request. */
  doUploadRequest?: UploadRequestFn;
};

export type LinkPreviewsManagerConfig = {
  /** Number of milliseconds to debounce firing the URL enrichment queries when typing. The default value is 1500(ms). */
  debounceURLEnrichmentMs: number;
  /** Allows for toggling the URL enrichment and link previews in `MessageInput`. By default, the feature is disabled. */
  enabled: boolean;
  /** Custom function to identify URLs in a string and request OG data */
  findURLFn: (text: string) => string[];
  /** Custom function to react to link preview dismissal */
  onLinkPreviewDismissed?: (linkPreview: LinkPreview) => void;
};

export type LocationComposerConfig = {
  /**
   * Allows for toggling the location addition.
   * By default, the feature is enabled but has to be enabled also on channel level config via shared_locations.
   */
  enabled: boolean;
  /** Function that provides a stable id for a device from which the location is shared */
  getDeviceId: () => string;
};

export type MessageComposerConfig = {
  /** If true, enables creating drafts on the server */
  drafts: DraftsConfiguration;
  /** Configuration for the attachment manager */
  attachments: AttachmentManagerConfig;
  /** Configuration for the link previews manager */
  linkPreviews: LinkPreviewsManagerConfig;
  /** Configuration for the location composer */
  location: LocationComposerConfig;
  /** Maximum number of characters in a message */
  text: TextComposerConfig;
};
