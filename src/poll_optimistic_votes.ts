import type { StreamChat } from './client';
import type { Poll, PollState } from './poll';
import type { PollResponse, PollVote } from './types';
import { generateUUIDv4 } from './utils';
import { hasPending, withoutConcurrency } from './utils/concurrency';

type OptionId = string;

// The vote fields of the poll state that optimistic updates change
type VoteState = Pick<
  PollState,
  'latest_votes_by_option' | 'ownVotesByOptionId' | 'vote_count' | 'vote_counts_by_option'
>;

// An own vote change is the server vote of a cast, or the option of a removal
type OwnVoteChange = { optionId: OptionId; vote?: PollVote };

// How long to wait for missing WS events of own vote changes after the last request finished
const CATCH_UP_TIMEOUT_MS = 3000;

/**
 * Optimistic updates for the current user's votes on a poll. Vote changes are shown right away.
 * While any of them is not confirmed by its WS event, vote events are only stored, as the server
 * state they carry does not contain the pending changes yet. Once all are confirmed (a failed
 * request counts as confirmed), the server's vote state is shown, which also reverts failed changes.
 * Vote requests are sent one after another, so the server applies them in the order they were made.
 * A lost WS event is recovered from after CATCH_UP_TIMEOUT_MS (see applySucceededChanges).
 */
export class OptimisticPollVotes {
  // The server's vote state. WS events only carry the vote that changed, so own votes are kept here.
  private serverVoteState: VoteState;
  // Own vote changes not confirmed by a WS event yet
  private pendingCount = 0;
  // Own vote changes whose requests succeeded since the server's vote state was last shown
  private succeededChanges: OwnVoteChange[] = [];
  // Vote requests with this tag are sent one after another. A symbol, so it is unique per instance.
  private readonly requestTag = Symbol('poll-votes');
  private catchUpTimeout?: ReturnType<typeof setTimeout>;

  private readonly client: StreamChat;
  private readonly poll: Poll;

  constructor({ client, poll }: { client: StreamChat; poll: Poll }) {
    this.client = client;
    this.poll = poll;
    this.serverVoteState = pickVoteState(poll.data);
  }

  get serverOwnVotes() {
    return this.serverVoteState.ownVotesByOptionId;
  }

  withServerVotes = (pollState: PollState): PollState => ({
    ...pollState,
    ...this.serverVoteState,
  });

  /**
   * Casts a vote for an option, shown right away through a placeholder vote. In polls with unique
   * votes, it replaces the existing own votes.
   */
  castVote = (optionId: OptionId, messageId: string) => {
    const sendRequest = () =>
      this.client.castPollVote(messageId, this.poll.id, { option_id: optionId });
    const state = this.poll.data;
    // already voted for this option, there is nothing to show
    if (state.ownVotesByOptionId[optionId]) return this.send(sendRequest);

    const replacedVotes = state.enforce_unique_vote
      ? Object.values(state.ownVotesByOptionId)
      : [];
    this.poll.state.partialNext(
      applyOwnVoteDelta(state, {
        add: [this.createPlaceholderVote(optionId)],
        remove: replacedVotes,
      }),
    );
    return this.track(sendRequest, (response) => ({
      optionId,
      vote: response.vote as PollVote,
    }));
  };

  // Removes a vote, right away.
  removeVote = (voteId: string, messageId: string) => {
    const sendRequest = (id: string) =>
      this.client.removePollVote(messageId, this.poll.id, id);
    const state = this.poll.data;
    const vote = Object.values(state.ownVotesByOptionId).find(({ id }) => id === voteId);
    // not a shown own vote, there is nothing to show
    if (!vote?.option_id) return this.send(() => sendRequest(voteId));

    const optionId = vote.option_id;
    this.poll.state.partialNext(applyOwnVoteDelta(state, { remove: [vote] }));
    return this.track(
      // runs when the removal's turn comes, so a preceding cast of the vote has finished
      () => {
        const serverVoteId = this.getServerVoteId(vote);
        // the vote's cast failed, so there is nothing to remove
        return serverVoteId ? sendRequest(serverVoteId) : Promise.resolve(undefined);
      },
      () => ({ optionId }),
    );
  };

