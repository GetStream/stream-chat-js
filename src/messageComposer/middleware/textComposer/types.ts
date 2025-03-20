import type { TextComposerState, TextComposerSuggestion } from '../../types';
import type { MiddlewareValue } from '../../../middleware';

export type TextComposerMiddlewareOptions = {
  minChars: number;
  trigger: string;
};

export type TextComposerMiddlewareValue = MiddlewareValue<TextComposerState>;

export type TextComposerMiddlewareParams<T = unknown> = {
  input: TextComposerMiddlewareValue;
  nextHandler: (
    input: TextComposerMiddlewareValue,
  ) => Promise<TextComposerMiddlewareValue>;
  selectedSuggestion?: TextComposerSuggestion<T>;
};

export type TextComposerMiddlewareHandler = (
  params: TextComposerMiddlewareParams,
) => Promise<TextComposerMiddlewareValue>;

export type CustomTextComposerMiddleware = {
  [key: string]: string | TextComposerMiddlewareHandler;
};

export type TextComposerMiddleware = CustomTextComposerMiddleware & {
  id: string;
  onChange?: string | TextComposerMiddlewareHandler;
  onSuggestionItemSelect?: string | TextComposerMiddlewareHandler;
};
