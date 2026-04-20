import type { StreamChat } from './client';
import { StateStore } from './store';
import type { AttachmentManager } from '.';

export type UploadRecord = {
  id: string;
  uploadProgress?: number;
};

export type UploadManagerState = {
  uploads: UploadRecord[];
};

type UploadPromise = ReturnType<typeof AttachmentManager.prototype.doUploadRequest>;

type InFlightUpload = {
  abortController: AbortController;
  promise: UploadPromise;
  reject: (reason?: unknown) => void;
};

const initState = (): UploadManagerState => ({ uploads: [] });

const createCanceledUploadError = () => {
  const error = new Error('Upload canceled') as Error & { code?: string; name: string };
  error.code = 'ERR_CANCELED';
  error.name = 'AbortError';
  return error;
};

const upsertById = (uploads: UploadRecord[], record: UploadRecord): UploadRecord[] => {
  const idx = uploads.findIndex((u) => u.id === record.id);
  if (idx === -1) return [...uploads, record];
  const current = uploads[idx];
  if (current === record) return uploads;
  const next = [...uploads];
  next[idx] = { ...current, ...record };
  return next;
};

const updateById = (
  uploads: UploadRecord[],
  record: UploadRecord,
): UploadRecord[] | null => {
  const idx = uploads.findIndex((u) => u.id === record.id);
  if (idx === -1) return null;
  const current = uploads[idx];
  const next = [...uploads];
  next[idx] = { ...current, ...record };
  return next;
};

/**
 * @internal
 */
export class UploadManager {
  readonly state: StateStore<UploadManagerState>;

  private inFlightUploads = new Map<string, InFlightUpload>();

  constructor(private readonly client: StreamChat) {
    this.state = new StateStore<UploadManagerState>(initState());
  }

  private resolveAttachmentManager(channelCid: string) {
    const colon = channelCid.indexOf(':');
    if (colon <= 0 || colon === channelCid.length - 1) {
      throw new Error(`Invalid channelCid: ${channelCid}`);
    }
    const channelType = channelCid.slice(0, colon);
    const channelId = channelCid.slice(colon + 1);
    return this.client.channel(channelType, channelId).messageComposer.attachmentManager;
  }

  get uploads() {
    return this.state.getLatestValue().uploads;
  }

  getUpload = (id: string) => this.uploads.find((u) => u.id === id);

  /**
   * Clears all upload records.
   * Invoked when the user disconnects so a later session does not inherit stale upload state.
   */
  reset = () => {
    for (const upload of this.inFlightUploads.values()) {
      upload.abortController.abort();
      upload.reject(createCanceledUploadError());
    }
    this.clearUploads();
  };

  /**
   * Removes the upload record for `id` if present and aborts the in-flight request.
   */
  deleteUploadRecord = (id: string, abortInFlight = true) => {
    const inFlightUpload = this.inFlightUploads.get(id);
    if (abortInFlight && inFlightUpload) {
      inFlightUpload.abortController.abort();
      inFlightUpload.reject(createCanceledUploadError());
    }
    this.clearUpload(id);
  };

  private clearUploads = () => {
    this.inFlightUploads.clear();
    this.state.next(initState());
  };

  private clearUpload = (id: string) => {
    this.state.next((current) => {
      const nextUploads = current.uploads.filter((u) => u.id !== id);
      if (nextUploads.length === current.uploads.length) return current;
      return { ...current, uploads: nextUploads };
    });
    this.inFlightUploads.delete(id);
  };

  /**
   * Starts an upload for `id`, or returns the existing in-flight promise if one is already running.
   * Uses {@link StreamChat.channel}(`channelCid`) → `messageComposer.attachmentManager.doUploadRequest`.
   * Resolves with that result; rejects if the upload rejects (the record is removed from state either way).
   */
  upload = ({
    id,
    channelCid,
    file,
  }: {
    id: string;
    channelCid: string;
    file: Parameters<typeof AttachmentManager.prototype.doUploadRequest>[0];
  }): ReturnType<typeof AttachmentManager.prototype.doUploadRequest> => {
    const existingUpload = this.inFlightUploads.get(id);
    if (existingUpload) return existingUpload.promise;

    let resolvePromise!: (
      value: Awaited<ReturnType<typeof AttachmentManager.prototype.doUploadRequest>>,
    ) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<
      Awaited<ReturnType<typeof AttachmentManager.prototype.doUploadRequest>>
    >((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const inFlightUpload: InFlightUpload = {
      abortController: new AbortController(),
      promise,
      reject: rejectPromise,
    };
    this.inFlightUploads.set(id, inFlightUpload);

    void (async () => {
      const attachmentManager = this.resolveAttachmentManager(channelCid);
      const trackProgress = attachmentManager.config.trackUploadProgress;
      try {
        this.upsertUpload({
          id,
          uploadProgress: trackProgress ? 0 : undefined,
        });

        const onProgress = trackProgress
          ? (progress?: number) => {
              if (this.inFlightUploads.get(id) !== inFlightUpload) return;
              this.updateUpload({
                id,
                uploadProgress: progress,
              });
            }
          : undefined;

        const response = await attachmentManager.doUploadRequest(file, {
          ...(onProgress ? { onProgress } : {}),
          signal: inFlightUpload.abortController.signal,
        });
        if (this.inFlightUploads.get(id) !== inFlightUpload) return;
        resolvePromise(response);
      } catch (error) {
        if (this.inFlightUploads.get(id) !== inFlightUpload) return;
        rejectPromise(error);
      } finally {
        if (this.inFlightUploads.get(id) === inFlightUpload) {
          this.clearUpload(id);
        }
      }
    })();

    return promise;
  };

  private upsertUpload = (record: UploadRecord) => {
    this.state.partialNext({
      uploads: upsertById(this.uploads, record),
    });
  };

  private updateUpload = (record: UploadRecord) => {
    this.state.next((current) => {
      const nextUploads = updateById(current.uploads, record);
      if (!nextUploads) return current;
      return { ...current, uploads: nextUploads };
    });
  };
}
