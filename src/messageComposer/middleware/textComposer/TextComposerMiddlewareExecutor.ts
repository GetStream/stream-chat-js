import { createCommandsMiddleware } from './commands';
import { createMentionsMiddleware } from './mentions';
import { createTextComposerPreValidationMiddleware } from './validation';
import { MiddlewareExecutor } from '../../../middleware';
import type {
  ExecuteParams,
  MiddlewareExecutionResult,
  MiddlewareHandler,
} from '../../../middleware';
import type {
  Suggestion,
  Suggestions,
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

    const { query, searchSource } = result.state.suggestions ?? ({} as Suggestions);
    /**
     * Catching error just for sanity purposes.
     * The BaseSearchSource.search() method returns debounced result.
     * That means the result of the previous search call as the debounced call result is unknown at the moment.
     * Custom search source implementation should handle errors meaningfully internally.
     */
    searchSource?.search(query)?.catch(console.error);

    return result;
  }
}
