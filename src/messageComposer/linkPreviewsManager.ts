import { find } from 'linkifyjs';
import { StateStore } from '../store';
import { debounce } from '../utils';
import { mergeWith } from '../utils/mergeWith';
import type { DebouncedFunc } from '../utils';
import type { StreamChat } from '../client';
import type { DraftMessage, LocalMessage, OGAttachment } from '../types';

export type LinkPreviewState = OGAttachment & {
  status: LinkPreviewStatus;
};

export type LinkPreviewConfig = {
  /** Custom function to react to link preview dismissal */
  onLinkPreviewDismissed?: (linkPreview: LinkPreview) => void;
};

export type LinkPreviewOptions = {
  data: OGAttachment;
  status: LinkPreviewStatus;
  config?: Partial<LinkPreviewConfig>;
};

export class LinkPreview {
  state: StateStore<LinkPreviewState>;
  config: LinkPreviewConfig;

  constructor({ config, data, status }: LinkPreviewOptions) {
    this.state = new StateStore<LinkPreviewState>({ ...data, status });
    this.config = mergeWith<LinkPreviewConfig>({}, config ?? ({} as LinkPreviewConfig));
  }

  get asset_url() {
    return this.state.getLatestValue().asset_url;
  }

  get author_link() {
    return this.state.getLatestValue().author_link;
  }

  get author_name() {
    return this.state.getLatestValue().author_name;
  }

  get image_url() {
    return this.state.getLatestValue().image_url;
  }

  get og_scrape_url() {
    return this.state.getLatestValue().og_scrape_url;
  }

  get text() {
    return this.state.getLatestValue().text;
  }

  get thumb_url() {
    return this.state.getLatestValue().thumb_url;
  }

  get title() {
    return this.state.getLatestValue().title;
  }

  get title_link() {
    return this.state.getLatestValue().title_link;
  }

  get type() {
    return this.state.getLatestValue().type;
  }

  get status() {
    return this.state.getLatestValue().status;
  }

  get isLoading() {
    return this.status === LinkPreviewStatus.LOADING;
  }

  get isLoaded() {
    return this.status === LinkPreviewStatus.LOADED;
  }

  get isDismissed() {
    return this.status === LinkPreviewStatus.DISMISSED;
  }

  dismiss = () => {
    this.config.onLinkPreviewDismissed?.(this);
    this.state.partialNext({ status: LinkPreviewStatus.DISMISSED });
  };
}

export interface ILinkPreviewsManager {
  /** Function cancels all the scheduled or in-progress URL enrichment queries and resets the state. */
  cancelURLEnrichment: () => void;
  /** Function that triggers the search for URLs and their enrichment. */
  findAndEnrichUrls?: DebouncedFunc<(text: string) => void>;
}

export enum LinkPreviewStatus {
  /** Link preview has been dismissed using MessageInputContextValue.dismissLinkPreview **/
  DISMISSED = 'dismissed',
  /** Link preview could not be loaded, the enrichment request has failed. **/
  FAILED = 'failed',
  /** Link preview has been successfully loaded. **/
  LOADED = 'loaded',
  /** The enrichment query is in progress for a given link. **/
  LOADING = 'loading',
}

export type LinkURL = string;

export type LinkPreviewMap = Map<LinkURL, LinkPreview>;

export type LinkPreviewsManagerState = {
  previews: LinkPreviewMap;
};

export type LinkPreviewsManagerConfig = LinkPreviewConfig & {
  /** Number of milliseconds to debounce firing the URL enrichment queries when typing. The default value is 1500(ms). */
  debounceURLEnrichmentMs: number;
  /** Allows for toggling the URL enrichment and link previews in `MessageInput`. By default, the feature is disabled. */
  enabled: boolean;
  /** Custom function to identify URLs in a string and request OG data */
  findURLFn: (text: string) => string[];
};

export type LinkPreviewsManagerOptions = {
  client: StreamChat;
  config?: Partial<LinkPreviewsManagerConfig>;
  message?: DraftMessage | LocalMessage;
};

const initState = (message?: DraftMessage | LocalMessage): LinkPreviewsManagerState =>
  message
    ? {
        previews:
          message.attachments?.reduce<LinkPreviewMap>((acc, attachment) => {
            if (!attachment.og_scrape_url) return acc;
            acc.set(
              attachment.og_scrape_url,
              new LinkPreview({
                data: attachment as OGAttachment,
                status: LinkPreviewStatus.LOADED,
              }),
            );
            return acc;
          }, new Map()) ?? new Map(),
      }
    : {
        previews: new Map<LinkURL, LinkPreview>(),
      };

