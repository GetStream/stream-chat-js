import { StateStore } from '../store';
import type { DebouncedFunc } from '../utils';
import { debounce } from '../utils';
import { mergeWithDiff } from '../utils/mergeWith';
import type { DraftMessage, LocalMessage, OGAttachment } from '../types';
import type { LinkPreviewsManagerConfig } from './configuration/types';
import type { MessageComposer } from './messageComposer';

export type LinkPreview = OGAttachment & {
  status: LinkPreviewStatus;
};

export interface ILinkPreviewsManager {
  /** Function cancels all the scheduled or in-progress URL enrichment queries and resets the state. */
  cancelURLEnrichment: () => void;
  /** Function that triggers the search for URLs and their enrichment. */
  findAndEnrichUrls?: DebouncedFunc<(text: string) => void>;
}

export enum LinkPreviewStatus {
  /** Link preview has been dismissed using **/
  DISMISSED = 'dismissed',
  /** Link preview could not be loaded, the enrichment request has failed. **/
  FAILED = 'failed',
  /** Link preview has been successfully loaded. **/
  LOADED = 'loaded',
  /** The enrichment query is in progress for a given link. **/
  LOADING = 'loading',
  /** The preview reference enrichment has not begun. Default status if not set. */
  PENDING = 'pending',
}

export type LinkURL = string;

export type LinkPreviewMap = Map<LinkURL, LinkPreview>;

export type LinkPreviewsManagerState = {
  previews: LinkPreviewMap;
};

