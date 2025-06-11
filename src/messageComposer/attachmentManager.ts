import type {
  AttachmentManagerConfig,
  MinimumUploadRequestResult,
  UploadRequestFn,
} from './configuration';
import { isLocalImageAttachment, isUploadedAttachment } from './attachmentIdentity';
import {
  createFileFromBlobs,
  ensureIsLocalAttachment,
  generateFileName,
  getAttachmentTypeFromMimeType,
  isFile,
  isFileList,
  isFileReference,
  isImageFile,
} from './fileUtils';
import { StateStore } from '../store';
import { generateUUIDv4 } from '../utils';
import { DEFAULT_UPLOAD_SIZE_LIMIT_BYTES } from '../constants';
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
import type { ChannelResponse, DraftMessage, LocalMessage } from '../types';
import type { MessageComposer } from './messageComposer';
import { mergeWithDiff } from '../utils/mergeWith';

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
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

const initState = ({
  message,
}: {
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
  readonly state: StateStore<AttachmentManagerState>;
  readonly composer: MessageComposer;
  private attachmentsByIdGetterCache: {
    attachmentsById: Record<string, LocalAttachment>;
    attachments: LocalAttachment[];
  };

  constructor({ composer, message }: AttachmentManagerOptions) {
    this.composer = composer;
    this.state = new StateStore<AttachmentManagerState>(initState({ message }));
    this.attachmentsByIdGetterCache = { attachmentsById: {}, attachments: [] };
  }

  get attachmentsById() {
    const { attachments } = this.state.getLatestValue();

    if (attachments !== this.attachmentsByIdGetterCache.attachments) {
      this.attachmentsByIdGetterCache.attachments = attachments;
      this.attachmentsByIdGetterCache.attachmentsById = attachments.reduce<
        Record<string, LocalAttachment>
      >((newAttachmentsById, attachment) => {
        // should never happen but does not hurt to check
        if (!attachment.localMetadata.id) return newAttachmentsById;

        newAttachmentsById[attachment.localMetadata.id] ??= attachment;

        return newAttachmentsById;
      }, {});
    }

    return this.attachmentsByIdGetterCache.attachmentsById;
  }

  get client() {
    return this.composer.client;
  }

  get channel() {
    return this.composer.channel;
  }

  get config() {
    return this.composer.config.attachments;
  }

  get acceptedFiles() {
    return this.config.acceptedFiles;
  }

  set acceptedFiles(acceptedFiles: AttachmentManagerConfig['acceptedFiles']) {
    this.composer.updateConfig({ attachments: { acceptedFiles } });
  }

  get fileUploadFilter() {
    return this.config.fileUploadFilter;
  }

  set fileUploadFilter(fileUploadFilter: AttachmentManagerConfig['fileUploadFilter']) {
    this.composer.updateConfig({ attachments: { fileUploadFilter } });
  }

  get maxNumberOfFilesPerMessage() {
    return this.config.maxNumberOfFilesPerMessage;
  }

  set maxNumberOfFilesPerMessage(
    maxNumberOfFilesPerMessage: AttachmentManagerConfig['maxNumberOfFilesPerMessage'],
  ) {
    if (maxNumberOfFilesPerMessage === this.maxNumberOfFilesPerMessage) return;
    this.composer.updateConfig({ attachments: { maxNumberOfFilesPerMessage } });
  }

  setCustomUploadFn = (doUploadRequest: UploadRequestFn) => {
    this.composer.updateConfig({ attachments: { doUploadRequest } });
  };

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
    return (
      this.config.maxNumberOfFilesPerMessage -
      this.successfulUploadsCount -
      this.uploadsInProgressCount
    );
  }

  getUploadsByState(state: AttachmentLoadingState) {
    return Object.values(this.attachments).filter(
      ({ localMetadata }) => localMetadata.uploadState === state,
    );
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ message }));
  };

  getAttachmentIndex = (localId: string) => {
    const attachmentsById = this.attachmentsById;

    return this.attachments.indexOf(attachmentsById[localId]);
  };

  private prepareAttachmentUpdate = (attachmentToUpdate: LocalAttachment) => {
    const stateAttachments = this.attachments;
    const attachments = [...this.attachments];
    const attachmentIndex = this.getAttachmentIndex(attachmentToUpdate.localMetadata.id);
    if (attachmentIndex === -1) return null;
    // do not re-organize newAttachments array otherwise indexing would no longer work
    // replace in place only with the attachments with the same id's
    const merged = mergeWithDiff<LocalAttachment>(
      stateAttachments[attachmentIndex],
      attachmentToUpdate,
    );
    const updatesOnMerge = merged.diff && Object.keys(merged.diff.children).length;
    if (updatesOnMerge) {
      const localAttachment = ensureIsLocalAttachment(merged.result);
      if (localAttachment) {
        attachments.splice(attachmentIndex, 1, localAttachment);
        return attachments;
      }
    }
    return null;
  };

  updateAttachment = (attachmentToUpdate: LocalAttachment) => {
    const updatedAttachments = this.prepareAttachmentUpdate(attachmentToUpdate);
    if (updatedAttachments) {
      this.state.partialNext({ attachments: updatedAttachments });
    }
  };

  upsertAttachments = (attachmentsToUpsert: LocalAttachment[]) => {
    if (!attachmentsToUpsert.length) return;
    let attachments = [...this.attachments];
    let hasUpdates = false;
    attachmentsToUpsert.forEach((attachment) => {
      const updatedAttachments = this.prepareAttachmentUpdate(attachment);
      if (updatedAttachments) {
        attachments = updatedAttachments;
        hasUpdates = true;
      } else {
        const localAttachment = ensureIsLocalAttachment(attachment);
        if (localAttachment) {
          attachments.push(localAttachment);
          hasUpdates = true;
        }
      }
    });
    if (hasUpdates) {
      this.state.partialNext({ attachments });
    }
  };

  removeAttachments = (localAttachmentIds: string[]) => {
    this.state.partialNext({
      attachments: this.attachments.filter(
        (attachment) => !localAttachmentIds.includes(attachment.localMetadata?.id),
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

    if (isFile(fileLike) || isFileReference(fileLike)) {
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
      isFileReference(fileLike) || isFile(fileLike)
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
      localAttachment.localMetadata.previewUri = isFileReference(fileLike)
        ? fileLike.uri
        : URL.createObjectURL?.(fileLike);

      if (isFileReference(fileLike) && fileLike.height && fileLike.width) {
        localAttachment.original_height = fileLike.height;
        localAttachment.original_width = fileLike.width;
      }
    }

    if (isFileReference(fileLike) && fileLike.thumb_url) {
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
        options: { type: 'validation:attachment:file:missing' },
      });
      return;
    }

    if (!this.fileUploadFilter(attachment)) return;

    const newAttachment = await this.fileToLocalUploadAttachment(
      attachment.localMetadata.file,
    );
    if (attachment.localMetadata.id) {
      newAttachment.localMetadata.id = attachment.localMetadata.id;
    }
    return newAttachment;
  };

  /**
   * Method to perform the default upload behavior without checking for custom upload functions
   * to prevent recursive calls
   */
  doDefaultUploadRequest = async (fileLike: FileReference | FileLike) => {
    if (isFileReference(fileLike)) {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { duration, ...result } =
      await this.channel[isImageFile(fileLike) ? 'sendImage' : 'sendFile'](file);
    return result;
  };

  /**
   * todo: docs how to customize the image and file upload by overriding do
   */

  doUploadRequest = async (fileLike: FileReference | FileLike) => {
    const customUploadFn = this.config.doUploadRequest;
    if (customUploadFn) {
      return await customUploadFn(fileLike);
    }

    return this.doDefaultUploadRequest(fileLike);
  };

  uploadAttachment = async (attachment: LocalUploadAttachment) => {
    if (!this.isUploadEnabled) return;

    const localAttachment = await this.ensureLocalUploadAttachment(attachment);

    if (typeof localAttachment === 'undefined') return;

    if (localAttachment.localMetadata.uploadState === 'blocked') {
      this.upsertAttachments([localAttachment]);
      this.client.notifications.addError({
        message: `The attachment upload was blocked`,
        origin: {
          emitter: 'AttachmentManager',
          context: { attachment, blockedAttachment: localAttachment },
        },
        options: {
          type: 'validation:attachment:upload:blocked',
          metadata: {
            reason: localAttachment.localMetadata.uploadPermissionCheck?.reason,
          },
        },
      });
      return localAttachment;
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

    let response: MinimumUploadRequestResult;
    try {
      response = await this.doUploadRequest(localAttachment.localMetadata.file);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      const failedAttachment: LocalUploadAttachment = {
        ...attachment,
        localMetadata: {
          ...attachment.localMetadata,
          uploadState: 'failed',
        },
      };

      this.client.notifications.addError({
        message: 'Error uploading attachment',
        origin: {
          emitter: 'AttachmentManager',
          context: { attachment, failedAttachment },
        },
        options: {
          type: 'api:attachment:upload:failed',
          metadata: { reason },
          originalError: error instanceof Error ? error : undefined,
        },
      });

      this.updateAttachment(failedAttachment);
      return failedAttachment;
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

    this.updateAttachment(uploadedAttachment);

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
