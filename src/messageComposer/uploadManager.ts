import type { Channel } from '../channel';
import {
  API_MAX_FILES_ALLOWED_PER_MESSAGE,
  DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
} from '../constants';
import { StateStore } from '../store';
import type {
  Attachment,
  ChannelResponse,
  DraftMessage,
  LocalMessage,
  SendFileAPIResponse,
} from '../types';
import { generateUUIDv4 } from '../utils';
import { mergeWith } from '../utils/mergeWith';
import {
  createFileFromBlobs,
  generateFileName,
  getAttachmentTypeFromMimeType,
  isBlobButNotFile,
  isLocalImageAttachment,
} from './fileUtils';
import type {
  FileLike,
  LocalAttachment,
  LocalImageAttachment,
  LocalNotImageAttachment,
  LocalUploadAttachmentSeed,
  RNFile,
  UploadPermissionCheckResult,
} from './types';

export type UploadManagerState = {
  uploads: LocalAttachment[];
  hasUploadPermission: boolean;
};

type Message = DraftMessage | LocalMessage | undefined;

export type UploadManagerOptions<T> = {
  fileUploadFilter?: (file: T) => boolean;
  channel: Channel;
  /** Maximum number of attachments allowed per message */
  maxNumberOfFilesPerMessage?: number;
  message?: Message;
};

export type UploadManagerBaseInterface = {
  maxNumberOfFilesPerMessage: number;
  state: StateStore<UploadManagerState>;
  uploadsInProgressCount: number;
  successfulUploads: LocalAttachment[];
  successfulUploadsCount: number;
  availableUploadSlots: number;
  initState: ({ message }?: { message?: DraftMessage | LocalMessage }) => void;
  removeUploads: (uploadIds: string[]) => void;
  upsertUploads: (uploadsToUpsert: LocalAttachment[]) => void;
};

/**
 * The UploadManager is responsible for uploading files to the server and create attachments.
 */
export interface UploadManagerInterface<T = unknown> extends UploadManagerBaseInterface {
  getUploadConfigCheck: (fileLike: T) => Promise<UploadPermissionCheckResult>;
  uploadFiles: (files: T[]) => Promise<(LocalAttachment | undefined)[]>;
  filterFileUploads: (files: T[]) => T[];
  makeLocalUploadSeed: (file: T) => Promise<LocalAttachment>;
  doUploadRequest: (file: T) => Promise<SendFileAPIResponse>;
  isUploadFileImage: (file: T) => boolean;
  uploadAttachment: (attachment: LocalAttachment) => Promise<LocalAttachment | undefined>;
}

const initState = ({
  channel,
  message,
}: {
  channel: Channel;
  message?: DraftMessage | LocalMessage;
}): UploadManagerState => ({
  uploads: (message?.attachments ?? [])
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

class UploadManager<T = unknown> {
  readonly state: StateStore<UploadManagerState>;
  channel: Channel;
  fileUploadFilter?: (file: T) => boolean;
  maxNumberOfFilesPerMessage: number;

  constructor({
    channel,
    fileUploadFilter,
    maxNumberOfFilesPerMessage,
    message,
  }: UploadManagerOptions<T>) {
    this.channel = channel;
    this.fileUploadFilter = fileUploadFilter;
    this.maxNumberOfFilesPerMessage =
      maxNumberOfFilesPerMessage ?? API_MAX_FILES_ALLOWED_PER_MESSAGE;
    this.state = new StateStore<UploadManagerState>(initState({ channel, message }));
  }

  get client() {
    return this.channel.getClient();
  }

  get uploads() {
    return this.state.getLatestValue().uploads;
  }

  get uploadsInProgressCount() {
    return Object.values(this.uploads).filter(
      ({ localMetadata }) => localMetadata.uploadState === 'uploading',
    ).length;
  }

  get successfulUploads() {
    return Object.values(this.uploads).filter(
      ({ localMetadata }) =>
        !localMetadata.uploadState || localMetadata.uploadState === 'finished',
    );
  }

  get successfulUploadsCount() {
    return this.successfulUploads.length;
  }

  get availableUploadSlots() {
    return this.maxNumberOfFilesPerMessage - this.successfulUploadsCount;
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ channel: this.channel, message }));
  };

  upsertUploads = (uploadsToUpsert: LocalAttachment[]) => {
    if (!uploadsToUpsert.length) return;
    const stateUploads = this.uploads;
    const uploads = [...stateUploads];
    uploadsToUpsert.forEach((upsertedUpload) => {
      const index = stateUploads.findIndex(
        (u) => u.localMetadata.id === upsertedUpload.localMetadata.id,
      );
      if (index === -1) {
        uploads.push(upsertedUpload);
      } else {
        uploads.splice(
          index,
          1,
          mergeWith<LocalAttachment>(stateUploads[index], upsertedUpload),
        );
      }
    });

    console.log('uploads', uploads);
    this.state.partialNext({ uploads });
  };

  removeUploads = (uploadIds: string[]) => {
    this.state.partialNext({
      uploads: this.uploads.filter(
        (upload) => !uploadIds.includes(upload.localMetadata.id),
      ),
    });
  };
}

