import {
  PollComposerCompositionMiddlewareExecutor,
  PollComposerStateMiddlewareExecutor,
  VALID_MAX_VOTES_VALUE_REGEX,
} from './middleware/pollComposer';
import { StateStore } from '../store';
import { VotingVisibility } from '../types';
import { generateUUIDv4 } from '../utils';
import type { MessageComposer } from './messageComposer';
import type {
  PollComposerFieldErrors,
  PollComposerState,
  UpdateFieldsData,
} from './middleware/pollComposer';

export type PollComposerOptions = {
  composer: MessageComposer;
};

export class PollComposer {
  readonly state: StateStore<PollComposerState>;
  readonly composer: MessageComposer;
  readonly compositionMiddlewareExecutor: PollComposerCompositionMiddlewareExecutor;
  readonly stateMiddlewareExecutor: PollComposerStateMiddlewareExecutor;

  constructor({ composer }: PollComposerOptions) {
    this.composer = composer;
    this.state = new StateStore<PollComposerState>(this.initialState);
    this.compositionMiddlewareExecutor = new PollComposerCompositionMiddlewareExecutor({
      composer,
    });
    this.stateMiddlewareExecutor = new PollComposerStateMiddlewareExecutor();
  }

  get initialState(): PollComposerState {
    return {
      data: {
        allow_answers: false,
        allow_user_suggested_options: false,
        description: '',
        enforce_unique_vote: true,
        id: generateUUIDv4(),
        max_votes_allowed: '',
        name: '',
        options: [{ id: generateUUIDv4(), text: '' }],
        user_id: this.composer.client.user?.id,
        voting_visibility: VotingVisibility.public,
      },
      errors: {},
    };
  }

  get allow_answers() {
    return this.state.getLatestValue().data.allow_answers;
  }
  get allow_user_suggested_options() {
    return this.state.getLatestValue().data.allow_user_suggested_options;
  }
  get description() {
    return this.state.getLatestValue().data.description;
  }
  get enforce_unique_vote() {
    return this.state.getLatestValue().data.enforce_unique_vote;
  }
  get id() {
    return this.state.getLatestValue().data.id;
  }
  get max_votes_allowed() {
    return this.state.getLatestValue().data.max_votes_allowed;
  }
  get name() {
    return this.state.getLatestValue().data.name;
  }
  get options() {
    return this.state.getLatestValue().data.options;
  }
  get user_id() {
    return this.state.getLatestValue().data.user_id;
  }
  get voting_visibility() {
    return this.state.getLatestValue().data.voting_visibility;
  }

  get canCreatePoll() {
    const { data, errors } = this.state.getLatestValue();
    const hasAtLeastOneOption = data.options.filter((o) => !!o.text).length > 0;
    const hasName = !!data.name;
    const maxVotesAllowedNumber = parseInt(
      data.max_votes_allowed?.match(VALID_MAX_VOTES_VALUE_REGEX)?.[0] || '',
    );

    const validMaxVotesAllowed =
      data.max_votes_allowed === '' ||
      (!!maxVotesAllowedNumber &&
        (2 <= maxVotesAllowedNumber || maxVotesAllowedNumber <= 10));

    return (
      hasAtLeastOneOption &&
      hasName &&
      validMaxVotesAllowed &&
      Object.values(errors).filter((errorText) => !!errorText).length === 0
    );
  }

  initState = () => {
    this.state.next(this.initialState);
  };

  /**
   * Updates specified fields and generates relevant errors
   * @param data
   * @param injectedFieldErrors - errors produced externally that will take precedence over the errors generated in the middleware chaing
   */
  // FIXME: change method params to a single object with the next major release
  updateFields = async (
    data: UpdateFieldsData,
    injectedFieldErrors?: PollComposerFieldErrors,
  ) => {
    const { state, status } = await this.stateMiddlewareExecutor.execute({
      eventName: 'handleFieldChange',
      initialValue: {
        nextState: { ...this.state.getLatestValue() },
        previousState: { ...this.state.getLatestValue() },
        targetFields: data,
        injectedFieldErrors,
      },
    });

    if (status === 'discard') return;
    this.state.next(state.nextState);
  };

  handleFieldBlur = async (field: keyof PollComposerState['data']) => {
    const result = await this.stateMiddlewareExecutor.execute({
      eventName: 'handleFieldBlur',
      initialValue: {
        nextState: { ...this.state.getLatestValue() },
        previousState: { ...this.state.getLatestValue() },
        targetFields: { [field]: this.state.getLatestValue().data[field] },
      },
    });

    if (result.status === 'discard') return;
    this.state.next(result.state.nextState);
  };

  compose = async () => {
    const { data, errors } = this.state.getLatestValue();
    const result = await this.compositionMiddlewareExecutor.execute({
      eventName: 'compose',
      initialValue: {
        data: {
          ...data,
          max_votes_allowed: data.max_votes_allowed
            ? parseInt(data.max_votes_allowed)
            : undefined,
          options: data.options?.filter((o) => o.text).map((o) => ({ text: o.text })),
        },
        errors,
      },
    });
    if (result.status === 'discard') return;

    return result.state;
  };
}
