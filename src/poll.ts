import { StateStore } from '@stream-io/state-store';
import { nowNs } from './utils/time';
import { CORE_NOTIFICATION_TYPE } from './notifications';
import type { StreamChat } from './client';
import { getMaxVotedOptionIds, OptimisticPollVotes } from './poll_optimistic_votes';
import type {
  CreatePollOptionRequest,
  EventPayload,
  PartialPollUpdate,
  PollResponseData,
  PollVoteResponseData,
  QueryVotesFilters,
  QueryVotesOptions,
  RequireLiteral,
  SortParamRequest,
  UpdatePollOptionRequest,
  UpdatePollRequest,
  VotingVisibility,
} from './types';
import type {
  PollResponseData as Gen_PollResponseData,
  TimestampNS,
  WSEvent,
} from './gen/models';

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
): vote is RequireLiteral<PollVoteResponseData, 'answer_text' | 'is_answer'> =>
  !!vote?.answer_text;

export type PollAnswersQueryParams = {
  filter?: QueryVotesFilters;
  options?: QueryVotesOptions;
  sort?: SortParamRequest[];
};

export type PollOptionVotesQueryParams = {
  filter: { option_id: string } & QueryVotesFilters;
  options?: QueryVotesOptions;
  sort?: SortParamRequest[];
};

type OptionId = string;

export type PollState = Omit<PollResponseData, 'own_votes' | 'id'> & {
  /** Unix nanoseconds, matching every API timestamp. */
  lastActivityAt: TimestampNS; // todo: would be ideal to get this from the BE
  maxVotedOptionIds: OptionId[];
  ownVotesByOptionId: Record<OptionId, PollVoteResponseData>;
  ownAnswer?: PollVoteResponseData; // each user can have only one answer
};

type PollInitOptions = {
  client: StreamChat;
  poll: Gen_PollResponseData;
};

export class Poll {
  public readonly state: StateStore<PollState>;
  public id: string;
  private client: StreamChat;
  private optimisticVotes: OptimisticPollVotes;
  // Set whenever server data (WS event or rehydration) confirms that the poll is closed,
  // so that a failed optimistic close does not reopen a poll that is actually closed.
  private closeConfirmed = false;

  constructor({ client, poll }: PollInitOptions) {
    this.client = client;
    this.id = poll.id;

    this.state = new StateStore<PollState>(this.getInitialStateFromPollResponse(poll));
    this.optimisticVotes = new OptimisticPollVotes({ client: this.client, poll: this });
  }

  private getInitialStateFromPollResponse = (poll: PollInitOptions['poll']) => {
    const { own_votes, id: _id, ...pollResponseForState } = poll;
    const { ownAnswer, ownVotes } = own_votes?.reduce<{
      ownVotes: PollVoteResponseData[];
      ownAnswer?: PollVoteResponseData;
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
      lastActivityAt: nowNs(),
      maxVotedOptionIds: getMaxVotedOptionIds(pollResponseForState.vote_counts_by_option),
      ownAnswer,
      ownVotesByOptionId: getOwnVotesByOptionId(ownVotes),
    };
  };

  // persists only the server's votes, never the optimistic ones
  private upsertOfflineDb = () => {
    const serverState = this.optimisticVotes.withServerVotes(this.data);
    this.client.offlineDb?.executeQuerySafely(
      (db) => db.upsertPoll({ poll: mapPollStateToResponse(this, serverState) }),
      { method: 'upsertPoll' },
    );
  };

  public reinitializeState = (poll: PollInitOptions['poll']) => {
    if (poll.is_closed) this.closeConfirmed = true;
    const initialState = this.getInitialStateFromPollResponse(poll);
    this.optimisticVotes.reset(initialState);
    this.state.partialNext(initialState);
  };

  // Hands the vote state of a WS vote event to the optimistic votes, which decide whether to show it.
  private updateFromVoteEvent = (
    event: EventPayload<'poll.vote_casted' | 'poll.vote_changed' | 'poll.vote_removed'>,
    ownVotesByOptionId: Record<OptionId, PollVoteResponseData>,
    answerState: Pick<PollState, 'latest_answers' | 'ownAnswer'>,
  ) => {
    const isOwnVote = event.poll_vote.user_id === this.client.userId;
    const shownVoteState = this.optimisticVotes.handleVoteEvent(event.poll, {
      confirmsOwnVote:
        isOwnVote && !isVoteAnswer(event.poll_vote) && !!event.poll_vote.option_id,
      ownVotesByOptionId,
    });
    this.state.partialNext({
      ...answerState,
      answers_count: event.poll.answers_count,
      lastActivityAt: event.created_at,
      ...shownVoteState,
    });
    this.upsertOfflineDb();
  };

