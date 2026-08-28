import axios from 'axios';

import type { StreamChat } from './client';
import type { UploadRequestOptions } from './messageComposer/configuration/types';
import { StateStore } from './store';
import type { AttachmentManager } from '.';

/**
 * Whether an upload ended because it was aborted rather than because it failed.
 *
 * {@link UploadManager.deleteUploadRecord} and {@link UploadManager.cancelAllUploads} abort the
 * request through its `AbortController`, which is what happens when an attachment is removed
 * from the composer mid-upload or the client disconnects. Axios reports that as a
 * `CanceledError` (`axios.isCancel`); a custom `doUploadRequest` on another transport
 * conventionally throws a `DOMException` named `AbortError`.
 *
 * Callers use this to keep a deliberate cancellation from being reported as an error.
 */
export const isUploadCancellation = (error: unknown) =>
  axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError');

export type UploadRecord = {
  id: string;
  /**
   * `true` once every byte has been handed to the transport but the server has not responded
   * yet.
   *
   * Upload progress measures bytes *written to the connection*, not bytes the server
   * acknowledged, so it reaches 100% the moment the request body is flushed — then the
   * connection sits idle while the CDN ingests the file and the response travels back. On a
   * large file over a slow link that window is long, and a UI that renders 100% as "done"
   * claims the upload is confirmed while it is not.
   *
   * Nothing measurable happens during that window, so it is the point at which a determinate
   * progress bar should hand over to an indeterminate one. Confirmation is the record being
   * removed, not progress reaching 100.
   *
   * Requires `AttachmentManagerConfig.trackUploadProgress`; without progress reporting there is
   * no way to tell when the flush happened, and this stays `false`.
   */
  uploadConfirmationPending?: boolean;
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
          uploadConfirmationPending: false,
          id,
          uploadProgress: trackProgress ? 0 : undefined,
        });

        const onProgress = trackProgress
          ? (progress?: number) => {
              this.updateUpload({
                id,
                uploadProgress: progress,
                // Only a number says anything about the flush, so a report without one leaves
                // the flag alone: `undefined` means the transport cannot measure this upload,
                // not that bytes were un-sent. Lowering it there would drop a UI that had
                // already gone indeterminate back to a determinate one with nothing to show.
                //
                // The record is removed in the `finally` below, so a record that still exists
                // while reporting 100% can only mean "flushed, awaiting the response".
                ...(typeof progress === 'number'
                  ? { uploadConfirmationPending: progress >= 100 }
                  : {}),
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
