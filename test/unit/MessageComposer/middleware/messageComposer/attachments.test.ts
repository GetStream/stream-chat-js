import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import { createAttachmentsCompositionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/attachments';
import {
  AttachmentLoadingState,
  LocalImageAttachment,
} from '../../../../../src/messageComposer/types';
import { createDraftAttachmentsCompositionMiddleware } from '../../../../../src/messageComposer/middleware/messageComposer/attachments';
import { MessageDraftComposerMiddlewareValueState } from '../../../../../src/messageComposer/middleware/messageComposer/types';
import { MessageComposerMiddlewareState } from '../../../../../src/messageComposer/middleware/messageComposer/types';
import { MiddlewareStatus } from '../../../../../src/middleware';

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

describe('AttachmentsMiddleware', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let attachmentsMiddleware: ReturnType<typeof createAttachmentsCompositionMiddleware>;

  beforeEach(() => {
    client = {
      userID: 'currentUser',
      user: { id: 'currentUser' },
      notifications: {
        addWarning: vi.fn(),
      },
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

    attachmentsMiddleware = createAttachmentsCompositionMiddleware(messageComposer);
  });

  it('should handle message without attachments', async () => {
    const result = await attachmentsMiddleware.handlers.compose(
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
    expect(result.state.message.attachments ?? []).toHaveLength(0);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(0);
  });

  it('should handle message with image attachment', async () => {
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

    const result = await attachmentsMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
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
    expect(result.state.message.attachments ?? []).toHaveLength(1);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(1);
    expect((result.state.message.attachments ?? [])[0].type).toBe('image');
    expect((result.state.localMessage.attachments ?? [])[0].type).toBe('image');
  });

  it('should handle message with multiple attachments', async () => {
    const attachments: LocalImageAttachment[] = [
      {
        type: 'image',
        image_url: 'https://example.com/image1.jpg',
        localMetadata: {
          id: 'attachment-1',
          file: new File([], 'test1.jpg', { type: 'image/jpeg' }),
          uploadState: 'finished' as AttachmentLoadingState,
        },
      },
      {
        type: 'image',
        image_url: 'https://example.com/image2.jpg',
        localMetadata: {
          id: 'attachment-2',
          file: new File([], 'test2.jpg', { type: 'image/jpeg' }),
          uploadState: 'finished' as AttachmentLoadingState,
        },
      },
    ];

    vi.spyOn(
      messageComposer.attachmentManager,
      'successfulUploads',
      'get',
    ).mockReturnValue(attachments);

    const result = await attachmentsMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
          parent_id: undefined,
          type: 'regular',
        },
        localMessage: {
          attachments,
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
    expect(result.state.message.attachments ?? []).toHaveLength(2);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(2);
    expect((result.state.message.attachments ?? [])[0].type).toBe('image');
    expect((result.state.message.attachments ?? [])[1].type).toBe('image');
  });

  it('should handle message with uploading attachments', async () => {
    const attachment: LocalImageAttachment = {
      type: 'image',
      image_url: 'https://example.com/image.jpg',
      localMetadata: {
        id: 'attachment-1',
        file: new File([], 'test.jpg', { type: 'image/jpeg' }),
        uploadState: 'uploading' as AttachmentLoadingState,
      },
    };

    vi.spyOn(
      messageComposer.attachmentManager,
      'uploadsInProgressCount',
      'get',
    ).mockReturnValue(1);
    vi.spyOn(
      messageComposer.attachmentManager,
      'successfulUploads',
      'get',
    ).mockReturnValue([]);

    const result = await attachmentsMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
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
    expect(result.state.message.attachments ?? []).toHaveLength(0);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(1);
  });

  it('should handle message with failed attachments', async () => {
    const attachment: LocalImageAttachment = {
      type: 'image',
      image_url: 'https://example.com/image.jpg',
      localMetadata: {
        id: 'attachment-1',
        file: new File([], 'test.jpg', { type: 'image/jpeg' }),
        uploadState: 'failed' as AttachmentLoadingState,
      },
    };

    vi.spyOn(
      messageComposer.attachmentManager,
      'successfulUploads',
      'get',
    ).mockReturnValue([]);

    const result = await attachmentsMiddleware.handlers.compose(
      setup({
        message: {
          id: 'test-id',
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
    expect(result.state.message.attachments ?? []).toHaveLength(0);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(1);
  });
});

describe('DraftAttachmentsMiddleware', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let draftAttachmentsMiddleware: ReturnType<
    typeof createDraftAttachmentsCompositionMiddleware
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

    const attachmentManager = {
      get uploadsInProgressCount() {
        return 0;
      },
      get successfulUploads() {
        return [];
      },
    };

    messageComposer = {
      channel,
      client,
      attachmentManager,
    } as any;

    draftAttachmentsMiddleware =
      createDraftAttachmentsCompositionMiddleware(messageComposer);
  });

  it('should handle draft without attachments', async () => {
    const result = await draftAttachmentsMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.attachments).toBeUndefined();
  });

  it('should handle draft with successful uploads', async () => {
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
      messageComposer.attachmentManager!,
      'successfulUploads',
      'get',
    ).mockReturnValue([attachment]);

    const result = await draftAttachmentsMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: '',
          attachments: [],
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.attachments).toHaveLength(1);
    expect(result.state.draft.attachments?.[0].type).toBe('image');
    expect(result.state.draft.attachments?.[0].image_url).toBe(
      'https://example.com/image.jpg',
    );
    expect('localMetadata' in result.state.draft.attachments?.[0]!).toBeFalsy();
  });

  it('should merge existing draft attachments with successful uploads', async () => {
    const existingAttachment = {
      type: 'file',
      file_url: 'https://example.com/doc.pdf',
    };

    const newAttachment: LocalImageAttachment = {
      type: 'image',
      image_url: 'https://example.com/image.jpg',
      localMetadata: {
        id: 'attachment-1',
        file: new File([], 'test.jpg', { type: 'image/jpeg' }),
        uploadState: 'finished' as AttachmentLoadingState,
      },
    };

    vi.spyOn(
      messageComposer.attachmentManager!,
      'successfulUploads',
      'get',
    ).mockReturnValue([newAttachment]);

    const result = await draftAttachmentsMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: '',
          attachments: [existingAttachment],
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.attachments).toHaveLength(2);
    expect(result.state.draft.attachments?.[0]).toEqual(existingAttachment);
    expect(result.state.draft.attachments?.[1].type).toBe('image');
    expect('localMetadata' in result.state.draft.attachments?.[1]!).toBeFalsy();
  });

  it('should handle case when attachmentManager is not available', async () => {
    messageComposer.attachmentManager = undefined as any;
    draftAttachmentsMiddleware =
      createDraftAttachmentsCompositionMiddleware(messageComposer);

    const result = await draftAttachmentsMiddleware.handlers.compose(
      setupDraft({
        draft: {
          text: '',
        },
      }),
    );

    expect(result.status).toBeUndefined();
    expect(result.state.draft.attachments).toBeUndefined();
  });
});
