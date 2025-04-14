import { isLocalImageAttachment, isUploadedAttachment } from './attachmentIdentity';
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
import { DEFAULT_UPLOAD_SIZE_LIMIT_BYTES } from '../constants';
import type { Channel } from '../channel';
import type {
  AttachmentLoadingState,
  FileLike,
  FileReference,
  LocalAttachment,
  LocalAudioAttachment,
  LocalFileAttachment,
  LocalUploadAttachment,
  LocalVideoAttachment,
  LocalVoiceRecordingAttachment,
  UploadPermissionCheckResult,
} from './types';
import type {
  ChannelResponse,
  DraftMessage,
  LocalMessage,
  SendFileAPIResponse,
} from '../types';
import { mergeWith } from '../utils/mergeWith';
import { DEFAULT_ATTACHMENT_MANAGER_CONFIG } from './configuration/configuration';
import type { AttachmentManagerConfig } from './configuration/types';

type LocalNotImageAttachment =
  | LocalFileAttachment
  | LocalAudioAttachment
  | LocalVideoAttachment
  | LocalVoiceRecordingAttachment;

export type FileUploadFilter = (file: Partial<LocalUploadAttachment>) => boolean;

export type AttachmentManagerState = {
  attachments: LocalAttachment[];
};

export type AttachmentManagerOptions = {
  channel: Channel;
  config?: Partial<AttachmentManagerConfig>;
  message?: DraftMessage | LocalMessage;
};

const initState = ({
  message,
}: {
  channel: Channel;
  message?: DraftMessage | LocalMessage;
}): AttachmentManagerState => ({
  attachments: (message?.attachments ?? [])
    ?.filter(({ og_scrape_url }) => !og_scrape_url)
    .map((att) => {
      const localMetadata = isUploadedAttachment(att)
        ? { id: generateUUIDv4(), uploadState: 'finished' }
        : { id: generateUUIDv4() };
      return {
        ...att,
        localMetadata,
      } as LocalAttachment;
    }),
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

  set config(config: AttachmentManagerConfig) {
    this.configState.next(config);
  }

  get fileUploadFilter() {
    return this.configState.getLatestValue().fileUploadFilter;
  }

  set fileUploadFilter(fileUploadFilter: AttachmentManagerConfig['fileUploadFilter']) {
    this.configState.partialNext({ fileUploadFilter });
  }

  get maxNumberOfFilesPerMessage() {
    return this.configState.getLatestValue().maxNumberOfFilesPerMessage;
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
    return !!(
      this.channel.data?.own_capabilities as ChannelResponse['own_capabilities']
    )?.includes('upload-file');
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
        const localAttachment = ensureIsLocalAttachment(upsertedAttachment);
        if (localAttachment) attachments.push(localAttachment);
      } else {
        const localAttachment = ensureIsLocalAttachment(
          mergeWith<LocalAttachment>(
            stateAttachments[attachmentIndex] ?? {},
            upsertedAttachment,
          ),
        );
        if (localAttachment) attachments.splice(attachmentIndex, 1, localAttachment);
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
    fileLike: FileReference | FileLike,
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
    fileLike: FileReference | FileLike,
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

  doUploadRequest = (fileLike: FileReference | FileLike) => {
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

  uploadFiles = async (files: FileReference[] | FileList | FileLike[]) => {
    if (!this.isUploadEnabled) return;
    const iterableFiles: FileReference[] | FileLike[] = isFileList(files)
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
