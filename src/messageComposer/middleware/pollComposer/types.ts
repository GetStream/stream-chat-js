import type { MiddlewareValue } from '../../../middleware';
import type { CreatePollData, VotingVisibility } from '../../../types';

export type PollComposerOption = {
  id: string;
  text: string;
};

export type PollComposerOptionUpdate =
  | PollComposerOption[]
  | {
      index: number;
      text: string;
    };

export type UpdateFieldsData = Partial<Omit<PollComposerState['data'], 'options'>> & {
  options?: PollComposerOptionUpdate;
};

type Id = string;

export type PollComposerFieldErrors = Partial<
  Omit<Record<keyof CreatePollData, string>, 'options'> & {
    options?: Record<string, string>;
  }
>;

export type PollComposerState = {
  data: {
    id: Id;
    max_votes_allowed: string;
    name: string;
    options: PollComposerOption[];
    allow_answers?: boolean;
    allow_user_suggested_options?: boolean;
    description?: string;
    enforce_unique_vote?: boolean;
    is_closed?: boolean;
    user_id?: string;
    voting_visibility?: VotingVisibility;
  };
  errors: PollComposerFieldErrors;
};

export type PollComposerCompositionMiddlewareValueState = {
  data: CreatePollData;
  errors: PollComposerFieldErrors;
};

export type PollComposerCompositionMiddlewareValue =
  MiddlewareValue<PollComposerCompositionMiddlewareValueState>;

export type PollComposerStateMiddlewareValueState = {
  nextState: PollComposerState;
  previousState: PollComposerState;
  targetFields: Partial<{
    [K in keyof PollComposerState['data']]: K extends 'options'
      ? PollComposerOptionUpdate
      : PollComposerState['data'][K];
  }>;
};

export type PollComposerStateMiddlewareValue =
  MiddlewareValue<PollComposerStateMiddlewareValueState>;
