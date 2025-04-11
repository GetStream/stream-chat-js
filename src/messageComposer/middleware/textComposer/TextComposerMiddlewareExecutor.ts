import { createCommandsMiddleware } from './commands';
import { createMentionsMiddleware } from './mentions';
import { MiddlewareExecutor } from '../../../middleware';
import { withCancellation } from '../../../utils/concurrency';
import type {
  TextComposerMiddlewareExecutorOptions,
  TextComposerMiddlewareValue,
} from './types';
import type { TextComposerState, TextComposerSuggestion } from '../../types';

export class TextComposerMiddlewareExecutor extends MiddlewareExecutor<TextComposerState> {
  constructor({ composer }: TextComposerMiddlewareExecutorOptions) {
    super();
    this.use([
      createMentionsMiddleware(composer.channel),
      createCommandsMiddleware(composer.channel),
    ]);
  }
  async execute(
    eventName: string,
    initialInput: TextComposerMiddlewareValue,
    selectedSuggestion?: TextComposerSuggestion,
  ): Promise<TextComposerMiddlewareValue> {
    const result = await this.executeMiddlewareChain(eventName, initialInput, {
      selectedSuggestion,
    });

    if (result && result.state.suggestions) {
      const searchResult = await withCancellation(
        'textComposer-suggestions-search',
        async () => {
          // sets the initial searchQuery value and performs the first page query
          await result.state.suggestions?.searchSource.search(
            result.state.suggestions?.query,
          );
        },
      );
      if (searchResult === 'canceled') return { ...result, status: 'discard' };
    }

    return result;
  }
}
