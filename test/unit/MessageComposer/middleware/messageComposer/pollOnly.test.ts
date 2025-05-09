import { describe, expect, it, vi } from 'vitest';
import { MessageComposerMiddlewareState } from '../../../../../src';
import { createPollOnlyCompositionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/pollOnly';

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

describe('stream-io/message-composer-middleware/poll-only', () => {
  it('should complete if poll id available and not editing a message or composing a thread reply', async () => {
    const messageComposer = {
      pollId: 'poll-id',
      editedMessage: false,
      threadId: false,
    } as any;

    const middleware = createPollOnlyCompositionMiddleware(messageComposer);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);

    expect(middlewareApi.complete).toHaveBeenCalledWith({
      localMessage: {
        ...stateSeed.localMessage,
        poll_id: messageComposer.pollId,
      },
      message: {
        id: stateSeed.localMessage.id,
        poll_id: messageComposer.pollId,
      },
      sendOptions: {},
    });
  });
  it('should forward if poll id is undefined', async () => {
    const messageComposer = {
      pollId: false,
      editedMessage: false,
      threadId: false,
    } as any;

    const middleware = createPollOnlyCompositionMiddleware(messageComposer);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);

    expect(middlewareApi.forward).toHaveBeenCalled();
  });
  it('should forward if editing a message', async () => {
    const messageComposer = {
      pollId: true,
      editedMessage: true,
      threadId: false,
    } as any;

    const middleware = createPollOnlyCompositionMiddleware(messageComposer);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);

    expect(middlewareApi.forward).toHaveBeenCalled();
  });
  it('should forward if composing a thread reply', async () => {
    const messageComposer = {
      pollId: true,
      editedMessage: false,
      threadId: true,
    } as any;

    const middleware = createPollOnlyCompositionMiddleware(messageComposer);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);

    expect(middlewareApi.forward).toHaveBeenCalled();
  });
});
