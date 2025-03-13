import type { TextComposerState, TextComposerSuggestion } from '../types';

export type TextComposerMiddlewareOptions = { minChars: number; trigger: string };

export type TextComposerMiddlewareValue = {
  state: TextComposerState;
  stop?: boolean;
};

export type MiddlewareParams<T = unknown> = {
  input: TextComposerMiddlewareValue;
  nextHandler: (
    input: TextComposerMiddlewareValue,
  ) => Promise<TextComposerMiddlewareValue | 'canceled'>;
  selectedSuggestion?: TextComposerSuggestion<T>;
};

export type TextComposerMiddlewareHandler = (
  params: MiddlewareParams,
) => Promise<TextComposerMiddlewareValue | 'canceled'>;

export type CustomTextComposerMiddleware = {
  [key: string]: string | TextComposerMiddlewareHandler;
};

export type TextComposerMiddleware = CustomTextComposerMiddleware & {
  id: string;
  onChange?: string | TextComposerMiddlewareHandler;
  onSuggestionItemSelect?: string | TextComposerMiddlewareHandler;
};
