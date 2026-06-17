import { StateStore } from './store';
import type { StreamChat } from './client';
import type {
  EventPayload,
  PartialPollUpdate,
  PollData,
  PollEnrichData,
  PollOptionData,
  PollResponse,
  PollVote,
  QueryVotesFilters,
  QueryVotesOptions,
  RequireLiteral,
  VoteSort,
  VotingVisibility,
} from './types';
import type { PollResponseData as Gen_PollResponseData, WSEvent } from './gen/models';

const isPollUpdatedEvent = (e: WSEvent): e is EventPayload<'poll.updated'> =>
  e.type === 'poll.updated';
const isPollClosedEventEvent = (e: WSEvent): e is EventPayload<'poll.closed'> =>
  e.type === 'poll.closed';
const isPollVoteCastedEvent = (e: WSEvent): e is EventPayload<'poll.vote_casted'> =>
  e.type === 'poll.vote_casted';
const isPollVoteChangedEvent = (e: WSEvent): e is EventPayload<'poll.vote_changed'> =>
  e.type === 'poll.vote_changed';
const isPollVoteRemovedEvent = (e: WSEvent): e is EventPayload<'poll.vote_removed'> =>
  e.type === 'poll.vote_removed';

export const isVoteAnswer = (
  vote: any | undefined,
): vote is RequireLiteral<PollVote, 'answer_text' | 'is_answer'> => !!vote?.answer_text;

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
  ownAnswer?: PollVote; // each user can have only one answer
};

type PollInitOptions = {
  client: StreamChat;
  poll: Gen_PollResponseData;
};

export class Poll {
  public readonly state: StateStore<PollState>;
  public id: string;
  private client: StreamChat;

  constructor({ client, poll }: PollInitOptions) {
    this.client = client;
    this.id = poll.id;

    this.state = new StateStore<PollState>(this.getInitialStateFromPollResponse(poll));
  }

  private getInitialStateFromPollResponse = (poll: PollInitOptions['poll']) => {
    const { own_votes, id: _id, ...pollResponseForState } = poll;
    const { ownAnswer, ownVotes } = own_votes?.reduce<{
      ownVotes: PollVote[];
      ownAnswer?: PollVote;
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
      maxVotedOptionIds: getMaxVotedOptionIds(pollResponseForState.vote_counts_by_option),
      ownAnswer,
      ownVotesByOptionId: getOwnVotesByOptionId(ownVotes),
    };
  };

  private upsertOfflineDb = () => {
    this.client.offlineDb?.executeQuerySafely(
      (db) => db.upsertPoll({ poll: mapPollStateToResponse(this) }),
      { method: 'upsertPoll' },
    );
  };

  public reinitializeState = (poll: PollInitOptions['poll']) => {
    this.state.partialNext(this.getInitialStateFromPollResponse(poll));
  };

  get data(): PollState {
    return this.state.getLatestValue();
  }

  public handlePollUpdated = (event: EventPayload<'poll.updated'>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollUpdatedEvent(event)) return;

    const { id: _id, ...pollData } = extractPollData(event.poll);
    // @ts-expect-error type mismatch
    this.state.partialNext({ ...pollData, lastActivityAt: new Date(event.created_at) });
    this.upsertOfflineDb();
  };

  public handlePollClosed = (event: EventPayload<'poll.closed'>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollClosedEventEvent(event)) return;
    this.state.partialNext({
      is_closed: true,
      lastActivityAt: new Date(event.created_at),
    });
    this.upsertOfflineDb();
  };

  public handleVoteCasted = (event: EventPayload<'poll.vote_casted'>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteCastedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userId;
    let latestAnswers = [...(currentState.latest_answers as PollVote[])];
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
    this.upsertOfflineDb();
  };

  public handleVoteChanged = (event: EventPayload<'poll.vote_changed'>) => {
    // this event is triggered only when event.poll.enforce_unique_vote === true
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteChangedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userId;
    let latestAnswers = [...(currentState.latest_answers as PollVote[])];
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
    this.upsertOfflineDb();
  };

  public handleVoteRemoved = (event: EventPayload<'poll.vote_removed'>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteRemovedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userId;
    let latestAnswers = [...(currentState.latest_answers as PollVote[])];
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
    this.upsertOfflineDb();
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
      this.client.notifications.addInfo({
        message: 'Reached the vote limit. Remove an existing vote first.',
        origin: {
          emitter: 'Poll',
          context: { messageId, optionId },
        },
        options: {
          type: 'validation:poll:castVote:limit',
        },
      });
      return;
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

export function extractPollData(pollResponse: Gen_PollResponseData): PollData {
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
    voting_visibility: pollResponse.voting_visibility as VotingVisibility,
  };
}

export function mapPollStateToResponse(poll: Poll): PollResponse {
  const {
    lastActivityAt: _lastActivityAt,

    maxVotedOptionIds: _maxVotedOptionIds,
    ownVotesByOptionId,
    ownAnswer,
    ...restState
  } = poll.data;
  const ownVotes = [
    ...Object.values(ownVotesByOptionId),
    ...(ownAnswer ? [ownAnswer] : []),
  ].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  return {
    ...restState,
    own_votes: ownVotes,
    id: poll.id,
  };
}

export function extractPollEnrichedData(
  pollResponse: Gen_PollResponseData,
): Omit<PollEnrichData, 'own_votes' | 'latest_answers'> {
  return {
    answers_count: pollResponse.answers_count,
    latest_votes_by_option: pollResponse.latest_votes_by_option,
    vote_count: pollResponse.vote_count,
    vote_counts_by_option: pollResponse.vote_counts_by_option,
  };
}
