import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LinkPreview,
  LinkPreviewsManager,
  LinkPreviewStatus,
} from '../../../src/messageComposer/linkPreviewsManager';
import { StateStore } from '../../../src/store';
import { DraftMessage, LocalMessage, Message } from '../../../src/types';
import {
  DEFAULT_LINK_PREVIEW_MANAGER_CONFIG,
  LinkPreviewsManagerConfig,
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
  config,
  message,
}: {
  config?: Partial<LinkPreviewsManagerConfig>;
  message?: DraftMessage | LocalMessage;
} = {}) => {
  const mockClient = {
    enrichURL: vi.fn().mockResolvedValue(enrichURLReturnValue),
  };

  const manager = new LinkPreviewsManager({
    client: mockClient,
    config: {
      ...config,
    },
    message,
  });

  return { manager, mockClient };
};

describe('LinkPreviewsManager', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const { manager } = setup();
      expect(manager.config.enabled).toBe(true);
      expect(manager.config.debounceURLEnrichmentMs).toBe(
        DEFAULT_LINK_PREVIEW_MANAGER_CONFIG.debounceURLEnrichmentMs,
      );
    });

    it('should initialize with custom config', () => {
      const { manager } = setup({
        config: {
          debounceURLEnrichmentMs: 500,
          enabled: false,
        },
      });
      expect(manager.config.enabled).toBe(false);
      expect(manager.config.debounceURLEnrichmentMs).toBe(500);
    });

    it('should initialize with message containing link previews', () => {
      const message = {
        attachments: [
          {
            og_scrape_url: linkUrl,
            title: 'Example Title',
            type: 'link',
          },
        ],
      };

      const { manager } = setup({ message });

      expect(manager.previews.size).toBe(1);
      expect(manager.previews.get(linkUrl)).toBeDefined();
    });
  });

  describe('getters', () => {
    it('should return loadingPreviews correctly', async () => {
      const { manager, mockClient } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });

      // Mock the enrichURL to never resolve
      mockClient.enrichURL = vi.fn().mockImplementation(() => new Promise(() => {}));

      // Add a loading preview
      manager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that loadingPreviews contains the preview
      expect(manager.loadingPreviews.length).toBe(1);
      expect(manager.loadingPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(manager.loadingPreviews[0].status).toBe(LinkPreviewStatus.LOADING);
    });

    it('should return loadedPreviews correctly', async () => {
      const { manager } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });

      // Add a loaded preview
      manager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called and the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Check that loadedPreviews contains the preview
      expect(manager.loadedPreviews.length).toBe(1);
      expect(manager.loadedPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(manager.loadedPreviews[0].status).toBe(LinkPreviewStatus.LOADED);
    });

    it('should return dismissedPreviews correctly', () => {
      const { manager } = setup();

      // Create a dismissed preview
      const preview = new LinkPreview({
        data: { og_scrape_url: linkUrl },
        status: LinkPreviewStatus.DISMISSED,
      });

      // Add the preview to the manager's previews
      const newPreviews = new Map(manager.previews);
      newPreviews.set(linkUrl, preview);
      manager.state.partialNext({ previews: newPreviews });

      // Check that dismissedPreviews contains the preview
      expect(manager.dismissedPreviews.length).toBe(1);
      expect(manager.dismissedPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(manager.dismissedPreviews[0].status).toBe(LinkPreviewStatus.DISMISSED);
    });
  });

  describe('config setters', () => {
    it('should update debounceURLEnrichmentMs correctly', () => {
      const { manager } = setup();

      // Update the debounce time
      manager.debounceURLEnrichmentMs = 2000;

      // Check that the config was updated
      expect(manager.config.debounceURLEnrichmentMs).toBe(2000);
    });

    it('should update enabled correctly', () => {
      const { manager } = setup();

      // Update enabled
      manager.enabled = false;

      // Check that the config was updated
      expect(manager.config.enabled).toBe(false);
    });

    it('should update findURLFn correctly', () => {
      const { manager } = setup();

      // Create a custom findURLFn
      const customFindURLFn = (text: string) => {
        if (text.includes('custom')) {
          return ['https://custom-url.com'];
        }
        return [];
      };

      // Update findURLFn
      manager.findURLFn = customFindURLFn;

      // Check that the config was updated
      expect(manager.config.findURLFn).toBe(customFindURLFn);
    });
  });

  describe('initState', () => {
    it('should initialize state with a new message', () => {
      const { manager } = setup();

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
      manager.initState({ message: newMessage });

      // Check that the state was updated
      expect(manager.previews.size).toBe(1);
      expect(manager.previews.get('https://new-url.com')).toBeDefined();
    });

    it('should initialize state with an empty message', () => {
      const { manager } = setup();

      // Initialize state with an empty message
      manager.initState({ message: {} });

      // Check that the state was updated
      expect(manager.previews.size).toBe(0);
    });

    it('should initialize state with no message', () => {
      const { manager } = setup();

      // Initialize state with no message
      manager.initState();

      // Check that the state was updated
      expect(manager.previews.size).toBe(0);
    });
  });

  describe('findAndEnrichUrls', () => {
    it('should not process URLs if disabled', async () => {
      const { manager, mockClient } = setup({ config: { enabled: false } });
      manager.findAndEnrichUrls('Check out https://example.com');
      expect(mockClient.enrichURL).not.toHaveBeenCalled();
    });

    it('should process URLs and create link previews', async () => {
      const { manager, mockClient } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });
      let enrichPromiseResolve;
      mockClient.enrichURL = vi.fn().mockImplementation((fn) => {
        return new Promise((resolve) => {
          enrichPromiseResolve = resolve;
        });
      });
      manager.findAndEnrichUrls('Check out https://example.com');
      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClient.enrichURL).toHaveBeenCalledWith(linkUrl);
      expect(manager.previews.size).toBe(1);

      const preview = manager.previews.get(linkUrl);
      expect(preview).toBeDefined();
      expect(preview?.status).toBe(LinkPreviewStatus.LOADING);
    });

    it('should update link preview status to LOADED when enrichment succeeds', async () => {
      const { manager } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });
      manager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called and the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      const preview = manager.previews.get(linkUrl);
      expect(preview?.status).toBe(LinkPreviewStatus.LOADED);
      expect(preview?.title).toBe('Example Title');
    });

    it('should update link preview status to FAILED when enrichment fails', async () => {
      const { manager, mockClient } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });
      mockClient.enrichURL.mockRejectedValueOnce(new Error('Enrichment failed'));

      manager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called and the promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      const preview = manager.previews.get(linkUrl);
      expect(preview?.status).toBe(LinkPreviewStatus.FAILED);
    });

    it('should not create duplicate link previews for the same URL', async () => {
      const { manager, mockClient } = setup({
        config: { debounceURLEnrichmentMs: 0, enabled: true },
      });
      manager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      manager.findAndEnrichUrls('Check out https://example.com again');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClient.enrichURL).toHaveBeenCalledTimes(2);
      expect(manager.previews.size).toBe(1);
    });
  });

  describe('cancelURLEnrichment', () => {
    it('should cancel pending URL enrichment', () => {
      const { manager } = setup();
      const cancelSpy = vi.spyOn(manager.findAndEnrichUrls, 'cancel');
      const flushSpy = vi.spyOn(manager.findAndEnrichUrls, 'flush');

      manager.cancelURLEnrichment();

      expect(cancelSpy).toHaveBeenCalled();
      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('LinkPreview', () => {
    it('should initialize with the correct status', () => {
      const preview = new LinkPreview({
        data: { og_scrape_url: linkUrl },
        status: LinkPreviewStatus.LOADING,
      });

      expect(preview.status).toBe(LinkPreviewStatus.LOADING);
      expect(preview.isLoading).toBe(true);
      expect(preview.isLoaded).toBe(false);
      expect(preview.isDismissed).toBe(false);
    });

    it('should update status when state changes', () => {
      const stateStore = new StateStore({
        og_scrape_url: linkUrl,
        status: LinkPreviewStatus.LOADING,
      });

      const preview = new LinkPreview({
        data: { og_scrape_url: linkUrl },
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
      const preview = new LinkPreview({
        data: { og_scrape_url: linkUrl },
        status: LinkPreviewStatus.LOADED,
        config: { onLinkPreviewDismissed: onDismissed },
      });

      preview.dismiss();

      expect(onDismissed).toHaveBeenCalledWith(preview);
      expect(preview.status).toBe(LinkPreviewStatus.DISMISSED);
      expect(preview.isDismissed).toBe(true);
    });
  });
});
