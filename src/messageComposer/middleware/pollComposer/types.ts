import type { MiddlewareExecutionResult } from '../../../middleware';
import type { CreatePollRequest, VotingVisibility } from '../../../types';
import type { PollValidationError } from './validation';

export type PollComposerOption = {
  id: string;
  text: string;
};

export type TargetedPollOptionTextUpdate = {
  index: number;
  text: string;
};

export type PollComposerOptionUpdate =
  | PollComposerOption[]
  | TargetedPollOptionTextUpdate;

export type UpdateFieldsData = Partial<Omit<PollComposerState['data'], 'options'>> & {
  options?: PollComposerOptionUpdate;
};

/**
 * Field validation errors, keyed by field. `options` errors are keyed by option id.
 *
 * Values carry a stable {@link PollValidationError.code} rather than being bare English, so a UI can
 * localize them; see {@link POLL_VALIDATION_CODE}.
 */
export type PollComposerFieldErrors = Partial<
  Omit<Record<keyof CreatePollRequest, PollValidationError>, 'options'> & {
    options?: Record<string, PollValidationError>;
  }
>;

export type PollComposerState = {
  data: {
    id: string;
    max_votes_allowed: string;
    name: string;
    options: PollComposerOption[];
    allow_answers?: boolean;
    allow_user_suggested_options?: boolean;
    description?: string;
    enforce_unique_vote?: boolean;
    is_closed?: boolean;
    voting_visibility?: VotingVisibility;
  };
  errors: PollComposerFieldErrors;
};

export type PollComposerCompositionMiddlewareValueState = {
  data: CreatePollRequest;
  errors: PollComposerFieldErrors;
};

export type PollComposerCompositionMiddlewareValue =
  MiddlewareExecutionResult<PollComposerCompositionMiddlewareValueState>;

export type PollComposerStateChangeMiddlewareValue = {
  nextState: PollComposerState;
  previousState: PollComposerState;
  targetFields: Partial<{
    [K in keyof PollComposerState['data']]: K extends 'options'
      ? PollComposerOptionUpdate
      : PollComposerState['data'][K];
  }>;
  injectedFieldErrors?: PollComposerFieldErrors;
};

export type PollComposerStateMiddlewareValue =
  MiddlewareExecutionResult<PollComposerStateChangeMiddlewareValue>;
