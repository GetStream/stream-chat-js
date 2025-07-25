import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessageComposerStateCompositionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/messageComposerState';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { LocalMessage } from '../../../../../src/types';
import { createDraftMessageComposerStateCompositionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/messageComposerState';
import { MessageComposerMiddlewareState } from '../../../../../src/messageComposer/middleware/messageComposer/types';
import { MiddlewareStatus } from '../../../../../src/middleware';
import { MessageDraftComposerMiddlewareValueState } from '../../../../../src/messageComposer/middleware/messageComposer/types';

const setupHandlerParams = (initialState: MessageComposerMiddlewareState) => {
  return {
    state: initialState,
    next: async (state: MessageComposerMiddlewareState) => ({ state }),
    complete: async (state: MessageComposerMiddlewareState) => ({
      state,
      status: 'complete' as MiddlewareStatus,
    }),
    discard: async () => ({ state: initialState, status: 'discard' as MiddlewareStatus }),
    forward: async () => ({ state: initialState }),
  };
};

const setupHandlerParamsDraft = (
  initialState: MessageDraftComposerMiddlewareValueState,
) => {
  return {
    state: initialState,
    next: async (state: MessageDraftComposerMiddlewareValueState) => ({ state }),
    complete: async (state: MessageDraftComposerMiddlewareValueState) => ({
      state,
      status: 'complete' as MiddlewareStatus,
    }),
    discard: async () => ({ state: initialState, status: 'discard' as MiddlewareStatus }),
    forward: async () => ({ state: initialState }),
  };
};

describe('stream-io/message-composer-middleware/own-state', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let messageComposerStateMiddleware: ReturnType<
    typeof createMessageComposerStateCompositionMiddleware
  >;

  beforeEach(() => {
    // Create a real StreamChat instance with minimal implementation
    client = new StreamChat('apiKey', {
      enableInsights: false,
      enableWSFallback: false,
    });

    channel = new Channel(client, 'messaging', 'test-channel', {
      members: [],
    });

    // Use the messageComposer property from the channel
    messageComposer = channel.messageComposer;

    // Create the middleware
    messageComposerStateMiddleware =
      createMessageComposerStateCompositionMiddleware(messageComposer);
  });

  it('should handle message without quoted message or poll', async () => {
    // Mock the composer properties
    vi.spyOn(messageComposer, 'quotedMessage', 'get').mockReturnValue(null);
    vi.spyOn(messageComposer, 'pollId', 'get').mockReturnValue(null);

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParams({
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
      }),
    );

    expect(result.state.message.quoted_message_id).toBeUndefined();
    expect(result.state.message.poll_id).toBeUndefined();
    expect(result.state.localMessage.quoted_message_id).toBeUndefined();
    expect(result.state.localMessage.poll_id).toBeUndefined();
    expect(result.state.localMessage.quoted_message).toBeUndefined();
  });

  it('should handle message with quoted message', async () => {
    // Create a mock quoted message
    const quotedMessage: LocalMessage = {
      id: 'quoted-message-id',
      attachments: [],
      created_at: new Date(),
      deleted_at: null,
      error: undefined,
      mentioned_users: [],
      parent_id: undefined,
      pinned_at: null,
      reaction_groups: null,
      status: 'sending',
      text: 'This is a quoted message',
      type: 'regular',
      updated_at: new Date(),
    };

    // Mock the composer properties
    vi.spyOn(messageComposer, 'quotedMessage', 'get').mockReturnValue(quotedMessage);
    vi.spyOn(messageComposer, 'pollId', 'get').mockReturnValue(null);

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParams({
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
      }),
    );

    expect(result.state.message.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.localMessage.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.localMessage.quoted_message).toBe(quotedMessage);
  });

  it('should handle message with poll', async () => {
    // Mock the composer properties
    vi.spyOn(messageComposer, 'quotedMessage', 'get').mockReturnValue(null);
    vi.spyOn(messageComposer, 'pollId', 'get').mockReturnValue('poll-id-123');

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParams({
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
      }),
    );

    expect(result.state.message.poll_id).toBe('poll-id-123');
    expect(result.state.localMessage.poll_id).toBe('poll-id-123');
  });

  it('should handle message with both quoted message and poll', async () => {
    // Create a mock quoted message
    const quotedMessage: LocalMessage = {
      id: 'quoted-message-id',
      attachments: [],
      created_at: new Date(),
      deleted_at: null,
      error: undefined,
      mentioned_users: [],
      parent_id: undefined,
      pinned_at: null,
      reaction_groups: null,
      status: 'sending',
      text: 'This is a quoted message',
      type: 'regular',
      updated_at: new Date(),
    };

    // Mock the composer properties
    vi.spyOn(messageComposer, 'quotedMessage', 'get').mockReturnValue(quotedMessage);
    vi.spyOn(messageComposer, 'pollId', 'get').mockReturnValue('poll-id-123');

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParams({
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
      }),
    );

    expect(result.state.message.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.message.poll_id).toBe('poll-id-123');
    expect(result.state.localMessage.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.localMessage.poll_id).toBe('poll-id-123');
    expect(result.state.localMessage.quoted_message).toBe(quotedMessage);
  });

  it('should preserve existing message and localMessage properties', async () => {
    // Create a mock quoted message
    const quotedMessage: LocalMessage = {
      id: 'quoted-message-id',
      attachments: [],
      created_at: new Date(),
      deleted_at: null,
      error: undefined,
      mentioned_users: [],
      parent_id: undefined,
      pinned_at: null,
      reaction_groups: null,
      status: 'sending',
      text: 'This is a quoted message',
      type: 'regular',
      updated_at: new Date(),
    };

    // Mock the composer properties
    vi.spyOn(messageComposer, 'quotedMessage', 'get').mockReturnValue(quotedMessage);
    vi.spyOn(messageComposer, 'pollId', 'get').mockReturnValue('poll-id-123');

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParams({
        message: {
          id: 'test-id',
          parent_id: undefined,
          type: 'regular',
          text: 'Original message text',
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
          text: 'Original local message text',
          type: 'regular',
          updated_at: new Date(),
        },
        sendOptions: {},
      }),
    );

    // Verify that the original properties are preserved
    expect(result.state.message.text).toBe('Original message text');
    expect(result.state.localMessage.text).toBe('Original local message text');

    // Verify that the new properties are added
    expect(result.state.message.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.message.poll_id).toBe('poll-id-123');
    expect(result.state.localMessage.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.localMessage.poll_id).toBe('poll-id-123');
    expect(result.state.localMessage.quoted_message).toBe(quotedMessage);
  });

  it('should include show_in_channel in the message payload', async () => {
    vi.spyOn(messageComposer, 'showReplyInChannel', 'get').mockReturnValue(true);

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParams({
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
      }),
    );

    expect(result.state.message.show_in_channel).toBe(true);
  });

  it('should not include show_in_channel in the message payload', async () => {
    vi.spyOn(messageComposer, 'showReplyInChannel', 'get').mockReturnValue(false);

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParams({
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
      }),
    );

    expect(result.state.message.show_in_channel).toBeUndefined();
  });
});

