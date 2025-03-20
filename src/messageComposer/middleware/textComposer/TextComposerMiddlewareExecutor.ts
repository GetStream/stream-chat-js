import { MiddlewareExecutor } from '../../../middleware';
import { withCancellation } from '../../../utils/concurrency';
import type { TextComposerMiddlewareValue } from './types';
import type { TextComposerState, TextComposerSuggestion } from '../../types';

export class TextComposerMiddlewareExecutor extends MiddlewareExecutor<
  TextComposerState,
  TextComposerMiddlewareValue
> {
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
