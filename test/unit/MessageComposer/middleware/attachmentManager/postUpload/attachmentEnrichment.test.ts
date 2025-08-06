import {
  AttachmentManager,
  MessageComposer,
  MiddlewareStatus,
} from '../../../../../../src';
import { describe, expect, it, vi } from 'vitest';
import {
  AttachmentPostUploadMiddlewareState,
  createPostUploadAttachmentEnrichmentMiddleware,
} from '../../../../../../src/messageComposer/middleware/attachmentManager';

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

const getInitialState = (
  composer: MessageComposer,
): AttachmentPostUploadMiddlewareState => ({
  attachment: AttachmentManager.toLocalUploadAttachment(
    new File([''], 'test.jpg', { type: 'image/jpeg' }),
  ),
});

describe('createPostUploadAttachmentEnrichmentMiddleware', () => {
  it('discards if attachment is not present in middleware state', async () => {
    const middleware = createPostUploadAttachmentEnrichmentMiddleware();
    const initialAttachment = undefined;
    const initialResponse = {};
    const {
      status,
      state: { attachment, response },
    } = await middleware.handlers.postProcess(
      setupHandlerParams({ attachment: initialAttachment, response: initialResponse }),
    );
    expect(status).toBe('discard');
    expect(attachment).toEqual(initialAttachment);
    expect(response).toEqual(initialResponse);
  });
  it('discards if response is not present in middleware state', async () => {
    const middleware = createPostUploadAttachmentEnrichmentMiddleware();
    const initialAttachment = {};
    const initialResponse = undefined;
    const {
      status,
      state: { attachment, response },
    } = await middleware.handlers.postProcess(
      setupHandlerParams({ attachment: initialAttachment, response: initialResponse }),
    );
    expect(status).toBe('discard');
    expect(attachment).toEqual(initialAttachment);
    expect(response).toEqual(initialResponse);
  });
  it('forwards if error is present in middleware state', async () => {
    const middleware = createPostUploadAttachmentEnrichmentMiddleware();
    const initialAttachment = {};
    const {
      status,
      state: { attachment },
    } = await middleware.handlers.postProcess(
      setupHandlerParams({ attachment: initialAttachment, error: new Error() }),
    );
    expect(status).toBeUndefined();
    expect(attachment).toEqual(initialAttachment);
  });

  it('enriches image attachment', async () => {
    const middleware = createPostUploadAttachmentEnrichmentMiddleware();
    const initialAttachment = {
      localMetadata: {
        id: 'id',
        file: new File([''], 'test.jpg', { type: 'image/jpeg' }),
        previewUri: 'previewUri',
        uploadPermissionCheck: { uploadBlocked: false, reason: '' },
      },
      type: 'image',
    };
    const response = {
      file: 'https://example.com/file/url',
    };
    const {
      status,
      state: { attachment },
    } = await middleware.handlers.postProcess(
      setupHandlerParams({ attachment: initialAttachment, response }),
    );
    expect(status).toBeUndefined();
    expect(attachment).toEqual({
      ...initialAttachment,
      image_url: response.file,
      localMetadata: {
        id: 'id',
        file: initialAttachment.localMetadata.file,
        uploadPermissionCheck: { uploadBlocked: false, reason: '' },
      },
    });
  });

  it('enriches non-image attachment', async () => {
    const middleware = createPostUploadAttachmentEnrichmentMiddleware();
    const initialAttachment = {
      localMetadata: {
        id: 'id',
        file: new File([''], 'test.jpg', { type: 'image/jpeg' }),
        uploadPermissionCheck: { uploadBlocked: false, reason: '' },
      },
      // type: 'file',
    };
    const response = {
      file: 'https://example.com/file/url',
      thumb_url: 'https://example.com/thumb/url',
    };
    const {
      status,
      state: { attachment },
    } = await middleware.handlers.postProcess(
      setupHandlerParams({ attachment: initialAttachment, response }),
    );
    expect(status).toBeUndefined();
    expect(attachment).toEqual({
      ...initialAttachment,
      asset_url: response.file,
      thumb_url: response.thumb_url,
    });
  });
});
