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
  PollVoteData,
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

const isVoteAnswer = <SCG extends ExtendableGenerics = DefaultGenerics>(
  vote: PollVote<SCG> | PollAnswer<SCG>,
): vote is PollAnswer<SCG> => !!(vote as PollAnswer<SCG>)?.answer_text;


export type PollState<SCG extends ExtendableGenerics = DefaultGenerics> = PollResponse<SCG> & {
  lastActivityAt: Date; // todo: would be ideal to get this from the BE
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

    this.state = new StateStore<PollState<SCG>>({ ...poll, lastActivityAt: new Date() });
  }

  get data(): PollState<SCG> {
    return this.data;
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
      const { own_votes, latest_answers } = this.data;
      this.state.next({ ...event.poll, latest_answers, own_votes, lastActivityAt: new Date(event.created_at) });
    }).unsubscribe;
  }

  private subscribePollClosed() {
    return this.client.on('poll.closed', (event) => {
      if (!isPollClosedEventEvent(event)) return;
      const { own_votes, latest_answers } = this.data;
      this.state.next({ ...event.poll, latest_answers, own_votes, lastActivityAt: new Date(event.created_at) });
    }).unsubscribe;
  }

  private subscribeVoteCasted() {
    return this.client.on('poll.vote_casted', (event) => {
      if (!isPollVoteCastedEvent(event)) return;
      const currentState = this.data;
      const isOwnVote = event.poll_vote.user_id === this.client.userID;
      const ownVotes = [...(currentState?.own_votes || [])];
      let latestAnswers = [...currentState.latest_answers];

      if (isOwnVote) {
        ownVotes.push(event.poll_vote);
      }

      if (isVoteAnswer(event.poll_vote)) {
        latestAnswers = [event.poll_vote, ...latestAnswers];
      }

      this.state.next({
        ...event.poll,
        latest_answers: latestAnswers,
        own_votes: ownVotes,
        lastActivityAt: new Date(event.created_at),
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

      if (isOwnVote) {
        if (isVoteAnswer(event.poll_vote)) {
          latestAnswers = [
            event.poll_vote,
            ...latestAnswers.filter((answer) => answer.user_id === event.poll_vote.user_id),
          ];
          ownVotes = ownVotes.filter((vote) => isVoteAnswer(vote));
        } else if (event.poll.enforce_unique_vote) {
          ownVotes = ownVotes.filter((vote) => !isVoteAnswer(vote));
        }
        ownVotes.push(event.poll_vote);
      } else if (isVoteAnswer(event.poll_vote)) {
        latestAnswers = [event.poll_vote, ...latestAnswers];
      }

      this.state.next({
        ...event.poll,
        latest_answers: latestAnswers,
        own_votes: ownVotes,
        lastActivityAt: new Date(event.created_at),
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

      if (isOwnVote) {
        ownVotes = ownVotes.filter((vote) => vote.id !== event.poll_vote.id);
      }
      if (isVoteAnswer(event.poll_vote)) {
        latestAnswers = latestAnswers.filter((answer) => answer.id !== event.poll_vote.id);
      }

      this.state.next({
        ...event.poll,
        latest_answers: latestAnswers,
        own_votes: ownVotes,
        lastActivityAt: new Date(event.created_at),
      });
    }).unsubscribe;
  }

  async query(id: string) {
    const { poll } = await this.client.getPoll(id);
    this.state.next({ ...poll, lastActivityAt: new Date() });
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

  async castVote(vote: PollVoteData, messageId: string) {
    return await this.client.castPollVote(messageId, this.data.id, vote);
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
}
