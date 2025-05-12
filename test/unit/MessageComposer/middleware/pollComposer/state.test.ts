import { describe, expect, it, vi } from 'vitest';
import {
  MiddlewareStatus,
  PollComposerOption,
  PollComposerState,
  PollComposerStateChangeMiddlewareValue,
} from '../../../../../src';
import {
  createPollComposerStateMiddleware,
  PollComposerStateMiddlewareFactoryOptions,
} from '../../../../../src/messageComposer/middleware/pollComposer/state';
import { VotingVisibility } from '../../../../../src/types';

const setupHandlerParams = (initialState: PollComposerStateChangeMiddlewareValue) => {
  return {
    state: initialState,
    next: async (state: PollComposerStateChangeMiddlewareValue) => ({ state }),
    complete: async (state: PollComposerStateChangeMiddlewareValue) => ({
      state,
      status: 'complete' as MiddlewareStatus,
    }),
    discard: async () => ({ state: initialState, status: 'discard' as MiddlewareStatus }),
    forward: async () => ({ state: initialState }),
  };
};

// Mock dependencies
vi.mock('../../../../../src/utils', () => ({
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
}));

const getInitialState = (): PollComposerState => ({
  data: {
    allow_answers: false,
    allow_user_suggested_options: false,
    description: '',
    enforce_unique_vote: true,
    id: 'test-id',
    max_votes_allowed: '',
    name: '',
    options: [{ id: 'option-id', text: '' }],
    user_id: 'user-id',
    voting_visibility: VotingVisibility.public,
  },
  errors: {},
});

const setup = (options?: PollComposerStateMiddlewareFactoryOptions) => {
  return createPollComposerStateMiddleware(options);
};

