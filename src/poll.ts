import { StateStore } from './store';
import type { StreamChat } from './client';
import type {
  DefaultGenerics,
  Event,
  ExtendableGenerics,
  PartialPollUpdate,
  PollAnswer,
  PollData,
  PollOptionData,
  PollResponse,
  PollVote,
  QueryVotesFilters,
  QueryVotesOptions,
  VoteSort,
} from './types';

type PollEvent<SCG extends ExtendableGenerics = DefaultGenerics> = {
  cid: string;
  created_at: string;
  poll: PollResponse<SCG>;
};

type PollUpdatedEvent<SCG extends ExtendableGenerics = DefaultGenerics> = PollEvent<SCG> & {
  type: 'poll.updated';
};

type PollClosedEvent<SCG extends ExtendableGenerics = DefaultGenerics> = PollEvent<SCG> & {
  type: 'poll.closed';
};

type PollVoteEvent<SCG extends ExtendableGenerics = DefaultGenerics> = {
  cid: string;
  created_at: string;
  poll: PollResponse<SCG>;
  poll_vote: PollVote<SCG> | PollAnswer<SCG>;
};

type PollVoteCastedEvent<SCG extends ExtendableGenerics = DefaultGenerics> = PollVoteEvent<SCG> & {
  type: 'poll.vote_casted';
};

type PollVoteCastedChanged<SCG extends ExtendableGenerics = DefaultGenerics> = PollVoteEvent<SCG> & {
  type: 'poll.vote_removed';
};

type PollVoteCastedRemoved<SCG extends ExtendableGenerics = DefaultGenerics> = PollVoteEvent<SCG> & {
  type: 'poll.vote_removed';
};

const isPollUpdatedEvent = <SCG extends ExtendableGenerics = DefaultGenerics>(
  e: Event<SCG>,
): e is PollUpdatedEvent<SCG> => e.type === 'poll.updated';
const isPollClosedEventEvent = <SCG extends ExtendableGenerics = DefaultGenerics>(
  e: Event<SCG>,
): e is PollClosedEvent<SCG> => e.type === 'poll.closed';
const isPollVoteCastedEvent = <SCG extends ExtendableGenerics = DefaultGenerics>(
  e: Event<SCG>,
): e is PollVoteCastedEvent<SCG> => e.type === 'poll.vote_casted';
const isPollVoteChangedEvent = <SCG extends ExtendableGenerics = DefaultGenerics>(
  e: Event<SCG>,
): e is PollVoteCastedChanged<SCG> => e.type === 'poll.vote_changed';
const isPollVoteRemovedEvent = <SCG extends ExtendableGenerics = DefaultGenerics>(
  e: Event<SCG>,
): e is PollVoteCastedRemoved<SCG> => e.type === 'poll.vote_removed';

export const isVoteAnswer = <SCG extends ExtendableGenerics = DefaultGenerics>(
  vote: PollVote<SCG> | PollAnswer<SCG>,
): vote is PollAnswer<SCG> => !!(vote as PollAnswer<SCG>)?.answer_text;

export type PollAnswersQueryParams = {
  filter?: QueryVotesFilters;
  options?: QueryVotesOptions;
  sort?: VoteSort;
};

export type PollOptionVotesQueryParams = {
  filter: { option_id: string } & QueryVotesFilters;
  options?: QueryVotesOptions;
  sort?: VoteSort;
};

type OptionId = string;
type PollVoteId = string;

export type PollState<SCG extends ExtendableGenerics = DefaultGenerics> = PollResponse<SCG> & {
  lastActivityAt: Date; // todo: would be ideal to get this from the BE
  maxVotedOptionIds: OptionId[];
  ownVotesByOptionId: Record<OptionId, PollVoteId>; // single user can vote only once for the same option
  ownAnswer?: PollAnswer; // each user can have only one answer
};

type PollInitOptions<SCG extends ExtendableGenerics = DefaultGenerics> = {
  client: StreamChat<SCG>;
  poll: PollResponse<SCG>;
};

