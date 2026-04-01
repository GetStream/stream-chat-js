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

export type UploadMethod = (args?: {
  onProgress?: (progress?: number) => void;
}) => Promise<unknown>;

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

export class UploadManager {
  readonly state: StateStore<UploadManagerState>;

  constructor() {
    this.state = new StateStore<UploadManagerState>(initState());
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
   * When an upload with the same `id` is already in progress (`uploading`), this call is ignored
   * (no second upload is started).
   */
  upload = async ({
    id,
    shouldTrackProgress,
    uploadMethod,
  }: {
    id: string;
    shouldTrackProgress?: boolean;
    uploadMethod: UploadMethod;
  }): Promise<void> => {
    // De-duplication: do not start a second upload while uploading.
    // If previous state is failed, allow a new upload to re-attempt.
    const existing = this.getUpload(id);
    if (existing?.state === 'uploading') return;

    const trackProgress = shouldTrackProgress ?? true;
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

    let response: unknown;
    try {
      response = await uploadMethod(onProgress ? { onProgress } : undefined);
    } catch (error) {
      this.upsertUpload({
        id,
        state: 'failed',
        uploadProgress: undefined,
        error,
      });
      // Do not rethrow; integrators can observe failure from state.
      return;
    }

    this.finalizeSuccess(id, response);
  };

  /**
   * Resolves when every upload that matches `predicate` is in a terminal state (`finished` or `failed`).
   * If no uploads match, resolves immediately (vacuous).
   */
  waitForUploads = (predicate: (upload: UploadRecord) => boolean): Promise<void> => {
    const allMatchedTerminal = (): boolean => {
      const { uploads } = this.state.getLatestValue();
      const matched = uploads.filter(predicate);
      if (matched.length === 0) return true;
      return matched.every((u) => u.state === 'finished' || u.state === 'failed');
    };

    return new Promise<void>((resolve) => {
      if (allMatchedTerminal()) {
        resolve();
        return;
      }

      const unsub = this.state.subscribe(() => {
        if (allMatchedTerminal()) {
          unsub();
          resolve();
        }
      });
    });
  };
}
