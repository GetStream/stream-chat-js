import { MessageComposer, MiddlewareStatus } from '../../../../../../src';
import { describe, expect, it, vi } from 'vitest';
import {
  AttachmentPostUploadMiddlewareState,
  createUploadErrorHandlerMiddleware,
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
  const composer = new MessageComposer({
    client,
    compositionContext: client.channel('type', 'id'),
  });
  return { composer, middleware: createUploadErrorHandlerMiddleware(composer) };
};

describe('createUploadErrorHandlerMiddleware', () => {
  it('discards if attachment is not present in middleware state', async () => {
    const { composer, middleware } = setup();
    const addErrorNotificationSpy = vi
      .spyOn(composer.client.notifications, 'addError')
      .mockImplementation();
    const { status } = await middleware.handlers.postProcess(
      setupHandlerParams({ error: new Error() }),
    );
    expect(status).toBe('discard');
    expect(addErrorNotificationSpy).not.toHaveBeenCalled();
  });
  it('forwards if error is not present in middleware state', async () => {
    const { composer, middleware } = setup();
    const addErrorNotificationSpy = vi
      .spyOn(composer.client.notifications, 'addError')
      .mockImplementation();
    const { status } = await middleware.handlers.postProcess(setupHandlerParams({}));
    expect(status).toBeUndefined();
    expect(addErrorNotificationSpy).not.toHaveBeenCalled();
  });

  it('publishes error notification if the attachment upload was blocked', async () => {
    const { composer, middleware } = setup();
    const addErrorNotificationSpy = vi
      .spyOn(composer.client.notifications, 'addError')
      .mockImplementation();
    const attachment = {
      localMetadata: {
        id: 'id',
        file: {},
        uploadPermissionCheck: { uploadBlocked: true, reason: 'reason' },
      },
      type: 'file',
    };
    const error = new Error('message');
    const { status } = await middleware.handlers.postProcess(
      setupHandlerParams({ attachment, error }),
    );
    expect(status).toBeUndefined();
    expect(addErrorNotificationSpy).toHaveBeenCalledWith({
      message: 'Error uploading attachment',
      origin: {
        emitter: 'AttachmentManager',
        context: { attachment },
      },
      options: {
        type: 'api:attachment:upload:failed',
        metadata: { reason: error.message },
        originalError: error,
      },
    });
  });
});
