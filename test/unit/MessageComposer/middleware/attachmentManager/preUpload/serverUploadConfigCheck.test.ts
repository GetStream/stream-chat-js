import {
  AttachmentManager,
  MessageComposer,
  MiddlewareStatus,
} from '../../../../../../src';
import { describe, expect, it, vi } from 'vitest';
import {
  AttachmentPreUploadMiddlewareState,
  createUploadConfigCheckMiddleware,
} from '../../../../../../src/messageComposer/middleware/attachmentManager';
import { getClientWithUser } from '../../../../test-utils/getClient';

const setupHandlerParams = (initialState: AttachmentPreUploadMiddlewareState) => {
  return {
    state: initialState,
    next: async (state: AttachmentPreUploadMiddlewareState) => ({ state }),
    complete: async (state: AttachmentPreUploadMiddlewareState) => ({
      state,
      status: 'complete' as MiddlewareStatus,
    }),
    discard: async () => ({ state: initialState, status: 'discard' as MiddlewareStatus }),
    forward: async () => ({ state: initialState }),
  };
};

// Mock dependencies
vi.mock('../../../../../src/utils', () => ({
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
}));

const setup = () => {
  const client = getClientWithUser({ id: 'user-id' });
  const composer = new MessageComposer({
    client,
    compositionContext: client.channel('type', 'id'),
  });
  return { composer, middleware: createUploadConfigCheckMiddleware(composer) };
};

const getInitialState = (
  composer: MessageComposer,
): AttachmentPreUploadMiddlewareState => ({
  attachment: AttachmentManager.toLocalUploadAttachment(
    new File([''], 'test.jpg', { type: 'image/jpeg' }),
  ),
});

describe('createUploadConfigCheckMiddleware', () => {
  it('discards when attachment manager is not in message composer', async () => {
    const middleware = createUploadConfigCheckMiddleware({});
    const { status } = await middleware.handlers.prepare(
      setupHandlerParams({
        attachment: {
          localMetadata: { id: 'id', file: {}, uploadState: '' },
          type: 'file',
        },
      }),
    );
    expect(status).toBe('discard');
  });
  it('discards when attachment is missing in the state', async () => {
    const { middleware } = setup();
    const { status } = await middleware.handlers.prepare(setupHandlerParams({}));
    expect(status).toBe('discard');
  });
  it('enriches the attachment with uploadPermissionCheck and updates the attachment.uploadState to blocked', async () => {
    const { composer, middleware } = setup();
    const uploadPermissionCheck = { uploadBlocked: true };
    vi.spyOn(composer.attachmentManager, 'getUploadConfigCheck').mockResolvedValue(
      uploadPermissionCheck,
    );
    const {
      status,
      state: { attachment },
    } = await middleware.handlers.prepare(setupHandlerParams(getInitialState(composer)));
    expect(status).toBeUndefined();
    expect(attachment.localMetadata.uploadPermissionCheck).toBe(uploadPermissionCheck);
    expect(attachment.localMetadata.uploadState).toBe('blocked');
  });
  it('updates the attachment.uploadState to pending', async () => {
    const { composer, middleware } = setup();
    const uploadPermissionCheck = { uploadBlocked: false };
    vi.spyOn(composer.attachmentManager, 'getUploadConfigCheck').mockResolvedValue(
      uploadPermissionCheck,
    );
    const {
      status,
      state: { attachment },
    } = await middleware.handlers.prepare(setupHandlerParams(getInitialState(composer)));
    expect(status).toBeUndefined();
    expect(attachment.localMetadata.uploadPermissionCheck).toBe(uploadPermissionCheck);
    expect(attachment.localMetadata.uploadState).toBe('pending');
  });
});
