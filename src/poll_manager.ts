import type { StreamChat } from './client';
import type {
  CreatePollRequest,
  LocalMessage,
  MessageResponse,
  PollResponseData,
  StreamRequestOptions,
} from './types';
import type { QueryPollsRequest } from './gen/models';
import { Poll } from './poll';
import { formatMessage } from './utils';
import { WithSubscriptions } from './utils/WithSubscriptions';

export class PollManager extends WithSubscriptions {
  private client: StreamChat;
  // Only polls attached to a sent message, so their state stays reactive without being rendered.
  private pollCache = new Map<string, Poll>();

  constructor({ client }: { client: StreamChat }) {
    super();
    this.client = client;
  }

  get data(): Map<string, Poll> {
    return this.pollCache;
  }

  public fromState = (id: string) => this.pollCache.get(id);

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) {
      return;
    }

    this.addUnsubscribeFunction(this.subscribeMessageNew());
    this.addUnsubscribeFunction(this.subscribePollUpdated());
    this.addUnsubscribeFunction(this.subscribePollClosed());
    this.addUnsubscribeFunction(this.subscribeVoteCasted());
    this.addUnsubscribeFunction(this.subscribeVoteChanged());
    this.addUnsubscribeFunction(this.subscribeVoteRemoved());
    this.addUnsubscribeFunction(this.subscribeUserUpdated());
  };

  public createPoll = async (poll: CreatePollRequest) => {
    const { poll: createdPoll } = await this.client.createPoll(poll);

    if (!createdPoll.vote_counts_by_option) {
      createdPoll.vote_counts_by_option = {};
    }

    this.setOrOverwriteInCache(createdPoll);

    return this.fromState(createdPoll.id);
  };

  public getPoll = async (id: string) => {
    const cachedPoll = this.fromState(id);

    // Returns the cached poll right away and refreshes it in the background.
    if (cachedPoll) {
      this.client
        .getPoll({ poll_id: id })
        .then(({ poll }) => this.setOrOverwriteInCache(poll, true));
      return cachedPoll;
    }
    const { poll } = await this.client.getPoll({ poll_id: id });

    this.setOrOverwriteInCache(poll);

    return this.fromState(id);
  };

  /**
   * Queries polls and caches them as `Poll` instances. Takes the same request as `client.queryPolls`.
   *
   * @param request - The filter, sort and pagination of the query (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The `Poll` instances and the cursor of the next page.
   */
  public queryPolls = async (
    request: QueryPollsRequest = {},
    requestOptions?: StreamRequestOptions,
  ) => {
    const { polls, next } = await this.client.queryPolls(request, requestOptions);

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
      const pollResponse = message.poll as PollResponseData;
      this.setOrOverwriteInCache(pollResponse, overwriteState);
    }
  };

  private setOrOverwriteInCache = (
    pollResponse: PollResponseData,
    overwriteState?: boolean,
  ) => {
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

  // Votes carry a copy of their voter, so a changed name or image reaches the polls only from here.
  private subscribeUserUpdated = () =>
    this.client.on('user.updated', (event) => {
      const { user } = event;
      if (!user?.id) return;
      for (const poll of this.pollCache.values()) poll.handleUserUpdated(user);
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
