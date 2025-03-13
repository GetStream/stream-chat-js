import type { DefaultGenerics, ExtendableGenerics } from '../../types';
import {TextComposerState, TextComposerSuggestion} from '../types';

export type TextComposerMiddlewareOptions = { minChars: number; trigger: string };

export type TextComposerMiddlewareValue<SCG extends ExtendableGenerics = DefaultGenerics> = {
  state: TextComposerState<SCG>;
  stop?: boolean;
};

export type MiddlewareParams<
  SCG extends ExtendableGenerics = DefaultGenerics,
  T = unknown
> = {
  input: TextComposerMiddlewareValue<SCG>,
  nextHandler:(
    input: TextComposerMiddlewareValue<SCG>,
  ) => Promise<TextComposerMiddlewareValue<SCG> | 'canceled'>,
  selectedSuggestion?: TextComposerSuggestion<T>,
}

export type TextComposerMiddlewareHandler<
  SCG extends ExtendableGenerics = DefaultGenerics,
> = (params: MiddlewareParams<SCG>) => Promise<TextComposerMiddlewareValue<SCG> | 'canceled'>;

export type CustomTextComposerMiddleware<SCG extends ExtendableGenerics = DefaultGenerics> = {
  [key: string]: string | TextComposerMiddlewareHandler<SCG>
}

export type TextComposerMiddleware<
  SCG extends ExtendableGenerics = DefaultGenerics,
> = CustomTextComposerMiddleware<SCG> & {
  id: string;
  onChange?: string | TextComposerMiddlewareHandler<SCG>;
  onSuggestionItemSelect?: string | TextComposerMiddlewareHandler<SCG>;
}
