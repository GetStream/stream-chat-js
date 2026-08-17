import { StateStore } from '../store';
import type { Unsubscribe } from '../store';
import type { MessageResponse } from '../types';
import type { StreamChat } from '../client';
import type { SearchSource } from './BaseSearchSource';
import { ConfigController } from '../configuration/ConfigController';
import { applyInstanceConfiguration } from '../configuration/utils/applyInstanceConfiguration';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';

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
  /**
   * Required for this controller to take part in `client.config`.
   *
   * It is the one configurable class this package never constructs — an app or a downstream SDK does
   * (`<Chat>` in `stream-chat-react`) — so there is no other route by which it could find the
   * configuration service. Left out, the controller still works and `updateConfig` still applies;
   * only the declarative key and its setup function go unheard.
   */
  client?: StreamChat;
  config?: Partial<SearchControllerConfig>;
  sources?: SearchSource[];
};

export const DEFAULT_SEARCH_CONTROLLER_CONFIG: SearchControllerConfig = deepFreezeConfig({
  keepSingleActiveSource: true,
});

export class SearchController {
  /**
   * Not intended for direct use by integrators, might be removed without notice resulting in
   * broken integrations.
   */
  _internalState: StateStore<InternalSearchControllerState>;
  state: StateStore<SearchControllerState>;

  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<SearchControllerConfig>;
  /** Teardown for the configuration subscription, when this controller was given a client. */
  private unsubscribeConfiguration?: Unsubscribe;

  /**
   * Resolved configuration, as a store so consumers can react to it — the same shape every configurable
   * class exposes (`configState` for the store, {@link config} for the current value).
   */
  get configState(): StateStore<SearchControllerConfig> {
    return this.configController.state;
  }

  constructor({ client, config, sources }: SearchControllerOptions = {}) {
    this.state = new StateStore<SearchControllerState>({
      isActive: false,
      searchQuery: '',
      sources: sources ?? [],
    });
    this._internalState = new StateStore<InternalSearchControllerState>({});
    this.configController = new ConfigController<SearchControllerConfig>({
      defaults: DEFAULT_SEARCH_CONTROLLER_CONFIG,
      constructorOptions: config,
    });

    if (!client) return;
    this.unsubscribeConfiguration = applyInstanceConfiguration({
      args: { searchController: this },
      config: client.config,
      key: 'searchController',
      applyConfig: (slice) => this.initializeConfig(slice),
      reinitializeConfig: () =>
        this.initializeConfig(client.config.getConfig('searchController') ?? undefined),
    });
  }

  /** Releases the configuration subscription, running the setup function's teardown. */
  dispose() {
    this.unsubscribeConfiguration?.();
    this.unsubscribeConfiguration = undefined;
  }

  /**
   * The current resolved configuration. `Readonly` because the value is the store's live object —
   * assigning to a field of it would change state without notifying anyone. Use {@link updateConfig}.
   */
  get config(): Readonly<SearchControllerConfig> {
    return this.configState.getLatestValue();
  }

  /** Merges a partial configuration into the resolved config and notifies subscribers. */
  updateConfig(config: Partial<SearchControllerConfig>) {
    this.configController.patch(config);
  }

  /** Rebuilds the resolved configuration from package defaults plus the declarative slice. */
  initializeConfig(config?: Partial<SearchControllerConfig>) {
    this.configController.initialize(config);
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
