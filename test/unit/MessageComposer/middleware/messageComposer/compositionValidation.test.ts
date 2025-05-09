import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import {
  createCompositionValidationMiddleware,
  createDraftCompositionValidationMiddleware,
} from '../../../../../src/messageComposer/middleware/messageComposer/compositionValidation';
import {
  AttachmentLoadingState,
  LocalImageAttachment,
} from '../../../../../src/messageComposer/types';
import { MiddlewareStatus } from '../../../../../src/middleware';
import { MessageComposerMiddlewareState } from '../../../../../src/messageComposer/middleware/messageComposer/types';
import { MessageDraftComposerMiddlewareValueState } from '../../../../../src/messageComposer/middleware/messageComposer/types';

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

describe('stream-io/message-composer-middleware/data-validation', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let validationMiddleware: ReturnType<typeof createCompositionValidationMiddleware>;

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

    validationMiddleware = createCompositionValidationMiddleware(messageComposer);
  });

  it('should validate empty message', async () => {
    const result = await validationMiddleware.handlers.compose(
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

    expect(result.status).toBe('discard');
  });

  it('should validate message with text', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('Hello world');

    const result = await validationMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
          parent_id: undefined,
          text: 'Hello world',
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
          text: 'Hello world',
          type: 'regular',
          updated_at: new Date(),
        },
        sendOptions: {},
      }),
    );

    expect(result.status).toBeUndefined;
  });

  it('should validate message with attachments', async () => {
    const attachment: LocalImageAttachment = {
      type: 'image',
      image_url: 'https://example.com/image.jpg',
      localMetadata: {
        id: 'attachment-1',
        file: new File([], 'test.jpg', { type: 'image/jpeg' }),
        uploadState: 'finished' as AttachmentLoadingState,
      },
    };

    vi.spyOn(
      messageComposer.attachmentManager,
      'successfulUploads',
      'get',
    ).mockReturnValue([attachment]);

    const result = await validationMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
          attachments: [attachment],
          parent_id: undefined,
          type: 'regular',
        },
        localMessage: {
          attachments: [attachment],
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
  });

  it('should validate message with mentions', async () => {
    vi.spyOn(messageComposer.textComposer, 'text', 'get').mockReturnValue('Hello @user1');
    vi.spyOn(messageComposer.textComposer, 'mentionedUsers', 'get').mockReturnValue([
      { id: 'user1', name: 'User One' },
    ]);

    const result = await validationMiddleware.handlers.compose(
      setup({
        message: {
          message: {
            id: 'test-id',
            mentioned_users: ['user1'],
            parent_id: undefined,
            text: 'Hello @user1',
            type: 'regular',
          },
          localMessage: {
            attachments: [],
            created_at: new Date(),
            deleted_at: null,
            error: undefined,
            id: 'test-id',
            mentioned_users: [{ id: 'user1', name: 'User One' }],
            parent_id: undefined,
            pinned_at: null,
            reaction_groups: null,
            status: 'sending',
            text: 'Hello @user1',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      }),
    );

    expect(result.status).toBeUndefined;
  });

  it('should validate message with poll', async () => {
    const result = await validationMiddleware.handlers.compose(
      setup({
        message: {
          message: {
            id: 'test-id',
            parent_id: undefined,
            poll_id: 'poll-test-id',
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
            poll_id: 'poll-test-id',
            reaction_groups: null,
            status: 'sending',
            text: '',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      }),
    );

    expect(result.status).toBeUndefined;
  });

  it('should validate message with last origin change', async () => {
    vi.spyOn(messageComposer, 'lastChangeOriginIsLocal', 'get').mockReturnValue(false);

    const result = await validationMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
          parent_id: undefined,
          text: 'Hello world',
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
          text: 'Hello world',
          type: 'regular',
          updated_at: new Date(),
        },
        sendOptions: {},
      }),
    );

    expect(result.status).toBe('discard');
  });
});

describe('stream-io/message-composer-middleware/draft-data-validation', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let validationMiddleware: ReturnType<typeof createDraftCompositionValidationMiddleware>;

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

    validationMiddleware = createDraftCompositionValidationMiddleware(messageComposer);
  });

  it('should discard empty draft', async () => {
    const result = await validationMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: '',
        },
      }),
    );

    expect(result.status).toBe('discard');
  });

  it('should validate draft with text', async () => {
    const result = await validationMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: 'Hello world',
        },
      }),
    );

    expect(result.status).toBeUndefined();
  });

  it('should validate draft with attachments', async () => {
    const result = await validationMiddleware.handlers.compose(
      setupDraft({
        draft: {
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
  });

  it('should validate draft with poll', async () => {
    const result = await validationMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: '',
          poll_id: 'poll-123',
        },
      }),
    );

    expect(result.status).toBeUndefined();
  });

  it('should validate draft with quoted message', async () => {
    const result = await validationMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: '',
          quoted_message_id: 'msg-123',
        },
      }),
    );

    expect(result.status).toBeUndefined();
  });

  it('should discard draft when last change origin is not local', async () => {
    vi.spyOn(messageComposer, 'lastChangeOriginIsLocal', 'get').mockReturnValue(false);

    const result = await validationMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: 'Hello world',
        },
      }),
    );

    expect(result.status).toBe('discard');
  });
});
