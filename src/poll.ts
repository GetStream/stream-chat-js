import { StateStore } from './store';
import { generateUUIDv4 } from './utils';
import type { StreamChat } from './client';
import { getMaxVotedOptionIds, OptimisticPollVotes } from './poll_optimistic_votes';
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
  private optimisticVotes: OptimisticPollVotes;
  // Set whenever server data (WS event or rehydration) confirms that the poll is closed,
  // so that a failed optimistic close does not reopen a poll that is actually closed.
  private closeConfirmed = false;

  constructor({ client, poll }: PollInitOptions) {
    this.client = client;
    this.id = poll.id;

    this.state = new StateStore<PollState>(this.getInitialStateFromPollResponse(poll));
    this.optimisticVotes = new OptimisticPollVotes(this.state);
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
    event: Event & {
      created_at: string;
      poll: PollResponse;
      poll_vote: PollVote | PollAnswer;
    },
    ownVotesByOptionId: Record<OptionId, PollVote>,
    answerState: Pick<PollState, 'latest_answers' | 'ownAnswer'>,
  ) => {
    const isOwnVote = event.poll_vote.user_id === this.client.userID;
    const shownVoteState = this.optimisticVotes.handleVoteEvent(event.poll, {
      confirmsOwnVote:
        isOwnVote && !isVoteAnswer(event.poll_vote) && !!event.poll_vote.option_id,
      ownVotesByOptionId,
    });
    this.state.partialNext({
      ...answerState,
      answers_count: event.poll.answers_count,
      lastActivityAt: new Date(event.created_at),
      ...shownVoteState,
    });
    this.upsertOfflineDb();
  };

  get data(): PollState {
    return this.state.getLatestValue();
  }

  public handlePollUpdated = (event: Event) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollUpdatedEvent(event)) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...pollData } = extractPollData(event.poll);
    if (pollData.is_closed) this.closeConfirmed = true;
    // @ts-expect-error type mismatch
    this.state.partialNext({ ...pollData, lastActivityAt: new Date(event.created_at) });
    this.upsertOfflineDb();
  };

  public handlePollClosed = (event: Event) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollClosedEventEvent(event)) return;
    this.closeConfirmed = true;
    this.state.partialNext({
      is_closed: true,
      lastActivityAt: new Date(event.created_at),
    });
    this.upsertOfflineDb();
  };

  public handleVoteCasted = (event: Event) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteCastedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userID;
    let latestAnswers = [...(currentState.latest_answers as PollAnswer[])];
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

  public handleVoteChanged = (event: Event) => {
    // this event is triggered only when event.poll.enforce_unique_vote === true
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteChangedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userID;
    let latestAnswers = [...(currentState.latest_answers as PollAnswer[])];
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
      }
    } else if (isVoteAnswer(event.poll_vote)) {
      latestAnswers = [event.poll_vote, ...latestAnswers];
    }

    this.updateFromVoteEvent(event, ownVotesByOptionId, {
      latest_answers: latestAnswers,
      ownAnswer,
    });
  };

  public handleVoteRemoved = (event: Event) => {
    if (event.poll?.id && event.poll.id !== this.id) return;
    if (!isPollVoteRemovedEvent(event)) return;
    const currentState = this.data;
    const isOwnVote = event.poll_vote.user_id === this.client.userID;
    let latestAnswers = [...(currentState.latest_answers as PollAnswer[])];
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
    const { poll } = await this.client.getPoll(id);
    this.state.partialNext({ ...poll, lastActivityAt: new Date() });
    return poll;
  };

  update = async (data: Exclude<PollData, 'id'>) =>
    await this.client.updatePoll({ ...data, id: this.id });

  partialUpdate = async (partialPollObject: PartialPollUpdate) =>
    await this.client.partialUpdatePoll(this.id as string, partialPollObject);

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
      return await this.client.closePoll(this.id as string);
    } catch (error) {
      if (!this.closeConfirmed) {
        this.state.partialNext({ is_closed: false });
      }
      throw error;
    }
  };

  delete = async () => await this.client.deletePoll(this.id as string);

  createOption = async (option: PollOptionData) =>
    await this.client.createPollOption(this.id as string, option);

  updateOption = async (option: PollOptionData) =>
    await this.client.updatePollOption(this.id as string, option);

  deleteOption = async (optionId: string) =>
    await this.client.deletePollOption(this.id as string, optionId);

  /**
   * Casts a vote for an option. The vote is applied to the state optimistically through a
   * local placeholder vote, which the subsequent WS event replaces with the server vote.
   * If the request fails, the optimistic change is reverted.
   */
  castVote = async (optionId: string, messageId: string) => {
    const { enforce_unique_vote, max_votes_allowed, ownVotesByOptionId } = this.data;

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

    const sendRequest = () =>
      this.client.castPollVote(messageId, this.id as string, { option_id: optionId });

    // Already voted for this option, there is nothing to apply optimistically.
    if (ownVotesByOptionId[optionId]) return await this.optimisticVotes.send(sendRequest);

    const now = new Date().toISOString();
    // shown until the server's vote arrives
    const vote: PollVote = {
      created_at: now,
      id: `local-${generateUUIDv4()}`,
      option_id: optionId,
      poll_id: this.id,
      updated_at: now,
      user: this.client.user,
      user_id: this.client.userID,
    };
    // in polls with unique votes, casting a vote changes the existing one
    const replacedVotes = enforce_unique_vote ? Object.values(ownVotesByOptionId) : [];

    return await this.optimisticVotes.cast(sendRequest, { replacedVotes, vote });
  };

  /**
   * Removes a vote. The vote is removed from the state optimistically and restored if the
   * request fails. Removing a vote whose cast is still in flight waits for the cast to
   * resolve the real vote id; if that cast fails, there is nothing to remove.
   */
  removeVote = async (voteId: string, messageId: string) => {
    const vote = Object.values(this.data.ownVotesByOptionId).find(
      (ownVote) => ownVote.id === voteId,
    );

    if (!vote?.option_id) {
      return await this.optimisticVotes.send(() =>
        this.client.removePollVote(messageId, this.id as string, voteId),
      );
    }

    return await this.optimisticVotes.remove(
      (resolvedVoteId) =>
        this.client.removePollVote(messageId, this.id as string, resolvedVoteId),
      { vote },
    );
  };

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

export function mapPollStateToResponse(
  poll: Poll,
  state: PollState = poll.data,
): PollResponse {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    lastActivityAt,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    maxVotedOptionIds,
    ownVotesByOptionId,
    ownAnswer,
    ...restState
  } = state;
  const ownVotes = [
    ...Object.values(ownVotesByOptionId),
    ...(ownAnswer ? [ownAnswer] : []),
  ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  return {
    ...restState,
    own_votes: ownVotes,
    id: poll.id,
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
