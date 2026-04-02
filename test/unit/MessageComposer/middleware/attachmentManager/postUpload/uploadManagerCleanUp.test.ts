import { MiddlewareStatus } from '../../../../../../src';
import { describe, expect, it, vi } from 'vitest';
import {
  AttachmentPostUploadMiddlewareState,
  createUploadManagerCleanUpMiddleware,
} from '../../../../../../src/messageComposer/middleware/attachmentManager';
import { getClientWithUser } from '../../../../test-utils/getClient';

vi.mock('../../../../../src/utils', () => ({
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
}));

const setupHandlerParams = (initialState: AttachmentPostUploadMiddlewareState) => {
  return {
    state: initialState,
    next: async (state: AttachmentPostUploadMiddlewareState) => ({ state }),
    complete: async (state: AttachmentPostUploadMiddlewareState) => ({
      state,
      status: 'complete' as MiddlewareStatus,
    }),
    discard: async () => ({ state: initialState, status: 'discard' as MiddlewareStatus }),
    forward: async () => ({ state: initialState }),
  };
};

const setup = () => {
  const client = getClientWithUser({ id: 'user-id' });
  const channel = client.channel('type', 'id');
  const composer = channel.messageComposer;
  return { composer, middleware: createUploadManagerCleanUpMiddleware(composer) };
};

describe('createUploadManagerCleanUpMiddleware', () => {
  it('forwards without deleting when attachment id is missing', async () => {
    const { composer, middleware } = setup();
    const deleteSpy = vi.spyOn(composer.client.uploadManager, 'deleteUploadRecords');
    const { status } = await middleware.handlers.postProcess(setupHandlerParams({}));
    expect(status).toBeUndefined();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('deletes upload record for attachment id and forwards on success', async () => {
    const { composer, middleware } = setup();
    vi.spyOn(composer.attachmentManager, 'doUploadRequest').mockResolvedValue({
      file: 'url',
    });
    void composer.client.uploadManager.upload({
      id: 'local-1',
      channelCid: composer.channel.cid,
      file: new File([], 'a.jpg'),
      shouldTrackProgress: false,
    });
    await vi.waitFor(() => {
      expect(composer.client.uploadManager.getUpload('local-1')?.state).toBe('finished');
    });

    const { status } = await middleware.handlers.postProcess(
      setupHandlerParams({
        attachment: {
          type: 'image',
          localMetadata: {
            id: 'local-1',
            file: new File([], 'a.jpg'),
            uploadState: 'finished',
          },
        },
        response: { file: 'url' },
      }),
    );

    expect(status).toBeUndefined();
    expect(composer.client.uploadManager.getUpload('local-1')).toBeUndefined();
  });

  it('deletes upload record for attachment id and forwards on error', async () => {
    const { composer, middleware } = setup();
    vi.spyOn(composer.attachmentManager, 'doUploadRequest').mockRejectedValue(
      new Error('fail'),
    );
    void composer.client.uploadManager
      .upload({
        id: 'local-2',
        channelCid: composer.channel.cid,
        file: new File([], 'a.jpg'),
        shouldTrackProgress: false,
      })
      .catch(() => undefined);
    await vi.waitFor(() => {
      expect(composer.client.uploadManager.getUpload('local-2')?.state).toBe('failed');
    });

    const { status } = await middleware.handlers.postProcess(
      setupHandlerParams({
        attachment: {
          type: 'image',
          localMetadata: {
            id: 'local-2',
            file: new File([], 'a.jpg'),
            uploadState: 'failed',
          },
        },
        error: new Error('fail'),
      }),
    );

    expect(status).toBeUndefined();
    expect(composer.client.uploadManager.getUpload('local-2')).toBeUndefined();
  });
});
