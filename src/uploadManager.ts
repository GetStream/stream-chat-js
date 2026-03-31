import { StateStore } from './store';

export type UploadRecord =
  | {
      uri: string;
      messageId?: string;
      state: 'uploading';
      uploadProgress?: number;
      error: undefined;
    }
  | {
      uri: string;
      messageId?: string;
      state: 'finished';
      response: unknown;
      uploadProgress: undefined;
      error: undefined;
    }
  | {
      uri: string;
      messageId?: string;
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

const upsertByUriAndMessageId = (
  uploads: UploadRecord[],
  record: UploadRecord,
): UploadRecord[] => {
  const idx = uploads.findIndex(
    (u) =>
      u.uri === record.uri &&
      (record.messageId !== undefined ? u.messageId === record.messageId : true),
  );
  if (idx === -1) return [...uploads, record];
  const current = uploads[idx];
  if (current === record) return uploads;
  const next = [...uploads];
  next[idx] = { ...current, ...record };
  return next;
};

const removeByUriAndMessageId = (
  uploads: UploadRecord[],
  { uri, messageId }: { uri: string; messageId?: string },
): UploadRecord[] =>
  uploads.filter(
    (u) => u.uri !== uri || (messageId !== undefined ? u.messageId !== messageId : false),
  );

const makeUploadMethodKey = ({ uri, messageId }: { uri: string; messageId?: string }) =>
  messageId ? `${messageId}::${uri}` : uri;

export class UploadManager {
  readonly state: StateStore<UploadManagerState>;
  private uploadMethods = new Map<string, UploadMethod>();

  constructor() {
    this.state = new StateStore<UploadManagerState>(initState());
  }

  get uploads() {
    return this.state.getLatestValue().uploads;
  }

  getUpload = (uri: string, messageId?: string) =>
    this.uploads.find(
      (u) =>
        u.uri === uri && (messageId !== undefined ? u.messageId === messageId : true),
    );

  removeUploadRecord = ({ uri, messageId }: { uri: string; messageId?: string }) => {
    this.state.next((current) => {
      const nextUploads = removeByUriAndMessageId(current.uploads, { uri, messageId });
      return nextUploads === current.uploads
        ? current
        : {
            ...current,
            uploads: nextUploads,
          };
    });
    this.uploadMethods.delete(makeUploadMethodKey({ uri, messageId }));
  };

  private upsertUpload = (record: UploadRecord) => {
    this.state.next((current) => ({
      ...current,
      uploads: upsertByUriAndMessageId(current.uploads, record),
    }));
  };

  private finalizeSuccess = (uri: string, response: unknown, messageId?: string) => {
    // Mark finished then clear on the next state update.
    this.upsertUpload({
      uri,
      ...(messageId !== undefined ? { messageId } : {}),
      state: 'finished',
      uploadProgress: undefined,
      error: undefined,
      response,
    });
  };

  startUpload = async ({
    uri,
    messageId,
    shouldTrackProgress,
    uploadMethod,
  }: {
    uri: string;
    messageId?: string;
    shouldTrackProgress?: boolean;
    uploadMethod: UploadMethod;
  }): Promise<void> => {
    // De-duplication: do not start a second upload while uploading.
    // If previous state is failed, allow a new startUpload to re-attempt.
    const existing = this.getUpload(uri, messageId);
    if (existing?.state === 'uploading') return;

    this.uploadMethods.set(makeUploadMethodKey({ uri, messageId }), uploadMethod);

    const trackProgress = shouldTrackProgress ?? true;
    this.upsertUpload({
      uri,
      messageId,
      state: 'uploading',
      uploadProgress: trackProgress ? 0 : undefined,
      error: undefined,
    });

    const onProgress = trackProgress
      ? (progress?: number) => {
          this.upsertUpload({
            uri,
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
        state: 'failed',
        uploadProgress: undefined,
        error,
      });
      // Do not rethrow; integrators can observe failure from state.
      return;
    }

    this.finalizeSuccess(uri, response, messageId);
  };

  retryUpload = async ({
    uri,
    messageId,
  }: {
    uri: string;
    messageId?: string;
  }): Promise<void> => {
    const current = this.getUpload(uri, messageId);
    if (!current || current.state !== 'failed') return;

    const uploadMethod = this.uploadMethods.get(makeUploadMethodKey({ uri, messageId }));
    if (!uploadMethod) return;

    await this.startUpload({ uri, messageId, uploadMethod });
  };
}
