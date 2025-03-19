import {
  createFileFromBlobs,
  generateFileName,
  getAttachmentTypeFromMimeType,
  isBlobButNotFile,
  isFile,
  isImageFile,
  isLocalImageAttachment,
} from './fileUtils';
import { StateStore } from '../store';
import { generateUUIDv4 } from '../utils';
import {
  API_MAX_FILES_ALLOWED_PER_MESSAGE,
  DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
} from '../constants';
import type { Channel } from '../channel';
import type {
  FileLike,
  LocalAttachment,
  LocalAudioAttachment,
  LocalFileAttachment,
  LocalImageAttachment,
  LocalUploadAttachmentSeed,
  LocalVideoAttachment,
  LocalVoiceRecordingAttachment,
  UploadPermissionCheckResult,
} from './types';
import type {
  Attachment,
  ChannelResponse,
  DraftMessage,
  FormatMessageResponse,
  MessageResponse,
  MessageResponseBase,
  SendFileAPIResponse,
} from '../types';
import { mergeWith } from '../utils/mergeWith';

type LocalNotImageAttachment =
  | LocalFileAttachment
  | LocalAudioAttachment
  | LocalVideoAttachment
  | LocalVoiceRecordingAttachment;

export type AttachmentManagerState = {
  attachments: LocalAttachment[];
  hasUploadPermission: boolean;
};

export type AttachmentManagerOptions = {
  channel: Channel;
  /**
   * Function that allows to prevent uploading files based on the functions output.
   * Use this option to simulate deprecated prop noFiles which was actually a filter to upload only image files.
   */
  fileUploadFilter?: (file: FileLike) => boolean;
  /** Maximum number of attachments allowed per message */
  maxNumberOfFilesPerMessage?: number;
  message?: DraftMessage | MessageResponseBase | MessageResponse | FormatMessageResponse;
};

