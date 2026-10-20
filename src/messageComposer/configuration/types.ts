import type { LinkPreview } from '../linkPreviewsManager';
import type { FileUploadFilter } from '../attachmentManager';
import type { MessageComposer } from '../messageComposer';
import type { FileLike, FileReference } from '../types';
import type { Command, UserResponse } from '../../types';

export type MinimumUploadRequestResult = { file: string; thumb_url?: string } & Partial<
  Record<string, unknown>
>;

/**
 * Optional second argument to `UploadRequestFn`.
 * - Call `onProgress` to report 0 to 100, or `undefined` when indeterminate.
 * - Forward `abortSignal` to your upload to cancel it when the attachment is deleted mid-upload.
 */
export type UploadRequestOptions = {
  onProgress?: (percent: number | undefined) => void;
  abortSignal?: AbortSignal;
};

export type UploadRequestFn = (
  fileLike: FileReference | FileLike,
  options?: UploadRequestOptions,
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

export type CommandSendability = {
  command: Command;
  ready: boolean;
  reason?: string & {};
  metadata?: Record<string, unknown>;
};

export type CommandSendValidationContext = {
  command: Command;
  composer: MessageComposer;
  commandArgsText: string;
  mentionedUsersInText: UserResponse[];
  rawText: string;
};

export type CommandSendValidator = (
  context: CommandSendValidationContext,
) => CommandSendability | undefined;

export type CommandsConfig = {
  sendValidator: CommandSendValidator;
};

export type AttachmentManagerConfig = {
  /** Toggles file attachments (default `true`). ANDed with the channel config's `uploads`. */
  enabled: boolean;
  // todo: document removal of noFiles prop showing how to achieve the same with custom fileUploadFilter function
  /** Prevents uploading a file when it returns `false`. */
  fileUploadFilter: FileUploadFilter;
  /** Maximum number of attachments allowed per message */
  maxNumberOfFilesPerMessage: number;
  /**
   * File types or unique file type specifiers
   * (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept#unique_file_type_specifiers)
   * allowed for selection. Empty means all files.
   */
  acceptedFiles: string[];
  /** Function that allows to customize the upload request. */
  doUploadRequest?: UploadRequestFn;
  /**
   * Whether a custom {@link AttachmentManagerConfig.doUploadRequest} stores files outside Stream
   * (default `false`). When `false`, Stream's rules apply (the `upload-file` capability and the channel
   * type's `uploads` flag). When `true`, only {@link AttachmentManagerConfig.enabled} governs uploads.
   */
  customCdn: boolean;
  /**
   * When `true`, a message may be sent while its attachments are still uploading (defaults to
   * `false`). The message is composed and shown right away, and the send request waits for those
   * uploads to settle before it goes out; if one of them fails, the whole message fails.
   */
  pendingUploadsEnabled: boolean;
  /**
   * When `true`, the attachment manager sets `localMetadata.uploadProgress` and passes
   * `options.onProgress` to `doUploadRequest` (built-in and custom). Set to `false` to disable
   * progress tracking (defaults to `true`).
   */
  trackUploadProgress: boolean;
};

export type LinkPreviewsManagerConfig = {
  /** Number of milliseconds to debounce firing the URL enrichment queries when typing (defaults to `1500`). */
  debounceURLEnrichmentMs: number;
  /**
   * Toggles URL enrichment and link previews (default `true`). ANDed with the channel type's
   * `url_enrichment`.
   */
  enabled: boolean;
  /** Custom function to identify URLs in a string and request OG data */
  findURLFn: (text: string) => string[];
  /** Custom function to react to link preview dismissal */
  onLinkPreviewDismissed?: (linkPreview: LinkPreview) => void;
};

export type LocationComposerConfig = {
  /** Toggles location sharing (default `true`). ANDed with the channel config's `shared_locations`. */
  enabled: boolean;
  /** Function that provides a stable ID for the device from which the location is shared. */
  getDeviceId: () => string;
  /** Shortest live-location duration in ms (default 60s). A shorter `durationMs` is invalid. */
  minShareDurationMs: number;
};

export type PollComposerConfig = {
  /** Toggles poll composition (default `true`). ANDed with the channel config's `polls`. */
  enabled: boolean;
};

export type MessageComposerConfig = {
  /** If true, enables creating drafts on the server */
  drafts: DraftsConfiguration;
  commands: CommandsConfig;
  attachments: AttachmentManagerConfig;
  linkPreviews: LinkPreviewsManagerConfig;
  location: LocationComposerConfig;
  polls: PollComposerConfig;
  /**
   * Whether submitting keeps the composer's contents instead of clearing them (also leaving unresolved
   * uploads in place). Defaults to retaining for a poll message.
   */
  retainCompositionOnSubmit: (composer: MessageComposer) => boolean;
  text: TextComposerConfig;
};
