import type {
  AttachmentManagerConfig,
  MinimumUploadRequestResult,
  UploadRequestFn,
  UploadRequestOptions,
} from './configuration';
import { isPendingUpload, isUploadedAttachment } from './attachmentIdentity';
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
import {
  AttachmentPostUploadMiddlewareExecutor,
  AttachmentPreUploadMiddlewareExecutor,
} from './middleware/attachmentManager';
import { StateStore } from '@stream-io/state-store';
import { CORE_NOTIFICATION_TYPE } from '../notifications';
import { generateUUIDv4 } from '../utils';
import { DEFAULT_UPLOAD_SIZE_LIMIT_BYTES } from '../constants';
import type {
  AttachmentLoadingState,
  FileLike,
  FileReference,
  LocalAttachment,
  LocalAttachmentUploadMetadata,
  LocalUploadAttachment,
  UploadPermissionCheckResult,
} from './types';
import type {
  Attachment,
  ChannelResponse,
  DraftMessage,
  LocalMessage,
  StreamRequestOptions,
} from '../types';
import type { MessageComposer } from './messageComposer';
import { mergeWithDiff } from '../utils/mergeWith';
import { isUploadCancellation } from '../uploadManager';

export type FileUploadFilter = (file: Partial<LocalUploadAttachment>) => boolean;

export type AttachmentManagerState = {
  attachments: LocalAttachment[];
};

export type AttachmentManagerSnapshot = AttachmentManagerState;

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

/**
 * Whether an upload input is an attachment rather than a file: `File`, `Blob` and `FileReference`
 * never carry `localMetadata`.
 */
const isUploadInputAttachment = (
  input: FileReference | FileLike | LocalUploadAttachment,
): input is LocalUploadAttachment => 'localMetadata' in input;

/**
 * An upload rejection as an `Error`, so a rejection with any other value still fails the upload
 * instead of dropping the attachment. A cancellation is kept as it is, for `isUploadCancellation`.
 */
const toUploadError = (rejection: unknown) =>
  rejection instanceof Error || isUploadCancellation(rejection)
    ? (rejection as Error)
    : new Error('unknown error', { cause: rejection });

export class AttachmentManager {
  readonly state: StateStore<AttachmentManagerState>;
  readonly composer: MessageComposer;
  readonly preUploadMiddlewareExecutor: AttachmentPreUploadMiddlewareExecutor;
  readonly postUploadMiddlewareExecutor: AttachmentPostUploadMiddlewareExecutor;
  private attachmentsByIdGetterCache: {
    attachmentsById: Record<string, LocalAttachment>;
    attachments: LocalAttachment[];
  };

