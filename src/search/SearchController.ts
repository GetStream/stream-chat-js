import { StateStore } from '../store';
import type { MessageResponse } from '../types';
import type { SearchSource } from './BaseSearchSource';

export type SearchControllerState = {
  isActive: boolean;
  searchQuery: string;
  sources: SearchSource[];
};

export type InternalSearchControllerState = {
  // FIXME: focusedMessage should live in a MessageListController class that does not exist yet.
  //  This state prop should be then removed
  focusedMessage?: MessageResponse;
};

export type SearchControllerConfig = {
  // The controller will make sure there is always exactly one active source. Enabled by default.
  keepSingleActiveSource: boolean;
};

export type SearchControllerOptions = {
  config?: Partial<SearchControllerConfig>;
  sources?: SearchSource[];
};

export class SearchController {
  /**
   * Not intended for direct use by integrators, might be removed without notice resulting in
   * broken integrations.
   */
  _internalState: StateStore<InternalSearchControllerState>;
  state: StateStore<SearchControllerState>;
  config: SearchControllerConfig;

  constructor({ config, sources }: SearchControllerOptions = {}) {
    this.state = new StateStore<SearchControllerState>({
      isActive: false,
      searchQuery: '',
      sources: sources ?? [],
    });
    this._internalState = new StateStore<InternalSearchControllerState>({});
    this.config = { keepSingleActiveSource: true, ...config };
  }
  get hasNext() {
    return this.sources.some((source) => source.hasNext);
  }

  get sources() {
    return this.state.getLatestValue().sources;
  }

  get activeSources() {
    return this.state.getLatestValue().sources.filter((s) => s.isActive);
  }

  get isActive() {
    return this.state.getLatestValue().isActive;
  }

  get searchQuery() {
    return this.state.getLatestValue().searchQuery;
  }

  get searchSourceTypes(): Array<SearchSource['type']> {
    return this.sources.map((s) => s.type);
  }

  addSource = (source: SearchSource) => {
    this.state.partialNext({
      sources: [...this.sources, source],
    });
  };

  getSource = (sourceType: SearchSource['type']) =>
    this.sources.find((s) => s.type === sourceType);

  removeSource = (sourceType: SearchSource['type']) => {
    const newSources = this.sources.filter((s) => s.type !== sourceType);
    if (newSources.length === this.sources.length) return;
    this.state.partialNext({ sources: newSources });
  };

  activateSource = (sourceType: SearchSource['type']) => {
    const source = this.getSource(sourceType);
    if (!source || source.isActive) return;
    if (this.config.keepSingleActiveSource) {
      this.sources.forEach((s) => {
        if (s.type !== sourceType) {
          s.deactivate();
        }
      });
    }
    source.activate();
    this.state.partialNext({ sources: [...this.sources] });
  };

  deactivateSource = (sourceType: SearchSource['type']) => {
    const source = this.getSource(sourceType);
    if (!source?.isActive) return;
    if (this.activeSources.length === 1) return;
    source.deactivate();
    this.state.partialNext({ sources: [...this.sources] });
  };

  activate = () => {
    if (!this.activeSources.length) {
      const sourcesToActivate = this.config.keepSingleActiveSource
        ? this.sources.slice(0, 1)
        : this.sources;
      sourcesToActivate.forEach((s) => s.activate());
    }
    if (this.isActive) return;
    this.state.partialNext({ isActive: true });
  };

  search = async (searchQuery?: string) => {
    const searchedSources = this.activeSources;
    this.state.partialNext({
      searchQuery,
    });
    await Promise.all(searchedSources.map((source) => source.search(searchQuery)));
  };

  cancelSearchQueries = () => {
    this.activeSources.forEach((s) => s.cancelScheduledQuery());
  };

  clear = () => {
    this.cancelSearchQueries();
    this.sources.forEach((source) =>
      source.state.next({ ...source.initialState, isActive: source.isActive }),
    );
    this.state.next((current) => ({
      ...current,
      isActive: true,
      queriesInProgress: [],
      searchQuery: '',
    }));
  };

  exit = () => {
    this.cancelSearchQueries();
    this.sources.forEach((source) =>
      source.state.next({ ...source.initialState, isActive: source.isActive }),
    );
    this.state.next((current) => ({
      ...current,
      isActive: false,
      queriesInProgress: [],
      searchQuery: '',
    }));
  };
}
