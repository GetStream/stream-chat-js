import { StateStore } from './store';

export type UploadRecord =
  | {
      uri: string;
      localId: string;
      state: 'uploading';
      uploadProgress?: number;
      error: undefined;
    }
  | {
      uri: string;
      localId: string;
      state: 'finished';
      response: unknown;
      uploadProgress: undefined;
      error: undefined;
    }
  | {
      uri: string;
      localId: string;
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

const upsertByLocalId = (
  uploads: UploadRecord[],
  record: UploadRecord,
): UploadRecord[] => {
  const idx = uploads.findIndex((u) => u.localId === record.localId);
  if (idx === -1) return [...uploads, record];
  const current = uploads[idx];
  if (current === record) return uploads;
  const next = [...uploads];
  next[idx] = { ...current, ...record };
  return next;
};

export class UploadManager {
  readonly state: StateStore<UploadManagerState>;
  private uploadMethods = new Map<string, UploadMethod>();

  constructor() {
    this.state = new StateStore<UploadManagerState>(initState());
  }

  get uploads() {
    return this.state.getLatestValue().uploads;
  }

  getUpload = (localId: string) => this.uploads.find((u) => u.localId === localId);

  /**
   * Clears all upload records and in-memory upload handles.
   * Invoked when the user disconnects so a later session does not inherit stale upload state.
   */
  reset = () => {
    this.state.next(initState());
    this.uploadMethods.clear();
  };

  /**
   * Removes every upload record matching `predicate` and drops associated retry handles.
   */
  deleteUploadRecords = (predicate: (upload: UploadRecord) => boolean) => {
    const removed: UploadRecord[] = [];
    this.state.next((current) => {
      const nextUploads: UploadRecord[] = [];
      for (const u of current.uploads) {
        if (predicate(u)) removed.push(u);
        else nextUploads.push(u);
      }
      if (removed.length === 0) return current;
      return { ...current, uploads: nextUploads };
    });
    for (const u of removed) {
      this.uploadMethods.delete(u.localId);
    }
  };

  private upsertUpload = (record: UploadRecord) => {
    this.state.next((current) => ({
      ...current,
      uploads: upsertByLocalId(current.uploads, record),
    }));
  };

  private finalizeSuccess = (uri: string, localId: string, response: unknown) => {
    // Mark finished then clear on the next state update.
    this.upsertUpload({
      uri,
      localId,
      state: 'finished',
      uploadProgress: undefined,
      error: undefined,
      response,
    });
  };

  startUpload = async ({
    uri,
    localId,
    shouldTrackProgress,
    uploadMethod,
  }: {
    uri: string;
    localId: string;
    shouldTrackProgress?: boolean;
    uploadMethod: UploadMethod;
  }): Promise<void> => {
    // De-duplication: do not start a second upload while uploading.
    // If previous state is failed, allow a new startUpload to re-attempt.
    const existing = this.getUpload(localId);
    if (existing?.state === 'uploading') return;

    this.uploadMethods.set(localId, uploadMethod);

    const trackProgress = shouldTrackProgress ?? true;
    this.upsertUpload({
      uri,
      localId,
      state: 'uploading',
      uploadProgress: trackProgress ? 0 : undefined,
      error: undefined,
    });

    const onProgress = trackProgress
      ? (progress?: number) => {
          this.upsertUpload({
            uri,
            localId,
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
        uri,
        localId,
        state: 'failed',
        uploadProgress: undefined,
        error,
      });
      // Do not rethrow; integrators can observe failure from state.
      return;
    }

    this.finalizeSuccess(uri, localId, response);
  };

  /**
   * Retries every failed upload for which `predicate` returns true.
   *
   * @throws If any matching failed upload has no stored upload method (inconsistent internal state).
   */
  retryUploads = async (predicate: (upload: UploadRecord) => boolean): Promise<void> => {
    const { uploads } = this.state.getLatestValue();
    const targets = uploads.filter((u) => u.state === 'failed' && predicate(u));

    const withMethods: { upload: UploadRecord; uploadMethod: UploadMethod }[] = [];
    for (const u of targets) {
      const uploadMethod = this.uploadMethods.get(u.localId);
      if (!uploadMethod) {
        throw new Error(
          `UploadManager.retryUploads: missing upload method for uri="${u.uri}" localId="${u.localId}"`,
        );
      }
      withMethods.push({ upload: u, uploadMethod });
    }

    await Promise.all(
      withMethods.map(({ upload: u, uploadMethod }) =>
        this.startUpload({ uri: u.uri, localId: u.localId, uploadMethod }),
      ),
    );
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
