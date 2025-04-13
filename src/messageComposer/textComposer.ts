import { TextComposerMiddlewareExecutor } from './middleware';
import { StateStore } from '../store';
import { logChatPromiseExecution } from '../utils';
import { mergeWith } from '../utils/mergeWith';
import type { TextComposerState, TextComposerSuggestion, TextSelection } from './types';
import type { MessageComposer } from './messageComposer';
import type { DraftMessage, LocalMessage, UserResponse } from '../types';

const DEFAULT_TEXT_COMPOSER_CONFIG: TextComposerConfig = {};

export type TextComposerConfig = {};

export type TextComposerOptions = {
  composer: MessageComposer;
  config?: Partial<TextComposerConfig>;
  message?: DraftMessage | LocalMessage;
};

export const textIsEmpty = (text: string) => {
  const trimmedText = text.trim();
  return (
    trimmedText === '' ||
    trimmedText === '>' ||
    trimmedText === '``````' ||
    trimmedText === '``' ||
    trimmedText === '**' ||
    trimmedText === '____' ||
    trimmedText === '__' ||
    trimmedText === '****'
  );
};

const initState = (message?: DraftMessage | LocalMessage): TextComposerState => {
  if (!message) {
    return {
      mentionedUsers: [],
      text: '',
      selection: { start: 0, end: 0 },
    };
  }
  const text = message.text ?? '';
  return {
    mentionedUsers: (message.mentioned_users ?? []).map((item: string | UserResponse) =>
      typeof item === 'string' ? ({ id: item } as UserResponse) : item,
    ),
    text,
    selection: { start: text.length, end: text.length },
  };
};

// todo: MessageInputProps?:
// additionalTextareaProps.defaultValue
export class TextComposer {
  composer: MessageComposer;
  config: TextComposerConfig;
  state: StateStore<TextComposerState>;
  middlewareExecutor: TextComposerMiddlewareExecutor;

  constructor({ composer, config = {}, message }: TextComposerOptions) {
    this.composer = composer;
    this.state = new StateStore<TextComposerState>(initState(message));
    this.config = mergeWith(DEFAULT_TEXT_COMPOSER_CONFIG, config);
    this.middlewareExecutor = new TextComposerMiddlewareExecutor({ composer });
  }

  get channel() {
    return this.composer.channel;
  }

  // --- START STATE API ---

  get mentionedUsers() {
    return this.state.getLatestValue().mentionedUsers;
  }

  get selection() {
    return this.state.getLatestValue().selection;
  }

  get suggestions() {
    return this.state.getLatestValue().suggestions;
  }

  get text() {
    return this.state.getLatestValue().text;
  }

  get textIsEmpty() {
    return textIsEmpty(this.text);
  }

  initState = ({ message }: { message?: DraftMessage | LocalMessage } = {}) => {
    this.state.next(initState(message));
  };

  setMentionedUsers(users: UserResponse[]) {
    this.state.partialNext({ mentionedUsers: users });
  }

  upsertMentionedUser = (user: UserResponse) => {
    const mentionedUsers = [...this.mentionedUsers];
    const existingUserIndex = mentionedUsers.findIndex((u) => u.id === user.id);
    if (existingUserIndex >= 0) {
      mentionedUsers.splice(existingUserIndex, 1, user);
      this.state.partialNext({ mentionedUsers });
    } else {
      mentionedUsers.push(user);
      this.state.partialNext({ mentionedUsers });
    }
  };

  getMentionedUser = (userId: string) =>
    this.state.getLatestValue().mentionedUsers.find((u: UserResponse) => u.id === userId);

  removeMentionedUser = (userId: string) => {
    const existingUserIndex = this.mentionedUsers.findIndex((u) => u.id === userId);
    if (existingUserIndex === -1) return;
    const mentionedUsers = [...this.mentionedUsers];
    mentionedUsers.splice(existingUserIndex, 1);
    this.state.partialNext({ mentionedUsers });
  };

  setText = (text: string) => {
    this.state.partialNext({ text });
  };

  insertText = ({ text, selection }: { text: string; selection?: TextSelection }) => {
    const finalSelection: TextSelection = selection ?? {
      start: this.text.length,
      end: this.text.length,
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

  handleChange = async ({
    text,
    selection,
  }: {
    selection: TextSelection;
    text: string;
  }) => {
    const output = await this.middlewareExecutor.execute('onChange', {
      state: {
        ...this.state.getLatestValue(),
        text,
        selection,
      },
    });
    if (output.status === 'discard') return;
    this.state.next(output.state);

    if (this.composer.config.publishTypingEvents && text) {
      logChatPromiseExecution(
        this.channel.keystroke(this.composer.threadId ?? undefined),
        'start typing event',
      );
    }
  };

  // todo: document how to register own middleware handler to simulate onSelectUser prop
  handleSelect = async (target: TextComposerSuggestion<unknown>) => {
    const output = await this.middlewareExecutor.execute(
      'onSuggestionItemSelect',
      {
        state: this.state.getLatestValue(),
      },
      target,
    );
    if (output?.status === 'discard') return;
    this.state.next(output.state);
  };
  // --- END TEXT PROCESSING ----
}
