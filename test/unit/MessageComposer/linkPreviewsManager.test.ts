import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LinkPreview,
  LinkPreviewsManager,
  LinkPreviewStatus,
} from '../../../src/messageComposer/linkPreviewsManager';
import { StateStore } from '../../../src/store';
import { DraftMessage, LocalMessage } from '../../../src/types';
import {
  DEFAULT_LINK_PREVIEW_MANAGER_CONFIG,
  DraftResponse,
  LinkPreviewsManagerConfig,
  MessageComposer,
  StreamChat,
} from '../../../src';

const linkUrl = 'https://example.com';
// Mock dependencies
vi.mock('../../src/store', () => ({
  StateStore: vi.fn().mockImplementation(() => ({
    getLatestValue: vi.fn().mockReturnValue({}),
    next: vi.fn(),
    partialNext: vi.fn(),
  })),
}));

vi.mock('../../src/utils', () => ({
  debounce: vi.fn().mockImplementation((fn) => {
    const debouncedFn = vi.fn(fn);
    debouncedFn.cancel = vi.fn();
    debouncedFn.flush = vi.fn();
    return debouncedFn;
  }),
}));

vi.mock('../../src/utils/mergeWith', () => ({
  mergeWith: vi.fn().mockImplementation((target, source) => ({ ...target, ...source })),
}));

vi.mock('linkifyjs', () => ({
  find: vi.fn().mockImplementation((text) => {
    if (text.includes('http')) {
      return [{ isLink: true, href: linkUrl }];
    }
    return [];
  }),
}));

const enrichURLReturnValue = {
  og_scrape_url: linkUrl,
  title: 'Example Title',
  text: 'Example Text',
  image_url: 'https://example.com/image.jpg',
  asset_url: 'https://example.com/asset',
  author_name: 'Example Author',
  author_link: 'https://example.com/author',
  thumb_url: 'https://example.com/thumb.jpg',
  title_link: 'https://example.com/title',
  type: 'link',
  duration: 1000,
};

const setup = ({
  composition,
  config,
}: {
  composition?: DraftResponse | LocalMessage;
  config?: Partial<LinkPreviewsManagerConfig>;
  message?: DraftMessage | LocalMessage;
} = {}) => {
  // Reset mocks
  vi.clearAllMocks();

  // Setup mocks
  const mockClient = new StreamChat('apiKey', 'apiSecret');
  mockClient.enrichURL = vi.fn().mockResolvedValue(enrichURLReturnValue);

  const mockChannel = mockClient.channel('channelType', 'channelId');
  const messageComposer = new MessageComposer({
    client: mockClient,
    composition,
    compositionContext: mockChannel,
    config: { linkPreviews: config },
  });
  return { mockClient, mockChannel, messageComposer };
};

