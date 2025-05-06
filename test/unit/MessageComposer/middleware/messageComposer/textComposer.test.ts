import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import { createTextComposerCompositionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/textComposer';
import { createDraftTextComposerCompositionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/textComposer';
import {
  MessageComposerMiddlewareState,
  MessageDraftComposerMiddlewareValueState,
  MiddlewareStatus,
} from '../../../../../src';

const setup = (initialState: MessageComposerMiddlewareState) => {
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

const setupDraft = (initialState: MessageDraftComposerMiddlewareValueState) => {
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

describe('TextComposerMiddleware', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let textComposerMiddleware: ReturnType<typeof createTextComposerCompositionMiddleware>;

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

    const textComposer = {
      get text() {
        return '';
      },
      get mentionedUsers() {
        return [];
      },
    };

    const attachmentManager = {
      get uploadsInProgressCount() {
        return 0;
      },
      get successfulUploads() {
        return [];
      },
    };

    const linkPreviewsManager = {
      state: {
        getLatestValue: () => ({
          previews: new Map(),
        }),
      },
    };

    const pollComposer = {
      state: {
        getLatestValue: () => ({
          data: {
            options: [],
            name: '',
            max_votes_allowed: '',
            id: '',
            user_id: '',
            voting_visibility: 'public',
            allow_answers: false,
            allow_user_suggested_options: false,
            description: '',
            enforce_unique_vote: true,
          },
          errors: {},
        }),
      },
      get canCreatePoll() {
        return false;
      },
    };

    messageComposer = {
      channel,
      config: {},
      threadId: undefined,
      client,
      textComposer,
      attachmentManager,
      linkPreviewsManager,
      pollComposer,
      get lastChangeOriginIsLocal() {
        return true;
      },
      editedMessage: undefined,
      get quotedMessage() {
        return undefined;
      },
    } as any;

    textComposerMiddleware = createTextComposerCompositionMiddleware(messageComposer);
  });

  it('should handle empty message', async () => {
    const result = await textComposerMiddleware.handlers.compose(
      setup({
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

    expect(result.status).toBeUndefined;
    expect(result.state.message.text).toBeUndefined;
    expect(result.state.localMessage.text).toBe('');
  });

  it('should handle message with text', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('Hello world');
    const result = await textComposerMiddleware.handlers.compose(
      setup({
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

    expect(result.status).toBeUndefined;
    expect(result.state.message.text).toBe('Hello world');
    expect(result.state.localMessage.text).toBe('Hello world');
  });

  it('should handle message with mentions', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue(
      '@user1 @user2',
    );
    vi.spyOn(messageComposer.textComposer, 'mentionedUsers', 'get').mockReturnValue([
      { id: 'user1', name: 'User 1' },
      { id: 'user2', name: 'User 2' },
    ]);

    const result = await textComposerMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
          parent_id: undefined,
          type: 'regular',
          mentioned_users: [] as string[],
        },
        localMessage: {
          attachments: [],
          created_at: new Date(),
          deleted_at: null,
          error: undefined,
          id: 'test-id',
          mentioned_users: [] as Array<{ id: string; name: string }>,
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

    expect(result.status).toBeUndefined;
    expect(result.state.message.text).toBe('@user1 @user2');
    expect(result.state.localMessage.text).toBe('@user1 @user2');
    expect(result.state.message.mentioned_users).toHaveLength(2);
    expect(result.state.localMessage.mentioned_users).toHaveLength(2);
    expect(result.state.message.mentioned_users).toEqual(['user1', 'user2']);
    expect(result.state.localMessage.mentioned_users?.[0]?.id).toBe('user1');
    expect(result.state.localMessage.mentioned_users?.[1]?.id).toBe('user2');
  });

  it('should remove stale mentions', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('@user1');
    vi.spyOn(messageComposer.textComposer, 'mentionedUsers', 'get').mockReturnValue([
      { id: 'user1', name: 'User 1' },
      { id: 'user2', name: 'User 2' },
    ]);

    const result = await textComposerMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
          parent_id: undefined,
          type: 'regular',
          mentioned_users: [] as string[],
        },
        localMessage: {
          attachments: [],
          created_at: new Date(),
          deleted_at: null,
          error: undefined,
          id: 'test-id',
          mentioned_users: [] as Array<{ id: string; name: string }>,
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

    expect(result.status).toBeUndefined;
    expect(result.state.message.text).toBe('@user1');
    expect(result.state.localMessage.text).toBe('@user1');
    expect(result.state.message.mentioned_users).toHaveLength(1);
    expect(result.state.localMessage.mentioned_users).toHaveLength(1);
    expect(result.state.message.mentioned_users).toEqual(['user1']);
    expect(result.state.localMessage.mentioned_users?.[0]?.id).toBe('user1');
  });

  it('should handle message with commands', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('/giphy hello');

    const result = await textComposerMiddleware.handlers.compose(
      setup({
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

    expect(result.status).toBeUndefined;
    expect(result.state.message.text).toBe('/giphy hello');
    expect(result.state.localMessage.text).toBe('/giphy hello');
  });

  it('should handle message with emoji', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('Hello 👋');

    const result = await textComposerMiddleware.handlers.compose(
      setup({
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

    expect(result.status).toBeUndefined;
    expect(result.state.message.text).toBe('Hello 👋');
    expect(result.state.localMessage.text).toBe('Hello 👋');
  });
});

describe('DraftTextComposerMiddleware', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let draftTextComposerMiddleware: ReturnType<
    typeof createDraftTextComposerCompositionMiddleware
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

    const textComposer = {
      get text() {
        return '';
      },
      get mentionedUsers() {
        return [];
      },
    };

    const attachmentManager = {
      get uploadsInProgressCount() {
        return 0;
      },
      get successfulUploads() {
        return [];
      },
    };

    const linkPreviewsManager = {
      state: {
        getLatestValue: () => ({
          previews: new Map(),
        }),
      },
    };

    const pollComposer = {
      state: {
        getLatestValue: () => ({
          data: {
            options: [],
            name: '',
            max_votes_allowed: '',
            id: '',
            user_id: '',
            voting_visibility: 'public',
            allow_answers: false,
            allow_user_suggested_options: false,
            description: '',
            enforce_unique_vote: true,
          },
          errors: {},
        }),
      },
      get canCreatePoll() {
        return false;
      },
    };

    messageComposer = {
      channel,
      config: {},
      threadId: undefined,
      client,
      textComposer,
      attachmentManager,
      linkPreviewsManager,
      pollComposer,
      get lastChangeOriginIsLocal() {
        return true;
      },
      editedMessage: undefined,
      get quotedMessage() {
        return undefined;
      },
    } as any;

    draftTextComposerMiddleware =
      createDraftTextComposerCompositionMiddleware(messageComposer);
  });

  it('should handle empty draft', async () => {
    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.text).toBe('');
    expect(result.state.draft.mentioned_users).toBeUndefined();
  });

  it('should handle draft with text', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('Hello world');

    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.text).toBe('Hello world');
    expect(result.state.draft.mentioned_users).toBeUndefined();
  });

  it('should handle draft with mentions', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue(
      '@user1 @user2',
    );
    vi.spyOn(messageComposer.textComposer, 'mentionedUsers', 'get').mockReturnValue([
      { id: 'user1', name: 'User 1' },
      { id: 'user2', name: 'User 2' },
    ]);

    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.text).toBe('@user1 @user2');
    expect(result.state.draft.mentioned_users).toEqual(['user1', 'user2']);
  });

  it('should remove stale mentions', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('@user1');
    vi.spyOn(messageComposer.textComposer, 'mentionedUsers', 'get').mockReturnValue([
      { id: 'user1', name: 'User 1' },
      { id: 'user2', name: 'User 2' },
    ]);

    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.text).toBe('@user1');
    expect(result.state.draft.mentioned_users).toEqual(['user1']);
  });

  it('should handle empty mentionedUsers array', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('Hello world');
    vi.spyOn(messageComposer.textComposer, 'mentionedUsers', 'get').mockReturnValue([]);

    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.text).toBe('Hello world');
    expect(result.state.draft.mentioned_users).toBeUndefined();
  });

  it('should preserve existing draft properties', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('Hello world');
    vi.spyOn(messageComposer.textComposer, 'mentionedUsers', 'get').mockReturnValue([
      { id: 'user1', name: 'User 1' },
    ]);

    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: '',
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
    expect(result.state.draft.text).toBe('Hello world');
    expect(result.state.draft.mentioned_users).toBeUndefined;
    expect(result.state.draft.attachments).toHaveLength(1);
    expect(result.state.draft.attachments![0].type).toBe('image');
  });

  it('should handle when textComposer is not available', async () => {
    messageComposer.textComposer = undefined as any;

    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.text).toBe('');
  });
});
