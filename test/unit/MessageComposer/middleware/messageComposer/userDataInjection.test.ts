import { describe, expect, it, vi } from 'vitest';
import { MessageComposerMiddlewareState } from '../../../../../src';
import { createUserDataInjectionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/userDataInjection';

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

const mockComposer = {
  client: {
    user: {
      id: 'test-user',
      name: 'Cool Person',
    },
  },
} as any;

describe('stream-io/message-composer-middleware/user-data-injection', () => {
  it('should complete if composer.client.user is defined', async () => {
    const middleware = createUserDataInjectionMiddleware(mockComposer);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);

    expect(middlewareApi.next).toHaveBeenCalledWith({
      ...stateSeed,
      localMessage: {
        ...stateSeed.localMessage,
        user: mockComposer.client.user,
        user_id: mockComposer.client.user.id,
      },
    });
    expect(middlewareApi.forward).not.toHaveBeenCalled();
  });

  it('should complete if composer.client.user is undefined', async () => {
    const composerWithoutUser = {
      ...mockComposer,
      client: {
        ...mockComposer.client,
        user: undefined,
      },
    };

    const middleware = createUserDataInjectionMiddleware(composerWithoutUser);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);

    expect(middlewareApi.next).not.toHaveBeenCalled();
    expect(middlewareApi.forward).toHaveBeenCalled();
  });

  it('should exclude mutes, channel_mutes and devices from OwnUserResponse if available', async () => {
    const composerWithOwnUserData = {
      ...mockComposer,
      client: {
        ...mockComposer.client,
        user: {
          ...mockComposer.client.user,
          mutes: [1, 2, 3],
          channel_mutes: [3, 4, 5],
          devices: [5, 6, 7],
        },
      },
    };
    const middleware = createUserDataInjectionMiddleware(composerWithOwnUserData);
    const middlewareApi = setupMiddlewareApi(stateSeed);
    await middleware.handlers.compose(middlewareApi);

    expect(middlewareApi.next).toHaveBeenCalledWith({
      ...stateSeed,
      localMessage: {
        ...stateSeed.localMessage,
        user: mockComposer.client.user,
        user_id: mockComposer.client.user.id,
      },
    });
    expect(middlewareApi.forward).not.toHaveBeenCalled();
  });
});