const initState = ({
  channel,
  message,
}: {
  channel: Channel;
  message?: DraftMessage | MessageResponseBase | FormatMessageResponse;
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
  state: StateStore<AttachmentManagerState>;
  fileUploadFilter: ((file: FileLike) => boolean) | null;
  maxNumberOfFilesPerMessage: number;
  private channel: Channel;

  constructor({
    channel,
    fileUploadFilter,
    maxNumberOfFilesPerMessage,
    message,
  }: AttachmentManagerOptions) {
    this.channel = channel;
    // note: removed prop multipleUploads (Whether to allow multiple attachment uploads) as it is a duplicate
    this.maxNumberOfFilesPerMessage =
      maxNumberOfFilesPerMessage ?? API_MAX_FILES_ALLOWED_PER_MESSAGE;
    this.fileUploadFilter = fileUploadFilter || null;
    this.state = new StateStore<AttachmentManagerState>(initState({ channel, message }));
  }

  get attachments() {
    return this.state.getLatestValue().attachments;
  }

  get hasUploadPermission() {
    return this.state.getLatestValue().hasUploadPermission;
  }

  get successfulUploads() {
    return Object.values(this.attachments).filter(
      ({ localMetadata }) =>
        !localMetadata.uploadState || localMetadata.uploadState === 'finished',
    );
  }

  get successfulUploadsCount() {
    return Object.values(this.attachments).filter(
      ({ localMetadata }) =>
        !localMetadata.uploadState || localMetadata.uploadState === 'finished',
    ).length;
  }

  get uploadsInProgressCount() {
    return Object.values(this.attachments).filter(
      ({ localMetadata }) => localMetadata.uploadState === 'uploading',
    ).length;
  }

  get failedUploadsCount() {
    return Object.values(this.attachments).filter(
      ({ localMetadata }) => localMetadata.uploadState === 'failed',
    ).length;
  }

  get availableUploadSlots() {
    return this.maxNumberOfFilesPerMessage - this.successfulUploadsCount;
  }

  get isUploadEnabled() {
    return this.hasUploadPermission && this.availableUploadSlots > 0;
  }

  initState = ({ message }: { message?: DraftMessage | MessageResponseBase } = {}) => {
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
        attachments.push(upsertedAttachment);
      } else {
        attachments.splice(
          attachmentIndex,
          1,
          mergeWith<LocalAttachment>(
            stateAttachments[attachmentIndex] ?? {},
            upsertedAttachment,
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

  private filterFileUploads = (fileLikes: FileList | FileLike[]) => {
    const iterableFiles = Array.from(fileLikes);
    return this.fileUploadFilter
      ? iterableFiles.filter(this.fileUploadFilter)
      : iterableFiles;
  };

  getUploadConfigCheck = async (
    fileLike: FileLike,
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
      !allowed_mime_types.some(
        (type) => type.toLowerCase() === fileLike.type?.toLowerCase(),
      )
    ) {
      return { uploadBlocked: true, reason: 'allowed_mime_types' };
    }

    if (
      blocked_mime_types?.length &&
      blocked_mime_types.some(
        (type) => type.toLowerCase() === fileLike.type?.toLowerCase(),
      )
    ) {
      return { uploadBlocked: true, reason: 'blocked_mime_types' };
    }

    if (fileLike.size && fileLike.size > sizeLimit) {
      return { uploadBlocked: true, reason: 'size_limit' };
    }

    return { uploadBlocked: false };
  };

  makeLocalUploadAttachmentSeed = async (
    fileLike: FileLike,
  ): Promise<LocalUploadAttachmentSeed> => ({
    type: getAttachmentTypeFromMimeType(fileLike.type),
    localMetadata: {
      file: isBlobButNotFile(fileLike)
        ? createFileFromBlobs({
            blobsArray: [fileLike],
            fileName: generateFileName(fileLike.type),
            mimeType: fileLike.type,
          })
        : fileLike,
      id: generateUUIDv4(),
      uploadPermissionCheck: await this.getUploadConfigCheck(fileLike),
    },
  });

  /**
   * todo: docs how to customize the image and file upload by overriding do
   * const attachmentManager = new AttachmentManager({channel});
   * attachmentManager.doUploadRequest = () => null;
   * const messageComposer = new MessageComposer({attachmentManager, channel })
   */

  doUploadRequest = (fileLike: FileLike) =>
    this.channel[isImageFile(fileLike) ? 'sendImage' : 'sendFile'](
      isFile(fileLike)
        ? fileLike
        : createFileFromBlobs({
            blobsArray: [fileLike],
            fileName: 'Unknown',
            mimeType: fileLike.type,
          }),
    );

  uploadAttachment = async (attachment: LocalAttachment) => {
    if (!attachment.localMetadata?.file || !attachment.localMetadata.id) return;

    const { file } = attachment.localMetadata;

    // the following is substitute for: if (noFiles && !isImage) return att
    if (!this.filterFileUploads([file])) return;

    if (!attachment.type) {
      attachment.type = getAttachmentTypeFromMimeType(file.type);
    }

    (attachment as Attachment).file_size = file.size;
    const isImage = isImageFile(file);
    if (isImage) {
      (attachment as LocalImageAttachment).localMetadata.previewUri =
        URL.createObjectURL?.(file);
      if (file instanceof File) {
        (attachment as LocalImageAttachment).fallback = file.name;
      }
    } else {
      (attachment as LocalNotImageAttachment).mime_type = file.type;
      if (file instanceof File) {
        (attachment as LocalNotImageAttachment).title = file.name;
      }
    }

    // substitute for checkUploadPermissions
    if (typeof attachment.localMetadata.uploadPermissionCheck === 'undefined') {
      attachment.localMetadata.uploadPermissionCheck =
        await this.getUploadConfigCheck(file);
    }
    if (attachment.localMetadata.uploadPermissionCheck.uploadBlocked) {
      attachment.localMetadata.uploadState = 'blocked';
      this.upsertAttachments([attachment]);
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
      response = await this.doUploadRequest(file);
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

      const failedAttachment: LocalAttachment = {
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

    const uploadedAttachment: LocalAttachment = {
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

  uploadFiles = (files: FileList | File[] | Blob[]) =>
    Promise.all(
      this.filterFileUploads(files)
        .slice(0, this.availableUploadSlots)
        .map(async (fileLike) =>
          this.uploadAttachment(await this.makeLocalUploadAttachmentSeed(fileLike)),
        ),
    );
}
