import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import { createCommandInjectionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/commandInjection';
import {
  CommandResponse,
  createDraftCommandInjectionMiddleware,
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

describe('stream-io/message-composer-middleware/command-injection', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let textComposerMiddleware: ReturnType<typeof createCommandInjectionMiddleware>;

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
      get command() {
        return {
          name: '',
          description: '',
        };
      },
      get text() {
        return '';
      },
      get mentionedUsers() {
        return [];
      },
      setCommand: (command: CommandResponse | null) => {},
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

    textComposerMiddleware = createCommandInjectionMiddleware(messageComposer);
  });

  it("should forward if there's no command state set", async () => {
    vi.spyOn(messageComposer.textComposer, 'command', 'get').mockReturnValue(null);
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
          text: 'haha',
          type: 'regular',
          updated_at: new Date(),
        },
        sendOptions: {},
      }),
    );
    expect(result.status).toBeUndefined;
    expect(result.state.message.text).toBeUndefined;
    expect(result.state.localMessage.text).toBeUndefined;
  });

  it('should inject command into message text', async () => {
    vi.spyOn(messageComposer.textComposer, 'command', 'get').mockReturnValue({
      name: 'giphy',
      description: 'Send a giphy',
    });

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
          text: 'haha',
          type: 'regular',
          updated_at: new Date(),
        },
        sendOptions: {},
      }),
    );

    expect(result.status).toBeUndefined;
    expect(result.state.message.text).toBe('/giphy haha');
    expect(result.state.localMessage.text).toBe('/giphy haha');
  });
});

describe('stream-io/message-composer-middleware/draft-command-injection', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let draftTextComposerMiddleware: ReturnType<
    typeof createDraftCommandInjectionMiddleware
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
      get command() {
        return {
          name: '',
          description: '',
        };
      },
      get text() {
        return '';
      },
      get mentionedUsers() {
        return [];
      },
      setCommand: (command: CommandResponse | null) => {},
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

    draftTextComposerMiddleware = createDraftCommandInjectionMiddleware(messageComposer);
  });

  it('should forward if there is no command state set', async () => {
    vi.spyOn(messageComposer.textComposer, 'command', 'get').mockReturnValue(null);

    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: 'haha',
        },
      }),
    );

    expect(result.state.draft.text).toBeUndefined;
  });

  it('should inject command into draft text', async () => {
    vi.spyOn(messageComposer.textComposer, 'command', 'get').mockReturnValue({
      name: 'giphy',
      description: 'Send a giphy',
    });

    const result = await draftTextComposerMiddleware.handlers.compose(
      setupDraft({
        draft: {
          id: 'test-id',
          parent_id: undefined,
          text: 'haha',
        },
      }),
    );

    expect(result.state.draft.text).toBe('/giphy haha');
  });
});