const DEFAULT_LINK_PREVIEW_MANAGER_CONFIG: LinkPreviewsManagerConfig = {
  debounceURLEnrichmentMs: 1500,
  enabled: true,
  findURLFn: (text: string): string[] =>
    find(text, 'url').reduce<string[]>((acc, link) => {
      if (link.isLink) acc.push(link.href);
      return acc;
    }, []),
};
/*
docs:
You can customize  function to identify URLs in a string and request OG data by overriding findURLFn?: (text: string) => string[];
 */

export class LinkPreviewsManager implements ILinkPreviewsManager {
  state: StateStore<LinkPreviewsManagerState>;
  configState: StateStore<LinkPreviewsManagerConfig>;
  findAndEnrichUrls: DebouncedFunc<(text: string) => void>;
  private client: StreamChat;
  private shouldDiscardEnrichQueries = false;

  constructor({ client, config = {}, message }: LinkPreviewsManagerOptions) {
    this.client = client;
    this.state = new StateStore<LinkPreviewsManagerState>(initState(message));
    this.configState = new StateStore(
      mergeWith(DEFAULT_LINK_PREVIEW_MANAGER_CONFIG, config),
    );

    this.findAndEnrichUrls = debounce(
      this._findAndEnrichUrls.bind(this),
      this.config.debounceURLEnrichmentMs,
    );
  }

  get previews() {
    return this.state.getLatestValue().previews;
  }

  get loadingPreviews() {
    return Array.from(this.previews.values()).filter(
      (linkPreview) => linkPreview.isLoading,
    );
  }

  get loadedPreviews() {
    return Array.from(this.previews.values()).filter(
      (linkPreview) => linkPreview.isLoaded,
    );
  }

  get dismissedPreviews() {
    return Array.from(this.previews.values()).filter(
      (linkPreview) => linkPreview.isDismissed,
    );
  }

  get config() {
    return this.configState.getLatestValue();
  }

  set config(config: LinkPreviewsManagerConfig) {
    this.configState.next(config);
  }

  set debounceURLEnrichmentMs(
    debounceURLEnrichmentMs: LinkPreviewsManagerConfig['debounceURLEnrichmentMs'],
  ) {
    this.configState.partialNext({ debounceURLEnrichmentMs });
  }
  set enabled(enabled: LinkPreviewsManagerConfig['enabled']) {
    this.configState.partialNext({ enabled });
  }
  set findURLFn(fn: LinkPreviewsManagerConfig['findURLFn']) {
    this.configState.partialNext({ findURLFn: fn });
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState(message));
  };

  private _findAndEnrichUrls = (text: string) => {
    if (!this.config.enabled) return;

    const urls = this.config.findURLFn(text).filter((url) => {
      const existingPreviewLink = this.previews.get(url);
      return (
        !existingPreviewLink || existingPreviewLink.status !== LinkPreviewStatus.FAILED
      );
    });

    this.shouldDiscardEnrichQueries = !urls.length;
    if (!urls.length) {
      return;
    }

    const addedLinkPreviews = urls.map((url) => {
      const linkPreview = new LinkPreview({
        data: { og_scrape_url: url },
        status: LinkPreviewStatus.LOADING,
      });
      this.client
        .enrichURL(url)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .then(({ duration, ...ogAttachment }) => {
          if (this.shouldDiscardEnrichQueries) return;
          linkPreview?.state.next({ status: LinkPreviewStatus.LOADED, ...ogAttachment });
        })
        .catch(() => {
          linkPreview?.state.partialNext({ status: LinkPreviewStatus.FAILED });
        });
      return linkPreview;
    });

    const newLinkPreviews = new Map(this.previews);
    addedLinkPreviews.forEach((linkPreview) =>
      newLinkPreviews.set(linkPreview.og_scrape_url, linkPreview),
    );
    this.state.partialNext({ previews: newLinkPreviews });
  };

  cancelURLEnrichment = () => {
    this.findAndEnrichUrls.cancel();
    this.findAndEnrichUrls(''); // todo: ????
    this.findAndEnrichUrls.flush();
  };
}
