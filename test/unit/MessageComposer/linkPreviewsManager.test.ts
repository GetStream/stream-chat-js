import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkPreviewStatus } from '../../../src/messageComposer/linkPreviewsManager';
import { DraftMessage, LocalMessage } from '../../../src/types';
import {
  DEFAULT_LINK_PREVIEW_MANAGER_CONFIG,
  DraftResponse,
  LinkPreviewsManagerConfig,
  MessageComposer,
  MessageComposerConfig,
  StreamChat,
} from '../../../src';
import { DeepPartial } from '../../../src/types.utility';
import { mergeWith } from '../../../src/utils/mergeWith';
import { stubServerConfig } from '../test-utils/stubServerConfig';
import { convertDateToTimestamp } from '../test-utils/time';

const existingLinkUrl = 'https://existing.com';
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
  getEnv: vi.fn(),
}));

vi.mock('../../src/utils/mergeWith', () => ({
  mergeWith: vi.fn().mockImplementation((target, source) => ({ ...target, ...source })),
  getEnv: vi.fn(),
}));

vi.mock('linkifyjs', () => ({
  find: vi.fn().mockImplementation((text) => {
    if (text.includes(linkUrl) && text.includes(existingLinkUrl)) {
      return [
        { isLink: true, href: linkUrl },
        { isLink: true, href: existingLinkUrl },
      ];
    } else if (text.includes(linkUrl)) {
      return [{ isLink: true, href: linkUrl }];
    } else if (text.includes(existingLinkUrl)) {
      return [{ isLink: true, href: existingLinkUrl }];
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

const DEFAULT_CONFIG: DeepPartial<MessageComposerConfig> = {
  linkPreviews: {
    debounceURLEnrichmentMs: 0,
    enabled: true,
  },
};

const setup = ({
  composition,
  config,
}: {
  composition?: DraftResponse | LocalMessage;
  config?: Partial<LinkPreviewsManagerConfig> | null;
  message?: DraftMessage | LocalMessage;
} = {}) => {
  // Reset mocks
  vi.clearAllMocks();

  // Setup mocks
  const mockClient = new StreamChat('apiKey');
  mockClient.user = { id: 'user' };
  mockClient.getOG = vi.fn().mockResolvedValue(enrichURLReturnValue);

  const mockChannel = mockClient.channel('channelType', 'channelId');
  const setServerConfig = stubServerConfig(mockChannel, { url_enrichment: true });
  const messageComposer = new MessageComposer({
    client: mockClient,
    composition,
    compositionContext: mockChannel,
    config: config === null ? {} : mergeWith(DEFAULT_CONFIG, { linkPreviews: config }),
  });
  return { messageComposer, mockChannel, mockClient, setServerConfig };
};

describe('LinkPreviewsManager', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup({ config: null });
      // `true` means "no opinion — let the server decide", matching every other server-gated feature.
      // The channel type's `url_enrichment` still has to allow it; the harness sets that flag to true.
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
        created_at: convertDateToTimestamp(new Date()),
        deleted_at: null,
        pinned_at: null,
        status: 'pending',
        updated_at: convertDateToTimestamp(new Date()),
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

    it('should not initialize with message containing link previews if disabled', () => {
      const composition: LocalMessage = {
        id: 'test-message-id',
        text: '',
        type: 'regular',
        created_at: convertDateToTimestamp(new Date()),
        deleted_at: null,
        pinned_at: null,
        status: 'pending',
        updated_at: convertDateToTimestamp(new Date()),
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
      } = setup({ composition, config: { enabled: false } });

      expect(linkPreviewsManager.previews.size).toBe(0);
    });
  });

  describe('getters', () => {
    it('should return loadingPreviews correctly', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup();

      // Mock the enrichURL to never resolve
      mockClient.getOG = vi.fn().mockImplementation(() => new Promise(() => {}));

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
      } = setup();

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

      // Add the preview to the manager's previews
      const newPreviews = new Map(linkPreviewsManager.previews);
      newPreviews.set(linkUrl, {
        og_scrape_url: linkUrl,
        status: LinkPreviewStatus.DISMISSED,
      });
      linkPreviewsManager.state.partialNext({ previews: newPreviews });

      // Check that dismissedPreviews contains the preview
      expect(linkPreviewsManager.dismissedPreviews.length).toBe(1);
      expect(linkPreviewsManager.dismissedPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(linkPreviewsManager.dismissedPreviews[0].status).toBe(
        LinkPreviewStatus.DISMISSED,
      );
    });

    it('should return failedPreviews correctly', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      const newPreviews = new Map(linkPreviewsManager.previews);
      newPreviews.set(linkUrl, {
        og_scrape_url: linkUrl,
        status: LinkPreviewStatus.FAILED,
      });
      linkPreviewsManager.state.partialNext({ previews: newPreviews });

      // Check that failedPreviews contains the preview
      expect(linkPreviewsManager.failedPreviews.length).toBe(1);
      expect(linkPreviewsManager.failedPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(linkPreviewsManager.failedPreviews[0].status).toBe(LinkPreviewStatus.FAILED);
    });

    it('should return pendingPreviews correctly', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      const newPreviews = new Map(linkPreviewsManager.previews);
      newPreviews.set(linkUrl, {
        og_scrape_url: linkUrl,
        status: LinkPreviewStatus.PENDING,
      });
      linkPreviewsManager.state.partialNext({ previews: newPreviews });

      // Check that pendingPreviews contains the preview
      expect(linkPreviewsManager.pendingPreviews.length).toBe(1);
      expect(linkPreviewsManager.pendingPreviews[0].og_scrape_url).toBe(linkUrl);
      expect(linkPreviewsManager.pendingPreviews[0].status).toBe(
        LinkPreviewStatus.PENDING,
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

    it('should cancel pending URL enrichment', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      const cancelSpy = vi.spyOn(linkPreviewsManager, 'cancelURLEnrichment');

      linkPreviewsManager.initState();

      expect(cancelSpy).toHaveBeenCalled();
    });

    it('should ignore in-flight URL enrichment after reinitializing state', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup();
      let resolveEnrichment: (value: typeof enrichURLReturnValue) => void = () => {};
      mockClient.getOG = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveEnrichment = resolve;
          }),
      );

      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(linkPreviewsManager.loadingPreviews).toHaveLength(1);

      linkPreviewsManager.initState();
      resolveEnrichment(enrichURLReturnValue);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(linkPreviewsManager.previews.size).toBe(0);
    });
  });

  describe('the setter against a disabling server', () => {
    // The server has the last word, so `enabled = true` cannot win — that part always held. What did not
    // is the *record* of what was asked for: the setter used to skip the write when the new value equalled
    // the current one, and while the server masks the field the current one is always `false`. So asking
    // for `false` after asking for `true` recorded nothing, the earlier `true` stayed in the retained
    // patch layer, and the moment the server relented it was honoured — the opposite of the last
    // instruction given.
    const setup2 = (url_enrichment: boolean) => {
      const client = new StreamChat('apiKey');
      client.user = { id: 'user' } as never;
      client.channelServerConfigsStore.partialNext({
        configs: { 'channelType:channelId': { url_enrichment } as never },
      });
      const channel = client.channel('channelType', 'channelId');
      const composer = new MessageComposer({
        client,
        compositionContext: channel,
      });
      composer.registerSubscriptions();
      return { client, composer };
    };

    it('cannot enable previews the server has disabled', () => {
      const { composer } = setup2(false);

      composer.linkPreviewsManager.enabled = true;

      expect(composer.linkPreviewsManager.enabled).toBe(false);
      expect(composer.config.linkPreviews.enabled).toBe(false);
    });

    it('honours the last request once the server relents', () => {
      const { client, composer } = setup2(false);

      composer.linkPreviewsManager.enabled = true;
      composer.linkPreviewsManager.enabled = false; // changed their mind, while masked

      client.channelServerConfigsStore.partialNext({
        configs: { 'channelType:channelId': { url_enrichment: true } as never },
      });

      expect(composer.linkPreviewsManager.enabled).toBe(false);
    });

    it('still applies a request made while masked, if it was the last one', () => {
      const { client, composer } = setup2(false);

      composer.linkPreviewsManager.enabled = true;

      client.channelServerConfigsStore.partialNext({
        configs: { 'channelType:channelId': { url_enrichment: true } as never },
      });

      expect(composer.linkPreviewsManager.enabled).toBe(true);
    });
  });

  describe('findAndEnrichUrls', () => {
    it('should not process URLs if disabled back-end url_enrichment', async () => {
      const { messageComposer, mockChannel, mockClient, setServerConfig } = setup();
      const { linkPreviewsManager } = messageComposer;
      // `url_enrichment` is reconciled into `config.linkPreviews.enabled` by the composer's server
      // restrictions rather than read live, so a *late* change reaches it through the composer's
      // subscription — the same route its four sibling gates already take. A real consumer registers
      // these on mount.
      messageComposer.registerSubscriptions();
      setServerConfig({ url_enrichment: false });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');
      let enrichPromiseResolve;
      mockClient.getOG = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          enrichPromiseResolve = resolve;
        });
      });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');
      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockClient.getOG).not.toHaveBeenCalled();
      expect(linkPreviewsManager.previews.size).toBe(0);
    });

    it('should not process URLs if disabled via the manager config', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup({ config: { enabled: false } });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');
      let enrichPromiseResolve;
      mockClient.getOG = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          enrichPromiseResolve = resolve;
        });
      });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');
      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockClient.getOG).not.toHaveBeenCalled();
      expect(linkPreviewsManager.previews.size).toBe(0);
    });

    it('should process URLs and create link previews', async () => {
      const {
        messageComposer: { linkPreviewsManager },
        mockClient,
      } = setup();
      let enrichPromiseResolve;
      mockClient.getOG = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          enrichPromiseResolve = resolve;
        });
      });
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');
      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClient.getOG).toHaveBeenCalledWith({ url: linkUrl });
      expect(linkPreviewsManager.previews.size).toBe(1);

      const preview = linkPreviewsManager.previews.get(linkUrl);
      expect(preview).toBeDefined();
      expect(preview?.status).toBe(LinkPreviewStatus.LOADING);
    });

    it('should update link preview status to LOADED when enrichment succeeds', async () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
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
      } = setup();
      mockClient.getOG.mockRejectedValueOnce(new Error('Enrichment failed'));

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
      } = setup();
      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com again');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockClient.getOG).toHaveBeenCalledTimes(1);
      expect(linkPreviewsManager.previews.size).toBe(1);
    });

    it('should not keep existing link previews if source string does not include them anymore', async () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      const existingPreview = {
        og_scrape_url: 'https://existing.com  ',
        status: LinkPreviewStatus.LOADED,
      };
      linkPreviewsManager.state.partialNext({
        previews: new Map([[existingPreview.og_scrape_url, existingPreview]]),
      });

      linkPreviewsManager.findAndEnrichUrls('Check out https://example.com');

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(linkPreviewsManager.previews.size).toBe(1);
      expect(linkPreviewsManager.previews.get(existingPreview.og_scrape_url)?.status)
        .toBeUndefined;
      expect(linkPreviewsManager.previews.get(linkUrl)?.status).toBe(
        LinkPreviewStatus.LOADED,
      );
    });

    it('should keep existing link previews', async () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      const existingPreview = {
        og_scrape_url: 'https://existing.com',
        status: LinkPreviewStatus.LOADED,
      };
      linkPreviewsManager.state.partialNext({
        previews: new Map([[existingPreview.og_scrape_url, existingPreview]]),
      });

      linkPreviewsManager.findAndEnrichUrls(
        'Check out https://example.com and https://existing.com',
      );

      // Wait for the debounced function to be called
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(linkPreviewsManager.previews.size).toBe(2);
      expect(
        linkPreviewsManager.previews.get(existingPreview.og_scrape_url)?.status,
      ).toBe(LinkPreviewStatus.LOADED);
      expect(linkPreviewsManager.previews.get(linkUrl)?.status).toBe(
        LinkPreviewStatus.LOADED,
      );
    });
  });

  describe('dismissPreview', () => {
    it('should update the status of a preview when it is dismissed', async () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      linkPreviewsManager.state.partialNext({
        previews: new Map([
          [linkUrl, { og_scrape_url: linkUrl, status: LinkPreviewStatus.LOADED }],
        ]),
      });

      linkPreviewsManager.dismissPreview(linkUrl);

      expect(linkPreviewsManager.previews.get(linkUrl)?.status).toBe(
        LinkPreviewStatus.DISMISSED,
      );
    });

    it('should call onLinkPreviewDismissed when a preview is dismissed', async () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      linkPreviewsManager.state.partialNext({
        previews: new Map([
          [
            linkUrl,
            { og_scrape_url: linkUrl, status: LinkPreviewStatus.LOADED, custom: {} },
          ],
        ]),
      });
      const onLinkPreviewDismissed = vi.fn();
      linkPreviewsManager.onLinkPreviewDismissed = onLinkPreviewDismissed;

      linkPreviewsManager.dismissPreview(linkUrl);
      const preview = linkPreviewsManager.previews.get(linkUrl);
      expect(onLinkPreviewDismissed).toHaveBeenCalledWith({
        ...preview,
        status: LinkPreviewStatus.LOADED,
      });
    });
  });

  describe('updatePreview', () => {
    it('should set status to PENDING when a status is not available during preview update', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();

      linkPreviewsManager.state.partialNext({
        previews: new Map([[linkUrl, { og_scrape_url: linkUrl }]]),
      });

      linkPreviewsManager.updatePreview(linkUrl, { og_scrape_url: linkUrl });

      expect(linkPreviewsManager.previews.get(linkUrl)?.status).toBe(
        LinkPreviewStatus.PENDING,
      );
    });

    it('should partially update the preview', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      linkPreviewsManager.state.partialNext({
        previews: new Map([
          [
            linkUrl,
            {
              og_scrape_url: linkUrl,
              status: LinkPreviewStatus.PENDING,
              title: 'Example Title',
            },
          ],
        ]),
      });

      linkPreviewsManager.updatePreview(linkUrl, {
        title: 'New Title',
        status: LinkPreviewStatus.LOADED,
      });

      expect(linkPreviewsManager.previews.get(linkUrl)?.og_scrape_url).toBe(linkUrl);
      expect(linkPreviewsManager.previews.get(linkUrl)?.title).toBe('New Title');
      expect(linkPreviewsManager.previews.get(linkUrl)?.status).toBe(
        LinkPreviewStatus.LOADED,
      );
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

  describe('clearPreviews', () => {
    it('clears all non-dismissed previews', () => {
      const {
        messageComposer: { linkPreviewsManager },
      } = setup();
      linkPreviewsManager.state.partialNext({
        previews: new Map([
          [linkUrl, { og_scrape_url: linkUrl, status: LinkPreviewStatus.LOADED }],
          [
            'https://exampleX.com',
            {
              og_scrape_url: 'https://exampleX.com',
              status: LinkPreviewStatus.DISMISSED,
            },
          ],
        ]),
      });

      linkPreviewsManager.clearPreviews();

      expect(linkPreviewsManager.previews.get(linkUrl)?.status).toBeUndefined();
      expect(linkPreviewsManager.previews.get('https://exampleX.com')?.status).toBe(
        LinkPreviewStatus.DISMISSED,
      );
    });
  });
});
