import type { Middleware, MiddlewareHandlerParams } from '../../../middleware';
import { generateUUIDv4 } from '../../../utils';
import type {
  PollComposerFieldErrors,
  PollComposerState,
  PollComposerStateChangeMiddlewareValue,
  TargetedPollOptionTextUpdate,
} from './types';

export const VALID_MAX_VOTES_VALUE_REGEX = /^([2-9]|10)$/;

export const MAX_POLL_OPTIONS = 100 as const;

export type PollStateValidationOutput = Partial<
  Omit<Record<keyof PollComposerState['data'], string>, 'options'> & {
    options?: Record<string, string>;
  }
>;

export type PollStateChangeValidator = (params: {
  data: PollComposerState['data'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  currentError?: PollComposerFieldErrors[keyof PollComposerFieldErrors];
}) => PollStateValidationOutput;

export const pollStateChangeValidators: Partial<
  Record<keyof PollComposerState['data'], PollStateChangeValidator>
> = {
  enforce_unique_vote: () => ({ max_votes_allowed: undefined }),
  max_votes_allowed: ({ data, value }) => {
    if (data.enforce_unique_vote && value)
      return { max_votes_allowed: 'Enforce unique vote is enabled' };
    const numericMatch = value.match(/^[0-9]+$/);
    if (!numericMatch && value) {
      return { max_votes_allowed: 'Only numbers are allowed' };
    }
    if (value?.length > 1 && !value.match(VALID_MAX_VOTES_VALUE_REGEX))
      return { max_votes_allowed: 'Type a number from 2 to 10' };
    return { max_votes_allowed: undefined };
  },
  options: ({ value }) => {
    const errors: Record<string, string> = {};
    const seenOptions = new Set<string>();

    value.forEach((option: { id: string; text: string }) => {
      const trimmedText = option.text.trim();
      if (seenOptions.has(trimmedText)) {
        errors[option.id] = 'Option already exists';
      } else {
        seenOptions.add(trimmedText);
      }
    });

    return Object.keys(errors).length > 0 ? { options: errors } : { options: undefined };
  },
};

export const defaultPollFieldChangeEventValidators: Partial<
  Record<keyof PollComposerState['data'], PollStateChangeValidator>
> = {
  name: ({ currentError, value }) =>
    value && currentError
      ? { name: undefined }
      : { name: typeof currentError === 'string' ? currentError : undefined },
};

export const defaultPollFieldBlurEventValidators: Partial<
  Record<keyof PollComposerState['data'], PollStateChangeValidator>
> = {
  max_votes_allowed: ({ value }) => {
    if (value && !value.match(VALID_MAX_VOTES_VALUE_REGEX))
      return { max_votes_allowed: 'Type a number from 2 to 10' };
    return { max_votes_allowed: undefined };
  },
  name: ({ value }) => {
    if (!value) return { name: 'Name is required' };
    return { name: undefined };
  },
};

export type PollCompositionStateProcessorOutput = Partial<PollComposerState['data']>;

export type PollCompositionStateProcessor = (params: {
  data: PollComposerState['data'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}) => PollCompositionStateProcessorOutput;

export const isTargetedOptionTextUpdate = (
  value: unknown,
): value is TargetedPollOptionTextUpdate =>
  !Array.isArray(value) &&
  typeof (value as TargetedPollOptionTextUpdate)?.index === 'number' &&
  typeof (value as TargetedPollOptionTextUpdate)?.text === 'string';

export const pollCompositionStateProcessors: Partial<
  Record<keyof PollComposerState['data'], PollCompositionStateProcessor>
> = {
  enforce_unique_vote: ({ value }) => ({
    enforce_unique_vote: value,
    max_votes_allowed: '',
  }),
  options: ({ value, data }) => {
    // If it's a direct array update (like drag-drop reordering)
    if (Array.isArray(value)) {
      return {
        options: value.map((option) => ({
          id: option.id,
          text: option.text.trim(),
        })),
      };
    }

    // For single option updates
    const { index, text } = value;
    const prevOptions = data.options || [];

    const shouldAddEmptyOption =
      prevOptions.length < MAX_POLL_OPTIONS &&
      (!prevOptions || (prevOptions.slice(index + 1).length === 0 && !!text));

    const shouldRemoveOption =
      prevOptions && prevOptions.slice(index + 1).length > 0 && !text;

    const optionListHead = prevOptions.slice(0, index);
    const optionListTail = shouldAddEmptyOption
      ? [{ id: generateUUIDv4(), text: '' }]
      : prevOptions.slice(index + 1);

    const newOptions = [
      ...optionListHead,
      ...(shouldRemoveOption ? [] : [{ ...prevOptions[index], text }]),
      ...optionListTail,
    ];

    return { options: newOptions };
  },
};

export type PollComposerStateMiddlewareFactoryOptions = {
  processors?: {
    handleFieldChange?: Partial<
      Record<keyof PollComposerState['data'], PollCompositionStateProcessor>
    >;
    handleFieldBlur?: Partial<
      Record<keyof PollComposerState['data'], PollCompositionStateProcessor>
    >;
  };
  validators?: {
    handleFieldChange?: Partial<
      Record<keyof PollComposerState['data'], PollStateChangeValidator>
    >;
    handleFieldBlur?: Partial<
      Record<keyof PollComposerState['data'], PollStateChangeValidator>
    >;
  };
};

export type PollComposerStateMiddleware = Middleware<
  PollComposerStateChangeMiddlewareValue,
  'handleFieldChange' | 'handleFieldBlur'
>;

export const createPollComposerStateMiddleware = ({
  processors: customProcessors,
  validators: customValidators,
}: PollComposerStateMiddlewareFactoryOptions = {}): PollComposerStateMiddleware => {
  const universalHandler = (
    state: PollComposerStateChangeMiddlewareValue,
    validators: Partial<
      Record<keyof PollComposerState['data'], PollStateChangeValidator>
    >,
    processors?: Partial<
      Record<keyof PollComposerState['data'], PollCompositionStateProcessor>
    >,
  ) => {
    const { previousState, targetFields } = state;

    let newData: Partial<PollComposerState['data']>;
    if (!processors && isTargetedOptionTextUpdate(targetFields.options)) {
      const options = [...previousState.data.options];
      const targetOption = previousState.data.options[targetFields.options.index];
      if (targetOption) {
        targetOption.text = targetFields.options.text;
        options.splice(targetFields.options.index, 1, targetOption);
      }
      newData = { ...targetFields, options };
    } else if (!processors) {
      newData = targetFields as PollComposerState['data'];
    } else {
      newData = Object.entries(targetFields).reduce(
        (acc, [key, value]) => {
          const processor = processors[key as keyof PollComposerState['data']];
          acc = {
            ...acc,
            ...(processor
              ? processor({ data: previousState.data, value })
              : { [key]: value }),
          };
          return acc;
        },
        {} as PollComposerState['data'],
      );
    }

    const newErrors = Object.keys(targetFields).reduce((acc, key) => {
      const validator = validators[key as keyof PollComposerState['data']];
      if (validator) {
        const error = validator({
          data: previousState.data,
          value: newData[key as keyof PollComposerState['data']],
          currentError: previousState.errors[key as keyof PollComposerState['data']],
        });
        acc = { ...acc, ...error };
      }
      return acc;
    }, {} as PollComposerFieldErrors);

    return { newData, newErrors };
  };

  return {
    id: 'stream-io/poll-composer-state-processing',
    handlers: {
      handleFieldChange: ({
        state,
        next,
        forward,
      }: MiddlewareHandlerParams<PollComposerStateChangeMiddlewareValue>) => {
        if (!state.targetFields) return forward();
        const { previousState, injectedFieldErrors } = state;
        const finalValidators = {
          ...pollStateChangeValidators,
          ...defaultPollFieldChangeEventValidators,
          ...customValidators?.handleFieldChange,
        };
        const finalProcessors = {
          ...pollCompositionStateProcessors,
          ...customProcessors?.handleFieldChange,
        };

        const { newData, newErrors } = universalHandler(
          state,
          finalValidators,
          finalProcessors,
        );

        return next({
          ...state,
          nextState: {
            ...previousState,
            data: { ...previousState.data, ...newData },
            errors: { ...previousState.errors, ...newErrors, ...injectedFieldErrors },
          },
        });
      },
      handleFieldBlur: ({
        state,
        next,
        forward,
      }: MiddlewareHandlerParams<PollComposerStateChangeMiddlewareValue>) => {
        if (!state.targetFields) return forward();

        const { previousState } = state;
        const finalValidators = {
          ...pollStateChangeValidators,
          ...defaultPollFieldBlurEventValidators,
          ...customValidators?.handleFieldBlur,
        };
        const { newData, newErrors } = universalHandler(
          state,
          finalValidators,
          customProcessors?.handleFieldBlur,
        );

        return next({
          ...state,
          nextState: {
            ...previousState,
            data: { ...previousState.data, ...newData },
            errors: {
              ...previousState.errors,
              ...newErrors,
              ...state.injectedFieldErrors,
            },
          },
        });
      },
    },
  };
};