describe('LinkPreviewsManager', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      expect(linkPreviewsManager.config.enabled).toBe(true);
      expect(linkPreviewsManager.config.debounceURLEnrichmentMs).toBe(
        DEFAULT_LINK_PREVIEW_MANAGER_CONFIG.debounceURLEnrichmentMs,
      );
    });

    it('should initialize with custom config', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup({
        config: {
          debounceURLEnrichmentMs: 500,
          enabled: false,
        },
      });
      expect(linkPreviewsManager.config.enabled).toBe(false);
      expect(linkPreviewsManager.config.debounceURLEnrichmentMs).toBe(500);
    });

    it('should initialize with message containing link previews', () => {
      const composition: LocalMessage = {
        id: 'test-message-id',
        text: '',
        type: 'regular',
        created_at: new Date(),
        deleted_at: null,
        pinned_at: null,
        status: 'pending',
        updated_at: new Date(),
        attachments: [
          {
            og_scrape_url: linkUrl,
            title: 'Example Title',
            type: 'link',
          },
        ],
      };

      const {
        messageComposer: { linkPreviewsManager },
      } = setup({ composition });

      expect(linkPreviewsManager.previews.size).toBe(1);
      expect(linkPreviewsManager.previews.get(linkUrl)).toBeDefined();
    });
  });

  describe('getters', () => {
    it('should return loadingPreviews correctly', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });

      // Mock the enrichURL to never resolve
      mockClient.enrichURL = vi.fn().mockImplementation(() => new Promise(() => {}));

      // Add a loading preview
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that loadingPreviews contains the preview
      expect(linkPreviewsManager.loadingPreviews.length).toBe(1);
      expect(linkPreviewsManager.loadingPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(linkPreviewsManager.loadingPreviews[0].status).toBe(
        LinkPreviewStatus.LOADING,
      );
    });

    it('should return loadedPreviews correctly', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });

      // Add a loaded preview
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called and the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that loadedPreviews contains the preview
      expect(linkPreviewsManager.loadedPreviews.length).toBe(1);
      expect(linkPreviewsManager.loadedPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(linkPreviewsManager.loadedPreviews[0].status).toBe(LinkPreviewStatus.LOADED);
    });

    it('should return dismissedPreviews correctly', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      // Create a dismissed preview
      const preview = new LinkPreview({
        data: { og_scrape_url: linkUrl },
        manager: linkPreviewsManager,
        status: LinkPreviewStatus.DISMISSED,
      });

      // Add the preview to the manager's previews
      const newPreviews = new Map(linkPreviewsManager.previews);
      newPreviews.set(linkUrl, preview);
      linkPreviewsManager.state.partialNext({ previews: newPreviews });

      // Check that dismissedPreviews contains the preview
      expect(linkPreviewsManager.dismissedPreviews.length).toBe(1);
      expect(linkPreviewsManager.dismissedPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(linkPreviewsManager.dismissedPreviews[0].status).toBe(
        LinkPreviewStatus.DISMISSED,
      );
    });
  });

  describe('config setters', () => {
    it('should update debounceURLEnrichmentMs correctly', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      // Update the debounce time
      linkPreviewsManager.debounceURLEnrichmentMs = 2000;

      // Check that the config was updated
      expect(linkPreviewsManager.config.debounceURLEnrichmentMs).toBe(2000);
    });

    it('should update enabled correctly', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      // Update enabled
      linkPreviewsManager.enabled = false;

      // Check that the config was updated
      expect(linkPreviewsManager.config.enabled).toBe(false);
    });

    it('should update findURLFn correctly', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      // Create a custom findURLFn
      const customFindURLFn = (text: string) => {
        if (text.includes('custom')) {
          return ['https://custom-url.com'];
        }
        return [];
      };

      // Update findURLFn
      linkPreviewsManager.findURLFn = customFindURLFn;

      // Check that the config was updated
      expect(linkPreviewsManager.config.findURLFn).toBe(customFindURLFn);
    });
  });

  describe('initState', () => {
    it('should initialize state with a new message', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      // Create a new message
      const newMessage = {
        attachments: [
          {
            og_scrape_url: 'https://new-url.com',
            title: 'New Title',
            type: 'link',
          },
        ],
      };

      // Initialize state with the new message
      linkPreviewsManager.initState({ message: newMessage });

      // Check that the state was updated
      expect(linkPreviewsManager.previews.size).toBe(1);
      expect(linkPreviewsManager.previews.get('https://new-url.com')).toBeDefined();
    });

    it('should initialize state with an empty message', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      // Initialize state with an empty message
      linkPreviewsManager.initState({ message: {} });

      // Check that the state was updated
      expect(linkPreviewsManager.previews.size).toBe(0);
    });

    it('should initialize state with no message', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      // Initialize state with no message
      linkPreviewsManager.initState();

      // Check that the state was updated
      expect(linkPreviewsManager.previews.size).toBe(0);
    });
  });

  describe('findAndEnrichUrls', () => {
    it('should not process URLs if disabled', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup({ config: { enabled: false } });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');
      expect(mockClient.enrichURL).not.toHaveBeenCalled();
    });

    it('should process URLs and create link previews', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });
      let enrichPromiseResolve;
      mockClient.enrichURL = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          enrichPromiseResolve = resolve;
        });
      });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');
      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClient.enrichURL).toHaveBeenCalledWith(linkUrl);
      expect(linkPreviewsManager.previews.size).toBe(1);

      const preview = linkPreviewsManager.previews.get(linkUrl);
      expect(preview).toBeDefined();
      expect(preview?.status).toBe(LinkPreviewStatus.LOADING);
    });

    it('should update link preview status to LOADED when enrichment succeeds', async () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called and the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      const preview = linkPreviewsManager.previews.get(linkUrl);
      expect(preview?.status).toBe(LinkPreviewStatus.LOADED);
      expect(preview?.title).toBe('Example Title');
    });

    it('should update link preview status to FAILED when enrichment fails', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });
      mockClient.enrichURL.mockRejectedValueOnce(new Error('Enrichment failed'));

      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called and the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      const preview = linkPreviewsManager.previews.get(linkUrl);
      expect(preview?.status).toBe(LinkPreviewStatus.FAILED);
    });

    it('should not create duplicate link previews for the same URL', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com again');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClient.enrichURL).toHaveBeenCalledTimes(2);
      expect(linkPreviewsManager.previews.size).toBe(1);
    });
  });

  describe('cancelURLEnrichment', () => {
    it('should cancel pending URL enrichment', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      const cancelSpy = vi.spyOn(linkPreviewsManager.findAndEnrichUrls, 'cancel');
      const flushSpy = vi.spyOn(linkPreviewsManager.findAndEnrichUrls, 'flush');

      linkPreviewsManager.cancelURLEnrichment();

      expect(cancelSpy).toHaveBeenCalled();
      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('LinkPreview', () => {
    it('should initialize with the correct status', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      const preview = new LinkPreview({
        data: { og_scrape_url: linkUrl },
        manager: linkPreviewsManager,
        status: LinkPreviewStatus.LOADING,
      });

      expect(preview.status).toBe(LinkPreviewStatus.LOADING);
      expect(preview.isLoading).toBe(true);
      expect(preview.isLoaded).toBe(false);
      expect(preview.isDismissed).toBe(false);
    });

    it('should update status when state changes', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      const stateStore = new StateStore({
        og_scrape_url: linkUrl,
        status: LinkPreviewStatus.LOADING,
      });

      const preview = new LinkPreview({
        data: { og_scrape_url: linkUrl },
        manager: linkPreviewsManager,
        status: LinkPreviewStatus.LOADING,
      });

      // Replace the state store with our mock
      preview.state = stateStore;

      expect(preview.status).toBe(LinkPreviewStatus.LOADING);

      // Update the state
      stateStore.next({
        og_scrape_url: linkUrl,
        status: LinkPreviewStatus.LOADED,
      });

      expect(preview.status).toBe(LinkPreviewStatus.LOADED);
      expect(preview.isLoading).toBe(false);
      expect(preview.isLoaded).toBe(true);
    });

    it('should call onLinkPreviewDismissed when dismissed', () => {
      const onDismissed = vi.fn();
      const {
        messageComposer: { linkPreviewsManager },
      } = setup({ config: { onLinkPreviewDismissed: onDismissed } });
      const preview = new LinkPreview({
        data: { og_scrape_url: linkUrl },
        status: LinkPreviewStatus.LOADED,
        manager: linkPreviewsManager,
      });

      preview.dismiss();

      expect(onDismissed).toHaveBeenCalledWith(preview);
      expect(preview.status).toBe(LinkPreviewStatus.DISMISSED);
      expect(preview.isDismissed).toBe(true);
    });
  });
});
