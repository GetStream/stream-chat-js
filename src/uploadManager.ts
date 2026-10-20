import axios from 'axios';

import type { StreamChat } from './client';
import { chatLoggerSystem } from './logger';
import type { UploadRequestOptions } from './messageComposer/configuration/types';
import { StateStore } from '@stream-io/state-store';
import type { AttachmentManager, LocalAttachmentUploadMetadata } from '.';

const logger = chatLoggerSystem.getLogger('upload-manager');

/**
 * Whether an upload was aborted (attachment removed, client disconnected) rather than failed: an
 * axios `CanceledError`, or an `AbortError` from a custom `doUploadRequest`.
 */
export const isUploadCancellation = (error: unknown) =>
  axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError');

export type UploadRecord = {
  /** The attachment's local id (`localMetadata.id`); also the key this record is held under. */
  id: string;
  /**
   * `true` once every byte has been handed to the transport but the server has not responded yet.
   * Progress reaches 100% when the request body is flushed, before the server confirms, so a
   * determinate progress bar should turn indeterminate here. Confirmation is the record being
   * removed. Stays `false` without `AttachmentManagerConfig.trackUploadProgress`.
   */
  uploadConfirmationPending?: boolean;
  uploadProgress?: number;
};

/**
 * Whether every byte is sent but the server has not answered. Reads
 * {@link UploadRecord.uploadConfirmationPending} when present, else infers it from progress
 * reaching 100. Takes `localMetadata`, as carried by a message payload.
 */
export const isUploadConfirmationPending = (
  localMetadata?: Pick<
    LocalAttachmentUploadMetadata,
    'uploadConfirmationPending' | 'uploadProgress' | 'uploadState'
  >,
) => {
  if (!localMetadata || localMetadata.uploadState !== 'uploading') return false;
  if (localMetadata.uploadConfirmationPending !== undefined)
    return localMetadata.uploadConfirmationPending;

  return (
    localMetadata.uploadProgress !== undefined && localMetadata.uploadProgress >= 100
  );
};

export type UploadManagerState = {
  /**
   * In-flight uploads keyed by the attachment's local id (`localMetadata.id`), which makes
   * {@link UploadManager.upload} idempotent. A record lives only for the request (removed on
   * success and failure alike), so for "did it upload" read `localMetadata.uploadState`.
   */
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
    const colon = ':';
    const colonIndex = channelCid.indexOf(colon);
    if (colonIndex <= 0 || colonIndex === channelCid.length - 1) {
      throw new Error(`Invalid channelCid: ${channelCid}`);
    }
    const [channelType, channelId] = channelCid.split(colon);
    return this.client.channelManager.ensure({ type: channelType, id: channelId })
      .messageComposer.attachmentManager;
  }

  get uploads() {
    return this.state.getLatestValue().uploads;
  }

  getUpload = (id: string) => this.uploads[id];

  /**
   * Aborts every in-flight upload (`UploadRequestOptions.abortSignal`) and clears all records, so a
   * later session does not inherit them. Invoked on disconnect.
   */
  reset = () => {
    for (const { abortController } of this.inFlightUploads.values()) {
      abortController.abort();
    }
    this.inFlightUploads.clear();
    this.state.next(initState());
  };

  /** Removes the record for `id` and aborts its upload if still in progress. */
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
   * Uploads through the `attachmentManager.doUploadRequest` of the channel `channelCid`, and
   * rejects if that rejects (the record is removed from state either way).
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
                // Only a numeric report moves the flag (`undefined` means the transport cannot
                // measure). The record is removed in `finally`, so 100% on a live record means
                // "flushed, awaiting the response".
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
        if (!abortController.signal.aborted) {
          logger
            .withExtraTags('upload', channelCid)
            .error(`Upload "${id}" failed.`, { error });
        }
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
