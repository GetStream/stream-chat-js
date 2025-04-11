import { getTriggerCharWithToken, insertItemWithTrigger } from './textMiddlewareUtils';
import { BaseSearchSource } from '../../../search_controller';
import { mergeWith } from '../../../utils/mergeWith';
import type {
  TextComposerMiddlewareOptions,
  TextComposerMiddlewareParams,
} from './types';
import type { SearchSourceOptions } from '../../../search_controller';
import type { CommandResponse } from '../../../types';
import type { Channel } from '../../../channel';
import type { TextComposerSuggestion } from '../../types';

type CommandSuggestion = TextComposerSuggestion<CommandResponse>;
class CommandSearchSource extends BaseSearchSource<CommandSuggestion> {
  readonly type = 'commands';
  private channel: Channel;

  constructor(channel: Channel, options?: SearchSourceOptions) {
    super(options);
    this.channel = channel;
  }

  canExecuteQuery = (newSearchString?: string) => {
    const hasNewSearchQuery = typeof newSearchString !== 'undefined';
    return this.isActive && !this.isLoading && (this.hasNext || hasNewSearchQuery);
  };

  protected getStateBeforeFirstQuery(newSearchString: string) {
    const newState = super.getStateBeforeFirstQuery(newSearchString);
    const { items } = this.state.getLatestValue();
    return {
      ...newState,
      items, // preserve items to avoid flickering
    };
  }

  query(searchQuery: string) {
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
  const searchSource = new CommandSearchSource(channel);
  searchSource.activate();

  return {
    id: 'stream-io/commands-middleware',
    onChange: ({
      input,
      nextHandler,
    }: TextComposerMiddlewareParams<CommandSuggestion>) => {
      const { state } = input;
      if (!state.selection) return nextHandler(input);

      const firstCharIsNotCommandTrigger =
        state.text.length === 0 || state.text[0] !== finalOptions.trigger;
      if (firstCharIsNotCommandTrigger) return nextHandler(input);

      const triggerWithToken = getTriggerCharWithToken({
        trigger: finalOptions.trigger,
        text: state.text.slice(0, state.selection.end),
        acceptTrailingSpaces: false,
      });

      const newSearchTriggerred =
        triggerWithToken && triggerWithToken.length === finalOptions.minChars;

      if (newSearchTriggerred) {
        searchSource.resetStateAndActivate();
      }

      const triggerWasRemoved =
        !triggerWithToken || triggerWithToken.length < finalOptions.minChars;

      if (triggerWasRemoved) {
        const hasStaleSuggestions =
          input.state.suggestions?.trigger === finalOptions.trigger;
        const newInput = { ...input };
        if (hasStaleSuggestions) {
          delete newInput.state.suggestions;
        }
        return nextHandler(newInput);
      }

      return Promise.resolve({
        state: {
          ...state,
          suggestions: {
            query: triggerWithToken.slice(1),
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
    }: TextComposerMiddlewareParams<CommandSuggestion>) => {
      const { state } = input;
      if (!selectedSuggestion || state.suggestions?.trigger !== finalOptions.trigger)
        return nextHandler(input);

      searchSource.resetStateAndActivate();
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
