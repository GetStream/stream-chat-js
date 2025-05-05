import { createCommandsMiddleware } from './commands';
import { createMentionsMiddleware } from './mentions';
import { createTextComposerPreValidationMiddleware } from './validation';
import type { ExecuteParams, MiddlewareExecutionResult } from '../../../middleware';
import { MiddlewareExecutor } from '../../../middleware';
import { withCancellation } from '../../../utils/concurrency';
import type {
  Suggestion,
  TextComposerMiddlewareExecutorOptions,
  TextComposerState,
  TextSelection,
} from './types';

export type TextComposerMiddlewareExecutorState<T extends Suggestion = Suggestion> =
  TextComposerState<T> & {
    change: {
      selectedSuggestion?: T;
      selection?: TextSelection;
      text?: string;
    };
  };

export class TextComposerMiddlewareExecutor<
  T extends Suggestion = Suggestion,
> extends MiddlewareExecutor<TextComposerMiddlewareExecutorState<T>> {
  constructor({ composer }: TextComposerMiddlewareExecutorOptions) {
    super();
    this.use([
      createTextComposerPreValidationMiddleware(composer),
      createMentionsMiddleware(composer.channel),
      createCommandsMiddleware(composer.channel),
    ]);
  }

  async execute({
    eventName,
    initialValue: initialState,
  }: ExecuteParams<TextComposerMiddlewareExecutorState<T>>): Promise<
    MiddlewareExecutionResult<TextComposerMiddlewareExecutorState<T>>
  > {
    const result = await this.executeMiddlewareChain({
      eventName,
      initialValue: initialState,
    });

    if (result && result.state.suggestions) {
      try {
        const searchResult = await withCancellation(
          'textComposer-suggestions-search',
          async () => {
            await result.state.suggestions?.searchSource.search(
              result.state.suggestions?.query,
            );
          },
        );
        if (searchResult === 'canceled') return { ...result, status: 'discard' };
      } catch (error) {
        // Clear suggestions on search error
        return {
          ...result,
          state: {
            ...result.state,
            suggestions: undefined,
          },
        };
      }
    }

    return result;
  }
}