describe('stream-io/message-composer-middleware/draft-own-state', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let messageComposerStateMiddleware: ReturnType<
    typeof createDraftMessageComposerStateCompositionMiddleware
  >;

  beforeEach(() => {
    client = {
      userID: 'currentUser',
      user: { id: 'currentUser' },
    } as any;

    channel = {
      getClient: vi.fn().mockReturnValue(client),
      state: {
        members: {},
        watchers: {},
      },
      getConfig: vi.fn().mockReturnValue({ commands: [] }),
    } as any;

    messageComposer = {
      channel,
      client,
      quotedMessage: undefined,
      pollId: undefined,
      showReplyInChannel: false,
    } as any;

    messageComposerStateMiddleware =
      createDraftMessageComposerStateCompositionMiddleware(messageComposer);
  });

  it('should handle draft without quoted message or poll', async () => {
    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParamsDraft({
        draft: {
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.quoted_message_id).toBeUndefined();
    expect(result.state.draft.poll_id).toBeUndefined();
  });

  it('should handle draft with quoted message', async () => {
    const quotedMessage = {
      id: 'quoted-message-id',
      type: 'regular' as const,
      created_at: new Date(),
      deleted_at: null,
      pinned_at: null,
      status: 'received',
      updated_at: new Date(),
    };

    vi.spyOn(messageComposer, 'quotedMessage', 'get').mockReturnValue(quotedMessage);

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParamsDraft({
        draft: {
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.draft.poll_id).toBeUndefined();
  });

  it('should handle draft with poll', async () => {
    vi.spyOn(messageComposer, 'pollId', 'get').mockReturnValue('poll-id-123');

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParamsDraft({
        draft: {
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.quoted_message_id).toBeUndefined();
    expect(result.state.draft.poll_id).toBe('poll-id-123');
  });

  it('should handle draft with both quoted message and poll', async () => {
    const quotedMessage = {
      id: 'quoted-message-id',
      type: 'regular' as const,
      created_at: new Date(),
      deleted_at: null,
      pinned_at: null,
      status: 'received',
      updated_at: new Date(),
    };

    vi.spyOn(messageComposer, 'quotedMessage', 'get').mockReturnValue(quotedMessage);
    vi.spyOn(messageComposer, 'pollId', 'get').mockReturnValue('poll-id-123');

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParamsDraft({
        draft: {
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.draft.poll_id).toBe('poll-id-123');
  });

  it('should preserve existing draft properties', async () => {
    const quotedMessage = {
      id: 'quoted-message-id',
      type: 'regular' as const,
      created_at: new Date(),
      deleted_at: null,
      pinned_at: null,
      status: 'received',
      updated_at: new Date(),
    };

    vi.spyOn(messageComposer, 'quotedMessage', 'get').mockReturnValue(quotedMessage);
    vi.spyOn(messageComposer, 'pollId', 'get').mockReturnValue('poll-id-123');

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParamsDraft({
        draft: {
          text: 'Original draft text',
          attachments: [
            {
              type: 'image',
              image_url: 'https://example.com/image.jpg',
            },
          ],
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.text).toBe('Original draft text');
    expect(result.state.draft.attachments).toHaveLength(1);
    expect(result.state.draft.attachments![0].type).toBe('image');
    expect(result.state.draft.quoted_message_id).toBe('quoted-message-id');
    expect(result.state.draft.poll_id).toBe('poll-id-123');
  });

  it('should include show_in_channel in the message payload', async () => {
    vi.spyOn(messageComposer, 'showReplyInChannel', 'get').mockReturnValue(true);

    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParamsDraft({
        draft: {
          text: 'Original draft text',
          attachments: [
            {
              type: 'image',
              image_url: 'https://example.com/image.jpg',
            },
          ],
        },
      }),
    );
    expect(result.state.draft.show_in_channel).toBe(true);
  });

  it('should not include show_in_channel in the message payload', async () => {
    const result = await messageComposerStateMiddleware.handlers.compose(
      setupHandlerParamsDraft({
        draft: {
          text: 'Original draft text',
          attachments: [
            {
              type: 'image',
              image_url: 'https://example.com/image.jpg',
            },
          ],
        },
      }),
    );
    expect(result.state.draft.show_in_channel).toBeUndefined();
  });
});
