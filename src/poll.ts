import { StateStore } from './store';
import type { StreamChat } from './client';
import type {
  DefaultGenerics,
  Event,
  ExtendableGenerics,
  PartialPollUpdate,
  PollAnswer,
  PollData,
  PollEnrichData,
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

export type PollState<SCG extends ExtendableGenerics = DefaultGenerics> = SCG['pollType'] &
  Omit<PollResponse<SCG>, 'own_votes' | 'id'> & {
    lastActivityAt: Date; // todo: would be ideal to get this from the BE
    maxVotedOptionIds: OptionId[];
    ownVotesByOptionId: Record<OptionId, PollVote<SCG>>;
    ownAnswer?: PollAnswer; // each user can have only one answer
  };

type PollInitOptions<SCG extends ExtendableGenerics = DefaultGenerics> = {
  client: StreamChat<SCG>;
  poll: PollResponse<SCG>;
};

export class Poll<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<PollState<SCG>>;
  public id: string;
  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ client, poll }: PollInitOptions<SCG>) {
    this.client = client;
    this.id = poll.id;

    this.state = new StateStore<PollState<SCG>>(this.getInitialStateFromPollResponse(poll));
  }

  private getInitialStateFromPollResponse = (poll: PollInitOptions<SCG>['poll']) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { own_votes, id, ...pollResponseForState } = poll;
    const { ownAnswer, ownVotes } = own_votes?.reduce<{ ownVotes: PollVote<SCG>[]; ownAnswer?: PollAnswer }>(
      (acc, voteOrAnswer) => {
        if (isVoteAnswer(voteOrAnswer)) {
          acc.ownAnswer = voteOrAnswer;
        } else {
          acc.ownVotes.push(voteOrAnswer);
        }
        return acc;
      },
      { ownVotes: [] },
    ) ?? { ownVotes: [] };

    return {
      ...pollResponseForState,
      lastActivityAt: new Date(),
      maxVotedOptionIds: getMaxVotedOptionIds(
        pollResponseForState.vote_counts_by_option as PollResponse<SCG>['vote_counts_by_option'],
      ),
      ownAnswer,
      ownVotesByOptionId: getOwnVotesByOptionId(ownVotes),
    };
  };

  public reinitializeState = (poll: PollInitOptions<SCG>['poll']) => {
    this.state.partialNext(this.getInitialStateFromPollResponse(poll));
  };

  get data(): PollState<SCG> {
    return this.state.getLatestValue();
  }

  public handlePollUpdated = (event: Event<SCG>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollUpdatedEvent(event)) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...pollData } = extractPollData(event.poll);
    // @ts-ignore
    this.state.partialNext({ ...pollData, lastActivityAt: new Date(event.created_at) });
  };

  public handlePollClosed = (event: Event<SCG>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollClosedEventEvent(event)) return;
    // @ts-ignore
    this.state.partialNext({ is_closed: true, lastActivityAt: new Date(event.created_at) });
  };

  public handleVoteCasted = (event: Event<SCG>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteCastedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userID;
    let latestAnswers = [...(currentState.latest_answers as PollAnswer[])];
    let ownAnswer = currentState.ownAnswer;
    const ownVotesByOptionId = currentState.ownVotesByOptionId;
    let maxVotedOptionIds = currentState.maxVotedOptionIds;

    if (isOwnVote) {
      if (isVoteAnswer(event.poll_vote)) {
        ownAnswer = event.poll_vote;
      } else if (event.poll_vote.option_id) {
        ownVotesByOptionId[event.poll_vote.option_id] = event.poll_vote;
      }
    }

    if (isVoteAnswer(event.poll_vote)) {
      latestAnswers = [event.poll_vote, ...latestAnswers];
    } else {
      maxVotedOptionIds = getMaxVotedOptionIds(event.poll.vote_counts_by_option);
    }

    const pollEnrichData = extractPollEnrichedData(event.poll);
    // @ts-ignore
    this.state.partialNext({
      ...pollEnrichData,
      latest_answers: latestAnswers,
      lastActivityAt: new Date(event.created_at),
      ownAnswer,
      ownVotesByOptionId,
      maxVotedOptionIds,
    });
  };

  public handleVoteChanged = (event: Event<SCG>) => {
    // this event is triggered only when event.poll.enforce_unique_vote === true
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteChangedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userID;
    let latestAnswers = [...(currentState.latest_answers as PollAnswer[])];
    let ownAnswer = currentState.ownAnswer;
    let ownVotesByOptionId = currentState.ownVotesByOptionId;
    let maxVotedOptionIds = currentState.maxVotedOptionIds;

    if (isOwnVote) {
      if (isVoteAnswer(event.poll_vote)) {
        latestAnswers = [event.poll_vote, ...latestAnswers.filter((answer) => answer.id !== event.poll_vote.id)];
        ownAnswer = event.poll_vote;
      } else if (event.poll_vote.option_id) {
        if (event.poll.enforce_unique_votes) {
          ownVotesByOptionId = { [event.poll_vote.option_id]: event.poll_vote };
        } else {
          ownVotesByOptionId = Object.entries(ownVotesByOptionId).reduce<Record<OptionId, PollVote<SCG>>>(
            (acc, [optionId, vote]) => {
              if (optionId !== event.poll_vote.option_id && vote.id === event.poll_vote.id) {
                return acc;
              }
              acc[optionId] = vote;
              return acc;
            },
            {},
          );
          ownVotesByOptionId[event.poll_vote.option_id] = event.poll_vote;
        }

        if (ownAnswer?.id === event.poll_vote.id) {
          ownAnswer = undefined;
        }
        maxVotedOptionIds = getMaxVotedOptionIds(event.poll.vote_counts_by_option);
      }
    } else if (isVoteAnswer(event.poll_vote)) {
      latestAnswers = [event.poll_vote, ...latestAnswers];
    } else {
      maxVotedOptionIds = getMaxVotedOptionIds(event.poll.vote_counts_by_option);
    }

    const pollEnrichData = extractPollEnrichedData(event.poll);
    // @ts-ignore
    this.state.partialNext({
      ...pollEnrichData,
      latest_answers: latestAnswers,
      lastActivityAt: new Date(event.created_at),
      ownAnswer,
      ownVotesByOptionId,
      maxVotedOptionIds,
    });
  };

  public handleVoteRemoved = (event: Event<SCG>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteRemovedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userID;
    let latestAnswers = [...(currentState.latest_answers as PollAnswer[])];
    let ownAnswer = currentState.ownAnswer;
    const ownVotesByOptionId = { ...currentState.ownVotesByOptionId };
    let maxVotedOptionIds = currentState.maxVotedOptionIds;

    if (isVoteAnswer(event.poll_vote)) {
      latestAnswers = latestAnswers.filter((answer) => answer.id !== event.poll_vote.id);
      if (isOwnVote) {
        ownAnswer = undefined;
      }
    } else {
      maxVotedOptionIds = getMaxVotedOptionIds(event.poll.vote_counts_by_option);
      if (isOwnVote && event.poll_vote.option_id) {
        delete ownVotesByOptionId[event.poll_vote.option_id];
      }
    }

    const pollEnrichData = extractPollEnrichedData(event.poll);
    // @ts-ignore
    this.state.partialNext({
      ...pollEnrichData,
      latest_answers: latestAnswers,
      lastActivityAt: new Date(event.created_at),
      ownAnswer,
      ownVotesByOptionId,
      maxVotedOptionIds,
    });
  };

  query = async (id: string) => {
    const { poll } = await this.client.getPoll(id);
    // @ts-ignore
    this.state.partialNext({ ...poll, lastActivityAt: new Date() });
    return poll;
  };

  update = async (data: Exclude<PollData<SCG>, 'id'>) => {
    return await this.client.updatePoll({ ...data, id: this.id });
  };

  partialUpdate = async (partialPollObject: PartialPollUpdate<SCG>) => {
    return await this.client.partialUpdatePoll(this.id as string, partialPollObject);
  };

  close = async () => {
    return await this.client.closePoll(this.id as string);
  };

  delete = async () => {
    return await this.client.deletePoll(this.id as string);
  };

  createOption = async (option: PollOptionData) => {
    return await this.client.createPollOption(this.id as string, option);
  };

  updateOption = async (option: PollOptionData) => {
    return await this.client.updatePollOption(this.id as string, option);
  };

  deleteOption = async (optionId: string) => {
    return await this.client.deletePollOption(this.id as string, optionId);
  };

  castVote = async (optionId: string, messageId: string) => {
    const { max_votes_allowed, ownVotesByOptionId } = this.data;

    const reachedVoteLimit = max_votes_allowed && max_votes_allowed === Object.keys(ownVotesByOptionId).length;

    if (reachedVoteLimit) {
      let oldestVote = Object.values(ownVotesByOptionId)[0];
      Object.values(ownVotesByOptionId)
        .slice(1)
        .forEach((vote) => {
          if (!oldestVote?.created_at || new Date(vote.created_at) < new Date(oldestVote.created_at)) {
            oldestVote = vote;
          }
        });
      if (oldestVote?.id) {
        await this.removeVote(oldestVote.id, messageId);
      }
    }
    return await this.client.castPollVote(messageId, this.id as string, { option_id: optionId });
  };

  removeVote = async (voteId: string, messageId: string) => {
    return await this.client.removePollVote(messageId, this.id as string, voteId);
  };

  addAnswer = async (answerText: string, messageId: string) => {
    return await this.client.addPollAnswer(messageId, this.id as string, answerText);
  };

  removeAnswer = async (answerId: string, messageId: string) => {
    return await this.client.removePollVote(messageId, this.id as string, answerId);
  };

  queryAnswers = async (params: PollAnswersQueryParams) => {
    return await this.client.queryPollAnswers(this.id as string, params.filter, params.sort, params.options);
  };

  queryOptionVotes = async (params: PollOptionVotesQueryParams) => {
    return await this.client.queryPollVotes(this.id as string, params.filter, params.sort, params.options);
  };
}