export type LinkPreviewsManagerOptions = {
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

const linkPreviewArrayToMap = (linkPreviews: LinkPreview[]) =>
  new Map(linkPreviews.map((linkPreview) => [linkPreview.og_scrape_url, linkPreview]));

const initState = ({
  message,
}: {
  message?: DraftMessage | LocalMessage;
}): LinkPreviewsManagerState =>
  message
    ? {
        previews:
          message.attachments?.reduce<LinkPreviewMap>((acc, attachment) => {
            if (!attachment.og_scrape_url) return acc;
            acc.set(attachment.og_scrape_url, {
              ...(attachment as OGAttachment),
              status: LinkPreviewStatus.LOADED,
            });
            return acc;
          }, new Map()) ?? new Map(),
      }
    : {
        previews: new Map<LinkURL, LinkPreview>(),
      };

/*
docs:
You can customize  function to identify URLs in a string and request OG data by overriding findURLFn?: (text: string) => string[];
 */

export class LinkPreviewsManager implements ILinkPreviewsManager {
  findAndEnrichUrls: DebouncedFunc<(text: string) => void>;
  readonly state: StateStore<LinkPreviewsManagerState>;
  readonly composer: MessageComposer;
  private shouldDiscardEnrichQueries = false;

  constructor({ composer, message }: LinkPreviewsManagerOptions) {
    this.composer = composer;
    this.state = new StateStore<LinkPreviewsManagerState>(
      initState({ message: this.enabled ? message : undefined }),
    );

    this.findAndEnrichUrls = debounce(
      this._findAndEnrichUrls.bind(this),
      this.config.debounceURLEnrichmentMs,
    );
  }

  get client() {
    return this.composer.client;
  }

  get channel() {
    return this.composer.channel;
  }

  get previews() {
    return this.state.getLatestValue().previews;
  }

  get loadingPreviews() {
    return Array.from(this.previews.values()).filter((linkPreview) =>
      LinkPreviewsManager.previewIsLoading(linkPreview),
    );
  }

  get loadedPreviews() {
    return Array.from(this.previews.values()).filter((linkPreview) =>
      LinkPreviewsManager.previewIsLoaded(linkPreview),
    );
  }

  get dismissedPreviews() {
    return Array.from(this.previews.values()).filter((linkPreview) =>
      LinkPreviewsManager.previewIsDismissed(linkPreview),
    );
  }

  get failedPreviews() {
    return Array.from(this.previews.values()).filter((linkPreview) =>
      LinkPreviewsManager.previewIsFailed(linkPreview),
    );
  }

  get pendingPreviews() {
    return Array.from(this.previews.values()).filter((linkPreview) =>
      LinkPreviewsManager.previewIsPending(linkPreview),
    );
  }

  get config() {
    return this.composer.config.linkPreviews;
  }

  get debounceURLEnrichmentMs() {
    return this.config.debounceURLEnrichmentMs;
  }

  set debounceURLEnrichmentMs(
    debounceURLEnrichmentMs: LinkPreviewsManagerConfig['debounceURLEnrichmentMs'],
  ) {
    this.cancelURLEnrichment();

    this.findAndEnrichUrls = debounce(
      this._findAndEnrichUrls.bind(this),
      this.config.debounceURLEnrichmentMs,
    );

    this.composer.updateConfig({ linkPreviews: { debounceURLEnrichmentMs } });
  }

  get enabled() {
    /**
     * We have to check whether the message will be enriched server side (url_enrichment).
     * If not, then it does not make sense to do previews in composer.
     */
    return (
      !!this.channel.getConfig()?.url_enrichment &&
      this.composer.config.linkPreviews.enabled
    );
  }

  set enabled(enabled: LinkPreviewsManagerConfig['enabled']) {
    if (enabled === this.enabled) return;
    this.composer.updateConfig({ linkPreviews: { enabled } });
  }

  get findURLFn() {
    return this.config.findURLFn;
  }

  set findURLFn(fn: LinkPreviewsManagerConfig['findURLFn']) {
    this.composer.updateConfig({ linkPreviews: { findURLFn: fn } });
  }

  get onLinkPreviewDismissed() {
    return this.config.onLinkPreviewDismissed;
  }

  set onLinkPreviewDismissed(fn: LinkPreviewsManagerConfig['onLinkPreviewDismissed']) {
    this.composer.updateConfig({ linkPreviews: { onLinkPreviewDismissed: fn } });
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ message: this.enabled ? message : undefined }));
  };

  private _findAndEnrichUrls = async (text: string) => {
    if (!this.enabled) return;
    const urls = this.config.findURLFn(text);

    this.shouldDiscardEnrichQueries = !urls.length;
    if (this.shouldDiscardEnrichQueries) {
      this.state.next({ previews: new Map() });
      return;
    }
    const keptPreviews = new Map(
      Array.from(this.previews).filter(
        ([previewUrl]) => urls.includes(previewUrl) || urls.includes(previewUrl + '/'),
      ),
    );

    const newLinkPreviews = urls
      .filter((url) => {
        const existingPreviews = this.previews;
        // account for trailing slashes added by the back-end
        const existingPreviewLink =
          existingPreviews.get(url) || existingPreviews.get(url + '/');
        return !existingPreviewLink;
      })
      .map(
        (url) =>
          ({
            og_scrape_url: url.trim(),
            status: LinkPreviewStatus.LOADING,
          }) as LinkPreview,
      );

    if (!newLinkPreviews.length) return;

    this.state.partialNext({
      previews: new Map([...keptPreviews, ...linkPreviewArrayToMap(newLinkPreviews)]),
    });

    await Promise.all(
      newLinkPreviews.map(async (linkPreview) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { duration, ...ogAttachment } = await this.client.enrichURL(
            linkPreview.og_scrape_url,
          );
          if (this.shouldDiscardEnrichQueries) return;
          // due to typing and text changes, the URL may not be anymore in the store
          if (this.previews.has(linkPreview.og_scrape_url)) {
            this.updatePreview(linkPreview.og_scrape_url, {
              status: LinkPreviewStatus.LOADED,
              ...ogAttachment,
            });
          }
        } catch (error) {
          if (this.previews.has(linkPreview.og_scrape_url)) {
            this.updatePreview(linkPreview.og_scrape_url, {
              status: LinkPreviewStatus.FAILED,
            });
          }
        }
        return linkPreview;
      }),
    );
  };

  cancelURLEnrichment = () => {
    this.findAndEnrichUrls.cancel();
    this.findAndEnrichUrls.flush();
  };

  /**
   * Clears all non-dismissed previews when the text composer is cleared.
   * This ensures that dismissed previews are not re-enriched in the future.
   */
  clearPreviews = () => {
    const currentPreviews = this.previews;
    const newPreviews = new Map<LinkURL, LinkPreview>();

    // Keep only dismissed previews
    currentPreviews.forEach((preview, url) => {
      if (LinkPreviewsManager.previewIsDismissed(preview)) {
        newPreviews.set(url, preview);
      }
    });

    this.state.partialNext({ previews: newPreviews });
  };

  updatePreview = (url: LinkURL, preview: Partial<LinkPreview>) => {
    if (!url) return;
    const existingPreview = this.previews.get(url);
    const status =
      preview.status ?? this.previews.get(url)?.status ?? LinkPreviewStatus.PENDING;
    let finalPreview = preview;
    if (existingPreview) {
      const merged = mergeWithDiff(existingPreview, preview);
      const isSame = !merged.diff || Object.keys(merged.diff).length === 0;
      if (isSame) return;
      finalPreview = merged.result;
    }
    this.state.partialNext({
      previews: new Map(this.previews).set(url, {
        ...finalPreview,
        og_scrape_url: url,
        status,
      }),
    });
  };

  dismissPreview = (url: LinkURL) => {
    const preview = this.previews.get(url);
    if (preview) {
      this.onLinkPreviewDismissed?.(preview);
      this.updatePreview(url, { status: LinkPreviewStatus.DISMISSED });
    }
  };

  static previewIsLoading = (preview: LinkPreview) =>
    preview.status === LinkPreviewStatus.LOADING;

  static previewIsLoaded = (preview: LinkPreview) =>
    preview.status === LinkPreviewStatus.LOADED;

  static previewIsDismissed = (preview: LinkPreview) =>
    preview.status === LinkPreviewStatus.DISMISSED;

  static previewIsFailed = (preview: LinkPreview) =>
    preview.status === LinkPreviewStatus.FAILED;

  static previewIsPending = (preview: LinkPreview) =>
    preview.status === LinkPreviewStatus.PENDING;

  static getPreviewData = (preview: LinkPreview) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...data } = preview;
    return data;
  };
}
