import { isLocalImageAttachment } from './attachmentIdentity';
import {
  createFileFromBlobs,
  ensureIsLocalAttachment,
  generateFileName,
  getAttachmentTypeFromMimeType,
  isFile,
  isFileList,
  isImageFile,
  isRNFile,
} from './fileUtils';
import { StateStore } from '../store';
import { generateUUIDv4 } from '../utils';
import {
  API_MAX_FILES_ALLOWED_PER_MESSAGE,
  DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
} from '../constants';
import type { Channel } from '../channel';
import type {
  AttachmentLoadingState,
  FileLike,
  LocalAttachment,
  LocalAudioAttachment,
  LocalFileAttachment,
  LocalUploadAttachment,
  LocalVideoAttachment,
  LocalVoiceRecordingAttachment,
  RNFile,
  UploadPermissionCheckResult,
} from './types';
import type { StreamChat } from '../client';
import type {
  ChannelResponse,
  DraftMessage,
  LocalMessage,
  SendFileAPIResponse,
} from '../types';
import { mergeWith } from '../utils/mergeWith';

type LocalNotImageAttachment =
  | LocalFileAttachment
  | LocalAudioAttachment
  | LocalVideoAttachment
  | LocalVoiceRecordingAttachment;

export type FileUploadFilter = (file: Partial<LocalUploadAttachment>) => boolean;

export type AttachmentManagerState = {
  attachments: LocalAttachment[];
  hasUploadPermission: boolean;
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
  doUploadRequest?: (fileLike: RNFile | FileLike) => ReturnType<StreamChat['sendFile']>;
};

export type AttachmentManagerOptions = {
  channel: Channel;
  config?: Partial<AttachmentManagerConfig>;
  message?: DraftMessage | LocalMessage;
};

const DEFAULT_ATTACHMENT_MANAGER_CONFIG: AttachmentManagerConfig = {
  fileUploadFilter: () => true,
  maxNumberOfFilesPerMessage: API_MAX_FILES_ALLOWED_PER_MESSAGE,
};

const initState = ({
  channel,
  message,
}: {
  channel: Channel;
  message?: DraftMessage | LocalMessage;
}): AttachmentManagerState => ({
  attachments: (message?.attachments ?? [])
    ?.filter(({ og_scrape_url }) => !og_scrape_url)
    .map(
      (att) =>
        ({
          ...att,
          localMetadata: { id: generateUUIDv4() },
        }) as LocalAttachment,
    ),
  hasUploadPermission: !!(
    channel.data?.own_capabilities as ChannelResponse['own_capabilities']
  )?.includes('upload-file'), // todo: in the future move to Channel's reactive permissions state
});

export class AttachmentManager {
  configState: StateStore<AttachmentManagerConfig>;
  readonly state: StateStore<AttachmentManagerState>;
  private channel: Channel;

  constructor({ channel, config = {}, message }: AttachmentManagerOptions) {
    this.channel = channel;
    // todo: document: removed prop multipleUploads (Whether to allow multiple attachment uploads) as it is a duplicate
    this.configState = new StateStore(
      mergeWith(DEFAULT_ATTACHMENT_MANAGER_CONFIG, config),
    );
    this.state = new StateStore<AttachmentManagerState>(initState({ channel, message }));
  }

  get client() {
    return this.channel.getClient();
  }

  get config() {
    return this.configState.getLatestValue();
  }

  get fileUploadFilter() {
    return this.configState.getLatestValue().fileUploadFilter;
  }
  get maxNumberOfFilesPerMessage() {
    return this.configState.getLatestValue().maxNumberOfFilesPerMessage;
  }

  set config(config: AttachmentManagerConfig) {
    this.configState.next(config);
  }

  set fileUploadFilter(fileUploadFilter: AttachmentManagerConfig['fileUploadFilter']) {
    this.configState.partialNext({ fileUploadFilter });
  }
  set maxNumberOfFilesPerMessage(
    maxNumberOfFilesPerMessage: AttachmentManagerConfig['maxNumberOfFilesPerMessage'],
  ) {
    this.configState.partialNext({ maxNumberOfFilesPerMessage });
  }

  get attachments() {
    return this.state.getLatestValue().attachments;
  }

  get hasUploadPermission() {
    return this.state.getLatestValue().hasUploadPermission;
  }

  get isUploadEnabled() {
    return this.hasUploadPermission && this.availableUploadSlots > 0;
  }

  get successfulUploads() {
    return this.getUploadsByState('finished');
  }

  get successfulUploadsCount() {
    return this.successfulUploads.length;
  }

  get uploadsInProgressCount() {
    return this.getUploadsByState('uploading').length;
  }

  get failedUploadsCount() {
    return this.getUploadsByState('failed').length;
  }

  get blockedUploadsCount() {
    return this.getUploadsByState('blocked').length;
  }

  get pendingUploadsCount() {
    return this.getUploadsByState('pending').length;
  }

