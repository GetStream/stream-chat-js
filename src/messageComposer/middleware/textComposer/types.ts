import type { MessageComposer } from '../../messageComposer';
import type { MessageComposerEffect } from '../../messageComposer';
import type { CommandResponse, UserResponse } from '../../../types';
import type { TokenizationPayload } from './textMiddlewareUtils';
import type { SearchSource, SearchSourceSync } from '../../../search';
import type { CustomTextComposerSuggestion } from '../../types.custom';

export type TextComposerSuggestion<T = unknown> = T & {
  id: string;
};

export type BaseSuggestion = {
  id: string;
};

export type CommandSuggestionDisabledReason = 'editing' | 'quoted_message';

export type CommandSuggestion = BaseSuggestion & CommandResponse;
export type UserSuggestion = BaseSuggestion &
  UserResponse &
  TokenizationPayload & {
    mentionType: 'user';
  };
export type ChannelMentionSuggestion = BaseSuggestion &
  TokenizationPayload & {
    mentionType: 'channel';
    name: 'channel';
  };
export type HereMentionSuggestion = BaseSuggestion &
  TokenizationPayload & {
    mentionType: 'here';
    name: 'here';
  };
export type RoleMentionSuggestion = BaseSuggestion &
  TokenizationPayload & {
    mentionType: 'role';
    name: string;
  };
export type UserGroupMentionSuggestion = BaseSuggestion &
  TokenizationPayload & {
    description?: string;
    memberCount?: number;
    mentionType: 'user_group';
    name: string;
  };
export type MentionSuggestion =
  | UserSuggestion
  | ChannelMentionSuggestion
  | HereMentionSuggestion
  | RoleMentionSuggestion
  | UserGroupMentionSuggestion;

export type CustomValidSuggestion = BaseSuggestion & CustomTextComposerSuggestion;
export type Suggestion = CommandSuggestion | MentionSuggestion | CustomValidSuggestion;

export type UserMentionEntity = UserResponse & {
  mentionType: 'user';
};
export type ChannelMentionEntity = {
  id: 'channel';
  mentionType: 'channel';
  name: 'channel';
};
export type HereMentionEntity = {
  id: 'here';
  mentionType: 'here';
  name: 'here';
};
export type RoleMentionEntity = {
  id: string;
  mentionType: 'role';
  name?: string;
};
export type UserGroupMentionEntity = {
  id: string;
  mentionType: 'user_group';
  name?: string;
};

export type MentionEntity =
  | UserMentionEntity
  | ChannelMentionEntity
  | HereMentionEntity
  | RoleMentionEntity
  | UserGroupMentionEntity;

export type TextComposerStateSnapshot = TextComposerState;

export type TextComposerCommandActivationStateToRestore =
  Partial<TextComposerStateSnapshot>;

export type TextComposerCommandActivationEffect = {
  command: CommandResponse;
  stateToRestore?: TextComposerCommandActivationStateToRestore;
  type: 'command.activate';
};

export type TextComposerCommandClearEffect = {
  type: 'command.clear';
};

export type TextComposerEffect = MessageComposerEffect;

export type TextComposerMiddlewareOptions = {
  minChars: number;
  trigger: string;
};

export type TextComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};

export type Suggestions<T extends Suggestion = Suggestion> = {
  query: string;
  searchSource: SearchSource<T> | SearchSourceSync<T>;
  trigger: string;
};

export type TextSelection = { end: number; start: number };

export type TextComposerState<T extends Suggestion = Suggestion> = {
  /**
   * @deprecated Use `mentions` instead.
   */
  mentionedUsers: UserResponse[];
  mentions?: MentionEntity[];
  selection: TextSelection;
  text: string;
  command?: CommandResponse | null;
  suggestions?: Suggestions<T>;
};
