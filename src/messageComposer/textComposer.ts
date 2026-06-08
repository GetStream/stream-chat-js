import { TextComposerMiddlewareExecutor } from './middleware';
import { StateStore } from '../store';
import { logChatPromiseExecution } from '../utils';
import type { TextComposerMiddlewareExecutorState } from './middleware';
import type { TextComposerSuggestion } from './middleware/textComposer/types';
import type { TextSelection } from './middleware/textComposer/types';
import type {
  MentionEntity,
  TextComposerCommandActivationEffect,
  TextComposerState,
  TextComposerStateSnapshot,
  UserMentionEntity,
} from './middleware/textComposer/types';
import type { Suggestions } from './middleware/textComposer/types';
import {
  isUserMentionEntity,
  mentionEntityToUserResponse,
  userResponseToMentionEntity,
} from './middleware/textComposer/mentionUtils';
import type { MessageComposer } from './messageComposer';
import type { CommandResponse, DraftMessage, LocalMessage, UserResponse } from '../types';

export type TextComposerOptions = {
  composer: MessageComposer;
  message?: DraftMessage | LocalMessage;
};

export type TextComposerSnapshot = TextComposerStateSnapshot;

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

const getInitialMentions = (message?: DraftMessage | LocalMessage): MentionEntity[] => {
  if (!message) return [];

  const mentions: MentionEntity[] = (message.mentioned_users ?? []).map(
    (item: string | UserResponse) =>
      typeof item === 'string'
        ? ({ id: item, mentionType: 'user' } as UserMentionEntity)
        : { ...item, mentionType: 'user' },
  );

  if (message.mentioned_channel) {
    mentions.push({
      id: 'channel',
      mentionType: 'channel',
      name: 'channel',
    });
  }

  if (message.mentioned_here) {
    mentions.push({
      id: 'here',
      mentionType: 'here',
      name: 'here',
    });
  }

  if (message.mentioned_roles?.length) {
    mentions.push(
      ...message.mentioned_roles.map((role) => ({
        id: role,
        mentionType: 'role' as const,
        name: role,
      })),
    );
  }

  if (message.mentioned_groups?.length) {
    mentions.push(
      ...message.mentioned_groups.map((group) => ({
        id: group.id,
        mentionType: 'user_group' as const,
        name: group.name,
      })),
    );
  } else if (message.mentioned_group_ids?.length) {
    // Composer rehydration can still receive draft/local request-shaped data, where
    // group mentions are represented only by ids even though response/render paths use
    // `mentioned_groups` for presentation metadata.
    mentions.push(
      ...message.mentioned_group_ids.map((groupId) => ({
        id: groupId,
        mentionType: 'user_group' as const,
      })),
    );
  }

  return mentions;
};

const isSameMentionEntity = (first: MentionEntity, second: MentionEntity) =>
  first.id === second.id && first.mentionType === second.mentionType;

const getMentionsFromState = (state: TextComposerState) =>
  state.mentions ?? state.mentionedUsers.map(userResponseToMentionEntity);

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
      mentions: [],
      text,
      selection: { start: text.length, end: text.length },
    };
  }
  const text = message.text ?? '';
  const mentions = getInitialMentions(message);
  const mentionedUsers = (message.mentioned_users ?? []).map(
    (item: string | UserResponse) =>
      typeof item === 'string' ? ({ id: item } as UserResponse) : item,
  );
  return {
    mentionedUsers,
    mentions,
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

  get mentions() {
    return getMentionsFromState(this.state.getLatestValue());
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

  getSnapshot = (state = this.state.getLatestValue()): TextComposerSnapshot => state;

  restoreSnapshot = (snapshot: TextComposerSnapshot) => {
    this.state.next(snapshot);
  };

  setMentionedUsers(users: UserResponse[]) {
    const nonUserMentions = this.mentions.filter(
      (entity) => !isUserMentionEntity(entity),
    );
    this.state.partialNext({
      mentionedUsers: users,
      mentions: [...nonUserMentions, ...users.map(userResponseToMentionEntity)],
    });
  }

  setMentions(entities: MentionEntity[]) {
    this.state.partialNext({
      mentionedUsers: entities
        .filter(isUserMentionEntity)
        .map(mentionEntityToUserResponse),
      mentions: entities,
    });
  }

  clearCommand() {
    if (!this.command) return;

    this.commitState({
      ...this.state.getLatestValue(),
      command: null,
      effects: [{ type: 'command.clear' }],
    });
  }

  /**
   * @deprecated Use `upsertMentionEntity({ ...user, mentionType: 'user' })` instead.
   */
  upsertMentionedUser = (user: UserResponse) => {
    const mentionedUsers = [...this.mentionedUsers];
    const existingUserIndex = mentionedUsers.findIndex((entity) => entity.id === user.id);
    if (existingUserIndex >= 0) {
      mentionedUsers.splice(existingUserIndex, 1, user);
      this.setMentionedUsers(mentionedUsers);
    } else {
      mentionedUsers.push(user);
      this.setMentionedUsers(mentionedUsers);
    }
  };

  /**
   * @deprecated Use `getMentionEntity('user', userId)` instead.
   */
  getMentionedUser = (userId: string) =>
    this.mentionedUsers.find((user) => user.id === userId);

  /**
   * @deprecated Use `removeMentionEntity('user', userId)` instead.
   */
  removeMentionedUser = (userId: string) => {
    const existingUserIndex = this.mentionedUsers.findIndex(
      (entity) => entity.id === userId,
    );
    if (existingUserIndex === -1) return;
    const mentionedUsers = [...this.mentionedUsers];
    mentionedUsers.splice(existingUserIndex, 1);
    this.setMentionedUsers(mentionedUsers);
  };

  upsertMentionEntity = (entity: MentionEntity) => {
    const mentions = [...this.mentions];
    const existingEntityIndex = mentions.findIndex((currentEntity) =>
      isSameMentionEntity(currentEntity, entity),
    );

    if (existingEntityIndex >= 0) {
      mentions.splice(existingEntityIndex, 1, entity);
    } else {
      mentions.push(entity);
    }

    this.setMentions(mentions);
  };

  getMentionEntity = (
    mentionType: MentionEntity['mentionType'],
    id: MentionEntity['id'],
  ) =>
    this.mentions.find(
      (entity) => entity.mentionType === mentionType && entity.id === id,
    );

  removeMentionEntity = (
    mentionType: MentionEntity['mentionType'],
    id: MentionEntity['id'],
  ) => {
    const existingEntityIndex = this.mentions.findIndex(
      (entity) => entity.mentionType === mentionType && entity.id === id,
    );
    if (existingEntityIndex === -1) return;

    const mentions = [...this.mentions];
    mentions.splice(existingEntityIndex, 1);
    this.setMentions(mentions);
  };

  setCommand = (command: CommandResponse | null) => {
    if (!command) {
      this.clearCommand();
      return;
    }
    if (command.name === this.command?.name) return;
    if (this.composer.isCommandDisabled(command)) return;

    const stateToRestore: TextComposerCommandActivationEffect['stateToRestore'] = {
      command: null,
    };

    this.commitState({
      ...this.state.getLatestValue(),
      command,
      effects: [
        {
          command,
          stateToRestore,
          type: 'command.activate',
        },
      ],
      suggestions: undefined,
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

  private commitState = (state: TextComposerMiddlewareExecutorState) => {
    const { change, effects, ...nextState } = state;
    void change;

    this.state.next(nextState);
    this.composer.applyEffects(effects);
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
    this.commitState(output.state);

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
    this.commitState(output.state);
  };
  // --- END TEXT PROCESSING ----
}
