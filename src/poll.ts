import { StateStore } from './store';
import type { StreamChat } from './client';
import type {
  Event,
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

type PollEvent = {
  cid: string;
  created_at: string;
  poll: PollResponse;
};

type PollUpdatedEvent = PollEvent & {
  type: 'poll.updated';
};

type PollClosedEvent = PollEvent & {
  type: 'poll.closed';
};

type PollVoteEvent = {
  cid: string;
  created_at: string;
  poll: PollResponse;
  poll_vote: PollVote | PollAnswer;
};

type PollVoteCastedEvent = PollVoteEvent & {
  type: 'poll.vote_casted';
};

type PollVoteCastedChanged = PollVoteEvent & {
  type: 'poll.vote_removed';
};

type PollVoteCastedRemoved = PollVoteEvent & {
  type: 'poll.vote_removed';
};

const isPollUpdatedEvent = (e: Event): e is PollUpdatedEvent => e.type === 'poll.updated';
const isPollClosedEventEvent = (e: Event): e is PollClosedEvent =>
  e.type === 'poll.closed';
const isPollVoteCastedEvent = (e: Event): e is PollVoteCastedEvent =>
  e.type === 'poll.vote_casted';
const isPollVoteChangedEvent = (e: Event): e is PollVoteCastedChanged =>
  e.type === 'poll.vote_changed';
const isPollVoteRemovedEvent = (e: Event): e is PollVoteCastedRemoved =>
  e.type === 'poll.vote_removed';

export const isVoteAnswer = (vote: PollVote | PollAnswer): vote is PollAnswer =>
  !!(vote as PollAnswer)?.answer_text;

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

export type PollState = Omit<PollResponse, 'own_votes' | 'id'> & {
  lastActivityAt: Date; // todo: would be ideal to get this from the BE
  maxVotedOptionIds: OptionId[];
  ownVotesByOptionId: Record<OptionId, PollVote>;
  ownAnswer?: PollAnswer; // each user can have only one answer
};

type PollInitOptions = {
  client: StreamChat;
  poll: PollResponse;
};

export class Poll {
  public readonly state: StateStore<PollState>;
  public id: string;
  private client: StreamChat;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ client, poll }: PollInitOptions) {
    this.client = client;
    this.id = poll.id;

    this.state = new StateStore<PollState>(this.getInitialStateFromPollResponse(poll));
  }

  private getInitialStateFromPollResponse = (poll: PollInitOptions['poll']) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { own_votes, id, ...pollResponseForState } = poll;
    const { ownAnswer, ownVotes } = own_votes?.reduce<{
      ownVotes: PollVote[];
      ownAnswer?: PollAnswer;
    }>(
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
        pollResponseForState.vote_counts_by_option as PollResponse['vote_counts_by_option'],
      ),
      ownAnswer,
      ownVotesByOptionId: getOwnVotesByOptionId(ownVotes),
    };
  };

  public reinitializeState = (poll: PollInitOptions['poll']) => {
    this.state.partialNext(this.getInitialStateFromPollResponse(poll));
  };

  get data(): PollState {
    return this.state.getLatestValue();
  }

  public handlePollUpdated = (event: Event) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollUpdatedEvent(event)) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...pollData } = extractPollData(event.poll);
    // @ts-expect-error type mismatch
    this.state.partialNext({ ...pollData, lastActivityAt: new Date(event.created_at) });
  };

  public handlePollClosed = (event: Event) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollClosedEventEvent(event)) return;
    this.state.partialNext({
      is_closed: true,
      lastActivityAt: new Date(event.created_at),
    });
  };

  public handleVoteCasted = (event: Event) => {
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
    this.state.partialNext({
      ...pollEnrichData,
      latest_answers: latestAnswers,
      lastActivityAt: new Date(event.created_at),
      ownAnswer,
      ownVotesByOptionId,
      maxVotedOptionIds,
    });
  };

  public handleVoteChanged = (event: Event) => {
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
        latestAnswers = [
          event.poll_vote,
          ...latestAnswers.filter((answer) => answer.id !== event.poll_vote.id),
        ];
        ownAnswer = event.poll_vote;
      } else if (event.poll_vote.option_id) {
        if (event.poll.enforce_unique_vote) {
          ownVotesByOptionId = { [event.poll_vote.option_id]: event.poll_vote };
        } else {
          ownVotesByOptionId = Object.entries(ownVotesByOptionId).reduce<
            Record<OptionId, PollVote>
          >((acc, [optionId, vote]) => {
            if (
              optionId !== event.poll_vote.option_id &&
              vote.id === event.poll_vote.id
            ) {
              return acc;
            }
            acc[optionId] = vote;
            return acc;
          }, {});
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
    this.state.partialNext({
      ...pollEnrichData,
      latest_answers: latestAnswers,
      lastActivityAt: new Date(event.created_at),
      ownAnswer,
      ownVotesByOptionId,
      maxVotedOptionIds,
    });
  };

  public handleVoteRemoved = (event: Event) => {
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
    this.state.partialNext({ ...poll, lastActivityAt: new Date() });
    return poll;
  };

  update = async (data: Exclude<PollData, 'id'>) =>
    await this.client.updatePoll({ ...data, id: this.id });

  partialUpdate = async (partialPollObject: PartialPollUpdate) =>
    await this.client.partialUpdatePoll(this.id as string, partialPollObject);

  close = async () => await this.client.closePoll(this.id as string);

  delete = async () => await this.client.deletePoll(this.id as string);

  createOption = async (option: PollOptionData) =>
    await this.client.createPollOption(this.id as string, option);

  updateOption = async (option: PollOptionData) =>
    await this.client.updatePollOption(this.id as string, option);

  deleteOption = async (optionId: string) =>
    await this.client.deletePollOption(this.id as string, optionId);

  castVote = async (optionId: string, messageId: string) => {
    const { max_votes_allowed, ownVotesByOptionId } = this.data;

    const reachedVoteLimit =
      max_votes_allowed && max_votes_allowed === Object.keys(ownVotesByOptionId).length;

    if (reachedVoteLimit) {
      let oldestVote = Object.values(ownVotesByOptionId)[0];
      Object.values(ownVotesByOptionId)
        .slice(1)
        .forEach((vote) => {
          if (
            !oldestVote?.created_at ||
            new Date(vote.created_at) < new Date(oldestVote.created_at)
          ) {
            oldestVote = vote;
          }
        });
      if (oldestVote?.id) {
        await this.removeVote(oldestVote.id, messageId);
      }
    }
    return await this.client.castPollVote(messageId, this.id as string, {
      option_id: optionId,
    });
  };

  removeVote = async (voteId: string, messageId: string) =>
    await this.client.removePollVote(messageId, this.id as string, voteId);

  addAnswer = async (answerText: string, messageId: string) =>
    await this.client.addPollAnswer(messageId, this.id as string, answerText);

  removeAnswer = async (answerId: string, messageId: string) =>
    await this.client.removePollVote(messageId, this.id as string, answerId);

  queryAnswers = async (params: PollAnswersQueryParams) =>
    await this.client.queryPollAnswers(
      this.id as string,
      params.filter,
      params.sort,
      params.options,
    );

  queryOptionVotes = async (params: PollOptionVotesQueryParams) =>
    await this.client.queryPollVotes(
      this.id as string,
      params.filter,
      params.sort,
      params.options,
    );
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

function getOwnVotesByOptionId(ownVotes: PollVote[]) {
  return !ownVotes
    ? ({} as Record<OptionId, PollVote>)
    : ownVotes.reduce<Record<OptionId, PollVote>>((acc, vote) => {
        if (isVoteAnswer(vote) || !vote.option_id) return acc;
        acc[vote.option_id] = vote;
        return acc;
      }, {});
}

export function extractPollData(pollResponse: PollResponse): PollData {
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

export function extractPollEnrichedData(
  pollResponse: PollResponse,
): Omit<PollEnrichData, 'own_votes' | 'latest_answers'> {
  return {
    answers_count: pollResponse.answers_count,
    latest_votes_by_option: pollResponse.latest_votes_by_option,
    vote_count: pollResponse.vote_count,
    vote_counts_by_option: pollResponse.vote_counts_by_option,
  };
}
