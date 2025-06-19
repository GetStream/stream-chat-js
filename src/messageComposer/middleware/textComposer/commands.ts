import type { Channel } from '../../../channel';
import type { Middleware } from '../../../middleware';
import type { SearchSourceOptions } from '../../../search';
import { BaseSearchSourceSync } from '../../../search';
import type { CommandResponse } from '../../../types';
import { mergeWith } from '../../../utils/mergeWith';
import type { CommandSuggestion, TextComposerMiddlewareOptions } from './types';
import {
  getCompleteCommandInString,
  getTriggerCharWithToken,
  insertItemWithTrigger,
} from './textMiddlewareUtils';
import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';

export class CommandSearchSource extends BaseSearchSourceSync<CommandSuggestion> {
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

  getStateBeforeFirstQuery(newSearchString: string) {
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
        !!(
          command.name &&
          command.name.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1
        ),
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

    return {
      items: selectedCommands.map((c) => ({ ...c, id: c.name })),
      next: null,
    };
  }

  protected filterQueryResults(items: CommandSuggestion[]) {
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

export type CommandsMiddleware = Middleware<
  TextComposerMiddlewareExecutorState<CommandSuggestion>,
  'onChange' | 'onSuggestionItemSelect'
>;

export const createCommandsMiddleware = (
  channel: Channel,
  options?: Partial<TextComposerMiddlewareOptions> & {
    searchSource?: CommandSearchSource;
  },
): CommandsMiddleware => {
  const finalOptions = mergeWith(DEFAULT_OPTIONS, options ?? {});
  let searchSource = new CommandSearchSource(channel);
  if (options?.searchSource) {
    searchSource = options.searchSource;
    searchSource.resetState();
  }
  searchSource.activate();

  return {
    id: 'stream-io/text-composer/commands-middleware',
    handlers: {
      onChange: ({ state, next, complete, forward }) => {
        if (!state.selection) return forward();
        const finalText = state.text.slice(0, state.selection.end);
        const commandName = getCompleteCommandInString(finalText);
        if (commandName) {
          const command = searchSource?.query(commandName).items[0];
          if (command) {
            return next({
              ...state,
              command,
              suggestions: undefined,
            });
          }
        }

        const triggerWithToken = getTriggerCharWithToken({
          trigger: finalOptions.trigger,
          text: finalText,
          acceptTrailingSpaces: false,
          isCommand: true,
        });

        const newSearchTriggerred =
          triggerWithToken && triggerWithToken.length === finalOptions.minChars;

        if (newSearchTriggerred) {
          searchSource.resetStateAndActivate();
        }

        const triggerWasRemoved =
          !triggerWithToken || triggerWithToken.length < finalOptions.minChars;

        if (triggerWasRemoved) {
          const hasStaleSuggestions = state.suggestions?.trigger === finalOptions.trigger;
          const newState = { ...state };
          if (hasStaleSuggestions) {
            delete newState.suggestions;
          }
          return next(newState);
        }

        return complete({
          ...state,
          command: null,
          suggestions: {
            query: triggerWithToken.slice(1),
            searchSource,
            trigger: finalOptions.trigger,
          },
        });
      },
      onSuggestionItemSelect: ({ state, next, forward }) => {
        const { selectedSuggestion } = state.change ?? {};
        if (!selectedSuggestion || state.suggestions?.trigger !== finalOptions.trigger)
          return forward();

        searchSource.resetStateAndActivate();
        return next({
          ...state,
          ...insertItemWithTrigger({
            insertText: `/${selectedSuggestion.name} `,
            selection: state.selection,
            text: state.text,
            trigger: finalOptions.trigger,
          }),
          command: selectedSuggestion,
          suggestions: undefined,
        });
      },
    },
  };
};
