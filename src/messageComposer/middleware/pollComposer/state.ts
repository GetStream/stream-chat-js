import type {
  PollComposerFieldErrors,
  PollComposerState,
  PollComposerStateMiddlewareValueState,
} from './types';
import { generateUUIDv4 } from '../../../utils';
import type { Middleware } from '../../../middleware';

export const VALID_MAX_VOTES_VALUE_REGEX = /^([2-9]|10)$/;

export const MAX_POLL_OPTIONS = 100 as const;

type ValidationOutput = Partial<
  Omit<Record<keyof PollComposerState['data'], string>, 'options'> & {
    options?: Record<string, string>;
  }
>;

type Validator = (params: {
  data: PollComposerState['data'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  currentError?: PollComposerFieldErrors[keyof PollComposerFieldErrors];
}) => ValidationOutput;

const validators: Partial<Record<keyof PollComposerState['data'], Validator>> = {
  enforce_unique_vote: () => ({ max_votes_allowed: undefined }),
  max_votes_allowed: ({ data, value }) => {
    if (data.enforce_unique_vote && value)
      return { max_votes_allowed: 'Enforce unique vote is enabled' };
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

const changeValidators: Partial<Record<keyof PollComposerState['data'], Validator>> = {
  name: ({ currentError, value }) =>
    value && currentError
      ? { name: undefined }
      : { name: typeof currentError === 'string' ? currentError : undefined },
};

const blurValidators: Partial<Record<keyof PollComposerState['data'], Validator>> = {
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

type ProcessorOutput = Partial<PollComposerState['data']>;

type Processor = (params: {
  data: PollComposerState['data'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}) => ProcessorOutput;

const processors: Partial<Record<keyof PollComposerState['data'], Processor>> = {
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

export const createPollComposerStateMiddleware =
  (): Middleware<PollComposerStateMiddlewareValueState> => ({
    id: 'stream-io/poll-composer-state-processing',
    handleFieldChange: ({ input, nextHandler }) => {
      if (!input.state.targetFields) return nextHandler(input);
      const {
        state: { previousState, targetFields },
      } = input;
      const finalValidators = { ...validators, ...changeValidators };

      const newData = Object.entries(targetFields).reduce(
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

      const newErrors = Object.keys(targetFields).reduce((acc, key) => {
        const validator = finalValidators[key as keyof PollComposerState['data']];
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

      return nextHandler({
        ...input,
        state: {
          ...input.state,
          nextState: {
            ...previousState,
            data: { ...previousState.data, ...newData },
            errors: { ...previousState.errors, ...newErrors },
          },
        },
      });
    },
    handleFieldBlur: ({ input, nextHandler }) => {
      const {
        state: { previousState, targetFields },
      } = input;
      const finalValidators = { ...validators, ...blurValidators };
      const newErrors = Object.entries(targetFields).reduce((acc, [key, value]) => {
        const validator = finalValidators[key as keyof PollComposerState['data']];
        if (validator) {
          const error = validator({
            data: previousState.data,
            value,
            currentError: previousState.errors[key as keyof PollComposerState['data']],
          });
          acc = { ...acc, ...error };
        }
        return acc;
      }, {} as PollComposerFieldErrors);

      return nextHandler({
        ...input,
        state: {
          ...input.state,
          nextState: {
            ...previousState,
            errors: { ...previousState.errors, ...newErrors },
          },
        },
      });
    },
  });