export class WebUploadManager
  extends UploadManager<FileLike>
  implements UploadManagerInterface<FileLike>
{
  constructor({
    channel,
    fileUploadFilter,
    maxNumberOfFilesPerMessage,
    message,
  }: UploadManagerOptions<FileLike>) {
    super({ channel, fileUploadFilter, maxNumberOfFilesPerMessage, message });
  }

  isUploadFileImage = (fileLike: FileLike) =>
    fileLike.type.startsWith('image/') && !fileLike.type.endsWith('.photoshop');

  isFile = (fileLike: FileLike): fileLike is File => !!(fileLike as File).lastModified;

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
    const uploadConfig = fileLike
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

    if (this.isFile(fileLike)) {
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

  /**
   * todo: docs how to customize the image and file upload by overriding do
   * const attachmentManager = new AttachmentManager({channel});
   * attachmentManager.doUploadRequest = () => null;
   * const messageComposer = new MessageComposer({attachmentManager, channel })
   */
  doUploadRequest = (fileLike: FileLike) =>
    this.channel[this.isUploadFileImage(fileLike) ? 'sendImage' : 'sendFile'](
      this.isFile(fileLike)
        ? fileLike
        : createFileFromBlobs({
            blobsArray: [fileLike],
            fileName: 'Unknown',
            mimeType: fileLike.type,
          }),
    );

  filterFileUploads = (files: FileLike[]) => {
    const iterableFiles = Array.from(files);
    return this.fileUploadFilter
      ? iterableFiles.filter(this.fileUploadFilter)
      : iterableFiles;
  };

  makeLocalUploadSeed = async (
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

  uploadAttachment = async (attachment: LocalAttachment) => {
    const { localMetadata } = attachment;

    const fileLike = localMetadata.file as FileLike;

    if (!localMetadata?.file || !localMetadata.id) return;

    // the following is substitute for: if (noFiles && !isImage) return att
    if (!this.filterFileUploads([fileLike])) return;

    if (!attachment.type) {
      attachment.type = getAttachmentTypeFromMimeType(fileLike.type);
    }

    (attachment as Attachment).file_size = fileLike.size;
    const isImage = this.isUploadFileImage(fileLike);
    if (isImage) {
      (attachment as LocalImageAttachment).localMetadata.previewUri =
        URL.createObjectURL?.(fileLike);
      if (fileLike instanceof File) {
        (attachment as LocalImageAttachment).fallback = fileLike.name;
      }
    } else {
      (attachment as LocalNotImageAttachment).mime_type = fileLike.type;
      if (fileLike instanceof File) {
        (attachment as LocalNotImageAttachment).title = fileLike.name;
      }
    }

    // substitute for checkUploadPermissions
    if (typeof attachment.localMetadata.uploadPermissionCheck === 'undefined') {
      attachment.localMetadata.uploadPermissionCheck =
        await this.getUploadConfigCheck(fileLike);
    }
    if (attachment.localMetadata.uploadPermissionCheck.uploadBlocked) {
      attachment.localMetadata.uploadState = 'blocked';
      this.upsertUploads([attachment]);
    }

    this.upsertUploads([
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
      response = await this.doUploadRequest(fileLike);
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

      this.upsertUploads([failedAttachment]);

      throw finalError;
    }

    if (!response) {
      // Copied this from useImageUpload / useFileUpload.

      // If doUploadRequest returns any falsy value, then don't create the upload preview.
      // This is for the case if someone wants to handle failure on app level.
      this.removeUploads([attachment.localMetadata.id]);
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

    if (
      this.uploads.find(
        (upload) => upload.localMetadata.id === uploadedAttachment.localMetadata.id,
      )
    ) {
      this.upsertUploads([uploadedAttachment]);
    }

    return uploadedAttachment;
  };

  uploadFiles = (files: FileLike[]) =>
    Promise.all(
      this.filterFileUploads(files)
        .slice(0, this.availableUploadSlots)
        .map(async (fileLike) =>
          this.uploadAttachment(await this.makeLocalUploadSeed(fileLike)),
        ),
    );
}

export class NativeUploadManager
  extends UploadManager<RNFile>
  implements UploadManagerInterface<RNFile>
{
  constructor({
    channel,
    fileUploadFilter,
    maxNumberOfFilesPerMessage,
    message,
  }: UploadManagerOptions<RNFile>) {
    super({ channel, fileUploadFilter, maxNumberOfFilesPerMessage, message });
  }

  isUploadFileImage = (file: RNFile) =>
    file.mimeType.startsWith('image/') && !file.mimeType.endsWith('.photoshop');

  getUploadConfigCheck = async (file: RNFile): Promise<UploadPermissionCheckResult> => {
    const client = this.channel.getClient();
    let appSettings;
    if (!client.appSettingsPromise) {
      appSettings = await client.getAppSettings();
    } else {
      appSettings = await client.appSettingsPromise;
    }
    const uploadConfig = this.isUploadFileImage(file)
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

    if (
      allowed_file_extensions?.length &&
      !allowed_file_extensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext.toLowerCase()),
      )
    ) {
      return { reason: 'allowed_file_extensions', uploadBlocked: true };
    }

    if (
      blocked_file_extensions?.length &&
      blocked_file_extensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext.toLowerCase()),
      )
    ) {
      return { reason: 'blocked_file_extensions', uploadBlocked: true };
    }

    if (
      allowed_mime_types?.length &&
      !allowed_mime_types.some(
        (type) => type.toLowerCase() === file.mimeType?.toLowerCase(),
      )
    ) {
      return { reason: 'allowed_mime_types', uploadBlocked: true };
    }

    if (
      blocked_mime_types?.length &&
      blocked_mime_types.some(
        (type) => type.toLowerCase() === file.mimeType?.toLowerCase(),
      )
    ) {
      return { reason: 'blocked_mime_types', uploadBlocked: true };
    }

    if (file.size && file.size > sizeLimit) {
      return { reason: 'size_limit', uploadBlocked: true };
    }

    return { uploadBlocked: false };
  };

  doUploadRequest = (file: RNFile) =>
    this.channel[this.isUploadFileImage(file) ? 'sendImage' : 'sendFile'](
      file.uri,
      file.name,
      file.mimeType,
    );

  makeLocalUploadSeed = async (file: RNFile): Promise<LocalUploadAttachmentSeed> => ({
    localMetadata: {
      file,
      id: generateUUIDv4(),
      uploadPermissionCheck: await this.getUploadConfigCheck(file),
    },
    type: file.type ?? getAttachmentTypeFromMimeType(file.mimeType),
  });

  filterFileUploads = (files: RNFile[]) => {
    const iterableFiles = Array.from(files);
    return this.fileUploadFilter
      ? iterableFiles.filter(this.fileUploadFilter)
      : iterableFiles;
  };

  uploadAttachment = async (attachment: LocalAttachment) => {
    const { localMetadata } = attachment;

    const fileLike = localMetadata.file as RNFile;

    if (!fileLike || !localMetadata.id) return;

    // the following is substitute for: if (noFiles && !isImage) return att
    if (!this.filterFileUploads([fileLike])) return;

    if (!attachment.type) {
      attachment.type = getAttachmentTypeFromMimeType(fileLike.mimeType);
    }

    (attachment as Attachment).file_size = fileLike.size;
    (attachment as Attachment).mime_type = fileLike.mimeType;
    const isImage = this.isUploadFileImage(fileLike);

    if (isImage) {
      (attachment as LocalImageAttachment).localMetadata.previewUri = fileLike.uri;
      (attachment as LocalImageAttachment).fallback = fileLike.name;
      if (fileLike.height && fileLike.width) {
        (attachment as LocalImageAttachment).original_height = fileLike.height;
        (attachment as LocalImageAttachment).original_width = fileLike.width;
      }
    } else {
      (attachment as LocalNotImageAttachment).mime_type = fileLike.mimeType;
      (attachment as LocalNotImageAttachment).title = fileLike.name;

      if (fileLike.duration) {
        (attachment as LocalNotImageAttachment).duration = fileLike.duration;
      }
      if (fileLike.waveform_data) {
        (attachment as LocalNotImageAttachment).waveform_data = fileLike.waveform_data;
      }
    }

    // substitute for checkUploadPermissions
    if (typeof localMetadata.uploadPermissionCheck === 'undefined') {
      localMetadata.uploadPermissionCheck = await this.getUploadConfigCheck(fileLike);
    }
    if (localMetadata.uploadPermissionCheck?.uploadBlocked) {
      localMetadata.uploadState = 'blocked';
      this.upsertUploads([attachment]);
    }

    this.upsertUploads([
      {
        ...attachment,
        localMetadata: {
          ...localMetadata,
          uploadState: 'uploading',
        },
      },
    ]);

    let response: SendFileAPIResponse;
    try {
      response = await this.doUploadRequest(fileLike);
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
          ...localMetadata,
          uploadState: 'failed',
        },
      };

      this.upsertUploads([failedAttachment]);

      throw finalError;
    }

    if (!response) {
      // Copied this from useImageUpload / useFileUpload.

      // If doUploadRequest returns any falsy value, then don't create the upload preview.
      // This is for the case if someone wants to handle failure on app level.
      this.removeUploads([localMetadata.id]);
      return;
    }

    const uploadedFile: LocalAttachment = {
      ...attachment,
      localMetadata: {
        ...localMetadata,
        uploadState: 'finished',
      },
    };

    if (isLocalImageAttachment(uploadedFile)) {
      if (uploadedFile.localMetadata.previewUri) {
        delete uploadedFile.localMetadata.previewUri;
      }
      uploadedFile.image_url = response.file;
    } else {
      (uploadedFile as LocalNotImageAttachment).asset_url = response.file;
    }
    if (response.thumb_url) {
      (uploadedFile as LocalNotImageAttachment).thumb_url = response.thumb_url;
    }

    if (this.uploads.find((u) => u.localMetadata.id === uploadedFile.localMetadata.id)) {
      this.upsertUploads([uploadedFile]);
    }

    return uploadedFile;
  };

  uploadFiles = (files: RNFile[]) =>
    Promise.all(
      this.filterFileUploads(files)
        .slice(0, this.availableUploadSlots)
        .map(async (file) => this.uploadAttachment(await this.makeLocalUploadSeed(file))),
    );
}
