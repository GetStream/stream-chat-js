import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PollComposer } from '../../../src/messageComposer/pollComposer';
import { StateStore } from '../../../src/store';
import { VotingVisibility } from '../../../src/types';

// Mock dependencies
vi.mock('../../../src/utils', () => ({
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
}));

vi.mock('../../../src/messageComposer/middleware/pollComposer', () => ({
  PollComposerCompositionMiddlewareExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      state: {
        data: {
          allow_answers: false,
          allow_user_suggested_options: false,
          description: '',
          enforce_unique_vote: true,
          id: 'test-id',
          max_votes_allowed: 5,
          name: 'Test Poll',
          options: [{ text: 'Option 1' }, { text: 'Option 2' }],
          user_id: 'user-id',
          voting_visibility: VotingVisibility.public,
        },
        errors: {},
      },
      status: 'success',
    }),
  })),
  PollComposerStateMiddlewareExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      state: {
        nextState: {
          data: {
            allow_answers: false,
            allow_user_suggested_options: false,
            description: '',
            enforce_unique_vote: true,
            id: 'test-id',
            max_votes_allowed: '',
            name: 'Test Poll',
            options: [{ id: 'option-id', text: 'Option 1' }],
            user_id: 'user-id',
            voting_visibility: VotingVisibility.public,
          },
          errors: {},
        },
      },
      status: 'success',
    }),
  })),
  VALID_MAX_VOTES_VALUE_REGEX: /^([2-9]|10)$/,
}));