  get data(): PollState {
    return this.state.getLatestValue();
  }

  public handlePollUpdated = (event: EventPayload<'poll.updated'>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollUpdatedEvent(event)) return;

    const { id: _id, ...pollData } = extractPollData(event.poll);
    if (pollData.is_closed) this.closeConfirmed = true;
    // @ts-expect-error type mismatch
    this.state.partialNext({ ...pollData, lastActivityAt: event.created_at });
    this.upsertOfflineDb();
  };

  public handlePollClosed = (event: EventPayload<'poll.closed'>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollClosedEventEvent(event)) return;
    this.closeConfirmed = true;
    this.state.partialNext({
      is_closed: true,
      lastActivityAt: event.created_at,
    });
    this.upsertOfflineDb();
  };

  public handleVoteCasted = (event: EventPayload<'poll.vote_casted'>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteCastedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userId;
    let latestAnswers = [...(currentState.latest_answers as PollVoteResponseData[])];
    let ownAnswer = currentState.ownAnswer;
    const ownVotesByOptionId = { ...this.optimisticVotes.serverOwnVotes };

    if (isOwnVote) {
      if (isVoteAnswer(event.poll_vote)) {
        ownAnswer = event.poll_vote;
      } else if (event.poll_vote.option_id) {
        ownVotesByOptionId[event.poll_vote.option_id] = event.poll_vote;
      }
    }

    if (isVoteAnswer(event.poll_vote)) {
      latestAnswers = [event.poll_vote, ...latestAnswers];
    }

    this.updateFromVoteEvent(event, ownVotesByOptionId, {
      latest_answers: latestAnswers,
      ownAnswer,
    });
  };

  public handleVoteChanged = (event: EventPayload<'poll.vote_changed'>) => {
    // this event is triggered only when event.poll.enforce_unique_vote === true
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteChangedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userId;
    let latestAnswers = [...(currentState.latest_answers as PollVoteResponseData[])];
    let ownAnswer = currentState.ownAnswer;
    let ownVotesByOptionId = this.optimisticVotes.serverOwnVotes;

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
            Record<OptionId, PollVoteResponseData>
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
      }
    } else if (isVoteAnswer(event.poll_vote)) {
      latestAnswers = [event.poll_vote, ...latestAnswers];
    }

    this.updateFromVoteEvent(event, ownVotesByOptionId, {
      latest_answers: latestAnswers,
      ownAnswer,
    });
  };

  public handleVoteRemoved = (event: EventPayload<'poll.vote_removed'>) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteRemovedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userId;
    let latestAnswers = [...(currentState.latest_answers as PollVoteResponseData[])];
    let ownAnswer = currentState.ownAnswer;
    const ownVotesByOptionId = { ...this.optimisticVotes.serverOwnVotes };

    if (isVoteAnswer(event.poll_vote)) {
      latestAnswers = latestAnswers.filter((answer) => answer.id !== event.poll_vote.id);
      if (isOwnVote) {
        ownAnswer = undefined;
      }
    } else if (isOwnVote && event.poll_vote.option_id) {
      delete ownVotesByOptionId[event.poll_vote.option_id];
    }

    this.updateFromVoteEvent(event, ownVotesByOptionId, {
      latest_answers: latestAnswers,
      ownAnswer,
    });
  };

  query = async (id: string) => {
    const { poll } = await this.client.getPoll({ poll_id: id });
    this.state.partialNext({ ...poll, lastActivityAt: nowNs() });
    return poll;
  };

  update = async (data: Exclude<UpdatePollRequest, 'id'>) =>
    await this.client.updatePoll({ ...data, id: this.id as string });

  partialUpdate = async (partialPollObject: PartialPollUpdate) =>
    await this.client.updatePollPartial(
      { poll_id: this.id as string },
      partialPollObject,
    );

  /**
   * Closes the poll. The poll is marked as closed optimistically and the change is
   * reverted if the request fails, unless the server confirmed the close meanwhile.
   * Does nothing if the poll is already closed.
   */
  close = async () => {
    if (this.data.is_closed) return;

    this.closeConfirmed = false;
    this.state.partialNext({ is_closed: true });

    try {
      return await this.client.updatePollPartial(
        { poll_id: this.id as string },
        { set: { is_closed: true } },
      );
    } catch (error) {
      if (!this.closeConfirmed) {
        this.state.partialNext({ is_closed: false });
      }
      throw error;
    }
  };

  delete = async () => await this.client.deletePoll({ poll_id: this.id as string });

  createOption = async (option: CreatePollOptionRequest) =>
    await this.client.createPollOption({ poll_id: this.id as string }, option);

  updateOption = async (option: UpdatePollOptionRequest) =>
    await this.client.updatePollOption({ poll_id: this.id as string }, option);

  deleteOption = async (option_id: string) =>
    await this.client.deletePollOption({ poll_id: this.id as string, option_id });

  /**
   * Casts a vote for an option. The vote is shown right away through a local placeholder vote,
   * which the server's vote replaces once the WS events of all pending vote changes arrived.
   * If the request fails, the change is reverted.
   */
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
          type: CORE_NOTIFICATION_TYPE.pollCastVoteLimit,
        },
      });
      return;
    }

    return await this.optimisticVotes.castVote(optionId, messageId);
  };

  /**
   * Removes a vote. The vote is removed right away and restored if the request fails. Vote
   * requests are sent in order, so removing a vote whose cast is not confirmed yet uses the vote
   * id from the cast's response; if that cast failed, there is nothing to remove.
   */
  removeVote = async (voteId: string, messageId: string) =>
    await this.optimisticVotes.removeVote(voteId, messageId);

  addAnswer = async (answerText: string, messageId: string) =>
    await this.client.castPollVote(
      { message_id: messageId, poll_id: this.id as string },
      { vote: { answer_text: answerText } },
    );

  removeAnswer = async (answerId: string, messageId: string) =>
    await this.client.deletePollVote({
      message_id: messageId,
      poll_id: this.id as string,
      vote_id: answerId,
    });

  queryAnswers = async (params: PollAnswersQueryParams) =>
    await this.client.queryPollVotes(
      { poll_id: this.id as string },
      {
        sort: params.sort,
        filter: { ...(params.filter ?? {}), is_answer: true },
        ...(params.options ?? {}),
      },
    );

  queryOptionVotes = async (params: PollOptionVotesQueryParams) =>
    await this.client.queryPollVotes(
      { poll_id: this.id as string },
      { sort: params.sort, filter: params.filter, ...(params.options ?? {}) },
    );
}

