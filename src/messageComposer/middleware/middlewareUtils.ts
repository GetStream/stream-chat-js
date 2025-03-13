import type { TextSelection } from '../types';

export const getTriggerCharWithToken = (trigger: string, text: string) => {
  const triggerNorWhitespace = `[^\\s${trigger}]*`;
  const match = text.match(
    new RegExp(
      `(?!^|\\W)?[${trigger}]${triggerNorWhitespace}\\s?${triggerNorWhitespace}$`,
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
    selections: {
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
