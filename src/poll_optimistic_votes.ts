import type { StateStore } from './store';
import type { PollState } from './poll';
import type { APIResponse, CastVoteAPIResponse, PollResponse, PollVote } from './types';

type OptionId = string;

// The vote fields of the poll state that optimistic updates change
type VoteState = Pick<
  PollState,
  'latest_votes_by_option' | 'ownVotesByOptionId' | 'vote_count' | 'vote_counts_by_option'
>;

type CastVoteResponse = APIResponse & CastVoteAPIResponse;

// An own vote change is the server vote of a cast, or the option of a removal
type OwnVoteChange = { optionId: OptionId; vote?: PollVote };

// How long to wait for missing WS events of own vote changes after the last request finished
const CATCH_UP_TIMEOUT_MS = 3000;

/**
 * Optimistic updates for the current user's votes on a poll. Vote changes are shown right away.
 * While any of them is not confirmed by its WS event, vote events are only stored, as the server
 * state they carry does not contain the pending changes yet. Once all are confirmed (a failed
 * request counts as confirmed), the server's vote state is shown, which also reverts failed changes.
 * A lost WS event is recovered from after CATCH_UP_TIMEOUT_MS (see applySucceededChanges).
 */
export class OptimisticPollVotes {
  // The server's vote state. WS events only carry the vote that changed, so own votes are kept here.
  private serverVoteState: VoteState;
  // Own vote changes not confirmed by a WS event yet
  private pendingCount = 0;
  // Own vote requests not finished yet
  private inFlightCount = 0;
  // Cast requests by local placeholder vote id, to remove a vote known only by its placeholder
  private castRequests = new Map<string, Promise<CastVoteResponse>>();
  // Own vote changes whose requests succeeded since the server's vote state was last shown
  private succeededChanges: OwnVoteChange[] = [];
  private catchUpTimeout?: ReturnType<typeof setTimeout>;

  constructor(private readonly state: StateStore<PollState>) {
    this.serverVoteState = pickVoteState(state.getLatestValue());
  }

  get serverOwnVotes() {
    return this.serverVoteState.ownVotesByOptionId;
  }

  withServerVotes = (pollState: PollState): PollState => ({
    ...pollState,
    ...this.serverVoteState,
  });

  // Casts `vote`, a local placeholder. `replacedVotes` are the own votes it replaces in unique polls.
  cast = (
    request: Promise<CastVoteResponse>,
    { replacedVotes, vote }: { replacedVotes: PollVote[]; vote: PollVote },
  ) => {
    this.castRequests.set(vote.id, request);
    this.state.partialNext(
      applyOwnVoteDelta(this.state.getLatestValue(), {
        add: [vote],
        remove: replacedVotes,
      }),
    );
    return this.track(
      () => request,
      (response) => ({
        optionId: vote.option_id as OptionId,
        vote: response.vote as PollVote,
      }),
    );
  };

  remove = <T>(
    sendRequest: (voteId: string) => Promise<T>,
    { vote }: { vote: PollVote },
  ) => {
    const castRequest = this.castRequests.get(vote.id);
    this.state.partialNext(
      applyOwnVoteDelta(this.state.getLatestValue(), { remove: [vote] }),
    );
    return this.track(
      async () => {
        // an unconfirmed cast's vote only has a placeholder id, so wait for the real one
        const voteId = castRequest
          ? await castRequest.then(
              (response) => response.vote.id,
              () => undefined,
            )
          : vote.id;
        // if the cast failed, the vote never existed and there is nothing to remove
        return voteId ? sendRequest(voteId) : undefined;
      },
      () => ({ optionId: vote.option_id as OptionId }),
    );
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
    this.castRequests.clear();
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
    this.inFlightCount += 1;
    clearTimeout(this.catchUpTimeout);

    let response: T | undefined;
    try {
      response = await sendRequest();
    } catch (error) {
      this.settleWithoutEvent();
      throw error;
    }
    if (response === undefined) {
      this.settleWithoutEvent();
      return;
    }

    this.inFlightCount -= 1;
    this.succeededChanges.push(toChange(response));
    this.scheduleCatchUp();
    return response;
  };

  // A failed or skipped request gets no WS event, so it counts as confirmed right away.
  private settleWithoutEvent = () => {
    this.inFlightCount -= 1;
    this.pendingCount = Math.max(this.pendingCount - 1, 0);
    if (this.pendingCount === 0) {
      this.state.partialNext(this.takeServerVoteState());
    } else {
      this.scheduleCatchUp();
    }
  };

  private takeServerVoteState = () => {
    clearTimeout(this.catchUpTimeout);
    // the server's own votes have no placeholders
    this.castRequests.clear();
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
   * A WS event of an own vote change got lost, so the server's own votes are stale. As no request
   * is in flight, applying the succeeded changes in order gives the server's own votes (changes
   * whose events did arrive end up the same). The next WS event brings the vote counts.
   */
  private applySucceededChanges = () => {
    if (this.pendingCount === 0 || this.inFlightCount > 0) return;
    const { enforce_unique_vote } = this.state.getLatestValue();
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
    this.castRequests.clear();
    this.succeededChanges = [];
    // also drops a failed vote that was still shown
    this.state.partialNext({ ownVotesByOptionId });
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
