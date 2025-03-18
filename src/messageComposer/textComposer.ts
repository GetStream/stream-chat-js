import { StateStore } from '../store';
import { logChatPromiseExecution } from '../utils';
import type { TextComposerState, TextComposerSuggestion, TextSelection } from './types';
import type {
  DraftMessage,
  FormatMessageResponse,
  MessageResponseBase,
  UserResponse,
} from '../types';
import type { MessageComposer } from './messageComposer';
import type { TextComposerMiddleware, TextComposerMiddlewareValue } from './middleware';
import { withCancellation } from '../utils/concurrency';

export type TextComposerOptions = {
  composer: MessageComposer;
  message?: DraftMessage | MessageResponseBase | FormatMessageResponse;
};

const initState = (
  message?: DraftMessage | MessageResponseBase | FormatMessageResponse,
): TextComposerState => {
  if (!message) {
    return {
      mentionedUsers: [],
      text: '',
      selection: { start: 0, end: 0 },
    };
  }
  return {
    mentionedUsers: (message.mentioned_users ?? []).map((item: string | UserResponse) =>
      typeof item === 'string' ? ({ id: item } as UserResponse) : item,
    ),
    text: message.text ?? '',
    selection: { start: 0, end: 0 },
  };
};

export class TextComposer {
  composer: MessageComposer;
  state: StateStore<TextComposerState>;
  private middleware: TextComposerMiddleware[] = [];

  constructor({ composer, message }: TextComposerOptions) {
    this.composer = composer;
    this.state = new StateStore<TextComposerState>(initState(message));
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

  initState = ({ message }: { message?: DraftMessage | MessageResponseBase } = {}) => {
    this.state.next(initState(message));
  };

  setMentionedUsers(users: UserResponse[]) {
    this.state.partialNext({ mentionedUsers: users });
  }

  upsertMentionedUser = (user: UserResponse) => {
    const mentionedUsers = [...this.mentionedUsers];
    const existingUserIndex = mentionedUsers.findIndex((u) => u.id === user.id);
    if (existingUserIndex >= 0) {
      this.state.partialNext({
        mentionedUsers: mentionedUsers.splice(existingUserIndex, 1, user),
      });
    } else {
      this.state.partialNext({ mentionedUsers });
    }
  };

  getMentionedUser = (userId: string) =>
    this.state.getLatestValue().mentionedUsers.find((u: UserResponse) => u.id === userId);

  removeMentionedUser = (userId: string) => {
    const existingUserIndex = this.mentionedUsers.findIndex((u) => u.id === userId);
    if (existingUserIndex === -1) return;
    this.state.partialNext({
      mentionedUsers: this.mentionedUsers.splice(existingUserIndex, 1),
    });
  };

  setText = (text: string) => {
    this.state.partialNext({ text });
  };

  insertText = ({ text, selection }: { text: string; selection?: TextSelection }) => {
    const finalSelection: TextSelection = selection ?? {
      start: text.length,
      end: text.length,
    };
    const { maxTextLength } = this.composer.config;
    const currentText = this.text;
    const newText = [
      currentText.slice(0, finalSelection.start),
      text,
      currentText.slice(finalSelection.end),
    ].join('');
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
   *      createMentionsMiddleware(channel, { trigger: '@', minChars: 1 }),  // SearchSource<UserResponse>
   *      createCommandsMiddleware(channel, { trigger: '/' }),               // SearchSource<Command>
   *      createChannelMiddleware(client, { trigger: '#' }),                // SearchSource<Channel>
   *      createEmojiMiddleware(emojiSearchSource, { trigger: ':' }),                  // SearchSource<Emoji>
   *      createCustomMiddleware(customClient, { trigger: '$' }),                 // SearchSource<CustomType>
   *   ]);
   * @param middleware
   */
  use = (middleware: TextComposerMiddleware | TextComposerMiddleware[]) => {
    this.middleware = this.middleware.concat(middleware);
  };

  upsertMiddleware = (middleware: TextComposerMiddleware[]) => {
    const newMiddleware = [...this.middleware];
    middleware.forEach((upserted) => {
      const existingIndex = this.middleware.findIndex(
        (existing) => existing.id === upserted.id,
      );
      newMiddleware.splice(existingIndex, 1, upserted);
    });
    this.middleware = newMiddleware;
  };

  private executeMiddleware = async (
    eventName: keyof Omit<TextComposerMiddleware, 'id'>,
    initialInput: TextComposerMiddlewareValue,
    selectedSuggestion?: TextComposerSuggestion<unknown>,
  ): Promise<TextComposerMiddlewareValue | 'canceled'> => {
    let index = -1;

    const execute = (
      i: number,
      input: TextComposerMiddlewareValue,
    ): Promise<TextComposerMiddlewareValue> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }

      index = i;

      if (i === this.middleware.length || input.stop) {
        return Promise.resolve({ state: input.state });
      }

      const middleware = this.middleware[i];
      const handler = middleware[eventName];

      if (!handler || typeof handler === 'string') {
        return execute(i + 1, input);
      }

      return handler({
        input,
        nextHandler: (nextInput) => execute(i + 1, nextInput),
        selectedSuggestion,
      });
    };

    return await withCancellation('textComposer-middleware-execution', async () => {
      const result = await execute(0, initialInput);
      if (result.state.suggestions) {
        await result.state.suggestions?.searchSource.search(
          result.state.suggestions.query,
        );
      }
      return result;
    });
  };

  handleChange = async ({
    text,
    selection,
  }: {
    selection: TextSelection;
    text: string;
  }) => {
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
      logChatPromiseExecution(
        this.channel.keystroke(this.composer.threadId ?? undefined),
        'start typing event',
      );
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
