import type { StreamChat } from './client';
import type { FileLike, FileReference } from './types';
import { StateStore } from './store';

export type UploadRecord =
  | {
      id: string;
      state: 'uploading';
      uploadProgress?: number;
      error: undefined;
    }
  | {
      id: string;
      state: 'finished';
      response: unknown;
      uploadProgress: undefined;
      error: undefined;
    }
  | {
      id: string;
      state: 'failed';
      error: unknown;
      uploadProgress: undefined;
    };

export type UploadManagerState = {
  uploads: UploadRecord[];
};

const initState = (): UploadManagerState => ({ uploads: [] });

const upsertById = (uploads: UploadRecord[], record: UploadRecord): UploadRecord[] => {
  const idx = uploads.findIndex((u) => u.id === record.id);
  if (idx === -1) return [...uploads, record];
  const current = uploads[idx];
  if (current === record) return uploads;
  const next = [...uploads];
  next[idx] = { ...current, ...record };
  return next;
};

/**
 * @experimental - not yet ready for production use
 */
export class UploadManager {
  readonly state: StateStore<UploadManagerState>;

  /** In-flight upload promises keyed by id (dedupes concurrent `upload` calls). */
  private inFlightUploads = new Map<string, Promise<unknown>>();

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
    this.inFlightUploads.clear();
    this.state.next(initState());
  };

  /**
   * Removes every upload record matching `predicate`.
   */
  deleteUploadRecords = (predicate: (upload: UploadRecord) => boolean) => {
    this.state.next((current) => {
      const nextUploads = current.uploads.filter((u) => !predicate(u));
      if (nextUploads.length === current.uploads.length) return current;
      return { ...current, uploads: nextUploads };
    });
  };

  private upsertUpload = (record: UploadRecord) => {
    this.state.next((current) => ({
      ...current,
      uploads: upsertById(current.uploads, record),
    }));
  };

  private finalizeSuccess = (id: string, response: unknown) => {
    // Mark finished then clear on the next state update.
    this.upsertUpload({
      id,
      state: 'finished',
      uploadProgress: undefined,
      error: undefined,
      response,
    });
  };

  /**
   * Starts an upload for `id`, or returns the existing in-flight promise if one is already running.
   * Uses {@link StreamChat.channel}(`channelCid`) → `messageComposer.attachmentManager.doUploadRequest`.
   * Resolves with that result; rejects if the upload rejects (state is still set to `failed`).
   */
  upload = ({
    id,
    channelCid,
    file,
    shouldTrackProgress,
  }: {
    id: string;
    channelCid: string;
    file: FileReference | FileLike;
    shouldTrackProgress?: boolean;
  }): Promise<unknown> => {
    const existingPromise = this.inFlightUploads.get(id);
    if (existingPromise) return existingPromise;

    let resolvePromise!: (value: unknown) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<unknown>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    this.inFlightUploads.set(id, promise);

    void (async () => {
      const attachmentManager = this.resolveAttachmentManager(channelCid);
      const trackProgress =
        shouldTrackProgress ?? attachmentManager.config.trackUploadProgress;
      try {
        this.upsertUpload({
          id,
          state: 'uploading',
          uploadProgress: trackProgress ? 0 : undefined,
          error: undefined,
        });

        const onProgress = trackProgress
          ? (progress?: number) => {
              this.upsertUpload({
                id,
                state: 'uploading',
                uploadProgress: progress,
                error: undefined,
              });
            }
          : undefined;

        const response = await attachmentManager.doUploadRequest(
          file,
          onProgress ? { onProgress } : undefined,
        );
        this.finalizeSuccess(id, response);
        resolvePromise(response);
      } catch (error) {
        this.upsertUpload({
          id,
          state: 'failed',
          uploadProgress: undefined,
          error,
        });
        rejectPromise(error);
      } finally {
        this.inFlightUploads.delete(id);
      }
    })();

    return promise;
  };
}
