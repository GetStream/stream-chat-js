import type { Channel } from '../../../channel';
import type { Middleware } from '../../../middleware';
import type { SearchSourceOptions } from '../../../search';
import { BaseSearchSourceSync } from '../../../search';
import type { Command } from '../../../types';
import { mergeWith } from '../../../utils/mergeWith';
import type { MessageComposer } from '../../messageComposer';
import type { CommandSuggestion, TextComposerMiddlewareOptions } from './types';
import {
  getCommandByName,
  getCompleteCommandInString,
  notifyCommandDisabled,
} from './commandUtils';
import { getTriggerCharWithToken, insertItemWithTrigger } from './textMiddlewareUtils';
import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';

export class CommandSearchSource extends BaseSearchSourceSync<CommandSuggestion> {
  readonly type = 'commands';
  protected channel: Channel;

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
      items, // kept to avoid flickering
    };
  }

  query(searchQuery: string) {
    const commands = this.channel.config.availableCommands;
    const selectedCommands: Command[] = commands.filter(
      (command): command is Command =>
        !!(
          command.name &&
          command.name.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1
        ),
    );

    if (searchQuery) {
      // Alphabetical, with prefix matches first.
      selectedCommands.sort((a, b) => {
        let nameA = a.name?.toLowerCase();
        let nameB = b.name?.toLowerCase();
        if (nameA?.indexOf(searchQuery) === 0) {
          nameA = `0${nameA}`;
        }
        if (nameB?.indexOf(searchQuery) === 0) {
          nameB = `0${nameB}`;
        }
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
    }

    return {
      items: selectedCommands.map((command) => ({
        ...command,
        id: command.name,
      })),
      next: null,
    };
  }

  protected filterQueryResults(items: CommandSuggestion[]) {
    return items;
  }
}

const DEFAULT_OPTIONS: TextComposerMiddlewareOptions = { minChars: 1, trigger: '/' };

export type CommandsMiddleware = Middleware<
  TextComposerMiddlewareExecutorState<CommandSuggestion>,
  'onChange' | 'onSuggestionItemSelect'
>;

/**
 * Suggests and activates slash commands.
 *
 * @param channel - The channel whose commands are suggested.
 * @param options - Middleware options. Defaults to `trigger: '/'` and `minChars: 1`.
 * @param options.composer - Used to refuse commands disabled by the editing or quoting state.
 * @param options.searchSource - A search source to use instead of a new one. Its state is reset.
 * @returns The commands middleware.
 */
export const createCommandsMiddleware = (
  channel: Channel,
  options?: Partial<TextComposerMiddlewareOptions> & {
    composer?: MessageComposer;
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
          const command = getCommandByName(searchSource, commandName);
          const composer = options?.composer;
          if (command && !composer?.isCommandDisabled(command)) {
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

        const composer = options?.composer;
        if (composer && notifyCommandDisabled(composer, selectedSuggestion)) {
          return forward();
        }

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
