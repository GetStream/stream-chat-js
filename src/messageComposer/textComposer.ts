import { TextComposerMiddlewareExecutor } from './middleware';
import { StateStore } from '../store';
import { logChatPromiseExecution } from '../utils';
import type { CommandSuggestion } from './middleware/textComposer/types';
import type { TextComposerSuggestion } from './middleware/textComposer/types';
import type { TextSelection } from './middleware/textComposer/types';
import type { TextComposerState } from './middleware/textComposer/types';
import type { Suggestions } from './middleware/textComposer/types';
import type { MessageComposer } from './messageComposer';
import type { CommandResponse, DraftMessage, LocalMessage, UserResponse } from '../types';
import type { LocalAttachment } from './types';

export type TextComposerOptions = {
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

type PreCommandStateSnapshot = {
  attachments: LocalAttachment[];
  mentionedUsers: UserResponse[];
  selection: TextSelection;
  text: string;
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
  private preCommandStateSnapshot: PreCommandStateSnapshot | null = null;

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
    this.preCommandStateSnapshot = null;
    this.state.next(initState({ composer: this.composer, message }));
  };

  setMentionedUsers(users: UserResponse[]) {
    this.state.partialNext({ mentionedUsers: users });
  }

  clearCommand() {
    const snapshot = this.preCommandStateSnapshot;
    this.preCommandStateSnapshot = null;

    if (!snapshot && !this.command) {
      this.state.partialNext({ command: null });
      return;
    }

    console.log('TEST: SNAPSHOT: ', snapshot);
    if (snapshot) {
      this.composer.attachmentManager.state.partialNext({
        attachments: snapshot.attachments,
      });
      this.state.partialNext({
        command: null,
        mentionedUsers: snapshot.mentionedUsers,
        selection: snapshot.selection,
        suggestions: undefined,
        text: snapshot.text,
      });
      return;
    }

    this.state.partialNext({
      command: null,
      mentionedUsers: [],
      selection: { start: 0, end: 0 },
      suggestions: undefined,
      text: '',
    });
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
    if (!command) {
      this.clearCommand();
      return;
    }
    if (command.name === this.command?.name) return;
    if (this.isCommandDisabled(command)) return;

    this.activateCommand(command, {
      attachments: this.composer.attachmentManager.attachments,
      mentionedUsers: this.mentionedUsers,
      selection: this.selection,
      text: this.text,
    });
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
    /**
     * Windows inserts \r\n; macOS inserts \n.
     * The caret can fall inside a CRLF pair during repeated pastes on Windows.
     * That corrupts newline alignment (a\nb\na\nba\nb\n\n).
     * Normalize the text to prevent it.
     */
    const normalizedText = text.replace(/\r\n/g, '\n');
    const finalSelection: TextSelection = selection ?? this.selection;
    const { maxLengthOnEdit } = this.composer.config.text ?? {};
    const currentText = this.text;
    const textBeforeTrim = [
      currentText.slice(0, finalSelection.start),
      normalizedText,
      currentText.slice(finalSelection.end),
    ].join('');

    const finalText = textBeforeTrim.slice(
      0,
      typeof maxLengthOnEdit === 'number' ? maxLengthOnEdit : textBeforeTrim.length,
    );
    const expectedCursorPosition = finalSelection.start + normalizedText.length;
    const cursorPosition = Math.min(expectedCursorPosition, finalText.length);

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

  private isCommandDisabled = (command: CommandResponse) =>
    !!this.composer.editedMessage ||
    !!(
      this.composer.quotedMessage &&
      (command.set === 'moderation_set' || command.name === 'moderation_set')
    );

  private activateCommand = (
    command: CommandResponse,
    snapshot: PreCommandStateSnapshot,
  ) => {
    if (!this.command && !this.preCommandStateSnapshot) {
      this.preCommandStateSnapshot = snapshot;
    }

    this.composer.attachmentManager.state.partialNext({ attachments: [] });
    this.state.partialNext({
      command,
      mentionedUsers: [],
      selection: { start: 0, end: 0 },
      suggestions: undefined,
      text: '',
    });
  };

  private applySelectedCommandState = (
    state: TextComposerState<CommandSuggestion>,
  ): TextComposerState<CommandSuggestion> => {
    const { command } = state;
    if (
      !command ||
      command.name === this.command?.name ||
      this.isCommandDisabled(command)
    ) {
      return state;
    }

    if (!this.preCommandStateSnapshot) {
      this.preCommandStateSnapshot = {
        attachments: this.composer.attachmentManager.attachments,
        mentionedUsers: [],
        selection: { start: 0, end: 0 },
        text: '',
      };
    }

    this.composer.attachmentManager.state.partialNext({ attachments: [] });

    return {
      ...state,
      mentionedUsers: [],
      selection: { start: 0, end: 0 },
      suggestions: undefined,
      text: '',
    };
  };

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
    this.state.next(
      this.applySelectedCommandState(
        output.state as TextComposerState<CommandSuggestion>,
      ) as TextComposerState,
    );
  };
  // --- END TEXT PROCESSING ----
}