describe('PollComposer', () => {
  let mockComposer: any;
  let pollComposer: PollComposer;

  beforeEach(() => {
    mockComposer = {
      client: {
        user: {
          id: 'user-id',
        },
      },
    };

    pollComposer = new PollComposer({ composer: mockComposer });
  });

  describe('constructor', () => {
    it('should initialize with the correct state', () => {
      expect(pollComposer.composer).toBe(mockComposer);
      expect(pollComposer.state).toBeInstanceOf(StateStore);
    });
  });

  describe('initialState', () => {
    it('should return the initial state', () => {
      const initialState = pollComposer.initialState;

      expect(initialState.data.allow_answers).toBe(false);
      expect(initialState.data.allow_user_suggested_options).toBe(false);
      expect(initialState.data.description).toBe('');
      expect(initialState.data.enforce_unique_vote).toBe(true);
      expect(initialState.data.id).toBe('test-uuid');
      expect(initialState.data.max_votes_allowed).toBe('');
      expect(initialState.data.name).toBe('');
      expect(initialState.data.options).toEqual([{ id: 'test-uuid', text: '' }]);
      expect(initialState.data.user_id).toBe('user-id');
      expect(initialState.data.voting_visibility).toBe(VotingVisibility.public);
      expect(initialState.errors).toEqual({});
    });
  });

  describe('getters', () => {
    it('should return the correct values from state', () => {
      // Set up the state with specific values
      pollComposer.state.next({
        data: {
          allow_answers: true,
          allow_user_suggested_options: true,
          description: '',
          enforce_unique_vote: false,
          id: 'test-id',
          max_votes_allowed: '',
          name: '',
          options: [{ id: 'option-id', text: '' }],
          user_id: 'user-id',
          voting_visibility: VotingVisibility.anonymous,
        },
        errors: {},
      });

      expect(pollComposer.allow_answers).toBe(true);
      expect(pollComposer.allow_user_suggested_options).toBe(true);
      expect(pollComposer.description).toBe('');
      expect(pollComposer.enforce_unique_vote).toBe(false);
      expect(pollComposer.id).toBe('test-id');
      expect(pollComposer.max_votes_allowed).toBe('');
      expect(pollComposer.name).toBe('');
      expect(pollComposer.options).toEqual([{ id: 'option-id', text: '' }]);
      expect(pollComposer.user_id).toBe('user-id');
      expect(pollComposer.voting_visibility).toBe(VotingVisibility.anonymous);
    });
  });

  describe('canCreatePoll', () => {
    it('should return false when there are no options with text', () => {
      pollComposer.state.next({
        data: {
          options: [{ id: 'option-id', text: '' }],
          name: 'Test Poll',
          max_votes_allowed: '',
          id: 'test-id',
          user_id: 'user-id',
          voting_visibility: VotingVisibility.public,
        },
        errors: {},
      });

      expect(pollComposer.canCreatePoll).toBe(false);
    });

    it('should return false when there is no name', () => {
      pollComposer.state.next({
        data: {
          options: [{ id: 'option-id', text: 'Option 1' }],
          name: '',
          max_votes_allowed: '',
          id: 'test-id',
          user_id: 'user-id',
          voting_visibility: VotingVisibility.public,
        },
        errors: {},
      });

      expect(pollComposer.canCreatePoll).toBe(false);
    });

    it('should return false when max_votes_allowed is invalid', () => {
      pollComposer.state.next({
        data: {
          options: [{ id: 'option-id', text: 'Option 1' }],
          name: 'Test Poll',
          max_votes_allowed: '1', // Less than 2
          id: 'test-id',
          user_id: 'user-id',
          voting_visibility: VotingVisibility.public,
        },
        errors: {},
      });

      expect(pollComposer.canCreatePoll).toBe(false);
    });

    it('should return false when there are errors', () => {
      pollComposer.state.next({
        data: {
          options: [{ id: 'option-id', text: 'Option 1' }],
          name: 'Test Poll',
          max_votes_allowed: '',
          id: 'test-id',
          user_id: 'user-id',
          voting_visibility: VotingVisibility.public,
        },
        errors: { name: 'Name is required' },
      });

      expect(pollComposer.canCreatePoll).toBe(false);
    });

    it('should return true when all conditions are met', () => {
      pollComposer.state.next({
        data: {
          options: [{ id: 'option-id', text: 'Option 1' }],
          name: 'Test Poll',
          max_votes_allowed: '',
          id: 'test-id',
          user_id: 'user-id',
          voting_visibility: VotingVisibility.public,
        },
        errors: {},
      });

      expect(pollComposer.canCreatePoll).toBe(true);
    });
    it('should return true if all field errors are undefined', () => {
      pollComposer.state.next({
        data: {
          options: [{ id: 'option-id', text: 'Option 1' }],
          name: 'Test Poll',
          max_votes_allowed: '',
          id: 'test-id',
          user_id: 'user-id',
          voting_visibility: VotingVisibility.public,
        },
        errors: { name: undefined, options: undefined },
      });

      expect(pollComposer.canCreatePoll).toBe(true);
    });
  });

  describe('initState', () => {
    it('should reset the state to initial state', () => {
      // Set up a different state first
      pollComposer.state.next({
        data: {
          allow_answers: true,
          allow_user_suggested_options: true,
          description: 'Test Description',
          enforce_unique_vote: false,
          id: 'different-id',
          max_votes_allowed: '5',
          name: 'Different Name',
          options: [{ id: 'different-option-id', text: 'Different Option' }],
          user_id: 'different-user-id',
          voting_visibility: VotingVisibility.anonymous,
        },
        errors: { name: 'Error' },
      });

      // Reset to initial state
      pollComposer.initState();

      // Check that the state was reset
      const currentState = pollComposer.state.getLatestValue();
      expect(currentState.data.allow_answers).toBe(false);
      expect(currentState.data.allow_user_suggested_options).toBe(false);
      expect(currentState.data.description).toBe('');
      expect(currentState.data.enforce_unique_vote).toBe(true);
      expect(currentState.data.id).toBe('test-uuid');
      expect(currentState.data.max_votes_allowed).toBe('');
      expect(currentState.data.name).toBe('');
      expect(currentState.data.options).toEqual([{ id: 'test-uuid', text: '' }]);
      expect(currentState.data.user_id).toBe('user-id');
      expect(currentState.data.voting_visibility).toBe(VotingVisibility.public);
      expect(currentState.errors).toEqual({});
    });
  });

  describe('updateFields', () => {
    it('should update fields and call state middleware executor', async () => {
      const updateData = { name: 'Test Poll' };
      const spy = vi.spyOn(pollComposer.stateMiddlewareExecutor, 'execute');

      await pollComposer.updateFields(updateData);

      expect(spy).toHaveBeenCalledWith({
        eventName: 'handleFieldChange',
        initialValue: expect.any(Object),
      });
    });

    it('should not update state if middleware returns discard status', async () => {
      const updateData = { name: 'Test Poll' };
      const originalState = pollComposer.state.getLatestValue();

      // Mock the middleware to return discard status
      const middlewareExecutor = pollComposer.stateMiddlewareExecutor as unknown as {
        execute: ReturnType<typeof vi.fn>;
      };
      middlewareExecutor.execute.mockResolvedValueOnce({
        state: { nextState: {} },
        status: 'discard',
      });

      await pollComposer.updateFields(updateData);

      // Check that the state wasn't updated
      expect(pollComposer.state.getLatestValue()).toEqual(originalState);
    });
  });

  describe('handleFieldBlur', () => {
    it('should handle field blur and call state middleware executor', async () => {
      const spy = vi.spyOn(pollComposer.stateMiddlewareExecutor, 'execute');

      await pollComposer.handleFieldBlur('name');

      expect(spy).toHaveBeenCalledWith({
        eventName: 'handleFieldBlur',
        initialValue: expect.any(Object),
      });
    });

    it('should not update state if middleware returns discard status', async () => {
      const originalState = pollComposer.state.getLatestValue();

      // Mock the middleware to return discard status
      const middlewareExecutor = pollComposer.stateMiddlewareExecutor as unknown as {
        execute: ReturnType<typeof vi.fn>;
      };
      middlewareExecutor.execute.mockResolvedValueOnce({
        state: { nextState: {} },
        status: 'discard',
      });

      await pollComposer.handleFieldBlur('name');

      // Check that the state wasn't updated
      expect(pollComposer.state.getLatestValue()).toEqual(originalState);
    });
  });

  describe('compose', () => {
    it('should compose the poll and call composition middleware executor', async () => {
      const spy = vi.spyOn(pollComposer.compositionMiddlewareExecutor, 'execute');

      const result = await pollComposer.compose();

      expect(spy).toHaveBeenCalledWith({
        eventName: 'compose',
        initialValue: expect.any(Object),
      });
      expect(result).toBeDefined();
      if (result) {
        expect(result.data.name).toBe('Test Poll');
        expect(result.data.options).toEqual([{ text: 'Option 1' }, { text: 'Option 2' }]);
      }
    });

    it('should return undefined if middleware returns discard status', async () => {
      // Mock the middleware to return discard status
      const middlewareExecutor =
        pollComposer.compositionMiddlewareExecutor as unknown as {
          execute: ReturnType<typeof vi.fn>;
        };
      middlewareExecutor.execute.mockResolvedValueOnce({
        state: {},
        status: 'discard',
      });

      const result = await pollComposer.compose();

      expect(result).toBeUndefined();
    });
  });
});