describe('PollComposerStateMiddleware', () => {
  describe('handleFieldChange', () => {
    it('should update name field', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: { name: 'Test Poll' },
        }),
      );

      expect(result.state.nextState.data.name).toBe('Test Poll');
      expect(result.status).toBeUndefined;
    });

    it('should validate max_votes_allowed field with invalid value', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: { max_votes_allowed: '1' }, // Invalid value (less than 2)
        }),
      );

      expect(result.state.nextState.errors.max_votes_allowed).toBeDefined();
      expect(result.state.nextState.data.max_votes_allowed).toBe('1');
      expect(result.status).toBeUndefined;
    });

    it('should not validate max_votes_allowed field with valid value if enforce_unique_vote is true', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: {
            ...getInitialState(),
            data: { ...getInitialState().data, enforce_unique_vote: true },
          },
          previousState: {
            ...getInitialState(),
            data: { ...getInitialState().data, enforce_unique_vote: true },
          },
          targetFields: { max_votes_allowed: '5' }, // Valid value (between 2 and 10)
        }),
      );

      expect(result.state.nextState.errors.max_votes_allowed).toBe(
        'Enforce unique vote is enabled',
      );
      expect(result.state.nextState.data.max_votes_allowed).toBe('5');
      expect(result.status).toBeUndefined;
    });

    it('should validate max_votes_allowed field with valid value if enforce_unique_vote is false', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: {
            ...getInitialState(),
            data: { ...getInitialState().data, enforce_unique_vote: false },
          },
          previousState: {
            ...getInitialState(),
            data: { ...getInitialState().data, enforce_unique_vote: false },
          },
          targetFields: { max_votes_allowed: '5' }, // Valid value (between 2 and 10)
        }),
      );

      expect(result.state.nextState.errors.max_votes_allowed).toBeUndefined();
      expect(result.state.nextState.data.max_votes_allowed).toBe('5');
      expect(result.status).toBeUndefined;
    });

    it('should handle options field changes with single option update', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: {
            options: [
              {
                id: 'option-id',
                text: 'Option 1',
              },
            ],
          },
        }),
      );

      expect(result.state.nextState.data.options[0].text).toBe('Option 1');
      expect(result.state.nextState.data.options.length).toBe(1);
      expect(result.status).toBeUndefined;
    });

    it('should handle options field changes with array update', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: {
            options: [
              { id: 'option-1', text: 'Option 1' },
              { id: 'option-2', text: 'Option 2' },
            ],
          },
        }),
      );

      expect(result.state.nextState.data.options.length).toBe(2);
      expect(result.state.nextState.data.options[0].text).toBe('Option 1');
      expect(result.state.nextState.data.options[1].text).toBe('Option 2');
      expect(result.status).toBeUndefined;
    });

    it('should handle enforce_unique_vote field changes', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: { enforce_unique_vote: false },
        }),
      );

      expect(result.state.nextState.data.enforce_unique_vote).toBe(false);
      expect(result.state.nextState.data.max_votes_allowed).toBe('');
      expect(result.status).toBeUndefined;
    });

    it('should add a new empty option when the all the options are filled', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: {
            ...getInitialState(),
          },
          targetFields: {
            options: {
              index: 0,
              text: 'Option 1',
            },
          },
        }),
      );

      expect(result.state.nextState.data.options.length).toBe(2);
      expect(result.state.nextState.data.options[0].text).toBe('Option 1');
      expect(result.state.nextState.data.options[1].text).toEqual('');

      expect(result.status).toBeUndefined;
    });

    it('should reorder options and add a new empty option when the all the options are filled', async () => {
      const stateMiddleware = setup();

      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: {
            ...getInitialState(),
            data: {
              ...getInitialState().data,
              options: [
                {
                  id: 'option-2',
                  text: '',
                },
                {
                  id: 'option-1',
                  text: 'Option 1',
                },
              ],
            },
          },
          previousState: {
            ...getInitialState(),
            data: {
              ...getInitialState().data,
              options: [
                {
                  id: 'option-2',
                  text: '',
                },
                {
                  id: 'option-1',
                  text: 'Option 1',
                },
              ],
            },
          },
          targetFields: {
            options: {
              index: 0,
              text: 'Option 2',
            },
          },
        }),
      );

      expect(result.state.nextState.data.options.length).toBe(3);
      expect(result.state.nextState.data.options[0].text).toBe('Option 2');
      expect(result.state.nextState.data.options[1].text).toBe('Option 1');
      expect(result.state.nextState.data.options[2].text).toEqual('');
      expect(result.status).toBeUndefined;
    });

    it('should remove an option when it is empty and there are more options after it', async () => {
      const stateMiddleware = setup();
      // Set up initial state with two options
      const initialState = getInitialState();
      initialState.data.options = [
        { id: 'option-1', text: 'Option 1' },
        { id: 'option-2', text: '' },
      ];

      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: {
            options: {
              index: 0,
              text: '',
            },
          },
        }),
      );

      expect(result.state.nextState.data.options.length).toBe(1);
      expect(result.state.nextState.data.options[0].text).toBe('');
      expect(result.status).toBeUndefined;
    });

    it('should use custom target field data processors ', async () => {
      const injectedOptions: PollComposerOption[] = [{ id: 'x', text: 'y' }];
      const stateMiddleware = setup({
        processors: {
          handleFieldChange: { options: () => ({ options: injectedOptions }) },
        },
      });

      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: {
            options: {
              index: 0,
              text: 'X',
            },
          },
        }),
      );

      expect(result.state.nextState.data.options).toEqual(injectedOptions);
      expect(result.status).toBeUndefined;
    });
    it('should use custom target field data validators', async () => {
      const stateMiddleware = setup({
        validators: {
          handleFieldChange: { options: () => ({ options: { x: 'failed option X' } }) },
        },
      });

      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: {
            options: {
              index: 0,
              text: 'X',
            },
          },
        }),
      );

      expect(result.state.nextState.errors.options).toEqual({ x: 'failed option X' });
      expect(result.status).toBeUndefined;
    });

    it('should override internally generated errors with injected errors', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldChange(
        setupHandlerParams({
          nextState: {
            ...getInitialState(),
            data: { ...getInitialState().data, enforce_unique_vote: false },
          },
          previousState: {
            ...getInitialState(),
            data: { ...getInitialState().data, enforce_unique_vote: false },
          },
          targetFields: { max_votes_allowed: '5' }, // Valid value (between 2 and 10)
          injectedFieldErrors: {
            max_votes_allowed: 'Injected error message',
          },
        }),
      );

      expect(result.state.nextState.errors.max_votes_allowed).toBe(
        'Injected error message',
      );
      expect(result.state.nextState.data.max_votes_allowed).toBe('5');
      expect(result.status).toBeUndefined;
    });
  });

  describe('handleFieldBlur', () => {
    it('should validate name field on blur', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldBlur(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: { name: '' },
        }),
      );

      expect(result.state.nextState.errors.name).toBeDefined();
      expect(result.status).toBeUndefined;
    });

    it('should validate max_votes_allowed field on blur', async () => {
      const stateMiddleware = setup();
      const result = await stateMiddleware.handlers.handleFieldBlur(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: { max_votes_allowed: '1' },
        }),
      );

      expect(result.state.nextState.errors.max_votes_allowed).toBeDefined();
      expect(result.status).toBeUndefined;
    });

    describe('options validation', () => {
      it('should validate empty options on blur', async () => {
        const stateMiddleware = setup();
        const result = await stateMiddleware.handlers.handleFieldBlur(
          setupHandlerParams({
            nextState: { ...getInitialState() },
            previousState: { ...getInitialState() },
            targetFields: { options: [{ id: 'option-id', text: '' }] },
          }),
        );

        expect(result.state.nextState.errors.options).toBeUndefined();
      });

      it('should validate duplicate options on blur', async () => {
        const stateMiddleware = setup();
        const result = await stateMiddleware.handlers.handleFieldBlur(
          setupHandlerParams({
            nextState: { ...getInitialState() },
            previousState: { ...getInitialState() },
            targetFields: {
              options: [
                { id: 'option-1', text: 'Same Text' },
                { id: 'option-2', text: 'Same Text' },
              ],
            },
          }),
        );

        expect(result.state.nextState.errors.options).toEqual({
          'option-2': 'Option already exists',
        });
      });

      it('should pass validation for valid options', async () => {
        const stateMiddleware = setup();
        const result = await stateMiddleware.handlers.handleFieldBlur(
          setupHandlerParams({
            nextState: { ...getInitialState() },
            previousState: { ...getInitialState() },
            targetFields: {
              options: [
                { id: 'option-1', text: 'Option 1' },
                { id: 'option-2', text: 'Option 2' },
              ],
            },
          }),
        );

        expect(result.state.nextState.errors.options).toBeUndefined();
      });
    });

    it('should use custom target field data processors', async () => {
      const injectedOptions: PollComposerOption[] = [{ id: 'x', text: 'y' }];
      const stateMiddleware = setup({
        processors: {
          handleFieldBlur: { options: () => ({ options: injectedOptions }) },
        },
      });

      const result = await stateMiddleware.handlers.handleFieldBlur(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: {
            options: {
              index: 0,
              text: 'X',
            },
          },
        }),
      );

      expect(result.state.nextState.data.options).toEqual(injectedOptions);
      expect(result.status).toBeUndefined;
    });
    it('should use custom target field data validators', async () => {
      const stateMiddleware = setup({
        validators: {
          handleFieldBlur: { options: () => ({ options: { x: 'failed option X' } }) },
        },
      });

      const result = await stateMiddleware.handlers.handleFieldBlur(
        setupHandlerParams({
          nextState: { ...getInitialState() },
          previousState: { ...getInitialState() },
          targetFields: {
            options: {
              index: 0,
              text: 'X',
            },
          },
        }),
      );

      expect(result.state.nextState.errors.options).toEqual({ x: 'failed option X' });
      expect(result.status).toBeUndefined;
    });
  });

  it('should override internally generated errors with injected errors', async () => {
    const stateMiddleware = setup();
    const result = await stateMiddleware.handlers.handleFieldBlur(
      setupHandlerParams({
        nextState: {
          ...getInitialState(),
          data: { ...getInitialState().data, enforce_unique_vote: false },
        },
        previousState: {
          ...getInitialState(),
          data: { ...getInitialState().data, enforce_unique_vote: false },
        },
        targetFields: { max_votes_allowed: '5' }, // Valid value (between 2 and 10)
        injectedFieldErrors: {
          max_votes_allowed: 'Injected error message',
        },
      }),
    );

    expect(result.state.nextState.errors.max_votes_allowed).toBe(
      'Injected error message',
    );
    expect(result.state.nextState.data.max_votes_allowed).toBe('5');
    expect(result.status).toBeUndefined;
  });
});
