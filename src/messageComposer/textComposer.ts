import { TextComposerMiddlewareExecutor } from './middleware';
import { StateStore } from '../store';
import { logChatPromiseExecution } from '../utils';
import type { TextComposerSuggestion } from './middleware/textComposer/types';
import type { TextSelection } from './middleware/textComposer/types';
import type { TextComposerState } from './middleware/textComposer/types';
import type { Suggestions } from './middleware/textComposer/types';
import type { MessageComposer } from './messageComposer';
import type { CommandResponse, DraftMessage, LocalMessage, UserResponse } from '../types';

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
      command: null,
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

  get enabled() {
    return this.composer.config.text.enabled;
  }

  set enabled(enabled: boolean) {
    if (enabled === this.enabled) return;
    this.composer.updateConfig({ text: { enabled } });
  }

  get defaultValue() {
    return this.composer.config.text.defaultValue;
  }

  set defaultValue(defaultValue: string | undefined) {
    if (defaultValue === this.defaultValue) return;
    this.composer.updateConfig({ text: { defaultValue } });
  }

  get maxLengthOnEdit() {
    return this.composer.config.text.maxLengthOnEdit;
  }

  set maxLengthOnEdit(maxLengthOnEdit: number | undefined) {
    if (maxLengthOnEdit === this.maxLengthOnEdit) return;
    this.composer.updateConfig({ text: { maxLengthOnEdit } });
  }

  get maxLengthOnSend() {
    return this.composer.config.text.maxLengthOnSend;
  }

  set maxLengthOnSend(maxLengthOnSend: number | undefined) {
    if (maxLengthOnSend === this.maxLengthOnSend) return;
    this.composer.updateConfig({ text: { maxLengthOnSend } });
  }

  get publishTypingEvents() {
    return this.composer.config.text.publishTypingEvents;
  }

  set publishTypingEvents(publishTypingEvents: boolean) {
    if (publishTypingEvents === this.publishTypingEvents) return;
    this.composer.updateConfig({ text: { publishTypingEvents } });
  }

  // --- START STATE API ---

  get command() {
    return this.state.getLatestValue().command;
  }

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

  clearCommand() {
    this.state.partialNext({ command: null });
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

  setCommand = (command: CommandResponse | null) => {
    if (command?.name === this.command?.name) return;
    this.state.partialNext({ command });
  };

  setText = (text: string) => {
    if (!this.enabled || text === this.text) return;
    this.state.partialNext({ text });
  };

  setSelection = (selection: TextSelection) => {
    const selectionChanged =
      selection.start !== this.selection.start || selection.end !== this.selection.end;
    if (!this.enabled || !selectionChanged) return;
    this.state.partialNext({ selection });
  };

  insertText = async ({
    text,
    selection,
  }: {
    text: string;
    selection?: TextSelection;
  }) => {
    if (!this.enabled) return;

    const finalSelection: TextSelection = selection ?? this.selection;
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

    await this.handleChange({
      text: finalText,
      selection: {
        start: cursorPosition,
        end: cursorPosition,
      },
    });
  };

  wrapSelection = ({
    head = '',
    selection,
    tail = '',
  }: {
    head?: string;
    selection?: TextSelection;
    tail?: string;
  }) => {
    if (!this.enabled) return;
    const currentSelection: TextSelection = selection ?? this.selection;
    const prependedText = this.text.slice(0, currentSelection.start);
    const selectedText = this.text.slice(currentSelection.start, currentSelection.end);
    const appendedText = this.text.slice(currentSelection.end);
    const finalSelection = {
      start: prependedText.length + head.length,
      end: prependedText.length + head.length + selectedText.length,
    };
    this.state.partialNext({
      text: [prependedText, head, selectedText, tail, appendedText].join(''),
      selection: finalSelection,
    });
  };

  setSuggestions = (suggestions: Suggestions) => {
    this.state.partialNext({ suggestions });
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
    if (!this.enabled) return;
    const output = await this.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
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
    if (!this.enabled) return;
    const output = await this.middlewareExecutor.execute({
      eventName: 'onSuggestionItemSelect',
      initialValue: {
        ...this.state.getLatestValue(),
        change: {
          selectedSuggestion: target,
        },
      },
    });
    if (output?.status === 'discard') return;
    this.state.next(output.state);
  };
  // --- END TEXT PROCESSING ----
}
