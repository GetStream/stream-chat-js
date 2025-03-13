import {StateStore} from '../store';
import {logChatPromiseExecution} from '../utils';
import type {TextComposerState, TextSelection} from './types';
import type {
  DefaultGenerics,
  DraftMessage,
  ExtendableGenerics,
  FormatMessageResponse,
  MessageResponseBase,
  UserResponse,
} from '../types';
import type {MessageComposer} from './messageComposer';
import type {TextComposerMiddleware, TextComposerMiddlewareValue,} from './middleware';
import {withCancellation} from '../utils/concurrency';
import {TextComposerSuggestion} from "./types";

export type TextComposerOptions<SCG extends ExtendableGenerics = DefaultGenerics> = {
  composer: MessageComposer<SCG>;
  message?: DraftMessage<SCG> | MessageResponseBase<SCG> | FormatMessageResponse<SCG>;
};

const initState = <SCG extends ExtendableGenerics = DefaultGenerics>(
  message?: DraftMessage<SCG> | MessageResponseBase<SCG> | FormatMessageResponse<SCG>,
): TextComposerState<SCG> => {
  if (!message) {
    return {
      mentionedUsers: [],
      text: '',
      selection: { start: 0, end: 0 },
    };
  }
  return {
    mentionedUsers: (message.mentioned_users ?? []).map((item: string | UserResponse<SCG>) => {
      return typeof item === 'string' ? ({ id: item } as UserResponse<SCG>) : item;
    }),
    text: message.text ?? '',
    selection: { start: 0, end: 0 },
  };
};


export class TextComposer<SCG extends ExtendableGenerics = DefaultGenerics> {
  composer: MessageComposer<SCG>;
  state: StateStore<TextComposerState<SCG>>;
  private middleware: TextComposerMiddleware<SCG>[] = [];

  constructor({ composer, message }: TextComposerOptions<SCG>) {
    this.composer = composer;
    this.state = new StateStore<TextComposerState<SCG>>(initState(message));
  }

  get channel() {
    return this.composer.channel;
  }

  // --- START STATE API ---

  get mentionedUsers() {
    return this.state.getLatestValue().mentionedUsers;
  }

  get text() {
    return Array.from(this.state.getLatestValue().text);
  }

  initState = ({ message }: { message?: DraftMessage<SCG> | MessageResponseBase<SCG> } = {}) => {
    this.state.next(initState(message));
  };

  setMentionedUsers(users: UserResponse<SCG>[]) {
    this.state.partialNext({mentionedUsers: users});
  }

  upsertMentionedUser = (user: UserResponse<SCG>) => {
    const mentionedUsers = [...this.mentionedUsers];
    const existingUserIndex = mentionedUsers.findIndex((u) => u.id === user.id);
    if (existingUserIndex >= 0) {
      this.state.partialNext({mentionedUsers: mentionedUsers.splice(existingUserIndex,1, user)});
    } else {
      this.state.partialNext({mentionedUsers});
    }
  };

  getMentionedUser = (userId: string) => {
    return this.state.getLatestValue().mentionedUsers.find((u: UserResponse<SCG>) => u.id === userId);
  };

  removeMentionedUser = (userId: string) => {
    const existingUserIndex = this.mentionedUsers.findIndex((u) => u.id === userId);
    if (existingUserIndex === -1) return;
    this.state.partialNext({ mentionedUsers: this.mentionedUsers.splice(existingUserIndex, 1) });
  };

  setText = (text: string) => {
    this.state.partialNext({ text });
  };

  insertText = ({ text, selection }: { text: string; selection?: TextSelection }) => {
    const finalSelection: TextSelection = selection ?? { start: text.length, end: text.length };
    const { maxTextLength } = this.composer.config;
    const currentText = this.text;
    const newText = [currentText.slice(0, finalSelection.start), text, currentText.slice(finalSelection.end)].join('');
    this.state.partialNext({ text: newText.slice(0, maxTextLength ?? newText.length) });
  };

  closeSuggestions = () => {
    const { suggestions } = this.state.getLatestValue();
    if (!suggestions) return;
    this.state.partialNext({ suggestions: undefined });
  };
  // --- END STATE API ---

  // --- START TEXT PROCESSING ----

  /**
   * // todo: change middleware creation to factory functions that return objects {id: string, onChange: () => state, onSelect: () => state }
   * const composer = new TextComposer<DefaultGenerics>()
   *   .use([
   *      createMentionsMiddleware(client, { trigger: '@', minChars: 1 }),  // SearchSource<UserResponse>
   *      createCommandsMiddleware(client, { trigger: '/' }),               // SearchSource<Command>
   *      createChannelMiddleware(client, { trigger: '#' }),                // SearchSource<Channel>
   *      createEmojiMiddleware(client, { trigger: ':' }),                  // SearchSource<Emoji>
   *      createCustomMiddleware(client, { trigger: '$' }),                 // SearchSource<CustomType>
   *   ]);
   * @param middleware
   */
  use = (middleware: TextComposerMiddleware<SCG> | TextComposerMiddleware<SCG>[]) => {
    this.middleware = this.middleware.concat(middleware);
  };

  upsertMiddleware = (middleware: TextComposerMiddleware<SCG>[]) => {
    const newMiddleware =  [...this.middleware];
    middleware.forEach((upserted) => {
      const existingIndex = this.middleware.findIndex((existing) => existing.id === upserted.id);
      newMiddleware.splice(existingIndex, 1, upserted);
    });
    this.middleware = newMiddleware;
  };

  private executeMiddleware = async (
    eventName: keyof Omit<TextComposerMiddleware<SCG>, 'id'>,
    initialInput: TextComposerMiddlewareValue<SCG>,
    selectedSuggestion?: TextComposerSuggestion<unknown>,
  ): Promise<TextComposerMiddlewareValue<SCG> | 'canceled'> => {
    let index = -1;

    const execute = async (i: number, input: TextComposerMiddlewareValue<SCG> | 'canceled' ): Promise<TextComposerMiddlewareValue<SCG> | 'canceled'> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }

      if (input === 'canceled') return input;

      index = i;

      if (i === this.middleware.length || input.stop) {
        return Promise.resolve({ state: input.state });
      }

      const middleware = this.middleware[i];
      const handler = middleware[eventName];

      if (!handler || typeof handler === 'string') {
        return execute(i + 1, input);
      }

      return handler({input, nextHandler: (nextInput) => execute(i + 1, nextInput), selectedSuggestion});
    };

    const output = await withCancellation(
      'textComposer-middleware-execution',
      () => execute(0, initialInput)
    );

    if (output !== 'canceled' && output.state.suggestions) {
      output.state.suggestions.searchSource.search(output.state.suggestions.query);
    }

    return output;
  };

  handleChange = async ({ text, selection }: { selection: TextSelection; text: string }) => {
    // todo: check isComposing
    const output = await this.executeMiddleware('onChange', {
      state: {
        ...this.state.getLatestValue(),
        text,
        selection,
      },
    });
    if (output === 'canceled') return;
    this.state.next(output.state);

    if (this.composer.config.publishTypingEvents && text) {
      logChatPromiseExecution(this.channel.keystroke(this.composer.threadId ?? undefined), 'start typing event');
    }
  };

  handleSelect = async (target: TextComposerSuggestion<unknown>) => {
    const output = await this.executeMiddleware(
      'onSuggestionItemSelect',
      {
        state: this.state.getLatestValue(),
      },
      target,
    );
    if (output === 'canceled') return;
    this.state.next(output.state);
  };
  // --- END TEXT PROCESSING ----
}
