import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPollComposerStateMiddleware } from '../../../../../src/messageComposer/middleware/pollComposer/state';
import { VotingVisibility } from '../../../../../src/types';
import { generateUUIDv4 } from '../../../../../src/utils';

// Mock dependencies
vi.mock('../../../../../src/utils', () => ({
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
}));

describe('PollComposerStateMiddleware', () => {
  let stateMiddleware: ReturnType<typeof createPollComposerStateMiddleware>;
  let initialState: any;

  beforeEach(() => {
    stateMiddleware = createPollComposerStateMiddleware();
    initialState = {
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
    };
  });

  describe('handleFieldChange', () => {
    it('should update name field', async () => {
      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: { name: 'Test Poll' },
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.data.name).toBe('Test Poll');
      expect(result.status).toBeUndefined;
    });

    it('should validate max_votes_allowed field with invalid value', async () => {
      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: { max_votes_allowed: '1' }, // Invalid value (less than 2)
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.errors.max_votes_allowed).toBeDefined();
      expect(result.state.nextState.data.max_votes_allowed).toBe('1');
      expect(result.status).toBeUndefined;
    });

    it('should not validate max_votes_allowed field with valid value if enforce_unique_vote is true', async () => {
      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: {
              ...initialState,
              data: { ...initialState.data, enforce_unique_vote: true },
            },
            previousState: {
              ...initialState,
              data: { ...initialState.data, enforce_unique_vote: true },
            },
            targetFields: { max_votes_allowed: '5' }, // Valid value (between 2 and 10)
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.errors.max_votes_allowed).toBeDefined();
      expect(result.state.nextState.data.max_votes_allowed).toBe('5');
      expect(result.status).toBeUndefined;
    });

    it('should validate max_votes_allowed field with valid value if enforce_unique_vote is false', async () => {
      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: {
              ...initialState,
              data: { ...initialState.data, enforce_unique_vote: false },
            },
            previousState: {
              ...initialState,
              data: { ...initialState.data, enforce_unique_vote: false },
            },
            targetFields: { max_votes_allowed: '5' }, // Valid value (between 2 and 10)
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.errors.max_votes_allowed).toBeUndefined();
      expect(result.state.nextState.data.max_votes_allowed).toBe('5');
      expect(result.status).toBeUndefined;
    });

    it('should handle options field changes with single option update', async () => {
      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: {
              options: [
                {
                  index: 0,
                  text: 'Option 1',
                },
              ],
            },
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.data.options[0].text).toBe('Option 1');
      expect(result.state.nextState.data.options.length).toBe(1);
      expect(result.status).toBeUndefined;
    });

    it('should handle options field changes with array update', async () => {
      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: {
              options: [
                { id: 'option-1', text: 'Option 1' },
                { id: 'option-2', text: 'Option 2' },
              ],
            },
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.data.options.length).toBe(2);
      expect(result.state.nextState.data.options[0].text).toBe('Option 1');
      expect(result.state.nextState.data.options[1].text).toBe('Option 2');
      expect(result.status).toBeUndefined;
    });

    it('should handle enforce_unique_vote field changes', async () => {
      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: { enforce_unique_vote: false },
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.data.enforce_unique_vote).toBe(false);
      expect(result.state.nextState.data.max_votes_allowed).toBe('');
      expect(result.status).toBeUndefined;
    });

    it('should add a new empty option when the last option is filled', async () => {
      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: {
              options: {
                index: 0,
                text: 'Option 1',
              },
            },
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.data.options.length).toBe(2);
      expect(result.state.nextState.data.options[0].text).toBe('Option 1');
      expect(result.state.nextState.data.options[1].text).toBe('');
      expect(result.status).toBeUndefined;
    });

    it('should remove an option when it is empty and there are more options after it', async () => {
      // Set up initial state with two options
      initialState.data.options = [
        { id: 'option-1', text: 'Option 1' },
        { id: 'option-2', text: '' },
      ];

      const result = await stateMiddleware.handleFieldChange({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: {
              options: {
                index: 0,
                text: '',
              },
            },
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.data.options.length).toBe(1);
      expect(result.state.nextState.data.options[0].text).toBe('');
      expect(result.status).toBeUndefined;
    });
  });

  describe('handleFieldBlur', () => {
    it('should validate name field on blur', async () => {
      const result = await stateMiddleware.handleFieldBlur({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: { name: '' },
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.errors.name).toBeDefined();
      expect(result.status).toBeUndefined;
    });

    it('should validate max_votes_allowed field on blur', async () => {
      const result = await stateMiddleware.handleFieldBlur({
        input: {
          state: {
            nextState: { ...initialState },
            previousState: { ...initialState },
            targetFields: { max_votes_allowed: '1' },
          },
        },
        nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
      });

      expect(result.state.nextState.errors.max_votes_allowed).toBeDefined();
      expect(result.status).toBeUndefined;
    });

    describe('options validation', () => {
      it('should validate empty options on blur', async () => {
        const result = await stateMiddleware.handleFieldBlur({
          input: {
            state: {
              nextState: { ...initialState },
              previousState: { ...initialState },
              targetFields: { options: [{ id: 'option-id', text: '' }] },
            },
          },
          nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
        });

        expect(result.state.nextState.errors.options).toBeUndefined();
      });

      it('should validate duplicate options on blur', async () => {
        const result = await stateMiddleware.handleFieldBlur({
          input: {
            state: {
              nextState: { ...initialState },
              previousState: { ...initialState },
              targetFields: {
                options: [
                  { id: 'option-1', text: 'Same Text' },
                  { id: 'option-2', text: 'Same Text' },
                ],
              },
            },
          },
          nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
        });

        expect(result.state.nextState.errors.options).toEqual({
          'option-2': 'Option already exists',
        });
      });

      it('should pass validation for valid options', async () => {
        const result = await stateMiddleware.handleFieldBlur({
          input: {
            state: {
              nextState: { ...initialState },
              previousState: { ...initialState },
              targetFields: {
                options: [
                  { id: 'option-1', text: 'Option 1' },
                  { id: 'option-2', text: 'Option 2' },
                ],
              },
            },
          },
          nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
        });

        expect(result.state.nextState.errors.options).toBeUndefined();
      });
    });
  });
});
