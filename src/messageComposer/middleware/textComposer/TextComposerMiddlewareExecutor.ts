import { createCommandsMiddleware } from './commands';
import { createMentionsMiddleware } from './mentions';
import { createTextComposerPreValidationMiddleware } from './validation';
import type {
  ExecuteParams,
  MiddlewareExecutionResult,
  MiddlewareHandler,
} from '../../../middleware';
import { MiddlewareExecutor } from '../../../middleware';
import { withCancellation } from '../../../utils/concurrency';
import type {
  Suggestion,
  TextComposerMiddlewareExecutorOptions,
  TextComposerState,
} from './types';

export type TextComposerMiddlewareExecutorState<T extends Suggestion = Suggestion> =
  TextComposerState<T> & {
    change?: {
      selectedSuggestion?: T;
    };
  };

export type TextComposerHandlerNames = 'onChange' | 'onSuggestionItemSelect';

export type TextComposerMiddleware<T extends Suggestion = Suggestion> = {
  id: string;
  handlers: {
    [K in TextComposerHandlerNames]: MiddlewareHandler<
      TextComposerMiddlewareExecutorState<T>
    >;
  };
};

export class TextComposerMiddlewareExecutor<
  T extends Suggestion = Suggestion,
> extends MiddlewareExecutor<
  TextComposerMiddlewareExecutorState<T>,
  TextComposerHandlerNames
> {
  constructor({ composer }: TextComposerMiddlewareExecutorOptions) {
    super();
    this.use([
      createTextComposerPreValidationMiddleware(composer) as TextComposerMiddleware<T>,
      createMentionsMiddleware(composer.channel) as TextComposerMiddleware<T>,
      createCommandsMiddleware(composer.channel) as TextComposerMiddleware<T>,
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
