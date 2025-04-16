import { StateStore } from '../store';
import type { DebouncedFunc } from '../utils';
import { debounce } from '../utils';
import type { DraftMessage, LocalMessage, OGAttachment } from '../types';
import type { LinkPreviewsManagerConfig } from './configuration/types';
import type { MessageComposer } from './messageComposer';

export type LinkPreviewState = OGAttachment & {
  status: LinkPreviewStatus;
};

export type LinkPreviewOptions = {
  data: OGAttachment;
  manager: LinkPreviewsManager;
  status: LinkPreviewStatus;
};

export class LinkPreview {
  readonly state: StateStore<LinkPreviewState>;
  readonly manager: LinkPreviewsManager;

  constructor({ data, manager, status }: LinkPreviewOptions) {
    this.state = new StateStore<LinkPreviewState>({ ...data, status });
    this.manager = manager;
  }

  get onLinkPreviewDismissed() {
    return this.manager.config.onLinkPreviewDismissed;
  }

  get data(): OGAttachment {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, ...data } = this.state.getLatestValue();
    return data;
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
    this.onLinkPreviewDismissed?.(this);
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
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

const initState = ({
  manager,
  message,
}: {
  manager: LinkPreviewsManager;
  message?: DraftMessage | LocalMessage;
}): LinkPreviewsManagerState =>
  message
    ? {
        previews:
          message.attachments?.reduce<LinkPreviewMap>((acc, attachment) => {
            if (!attachment.og_scrape_url) return acc;
            acc.set(
              attachment.og_scrape_url,
              new LinkPreview({
                data: attachment as OGAttachment,
                manager,
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
  findAndEnrichUrls: DebouncedFunc<(text: string) => void>;
  readonly state: StateStore<LinkPreviewsManagerState>;
  readonly composer: MessageComposer;
  private shouldDiscardEnrichQueries = false;

  constructor({ composer, message }: LinkPreviewsManagerOptions) {
    this.composer = composer;
    this.state = new StateStore<LinkPreviewsManagerState>(
      initState({ manager: this, message }),
    );

    this.findAndEnrichUrls = debounce(
      this._findAndEnrichUrls.bind(this),
      this.config.debounceURLEnrichmentMs,
    );
  }

  get client() {
    return this.composer.client;
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
    return this.composer.config.linkPreviews;
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

  set enabled(enabled: LinkPreviewsManagerConfig['enabled']) {
    this.composer.updateConfig({ linkPreviews: { enabled } });
  }

  set findURLFn(fn: LinkPreviewsManagerConfig['findURLFn']) {
    this.composer.updateConfig({ linkPreviews: { findURLFn: fn } });
  }

  set onLinkPreviewDismissed(fn: LinkPreviewsManagerConfig['onLinkPreviewDismissed']) {
    this.composer.updateConfig({ linkPreviews: { onLinkPreviewDismissed: fn } });
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState({ manager: this, message }));
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
        manager: this,
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
