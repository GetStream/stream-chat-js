import { Middleware } from '../../../middleware';
import { withCancellation } from '../../../utils/concurrency';
import type { TextComposerMiddlewareValue } from './types';
import type { TextComposerState, TextComposerSuggestion } from '../../types';

export class TextComposerMiddlewareManager extends Middleware<
  TextComposerState,
  TextComposerMiddlewareValue
> {
  async execute(
    eventName: string,
    initialInput: TextComposerMiddlewareValue,
    selectedSuggestion?: TextComposerSuggestion,
  ): Promise<TextComposerMiddlewareValue | 'canceled'> {
    const result = await this.executeMiddlewareChain(eventName, initialInput, {
      selectedSuggestion,
    });

    if (result !== 'canceled' && result.state.suggestions) {
      const searchResult = await withCancellation(
        'textComposer-suggestions-search',
        async () => {
          await result.state.suggestions?.searchSource.search(
            result.state.suggestions?.query,
          );
        },
      );
      if (searchResult === 'canceled') return 'canceled';
    }

    return result;
  }
}
