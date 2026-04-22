import type { StreamChat } from './client';
import type { UploadRequestOptions } from './messageComposer/configuration/types';
import { StateStore } from './store';
import type { AttachmentManager } from '.';

export type UploadRecord = {
  id: string;
  uploadProgress?: number;
};

export type UploadManagerState = {
  uploads: Record<string, UploadRecord>;
};

const initState = (): UploadManagerState => ({ uploads: {} });

const upsertById = (
  uploads: Record<string, UploadRecord>,
  record: UploadRecord,
): Record<string, UploadRecord> => ({
  ...uploads,
  [record.id]: { ...uploads[record.id], ...record },
});

const updateById = (
  uploads: Record<string, UploadRecord>,
  record: UploadRecord,
): Record<string, UploadRecord> | null => {
  if (!(record.id in uploads)) return null;
  const current = uploads[record.id];
  return { ...uploads, [record.id]: { ...current, ...record } };
};

type UploadPromise = ReturnType<typeof AttachmentManager.prototype.doUploadRequest>;

type InFlightUpload = { promise: UploadPromise; abortController: AbortController };

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

  getUpload = (id: string) => this.uploads[id];

  /**
   * Clears all upload records.
   * Invoked when the user disconnects so a later session does not inherit stale upload state.
   * Aborts every in-flight upload request via its `UploadRequestOptions.abortSignal`.
   */
  reset = () => {
    for (const { abortController } of this.inFlightUploads.values()) {
      abortController.abort();
    }
    this.inFlightUploads.clear();
    this.state.next(initState());
  };

  /**
   * Removes the upload record for `id` if present.
   * If an upload is still in progress, aborts its `UploadRequestOptions.abortSignal`.
   */
  deleteUploadRecord = (id: string) => {
    const flight = this.inFlightUploads.get(id);
    if (flight) {
      this.inFlightUploads.delete(id);
      flight.abortController.abort();
    }
    this.state.next((current) => {
      if (!(id in current.uploads)) return current;
      const uploads = { ...current.uploads };
      delete uploads[id];
      return { ...current, uploads };
    });
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
    const existing = this.inFlightUploads.get(id);
    if (existing) return existing.promise;

    let resolvePromise!: (value: Awaited<UploadPromise>) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<Awaited<UploadPromise>>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const abortController = new AbortController();
    this.inFlightUploads.set(id, { promise, abortController });

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
              this.updateUpload({
                id,
                uploadProgress: progress,
              });
            }
          : undefined;

        const uploadRequestOptions: UploadRequestOptions = {
          abortSignal: abortController.signal,
          ...(onProgress ? { onProgress } : {}),
        };

        const response = await attachmentManager.doUploadRequest(
          file,
          uploadRequestOptions,
        );
        resolvePromise(response);
      } catch (error) {
        rejectPromise(error);
      } finally {
        this.inFlightUploads.delete(id);
        this.deleteUploadRecord(id);
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
