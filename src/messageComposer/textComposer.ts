import { TextComposerMiddlewareExecutor } from './middleware';
import { StateStore } from '../store';
import { logChatPromiseExecution } from '../utils';
import type { TextComposerState, TextComposerSuggestion, TextSelection } from './types';
import type { MessageComposer } from './messageComposer';
import type { DraftMessage, LocalMessage, UserResponse } from '../types';

export type TextComposerOptions = {
  composer: MessageComposer;
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

const initState = ({
  composer,
  message,
}: {
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
}): TextComposerState => {
  if (!message) {
    const text = composer.config.text.defaultValue ?? '';
    return {
      mentionedUsers: [],
      text,
      selection: { start: text.length, end: text.length },
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

export class TextComposer {
  readonly composer: MessageComposer;
  readonly state: StateStore<TextComposerState>;
  middlewareExecutor: TextComposerMiddlewareExecutor;

  constructor({ composer, message }: TextComposerOptions) {
    this.composer = composer;
    this.state = new StateStore<TextComposerState>(initState({ composer, message }));
    this.middlewareExecutor = new TextComposerMiddlewareExecutor({ composer });
  }

  get channel() {
    return this.composer.channel;
  }

  get config() {
    return this.composer.config.text;
  }

  set defaultValue(defaultValue: string) {
    this.composer.updateConfig({ text: { defaultValue } });
  }

  set maxLengthOnEdit(maxLengthOnEdit: number) {
    this.composer.updateConfig({ text: { maxLengthOnEdit } });
  }

  set maxLengthOnSend(maxLengthOnSend: number) {
    this.composer.updateConfig({ text: { maxLengthOnSend } });
  }

  set publishTypingEvents(publishTypingEvents: boolean) {
    this.composer.updateConfig({ text: { publishTypingEvents } });
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
    this.state.next(initState({ composer: this.composer, message }));
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
    const { maxLengthOnEdit } = this.composer.config.text ?? {};
    const currentText = this.text;
    const textBeforeTrim = [
      currentText.slice(0, finalSelection.start),
      text,
      currentText.slice(finalSelection.end),
    ].join('');
    const finalText = textBeforeTrim.slice(
      0,
      typeof maxLengthOnEdit === 'number' ? maxLengthOnEdit : textBeforeTrim.length,
    );
    const expectedCursorPosition =
      currentText.slice(0, finalSelection.start).length + text.length;
    const cursorPosition =
      expectedCursorPosition >= finalText.length
        ? finalText.length
        : currentText.slice(0, expectedCursorPosition).length;

    this.state.partialNext({
      text: finalText,
      selection: {
        start: cursorPosition,
        end: cursorPosition,
      },
    });
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

    if (this.config.publishTypingEvents && text) {
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
