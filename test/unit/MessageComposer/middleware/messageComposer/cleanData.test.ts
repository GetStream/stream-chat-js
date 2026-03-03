import { describe, expect, it, vi } from 'vitest';
import {
  createCompositionDataCleanupMiddleware,
  LocalMessage,
  MessageComposerMiddlewareState,
} from '../../../../../src';

const setupMiddlewareApi = (initialState: MessageComposerMiddlewareState) => {
  return {
    state: initialState,
    next: vi.fn().mockReturnValue(null),
    complete: vi.fn().mockReturnValue(null),
    discard: vi.fn().mockReturnValue(null),
    forward: vi.fn().mockReturnValue(null),
  };
};

const stateSeed: MessageComposerMiddlewareState = {
  message: {
    id: 'test-id',
    parent_id: undefined,
    type: 'regular',
  },
  localMessage: {
    attachments: [],
    created_at: new Date(),
    deleted_at: null,
    error: undefined,
    id: 'test-id',
    mentioned_users: [],
    parent_id: undefined,
    pinned_at: null,
    reaction_groups: null,
    status: 'sending',
    text: '',
    type: 'regular',
    updated_at: new Date(),
  },
  sendOptions: {},
};

describe('stream-io/message-composer-middleware/data-cleanup', () => {
  it('should forward if the message type is not error', async () => {
    const mockComposer = {
      editedMessage: { id: 'test-id', type: 'regular' } as LocalMessage,
    } as any;
    const middleware = createCompositionDataCleanupMiddleware(mockComposer);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);
    expect(middlewareApi.next).toHaveBeenCalledWith({
      ...stateSeed,
      localMessage: {
        ...stateSeed.localMessage,
        error: null,
        quoted_message: null,
        type: 'regular',
      },
      message: {
        ...stateSeed.message,
        mentioned_users: undefined,
        pinned: false,
        type: 'regular',
      },
    });
  });

  it('should forward if the message type is of type error with type regular', async () => {
    const mockComposer = {
      editedMessage: { id: 'test-id', type: 'error' } as LocalMessage,
    } as any;
    const middleware = createCompositionDataCleanupMiddleware(mockComposer);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);
    expect(middlewareApi.next).toHaveBeenCalledWith({
      ...stateSeed,
      localMessage: {
        ...stateSeed.localMessage,
        error: null,
        quoted_message: null,
        type: 'regular',
      },
      message: {
        ...stateSeed.message,
        mentioned_users: undefined,
        pinned: false,
        type: 'regular',
      },
    });
  });
});
