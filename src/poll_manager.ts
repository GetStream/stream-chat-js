import type { StreamChat } from './client';
import type {
  CreatePollData,
  DefaultGenerics,
  ExtendableGenerics,
  PollSort,
  QueryPollsFilters,
  QueryPollsOptions,
} from './types';
import { Poll } from './poll';
import { FormatMessageResponse } from './types';
import { formatMessage } from './utils';

export class PollManager<SCG extends ExtendableGenerics = DefaultGenerics> {
  private client: StreamChat<SCG>;
  public pollMap = new Map<string, Poll<SCG>>();
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ client }: { client: StreamChat<SCG> }) {
    this.client = client;
  }

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

  public createPoll = async (poll: CreatePollData<SCG>) => {
    const { poll: createdPoll } = await this.client.createPoll(poll);

    return new Poll({ client: this.client, poll: createdPoll });
  };

  public getPoll = async (id: string) => {
    const { poll } = await this.client.getPoll(id);

    return new Poll({ client: this.client, poll });
  };

  public queryPolls = async (filter: QueryPollsFilters, sort: PollSort = [], options: QueryPollsOptions = {}) => {
    const { polls, next } = await this.client.queryPolls(filter, sort, options);

    return {
      polls: polls.map((poll) => new Poll({ client: this.client, poll })),
      next,
    };
  };

  public hydratePollCache = (messages: FormatMessageResponse<SCG>[]) => {
    for (const message of messages) {
      if (message.poll_id && message.poll && !this.pollMap.has(message.poll_id)) {
        const poll = new Poll({ client: this.client, poll: message.poll})
        this.pollMap.set(poll.id, poll);
      }
    }
  }

  private subscribePollUpdated = () => {
    return this.client.on('poll.updated', (event) => {
      if (event.poll?.id && this.pollMap.has(event.poll.id)) {
        this.pollMap.get(event.poll.id)?.handlePollUpdated(event);
      }
    }).unsubscribe;
  }

  private subscribePollClosed = () => {
    return this.client.on('poll.closed', (event) => {
      if (event.poll?.id && this.pollMap.has(event.poll.id)) {
        this.pollMap.get(event.poll.id)?.handlePollClosed(event);
      }
    }).unsubscribe;
  }

  private subscribeVoteCasted = () => {
    return this.client.on('poll.vote_casted', (event) => {
      if (event.poll?.id && this.pollMap.has(event.poll.id)) {
        this.pollMap.get(event.poll.id)?.handleVoteCasted(event);
      }
    }).unsubscribe;
  }

  private subscribeVoteChanged = () => {
    return this.client.on('poll.vote_changed', (event) => {
      if (event.poll?.id && this.pollMap.has(event.poll.id)) {
        this.pollMap.get(event.poll.id)?.handleVoteChanged(event);
      }
    }).unsubscribe;
  }

  private subscribeVoteRemoved = () => {
    return this.client.on('poll.vote_removed', (event) => {
      if (event.poll?.id && this.pollMap.has(event.poll.id)) {
        this.pollMap.get(event.poll.id)?.handleVoteRemoved(event);
      }
    }).unsubscribe;
  }

  private subscribeMessageNew = () => {
    return this.client.on('message.new', (event) => {
      const { message } = event;
      if (message) {
        const formattedMessage = formatMessage(message);
        this.hydratePollCache([formattedMessage]);
      }
    }).unsubscribe;
  }
}
