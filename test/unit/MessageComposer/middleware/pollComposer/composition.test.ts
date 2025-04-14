import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPollComposerValidationMiddleware } from '../../../../../src/messageComposer/middleware/pollComposer/composition';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import { PollComposer } from '../../../../../src/messageComposer/pollComposer';
import { VotingVisibility } from '../../../../../src/types';
import type { Middleware } from '../../../../../src/middleware';
import type { PollComposerCompositionMiddlewareValueState } from '../../../../../src/messageComposer/middleware/pollComposer/types';
import type { MiddlewareHandler } from '../../../../../src/middleware';

describe('PollComposerCompositionMiddleware', () => {
  let messageComposer: MessageComposer;
  let pollComposer: PollComposer;
  let validationMiddleware: Middleware<PollComposerCompositionMiddlewareValueState>;

  beforeEach(() => {
    messageComposer = {
      client: {
        user: { id: 'user-id' },
      },
    } as any;

    pollComposer = new PollComposer({ composer: messageComposer });
    messageComposer.pollComposer = pollComposer;
    validationMiddleware = createPollComposerValidationMiddleware(messageComposer);
  });

  it('should initialize with the correct id', () => {
    expect(validationMiddleware.id).toBe('pollComposerComposition');
  });

  it('should allow composition when poll can be created', async () => {
    // Set up a valid poll state
    pollComposer.state.next({
      data: {
        options: [{ id: 'option-id', text: 'Option 1' }],
        name: 'Test Poll',
        max_votes_allowed: '',
        id: 'test-id',
        user_id: 'user-id',
        voting_visibility: VotingVisibility.public,
        allow_answers: false,
        allow_user_suggested_options: false,
        description: '',
        enforce_unique_vote: true,
      },
      errors: {},
    });

    // Mock the canCreatePoll getter
    vi.spyOn(pollComposer, 'canCreatePoll', 'get').mockReturnValue(true);

    const result = await (
      validationMiddleware.compose as MiddlewareHandler<PollComposerCompositionMiddlewareValueState>
    )({
      input: {
        state: {
          data: {
            ...pollComposer.state.getLatestValue().data,
            max_votes_allowed: undefined,
            options: [{ text: 'Option 1' }],
          },
          errors: {},
        },
      },
      nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
    });

    expect(result.status).toBeUndefined;
  });

  it('should discard composition when poll cannot be created', async () => {
    // Set up an invalid poll state (no name)
    pollComposer.state.next({
      data: {
        options: [{ id: 'option-id', text: 'Option 1' }],
        name: '',
        max_votes_allowed: '',
        id: 'test-id',
        user_id: 'user-id',
        voting_visibility: VotingVisibility.public,
        allow_answers: false,
        allow_user_suggested_options: false,
        description: '',
        enforce_unique_vote: true,
      },
      errors: {},
    });

    // Mock the canCreatePoll getter
    vi.spyOn(pollComposer, 'canCreatePoll', 'get').mockReturnValue(false);

    const result = await (
      validationMiddleware.compose as MiddlewareHandler<PollComposerCompositionMiddlewareValueState>
    )({
      input: {
        state: {
          data: {
            ...pollComposer.state.getLatestValue().data,
            max_votes_allowed: undefined,
            options: [{ text: 'Option 1' }],
          },
          errors: {},
        },
      },
      nextHandler: vi.fn().mockImplementation((input) => Promise.resolve(input)),
    });

    expect(result.status).toBe('discard');
  });
});