  // Sends a vote request once the previous one has finished, whether it succeeded or not.
  private send = async <T>(sendRequest: () => Promise<T>): Promise<T> => {
    try {
      return (await withoutConcurrency(this.requestTag, sendRequest)) as T;
    } finally {
      // once nothing is left to send, wait for the WS events of the pending changes
      if (!hasPending(this.requestTag)) this.scheduleCatchUp();
    }
  };

  // Stores the vote state of a WS vote event and returns the vote fields to show, if any.
  handleVoteEvent = (
    poll: PollResponse,
    {
      confirmsOwnVote,
      ownVotesByOptionId,
    }: { confirmsOwnVote: boolean; ownVotesByOptionId: Record<OptionId, PollVote> },
  ): Partial<PollState> => {
    this.serverVoteState = {
      latest_votes_by_option: poll.latest_votes_by_option,
      ownVotesByOptionId,
      vote_count: poll.vote_count,
      vote_counts_by_option: poll.vote_counts_by_option,
    };
    if (confirmsOwnVote) this.pendingCount = Math.max(this.pendingCount - 1, 0);
    return this.pendingCount > 0 ? {} : this.takeServerVoteState();
  };

  // Fresh server state (e.g. a refetch) replaces everything, pending changes are dropped.
  reset = (pollState: PollState) => {
    this.serverVoteState = pickVoteState(pollState);
    this.pendingCount = 0;
    this.succeededChanges = [];
    clearTimeout(this.catchUpTimeout);
  };

  // Tracks an own vote change until its request settles. `sendRequest` resolves to undefined
  // when no request was needed.
  private track = async <T>(
    sendRequest: () => Promise<T | undefined>,
    toChange: (response: T) => OwnVoteChange,
  ) => {
    this.pendingCount += 1;
    clearTimeout(this.catchUpTimeout);

    let response: T | undefined;
    try {
      response = await this.send(async () => {
        const result = await sendRequest();
        // recorded before the next request is sent, as a removal looks up the vote id in here
        if (result !== undefined) this.succeededChanges.push(toChange(result));
        return result;
      });
    } catch (error) {
      this.settleWithoutEvent();
      throw error;
    }
    if (response === undefined) this.settleWithoutEvent();
    return response;
  };

  // A failed or skipped request gets no WS event, so it counts as confirmed right away.
  private settleWithoutEvent = () => {
    this.pendingCount = Math.max(this.pendingCount - 1, 0);
    if (this.pendingCount === 0) this.poll.state.partialNext(this.takeServerVoteState());
  };

  // The vote shown for a cast until the server's vote arrives
  private createPlaceholderVote = (optionId: OptionId): PollVote => {
    const now = new Date().toISOString();
    return {
      created_at: now,
      id: `local-${generateUUIDv4()}`,
      option_id: optionId,
      poll_id: this.poll.id,
      updated_at: now,
      user: this.client.user,
      user_id: this.client.userID,
    };
  };

  /**
   * The server id of a vote to remove, once everything sent before the removal has finished. Casts
   * and removals of an option alternate, so the option's last succeeded change tells: a cast is the
   * vote being removed (e.g. a placeholder), a removal means the cast in between failed. Without
   * one, the server's own vote of the option is the vote being removed.
   */
  private getServerVoteId = (vote: PollVote) => {
    for (let i = this.succeededChanges.length - 1; i >= 0; i--) {
      const change = this.succeededChanges[i];
      if (change.optionId === vote.option_id) return change.vote?.id;
    }
    return this.serverVoteState.ownVotesByOptionId[vote.option_id as OptionId]?.id;
  };

  private takeServerVoteState = () => {
    clearTimeout(this.catchUpTimeout);
    this.succeededChanges = [];
    return {
      ...this.serverVoteState,
      maxVotedOptionIds: getMaxVotedOptionIds(this.serverVoteState.vote_counts_by_option),
    };
  };

