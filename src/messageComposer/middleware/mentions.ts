import {getTriggerCharWithToken, insertItemWithTrigger} from './middlewareUtils';
import {UserSearchSource} from '../../search_controller';
import {mergeWith} from '../../utils/mergeWith';
import type {MiddlewareParams, TextComposerMiddlewareOptions,} from './types';
import type {StreamChat} from '../../client';
import type {DefaultGenerics, ExtendableGenerics, UserResponse} from '../../types';

const DEFAULT_OPTIONS: TextComposerMiddlewareOptions = { minChars: 1, trigger: '@' };

/**
 * TextComposer middleware for mentions
 * Usage:
 *
 *  const textComposer = new TextComposer(options);
 *
 *  textComposer.use(createMentionsMiddleware(client, {
 *   trigger: '$',
 *   minChars: 2
 *  }));
 *
 * @param {StreamChat} client
 * @param {{
 *     minChars: number;
 *     trigger: string;
 *   }} options
 * @returns
 */

export const createMentionsMiddleware = <SCG extends ExtendableGenerics = DefaultGenerics>(client: StreamChat<SCG>, options?:TextComposerMiddlewareOptions) => {
  const finalOptions = mergeWith(DEFAULT_OPTIONS, options ?? {});
  return {
    id: finalOptions.trigger,
    onChange: ({input, nextHandler}: MiddlewareParams<SCG, UserResponse<SCG>>) => {
      const { state } = input;
      if (!state.selection) return nextHandler(input);

      const lastToken = getTriggerCharWithToken(finalOptions.trigger, state.text.slice(0, state.selection.end));

      if (!lastToken || lastToken.length < finalOptions.minChars) {
        // todo: check whether suggestions already exist and if so remove them
        return nextHandler(input);
      }

      const searchSource = new UserSearchSource(client);
      searchSource.activate();

      return Promise.resolve({
        state: {
          ...state,
          suggestions: {
            query: lastToken.slice(1),
            searchSource,
            trigger: finalOptions.trigger,
          },
        },
        stop: true, // Stop other middleware from processing '@' character
      });
    },
    onSuggestionItemSelect: ({input, nextHandler, selectedSuggestion}: MiddlewareParams<SCG, UserResponse<SCG>>) => {
      const { state } = input;
      if (!selectedSuggestion || state.suggestions?.trigger !== finalOptions.trigger) return nextHandler(input);

      return Promise.resolve({
        state: {
          ...state,
          ...insertItemWithTrigger({
            insertText: `@${selectedSuggestion.name || selectedSuggestion.id} `,
            selection: state.selection,
            text: state.text,
            trigger: finalOptions.trigger,
          }),
          mentionedUsers: state.mentionedUsers.concat(selectedSuggestion),
          suggestions: undefined, // Clear suggestions after selection
        },
      });
    }
  };
};