function getOwnVotesByOptionId(ownVotes: PollVoteResponseData[]) {
  return !ownVotes
    ? ({} as Record<OptionId, PollVoteResponseData>)
    : ownVotes.reduce<Record<OptionId, PollVoteResponseData>>((acc, vote) => {
        if (isVoteAnswer(vote) || !vote.option_id) return acc;
        acc[vote.option_id] = vote;
        return acc;
      }, {});
}

export function extractPollData(pollResponse: Gen_PollResponseData): UpdatePollRequest {
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

export function mapPollStateToResponse(
  poll: Poll,
  state: PollState = poll.data,
): PollResponseData {
  const {
    lastActivityAt: _lastActivityAt,

    maxVotedOptionIds: _maxVotedOptionIds,
    ownVotesByOptionId,
    ownAnswer,
    ...restState
  } = state;
  const ownVotes = [
    ...Object.values(ownVotesByOptionId),
    ...(ownAnswer ? [ownAnswer] : []),
  ].sort((a, b) => a.created_at - b.created_at);

  return {
    ...restState,
    own_votes: ownVotes,
    id: poll.id,
  };
}

export function extractPollEnrichedData(
  pollResponse: Gen_PollResponseData,
): Pick<
  Gen_PollResponseData,
  'answers_count' | 'latest_votes_by_option' | 'vote_count' | 'vote_counts_by_option'
> {
  return {
    answers_count: pollResponse.answers_count,
    latest_votes_by_option: pollResponse.latest_votes_by_option,
    vote_count: pollResponse.vote_count,
    vote_counts_by_option: pollResponse.vote_counts_by_option,
  };
}