  private scheduleCatchUp = () => {
    clearTimeout(this.catchUpTimeout);
    if (this.pendingCount === 0) return;
    this.catchUpTimeout = setTimeout(this.applySucceededChanges, CATCH_UP_TIMEOUT_MS);
  };

  /**
   * A WS event of an own vote change got lost, so the server's own votes are stale. All requests
   * have finished (the timeout starts once nothing is left to send and a new request cancels it),
   * so applying the succeeded changes in order gives the server's own votes (changes whose events
   * did arrive end up the same). They are shown with the vote counts of the last WS event, which
   * contain the other users' votes too.
   */
  private applySucceededChanges = () => {
    const { enforce_unique_vote } = this.poll.data;
    let ownVotesByOptionId = { ...this.serverVoteState.ownVotesByOptionId };
    for (const { optionId, vote } of this.succeededChanges) {
      if (!vote) {
        delete ownVotesByOptionId[optionId];
      } else if (enforce_unique_vote) {
        ownVotesByOptionId = { [optionId]: vote };
      } else {
        ownVotesByOptionId[optionId] = vote;
      }
    }

    this.serverVoteState = { ...this.serverVoteState, ownVotesByOptionId };
    this.pendingCount = 0;
    // also drops a failed vote that was still shown
    this.poll.state.partialNext(this.takeServerVoteState());
  };
}

function pickVoteState(state: PollState): VoteState {
  return {
    latest_votes_by_option: state.latest_votes_by_option,
    ownVotesByOptionId: state.ownVotesByOptionId,
    vote_count: state.vote_count,
    vote_counts_by_option: state.vote_counts_by_option,
  };
}

/**
 * Adds and removes the current user's votes: own votes, vote counts, latest votes and the
 * max-voted options. Returns new objects so that state selectors pick up the change.
 */
function applyOwnVoteDelta(
  state: PollState,
  { add = [], remove = [] }: { add?: PollVote[]; remove?: PollVote[] },
): VoteState & Pick<PollState, 'maxVotedOptionIds'> {
  const ownVotesByOptionId = { ...state.ownVotesByOptionId };
  const voteCountsByOption = { ...state.vote_counts_by_option };
  // null for anonymous polls, in which case there is nothing to update
  const latestVotesByOption = state.latest_votes_by_option
    ? { ...state.latest_votes_by_option }
    : state.latest_votes_by_option;
  let voteCount = state.vote_count ?? 0;

  for (const vote of remove) {
    const optionId = vote.option_id;
    if (!optionId) continue;
    delete ownVotesByOptionId[optionId];
    // the server omits options without votes, so a count that drops to 0 is removed
    const optionVoteCount = (voteCountsByOption[optionId] ?? 0) - 1;
    if (optionVoteCount > 0) {
      voteCountsByOption[optionId] = optionVoteCount;
    } else {
      delete voteCountsByOption[optionId];
    }
    voteCount = Math.max(voteCount - 1, 0);
    if (latestVotesByOption?.[optionId]) {
      latestVotesByOption[optionId] = latestVotesByOption[optionId].filter(
        (latestVote) => latestVote.id !== vote.id,
      );
    }
  }

  for (const vote of add) {
    const optionId = vote.option_id;
    if (!optionId) continue;
    ownVotesByOptionId[optionId] = vote;
    voteCountsByOption[optionId] = (voteCountsByOption[optionId] ?? 0) + 1;
    voteCount += 1;
    if (latestVotesByOption && state.voting_visibility !== 'anonymous') {
      latestVotesByOption[optionId] = [vote, ...(latestVotesByOption[optionId] ?? [])];
    }
  }

  return {
    latest_votes_by_option: latestVotesByOption,
    maxVotedOptionIds: getMaxVotedOptionIds(voteCountsByOption),
    ownVotesByOptionId,
    vote_count: voteCount,
    vote_counts_by_option: voteCountsByOption,
  };
}

export function getMaxVotedOptionIds(
  voteCountsByOption: PollResponse['vote_counts_by_option'],
) {
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
