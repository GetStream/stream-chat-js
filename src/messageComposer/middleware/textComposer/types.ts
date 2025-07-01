import type { MessageComposer } from '../../messageComposer';
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

export type CommandSuggestion = BaseSuggestion & CommandResponse;
export type UserSuggestion = BaseSuggestion & UserResponse & TokenizationPayload;
export type CustomValidSuggestion = BaseSuggestion & CustomTextComposerSuggestion;
export type Suggestion = CommandSuggestion | UserSuggestion | CustomValidSuggestion;

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
  mentionedUsers: UserResponse[];
  selection: TextSelection;
  text: string;
  command?: CommandResponse | null;
  suggestions?: Suggestions<T>;
};
