import {
  AttachmentManager,
  MessageComposer,
  MiddlewareStatus,
} from '../../../../../../src';
import { describe, expect, it, vi } from 'vitest';
import {
  AttachmentPreUploadMiddlewareState,
  createBlockedAttachmentUploadNotificationMiddleware,
} from '../../../../../../src/messageComposer/middleware/attachmentManager';
import { getClientWithUser } from '../../../../test-utils/getClient';

vi.mock('../../../../../src/utils', () => ({
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
}));

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

const setup = () => {
  const client = getClientWithUser({ id: 'user-id' });
  const composer = new MessageComposer({
    client,
    compositionContext: client.channel('type', 'id'),
  });
  return {
    composer,
    middleware: createBlockedAttachmentUploadNotificationMiddleware(composer),
  };
};

const getInitialState = (
  composer: MessageComposer,
): AttachmentPreUploadMiddlewareState => ({
  attachment: AttachmentManager.toLocalUploadAttachment(
    new File([''], 'test.jpg', { type: 'image/jpeg' }),
  ),
});

describe('createBlockedAttachmentUploadNotificationMiddleware', () => {
  it('forwards if attachment is not present in middleware state', async () => {
    const middleware = createBlockedAttachmentUploadNotificationMiddleware({});
    const { status } = await middleware.handlers.prepare(setupHandlerParams({}));
    expect(status).toBeUndefined();
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
    const { status } = await middleware.handlers.prepare(
      setupHandlerParams({ attachment }),
    );
    expect(status).toBeUndefined();
    expect(addErrorNotificationSpy).toHaveBeenCalledWith({
      message: `The attachment upload was blocked`,
      origin: {
        emitter: 'AttachmentManager',
        context: { blockedAttachment: attachment },
      },
      options: {
        type: 'validation:attachment:upload:blocked',
        metadata: {
          reason: attachment.localMetadata.uploadPermissionCheck?.reason,
        },
      },
    });
  });

  it('does not publish error notification if the attachment upload was not blocked', async () => {
    const { composer, middleware } = setup();
    const addErrorNotificationSpy = vi
      .spyOn(composer.client.notifications, 'addError')
      .mockImplementation();
    const attachment = {
      localMetadata: {
        id: 'id',
        file: {},
        uploadPermissionCheck: { uploadBlocked: false, reason: '' },
      },
      type: 'file',
    };
    const { status } = await middleware.handlers.prepare(
      setupHandlerParams({ attachment }),
    );
    expect(status).toBeUndefined();
    expect(addErrorNotificationSpy).not.toHaveBeenCalled();
  });
});
