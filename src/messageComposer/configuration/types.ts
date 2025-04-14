import type { LinkPreview } from '../linkPreviewsManager';
import type { FileUploadFilter } from '../attachmentManager';
import type { FileLike, FileReference } from '../types';
import type { StreamChat } from '../../client';

export type DraftsConfiguration = {
  enabled: boolean;
};
export type TextConfiguration = {
  /** Prevents sending a message longer than this length */
  maxLengthOnSend?: number;
  /** Prevents editing the message to more than this length */
  maxLengthOnEdit?: number;
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
  // todo: refactor this. We want a pipeline where it would be possible to customize the preparation, upload, and post-upload steps.
  /** Function that allows to customize the upload request. */
  doUploadRequest?: (
    fileLike: FileReference | FileLike,
  ) => ReturnType<StreamChat['sendFile']>;
};
export type LinkPreviewConfig = {
  /** Custom function to react to link preview dismissal */
  onLinkPreviewDismissed?: (linkPreview: LinkPreview) => void;
};
export type LinkPreviewsManagerConfig = LinkPreviewConfig & {
  /** Number of milliseconds to debounce firing the URL enrichment queries when typing. The default value is 1500(ms). */
  debounceURLEnrichmentMs: number;
  /** Allows for toggling the URL enrichment and link previews in `MessageInput`. By default, the feature is disabled. */
  enabled: boolean;
  /** Custom function to identify URLs in a string and request OG data */
  findURLFn: (text: string) => string[];
};
export type MessageComposerConfig = {
  /** If true, enables creating drafts on the server */
  drafts: DraftsConfiguration;
  /** If true, triggers typing events on text input keystroke */
  publishTypingEvents: boolean;
  /** Configuration for the attachment manager */
  attachments?: Partial<AttachmentManagerConfig>;
  /** Configuration for the link previews manager */
  linkPreviews?: Partial<LinkPreviewsManagerConfig>;
  /** Maximum number of characters in a message */
  text?: TextConfiguration;
};
