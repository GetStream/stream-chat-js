import type { TextSelection } from './types';

export const getTriggerCharWithToken = ({
  trigger,
  text,
  isCommand = false,
  acceptTrailingSpaces = true,
}: {
  trigger: string;
  text: string;
  isCommand?: boolean;
  acceptTrailingSpaces?: boolean;
}) => {
  const triggerNorWhitespace = `[^\\s${trigger}]*`;
  const match = text.match(
    new RegExp(
      isCommand
        ? `^[${trigger}]${triggerNorWhitespace}$`
        : acceptTrailingSpaces
          ? `(?!^|\\W)?[${trigger}]${triggerNorWhitespace}\\s?${triggerNorWhitespace}$`
          : `(?!^|\\W)?[${trigger}]${triggerNorWhitespace}$`,
      'g',
    ),
  );

  return match && match[match.length - 1].trim();
};

export const insertItemWithTrigger = ({
  insertText,
  selection,
  text,
  trigger,
}: {
  insertText: string;
  selection: TextSelection;
  text: string;
  trigger: string;
}) => {
  const beforeCursor = text.slice(0, selection.end);
  const afterCursor = text.slice(selection.end);

  // Replace the trigger and query with the user mention
  const lastIndex = beforeCursor.lastIndexOf(trigger);
  const newText = beforeCursor.slice(0, lastIndex) + insertText + afterCursor;
  return {
    text: newText,
    selection: {
      start: lastIndex + insertText.length,
      end: lastIndex + insertText.length,
    },
  };
};

export const replaceWordWithEntity = async ({
  caretPosition,
  getEntityString,
  text,
}: {
  caretPosition: number;
  getEntityString: (word: string) => Promise<string | null> | string | null;
  text: string;
}): Promise<string> => {
  const lastWordRegex = /([^\s]+)(\s*)$/;
  const match = lastWordRegex.exec(text.slice(0, caretPosition));
  if (!match) return text;

  const lastWord = match[1];
  if (!lastWord) return text;

  const spaces = match[2];

  const newWord = await getEntityString(lastWord);
  if (newWord == null) return text;

  const textBeforeWord = text.slice(0, caretPosition - match[0].length);
  const textAfterCaret = text.slice(caretPosition, -1);
  return textBeforeWord + newWord + spaces + textAfterCaret;
};

/**
 * Escapes a string for use in a regular expression
 * @param text - The string to escape
 * @returns The escaped string
 * What does this regex do?

 The regex escapes special regex characters by adding a backslash before them. Here's what it matches:
 - dash
 [ ] square brackets
 { } curly braces
 ( ) parentheses
 * asterisk
 + plus
 ? question mark
 . period
 , comma
 / forward slash
 \ backslash
 ^ caret
 $ dollar sign
 | pipe
 # hash

 The \\$& replacement adds a backslash before any matched character.
 This is needed when you want to use these characters literally
 in a regex pattern instead of their special regex meanings.
 For example:
 escapeRegExp("hello.world")  // Returns: "hello\.world"
 escapeRegExp("[test]")       // Returns: "\[test\]"

 This is commonly used when building dynamic regex patterns from user input to prevent special characters from being interpreted as regex syntax.
 */
export function escapeRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,/\\^$|#]/g, '\\$&');
}

export type TokenizationPayload = {
  tokenizedDisplayName: { token: string; parts: string[] };
};

export const getTokenizedSuggestionDisplayName = ({
  displayName,
  searchToken,
}: {
  displayName: string;
  searchToken: string;
}): TokenizationPayload => ({
  tokenizedDisplayName: {
    token: searchToken,
    parts: searchToken
      ? displayName
          .split(new RegExp(`(${escapeRegExp(searchToken)})`, 'gi'))
          .filter(Boolean)
      : [displayName],
  },
});
