import { describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../../src/client';
import {
  LinkPreview,
  LinkPreviewStatus,
} from '../../../../../src/messageComposer/linkPreviewsManager';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import {
  createDraftLinkPreviewsCompositionMiddleware,
  createLinkPreviewsCompositionMiddleware,
} from '../../../../../src/messageComposer/middleware/messageComposer/linkPreviews';
import {
  DraftMessage,
  DraftResponse,
  LinkPreviewsManagerConfig,
  LocalMessage,
} from '../../../../../src';

const enrichURLReturnValue = {
  asset_url: 'https://example.com/image.jpg',
  author_link: 'https://example.com/author',
  author_name: 'Example Author',
  image_url: 'https://example.com/image.jpg',
  og_scrape_url: 'https://example.com',
  text: 'Example description',
  thumb_url: 'https://example.com/thumb.jpg',
  title: 'Example',
  title_link: 'https://example.com',
  type: 'article',
  duration: '100',
};

const setup = ({
  composition,
  config,
}: {
  composition?: DraftResponse | LocalMessage;
  config?: Partial<LinkPreviewsManagerConfig>;
  message?: DraftMessage | LocalMessage;
} = {}) => {
  vi.clearAllMocks();

  const mockClient = new StreamChat('apiKey', 'apiSecret');
  mockClient.enrichURL = vi.fn().mockResolvedValue(enrichURLReturnValue);

  const mockChannel = mockClient.channel('messaging', 'test-channel', {
    members: [],
  });
  mockChannel.getConfig = vi.fn().mockImplementation(() => ({ url_enrichment: true }));
  const messageComposer = new MessageComposer({
    client: mockClient,
    composition,
    compositionContext: mockChannel,
    config: { linkPreviews: config },
  });

  const linkPreviewsMiddleware = createLinkPreviewsCompositionMiddleware(messageComposer);

  return { linkPreviewsMiddleware, messageComposer };
};

describe('LinkPreviewsMiddleware', () => {
  it('should keep message attachments empty if not link previews are available', async () => {
    const { linkPreviewsMiddleware } = setup();
    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
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
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined;
    expect(result.state.message.attachments ?? []).toHaveLength(0);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(0);
  });

  it('should add loaded preview to message attachments', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setup();
    messageComposer.linkPreviewsManager.state.next({
      previews: new Map([
        [
          'https://example.com',
          {
            asset_url: 'https://example.com/image.jpg',
            author_link: 'https://example.com/author',
            author_name: 'Example Author',
            image_url: 'https://example.com/image.jpg',
            og_scrape_url: 'https://example.com',
            text: 'Example description',
            thumb_url: 'https://example.com/thumb.jpg',
            title: 'Example',
            title_link: 'https://example.com',
            type: 'article',
            status: LinkPreviewStatus.LOADED,
          },
        ],
      ]),
    });

    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
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
            text: 'https://example.com',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined;
    expect(result.state.message.attachments ?? []).toHaveLength(1);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(1);
    expect((result.state.message.attachments ?? [])[0].type).toBe('article');
    expect((result.state.localMessage.attachments ?? [])[0].type).toBe('article');
    expect(result.state.sendOptions.skip_enrich_url).toBe(true);
  });

  it('should handle message with loading link preview', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setup();
    messageComposer.linkPreviewsManager.state.next({
      previews: new Map([
        [
          'https://example.com',
          {
            asset_url: 'https://example.com/image.jpg',
            author_link: 'https://example.com/author',
            author_name: 'Example Author',
            image_url: 'https://example.com/image.jpg',
            og_scrape_url: 'https://example.com',
            text: 'Example description',
            thumb_url: 'https://example.com/thumb.jpg',
            title: 'Example',
            title_link: 'https://example.com',
            type: 'article',
            status: LinkPreviewStatus.LOADING,
          },
        ],
      ]),
    });

    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
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
            text: 'https://example.com',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined;
    expect(result.state.message.attachments ?? []).toHaveLength(0);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(0);
  });

  it('should handle message with failed link preview', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setup();
    messageComposer.linkPreviewsManager.state.next({
      previews: new Map([
        [
          'https://example.com',
          {
            asset_url: 'https://example.com/image.jpg',
            author_link: 'https://example.com/author',
            author_name: 'Example Author',
            image_url: 'https://example.com/image.jpg',
            og_scrape_url: 'https://example.com',
            text: 'Example description',
            thumb_url: 'https://example.com/thumb.jpg',
            title: 'Example',
            title_link: 'https://example.com',
            type: 'article',
            status: LinkPreviewStatus.FAILED,
          },
        ],
      ]),
    });

    // Set up the previews in the manager
    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
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
            text: 'https://example.com',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined;
    expect(result.state.message.attachments ?? []).toHaveLength(0);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(0);
  });

  it('should handle message with dismissed link preview', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setup();
    messageComposer.linkPreviewsManager.state.next({
      previews: new Map([
        [
          'https://example.com',
          {
            asset_url: 'https://example.com/image.jpg',
            author_link: 'https://example.com/author',
            author_name: 'Example Author',
            image_url: 'https://example.com/image.jpg',
            og_scrape_url: 'https://example.com',
            text: 'Example description',
            thumb_url: 'https://example.com/thumb.jpg',
            title: 'Example',
            title_link: 'https://example.com',
            type: 'article',
            status: LinkPreviewStatus.DISMISSED,
          },
        ],
      ]),
    });

    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
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
            text: 'https://example.com',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined;
    expect(result.state.message.attachments ?? []).toHaveLength(0);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(0);
  });

  it('should handle message with multiple link previews and skip url enrichment server-side if some were dismissed', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setup();
    messageComposer.linkPreviewsManager.state.next({
      previews: new Map([
        [
          'https://example1.com',
          {
            asset_url: 'https://example1.com/image.jpg',
            author_link: 'https://example1.com/author',
            author_name: 'Example Author 1',
            image_url: 'https://example1.com/image.jpg',
            og_scrape_url: 'https://example1.com',
            text: 'Example description 1',
            thumb_url: 'https://example1.com/thumb.jpg',
            title: 'Example 1',
            title_link: 'https://example1.com',
            type: 'article',
            status: LinkPreviewStatus.LOADED,
          },
        ],
        [
          'https://example2.com',
          {
            asset_url: 'https://example2.com/image.jpg',
            author_link: 'https://example2.com/author',
            author_name: 'Example Author 2',
            image_url: 'https://example2.com/image.jpg',
            og_scrape_url: 'https://example2.com',
            text: 'Example description 2',
            thumb_url: 'https://example2.com/thumb.jpg',
            title: 'Example 2',
            title_link: 'https://example2.com',
            type: 'article',
            status: LinkPreviewStatus.LOADED,
          },
        ],
        [
          'https://example3.com',
          {
            asset_url: 'https://example3.com/image.jpg',
            author_link: 'https://example3.com/author',
            author_name: 'Example Author 3',
            image_url: 'https://example3.com/image.jpg',
            og_scrape_url: 'https://example3.com',
            text: 'Example description 3',
            thumb_url: 'https://example3.com/thumb.jpg',
            title: 'Example 3',
            title_link: 'https://example3.com',
            type: 'article',
            status: LinkPreviewStatus.DISMISSED,
          },
        ],
      ]),
    });

    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
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
            text: 'https://example1.com https://example2.com https://example3.com',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined;
    expect(result.state.message.attachments ?? []).toHaveLength(2);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(2);
    expect((result.state.message.attachments ?? [])[0].type).toBe('article');
    expect((result.state.message.attachments ?? [])[1].type).toBe('article');
    expect(result.state.sendOptions.skip_enrich_url).toBe(true);
  });

  it('should not skip url enrichment server-side if not all previews could be loaded and none has been dismissed', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setup();
    messageComposer.linkPreviewsManager.state.next({
      previews: new Map([
        [
          'https://example1.com',
          {
            asset_url: 'https://example1.com/image.jpg',
            author_link: 'https://example1.com/author',
            author_name: 'Example Author 1',
            image_url: 'https://example1.com/image.jpg',
            og_scrape_url: 'https://example1.com',
            text: 'Example description 1',
            thumb_url: 'https://example1.com/thumb.jpg',
            title: 'Example 1',
            title_link: 'https://example1.com',
            type: 'article',
            status: LinkPreviewStatus.LOADED,
          },
        ],
        [
          'https://example2.com',
          {
            asset_url: 'https://example2.com/image.jpg',
            author_link: 'https://example2.com/author',
            author_name: 'Example Author 2',
            image_url: 'https://example2.com/image.jpg',
            og_scrape_url: 'https://example2.com',
            text: 'Example description 2',
            thumb_url: 'https://example2.com/thumb.jpg',
            title: 'Example 2',
            title_link: 'https://example2.com',
            type: 'article',
            status: LinkPreviewStatus.LOADING,
          },
        ],
      ]),
    });

    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
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
            text: 'https://example1.com https://example2.com',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined;
    expect(result.state.message.attachments ?? []).toHaveLength(0); // will be added server-side
    expect(result.state.localMessage.attachments ?? []).toHaveLength(0);
    expect(result.state.sendOptions.skip_enrich_url).toBeUndefined;
  });

  it('should add link previews to existing attachments array', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setup();
    messageComposer.linkPreviewsManager.state.next({
      previews: new Map([
        [
          'https://example.com',
          {
            asset_url: 'https://example.com/image.jpg',
            author_link: 'https://example.com/author',
            author_name: 'Example Author',
            image_url: 'https://example.com/image.jpg',
            og_scrape_url: 'https://example.com',
            text: 'Example description',
            thumb_url: 'https://example.com/thumb.jpg',
            title: 'Example',
            title_link: 'https://example.com',
            type: 'article',
            status: LinkPreviewStatus.LOADED,
          },
        ],
      ]),
    });

    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
          message: {
            attachments: [
              {
                type: 'image',
                image_url: 'https://example.com/image.jpg',
              },
            ],
            id: 'test-id',
            parent_id: undefined,
            type: 'regular',
          },
          localMessage: {
            attachments: [
              {
                type: 'image',
                image_url: 'https://example.com/image.jpg',
              },
            ],
            created_at: new Date(),
            deleted_at: null,
            error: undefined,
            id: 'test-id',
            mentioned_users: [],
            parent_id: undefined,
            pinned_at: null,
            reaction_groups: null,
            status: 'sending',
            text: 'https://example.com',
            type: 'regular',
            updated_at: new Date(),
          },
          sendOptions: {},
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined;
    expect(result.state.message.attachments ?? []).toHaveLength(2);
    expect(result.state.localMessage.attachments ?? []).toHaveLength(2);
    expect((result.state.message.attachments ?? [])[0].type).toBe('image');
    expect((result.state.localMessage.attachments ?? [])[0].type).toBe('image');
    expect((result.state.message.attachments ?? [])[1].type).toBe('article');
    expect((result.state.localMessage.attachments ?? [])[1].type).toBe('article');
  });
});

