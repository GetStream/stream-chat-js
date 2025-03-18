import type { TextComposerState, TextComposerSuggestion } from '../types';

export type TextComposerMiddlewareOptions = {
  minChars: number;
  trigger: string;
};

export type TextComposerMiddlewareValue = {
  state: TextComposerState;
  stop?: boolean;
};

export type MiddlewareParams<T = unknown> = {
  input: TextComposerMiddlewareValue;
  nextHandler: (
    input: TextComposerMiddlewareValue,
  ) => Promise<TextComposerMiddlewareValue>;
  selectedSuggestion?: TextComposerSuggestion<T>;
};

export type TextComposerMiddlewareHandler = (
  params: MiddlewareParams,
) => Promise<TextComposerMiddlewareValue>;

export type CustomTextComposerMiddleware = {
  [key: string]: string | TextComposerMiddlewareHandler;
};

export type TextComposerMiddleware = CustomTextComposerMiddleware & {
  id: string;
  onChange?: string | TextComposerMiddlewareHandler;
  onSuggestionItemSelect?: string | TextComposerMiddlewareHandler;
};
