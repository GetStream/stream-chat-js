import type { Channel } from '../../../channel';
import type { Middleware } from '../../../middleware';
import type { SearchSourceOptions } from '../../../search';
import { BaseSearchSourceSync } from '../../../search';
import type { CommandResponse } from '../../../types';
import { mergeWith } from '../../../utils/mergeWith';
import type { MessageComposer } from '../../messageComposer';
import type {
  CommandSuggestion,
  CommandSuggestionDisabledReason,
  TextComposerCommandActivationEffect,
  TextComposerMiddlewareOptions,
  TextComposerStateSnapshot,
} from './types';
import {
  getCompleteCommandInString,
  getTriggerCharWithToken,
  insertItemWithTrigger,
} from './textMiddlewareUtils';
import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';

const getCommandDisabledReason = (
  command: CommandResponse,
  composer?: MessageComposer,
): CommandSuggestionDisabledReason | undefined => {
  if (!composer) return undefined;

  if (composer.editedMessage) return 'editing';

  if (
    composer.quotedMessage &&
    (command.set === 'moderation_set' || command.name === 'moderation_set')
  ) {
    return 'quoted_message';
  }

  return undefined;
};

const emptyCommandStateSnapshot: TextComposerStateSnapshot = {
  mentionedUsers: [],
  selection: { start: 0, end: 0 },
  text: '',
};

const createCommandActivationEffect = (
  command: CommandResponse,
): TextComposerCommandActivationEffect => ({
  behavior: 'snapshot-and-clear',
  command,
  stateToRestore: emptyCommandStateSnapshot,
  type: 'command.activate',
});

export class CommandSearchSource extends BaseSearchSourceSync<CommandSuggestion> {
  readonly type = 'commands';
  protected channel: Channel;
  protected composer?: MessageComposer;

  constructor(
    channel: Channel,
    options?: SearchSourceOptions,
    composer?: MessageComposer,
  ) {
    super(options);
    this.channel = channel;
    this.composer = composer;
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
      items: selectedCommands.map((command) => {
        const disabledReason = getCommandDisabledReason(command, this.composer);

        return {
          ...command,
          disabled: !!disabledReason || undefined,
          disabledReason,
          id: command.name,
        };
      }),
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
    composer?: MessageComposer;
    searchSource?: CommandSearchSource;
  },
): CommandsMiddleware => {
  const finalOptions = mergeWith(DEFAULT_OPTIONS, options ?? {});
  let searchSource = new CommandSearchSource(channel, undefined, options?.composer);
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
          if (command && !command.disabled) {
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
        if (selectedSuggestion.disabled) return next(state);

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
          effects: [
            ...(state.effects ?? []),
            createCommandActivationEffect(selectedSuggestion),
          ],
          suggestions: undefined,
        });
      },
    },
  };
};