function getMaxVotedOptionIds(voteCountsByOption: PollResponse['vote_counts_by_option']) {
  let maxVotes = 0;
  let winningOptions: string[] = [];
  for (const [id, count] of Object.entries(voteCountsByOption ?? {})) {
    if (count > maxVotes) {
      winningOptions = [id];
      maxVotes = count;
    } else if (count === maxVotes) {
      winningOptions.push(id);
    }
  }
  return winningOptions;
}

function getOwnVotesByOptionId<SCG extends ExtendableGenerics = DefaultGenerics>(ownVotes: PollVote<SCG>[]) {
  return !ownVotes
    ? ({} as Record<OptionId, PollVote<SCG>>)
    : ownVotes.reduce<Record<OptionId, PollVote<SCG>>>((acc, vote) => {
        if (isVoteAnswer(vote) || !vote.option_id) return acc;
        acc[vote.option_id] = vote;
        return acc;
      }, {});
}

export function extractPollData<SCG extends ExtendableGenerics = DefaultGenerics>(
  pollResponse: PollResponse<SCG>,
): PollData<SCG> {
  return {
    allow_answers: pollResponse.allow_answers,
    allow_user_suggested_options: pollResponse.allow_user_suggested_options,
    description: pollResponse.description,
    enforce_unique_vote: pollResponse.enforce_unique_vote,
    id: pollResponse.id,
    is_closed: pollResponse.is_closed,
    max_votes_allowed: pollResponse.max_votes_allowed,
    name: pollResponse.name,
    options: pollResponse.options,
    voting_visibility: pollResponse.voting_visibility,
  };
}

export function extractPollEnrichedData<SCG extends ExtendableGenerics = DefaultGenerics>(
  pollResponse: PollResponse<SCG>,
): Omit<PollEnrichData<SCG>, 'own_votes' | 'latest_answers'> {
  return {
    answers_count: pollResponse.answers_count,
    latest_votes_by_option: pollResponse.latest_votes_by_option,
    vote_count: pollResponse.vote_count,
    vote_counts_by_option: pollResponse.vote_counts_by_option,
  };
}