  get availableUploadSlots() {
    return this.config.maxNumberOfFilesPerMessage - this.successfulUploadsCount;
  }

  getUploadsByState(state: AttachmentLoadingState) {
    return Object.values(this.attachments).filter(
      ({ localMetadata }) => localMetadata.uploadState === state,
    );
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ channel: this.channel, message }));
  };

  getAttachmentIndex = (localId: string) =>
    this.attachments.findIndex(
      (attachment) =>
        attachment.localMetadata.id && localId === attachment.localMetadata?.id,
    );

  upsertAttachments = (attachmentsToUpsert: LocalAttachment[]) => {
    if (!attachmentsToUpsert.length) return;
    const stateAttachments = this.attachments;
    const attachments = [...this.attachments];
    attachmentsToUpsert.forEach((upsertedAttachment) => {
      const attachmentIndex = this.getAttachmentIndex(
        upsertedAttachment.localMetadata.id,
      );

      if (attachmentIndex === -1) {
        attachments.push(ensureIsLocalAttachment(upsertedAttachment));
      } else {
        attachments.splice(
          attachmentIndex,
          1,
          ensureIsLocalAttachment(
            mergeWith<LocalAttachment>(
              stateAttachments[attachmentIndex] ?? {},
              upsertedAttachment,
            ),
          ),
        );
      }
    });

    this.state.partialNext({ attachments });
  };

  removeAttachments = (localAttachmentIds: string[]) => {
    this.state.partialNext({
      attachments: this.attachments.filter(
        (att) => !localAttachmentIds.includes(att.localMetadata?.id),
      ),
    });
  };

  getUploadConfigCheck = async (
    fileLike: RNFile | FileLike,
  ): Promise<UploadPermissionCheckResult> => {
    const client = this.channel.getClient();
    let appSettings;
    if (!client.appSettingsPromise) {
      appSettings = await client.getAppSettings();
    } else {
      appSettings = await client.appSettingsPromise;
    }
    const uploadConfig = isImageFile(fileLike)
      ? appSettings?.app?.image_upload_config
      : appSettings?.app?.file_upload_config;
    if (!uploadConfig) return { uploadBlocked: false };

    const {
      allowed_file_extensions,
      allowed_mime_types,
      blocked_file_extensions,
      blocked_mime_types,
      size_limit,
    } = uploadConfig;

    const sizeLimit = size_limit || DEFAULT_UPLOAD_SIZE_LIMIT_BYTES;
    const mimeType = fileLike.type;

    if (isFile(fileLike)) {
      if (
        allowed_file_extensions?.length &&
        !allowed_file_extensions.some((ext) =>
          fileLike.name.toLowerCase().endsWith(ext.toLowerCase()),
        )
      ) {
        return { uploadBlocked: true, reason: 'allowed_file_extensions' };
      }

      if (
        blocked_file_extensions?.length &&
        blocked_file_extensions.some((ext) =>
          fileLike.name.toLowerCase().endsWith(ext.toLowerCase()),
        )
      ) {
        return { uploadBlocked: true, reason: 'blocked_file_extensions' };
      }
    }

    if (
      allowed_mime_types?.length &&
      !allowed_mime_types.some((type) => type.toLowerCase() === mimeType?.toLowerCase())
    ) {
      return { uploadBlocked: true, reason: 'allowed_mime_types' };
    }

    if (
      blocked_mime_types?.length &&
      blocked_mime_types.some((type) => type.toLowerCase() === mimeType?.toLowerCase())
    ) {
      return { uploadBlocked: true, reason: 'blocked_mime_types' };
    }

    if (fileLike.size && fileLike.size > sizeLimit) {
      return { uploadBlocked: true, reason: 'size_limit' };
    }

    return { uploadBlocked: false };
  };

  fileToLocalUploadAttachment = async (
    fileLike: RNFile | FileLike,
  ): Promise<LocalUploadAttachment> => {
    const file =
      isRNFile(fileLike) || isFile(fileLike)
        ? fileLike
        : createFileFromBlobs({
            blobsArray: [fileLike],
            fileName: generateFileName(fileLike.type),
            mimeType: fileLike.type,
          });

    const uploadPermissionCheck = await this.getUploadConfigCheck(file);

    const localAttachment: LocalUploadAttachment = {
      file_size: file.size,
      mime_type: file.type,
      localMetadata: {
        file,
        id: generateUUIDv4(),
        uploadPermissionCheck,
        uploadState: uploadPermissionCheck.uploadBlocked ? 'blocked' : 'pending',
      },
      type: getAttachmentTypeFromMimeType(file.type),
    };

    localAttachment[isImageFile(file) ? 'fallback' : 'title'] = file.name;

    if (isImageFile(file)) {
      localAttachment.localMetadata.previewUri = isRNFile(fileLike)
        ? fileLike.uri
        : URL.createObjectURL?.(fileLike);

      if (isRNFile(fileLike) && fileLike.height && fileLike.width) {
        localAttachment.original_height = fileLike.height;
        localAttachment.original_width = fileLike.width;
      }
    }

    if (isRNFile(fileLike) && fileLike.thumb_url) {
      localAttachment.thumb_url = fileLike.thumb_url;
    }

    return localAttachment;
  };

  private ensureLocalUploadAttachment = async (
    attachment: Partial<LocalUploadAttachment>,
  ) => {
    if (!attachment.localMetadata?.file || !attachment.localMetadata.id) {
      this.client.notifications.addError({
        message: 'File is required for upload attachment',
        origin: { emitter: 'AttachmentManager', context: { attachment } },
      });
      return;
    }

    // todo: document this
    // the following is substitute for: if (noFiles && !isImage) return att
    if (!this.fileUploadFilter(attachment)) return;

    return await this.fileToLocalUploadAttachment(attachment.localMetadata.file);
  };

  /**
   * todo: docs how to customize the image and file upload by overriding do
   * const attachmentManager = new AttachmentManager({channel});
   * attachmentManager.doUploadRequest = () => null;
   * const messageComposer = new MessageComposer({attachmentManager, channel })
   */

  doUploadRequest = (fileLike: RNFile | FileLike) => {
    if (this.config.doUploadRequest) {
      return this.config.doUploadRequest(fileLike);
    }

    if (isRNFile(fileLike)) {
      return this.channel[isImageFile(fileLike) ? 'sendImage' : 'sendFile'](
        fileLike.uri,
        fileLike.name,
        fileLike.type,
      );
    }

    const file = isFile(fileLike)
      ? fileLike
      : createFileFromBlobs({
          blobsArray: [fileLike],
          fileName: generateFileName(fileLike.type),
          mimeType: fileLike.type,
        });

    return this.channel[isImageFile(fileLike) ? 'sendImage' : 'sendFile'](file);
  };

  uploadAttachment = async (attachment: LocalUploadAttachment) => {
    if (!this.isUploadEnabled) return;

    const localAttachment = await this.ensureLocalUploadAttachment(attachment);

    if (typeof localAttachment === 'undefined') return;

    if (localAttachment.localMetadata.uploadState === 'blocked') {
      this.upsertAttachments([localAttachment]);
      return;
    }

    this.upsertAttachments([
      {
        ...attachment,
        localMetadata: {
          ...attachment.localMetadata,
          uploadState: 'uploading',
        },
      },
    ]);

    let response: SendFileAPIResponse;
    try {
      response = await this.doUploadRequest(localAttachment.localMetadata.file);
    } catch (error) {
      let finalError: Error = {
        message: 'Error uploading attachment',
        name: 'Error',
      };
      if (typeof (error as Error).message === 'string') {
        finalError = error as Error;
      } else if (typeof error === 'object') {
        finalError = Object.assign(finalError, error);
      }

      this.client.notifications.addError({
        message: finalError.message,
        origin: { emitter: 'AttachmentManager', context: { attachment } },
      });

      const failedAttachment: LocalUploadAttachment = {
        ...attachment,
        localMetadata: {
          ...attachment.localMetadata,
          uploadState: 'failed',
        },
      };

      this.upsertAttachments([failedAttachment]);

      throw finalError;
    }

    if (!response) {
      // Copied this from useImageUpload / useFileUpload.

      // If doUploadRequest returns any falsy value, then don't create the upload preview.
      // This is for the case if someone wants to handle failure on app level.
      this.removeAttachments([attachment.localMetadata.id]);
      return;
    }

    const uploadedAttachment: LocalUploadAttachment = {
      ...attachment,
      localMetadata: {
        ...attachment.localMetadata,
        uploadState: 'finished',
      },
    };

    if (isLocalImageAttachment(uploadedAttachment)) {
      if (uploadedAttachment.localMetadata.previewUri) {
        URL.revokeObjectURL(uploadedAttachment.localMetadata.previewUri);
        delete uploadedAttachment.localMetadata.previewUri;
      }
      uploadedAttachment.image_url = response.file;
    } else {
      (uploadedAttachment as LocalNotImageAttachment).asset_url = response.file;
    }
    if (response.thumb_url) {
      (uploadedAttachment as LocalNotImageAttachment).thumb_url = response.thumb_url;
    }

    this.upsertAttachments([uploadedAttachment]);

    return uploadedAttachment;
  };

  uploadFiles = async (files: RNFile[] | FileList | FileLike[]) => {
    if (!this.isUploadEnabled) return;
    const iterableFiles: RNFile[] | FileLike[] = isFileList(files)
      ? Array.from(files)
      : files;
    const attachments = await Promise.all(
      iterableFiles.map(this.fileToLocalUploadAttachment),
    );

    return Promise.all(
      attachments
        .filter(this.fileUploadFilter)
        .slice(0, this.availableUploadSlots)
        .map(this.uploadAttachment),
    );
  };
}