export class Poll<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<PollState<SCG>>;
  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ client, poll }: PollInitOptions<SCG>) {
    this.client = client;

    this.state = new StateStore<PollState<SCG>>({
      ...poll,
      lastActivityAt: new Date(),
      maxVotedOptionIds: getMaxVotedOptionIds(poll.vote_counts_by_option),
      ownVotesByOptionId: getOwnVotesByOptionId(poll.own_votes),
    });
  }

  get data(): PollState<SCG> {
    return this.state.getLatestValue();
  }

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Already listening for events and changes
      return;
    }

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

  private subscribePollUpdated() {
    return this.client.on('poll.updated', (event) => {
      if (!isPollUpdatedEvent(event)) return;
      // @ts-ignore
      this.state.partialNext({ ...event.poll, lastActivityAt: new Date(event.created_at) });
    }).unsubscribe;
  }

  private subscribePollClosed() {
    return this.client.on('poll.closed', (event) => {
      if (!isPollClosedEventEvent(event)) return;
      // @ts-ignore
      this.state.next({ ...event.poll, lastActivityAt: new Date(event.created_at) });
    }).unsubscribe;
  }

  private subscribeVoteCasted() {
    return this.client.on('poll.vote_casted', (event) => {
      if (!isPollVoteCastedEvent(event)) return;
      const currentState = this.data;
      const isOwnVote = event.poll_vote.user_id === this.client.userID;
      const ownVotes = [...(currentState?.own_votes || [])];
      let latestAnswers = [...currentState.latest_answers];
      let ownAnswer = currentState.ownAnswer;
      const ownVotesByOptionId = currentState.ownVotesByOptionId;
      let maxVotedOptionIds = currentState.maxVotedOptionIds;

      if (isOwnVote) {
        ownVotes.push(event.poll_vote);
        if (event.poll_vote.option_id) {
          ownVotesByOptionId[event.poll_vote.option_id] = event.poll_vote.id;
        }
        if (isVoteAnswer(event.poll_vote)) {
          ownAnswer = event.poll_vote;
        }
      }

      if (isVoteAnswer(event.poll_vote)) {
        latestAnswers = [event.poll_vote, ...latestAnswers];
      } else {
        maxVotedOptionIds = getMaxVotedOptionIds(event.poll.vote_counts_by_option);
      }

      this.state.next({
        ...event.poll,
        latest_answers: latestAnswers,
        lastActivityAt: new Date(event.created_at),
        ownAnswer,
        own_votes: ownVotes,
        ownVotesByOptionId,
        maxVotedOptionIds,
      });
    }).unsubscribe;
  }

  private subscribeVoteChanged() {
    return this.client.on('poll.vote_casted', (event) => {
      if (!isPollVoteChangedEvent(event)) return;
      const currentState = this.data;
      const isOwnVote = event.poll_vote.user_id === this.client.userID;
      let ownVotes = [...(currentState?.own_votes || [])];
      let latestAnswers = [...currentState.latest_answers];
      let ownAnswer = currentState.ownAnswer;
      let ownVotesByOptionId = currentState.ownVotesByOptionId;
      let maxVotedOptionIds = currentState.maxVotedOptionIds;

      if (isOwnVote) {
        if (isVoteAnswer(event.poll_vote)) {
          latestAnswers = [
            event.poll_vote,
            ...latestAnswers.filter((answer) => answer.user_id === event.poll_vote.user_id),
          ];
          // remove vote from own votes if it changes to answer
          ownVotes = ownVotes.filter((vote) => vote.id !== event.poll_vote.id);
          ownAnswer = event.poll_vote;
        } else if (event.poll.enforce_unique_vote) {
          // the same user clicked another option
          ownVotes.map((vote) => (vote.id === event.poll_vote.id ? event.poll_vote : vote));
          ownVotesByOptionId = Object.entries(ownVotesByOptionId).reduce<Record<OptionId, PollVoteId>>(
            (acc, [optionId, voteId]) => {
              if (optionId === event.poll_vote.option_id) {
                acc[optionId] = event.poll_vote.id;
              } else if (voteId !== event.poll_vote.id) {
                acc[optionId] = voteId;
              }
              return acc;
            },
            {},
          );
        }
      } else if (isVoteAnswer(event.poll_vote)) {
        latestAnswers = [event.poll_vote, ...latestAnswers];
      } else {
        maxVotedOptionIds = getMaxVotedOptionIds(event.poll.vote_counts_by_option);
      }

      this.state.next({
        ...event.poll,
        latest_answers: latestAnswers,
        lastActivityAt: new Date(event.created_at),
        ownAnswer,
        own_votes: ownVotes,
        ownVotesByOptionId,
        maxVotedOptionIds,
      });
    }).unsubscribe;
  }

  private subscribeVoteRemoved() {
    return this.client.on('poll.vote_casted', (event) => {
      if (!isPollVoteRemovedEvent(event)) return;
      const currentState = this.data;
      const isOwnVote = event.poll_vote.user_id === this.client.userID;
      let ownVotes = [...(currentState?.own_votes || [])];
      let latestAnswers = [...currentState.latest_answers];
      let ownAnswer = currentState.ownAnswer;
      const ownVotesByOptionId = { ...currentState.ownVotesByOptionId };
      let maxVotedOptionIds = currentState.maxVotedOptionIds;

      if (isOwnVote) {
        ownVotes = ownVotes.filter((vote) => vote.id !== event.poll_vote.id);
        if (event.poll_vote.option_id) {
          delete ownVotesByOptionId[event.poll_vote.option_id];
        }
      }
      if (isVoteAnswer(event.poll_vote)) {
        latestAnswers = latestAnswers.filter((answer) => answer.id !== event.poll_vote.id);
        ownAnswer = undefined;
      } else {
        maxVotedOptionIds = getMaxVotedOptionIds(event.poll.vote_counts_by_option);
      }

      this.state.next({
        ...event.poll,
        latest_answers: latestAnswers,
        lastActivityAt: new Date(event.created_at),
        ownAnswer,
        own_votes: ownVotes,
        ownVotesByOptionId,
        maxVotedOptionIds,
      });
    }).unsubscribe;
  }

  async query(id: string) {
    const { poll } = await this.client.getPoll(id);
    // @ts-ignore
    this.state.partialNext({ ...poll, lastActivityAt: new Date() });
    return poll;
  }

  async update(data: Exclude<PollData<SCG>, 'id'>) {
    return await this.client.updatePoll({ ...data, id: this.data.id });
  }

  async partialUpdate(partialPollObject: PartialPollUpdate<SCG>) {
    return await this.client.partialUpdatePoll(this.data.id, partialPollObject);
  }

  async close() {
    return await this.client.closePoll(this.data.id);
  }

  async delete() {
    return await this.client.deletePoll(this.data.id);
  }

  async createOption(option: PollOptionData) {
    return await this.client.createPollOption(this.data.id, option);
  }

  async updateOption(option: PollOptionData) {
    return await this.client.updatePollOption(this.data.id, option);
  }

  async deleteOption(optionId: string) {
    return await this.client.deletePollOption(this.data.id, optionId);
  }

  async castVote(optionId: string, messageId: string) {
    return await this.client.castPollVote(messageId, this.data.id, { option_id: optionId });
  }

  async removeVote(voteId: string, messageId: string) {
    return await this.client.removePollVote(messageId, this.data.id, voteId);
  }

  async addAnswer(answerText: string, messageId: string) {
    return await this.client.addPollAnswer(messageId, this.data.id, answerText);
  }

  async removeAnswer(answerId: string, messageId: string) {
    return await this.client.removePollVote(messageId, this.data.id, answerId);
  }

  async queryAnswers(params: PollAnswersQueryParams) {
    return await this.client.queryPollAnswers(this.data.id, params.filter, params.sort, params.options);
  }

  async queryOptionVotes(params: PollOptionVotesQueryParams) {
    return await this.client.queryPollVotes(this.data.id, params.filter, params.sort, params.options);
  }
}

function getMaxVotedOptionIds(voteCountsByOption: PollResponse['vote_counts_by_option']) {
  let maxVotes = 0;
  let winningOptions: string[] = [];
  for (const [id, count] of Object.entries(voteCountsByOption)) {
    if (count > maxVotes) {
      winningOptions = [id];
      maxVotes = count;
    } else if (count === maxVotes) {
      winningOptions.push(id);
    }
  }
  return winningOptions;
}

function getOwnVotesByOptionId(ownVotes: PollResponse['own_votes']) {
  return !ownVotes
    ? ({} as Record<OptionId, PollVoteId>)
    : ownVotes.reduce<Record<OptionId, PollVoteId>>((acc, vote) => {
        if (isVoteAnswer(vote) || !vote.option_id) return acc;
        acc[vote.option_id] = vote.id;
        return acc;
      }, {});
}
