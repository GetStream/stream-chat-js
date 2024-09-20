import type { StreamChat } from './client';
import type {
  DefaultGenerics,
  ExtendableGenerics,
  PollData, PollSort, QueryPollsFilters, QueryPollsOptions,
} from './types';
import { Poll } from './poll';

export class PollManager<SCG extends ExtendableGenerics = DefaultGenerics> {
  private client: StreamChat<SCG>;

  constructor({ client }: { client: StreamChat<SCG> }) {
    this.client = client;
  }

  public createPoll = async (poll: PollData) => {
    const { poll: createdPoll} = await this.client.createPoll(poll);

    return new Poll({ client: this.client, poll: createdPoll });
  };

  public getPoll = async (id: string) => {
    const { poll } = await this.client.getPoll(id);

    return new Poll({ client: this.client, poll });
  }

  public queryPolls = async (filter: QueryPollsFilters, sort: PollSort = [],  options: QueryPollsOptions = {})=> {
    const { polls, next} = await this.client.queryPolls(filter, sort, options);

    return {
      polls: polls.map(poll => new Poll({ client: this.client, poll })),
      next,
    };
  }
}