const setupForDraft = ({
  composition,
  config,
}: {
  composition?: DraftResponse | LocalMessage;
  config?: Partial<LinkPreviewsManagerConfig>;
  message?: DraftMessage | LocalMessage;
} = {}) => {
  vi.clearAllMocks();

  const mockClient = new StreamChat('apiKey', 'apiSecret');
  mockClient.enrichURL = vi.fn().mockResolvedValue(enrichURLReturnValue);

  const mockChannel = mockClient.channel('messaging', 'test-channel', {
    members: [],
  });
  mockChannel.getConfig = vi.fn().mockImplementation(() => ({ url_enrichment: true }));
  const messageComposer = new MessageComposer({
    client: mockClient,
    composition,
    compositionContext: mockChannel,
    config: { linkPreviews: config },
  });

  const linkPreviewsMiddleware =
    createDraftLinkPreviewsCompositionMiddleware(messageComposer);

  return { linkPreviewsMiddleware, mockClient, mockChannel, messageComposer };
};
describe('DraftLinkPreviewsMiddleware', () => {
  it('should handle draft without link previews', async () => {
    const { linkPreviewsMiddleware } = setupForDraft();
    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
          draft: {
            text: '',
          },
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined();
    expect(result.state.draft.attachments).toBeUndefined();
  });

  it('should initiate from draft with loaded link previews', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setupForDraft();
    const linkPreview: LinkPreview = {
      status: LinkPreviewStatus.LOADED,
      type: 'article',
      title: 'Example Article',
      text: 'Example description',
      image_url: 'https://example.com/image.jpg',
      og_scrape_url: 'https://example.com',
      asset_url: 'https://example.com/asset.jpg',
      author_link: 'https://example.com/author',
      author_name: 'Example Author',
      thumb_url: 'https://example.com/thumb.jpg',
      title_link: 'https://example.com',
    };

    vi.spyOn(
      messageComposer.linkPreviewsManager,
      'loadedPreviews',
      'get',
    ).mockReturnValue([linkPreview]);

    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
          draft: {
            text: '',
          },
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined();
    expect(result.state.draft.attachments).toHaveLength(1);
    expect(result.state.draft.attachments![0].type).toBe('article');
    expect(result.state.draft.attachments![0].title).toBe('Example Article');
    expect('state' in result.state.draft.attachments![0]).toBeFalsy();
  });

  it('should merge link previews with existing draft attachments', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setupForDraft();
    const existingAttachment = {
      type: 'image',
      image_url: 'https://example.com/image.jpg',
    };

    const linkPreview: LinkPreview = {
      status: LinkPreviewStatus.LOADED,
      type: 'article',
      title: 'Example Article',
      text: 'Example description',
      image_url: 'https://example.com/article.jpg',
      og_scrape_url: 'https://example.com',
      asset_url: 'https://example.com/asset.jpg',
      author_link: 'https://example.com/author',
      author_name: 'Example Author',
      thumb_url: 'https://example.com/thumb.jpg',
      title_link: 'https://example.com',
    };

    vi.spyOn(
      messageComposer.linkPreviewsManager,
      'loadedPreviews',
      'get',
    ).mockReturnValue([linkPreview]);

    const result = await linkPreviewsMiddleware.compose({
      input: {
        state: {
          draft: {
            text: '',
            attachments: [existingAttachment],
          },
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined();
    expect(result.state.draft.attachments).toHaveLength(2);
    expect(result.state.draft.attachments![0]).toEqual(existingAttachment);
    expect(result.state.draft.attachments![1].type).toBe('article');
    expect('state' in result.state.draft.attachments![1]).toBeFalsy();
  });

  it('should handle case when linkPreviewsManager is not available', async () => {
    const { messageComposer } = setupForDraft();
    messageComposer.linkPreviewsManager = undefined as any;
    const linkPreviewsMiddlewareWithUndefinedManager =
      createDraftLinkPreviewsCompositionMiddleware(messageComposer);

    const result = await linkPreviewsMiddlewareWithUndefinedManager.compose({
      input: {
        state: {
          draft: {
            text: '',
          },
        },
      },
      nextHandler: async (input) => input,
    });

    expect(result.status).toBeUndefined();
    expect(result.state.draft.attachments).toBeUndefined();
  });

  it('should call cancelURLEnrichment', async () => {
    const { linkPreviewsMiddleware, messageComposer } = setupForDraft();
    const cancelURLEnrichment = vi.fn();
    messageComposer.linkPreviewsManager.cancelURLEnrichment = cancelURLEnrichment;

    await linkPreviewsMiddleware.compose({
      input: {
        state: {
          draft: {
            text: '',
          },
        },
      },
      nextHandler: async (input) => input,
    });

    expect(cancelURLEnrichment).toHaveBeenCalled();
  });
});
