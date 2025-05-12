import type { StreamChat } from './client';
import type {
  CreatePollData,
  LocalMessage,
  MessageResponse,
  PollResponse,
  PollSort,
  QueryPollsFilters,
  QueryPollsOptions,
} from './types';
import { Poll } from './poll';
import { formatMessage } from './utils';

export class PollManager {
  private client: StreamChat;
  // The pollCache contains only polls that have been created and sent as messages
  // (i.e only polls that are coupled with a message, can be voted on and require a
  // reactive state). It shall work as a basic look-up table for our SDK to be able
  // to quickly consume poll state that will be reactive even without the polls being
  // rendered within the UI.
  private pollCache = new Map<string, Poll>();
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
  }

  get data(): Map<string, Poll> {
    return this.pollCache;
  }

  public fromState = (id: string) => this.pollCache.get(id);

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Already listening for events and changes
      return;
    }

    this.unsubscribeFunctions.add(this.subscribeMessageNew());
    this.unsubscribeFunctions.add(this.subscribePollUpdated());
    this.unsubscribeFunctions.add(this.subscribePollClosed());
    this.unsubscribeFunctions.add(this.subscribeVoteCasted());
    this.unsubscribeFunctions.add(this.subscribeVoteChanged());
    this.unsubscribeFunctions.add(this.subscribeVoteRemoved());
  };

  public unregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    this.unsubscribeFunctions.clear();
  };

  public createPoll = async (poll: CreatePollData) => {
    const { poll: createdPoll } = await this.client.createPoll(poll);

    return new Poll({ client: this.client, poll: createdPoll });
  };

  public getPoll = async (id: string) => {
    const cachedPoll = this.fromState(id);

    // optimistically return the cached poll if it exists and update in the background
    if (cachedPoll) {
      this.client.getPoll(id).then(({ poll }) => this.setOrOverwriteInCache(poll, true));
      return cachedPoll;
    }
    // fetch it, write to the cache and return otherwise
    const { poll } = await this.client.getPoll(id);

    this.setOrOverwriteInCache(poll);

    return this.fromState(id);
  };

  public queryPolls = async (
    filter: QueryPollsFilters,
    sort: PollSort = [],
    options: QueryPollsOptions = {},
  ) => {
    const { polls, next } = await this.client.queryPolls(filter, sort, options);

    const pollInstances = polls.map((poll) => {
      this.setOrOverwriteInCache(poll, true);

      return this.fromState(poll.id);
    });

    return {
      polls: pollInstances,
      next,
    };
  };

  public hydratePollCache = (
    messages: LocalMessage[] | MessageResponse[],
    overwriteState?: boolean,
  ) => {
    for (const message of messages) {
      if (!message.poll) {
        continue;
      }
      const pollResponse = message.poll as PollResponse;
      this.setOrOverwriteInCache(pollResponse, overwriteState);
    }
  };

  private setOrOverwriteInCache = (
    pollResponse: PollResponse,
    overwriteState?: boolean,
  ) => {
    if (!this.client._cacheEnabled()) {
      return;
    }
    const pollFromCache = this.fromState(pollResponse.id);
    if (!pollFromCache) {
      const poll = new Poll({ client: this.client, poll: pollResponse });
      this.pollCache.set(poll.id, poll);
    } else if (overwriteState) {
      pollFromCache.reinitializeState(pollResponse);
    }
  };

  private subscribePollUpdated = () =>
    this.client.on('poll.updated', (event) => {
      if (event.poll?.id) {
        this.fromState(event.poll.id)?.handlePollUpdated(event);
      }
    }).unsubscribe;

  private subscribePollClosed = () =>
    this.client.on('poll.closed', (event) => {
      if (event.poll?.id) {
        this.fromState(event.poll.id)?.handlePollClosed(event);
      }
    }).unsubscribe;

  private subscribeVoteCasted = () =>
    this.client.on('poll.vote_casted', (event) => {
      if (event.poll?.id) {
        this.fromState(event.poll.id)?.handleVoteCasted(event);
      }
    }).unsubscribe;

  private subscribeVoteChanged = () =>
    this.client.on('poll.vote_changed', (event) => {
      if (event.poll?.id) {
        this.fromState(event.poll.id)?.handleVoteChanged(event);
      }
    }).unsubscribe;

  private subscribeVoteRemoved = () =>
    this.client.on('poll.vote_removed', (event) => {
      if (event.poll?.id) {
        this.fromState(event.poll.id)?.handleVoteRemoved(event);
      }
    }).unsubscribe;

  private subscribeMessageNew = () =>
    this.client.on('message.new', (event) => {
      const { message } = event;
      if (message) {
        const formattedMessage = formatMessage(message);
        this.hydratePollCache([formattedMessage]);
      }
    }).unsubscribe;
}