  constructor({ composer, message }: AttachmentManagerOptions) {
    this.composer = composer;
    this.state = new StateStore<AttachmentManagerState>(initState({ message }));
    this.attachmentsByIdGetterCache = { attachmentsById: {}, attachments: [] };

    this.preUploadMiddlewareExecutor = new AttachmentPreUploadMiddlewareExecutor({
      composer,
    });
    this.postUploadMiddlewareExecutor = new AttachmentPostUploadMiddlewareExecutor({
      composer,
    });
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

  /**
  @deprecated attachments can be filtered using injecting pre-upload middleware
   */
  get fileUploadFilter() {
    return this.config.fileUploadFilter;
  }

  /**
  @deprecated attachments can be filtered using injecting pre-upload middleware
   */
  set fileUploadFilter(fileUploadFilter: AttachmentManagerConfig['fileUploadFilter']) {
    this.composer.updateConfig({ attachments: { fileUploadFilter } });
  }

  get maxNumberOfFilesPerMessage() {
    return this.config.maxNumberOfFilesPerMessage;
  }

  set maxNumberOfFilesPerMessage(
    maxNumberOfFilesPerMessage: AttachmentManagerConfig['maxNumberOfFilesPerMessage'],
  ) {
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

  get hasCustomDoUploadRequest() {
    return typeof this.config.doUploadRequest === 'function';
  }

  get hasAvailableUploadSlots() {
    return this.availableUploadSlots > 0;
  }

  /**
   * Whether uploaded bytes reach Stream (and so Stream's rules apply). Set by
   * {@link AttachmentManagerConfig.customCdn}, not inferred from `doUploadRequest`.
   */
  get usesStreamStorage() {
    return !this.config.customCdn;
  }

  /**
   * Whether this composer can accept a file (`uploadFiles` enforces it): `config.enabled` (already
   * ANDed with the channel type's `uploads` flag when files go to Stream), a free slot, and the
   * `upload-file` capability (only when files go to Stream).
   */
  get isUploadEnabled() {
    return (
      this.config.enabled &&
      this.hasAvailableUploadSlots &&
      (!this.usesStreamStorage || this.hasUploadPermission)
    );
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

  /**
   * Slots left for files. Each finished or uploading attachment takes one. Pending, failed and blocked
   * uploads, and attachments with nothing to upload, take none.
   */
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

  cancelAttachmentUploads = (attachments: LocalAttachment[] = this.attachments) => {
    for (const { localMetadata } of attachments) {
      this.client.uploadManager.deleteUploadRecord(localMetadata.id);
    }
  };

  private normalizeSnapshotAttachment = (attachment: LocalAttachment) => {
    if (attachment.localMetadata.uploadState !== 'uploading') return attachment;

    this.client.uploadManager.deleteUploadRecord(attachment.localMetadata.id);

    return {
      ...attachment,
      localMetadata: {
        ...attachment.localMetadata,
        uploadConfirmationPending: false,
        uploadProgress: undefined,
        uploadState: 'failed',
      },
    } as LocalAttachment;
  };

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ message }));
  };

  /**
   * Moves `source`'s attachments here, replacing this manager's own (their uploads are cancelled) and
   * emptying `source`. Running uploads are not cancelled: this manager joins them (`UploadManager` runs
   * one request per attachment), so their results land here.
   *
   * @internal
   */
  takeOver = (source: AttachmentManager) => {
    this.cancelAttachmentUploads();
    this.state.next({ ...source.state.getLatestValue() });
    source.state.partialNext({ attachments: [] });
    for (const attachment of this.attachments) {
      if (isPendingUpload(attachment)) void this.uploadAndProcess(attachment);
    }
  };

  getSnapshot = (): AttachmentManagerSnapshot => {
    const state = this.state.getLatestValue();
    let hasUpdates = false;
    const attachments = state.attachments.map(this.normalizeSnapshotAttachment);

    for (let i = 0; i < attachments.length; i++) {
      if (attachments[i] !== state.attachments[i]) {
        hasUpdates = true;
        break;
      }
    }

    return hasUpdates ? { ...state, attachments } : state;
  };

  restoreSnapshot = (snapshot: AttachmentManagerSnapshot) => {
    this.cancelAttachmentUploads(this.attachments);
    this.state.next(snapshot);
  };

  setAttachments = (attachments: LocalAttachment[]) => {
    this.state.partialNext({ attachments });
  };

  clearAttachments = () => {
    if (!this.attachments.length) return;
    this.removeAttachments(
      this.attachments.map((attachment) => attachment.localMetadata.id),
    );
  };

  getAttachmentIndex = (localId: string) => {
    const attachmentsById = this.attachmentsById;

    return this.attachments.indexOf(attachmentsById[localId]);
  };

  /**
   * `attachments` with `attachmentToUpdate` merged in place of the one with its `localMetadata.id`:
   * `null` when none has it, `attachments` itself when the merge changes nothing.
   */
  private prepareAttachmentUpdate = (
    attachmentToUpdate: LocalAttachment,
    attachments: LocalAttachment[] = this.attachments,
  ) => {
    const attachmentIndex = attachments.findIndex(
      ({ localMetadata }) => localMetadata?.id === attachmentToUpdate.localMetadata.id,
    );
    if (attachmentIndex === -1) return null;
    // Replace in place by ID; reordering would break indexing.
    const merged = mergeWithDiff<LocalAttachment>(
      attachments[attachmentIndex],
      attachmentToUpdate,
    );
    const updatesOnMerge = merged.diff && Object.keys(merged.diff.children).length;
    if (updatesOnMerge) {
      const localAttachment = ensureIsLocalAttachment(merged.result);
      if (localAttachment) {
        const updatedAttachments = [...attachments];
        updatedAttachments.splice(attachmentIndex, 1, localAttachment);
        return updatedAttachments;
      }
    }
    return attachments;
  };

  updateAttachment = (attachmentToUpdate: LocalAttachment) => {
    const updatedAttachments = this.prepareAttachmentUpdate(attachmentToUpdate);
    if (updatedAttachments && updatedAttachments !== this.attachments) {
      this.state.partialNext({ attachments: updatedAttachments });
    }
  };

  /**
   * Merges each attachment into the one with its `localMetadata.id`, or appends it. An attachment
   * without a local id (e.g. a custom-type one the app builds) is appended with a new one, on every
   * call: to update or remove it later, pass `{ ...attachment, localMetadata: { id } }` with your own
   * id instead.
   */
  upsertAttachments = (attachmentsToUpsert: Array<Attachment | LocalAttachment>) => {
    if (!attachmentsToUpsert.length) return;
    let attachments = this.attachments;
    attachmentsToUpsert.forEach((attachment) => {
      const localAttachment = ensureIsLocalAttachment(attachment);
      if (!localAttachment) return;
      attachments = this.prepareAttachmentUpdate(localAttachment, attachments) ?? [
        ...attachments,
        localAttachment,
      ];
    });
    if (attachments !== this.attachments) {
      this.state.partialNext({ attachments });
    }
  };

  /** Revokes `blob:` preview URLs only. A React Native `FileReference` keeps the caller's own URI. */
  private revokePreviewUri = (attachment: LocalAttachment) => {
    const previewUri = (
      attachment.localMetadata as Partial<LocalAttachmentUploadMetadata>
    )?.previewUri;

    if (previewUri?.startsWith('blob:')) URL.revokeObjectURL?.(previewUri);
  };

  removeAttachments = (localAttachmentIds: string[]) => {
    if (!localAttachmentIds.length) return;

    const removedAttachments = this.attachments.filter((attachment) =>
      localAttachmentIds.includes(attachment.localMetadata?.id),
    );

    this.state.partialNext({
      attachments: this.attachments.filter(
        (attachment) => !localAttachmentIds.includes(attachment.localMetadata?.id),
      ),
    });

    for (const id of localAttachmentIds) {
      this.client.uploadManager.deleteUploadRecord(id);
    }

    // Removal ends the attachments' life, so their preview blobs are revoked (not in `initState` or
    // `restoreSnapshot`, which only drop the composer's view of attachments others may still render).
    removedAttachments.forEach(this.revokePreviewUri);
  };

  getUploadConfigCheck = async (
    fileLike: FileReference | FileLike,
  ): Promise<UploadPermissionCheckResult> => {
    const client = this.channel.getClient();
    let appSettings;
    try {
      appSettings = await (client.appSettingsPromise ?? client.getAppSettings());
    } catch (error) {
      // offline, the copy the offline database keeps stands in for the request
      appSettings = client.userId
        ? await client.offlineDb
            ?.getAppSettings({ userId: client.userId })
            .catch(() => null)
        : null;
      if (!appSettings) throw error;
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

  static toLocalUploadAttachment = (
    fileLike: FileReference | FileLike,
  ): LocalUploadAttachment => {
    const file =
      isFileReference(fileLike) || isFile(fileLike)
        ? fileLike
        : createFileFromBlobs({
            blobsArray: [fileLike],
            fileName: generateFileName(fileLike.type),
            mimeType: fileLike.type,
          });

    const localAttachment: LocalUploadAttachment = {
      custom: {
        file_size: file.size,
        mime_type: file.type,
      },
      localMetadata: {
        file,
        id: generateUUIDv4(),
        uploadState: 'pending',
      },
      type: getAttachmentTypeFromMimeType(file.type),
    };

    localAttachment[isImageFile(file) ? 'fallback' : 'title'] = file.name;

    localAttachment.localMetadata.previewUri = isFileReference(fileLike)
      ? fileLike.uri
      : URL.createObjectURL?.(fileLike);

    if (
      isFileReference(fileLike) &&
      fileLike.height &&
      fileLike.width &&
      isImageFile(file)
    ) {
      localAttachment.original_height = fileLike.height;
      localAttachment.original_width = fileLike.width;
    }

    if (isFileReference(fileLike) && fileLike.thumb_url) {
      localAttachment.thumb_url = fileLike.thumb_url;
    }

    if (
      isFileReference(fileLike) &&
      fileLike.duration &&
      localAttachment.type === 'voiceRecording'
    ) {
      localAttachment.custom.duration = fileLike.duration;
    }

    return localAttachment;
  };

  // @deprecated use AttachmentManager.toLocalUploadAttachment(file)
  fileToLocalUploadAttachment = async (
    fileLike: FileReference | FileLike,
  ): Promise<LocalUploadAttachment> => {
    const localAttachment = AttachmentManager.toLocalUploadAttachment(fileLike);
    const uploadPermissionCheck = await this.getUploadConfigCheck(
      localAttachment.localMetadata.file,
    );
    localAttachment.localMetadata.uploadPermissionCheck = uploadPermissionCheck;
    localAttachment.localMetadata.uploadState = uploadPermissionCheck.uploadBlocked
      ? 'blocked'
      : 'pending';

    return localAttachment;
  };

  /**
   * Whether `attachment` carries what an upload needs: a file and a local id. Reports the missing one
   * as an error notification.
   */
  private isUploadableOrNotify = (attachment: Partial<LocalUploadAttachment>) => {
    if (!attachment.localMetadata?.file) {
      this.client.notifications.addError({
        message: 'File is required for upload attachment',
        origin: {
          emitter: 'AttachmentManager',
          context: { attachment, composer: this.composer },
        },
        options: { type: CORE_NOTIFICATION_TYPE.attachmentFileMissing },
      });
      return false;
    }

    if (!attachment.localMetadata.id) {
      this.client.notifications.addError({
        message: 'Local upload attachment missing local id',
        origin: {
          emitter: 'AttachmentManager',
          context: { attachment, composer: this.composer },
        },
        options: { type: CORE_NOTIFICATION_TYPE.attachmentIdMissing },
      });
      return false;
    }

    return true;
  };

  /** The default upload, skipping the custom `doUploadRequest` so a custom one can delegate here. */
  doDefaultUploadRequest = async (
    fileLike: FileReference | FileLike,
    options?: UploadRequestOptions,
  ) => {
    const progressHandler = options?.onProgress
      ? (progressEvent: {
          loaded: number;
          total?: number;
          lengthComputable?: boolean;
        }) => {
          const percent =
            progressEvent.lengthComputable && progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : undefined;
          options.onProgress?.(percent);
        }
      : undefined;

    const requestOptions: StreamRequestOptions = {
      ...(progressHandler ? { onUploadProgress: progressHandler } : {}),
      ...(options?.abortSignal ? { signal: options.abortSignal } : {}),
    };

    const file =
      isFileReference(fileLike) || isFile(fileLike)
        ? fileLike
        : createFileFromBlobs({
            blobsArray: [fileLike],
            fileName: generateFileName(fileLike.type),
            mimeType: fileLike.type,
          });

    const {
      duration: _duration,
      // Per-request artifacts, kept out of the public `doUploadRequest` result.
      metadata: _metadata,
      ...result
    } = await this.channel[isImageFile(fileLike) ? 'uploadImage' : 'uploadFile'](
      { file },
      requestOptions,
    );

    if (!result.file) {
      throw new Error('The upload succeeded but the response carried no file URL');
    }

    return result as MinimumUploadRequestResult;
  };

  /**
   * todo: docs how to customize the image and file upload by overriding do
   */

  doUploadRequest = async (
    fileLike: FileReference | FileLike,
    options?: UploadRequestOptions,
  ) => {
    const customUploadFn = this.config.doUploadRequest;
    if (customUploadFn) {
      return await customUploadFn(fileLike, options);
    }

    return this.doDefaultUploadRequest(fileLike, options);
  };

  /**
   * Uploads a file, or an existing local attachment, through the pre- and post-upload middleware.
   *
   * A file becomes a new attachment. An attachment keeps its `localMetadata.id`, its fields and its
   * position in `attachments`: a failed upload is retried in place, and an attachment the caller built
   * is uploaded with its own fields. An attachment without a file or a local id is returned unchanged,
   * with an error notification.
   *
   * Unlike {@link uploadFiles}, it does not check {@link isUploadEnabled}.
   */
  uploadFile = async (
    fileOrAttachment: FileReference | FileLike | LocalUploadAttachment,
  ) => {
    let initialAttachment: LocalUploadAttachment;
    if (isUploadInputAttachment(fileOrAttachment)) {
      if (!this.isUploadableOrNotify(fileOrAttachment)) return fileOrAttachment;
      initialAttachment = fileOrAttachment;
    } else {
      initialAttachment = AttachmentManager.toLocalUploadAttachment(fileOrAttachment);
    }

    const preUpload = await this.preUploadMiddlewareExecutor.execute({
      eventName: 'prepare',
      initialValue: { attachment: initialAttachment },
      mode: 'concurrent',
    });

    const attachment: LocalUploadAttachment = preUpload.state.attachment;

    if (preUpload.status === 'discard') return attachment;
    // todo: remove with the next major release as filtering can be done in middleware
    // should we return the attachment object?
    if (!this.fileUploadFilter(attachment)) return attachment;

    if (attachment.localMetadata.uploadState === 'blocked') {
      this.upsertAttachments([attachment]);
      return preUpload.state.attachment;
    }

    return this.uploadAndProcess(attachment);
  };

  uploadFiles = async (files: FileReference[] | FileList | FileLike[]) => {
    if (!this.isUploadEnabled) return;

    const iterableFiles: FileReference[] | FileLike[] = isFileList(files)
      ? Array.from(files)
      : files;

    return await Promise.all(
      iterableFiles.slice(0, this.availableUploadSlots).map(this.uploadFile),
    );
  };

  /**
   * Uploads `attachment` (or joins its upload already running, see {@link UploadManager.upload}) and
   * runs the post-upload middleware over the result.
   */
  private uploadAndProcess = async (initialAttachment: LocalUploadAttachment) => {
    let attachment = initialAttachment;
    let response: MinimumUploadRequestResult | undefined;
    let error: Error | undefined;
    try {
      response = await this.upload(attachment);
    } catch (err) {
      error = toUploadError(err);
    }

    const postUpload = await this.postUploadMiddlewareExecutor.execute({
      eventName: 'postProcess',
      initialValue: {
        attachment: {
          ...attachment,
          localMetadata: {
            ...attachment.localMetadata,
            uploadState: error ? 'failed' : 'finished',
            uploadProgress: undefined,
            uploadConfirmationPending: false,
          },
        },
        error,
        response,
      },
      mode: 'concurrent',
    });
    attachment = postUpload.state.attachment;

    if (postUpload.status === 'discard') {
      this.removeAttachments([attachment.localMetadata.id]);
      return attachment;
    }

    this.updateAttachment(attachment);
    return attachment;
  };

  private upload(attachment: LocalUploadAttachment) {
    const localId = attachment.localMetadata.id;

    this.upsertAttachments([
      {
        ...attachment,
        localMetadata: {
          ...attachment.localMetadata,
          uploadState: 'uploading',
          uploadProgress: this.config.trackUploadProgress ? 0 : undefined,
          uploadConfirmationPending: false,
        },
      },
    ]);

    const unsubscribe = this.client.uploadManager.state.subscribeWithSelector(
      (s) => ({ upload: s.uploads[localId] }),
      ({ upload: nextUpload }) => {
        if (!nextUpload) return;
        this.updateAttachment({
          ...attachment,
          localMetadata: {
            ...attachment.localMetadata,
            uploadState: 'uploading',
            uploadProgress: nextUpload.uploadProgress,
            uploadConfirmationPending: nextUpload.uploadConfirmationPending,
          },
        });
      },
    );

    return this.client.uploadManager
      .upload({
        id: localId,
        channelCid: this.channel.cid,
        file: attachment.localMetadata.file,
      })
      .finally(() => {
        unsubscribe();
      });
  }
}
