import { getTriggerCharWithToken, insertItemWithTrigger } from './middlewareUtils';
import { BaseSearchSource } from '../../search_controller';
import { mergeWith } from '../../utils/mergeWith';
import type { MiddlewareParams, TextComposerMiddlewareOptions } from './types';
import type { SearchSourceOptions } from '../../search_controller';
import type { CommandResponse } from '../../types';
import type { Channel } from '../../channel';
import type { TextComposerSuggestion } from '../types';

type CommandSuggestion = TextComposerSuggestion<CommandResponse>;
class CommandSearchSource extends BaseSearchSource<CommandSuggestion> {
  readonly type = 'commands';
  private channel: Channel;

  constructor(channel: Channel, options?: SearchSourceOptions) {
    super(options);
    this.channel = channel;
  }

  protected query(searchQuery: string) {
    const channelConfig = this.channel.getConfig();
    const commands = channelConfig?.commands || [];
    const selectedCommands: (CommandResponse & { name: string })[] = commands.filter(
      (command): command is CommandResponse & { name: string } =>
        !!(command.name && command.name.indexOf(searchQuery) !== -1),
    );

    // sort alphabetically unless you're matching the first char
    selectedCommands.sort((a, b) => {
      let nameA = a.name?.toLowerCase();
      let nameB = b.name?.toLowerCase();
      if (nameA?.indexOf(searchQuery) === 0) {
        nameA = `0${nameA}`;
      }
      if (nameB?.indexOf(searchQuery) === 0) {
        nameB = `0${nameB}`;
      }
      // Should confirm possible null / undefined when TS is fully implemented
      if (nameA != null && nameB != null) {
        if (nameA < nameB) {
          return -1;
        }
        if (nameA > nameB) {
          return 1;
        }
      }

      return 0;
    });
    return Promise.resolve({
      items: selectedCommands.map((c) => ({ ...c, id: c.name })),
      next: null,
    });
  }

  protected filterQueryResults(
    items: CommandSuggestion[],
  ): CommandSuggestion[] | Promise<CommandSuggestion[]> {
    return items;
  }
}

/**
 * TextComposer middleware for mentions
 * Usage:
 *
 *  const textComposer = new TextComposer(options);
 *
 *  textComposer.use(createCommandsMiddleware(channel, { trigger: '//', minChars: 2 } ));
 *
 * @param channel
 * @param {{ minChars: number; trigger: string }} options
 * @returns
 */

const DEFAULT_OPTIONS: TextComposerMiddlewareOptions = { minChars: 1, trigger: '/' };

export const createCommandsMiddleware = (
  channel: Channel,
  options?: TextComposerMiddlewareOptions,
) => {
  const finalOptions = mergeWith(DEFAULT_OPTIONS, options ?? {});
  return {
    id: finalOptions.trigger,
    onChange: ({ input, nextHandler }: MiddlewareParams<CommandSuggestion>) => {
      const { state } = input;
      if (!state.selection) return nextHandler(input);

      const lastToken = getTriggerCharWithToken(
        finalOptions.trigger,
        state.text.slice(0, state.selection.end),
      );

      if (!lastToken || lastToken.length < finalOptions.minChars) {
        // check whether suggestions already exist and if so remove them
        return nextHandler(input);
      }

      const searchSource = new CommandSearchSource(channel);
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
        stop: true, // Stop other middleware from processing '/' character
      });
    },
    onSuggestionItemSelect: ({
      input,
      nextHandler,
      selectedSuggestion,
    }: MiddlewareParams<CommandSuggestion>) => {
      const { state } = input;
      if (!selectedSuggestion || state.suggestions?.trigger !== finalOptions.trigger)
        return nextHandler(input);

      return Promise.resolve({
        state: {
          ...state,
          ...insertItemWithTrigger({
            insertText: `/${selectedSuggestion.name} `,
            selection: state.selection,
            text: state.text,
            trigger: finalOptions.trigger,
          }),
          suggestions: undefined, // Clear suggestions after selection
        },
      });
    },
  };
};
