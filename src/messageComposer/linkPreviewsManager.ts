import { find } from 'linkifyjs';
import { StateStore } from '../store';
import { debounce } from '../utils';
import type { DebouncedFunc } from '../utils';
import type { StreamChat } from '../client';
import type { DraftMessage, LocalMessage, OGAttachment } from '../types';

export type LinkPreviewState = OGAttachment & {
  status: LinkPreviewStatus;
};

export type LinkPreviewOptions = {
  data: OGAttachment;
  status: LinkPreviewStatus;
};

export class LinkPreview {
  state: StateStore<LinkPreviewState>;
  constructor({ data, status }: LinkPreviewOptions) {
    this.state = new StateStore<LinkPreviewState>({ ...data, status });
  }

  get og_scrape_url() {
    return this.state.getLatestValue().og_scrape_url;
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

export type LinkPreviewsManagerOptions = {
  client: StreamChat;
  /** Number of milliseconds to debounce firing the URL enrichment queries when typing. The default value is 1500(ms). */
  debounceURLEnrichmentMs?: number;
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

/*
docs:
You can customize  function to identify URLs in a string and request OG data by overriding findURLFn?: (text: string) => string[];
 */

export class LinkPreviewsManager implements ILinkPreviewsManager {
  state: StateStore<LinkPreviewsManagerState>;
  findAndEnrichUrls: DebouncedFunc<(text: string) => void>;
  private client: StreamChat;
  private shouldDiscardEnrichQueries = false;

  constructor({
    client,
    debounceURLEnrichmentMs = 1500,
    message,
  }: LinkPreviewsManagerOptions) {
    this.client = client;
    this.state = new StateStore<LinkPreviewsManagerState>(initState(message));
    this.findAndEnrichUrls = debounce(
      this._findAndEnrichUrls.bind(this),
      debounceURLEnrichmentMs,
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

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState(message));
  };

  private _findAndEnrichUrls = (text: string) => {
    const urls = this.findURLs(text).filter((url) => {
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

  findURLs = (text: string): string[] =>
    find(text, 'url').reduce<string[]>((acc, link) => {
      if (link.isLink) acc.push(link.href);
      return acc;
    }, []);

  cancelURLEnrichment = () => {
    this.findAndEnrichUrls.cancel();
    this.findAndEnrichUrls(''); // todo: ????
    this.findAndEnrichUrls.flush();
  };
}
